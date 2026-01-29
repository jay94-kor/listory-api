import { POST } from '@/app/api/ai/email/route';
import { createMockEmailResponse } from '../../helpers/mock-openai';

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
                  content: JSON.stringify(mockOpenAIResponse || createMockEmailResponse()),
                },
              },
            ],
          };
        }),
      },
    },
  })),
  EMAIL_SYSTEM_PROMPT: 'Mock email prompt',
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

function createValidEmailRequest(overrides: any = {}) {
  return {
    lead: {
      name: 'Kim Chulsoo',
      company: 'ABC Corp',
      position: 'Director',
      email: 'kim@abc.com',
      ...overrides.lead,
    },
    type: 'followup',
    tone: 'formal',
    sender_name: 'Hong Gildong',
    sender_company: 'Listory Inc',
    sender_position: 'Sales Manager',
    ...overrides,
  };
}

describe('POST /api/ai/email', () => {
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

      const request = createMockRequest(createValidEmailRequest());
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

      const request = createMockRequest(createValidEmailRequest());
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

      const request = createMockRequest(createValidEmailRequest());
      const response = await POST(request as any);

      expect(response.status).toBe(429);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  describe('Validation (400)', () => {
    it('should return 400 when lead is missing', async () => {
      const request = createMockRequest({
        type: 'followup',
        tone: 'formal',
        sender_name: 'Hong Gildong',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when lead.name is missing', async () => {
      const request = createMockRequest({
        lead: { company: 'ABC Corp' },
        type: 'followup',
        tone: 'formal',
        sender_name: 'Hong Gildong',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      expect(response.data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when type is invalid', async () => {
      const request = createMockRequest(createValidEmailRequest({ type: 'invalid_type' }));

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      expect(response.data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when tone is invalid', async () => {
      const request = createMockRequest(createValidEmailRequest({ tone: 'super_casual' }));

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      expect(response.data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when sender_name is missing', async () => {
      const request = createMockRequest({
        lead: { name: 'Kim', company: 'ABC' },
        type: 'followup',
        tone: 'formal',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      expect(response.data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Success (200)', () => {
    it('should return 200 with email data on success', async () => {
      const mockEmail = createMockEmailResponse();
      mockOpenAIResponse = mockEmail;

      const request = createMockRequest(createValidEmailRequest());
      const response = await POST(request as any);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toBeDefined();
      expect(response.data.data.subject).toBeDefined();
      expect(response.data.data.body).toBeDefined();
      expect(response.data.data.type).toBe('followup');
      expect(response.data.data.tone).toBe('formal');
    });

    it('should handle all email types correctly', async () => {
      mockOpenAIResponse = createMockEmailResponse();
      const types = ['followup', 'introduction', 'thank_you', 'proposal', 'material_send'];

      for (const type of types) {
        const request = createMockRequest(createValidEmailRequest({ type }));
        const response = await POST(request as any);

        expect(response.status).toBe(200);
        expect(response.data.data.type).toBe(type);
      }
    });

    it('should handle all tone options correctly', async () => {
      mockOpenAIResponse = createMockEmailResponse();
      const tones = ['formal', 'casual', 'friendly'];

      for (const tone of tones) {
        const request = createMockRequest(createValidEmailRequest({ tone }));
        const response = await POST(request as any);

        expect(response.status).toBe(200);
        expect(response.data.data.tone).toBe(tone);
      }
    });

    it('should process meeting summary and needs correctly', async () => {
      mockOpenAIResponse = createMockEmailResponse();

      const request = createMockRequest(createValidEmailRequest({
        lead: {
          name: 'Kim Chulsoo',
          company: 'ABC Corp',
          meeting_summary: 'Discussed data analysis automation',
          needs: ['Real-time dashboard', 'Cost reduction'],
          action_plan: [{ title: 'Send brochure', type: 'email' }],
        },
      }));

      const response = await POST(request as any);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it('should handle custom instructions', async () => {
      mockOpenAIResponse = createMockEmailResponse();

      const request = createMockRequest(createValidEmailRequest({
        custom_instructions: 'Mention the upcoming conference',
      }));

      const response = await POST(request as any);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it('should record usage after successful email generation', async () => {
      mockOpenAIResponse = createMockEmailResponse();

      const request = createMockRequest(createValidEmailRequest());
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

      const request = createMockRequest(createValidEmailRequest());
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
              choices: [{ message: { content: 'not json' } }],
            }),
          },
        },
      });

      const request = createMockRequest(createValidEmailRequest());
      const response = await POST(request as any);

      expect(response.status).toBe(500);
      expect(response.data.error.code).toBe('PARSE_ERROR');
    });

    it('should return 429 when OpenAI rate limit is hit', async () => {
      mockOpenAIShouldFail = true;
      mockOpenAIErrorMessage = 'rate_limit exceeded';

      const request = createMockRequest(createValidEmailRequest());
      const response = await POST(request as any);

      expect(response.status).toBe(429);
      expect(response.data.error.code).toBe('RATE_LIMIT');
    });
  });

  describe('Response Format Compliance', () => {
    it('should return response in standard format on success', async () => {
      mockOpenAIResponse = createMockEmailResponse();

      const request = createMockRequest(createValidEmailRequest());
      const response = await POST(request as any);

      expect(response.data).toHaveProperty('success', true);
      expect(response.data).toHaveProperty('data');
      expect(response.data.data).toHaveProperty('subject');
      expect(response.data.data).toHaveProperty('body');
      expect(response.data.data).toHaveProperty('type');
      expect(response.data.data).toHaveProperty('tone');
    });

    it('should return response in standard format on error', async () => {
      mockUser = null;

      const request = createMockRequest(createValidEmailRequest());
      const response = await POST(request as any);

      expect(response.data).toHaveProperty('success', false);
      expect(response.data).toHaveProperty('error');
      expect(response.data.error).toHaveProperty('message');
      expect(response.data.error).toHaveProperty('code');
    });
  });
});
