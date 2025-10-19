// import { CoreMessage, streamText } from 'ai';
// import { createOpenAI } from '@ai-sdk/openai';

// // Allow streaming responses up to 30 seconds
// export const maxDuration = 30;

// // Initialize the OpenAI provider from the Vercel AI SDK
// const openai = createOpenAI();

// export async function POST(req: Request) {
//   const { messages }: { messages: CoreMessage[] } = await req.json();

//   // The new, correct way to use a managed prompt:
//   // Place the prompt ID inside a system message at the start of the conversation.
//   const promptId = "pmpt_68f4f96a85148195a263613108277af50698a91bb1361ab2";
//   const systemMessage = {
//     role: 'system' as const,
//     content: `[vercel-prompt-id:${promptId}]`
//   };

//   const result = await streamText({
//     model: openai('gpt-4-turbo'),

//     // Prepend the special system message to the user's conversation history.
//     // The Vercel AI Gateway will replace this with your actual prompt content.
//     messages: [systemMessage, ...messages],
//   });

//   // This part is correct and should now work without errors.
//   return result.toAIStreamResponse();
// }