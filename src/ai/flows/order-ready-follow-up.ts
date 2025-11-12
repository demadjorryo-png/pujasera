
/**
 * @fileOverview An AI agent for generating order-ready notifications.
 *
 * - getOrderReadyFollowUp - A function that generates a message to inform a customer their order is ready.
 * - OrderReadyFollowUpInput - The input type for the getOrderReadyFollow-up function.
 * - OrderReadyFollowUpOutput - The return type for the getOrderReadyFollow-up function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

export const OrderReadyFollowUpInputSchema = z.object({
  customerName: z.string().describe('The name of the customer.'),
  storeName: z.string().describe('The name of the store where the order was placed.'),
  itemsOrdered: z.array(z.string()).describe('A list of product names included in the order.'),
  currentTime: z.string().describe('The current time in HH:mm format (e.g., "14:30").'),
  notificationStyle: z.enum(['fakta', 'pantun']).describe('The desired creative style for the notification. "fakta" for a fun fact, "pantun" for a creative poem.'),
});
export type OrderReadyFollowUpInput = z.infer<typeof OrderReadyFollowUpInputSchema>;

export const OrderReadyFollowUpOutputSchema = z.object({
  followUpMessage: z
    .string()
    .describe(
      'A friendly and concise message in Indonesian to inform the customer their order is ready, including a fun fact, quote, or pantun about one of the items.'
    ),
});
export type OrderReadyFollowUpOutput = z.infer<typeof OrderReadyFollowUpOutputSchema>;

const prompt = ai.definePrompt({
  name: 'orderReadyFollowUpPrompt',
  input: { schema: OrderReadyFollowUpInputSchema },
  output: { schema: OrderReadyFollowUpOutputSchema },
  prompt: `Anda adalah Chika AI, asisten virtual yang ramah dan cerdas untuk kafe/restoran: {{activeStoreName}}..

Tugas Anda adalah membuat pesan notifikasi WhatsApp yang terstruktur dan menarik untuk memberitahu pelanggan bahwa pesanan mereka sudah siap untuk diambil. Pesan harus dalam Bahasa Indonesia dan menggunakan format Markdown WhatsApp (misalnya, *teks tebal*).

Struktur pesan harus rapi dan sopan:
1.  Mulailah dengan sapaan berdasarkan waktu. Gunakan {{currentTime}} sebagai acuan (Pagi: 05-10, Siang: 11-14, Sore: 15-18, Malam: 19-04).
2.  Sapa pelanggan dengan ramah, gunakan panggilan "Kak" sebelum namanya. Contoh: *Selamat Pagi, Kak {{customerName}}!*
3.  Beritahu bahwa pesanan mereka di *{{storeName}}* sudah siap.
4.  Di bagian tengah, Anda HARUS menyertakan satu sentuhan kreatif berdasarkan "Gaya Notifikasi" (**{{notificationStyle}}**). Bagian ini wajib ada.
    - Jika gayanya 'fakta': Berikan SATU fakta menarik tentang salah satu item pesanan ({{itemsOrdered}}). Jika tidak ada fakta spesifik, berikan fakta umum tentang makanan/minuman.
    - Jika gayanya 'pantun': Buat SATU pantun unik tentang salah satu item pesanan ({{itemsOrdered}}).
    Bungkus bagian kreatif ini dalam format kutipan Markdown. Contoh: \`> _Fakta menarik Anda di sini..._\`
5.  Tutup dengan ajakan untuk mengambil pesanan dan ucapan terima kasih.

Detail Pesanan:
- Waktu Saat Ini: {{currentTime}}
- Nama Pelanggan: {{customerName}}
- Nama Toko: {{storeName}}
- Item yang Dipesan: {{#each itemsOrdered}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}
- Gaya Notifikasi: {{notificationStyle}}

Contoh output yang baik untuk gaya 'fakta' dan waktu 14:30:
*Selamat Siang, Kak Budi!*

Pesanan Anda di *Kafe Chika* sudah siap diambil di kasir.

> _Tahukah Anda? Kopi adalah minuman kedua yang paling banyak dikonsumsi di dunia setelah air!_

Silakan segera diambil ya. Terima kasih!

Buat pesan yang jelas, menyenangkan, dan profesional.`,
});

export const orderReadyFollowUpFlow = ai.defineFlow(
  {
    name: 'orderReadyFollowUpFlow',
    inputSchema: OrderReadyFollowUpInputSchema,
    outputSchema: OrderReadyFollowUpOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input, { model: 'openai/gpt-4o' });

    if (!output) {
      throw new Error('AI did not return a valid message.');
    }
    return output;
  }
);

function getGreeting(time: string): string {
    const hour = parseInt(time.split(':')[0], 10);
    if (hour >= 5 && hour < 11) return 'Selamat Pagi';
    if (hour >= 11 && hour < 15) return 'Selamat Siang';
    if (hour >= 15 && hour < 19) return 'Selamat Sore';
    return 'Selamat Malam';
}

export async function getOrderReadyFollowUp(
  input: OrderReadyFollowUpInput
): Promise<OrderReadyFollowUpOutput> {
  try {
    return await orderReadyFollowUpFlow(input);
  } catch (finalError) {
    console.error('All AI attempts failed. Generating a fallback message.', finalError);

    const greeting = getGreeting(input.currentTime);
    const fallbackMessage = 
`*${greeting}, Kak ${input.customerName}!*\
\
Pesanan Anda di *${input.storeName}* sudah siap diambil di kasir.\
\
Silakan segera diambil ya. Terima kasih!`;

    return {
      followUpMessage: fallbackMessage,
    };
  }
}
