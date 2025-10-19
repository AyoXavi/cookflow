import { NextResponse } from 'next/server'
import { transcribeBuffer } from '@/actions/audio'

export async function POST(req: Request) {
    try {
        const body = await req.json()
        const { dataUrl } = body
        if (!dataUrl || typeof dataUrl !== 'string') {
            return NextResponse.json({ error: 'Missing dataUrl' }, { status: 400 })
        }
        let buffer: Buffer
        if (dataUrl.startsWith('data:')) {
            // dataUrl formats can include additional parameters, e.g.:
            // data:audio/webm;codecs=opus;base64,<base64data>
            // We robustly extract the base64 portion after the comma and ensure ';base64' is present.
            const commaIndex = dataUrl.indexOf(',')
            if (commaIndex === -1) {
                return NextResponse.json({ error: 'Invalid dataUrl (no comma separator)' }, { status: 400 })
            }

            const header = dataUrl.slice(5, commaIndex) // strip leading 'data:'
            if (!/;base64/i.test(header)) {
                return NextResponse.json({ error: 'Invalid dataUrl (missing ;base64)' }, { status: 400 })
            }

            const base64 = dataUrl.slice(commaIndex + 1)
            buffer = Buffer.from(base64, 'base64')
        } else {
            // Assume raw base64 string
            try {
                buffer = Buffer.from(dataUrl.trim(), 'base64')
            } catch {
                return NextResponse.json({ error: 'Invalid base64 audio payload' }, { status: 400 })
            }
        }

        if (buffer.byteLength === 0) {
            return NextResponse.json({ error: 'Empty audio payload' }, { status: 400 })
        }

        const text = await transcribeBuffer(buffer)

        return NextResponse.json({ text })
    } catch (err) {
        console.error('transcribe route error:', err)
        const message = JSON.stringify(err)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
