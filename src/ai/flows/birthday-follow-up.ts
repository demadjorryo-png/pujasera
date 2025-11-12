
/**
 * @fileOverview An AI agent for generating birthday follow-up messages.
 *
 * - getBirthdayFollowUp - A function that generates a birthday message with a discount.
 * - BirthdayFollowUpInput - The input type for the getBirthdayFollowUp function.
 * - BirthdayFollowUpOutput - The return type for the getBirthdayFollowUp function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

export const BirthdayFollowUpInputSchema = z.object({
  customerName: z.string().describe('The name of the customer.'),
  discountPercentage: z
    .number()
    .describe('The discount percentage to offer.'),
  birthDate: z.string().describe("The customer's birth date in YYYY-MM-DD format."),
});
export type BirthdayFollowUpInput = z.infer<
  typeof BirthdayFollowUpInputSchema
>;

export const BirthdayFollowUpOutputSchema = z.object({
  followUpMessage: z
    .string()
    .describe(
      'A friendly and concise birthday follow-up message for the customer in Indonesian.'
    ),
});
export type BirthdayFollowUpOutput = z.infer<
  typeof BirthdayFollowUpOutputSchema
>;

export async function getBirthdayFollowUp(
  input: BirthdayFollowUpInput
): Promise<BirthdayFollowUpOutput> {
  return birthdayFollowUpFlow(input);
}

const prompt = ai.definePrompt({
  name: 'birthdayFollowUpPrompt',
  input: {schema: BirthdayFollowUpInputSchema},
  output: {schema: BirthdayFollowUpOutputSchema},
  prompt: `Anda adalah Chika AI, asisten ramah untuk bisnis F&B.

Tugas Anda adalah membuat pesan ucapan selamat ulang tahun untuk pelanggan. Pesan harus ramah, singkat, dan dalam Bahasa Indonesia. Pesan harus mengucapkan selamat ulang tahun dan menawarkan diskon spesial.

Pertama, tentukan zodiak pelanggan dari tanggal lahir mereka: {{birthDate}}.
Kemudian, sertakan fakta singkat dan positif tentang zodiak tersebut dalam pesan Anda.

Penting, Anda juga harus menyertakan dua syarat berikut dalam pesan:
1.  Pelanggan harus menunjukkan pesan broadcast ini ke kasir untuk mengklaim diskon.
2.  Diskon berlaku hingga akhir bulan kelahiran mereka.

Nama Pelanggan: {{customerName}}
Persentase Diskon: {{discountPercentage}}%

Selain diskon, berikan juga contoh penawaran lain yang relevan untuk bisnis F&B, seperti "hidangan penutup gratis", "minuman gratis", atau "potongan harga untuk kunjungan berikutnya".

Buat pesan follow-up.`,
});

export const birthdayFollowUpFlow = ai.defineFlow(
  {
    name: 'birthdayFollowUpFlow',
    inputSchema: BirthdayFollowUpInputSchema,
    outputSchema: BirthdayFollowUpOutputSchema,
  },
  async input => {
    const { output } = await prompt(input, { model: 'openai/gpt-4o' });

    if (!output) {
      throw new Error('AI did not return a valid message.');
    }
    return output;
  }
);
