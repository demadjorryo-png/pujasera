/**
 * @fileOverview An AI agent for generating product descriptions.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

export const DescriptionGeneratorInputSchema = z.object({
  productName: z.string().describe('The name of the product.'),
  category: z.string().describe('The category of the product (e.g., "Kopi", "Makanan Ringan").'),
  topSellingProducts: z.array(z.string()).describe('A list of other top-selling products for context.'),
});
export type DescriptionGeneratorInput = z.infer<typeof DescriptionGeneratorInputSchema>;

export const DescriptionGeneratorOutputSchema = z.object({
  description: z.string().describe('A concise, attractive product description in Indonesian (2-3 sentences).'),
});
export type DescriptionGeneratorOutput = z.infer<typeof DescriptionGeneratorOutputSchema>;

const promptText = `Anda adalah seorang copywriter F&B yang ahli untuk merek "Chika".
Tugas Anda adalah membuat deskripsi produk yang singkat (2-3 kalimat), menarik, dan menggugah selera untuk item menu berikut.

Gunakan Bahasa Indonesia.

Detail Produk:
- Nama Produk: {{productName}}
- Kategori: {{category}}

Sebagai konteks, produk terlaris lainnya di toko ini adalah: {{#each topSellingProducts}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}.

Fokus pada pengalaman, rasa, dan keunikan produk. Buat pelanggan ingin segera mencobanya.

Contoh untuk "Kopi Susu Gula Aren":
"Perpaduan sempurna antara espresso berkualitas, susu segar, dan manisnya gula aren asli. Minuman klasik yang akan menyemangati harimu, disajikan panas atau dingin sesuai seleramu."

Hasilkan deskripsi untuk {{productName}} dan kembalikan dalam format JSON yang valid.`;

export const descriptionGeneratorFlow = ai.defineFlow(
  {
    name: 'descriptionGeneratorFlow',
    inputSchema: DescriptionGeneratorInputSchema,
    outputSchema: DescriptionGeneratorOutputSchema,
  },
  async (input) => {
    const { output } = await ai.generate({
      model: 'openai/gpt-4o',
      prompt: promptText,
      input: input,
      output: {
        schema: DescriptionGeneratorOutputSchema,
      },
    });
    
    if (!output) {
      throw new Error('AI did not return a valid description.');
    }
    return output;
  }
);

export async function generateDescription(
  input: DescriptionGeneratorInput
): Promise<DescriptionGeneratorOutput> {
    return descriptionGeneratorFlow(input);
}
