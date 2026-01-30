import { z } from 'zod';

// Coaching response schema with nullable support
export const coachingResponseSchema = z
  .object({
    tip: z.string().min(10).max(200),
    category: z.enum(['objection_handling', 'closing', 'rapport', 'information', 'none']),
    priority: z.enum(['high', 'medium', 'low']),
    knowledge_base_reference: z.string().optional(),
    tip_hash: z.string(),
    meeting_stage: z.enum(['opening', 'discovery', 'presentation', 'negotiation', 'closing']).optional(),
  })
  .nullable();

// Export TypeScript type inferred from schema
export type CoachingResponse = z.infer<typeof coachingResponseSchema>;
