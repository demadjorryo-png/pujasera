
import { z } from 'genkit';

export const AppConsultantInputSchema = z.object({
  conversationHistory: z.string().describe('The history of the conversation so far.'),
  userInput: z.string().describe('The latest input from the user.'),
});
export type AppConsultantInput = z.infer<typeof AppConsultantInputSchema>;

export const AppConsultantOutputSchema = z.object({
  response: z.string().describe('Chika AI\'s response to the user.'),
  shouldEscalateToAdmin: z.boolean().describe('Set to true if the conversation has reached a summary/escalation point.'),
  escalationMessage: z.string().optional().describe('A concise summary message formatted for WhatsApp, to be sent to the admin group if shouldEscalateToAdmin is true.'),
});
export type AppConsultantOutput = z.infer<typeof AppConsultantOutputSchema>;
