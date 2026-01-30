import { z } from 'zod';

// OCR field schema with confidence score
const ocrFieldSchema = z.object({
  value: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

// OCR response schema
export const ocrResponseSchema = z.object({
  name: ocrFieldSchema,
  company: ocrFieldSchema,
  position: ocrFieldSchema,
  department: ocrFieldSchema,
  email: ocrFieldSchema,
  phone: ocrFieldSchema,
  landline: ocrFieldSchema,
  fax: ocrFieldSchema,
  address: ocrFieldSchema,
  website: ocrFieldSchema,
  needs_review: z.boolean(),
  detected_languages: z.array(z.enum(['ko', 'en', 'ja', 'zh'])),
});

// Export TypeScript type inferred from schema
export type OcrResponse = z.infer<typeof ocrResponseSchema>;
