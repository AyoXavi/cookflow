"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { User } from "@/generated/prisma"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, FileUIPart, UIMessage } from "ai"
import { Mic, Plus, Send, X, Volume2, Square } from "lucide-react"
import Image from "next/image"
import { FormEventHandler, useCallback, useContext, useEffect, useRef, useState } from "react"
import Markdown from "react-markdown"
import { useFilePicker } from "use-file-picker"
import { nanoid } from "nanoid"
import { AppContext } from "./AppContext"
import { ParsedRecipe } from "@/lib/types"
// TTS is implemented client-side via Web Speech API; no extra imports needed

// I hate the devs for not exporting the interfaces...
type FileContents = ReturnType<typeof useFilePicker<unknown, { readFilesContent: true, readAs: "DataURL" }>>["filesContent"]

export interface ChatProps {
  user: User,
  initialMessage: string,
  api: string,
}

export function Chat({ user, initialMessage, api }: ChatProps) {
  const { messages, setMessages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api,
    }),
    experimental_throttle: 100,
    onError: (error) => {
      console.error("Chat error:", error)
    },
    onFinish: (message) => {
      console.log("Chat finished:", message)
    }
  })

  // Debug logging for chat status
  useEffect(() => {
    console.log("Chat status changed:", status)
    console.log("Messages count:", messages.length)
  }, [status, messages])

  const containerRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const lastSpokenAssistantIdRef = useRef<string | null>(null)
  const ttsRef = useRef<{ utter: SpeechSynthesisUtterance | null }>({ utter: null })
  const lastStatusRef = useRef<string | null>(null)

  const [inputPrompt, setInputPrompt] = useState("")
  const [plainFiles, setAllPlainFiles] = useState<File[]>([])
  const [filesContent, setAllFilesContent] = useState<FileContents>([])
  const [autoSpeak, setAutoSpeak] = useState(false)
  const [banner, setBanner] = useState<{ type: 'error' | 'info', text: string } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [recordingStartMs, setRecordingStartMs] = useState<number | null>(null)

  const { openFilePicker, loading, clear: _pickerClear } = useFilePicker({
    readAs: "DataURL",
    accept: ".png,.jpg",
    multiple: true,
    onFilesSuccessfullySelected: (data) => {
      setAllPlainFiles(previousPlainFiles => previousPlainFiles.concat(data.plainFiles))
      setAllFilesContent(previousFilesContent => previousFilesContent.concat(data.filesContent))
    }
  })

  const clearAll = useCallback(() => {
    _pickerClear()
    // clear previous files
    setAllPlainFiles([]);
    setAllFilesContent([]);
  }, [_pickerClear]);

  const removeFile = (index: number) => {
    setAllFilesContent(previousFilesContent => [
      ...previousFilesContent.slice(0, index),
      ...previousFilesContent.slice(index + 1),
    ])

    setAllPlainFiles(previousPlainFiles => {
      const removedFile = previousPlainFiles[index]
      if (!removedFile) {
        return previousPlainFiles
      }
      return [...previousPlainFiles.slice(0, index), ...previousPlainFiles.slice(index + 1)]
    })
  }

  const hasFiles = !!filesContent.length && !!plainFiles.length

  const scrollToBottom = useCallback(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    container.scroll(0, container.scrollHeight)
  }, [containerRef])

  // Track scroll position to show a floating "scroll to latest" button
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = () => {
      const threshold = 32
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold
      setIsAtBottom(atBottom)
    }
    el.addEventListener('scroll', onScroll)
    onScroll()
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Inline banner auto-dismiss
  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(null), 4000)
    return () => clearTimeout(t)
  }, [banner])

  const showBanner = useCallback((text: string, type: 'error' | 'info' = 'info') => {
    setBanner({ text, type })
  }, [])

  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const [, setRecordingTick] = useState(0) // used to trigger re-renders while recording

  // Start microphone recording
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mr = new MediaRecorder(stream)
      recorderRef.current = mr
      audioChunksRef.current = []
      setRecordingStartMs(Date.now())
      mr.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) audioChunksRef.current.push(ev.data)
      }
      mr.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: audioChunksRef.current[0]?.type || "audio/webm" })
        // convert blob to data URL
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader()
          fr.onloadend = () => resolve(fr.result as string)
          fr.onerror = reject
          fr.readAsDataURL(blob)
        })

        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: JSON.stringify({
            dataUrl
          })
        }).then(res => res.json() as Promise<{ text?: string, error?: string }>)

        if (res?.text) {
          setInputPrompt(prev => (prev ? prev + ' ' : '') + res.text)
        } else if (res?.error) {
          showBanner(`Transcription failed: ${res.error}`, 'error')
        }

        // stop tracks to free mic
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
        setRecordingStartMs(null)
        scrollToBottom()
      }
      mr.start()
      setIsRecording(true)
    } catch (err) {
      console.error("Could not start recording:", err)
      showBanner('Microphone access failed. Please allow access and try again.', 'error')
    }
  }

  function stopRecording() {
    if (!recorderRef.current) return
    try {
      recorderRef.current.stop()
    } finally {
      setIsRecording(false)
      recorderRef.current = null
      setRecordingStartMs(null)
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try { recorderRef.current?.stop?.() } catch { }
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      recorderRef.current = null
      setIsRecording(false)
      setRecordingStartMs(null)
    }
  }, [])

  // Recording timer ticker: triggers re-render while recording
  useEffect(() => {
    if (!isRecording || !recordingStartMs) return
    const id = setInterval(() => {
      setRecordingTick(t => (t + 1) % 1000000)
    }, 500)
    return () => clearInterval(id)
  }, [isRecording, recordingStartMs])

  // Scroll to bottom
  useEffect(() => {
    scrollToBottom()
  }, [scrollToBottom])

  useEffect(() => {
    if (!setMessages) return
    setMessages([
      {
        id: nanoid(),
        role: "assistant",
        parts: [{
          type: "text",
          text: initialMessage
        }]
      }
    ])
  }, [initialMessage, setMessages])

  // (Removed duplicate startRecording/stopRecording definitions)

  // Submit logic
  const handleSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault()

    if (loading) return

    const inputText = inputPrompt.trim()

    // Build files payload
    const filesPayload = plainFiles.map((file, index) => ({
      type: "file" as const,
      mediaType: file.type,
      filename: file.name,
      url: filesContent[index]?.content,
    }))

    const hasFiles = filesPayload.length > 0
    const hasText = inputText.length > 0

    // Validate we have content to send
    if (!hasText && !hasFiles) {
      console.log("No content to send")
      return
    }

    try {
      // TTS: acknowledge prompt before sending for interactivity
      if (autoSpeak) {
        speakText('Got it')
      }
      // Send the message
      await sendMessage({
        text: inputText,
        files: filesPayload,
      })
    } catch (err) {
      console.error('Failed to send message:', err)
      showBanner('Failed to send message. Please try again.', 'error')
      return
    }

    // Clear form after successful send
    setInputPrompt("")
    clearAll()
    scrollToBottom()
  }

  // Helper to extract plain text from a UIMessage (used for TTS)
  const extractTextFromMessage = useCallback((m: UIMessage) => {
    const full = m.parts
      .filter(p => p.type === 'text')
      .map(p => p.text)
      .join("\n")
    // Strip markdown artifacts lightly for TTS
    return full.replace(/[#*_`>\[\]()-]/g, " ").replace(/\s+/g, " ").trim()
  }, [])

  // TTS helpers
  const stopSpeaking = useCallback(() => {
    if (typeof window === 'undefined') return
    try {
      window.speechSynthesis?.cancel?.()
      ttsRef.current.utter = null
    } catch (e) {
      console.warn('stopSpeaking failed:', e)
    }
  }, [])

  const speakText = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const cleaned = text.replace(/[#*_`>\[\]()-]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!cleaned) return
    try {
      window.speechSynthesis.cancel()
      const utter = new SpeechSynthesisUtterance(cleaned)
      ttsRef.current.utter = utter
      utter.onend = () => { ttsRef.current.utter = null }
      utter.onerror = () => { ttsRef.current.utter = null }
      window.speechSynthesis.speak(utter)
    } catch (e) {
      console.error('speakText failed:', e)
    }
  }, [])

  // Auto-speak the latest assistant message if enabled
  useEffect(() => {
    if (!autoSpeak) return
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
    if (!lastAssistant || lastSpokenAssistantIdRef.current === lastAssistant.id) return

    const text = extractTextFromMessage(lastAssistant)
    if (!text) return

    speakText(text)
    lastSpokenAssistantIdRef.current = lastAssistant.id
  }, [messages, autoSpeak, extractTextFromMessage, speakText])

  // Pre-response interactivity: speak a short cue when submission starts
  useEffect(() => {
    if (!autoSpeak) return
    if (status !== lastStatusRef.current) {
      lastStatusRef.current = status
      if (status === 'submitted') {
        speakText('Working on it')
      }
    }
  }, [status, autoSpeak, speakText])

  return (
    <div className="h-full flex-1 flex flex-col bg-sidebar-primary-foreground">
      <div className="relative p-2 flex-1 flex flex-col gap-2 overflow-y-auto" ref={containerRef}>
        {/* Inline banner */}
        {banner && (
          <div className={`mb-2 px-3 py-2 rounded-md text-sm ${banner.type === 'error' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
            {banner.text}
          </div>
        )}
        {messages.map((message, index) => (
          <ChatMessage
            key={index}
            message={message}
            user={user}
          />
        ))}
        {
          status === "submitted" &&
          <ChatMessage
            user={user}
            message={{
              id: "loading",
              role: "assistant",
              parts: [
                {
                  type: "text",
                  text: "Loading"
                }
              ]
            }}
          />
        }
        {/* Scroll-to-bottom floating button */}
        {!isAtBottom && (
          <div className="absolute bottom-3 right-3">
            <Button type="button" variant="secondary" onClick={scrollToBottom}>Jump to latest</Button>
          </div>
        )}
      </div>
      <form onSubmit={handleSubmit} ref={formRef}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault(); setIsDragging(false)
          const files = Array.from(e.dataTransfer.files || [])
          if (!files.length) return
          files.forEach(file => {
            const reader = new FileReader()
            reader.onload = () => {
              const content = reader.result as string
              setAllPlainFiles(prev => [...prev, file])
              setAllFilesContent(prev => [...prev, { name: file.name, content } as FileContents[number]])
            }
            reader.readAsDataURL(file)
          })
        }}
      >
        <div className="p-2 flex flex-col justify-center">
          <div className={`${hasFiles ? "flex" : "hidden"} z-0 gap-1 bg-background w-full h-24 relative top-[28px] rounded-xl p-[8px] pb-[36px]`}>
            {
              hasFiles && filesContent.map((file, index) => (
                <div key={index} className="relative group">
                  {
                    // If the corresponding plainFile exists and is audio, render audio controls
                    plainFiles[index] && plainFiles[index].type && plainFiles[index].type.startsWith("audio/") ? (
                      <audio className="h-full rounded-md" controls src={file.content} />
                    ) : (
                      <Image
                        className="h-full aspect-square rounded-md"
                        src={file.content}
                        width={52}
                        height={52}
                        alt={file.name}
                      />
                    )
                  }
                  <Button
                    type="button"
                    className="bg-black opacity-0 h-full w-full top-0 left-0 absolute rounded-md group-hover:opacity-50"
                    onClick={() => removeFile(index)}
                  >
                    <X className="opacity-0 group-hover:opacity-100 relative z-20" size={48} />
                  </Button>
                </div>
              ))
            }
            {/* Drag overlay */}
            {isDragging && (
              <div className="absolute inset-0 rounded-xl border-2 border-dashed border-blue-400 bg-blue-50/50 flex items-center justify-center text-blue-700">
                Drop files to attach
              </div>
            )}
          </div>
          <Label className="p-2 h-16 shadow-sm rounded-xl bg-background w-full flex gap-1 relative z-10">
            <Button variant="ghost" className="rounded-full" onClick={openFilePicker} type="button">
              <Plus />
            </Button>
            <Button
              variant="ghost"
              className="rounded-full"
              type="button"
              onClick={() => { if (isRecording) { stopRecording() } else { startRecording() } }}
            >
              <Mic className={`${isRecording ? "bg-red-500" : "bg-none"}`} />
            </Button>
            {/* Auto-speak toggle */}
            <Button
              variant="ghost"
              className={`rounded-full ${autoSpeak ? 'text-blue-600' : ''}`}
              type="button"
              title={autoSpeak ? 'Auto-speak: on' : 'Auto-speak: off'}
              onClick={() => setAutoSpeak(v => !v)}
            >
              <Volume2 />
            </Button>
            {/* Stop speaking (barge-in) */}
            <Button
              variant="ghost"
              className="rounded-full"
              type="button"
              title="Stop speaking"
              onClick={stopSpeaking}
            >
              <Square />
            </Button>
            {/* Recording indicator with timer */}
            <div className="flex items-center gap-2 px-2">
              {isRecording && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <span className="h-3 w-3 rounded-full bg-red-600 animate-pulse" />
                  <span>Recording{recordingStartMs ? ` ${new Date(Date.now() - recordingStartMs).toISOString().slice(14, 19)}` : '...'}</span>
                </div>
              )}
            </div>
            <Input
              placeholder="Ask about meals or ingredients..."
              className="shadow-none border-none focus-visible:ring-ring/0"
              value={inputPrompt}
              onChange={e => setInputPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault()
                  formRef.current?.requestSubmit?.()
                }
              }}
            // minLength={10}
            />
            <Button type="submit" variant="ghost">
              <Send />
            </Button>
          </Label>
        </div>
      </form>
    </div>
  )
}

function parseRecipe(fullMessageText: string) {
  const re = /---RECIPE_JSON_START---([\s\S]*?)---RECIPE_JSON_END---/
  const m = fullMessageText.match(re)
  if (!m) return null
  const jsonText = m[1].trim()
  try {
    return JSON.parse(jsonText) as ParsedRecipe
  } catch (err) {
    console.warn("Failed to parse recipe JSON:", err)
    return null
  }
}

function ChatMessage({
  message,
  user,
}: {
  message: UIMessage,
  user: User,
}) {
  const isOwnMessage = message.role === "user"
  const isBot = message.role === "assistant"
  const authorName = isOwnMessage ? user.name : "Ai Sous Chef"

  const appContext = useContext(AppContext)!

  const fullMessageText =
    message.parts
      .filter(part => part.type === "text")
      .map(part => part.text)
      .join("\n &nbsp;")

  const messageText = fullMessageText
    .split("-----------------------------")[0]
    .replace(/\n/gi, '  \n &nbsp;')
    .trim()

  const parsedRecipe = parseRecipe(fullMessageText)

  return (
    <div
      key={message.id}
      className={`w-full flex flex-col gap-2 ${isOwnMessage ? "items-end" : "items-start"} justify-end`}
    >
      <div className="flex gap-2">
        <Label className="flex items-center gap-2">{authorName}
          {isBot && (
            <>
              <Button size="icon" variant="ghost" onClick={() => {
                const text = message.parts.filter(p => p.type === 'text').map(p => p.text).join('\n').replace(/[#*_`>\[\]()-]/g, ' ').replace(/\s+/g, ' ').trim()
                if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                  window.speechSynthesis.cancel()
                  const u = new SpeechSynthesisUtterance(text)
                  window.speechSynthesis.speak(u)
                }
              }}>
                <Volume2 />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => { if (typeof window !== 'undefined') window.speechSynthesis?.cancel?.() }}>
                <Square />
              </Button>
            </>
          )}
        </Label>
      </div>
      <div className={`flex gap-2 justify-end ${!isOwnMessage ? "flex-row-reverse" : ""} w-full`}>
        <div className="max-w-1/2 flex flex-col gap-2">
          <div className={`p-2 w-full ${isOwnMessage ? "bg-blue-500 text-white" : "bg-background"} shadow-sm rounded-sm break-words`}>
            <Markdown>
              {messageText}
            </Markdown>
          </div>
        </div>
        <div className="size-10 flex bg-background rounded-full items-center justify-center">
          {
            message.role == "user"
              ?
              <Image
                src={user.image!}
                height={42} width={42}
                alt={`${user.name}'s profile image`}
                className="rounded-full"
              />
              : ""
          }
          {
            isBot &&
            "🧑‍🍳"
          }
        </div>
      </div>
      {
        message.parts
          .filter(part => part.type === "file")
          .map((part, index) => (
            <FilePart part={part} key={index} />
          ))
      }
      {
        isBot && parsedRecipe && parsedRecipe.isRecipe && !appContext.selectedRecipe &&
        <Button onClick={() => { appContext.setSelectedRecipe(parsedRecipe); console.log(parsedRecipe) }}>Make this meal</Button>
      }
    </div>
  )
}

function FilePart({ part }: { part: FileUIPart }) {
  const imageTypes = ["image/png", "image/jpeg"]

  return (
    <div>
      {
        imageTypes.includes(part.mediaType) &&
        <Image className="rounded-md" src={part.url} width={200} height={200} alt={part.filename!} />
      }
    </div>
  )
}