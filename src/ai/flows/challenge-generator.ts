
/**
 * @fileOverview An AI agent for generating sales challenges for employees.
 *
 * - generateChallenges - A function that creates sales challenges based on a budget and a specific time period.
 * - ChallengeGeneratorInput - The input type for the generateChallenges function.
 * - ChallengeGeneratorOutput - The return type for the generateChallenges function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

export const ChallengeGeneratorInputSchema = z.object({
  budget: z.number().describe('The total budget available for challenge rewards for the period.'),
  startDate: z.string().describe('The start date of the challenge period in YYYY-MM-DD format.'),
  endDate: z.string().describe('The end date of the challenge period in YYYY-MM-DD format.'),
  activeStoreName: z.string().describe('The name of the store for context.'),
  businessDescription: z.string().describe('A brief description of the business (e.g., "kafe", "vape store").'),
});
export type ChallengeGeneratorInput = z.infer<typeof ChallengeGeneratorInputSchema>;

export const ChallengeSchema = z.object({
    tier: z.string().describe("The name of the challenge tier (e.g., 'Perunggu', 'Perak', 'Emas') in Indonesian."),
    description: z.string().describe('A brief, motivating description of the challenge in Indonesian.'),
    target: z.number().describe('The total sales revenue (omset) target required to achieve this tier.'),
    reward: z.string().describe('The reward for achieving this tier, in Indonesian (e.g., "Bonus tunai Rp 500.000").'),
});

export const ChallengeGeneratorOutputSchema = z.object({
  challenges: z.array(ChallengeSchema).describe('A list of generated sales challenges.'),
  period: z.string().describe('The formatted challenge period string (e.g., "1 Jul - 31 Jul 2024").')
});
export type ChallengeGeneratorOutput = z.infer<typeof ChallengeGeneratorOutputSchema>;

export async function generateChallenges(
  input: ChallengeGeneratorInput
): Promise<ChallengeGeneratorOutput> {
  return challengeGeneratorFlow(input);
}

// We ask the LLM to generate the content, but we format the date ourselves.
// This avoids potential hallucinations in date formatting.
const ChallengeGeneratorGptOutputSchema = z.object({
  challenges: z.array(ChallengeSchema).describe('A list of generated sales challenges.'),
});

const promptText = `Anda adalah Chika AI, seorang ahli dalam merancang program insentif. Anda membuat tantangan untuk sebuah grup pujasera bernama **{{activeStoreName}}**.

Tugas Anda adalah membuat 3-4 tingkatan tantangan penjualan untuk para tenant di dalam pujasera berdasarkan total anggaran hadiah untuk periode tertentu. Tantangan harus didasarkan pada pencapaian total pendapatan penjualan (omset) dalam Rupiah Indonesia (Rp) per tenant.

Gunakan Bahasa Indonesia untuk semua output teks.
Nama tingkatan (tier) harus kreatif dan memotivasi, relevan untuk kompetisi antar-tenant F&B.
Contoh: "Tenant Paling Cepat", "Jawara Omset", "Bintang Pujasera".
Deskripsi tantangan harus singkat, memotivasi, dan dalam Bahasa Indonesia.
Target harus realistis namun menantang bagi para tenant. Pertimbangkan durasi tantangan saat menetapkan target.
Hadiah harus didistribusikan dari anggaran yang disediakan. Tingkat tertinggi harus mendapatkan hadiah terbesar. Hadiahnya bisa berupa bonus tunai.

Periode Tantangan: {{startDate}} hingga {{endDate}}
Total Anggaran Hadiah: Rp {{budget}}

Buat satu set tantangan yang relevan untuk kompetisi antar-tenant dalam sebuah pujasera.`;


export const challengeGeneratorFlow = ai.defineFlow(
  {
    name: 'challengeGeneratorFlow',
    inputSchema: ChallengeGeneratorInputSchema,
    outputSchema: ChallengeGeneratorOutputSchema,
  },
  async (input) => {
    
    const { output: gptOutput } = await ai.generate({
      model: 'openai/gpt-4o',
      prompt: promptText,
      input: input,
      output: {
        schema: ChallengeGeneratorGptOutputSchema,
      },
    });

    if (!gptOutput) {
      throw new Error('Failed to generate challenges from AI.');
    }

    // Format the date period server-side for consistency
    const { format: formatDate, parseISO } = await import('date-fns');
    const { id } = await import('date-fns/locale');
    
    const start = parseISO(input.startDate);
    const end = parseISO(input.endDate);
    
    let period;
    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
      period = `${formatDate(start, 'd')} - ${formatDate(end, 'd MMMM yyyy', { locale: id })}`;
    } else if (start.getFullYear() === end.getFullYear()) {
      period = `${formatDate(start, 'd MMM', { locale: id })} - ${formatDate(end, 'd MMM yyyy', { locale: id })}`;
    } else {
      period = `${formatDate(start, 'd MMM yyyy', { locale: id })} - ${formatDate(end, 'd MMM yyyy', { locale: id })}`;
    }

    return {
      challenges: gptOutput.challenges,
      period: period
    };
  }
);
