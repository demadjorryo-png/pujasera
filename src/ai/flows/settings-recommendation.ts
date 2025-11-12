
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

export const SettingsRecommendationInputSchema = z.object({
  businessDescription: z.string().describe("A brief description of the business (e.g., 'kafe', 'vape store')."),
  activeStoreName: z.string().describe('The name of the store for context.'),
});
export type SettingsRecommendationInput = z.infer<typeof SettingsRecommendationInputSchema>;

export const SettingsRecommendationOutputSchema = z.object({
    recommendations: z.array(z.string()).describe("A list of 2-3 concise, actionable setting recommendations in Indonesian."),
});
export type SettingsRecommendationOutput = z.infer<typeof SettingsRecommendationOutputSchema>;

const PROMPT_TEMPLATE = `Anda adalah Chika, seorang konsultan bisnis F&B yang ahli. Berdasarkan deskripsi bisnis ({{businessDescription}}) dari toko bernama {{activeStoreName}}, berikan 2-3 rekomendasi pengaturan yang paling relevan dan berdampak untuk mereka coba.

Fokus pada pengaturan yang praktis, seperti:
- Mengubah gaya notifikasi pesanan siap (fakta menarik vs. pantun).
- Mengaktifkan ringkasan penjualan harian via WhatsApp.
- Menyarankan untuk membuat deskripsi produk dengan AI.
- Menyesuaikan header/footer struk.

Setiap rekomendasi harus berupa satu kalimat singkat dan dapat ditindaklanjuti dalam Bahasa Indonesia.`;

export const settingsRecommendationFlow = ai.defineFlow(
  {
    name: 'settingsRecommendationFlow',
    inputSchema: SettingsRecommendationInputSchema,
    outputSchema: SettingsRecommendationOutputSchema,
  },
  async (input) => {
    const { output } = await ai.generate({
      model: 'openai/gpt-4o', // Corrected from gemini-pro to an OpenAI model
      prompt: PROMPT_TEMPLATE,
      input: input,
      output: {
        schema: SettingsRecommendationOutputSchema,
      },
    });

    if (!output) {
      throw new Error('AI did not return a valid recommendation.');
    }
    return output;
  }
);

export async function getSettingsRecommendations(
  input: SettingsRecommendationInput
): Promise<SettingsRecommendationOutput> {
  return settingsRecommendationFlow(input);
}
