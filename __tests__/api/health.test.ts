import { GET as healthGET } from '@/app/api/health/route';
import { GET as openaiHealthGET } from '@/app/api/health/openai/route';

let mockSupabaseClient: any;

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
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}));

// Mock OpenAI
jest.mock('@/lib/openai', () => ({
  getOpenAIClient: jest.fn(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: 'OK',
              },
            },
          ],
          model: 'gpt-4o-mini',
        }),
      },
    },
  })),
}));

describe('Health Check API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'test-key';
    process.env.OPENAI_API_KEY = 'sk-test-key';
    process.env.ASSEMBLY_AI_API_KEY = 'test-assembly-key';
    process.env.AWS_ACCESS_KEY_ID = 'test-aws-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-aws-secret';
    process.env.AWS_S3_BUCKET = 'test-bucket';

    mockSupabaseClient = {
      from: jest.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'test' },
              error: null,
            }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    };
  });

  describe('GET /api/health', () => {
    it('should return healthy status when all services are configured', async () => {
      const mockRequest = new Request('http://localhost:3000/api/health');

      const response = await healthGET(mockRequest as any);

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status', 'healthy');
      expect(response.data).toHaveProperty('timestamp');
      expect(response.data).toHaveProperty('latency');
      expect(response.data).toHaveProperty('checks');
      expect(response.data.checks).toHaveProperty('database');
      expect(response.data.checks).toHaveProperty('ai_services');
      expect(response.data.checks).toHaveProperty('storage');
    });

    it('should return degraded status when database is not configured', async () => {
      delete process.env.SUPABASE_URL;

      const mockRequest = new Request('http://localhost:3000/api/health');

      const response = await healthGET(mockRequest as any);

      expect(response.status).toBe(503);
      expect(response.data).toHaveProperty('status', 'degraded');
      expect(response.data.checks.database.status).toBe('error');
    });

    it('should return degraded status when AI services are not configured', async () => {
      delete process.env.OPENAI_API_KEY;

      const mockRequest = new Request('http://localhost:3000/api/health');

      const response = await healthGET(mockRequest as any);

      expect(response.status).toBe(503);
      expect(response.data).toHaveProperty('status', 'degraded');
      expect(response.data.checks.ai_services.status).toBe('error');
    });

    it('should return degraded status when storage is not configured', async () => {
      delete process.env.AWS_S3_BUCKET;

      const mockRequest = new Request('http://localhost:3000/api/health');

      const response = await healthGET(mockRequest as any);

      expect(response.status).toBe(503);
      expect(response.data).toHaveProperty('status', 'degraded');
      expect(response.data.checks.storage.status).toBe('error');
    });

    it('should include latency information in response', async () => {
      const mockRequest = new Request('http://localhost:3000/api/health');

      const response = await healthGET(mockRequest as any);

      expect(response.data).toHaveProperty('latency');
      expect(typeof response.data.latency).toBe('number');
      expect(response.data.latency).toBeGreaterThanOrEqual(0);
    });

    it('should include database latency when database is healthy', async () => {
      const mockRequest = new Request('http://localhost:3000/api/health');

      const response = await healthGET(mockRequest as any);

      expect(response.data.checks.database).toHaveProperty('latency');
      expect(typeof response.data.checks.database.latency).toBe('number');
    });
  });

  describe('GET /api/health/openai', () => {
    it('should return healthy status when OpenAI connection succeeds', async () => {
      const mockRequest = new Request('http://localhost:3000/api/health/openai');

      const response = await openaiHealthGET(mockRequest as any);

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success', true);
      expect(response.data).toHaveProperty('status', 'healthy');
      expect(response.data).toHaveProperty('latency_ms');
      expect(response.data).toHaveProperty('method', 'sdk');
      expect(response.data).toHaveProperty('response');
      expect(response.data).toHaveProperty('model', 'gpt-4o-mini');
      expect(response.data).toHaveProperty('debug');
    });

    it('should include debug information with API key status', async () => {
      const mockRequest = new Request('http://localhost:3000/api/health/openai');

      const response = await openaiHealthGET(mockRequest as any);

      expect(response.data.debug).toHaveProperty('apiKeySet', true);
      expect(response.data.debug).toHaveProperty('apiKeyLength');
      expect(response.data.debug).toHaveProperty('apiKeyPrefix');
      expect(response.data.debug.apiKeyLength).toBeGreaterThan(0);
    });

    it('should indicate missing API key in debug info', async () => {
      delete process.env.OPENAI_API_KEY;

      const mockRequest = new Request('http://localhost:3000/api/health/openai');

      const response = await openaiHealthGET(mockRequest as any);

      expect(response.data.debug.apiKeySet).toBe(false);
      expect(response.data.debug.apiKeyPrefix).toBe('NOT_SET');
    });

    it('should include latency measurement in milliseconds', async () => {
      const mockRequest = new Request('http://localhost:3000/api/health/openai');

      const response = await openaiHealthGET(mockRequest as any);

      expect(response.data).toHaveProperty('latency_ms');
      expect(typeof response.data.latency_ms).toBe('number');
      expect(response.data.latency_ms).toBeGreaterThanOrEqual(0);
    });

    it('should handle OpenAI SDK errors gracefully', async () => {
      const { getOpenAIClient } = require('@/lib/openai');
      getOpenAIClient.mockReturnValueOnce({
        chat: {
          completions: {
            create: jest.fn().mockRejectedValueOnce(
              new Error('API Error: Invalid API key')
            ),
          },
        },
      });

      const mockRequest = new Request('http://localhost:3000/api/health/openai');

      const response = await openaiHealthGET(mockRequest as any);

      expect(response.status).toBe(500);
      expect(response.data).toHaveProperty('success', false);
      expect(response.data).toHaveProperty('status', 'unhealthy');
      expect(response.data).toHaveProperty('error');
      expect(response.data.error).toHaveProperty('message');
      expect(response.data.error).toHaveProperty('code');
    });

    it('should support fetch method when query parameter is set', async () => {
      const mockRequest = new Request(
        'http://localhost:3000/api/health/openai?fetch=true'
      );

      // Mock global fetch for this test
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({
          choices: [
            {
              message: {
                content: 'OK',
              },
            },
          ],
          model: 'gpt-4o-mini',
        }),
      });

      const response = await openaiHealthGET(mockRequest as any);

      expect(response.data).toHaveProperty('method', 'fetch');
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should return error when fetch method fails', async () => {
      const mockRequest = new Request(
        'http://localhost:3000/api/health/openai?fetch=true'
      );

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: jest.fn().mockResolvedValueOnce({
          error: {
            message: 'Unauthorized',
            code: 'invalid_api_key',
          },
        }),
      });

      const response = await openaiHealthGET(mockRequest as any);

      expect(response.status).toBe(500);
      expect(response.data).toHaveProperty('success', false);
      expect(response.data).toHaveProperty('status', 'unhealthy');
      expect(response.data).toHaveProperty('method', 'fetch');
    });
  });

  describe('Response Format Compliance', () => {
    it('health endpoint should follow standard response format', async () => {
      const mockRequest = new Request('http://localhost:3000/api/health');

      const response = await healthGET(mockRequest as any);

      expect(response.data).toHaveProperty('status');
      expect(response.data).toHaveProperty('timestamp');
      expect(response.data).toHaveProperty('checks');
    });

    it('openai health endpoint should follow standard response format', async () => {
      const mockRequest = new Request('http://localhost:3000/api/health/openai');

      const response = await openaiHealthGET(mockRequest as any);

      expect(response.data).toHaveProperty('success');
      expect(typeof response.data.success).toBe('boolean');

      if (response.data.success) {
        expect(response.data).toHaveProperty('status', 'healthy');
        expect(response.data).toHaveProperty('response');
      } else {
        expect(response.data).toHaveProperty('status', 'unhealthy');
        expect(response.data).toHaveProperty('error');
        expect(response.data.error).toHaveProperty('message');
      }
    });
  });

  describe('HTTP Status Codes', () => {
    it('should return 200 for healthy health check', async () => {
      const mockRequest = new Request('http://localhost:3000/api/health');

      const response = await healthGET(mockRequest as any);

      expect(response.status).toBe(200);
    });

    it('should return 503 for degraded health check', async () => {
      delete process.env.SUPABASE_URL;

      const mockRequest = new Request('http://localhost:3000/api/health');

      const response = await healthGET(mockRequest as any);

      expect(response.status).toBe(503);
    });

    it('should return 200 for successful OpenAI health check', async () => {
      const mockRequest = new Request('http://localhost:3000/api/health/openai');

      const response = await openaiHealthGET(mockRequest as any);

      expect(response.status).toBe(200);
    });

    it('should return 500 for failed OpenAI health check', async () => {
      const { getOpenAIClient } = require('@/lib/openai');
      getOpenAIClient.mockReturnValueOnce({
        chat: {
          completions: {
            create: jest.fn().mockRejectedValueOnce(new Error('Connection failed')),
          },
        },
      });

      const mockRequest = new Request('http://localhost:3000/api/health/openai');

      const response = await openaiHealthGET(mockRequest as any);

      expect(response.status).toBe(500);
    });
  });
});
