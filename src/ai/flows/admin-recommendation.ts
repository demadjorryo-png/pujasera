

/**
 * @fileOverview An AI agent for generating business recommendations for admins.
 *
 * - getAdminRecommendations - A function that provides weekly and monthly strategic advice.
 * - AdminRecommendationInput - The input type for the getAdminRecommendations function.
 * - AdminRecommendationOutput - The return type for the getAdminRecommendations function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AdminRecommendationInputSchema = z.object({
  businessDescription: z.string().describe('A brief description of the business (e.g., "kafe", "vape store").'),
  totalRevenueLastWeek: z.number().describe('Total revenue from the previous week.'),
  totalRevenueLastMonth: z.number().describe('Total revenue from the previous month.'),
  topSellingProducts: z.array(z.string()).describe('A list of the best-selling products.'),
  worstSellingProducts: z.array(z.string()).describe('A list of the worst-selling products.'),
});
export type AdminRecommendationInput = z.infer<typeof AdminRecommendationInputSchema>;

const AdminRecommendationOutputSchema = z.object({
  weeklyRecommendation: z.string().describe('A concise, actionable weekly recommendation in Indonesian.'),
  monthlyRecommendation: z.string().describe('A high-level monthly strategic recommendation in Indonesian.'),
});
export type AdminRecommendationOutput = z.infer<typeof AdminRecommendationOutputSchema>;

export async function getAdminRecommendations(
  input: AdminRecommendationInput
): Promise<AdminRecommendationOutput> {
  return adminRecommendationFlow(input);
}

const promptText = `Anda adalah Chika AI, seorang analis bisnis ahli untuk Kasir POS Chika F&B. Anda sedang memberikan saran untuk sebuah **{{businessDescription}}**.

Tugas Anda adalah memberikan rekomendasi strategis mingguan dan bulanan untuk admin toko berdasarkan data kinerja berikut. Rekomendasi harus singkat, dapat ditindaklanjuti, relevan dengan jenis bisnis, dan dalam Bahasa Indonesia.

Data Kinerja:
- Total Pendapatan Minggu Lalu: Rp {{totalRevenueLastWeek}}
- Total Pendapatan Bulan Lalu: Rp {{totalRevenueLastMonth}}
{{#if topSellingProducts.length}}
- Produk Terlaris: {{#each topSellingProducts}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}
{{/if}}
{{#if worstSellingProducts.length}}
- Produk Kurang Laris: {{#each worstSellingProducts}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}
{{else}}
- Produk Kurang Laris: Tidak ada data produk yang berkinerja buruk secara signifikan.
{{/if}}

Berdasarkan data ini:

1.  Buat **rekomendasi mingguan** yang berfokus pada tindakan jangka pendek. Pastikan saran Anda relevan untuk sebuah **{{businessDescription}}**.
    {{#if worstSellingProducts.length}}
    Contoh: Sarankan promosi \'bundling\' untuk produk yang kurang laris dengan produk terlaris, atau adakan acara \'happy hour\' pada hari-hari sepi.\
    {{else}}
    Contoh: Karena semua produk berkinerja baik, sarankan untuk fokus pada peningkatan interaksi pelanggan, seperti meminta ulasan atau menjalankan promosi di media sosial untuk meningkatkan kunjungan.\
    {{/if}}

2.  Buat **rekomendasi bulanan** yang berfokus pada strategi jangka panjang dan relevan untuk sebuah **{{businessDescription}}**.
    {{#if worstSellingProducts.length}}
    Contoh: Sarankan untuk mengurangi stok produk yang kurang laris dan bernegosiasi dengan pemasok untuk harga yang lebih baik pada produk terlaris, atau usulkan program loyalitas baru.\
    {{else}}
    Contoh: Sarankan untuk mengeksplorasi kategori produk baru yang komplementer atau berinvestasi dalam program loyalitas untuk mempertahankan momentum penjualan yang positif.\
    {{/if}}

Pastikan rekomendasi Anda berbeda untuk mingguan dan bulanan. Gunakan nada yang profesional namun memotivasi.`;

export const adminRecommendationFlow = ai.defineFlow(
  {
    name: 'adminRecommendationFlow',
    inputSchema: AdminRecommendationInputSchema,
    outputSchema: AdminRecommendationOutputSchema,
  },
  async (input) => {
    const { output } = await ai.generate({
      model: 'openai/gpt-4o',
      prompt: promptText,
      input: input,
      output: {
        schema: AdminRecommendationOutputSchema,
      },
    });

    if (!output) {
      throw new Error('AI did not return a valid recommendation.');
    }
    return output;
  }
);
