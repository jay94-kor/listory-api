import { z } from 'zod';

// Action plan item schema
const actionPlanItemSchema = z.object({
  title: z.string(),
  type: z.enum(['email', 'call', 'meeting', 'document', 'material', 'research', 'internal', 'other']),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  due_in_days: z.number(),
  description: z.string(),
});

// AI analysis response schema with passthrough for flexibility
export const analysisResponseSchema = z
  .object({
    summary: z.string(),
    needs: z.array(z.string()),
    required_materials: z.array(z.string()),
    material_sending_info: z.string().optional(),
    positive_signals: z.array(z.string()),
    negative_signals: z.array(z.string()),
    negotiation_tip: z.string(),
    tmi_info: z.array(z.string()),
    small_talk_topics: z.array(z.string()),
    suggested_score: z.number().min(0).max(100),
    suggested_status: z.enum(['hot', 'warm', 'cold']),
    suggested_followup_date: z.string(),
    action_plan: z.array(actionPlanItemSchema),
  })
  .passthrough();

// Export TypeScript type inferred from schema
export type AnalysisResponse = z.infer<typeof analysisResponseSchema>;
