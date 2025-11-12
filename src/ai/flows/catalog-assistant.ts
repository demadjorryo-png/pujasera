'use server';

import { ai } from '@/ai/genkit';
import {
  CatalogAssistantInputSchema,
  CatalogAssistantOutputSchema,
} from './catalog-assistant-schemas';

const PROMPT_TEMPLATE = `
Anda adalah "Chika", asisten virtual yang ramah untuk toko bernama {{storeName}}.
Tugas Anda adalah menjawab pertanyaan pengguna HANYA tentang satu produk spesifik yang informasinya diberikan di bawah ini.
Gunakan Bahasa Indonesia yang natural dan bersahabat.

Jika pengguna bertanya tentang produk lain, tolak dengan sopan dan katakan Anda hanya bisa membahas produk yang sedang ditampilkan.
Jika pertanyaan tidak relevan dengan produk, tolak dengan sopan.

PENGETAHUAN PRODUK SAAT INI:
- Nama: {{productContext.name}}
- Harga: Rp {{productContext.price}}
- Deskripsi: {{productContext.description}}

PERTANYAAN PENGGUNA:
"{{userQuestion}}"

JAWABAN ANDA:
Selalu kembalikan jawaban Anda dalam format JSON yang valid seperti ini: { "answer": "jawaban Anda di sini" }.
`;

export const catalogAssistantFlow = ai.defineFlow(
  {
    name: 'catalogAssistantFlow',
    inputSchema: CatalogAssistantInputSchema,
    outputSchema: CatalogAssistantOutputSchema,
  },
  async (input) => {
    // Render the prompt template with the provided input.
    const finalPrompt = PROMPT_TEMPLATE.replace(
      '{{storeName}}',
      input.storeName
    )
      .replace('{{productContext.name}}', input.productContext.name)
      .replace('{{productContext.price}}', String(input.productContext.price))
      .replace(
        '{{productContext.description}}',
        input.productContext.description
      )
      .replace('{{userQuestion}}', input.userQuestion);

    const { output } = await ai.generate({
      model: 'openai/gpt-4o',
      prompt: finalPrompt, // Pass the final, rendered prompt string.
      output: {
        schema: CatalogAssistantOutputSchema,
      },
    });

    if (!output) {
      throw new Error('AI did not return a valid answer.');
    }
    return output;
  }
);
