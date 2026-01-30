import { POST } from '@/app/api/ai/ocr/route';
import { createMockOCRResponse } from '../../helpers/mock-openai';

let mockUser: any = { id: 'test-user-123' };
let mockAuthError: any = null;
let mockTierAllowed = true;
let mockTierError: string | null = null;
let mockProfile: any = { tier: 'pro' };
let mockRateLimitAllowed = true;
let mockRateLimitLimit = 50;
let mockOpenAIResponse: any = null;
let mockOpenAIShouldFail = false;
let mockOpenAIErrorMessage = 'OpenAI error';
let mockRecordUsageCalled = false;
let mockPresignedUrl = 'https://bucket.s3.amazonaws.com/presigned-url';

jest.mock('next/server', () => ({
  NextRequest: jest.fn(),
  NextResponse: {
    json: (data: any, options?: any) => ({
      json: async () => data,
      status: options?.status || 200,
      data,
      options,
    }),
  },
}));

jest.mock('@/lib/supabase', () => ({
  getAuthenticatedUser: jest.fn(async () => ({
    user: mockUser,
    error: mockAuthError,
  })),
  checkUserTier: jest.fn(async () => ({
    allowed: mockTierAllowed,
    profile: mockProfile,
    error: mockTierError,
  })),
  createServerClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      count: jest.fn().mockResolvedValue({ count: 5, error: null }),
      insert: jest.fn().mockResolvedValue({ data: [], error: null }),
    })),
  })),
}));

jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => ({
    allowed: mockRateLimitAllowed,
    remaining: 10,
    limit: mockRateLimitLimit,
  })),
  recordUsage: jest.fn(async () => {
    mockRecordUsageCalled = true;
    return { success: true };
  }),
}));

jest.mock('@/lib/s3', () => ({
  generateDownloadUrl: jest.fn(async () => mockPresignedUrl),
}));

jest.mock('@/lib/openai', () => ({
  getOpenAIClient: jest.fn(() => ({
    chat: {
      completions: {
        create: jest.fn(async () => {
          if (mockOpenAIShouldFail) {
            throw new Error(mockOpenAIErrorMessage);
          }
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify(mockOpenAIResponse || createMockOCRResponse()),
                },
              },
            ],
          };
        }),
      },
    },
  })),
  OCR_SYSTEM_PROMPT: 'Mock OCR prompt',
}));

function createMockRequest(body: any = {}) {
  return {
    headers: {
      get: (name: string) => {
        if (name === 'authorization') return 'Bearer valid-token';
        if (name === 'content-type') return 'application/json';
        return null;
      },
    },
    json: async () => body,
  };
}

describe('POST /api/ai/ocr', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'test-user-123' };
    mockAuthError = null;
    mockTierAllowed = true;
    mockTierError = null;
    mockProfile = { tier: 'pro' };
    mockRateLimitAllowed = true;
    mockRateLimitLimit = 50;
    mockOpenAIResponse = null;
    mockOpenAIShouldFail = false;
    mockOpenAIErrorMessage = 'OpenAI error';
    mockRecordUsageCalled = false;
  });

  describe('Authentication (401)', () => {
    it('should return 401 when no user is authenticated', async () => {
      mockUser = null;
      mockAuthError = { message: 'Invalid token' };

      const request = createMockRequest({
        image_url: 'https://example.com/card.jpg',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(401);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('AUTH_ERROR');
    });
  });

  describe('Tier Check (403)', () => {
    it('should return 403 when user tier is not allowed', async () => {
      mockTierAllowed = false;
      mockTierError = 'Subscription required';

      const request = createMockRequest({
        image_url: 'https://example.com/card.jpg',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(403);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('TIER_ERROR');
    });
  });

  describe('Rate Limiting (429)', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      mockRateLimitAllowed = false;
      mockRateLimitLimit = 10;

      const request = createMockRequest({
        image_url: 'https://example.com/card.jpg',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(429);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  describe('Validation (400)', () => {
    it('should return 400 when image_url is missing', async () => {
      const request = createMockRequest({});

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when image_url is not a valid URL', async () => {
      const request = createMockRequest({
        image_url: 'not-a-valid-url',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      expect(response.data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Success (200)', () => {
    it('should return 200 with OCR data on success', async () => {
      const mockOCR = createMockOCRResponse();
      mockOpenAIResponse = mockOCR;

      const request = createMockRequest({
        image_url: 'https://example.com/business-card.jpg',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toBeDefined();
      expect(response.data.data.name).toBeDefined();
      expect(response.data.data.name.value).toBe('김철수');
      expect(response.data.data.name.confidence).toBe(0.95);
      expect(response.data.data.company).toBeDefined();
      expect(response.data.data.needs_review).toBeDefined();
      expect(response.data.data.detected_languages).toBeDefined();
    });

    it('should handle S3 URLs and generate presigned URL', async () => {
      const mockOCR = createMockOCRResponse();
      mockOpenAIResponse = mockOCR;

      const request = createMockRequest({
        image_url: 'https://bucket.s3.ap-northeast-2.amazonaws.com/cards/test.jpg',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it('should record usage after successful OCR', async () => {
      mockOpenAIResponse = createMockOCRResponse();

      const request = createMockRequest({
        image_url: 'https://example.com/business-card.jpg',
      });

      await POST(request as any);

      expect(mockRecordUsageCalled).toBe(true);
    });
  });

  describe('AI Error Handling (500)', () => {
    it('should return 500 when OpenAI returns no content', async () => {
      const { getOpenAIClient } = require('@/lib/openai');
      getOpenAIClient.mockReturnValueOnce({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValueOnce({
              choices: [{ message: { content: null } }],
            }),
          },
        },
      });

      const request = createMockRequest({
        image_url: 'https://example.com/business-card.jpg',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(500);
      expect(response.data.error.code).toBe('AI_ERROR');
    });

    it('should return 500 when OpenAI returns invalid JSON', async () => {
      const { getOpenAIClient } = require('@/lib/openai');
      getOpenAIClient.mockReturnValueOnce({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValueOnce({
              choices: [{ message: { content: 'invalid json' } }],
            }),
          },
        },
      });

      const request = createMockRequest({
        image_url: 'https://example.com/business-card.jpg',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(500);
      expect(response.data.error.code).toBe('PARSE_ERROR');
    });

    it('should return 429 when OpenAI rate limit is hit', async () => {
      mockOpenAIShouldFail = true;
      mockOpenAIErrorMessage = 'rate_limit exceeded';

      const request = createMockRequest({
        image_url: 'https://example.com/business-card.jpg',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(429);
      expect(response.data.error.code).toBe('RATE_LIMIT');
    });

    it('should return 400 when image cannot be processed', async () => {
      mockOpenAIShouldFail = true;
      mockOpenAIErrorMessage = 'Could not process image';

      const request = createMockRequest({
        image_url: 'https://example.com/business-card.jpg',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      expect(response.data.error.code).toBe('IMAGE_ERROR');
    });
  });

  describe('Response Format Compliance', () => {
    it('should return response in standard format', async () => {
      mockOpenAIResponse = createMockOCRResponse();

      const request = createMockRequest({
        image_url: 'https://example.com/business-card.jpg',
      });

      const response = await POST(request as any);

      expect(response.data).toHaveProperty('success', true);
      expect(response.data).toHaveProperty('data');
      expect(response.data.data).toHaveProperty('needs_review');
      expect(response.data.data).toHaveProperty('detected_languages');
      expect(response.data.data.name).toHaveProperty('value');
      expect(response.data.data.name).toHaveProperty('confidence');
    });
  });
});
