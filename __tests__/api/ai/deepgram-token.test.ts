import { createMockRequest } from '../../helpers/test-utils';
import * as supabase from '@/lib/supabase';

jest.mock('@/lib/supabase');

describe('POST /api/ai/deepgram/token', () => {
  let POST: any;

  beforeAll(async () => {
    const route = await import('@/app/api/ai/deepgram/token/route');
    POST = route.POST;
  });
  const mockUser = {
    id: 'test-user-123',
    email: 'test@example.com',
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should return 401 if user is not authenticated', async () => {
      (supabase.getAuthenticatedUser as jest.Mock).mockResolvedValue({
        user: null,
        error: 'Unauthorized',
      });

      const request = createMockRequest({ body: {} });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('Success', () => {
    beforeEach(() => {
      (supabase.getAuthenticatedUser as jest.Mock).mockResolvedValue({
        user: mockUser,
        error: null,
      });
    });

    it('should return Deepgram API token for authenticated user', async () => {
      const request = createMockRequest({ body: {} });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.token).toBe('mock-deepgram-key');
      expect(data.expiresIn).toBe(10);
    });

    it('should return token with correct expiration time', async () => {
      const request = createMockRequest({ body: {} });
      const response = await POST(request);
      const data = await response.json();

      expect(data.expiresIn).toBe(10);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      (supabase.getAuthenticatedUser as jest.Mock).mockResolvedValue({
        user: mockUser,
        error: null,
      });
    });

    it('should return 500 if token generation fails', async () => {
      (supabase.getAuthenticatedUser as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = createMockRequest({ body: {} });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Internal server error');
    });
  });

  describe('Environment Configuration', () => {
    beforeEach(() => {
      (supabase.getAuthenticatedUser as jest.Mock).mockResolvedValue({
        user: mockUser,
        error: null,
      });
    });

    it('should use DEEPGRAM_API_KEY from environment', async () => {
      const request = createMockRequest({ body: {} });
      const response = await POST(request);
      const data = await response.json();

      expect(data.token).toBe(process.env.DEEPGRAM_API_KEY);
      expect(data.token).toBeDefined();
    });
  });
});
