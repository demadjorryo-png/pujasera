/**
 * @fileOverview A Text-to-Speech (TTS) AI agent using the official OpenAI SDK.
 *
 * - convertTextToSpeech - A function that converts text into playable audio.
 * - TextToSpeechInput - The input type for the convertTextToSpeech function.
 * - TextToSpeechOutput - The return type for the convertTextToSpeech function.
 */
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import OpenAI from 'openai';

export const TextToSpeechInputSchema = z.object({
  text: z.string().describe('The text to convert to speech.'),
  gender: z
    .enum(['male', 'female'])
    .optional()
    .describe('The preferred gender of the voice. Defaults to female.'),
});
export type TextToSpeechInput = z.infer<typeof TextToSpeechInputSchema>;

export const TextToSpeechOutputSchema = z.object({
  audioDataUri: z.string().describe('The generated audio as a WAV Data URI.'),
});
export type TextToSpeechOutput = z.infer<typeof TextToSpeechOutputSchema>;

// This flow uses the official OpenAI Node.js SDK directly inside the Genkit flow
// for maximum reliability.
export const textToSpeechFlow = ai.defineFlow(
  {
    name: 'textToSpeechFlow',
    inputSchema: TextToSpeechInputSchema,
    outputSchema: TextToSpeechOutputSchema,
  },
  async ({ text, gender = 'female' }) => {
    
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY environment variable not set.");
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const voice = gender === 'male' ? 'alloy' : 'nova';

    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: voice,
      input: text,
    });
    
    // The response is a Buffer containing the MP3 audio data.
    const buffer = Buffer.from(await mp3.arrayBuffer());

    // Convert the Buffer to a Base64 string and create a Data URI.
    const audioDataUri = `data:audio/mpeg;base64,${buffer.toString('base64')}`;

    return {
      audioDataUri: audioDataUri,
    };
  }
);

export async function convertTextToSpeech(
  input: TextToSpeechInput
): Promise<TextToSpeechOutput> {
    return textToSpeechFlow(input);
}
