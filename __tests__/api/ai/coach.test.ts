import { POST } from '@/app/api/ai/coach/route';
import { createMockCoachingResponse } from '../../helpers/mock-openai';

let mockUser: any = { id: 'test-user-123' };
let mockAuthError: any = null;
let mockTierAllowed = true;
let mockTierError: string | null = null;
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
    error: mockTierError,
  })),
  createServerClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue({ data: [], error: null }),
    })),
  })),
}));

jest.mock('@/lib/rate-limit', () => ({
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
                  content: JSON.stringify(mockOpenAIResponse || createMockCoachingResponse()),
                },
              },
            ],
          };
        }),
      },
    },
  })),
  COACHING_SYSTEM_PROMPT: 'Mock coaching prompt',
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

function createValidCoachRequest(overrides: any = {}) {
  return {
    transcript_chunk: 'Customer said they are interested in the product pricing.',
    context: {
      lead_name: 'Kim Chulsoo',
      lead_company: 'ABC Corp',
      meeting_topic: 'Product demo',
      current_score: 75,
    },
    ...overrides,
  };
}

describe('POST /api/ai/coach', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'test-user-123' };
    mockAuthError = null;
    mockTierAllowed = true;
    mockTierError = null;
    mockOpenAIResponse = null;
    mockOpenAIShouldFail = false;
    mockOpenAIErrorMessage = 'OpenAI error';
    mockRecordUsageCalled = false;
  });

  describe('Authentication (401)', () => {
    it('should return 401 when no user is authenticated', async () => {
      mockUser = null;
      mockAuthError = { message: 'Invalid token' };

      const request = createMockRequest(createValidCoachRequest());
      const response = await POST(request as any);

      expect(response.status).toBe(401);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('AUTH_ERROR');
    });
  });

  describe('Tier Check (403)', () => {
    it('should return 403 when user tier is not Pro or Business', async () => {
      mockTierAllowed = false;
      mockTierError = 'Pro tier required';

      const request = createMockRequest(createValidCoachRequest());
      const response = await POST(request as any);

      expect(response.status).toBe(403);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('TIER_ERROR');
      expect(response.data.error.message).toContain('Pro or Business');
    });
  });

  describe('Validation (400)', () => {
    it('should return 400 when transcript_chunk is missing', async () => {
      const request = createMockRequest({
        context: { lead_name: 'Kim' },
      });

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when transcript_chunk is empty', async () => {
      const request = createMockRequest({
        transcript_chunk: '',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      expect(response.data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when transcript_chunk exceeds max length', async () => {
      const request = createMockRequest({
        transcript_chunk: 'a'.repeat(5001),
      });

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      expect(response.data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when current_score is out of range', async () => {
      const request = createMockRequest({
        transcript_chunk: 'Valid transcript chunk here',
        context: {
          current_score: 150,
        },
      });

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      expect(response.data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Success (200)', () => {
    it('should return 200 with coaching tip on success', async () => {
      const mockCoaching = createMockCoachingResponse();
      mockOpenAIResponse = mockCoaching;

      const request = createMockRequest(createValidCoachRequest());
      const response = await POST(request as any);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toBeDefined();
      expect(response.data.data.tip).toBeDefined();
      expect(response.data.data.category).toBeDefined();
      expect(response.data.data.priority).toBeDefined();
    });

    it('should return null data when AI returns category "none"', async () => {
      mockOpenAIResponse = {
        tip: null,
        category: 'none',
        priority: 'low',
      };

      const request = createMockRequest(createValidCoachRequest());
      const response = await POST(request as any);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toBeNull();
    });

    it('should return null data when AI returns no tip', async () => {
      mockOpenAIResponse = {
        category: 'information',
        priority: 'medium',
      };

      const request = createMockRequest(createValidCoachRequest());
      const response = await POST(request as any);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toBeNull();
    });

    it('should work without context (context is optional)', async () => {
      mockOpenAIResponse = createMockCoachingResponse();

      const request = createMockRequest({
        transcript_chunk: 'Customer mentioned they need better reporting tools.',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it('should record usage after successful coaching tip', async () => {
      mockOpenAIResponse = createMockCoachingResponse();

      const request = createMockRequest(createValidCoachRequest());
      await POST(request as any);

      expect(mockRecordUsageCalled).toBe(true);
    });

    it('should NOT record usage when returning null data', async () => {
      mockOpenAIResponse = { category: 'none' };

      const request = createMockRequest(createValidCoachRequest());
      await POST(request as any);

      expect(mockRecordUsageCalled).toBe(false);
    });
  });

  describe('Graceful Error Handling', () => {
    it('should return success with null data when OpenAI fails', async () => {
      mockOpenAIShouldFail = true;
      mockOpenAIErrorMessage = 'OpenAI connection failed';

      const request = createMockRequest(createValidCoachRequest());
      const response = await POST(request as any);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toBeNull();
    });

    it('should return success with null data when AI returns invalid JSON', async () => {
      const { getOpenAIClient } = require('@/lib/openai');
      getOpenAIClient.mockReturnValueOnce({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValueOnce({
              choices: [{ message: { content: 'invalid json response' } }],
            }),
          },
        },
      });

      const request = createMockRequest(createValidCoachRequest());
      const response = await POST(request as any);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toBeNull();
    });

    it('should return success with null data when AI returns no content', async () => {
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

      const request = createMockRequest(createValidCoachRequest());
      const response = await POST(request as any);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toBeNull();
    });
  });

  describe('Response Format Compliance', () => {
    it('should return response in standard format on success with tip', async () => {
      mockOpenAIResponse = createMockCoachingResponse();

      const request = createMockRequest(createValidCoachRequest());
      const response = await POST(request as any);

      expect(response.data).toHaveProperty('success', true);
      expect(response.data).toHaveProperty('data');
      expect(response.data.data).toHaveProperty('tip');
      expect(response.data.data).toHaveProperty('category');
      expect(response.data.data).toHaveProperty('priority');
    });

    it('should return response in standard format on success without tip', async () => {
      mockOpenAIResponse = { category: 'none' };

      const request = createMockRequest(createValidCoachRequest());
      const response = await POST(request as any);

      expect(response.data).toHaveProperty('success', true);
      expect(response.data.data).toBeNull();
    });

    it('should return response in standard format on auth error', async () => {
      mockUser = null;

      const request = createMockRequest(createValidCoachRequest());
      const response = await POST(request as any);

      expect(response.data).toHaveProperty('success', false);
      expect(response.data).toHaveProperty('error');
      expect(response.data.error).toHaveProperty('message');
      expect(response.data.error).toHaveProperty('code');
    });
  });
});
