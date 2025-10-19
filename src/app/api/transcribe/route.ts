import { NextResponse } from 'next/server'
import { transcribeBuffer } from '@/actions/audio'

export async function POST(req: Request) {
    try {
        const body = await req.json()
        const { dataUrl } = body
        if (!dataUrl || typeof dataUrl !== 'string') {
            return NextResponse.json({ error: 'Missing dataUrl' }, { status: 400 })
        }

        // dataUrl format: data:<mime>;base64,<base64data>
        const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/)
        if (!match) {
            return NextResponse.json({ error: 'Invalid dataUrl' }, { status: 400 })
        }

        const base64 = match[2]
        const buffer = Buffer.from(base64, 'base64')

        const text = await transcribeBuffer(buffer)

        return NextResponse.json({ text })
    } catch (err) {
        console.error('transcribe route error:', err)
        const message = JSON.stringify(err)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
