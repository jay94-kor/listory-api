import { POST } from '@/app/api/ai/analyze/route';
import { createMockAnalysisResponse } from '../../helpers/mock-openai';

// Mock variables for control
let mockUser: any = { id: 'test-user-123' };
let mockAuthError: any = null;
let mockTierAllowed = true;
let mockTierError: string | null = null;
let mockProfile: any = { tier: 'pro' };
let mockRateLimitAllowed = true;
let mockRateLimitRemaining = 10;
let mockRateLimitLimit = 50;
let mockOpenAIResponse: any = null;
let mockOpenAIShouldFail = false;
let mockOpenAIErrorMessage = 'OpenAI error';
let mockRecordUsageCalled = false;

// Mock Next.js modules
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

// Mock Supabase
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

// Mock rate-limit
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => ({
    allowed: mockRateLimitAllowed,
    remaining: mockRateLimitRemaining,
    limit: mockRateLimitLimit,
  })),
  recordUsage: jest.fn(async () => {
    mockRecordUsageCalled = true;
    return { success: true };
  }),
}));

// Mock OpenAI
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
                  content: JSON.stringify(mockOpenAIResponse || createMockAnalysisResponse()),
                },
              },
            ],
          };
        }),
      },
    },
  })),
  ANALYSIS_SYSTEM_PROMPT: 'Mock analysis prompt',
}));

function createMockRequest(body: any = {}, token: string = 'valid-token') {
  return {
    headers: {
      get: (name: string) => {
        if (name === 'authorization') return `Bearer ${token}`;
        if (name === 'content-type') return 'application/json';
        return null;
      },
    },
    json: async () => body,
  };
}

describe('POST /api/ai/analyze', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock state
    mockUser = { id: 'test-user-123' };
    mockAuthError = null;
    mockTierAllowed = true;
    mockTierError = null;
    mockProfile = { tier: 'pro' };
    mockRateLimitAllowed = true;
    mockRateLimitRemaining = 10;
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
        transcript: 'This is a test meeting transcript with enough content.',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(401);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('AUTH_ERROR');
    });

    it('should return 401 when authentication error occurs', async () => {
      mockUser = null;
      mockAuthError = { message: 'Token expired' };

      const request = createMockRequest({
        transcript: 'This is a test meeting transcript with enough content.',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(401);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('AUTH_ERROR');
      expect(response.data.error.message).toBe('Unauthorized');
    });
  });

  describe('Tier Check (403)', () => {
    it('should return 403 when user tier is not allowed', async () => {
      mockTierAllowed = false;
      mockTierError = 'Subscription required';

      const request = createMockRequest({
        transcript: 'This is a test meeting transcript with enough content.',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(403);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('TIER_ERROR');
    });

    it('should return 403 with custom tier error message', async () => {
      mockTierAllowed = false;
      mockTierError = 'Please upgrade to Pro plan';

      const request = createMockRequest({
        transcript: 'This is a test meeting transcript with enough content.',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(403);
      expect(response.data.error.message).toBe('Please upgrade to Pro plan');
    });
  });

  describe('Rate Limiting (429)', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      mockRateLimitAllowed = false;
      mockRateLimitRemaining = 0;
      mockRateLimitLimit = 10;

      const request = createMockRequest({
        transcript: 'This is a test meeting transcript with enough content.',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(429);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should include limit info in rate limit error response', async () => {
      mockRateLimitAllowed = false;
      mockRateLimitLimit = 10;

      const request = createMockRequest({
        transcript: 'This is a test meeting transcript with enough content.',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(429);
      expect(response.data.error.remaining).toBe(0);
      expect(response.data.error.limit).toBe(10);
    });
  });

  describe('Validation (400)', () => {
    it('should return 400 when transcript is missing', async () => {
      const request = createMockRequest({});

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when transcript is too short', async () => {
      const request = createMockRequest({
        transcript: 'short',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 with validation details for invalid lead_context', async () => {
      const request = createMockRequest({
        transcript: 'This is a valid transcript with enough content for analysis.',
        lead_context: {
          current_status: 'invalid_status', // Should be 'hot' | 'warm' | 'cold'
        },
      });

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      expect(response.data.error.code).toBe('VALIDATION_ERROR');
      expect(response.data.error.details).toBeDefined();
    });

    it('should return 400 when current_score is out of range', async () => {
      const request = createMockRequest({
        transcript: 'This is a valid transcript with enough content for analysis.',
        lead_context: {
          current_score: 150, // Should be 0-100
        },
      });

      const response = await POST(request as any);

      expect(response.status).toBe(400);
      expect(response.data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Success (200)', () => {
    it('should return 200 with analysis data on success', async () => {
      const mockAnalysis = createMockAnalysisResponse();
      mockOpenAIResponse = mockAnalysis;

      const request = createMockRequest({
        transcript: 'This is a test meeting transcript with enough content for AI analysis.',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toBeDefined();
      expect(response.data.data.summary).toBeDefined();
      expect(response.data.data.needs).toBeInstanceOf(Array);
      expect(response.data.data.action_plan).toBeInstanceOf(Array);
    });

    it('should process lead_context correctly', async () => {
      const mockAnalysis = createMockAnalysisResponse();
      mockOpenAIResponse = mockAnalysis;

      const request = createMockRequest({
        transcript: 'This is a test meeting transcript with enough content for AI analysis.',
        lead_context: {
          name: 'Kim Chulsoo',
          company: 'ABC Corp',
          position: 'Director',
          previous_meetings: 2,
          current_status: 'warm',
          current_score: 70,
        },
      });

      const response = await POST(request as any);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it('should record usage after successful analysis', async () => {
      const mockAnalysis = createMockAnalysisResponse();
      mockOpenAIResponse = mockAnalysis;

      const request = createMockRequest({
        transcript: 'This is a test meeting transcript with enough content for AI analysis.',
      });

      await POST(request as any);

      expect(mockRecordUsageCalled).toBe(true);
    });
  });

  describe('AI Error Handling (500)', () => {
    it('should return 500 when OpenAI returns no content', async () => {
      mockOpenAIResponse = null;
      
      // Override the mock to return empty content
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
        transcript: 'This is a test meeting transcript with enough content for AI analysis.',
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
              choices: [{ message: { content: 'not valid json' } }],
            }),
          },
        },
      });

      const request = createMockRequest({
        transcript: 'This is a test meeting transcript with enough content for AI analysis.',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(500);
      expect(response.data.error.code).toBe('PARSE_ERROR');
    });

    it('should return 500 when OpenAI throws an error', async () => {
      mockOpenAIShouldFail = true;
      mockOpenAIErrorMessage = 'OpenAI API failed';

      const request = createMockRequest({
        transcript: 'This is a test meeting transcript with enough content for AI analysis.',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(500);
      expect(response.data.success).toBe(false);
    });

    it('should return 429 when OpenAI rate limit is hit', async () => {
      mockOpenAIShouldFail = true;
      mockOpenAIErrorMessage = 'rate_limit exceeded';

      const request = createMockRequest({
        transcript: 'This is a test meeting transcript with enough content for AI analysis.',
      });

      const response = await POST(request as any);

      expect(response.status).toBe(429);
      expect(response.data.error.code).toBe('RATE_LIMIT');
    });
  });

  describe('Response Format Compliance', () => {
    it('should return response in standard format on success', async () => {
      const mockAnalysis = createMockAnalysisResponse();
      mockOpenAIResponse = mockAnalysis;

      const request = createMockRequest({
        transcript: 'This is a test meeting transcript with enough content for AI analysis.',
      });

      const response = await POST(request as any);

      expect(response.data).toHaveProperty('success', true);
      expect(response.data).toHaveProperty('data');
      expect(response.data).not.toHaveProperty('error');
    });

    it('should return response in standard format on error', async () => {
      mockUser = null;

      const request = createMockRequest({
        transcript: 'This is a test transcript.',
      });

      const response = await POST(request as any);

      expect(response.data).toHaveProperty('success', false);
      expect(response.data).toHaveProperty('error');
      expect(response.data.error).toHaveProperty('message');
      expect(response.data.error).toHaveProperty('code');
    });
  });
});
