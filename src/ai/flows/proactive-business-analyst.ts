
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { getFirebaseAdmin } from '@/lib/server/firebase-admin';
import type { Store, Transaction } from '@/lib/types';

// The input to the flow is now much simpler
export const ProactiveBusinessAnalystInputSchema = z.object({
  activeStore: z.custom<Store>(),
});
export type ProactiveBusinessAnalystInput = z.infer<typeof ProactiveBusinessAnalystInputSchema>;

export const ProactiveBusinessAnalystOutputSchema = z.object({
  openingStatement: z.string().describe('A proactive, insightful opening statement from the AI summarising its initial findings.'),
  suggestedTopics: z.array(z.string()).describe('An array of 3 distinct, actionable topics the user can choose to discuss.'),
});
export type ProactiveBusinessAnalystOutput = z.infer<typeof ProactiveBusinessAnalystOutputSchema>;

const PROMPT_TEMPLATE = `Anda adalah Chika, seorang analis bisnis AI proaktif untuk sebuah {{businessDescription}} bernama {{activeStoreName}}.
Tugas Anda adalah memulai sesi konsultasi dengan admin toko.

Lakukan analisis singkat berdasarkan data berikut:
- Pendapatan Bulan Lalu: Rp {{totalRevenueLastMonth}}
- Produk Terlaris: {{topSellingProducts}}
- Produk Kurang Laris: {{worstSellingProducts}}

Berdasarkan analisis Anda:
1.  Buat 'openingStatement': Sebuah kalimat pembuka yang ramah dan insightful. Rangkum satu temuan kunci dan nyatakan tujuan Anda untuk membantu.
2.  Buat 'suggestedTopics': Berikan TIGA topik diskusi yang berbeda dan dapat ditindaklanjuti.`;

export const proactiveBusinessAnalystFlow = ai.defineFlow(
  {
    name: 'proactiveBusinessAnalystFlow',
    inputSchema: ProactiveBusinessAnalystInputSchema,
    outputSchema: ProactiveBusinessAnalystOutputSchema,
  },
  async ({ activeStore }) => {
    const { db } = getFirebaseAdmin();
    // 1. Data Fetching logic is now INSIDE the flow
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    const transactionsRef = db.collection(`stores/${activeStore.id}/transactions`);
    const q = transactionsRef.where('createdAt', '>=', twoMonthsAgo.toISOString());
    const querySnapshot = await q.get();

    if (querySnapshot.empty) {
        return {
            openingStatement: "Halo! Saya belum melihat adanya data transaksi dalam 2 bulan terakhir. Setelah ada beberapa penjualan, saya bisa mulai memberikan analisis.",
            suggestedTopics: ["Bagaimana cara mencatat transaksi?", "Tips untuk penjualan pertama", "Pentingnya data pelanggan"]
        };
    }
    const transactions = querySnapshot.docs.map(doc => doc.data() as Transaction);

    // 2. Data Processing logic is also INSIDE the flow
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
        .replace('{{businessDescription}}', activeStore.businessDescription || 'Toko')
        .replace('{{activeStoreName}}', activeStore.name)
        .replace('{{totalRevenueLastMonth}}', totalRevenueLastMonth.toLocaleString('id-ID'))
        .replace('{{topSellingProducts}}', topSellingProductsList || 'Tidak ada data')
        .replace('{{worstSellingProducts}}', worstSellingProductsList || 'Tidak ada data');


    // 3. AI Generation
    const { output } = await ai.generate({
      model: 'openai/gpt-4o',
      prompt: prompt,
      output: {
        schema: ProactiveBusinessAnalystOutputSchema,
      },
    });

    if (!output) {
      throw new Error('AI did not return a valid analysis.');
    }
    return output;
  }
);
