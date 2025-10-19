import fs from "fs"
import path from "path"
import { config } from "dotenv"
import { experimental_transcribe as transcribe } from "ai"
import { openai } from "@ai-sdk/openai"
import { readFile } from "fs/promises"

config()

// Tiny contract:
// - Input: reads ./resources/audio.mp3
// - Output: returns transcription string or throws
// - Errors: missing file or API errors

export async function transcribeMessage() {
    const filePath = path.join(process.cwd(), "resources", "audio.mp3")
    if (!fs.existsSync(filePath)) {
        throw new Error(`Audio file not found: ${filePath}`)
    }

    try {
        const bytes = await readFile(filePath)
        return await transcribeBuffer(bytes)
    } catch (err) {
        console.error("Transcription failed:", err)
        throw err
    }
}

if (require.main === module) {
    transcribeMessage().then(t => console.log("Transcription:\n", t)).catch(() => process.exit(1))
}

export async function transcribeBuffer(bytes: Uint8Array | Buffer) {
    try {
        const result = await transcribe({
            model: openai.transcription("gpt-4o-mini-transcribe"),
            audio: bytes,
        })

        const typed = result as unknown as { text?: string; transcript?: string }
        const text = typed.text ?? typed.transcript ?? JSON.stringify(result)
        return text
    } catch (err) {
        console.error("transcribeBuffer failed:", err)
        throw err
    }
}