
/**
 * @fileOverview A loyalty point recommendation AI agent.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

export const LoyaltyPointRecommendationInputSchema = z.object({
  loyaltyPoints: z.number().describe('The number of loyalty points the customer has.'),
  totalPurchaseAmount: z.number().describe('The total purchase amount of the current transaction.'),
  availableRedemptionOptions: z.array(
    z.object({
      description: z.string().describe('A description of the redemption option.'),
      pointsRequired: z.number().describe('The number of points required for this option.'),
      value: z.number().describe('The value of this redemption option.'),
    })
  ).describe('The available redemption options for the customer.'),
});
export type LoyaltyPointRecommendationInput = z.infer<typeof LoyaltyPointRecommendationInputSchema>;

export const LoyaltyPointRecommendationOutputSchema = z.object({
  recommendation: z.string().describe('A recommendation for the optimal way for the customer to redeem their loyalty points.'),
});
export type LoyaltyPointRecommendationOutput = z.infer<typeof LoyaltyPointRecommendationOutputSchema>;


const PROMPT_TEMPLATE = `Anda adalah seorang ahli dalam program loyalitas dan interaksi pelanggan untuk bisnis F&B.
Seorang pelanggan memiliki {{loyaltyPoints}} poin loyalitas dan sedang melakukan pembelian sebesar Rp {{totalPurchaseAmount}}.
Berikut adalah pilihan penukaran yang tersedia:

{{#each availableRedemptionOptions}}
- {{description}} ({{pointsRequired}} poin, Senilai: Rp {{value}})
{{/each}}

Berdasarkan informasi ini, rekomendasikan cara optimal bagi pelanggan untuk menukarkan poin mereka guna memaksimalkan keuntungan dan mendorong penukaran.
Rekomendasi harus berupa satu kalimat dalam Bahasa Indonesia.
Berikan contoh yang relevan dengan F&B, misalnya "Tukarkan poin Anda dengan hidangan penutup gratis!" atau "Dapatkan diskon untuk pesanan Anda berikutnya!".

Rekomendasi: `;

export const loyaltyPointRecommendationFlow = ai.defineFlow(
  {
    name: 'loyaltyPointRecommendationFlow',
    inputSchema: LoyaltyPointRecommendationInputSchema,
    outputSchema: LoyaltyPointRecommendationOutputSchema,
  },
  async (input) => {
    const { output } = await ai.generate({
      model: 'openai/gpt-4o',
      prompt: PROMPT_TEMPLATE,
      input: input,
      output: {
        schema: LoyaltyPointRecommendationOutputSchema,
      },
    });
    
    if (!output) {
      throw new Error('AI did not return a valid recommendation.');
    }
    return output;
  }
);

export async function getLoyaltyPointRecommendation(
  input: LoyaltyPointRecommendationInput
): Promise<LoyaltyPointRecommendationOutput> {
  return loyaltyPointRecommendationFlow(input);
}
