import { ocrResponseSchema, OcrResponse } from '@/lib/schemas/ocr-response';

describe('ocrResponseSchema', () => {
  const validOcrResponse = {
    name: { value: '장동재', confidence: 0.95 },
    company: { value: 'Listory Inc', confidence: 0.92 },
    position: { value: 'CEO', confidence: 0.88 },
    department: { value: 'Executive', confidence: 0.85 },
    email: { value: 'dongjai@listory.com', confidence: 0.99 },
    phone: { value: '010-1234-5678', confidence: 0.97 },
    landline: { value: '02-1234-5678', confidence: 0.90 },
    fax: { value: null, confidence: 0 },
    address: { value: 'Seoul, Korea', confidence: 0.80 },
    website: { value: 'listory.com', confidence: 0.93 },
    needs_review: false,
    detected_languages: ['ko', 'en'],
  };

  it('should validate a complete OCR response', () => {
    const result = ocrResponseSchema.safeParse(validOcrResponse);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validOcrResponse);
    }
  });

  it('should validate with all fields null', () => {
    const response = {
      name: { value: null, confidence: 0 },
      company: { value: null, confidence: 0 },
      position: { value: null, confidence: 0 },
      department: { value: null, confidence: 0 },
      email: { value: null, confidence: 0 },
      phone: { value: null, confidence: 0 },
      landline: { value: null, confidence: 0 },
      fax: { value: null, confidence: 0 },
      address: { value: null, confidence: 0 },
      website: { value: null, confidence: 0 },
      needs_review: true,
      detected_languages: [],
    };
    const result = ocrResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it('should validate with single detected language', () => {
    const response = { ...validOcrResponse, detected_languages: ['ko'] };
    const result = ocrResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it('should validate with multiple detected languages', () => {
    const response = { ...validOcrResponse, detected_languages: ['ko', 'en', 'ja', 'zh'] };
    const result = ocrResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it('should reject invalid language code', () => {
    const response = { ...validOcrResponse, detected_languages: ['ko', 'fr'] };
    const result = ocrResponseSchema.safeParse(response);
    expect(result.success).toBe(false);
  });

  it('should reject confidence score > 1', () => {
    const response = {
      ...validOcrResponse,
      name: { value: '장동재', confidence: 1.5 },
    };
    const result = ocrResponseSchema.safeParse(response);
    expect(result.success).toBe(false);
  });

  it('should reject confidence score < 0', () => {
    const response = {
      ...validOcrResponse,
      email: { value: 'test@example.com', confidence: -0.1 },
    };
    const result = ocrResponseSchema.safeParse(response);
    expect(result.success).toBe(false);
  });

  it('should reject missing required field', () => {
    const { phone, ...incomplete } = validOcrResponse;
    const result = ocrResponseSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it('should reject invalid needs_review type', () => {
    const response = { ...validOcrResponse, needs_review: 'yes' };
    const result = ocrResponseSchema.safeParse(response);
    expect(result.success).toBe(false);
  });

  it('should infer correct TypeScript type', () => {
    const response: OcrResponse = validOcrResponse;
    expect(response.name.value).toBe('장동재');
    expect(response.needs_review).toBe(false);
    expect(response.detected_languages).toContain('ko');
  });

  it('should validate high confidence scores', () => {
    const response = {
      ...validOcrResponse,
      name: { value: '장동재', confidence: 1.0 },
      email: { value: 'test@example.com', confidence: 1.0 },
    };
    const result = ocrResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it('should validate zero confidence scores', () => {
    const response = {
      ...validOcrResponse,
      fax: { value: null, confidence: 0.0 },
    };
    const result = ocrResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });
});
