// import { NextRequest, NextResponse } from 'next/server';
// import { generateText } from 'ai';
// import { createOpenAI } from '@ai-sdk/openai';
// import OpenAI from 'openai'; // We still need the base OpenAI client for STT and TTS

// // Initialize the base OpenAI client for Audio APIs
// const openaiClient = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });

// // Initialize the Vercel AI SDK provider for Chat Completion API
// const vercelAiOpenAI = createOpenAI();

// export async function POST(req: NextRequest) {
//   try {
//     const formData = await req.formData();
//     const audioFile = formData.get('audio') as File | null;
//     const historyString = formData.get('history') as string | null;

//     if (!audioFile) {
//       return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
//     }

//     let history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
//     if (historyString) {
//       try {
//         history = JSON.parse(historyString);
//       } catch (error) {
//         return NextResponse.json({ error: 'Invalid history format' }, { status: 400 });
//       }
//     }
    
//     // 1. Transcribe the audio using Whisper (using the base openai client)
//     const transcription = await openaiClient.audio.transcriptions.create({
//       model: 'whisper-1',
//       file: audioFile,
//     });
//     const userMessage = transcription.text;

//     // 2. Get a chat completion response using the Vercel AI SDK and your managed prompt
    
//     // This is the managed prompt object you provided.
//     const managedPrompt = {
//       prompt: {
//         id: "pmpt_68f4f96a85148195a263613108277af50698a91bb1361ab2",
//         version: "1"
//       }
//     };
    
//     const { text: assistantMessage } = await generateText({
//       model: vercelAiOpenAI('gpt-4-turbo'),
//       // Combine history with the new user message
//       messages: [
//         ...history, 
//         { role: 'user', content: userMessage }
//       ],
//       // Use the managed prompt from Vercel's platform
//       experimental_prompt: managedPrompt,
//     });
    
//     if (!assistantMessage) {
//       return NextResponse.json({ error: 'Failed to get assistant response' }, { status: 500 });
//     }

//     // 3. Convert the assistant's response to speech (TTS) (using the base openai client)
//     const speech = await openaiClient.audio.speech.create({
//       model: "tts-1",
//       voice: "nova",
//       input: assistantMessage,
//     });
    
//     const audioBuffer = await speech.arrayBuffer();
//     // Convert ArrayBuffer to Base64 to safely send via JSON
//     const audioBase64 = Buffer.from(audioBuffer).toString('base64');
    
//     // 4. Send everything back to the client
//     return NextResponse.json({
//         userMessage: userMessage,
//         assistantMessage: assistantMessage,
//         audio: audioBase64,
//     });

//   } catch (error) {
//     console.error('Error in voice assistant API:', error);
//     const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
//     return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
//   }
// }