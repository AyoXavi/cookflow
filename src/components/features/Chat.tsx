"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { User } from "@/generated/prisma"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, FileUIPart, UIMessage } from "ai"
import { Mic, Plus, Send, X } from "lucide-react"
import Image from "next/image"
import { FormEventHandler, useCallback, useContext, useEffect, useRef, useState } from "react"
import Markdown from "react-markdown"
import { useFilePicker } from "use-file-picker"
import { nanoid } from "nanoid"
import { AppContext } from "./AppContext"
import { ParsedRecipe } from "@/lib/types"

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
  })

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [plainFiles, setAllPlainFiles] = useState<File[]>([])
  const [filesContent, setAllFilesContent] = useState<FileContents>([])

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

  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      recorderRef.current = mr
      audioChunksRef.current = []

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

        // create a File so it matches files picked via file picker
        const filename = `recording-${nanoid()}.webm`
        const file = new File([blob], filename, { type: blob.type })

        // add to state so it will be included in the next sendMessage
        setAllPlainFiles(prev => prev.concat(file))
        // `filesContent` expects objects returned by useFilePicker; minimal compatible shape:
        const added: FileContents[number] = { name: filename, content: dataUrl } as unknown as FileContents[number]
        setAllFilesContent(prev => prev.concat(added))

        // stop tracks to free mic
        stream.getTracks().forEach(t => t.stop())
        scrollToBottom()
      }

      mr.start()
      setIsRecording(true)
    } catch (err) {
      console.error("Could not start recording:", err)
    }
  }

  function stopRecording() {
    if (!recorderRef.current) return
    try {
      recorderRef.current.stop()
    } finally {
      setIsRecording(false)
      recorderRef.current = null
    }
  }

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

  // Submit logic
  async function transcribeAudio() {
    // find first audio file content
    const audioIndex = plainFiles.findIndex(f => f.type.startsWith('audio/'))
    if (audioIndex === -1) return ''
    const dataUrl = filesContent[audioIndex]?.content
    if (!dataUrl) return ''

    try {
      const resp = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      })
      const json = await resp.json()
      const text = json?.text ?? ''
      if (inputRef.current) inputRef.current.value = text
      return text
    } catch (err) {
      console.error('Transcription failed:', err)
      return ''
    }
  }

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault()

    if (!inputRef.current || loading) return

    // Build files payload (matches the transport expected shape)
    const filesPayload = plainFiles.map((file, index) => ({
      type: "file" as const,
      mediaType: file.type,
      filename: file.name,
      url: filesContent[index]?.content,
    }))

    try {
      const hasAudio = filesPayload.some(f => f.mediaType?.startsWith?.("audio/"))
      if (hasAudio) {
        // ensure transcription present in input before sending
        await transcribeAudio()
        await sendMessage({
          text: inputRef.current?.value ?? '',
          files: filesPayload,
          metadata: { authorId: user.id, recorded: true }
        })
      } else {
        // Regular text + files send
        await sendMessage({
          text: inputRef.current.value,
          files: filesPayload,
          metadata: { authorId: user.id }
        })
      }

      // Clear input and previews only after send completes so the UI doesn't drop the preview too early
      if (inputRef.current) inputRef.current.value = ""
      clearAll()
      scrollToBottom()
    } catch (err) {
      console.error("Failed to send message:", err)
    }
  }

  return (
    <div className="h-full flex-1 flex flex-col bg-sidebar-primary-foreground">
      <div className="p-2 flex-1 flex flex-col gap-2 overflow-y-auto" ref={containerRef}>
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
            message={({
              id: "loading",
              role: "assistant",
              parts: [
                {
                  type: "text",
                  text: "Loading"
                }
              ]
            })}
          />
        }
      </div>
      <form onSubmit={handleSubmit}>
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
            {/* Recording indicator */}
            <div className="flex items-center gap-2 px-2">
              {isRecording && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <span className="h-3 w-3 rounded-full bg-red-600 animate-pulse" />
                  <span>Recording...</span>
                </div>
              )}
            </div>
            <Input
              placeholder="Ask about meals or ingredients..."
              className="shadow-none border-none focus-visible:ring-ring/0"
              // minLength={10}
              required
              ref={inputRef}
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
        <Label>{authorName}</Label>
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