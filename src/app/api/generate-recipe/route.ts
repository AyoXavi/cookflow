import { auth } from "@/lib/auth";
import { baseConfig, readPrompt } from "@/lib/agent";
import { convertToModelMessages, stepCountIs, streamText, UIMessage } from "ai";
import { headers } from "next/headers";
import { unauthorized } from "next/navigation";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
    const session = await auth.api.getSession({
        headers: await headers()
    })

    if (!session) {
        unauthorized()
    }

    const { messages }: { messages: UIMessage[] } = await request.json()

    const result = streamText({
        ...baseConfig,
        system: readPrompt("generate-recipe"),
        messages: convertToModelMessages(messages),
        stopWhen: stepCountIs(5),
    })

    return result.toUIMessageStreamResponse()
}