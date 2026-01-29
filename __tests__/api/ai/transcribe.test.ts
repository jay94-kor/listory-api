import { POST } from '@/app/api/ai/transcribe/route';
import { createMockRequest } from '../../helpers/test-utils';
import { createMockSupabaseClient } from '../../helpers/mock-supabase';
import * as supabase from '@/lib/supabase';
import * as assemblyai from '@/lib/assemblyai';
import * as rateLimit from '@/lib/rate-limit';

jest.mock('@/lib/supabase');
jest.mock('@/lib/assemblyai');
jest.mock('@/lib/rate-limit');

describe('POST /api/ai/transcribe', () => {
  const mockUser = {
    id: 'test-user-123',
    email: 'test@example.com',
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  };

  const mockSupabaseClient = createMockSupabaseClient({
    userId: mockUser.id,
    tier: 'pro',
    withinRateLimit: true,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (supabase.createServerClient as jest.Mock).mockReturnValue(mockSupabaseClient);
  });

  describe('Authentication', () => {
    it('should return 401 if user is not authenticated', async () => {
      (supabase.getAuthenticatedUser as jest.Mock).mockResolvedValue({
        user: null,
        error: 'Unauthorized',
      });

      const request = createMockRequest({
        body: {
          audio_url: 'https://example.com/audio.wav',
          language: 'ko',
          enable_diarization: true,
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_ERROR');
    });
  });

  describe('Tier Check', () => {
    beforeEach(() => {
      (supabase.getAuthenticatedUser as jest.Mock).mockResolvedValue({
        user: mockUser,
        error: null,
      });
    });

    it('should return 403 if user tier is insufficient', async () => {
      (supabase.checkUserTier as jest.Mock).mockResolvedValue({
        allowed: false,
        profile: null,
        error: 'Upgrade required',
      });

      const request = createMockRequest({
        body: {
          audio_url: 'https://example.com/audio.wav',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('TIER_ERROR');
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      (supabase.getAuthenticatedUser as jest.Mock).mockResolvedValue({
        user: mockUser,
        error: null,
      });
      (supabase.checkUserTier as jest.Mock).mockResolvedValue({
        allowed: true,
        profile: { tier: 'basic' },
        error: null,
      });
    });

    it('should return 429 if rate limit is exceeded', async () => {
      (rateLimit.checkRateLimit as jest.Mock).mockResolvedValue({
        allowed: false,
        remaining: 0,
        limit: 10,
      });

      const request = createMockRequest({
        body: {
          audio_url: 'https://example.com/audio.wav',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(data.error.remaining).toBe(0);
      expect(data.error.limit).toBe(10);
    });
  });

  describe('Validation', () => {
    beforeEach(() => {
      (supabase.getAuthenticatedUser as jest.Mock).mockResolvedValue({
        user: mockUser,
        error: null,
      });
      (supabase.checkUserTier as jest.Mock).mockResolvedValue({
        allowed: true,
        profile: { tier: 'pro' },
        error: null,
      });
      (rateLimit.checkRateLimit as jest.Mock).mockResolvedValue({
        allowed: true,
        remaining: 100,
        limit: 1000,
      });
    });

    it('should return 400 if audio_url is missing', async () => {
      const request = createMockRequest({
        body: {
          language: 'ko',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 if audio_url is not a valid URL', async () => {
      const request = createMockRequest({
        body: {
          audio_url: 'not-a-url',
          language: 'ko',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 if language is invalid', async () => {
      const request = createMockRequest({
        body: {
          audio_url: 'https://example.com/audio.wav',
          language: 'fr',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Success', () => {
    beforeEach(() => {
      (supabase.getAuthenticatedUser as jest.Mock).mockResolvedValue({
        user: mockUser,
        error: null,
      });
      (supabase.checkUserTier as jest.Mock).mockResolvedValue({
        allowed: true,
        profile: { tier: 'pro' },
        error: null,
      });
      (rateLimit.checkRateLimit as jest.Mock).mockResolvedValue({
        allowed: true,
        remaining: 100,
        limit: 1000,
      });
      (rateLimit.recordUsage as jest.Mock).mockResolvedValue(undefined);
    });

    it('should start transcription job successfully', async () => {
      (assemblyai.startTranscription as jest.Mock).mockResolvedValue({
        jobId: 'job-123',
        status: 'queued',
      });
      (assemblyai.getStatusMessage as jest.Mock).mockReturnValue('대기 중');

      const request = createMockRequest({
        body: {
          audio_url: 'https://example.com/audio.wav',
          language: 'ko',
          enable_diarization: true,
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(202);
      expect(data.success).toBe(true);
      expect(data.data.job_id).toBe('job-123');
      expect(data.data.status).toBe('queued');
      expect(data.data.status_message).toBe('대기 중');

      expect(assemblyai.startTranscription).toHaveBeenCalledWith(
        'https://example.com/audio.wav',
        'ko',
        true
      );
      expect(rateLimit.recordUsage).toHaveBeenCalledWith(
        mockSupabaseClient,
        mockUser.id,
        'transcribe'
      );
    });

    it('should use default values for optional parameters', async () => {
      (assemblyai.startTranscription as jest.Mock).mockResolvedValue({
        jobId: 'job-456',
        status: 'queued',
      });
      (assemblyai.getStatusMessage as jest.Mock).mockReturnValue('대기 중');

      const request = createMockRequest({
        body: {
          audio_url: 'https://example.com/audio.wav',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(202);
      expect(data.success).toBe(true);

      expect(assemblyai.startTranscription).toHaveBeenCalledWith(
        'https://example.com/audio.wav',
        'ko',
        true
      );
    });

    it('should store job ownership in database', async () => {
      (assemblyai.startTranscription as jest.Mock).mockResolvedValue({
        jobId: 'job-789',
        status: 'queued',
      });
      (assemblyai.getStatusMessage as jest.Mock).mockReturnValue('대기 중');

      const audioUrl = 'https://example.com/audio.wav';
      const request = createMockRequest({
        body: {
          audio_url: audioUrl,
          language: 'en',
          enable_diarization: false,
        },
      });

      await POST(request);

      const fromMock = mockSupabaseClient.from as jest.Mock;
      expect(fromMock).toHaveBeenCalledWith('transcription_jobs');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      (supabase.getAuthenticatedUser as jest.Mock).mockResolvedValue({
        user: mockUser,
        error: null,
      });
      (supabase.checkUserTier as jest.Mock).mockResolvedValue({
        allowed: true,
        profile: { tier: 'pro' },
        error: null,
      });
      (rateLimit.checkRateLimit as jest.Mock).mockResolvedValue({
        allowed: true,
        remaining: 100,
        limit: 1000,
      });
    });

    it('should return 500 if transcription service fails', async () => {
      (assemblyai.startTranscription as jest.Mock).mockRejectedValue(
        new Error('AssemblyAI API error')
      );

      const request = createMockRequest({
        body: {
          audio_url: 'https://example.com/audio.wav',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('SERVER_ERROR');
      expect(data.error.message).toBe('Failed to start transcription');
    });
  });
});
