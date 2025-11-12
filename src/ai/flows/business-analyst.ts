
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { getFirebaseAdmin } from '@/lib/server/firebase-admin';
import type { Store, Transaction } from '@/lib/types';

export const ChikaAnalystInputSchema = z.object({
  question: z.string().describe('The business-related question from the admin.'),
  activeStore: z.custom<Store>(),
});
export type ChikaAnalystInput = z.infer<typeof ChikaAnalystInputSchema>;

export const ChikaAnalystOutputSchema = z.object({
  answer: z.string().describe('A concise, actionable, and data-driven answer in Indonesian, formatted with Markdown.'),
});
export type ChikaAnalystOutput = z.infer<typeof ChikaAnalystOutputSchema>;

const PROMPT_TEMPLATE = `Anda adalah Chika AI, seorang analis bisnis ahli untuk {{activeStoreName}}.
Tugas Anda adalah menjawab pertanyaan dari admin secara ringkas, cerdas, dan berdasarkan data.

**Data Kontekstual:**
- Pendapatan Bulan Lalu: Rp {{totalRevenueLastMonth}}
- Menu Terlaris Saat Ini: {{topSellingProducts}}
- Menu Kurang Laris Saat Ini: {{worstSellingProducts}}

**Pertanyaan Admin:** "{{question}}"

Berikan jawaban yang dapat ditindaklanjuti. Format jawaban Anda menggunakan Markdown.`;

export const businessAnalystFlow = ai.defineFlow(
  {
    name: 'businessAnalystFlow',
    inputSchema: ChikaAnalystInputSchema,
    outputSchema: ChikaAnalystOutputSchema,
  },
  async ({ question, activeStore }) => {
    const { db } = getFirebaseAdmin();
    // 1. Data Fetching
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    const transactionsRef = db.collection(`stores/${activeStore.id}/transactions`);
    const q = transactionsRef.where('createdAt', '>=', twoMonthsAgo.toISOString());
    const querySnapshot = await q.get();
    const transactions = querySnapshot.docs.map(doc => doc.data() as Transaction);

    // 2. Data Processing
    const currentMonth = new Date().getMonth();
    const lastMonth = new Date(new Date().setMonth(currentMonth - 1)).getMonth();
    const sales: Record<string, { quantity: number }> = {};
    transactions.forEach(t => {
        if (new Date(t.createdAt).getMonth() === currentMonth) {
            t.items.forEach(item => {
                sales[item.productName] = { quantity: (sales[item.productName]?.quantity || 0) + item.quantity };
            });
        }
    });
    const sortedProducts = Object.entries(sales).sort(([, a], [, b]) => b.quantity - a.quantity);
    const totalRevenueLastMonth = transactions.filter(t => new Date(t.createdAt).getMonth() === lastMonth).reduce((sum, t) => sum + t.totalAmount, 0);

    const topSellingProductsList = sortedProducts.slice(0, 5).map(([name]) => name).join(', ');
    const worstSellingProductsList = sortedProducts.slice(-5).reverse().map(([name]) => name).join(', ');

    const prompt = PROMPT_TEMPLATE
        .replace('{{activeStoreName}}', activeStore.name)
        .replace('{{totalRevenueLastMonth}}', totalRevenueLastMonth.toLocaleString('id-ID'))
        .replace('{{topSellingProducts}}', topSellingProductsList || 'Tidak ada data')
        .replace('{{worstSellingProducts}}', worstSellingProductsList || 'Tidak ada data')
        .replace('{{question}}', question);

    // 3. AI Generation
    const { output } = await ai.generate({
      model: 'openai/gpt-4o',
      prompt: prompt,
      output: {
        schema: ChikaAnalystOutputSchema,
      },
    });
    
    if (!output) {
      throw new Error('AI did not return a valid result.');
    }
    return output;
  }
);

export async function askChika(
  input: ChikaAnalystInput
): Promise<ChikaAnalystOutput> {
  return businessAnalystFlow(input);
}
