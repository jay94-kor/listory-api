import { z } from 'zod';

// Email response schema
export const emailResponseSchema = z
  .object({
    subject: z.string().min(1, 'Subject cannot be empty'),
    body: z.string().min(10, 'Body must be at least 10 characters'),
    tone_used: z.enum(['formal', 'casual', 'friendly']),
    context_references: z.array(z.string()).optional(),
  })
  .passthrough();

// Export TypeScript type inferred from schema
export type EmailResponse = z.infer<typeof emailResponseSchema>;
