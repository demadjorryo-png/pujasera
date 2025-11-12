
'use server';
import { consultWithChikaFlow } from './consult-flow';
import type { AppConsultantInput, AppConsultantOutput } from './consult-schemas';

export async function consultWithChika(
  input: AppConsultantInput
): Promise<AppConsultantOutput> {
  return consultWithChikaFlow(input);
}

export type { AppConsultantInput, AppConsultantOutput };
