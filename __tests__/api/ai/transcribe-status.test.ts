import { GET } from '@/app/api/ai/transcribe/[jobId]/route';
import { NextRequest } from 'next/server';
import { createMockSupabaseClient } from '../../helpers/mock-supabase';
import * as supabase from '@/lib/supabase';
import * as assemblyai from '@/lib/assemblyai';

jest.mock('@/lib/supabase');
jest.mock('@/lib/assemblyai');

describe('GET /api/ai/transcribe/[jobId]', () => {
  const mockUser = {
    id: 'test-user-123',
    email: 'test@example.com',
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  };

  const mockSupabaseClient = createMockSupabaseClient({
    userId: mockUser.id,
    tier: 'pro',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (supabase.createServerClient as jest.Mock).mockReturnValue(mockSupabaseClient);
  });

  function createRequest(jobId: string): NextRequest {
    const url = new URL(`http://localhost:3000/api/ai/transcribe/${jobId}`);
    return new NextRequest(url, {
      method: 'GET',
      headers: {
        'authorization': 'Bearer mock-jwt-token',
      },
    });
  }

  describe('Authentication', () => {
    it('should return 401 if user is not authenticated', async () => {
      (supabase.getAuthenticatedUser as jest.Mock).mockResolvedValue({
        user: null,
        error: 'Unauthorized',
      });

      const request = createRequest('job-123');
      const response = await GET(request, { params: { jobId: 'job-123' } });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_ERROR');
    });
  });

  describe('Validation', () => {
    beforeEach(() => {
      (supabase.getAuthenticatedUser as jest.Mock).mockResolvedValue({
        user: mockUser,
        error: null,
      });
    });

    it('should return 400 if jobId is missing', async () => {
      const request = createRequest('');
      const response = await GET(request, { params: { jobId: '' } });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Authorization', () => {
    beforeEach(() => {
      (supabase.getAuthenticatedUser as jest.Mock).mockResolvedValue({
        user: mockUser,
        error: null,
      });
    });

    it('should return 404 if job does not exist', async () => {
      const fromMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Not found' },
        }),
      });
      (mockSupabaseClient.from as jest.Mock) = fromMock;

      const request = createRequest('nonexistent-job');
      const response = await GET(request, { params: { jobId: 'nonexistent-job' } });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('should return 403 if user does not own the job', async () => {
      const fromMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { user_id: 'other-user-456' },
          error: null,
        }),
      });
      (mockSupabaseClient.from as jest.Mock) = fromMock;

      const request = createRequest('job-123');
      const response = await GET(request, { params: { jobId: 'job-123' } });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Success - Processing', () => {
    beforeEach(() => {
      (supabase.getAuthenticatedUser as jest.Mock).mockResolvedValue({
        user: mockUser,
        error: null,
      });

      const fromMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { user_id: mockUser.id },
          error: null,
        }),
        update: jest.fn().mockReturnThis(),
      });
      (mockSupabaseClient.from as jest.Mock) = fromMock;
    });

    it('should return queued status', async () => {
      (assemblyai.getTranscriptionResult as jest.Mock).mockResolvedValue({
        status: 'queued',
        text: null,
        utterances: null,
        error: null,
      });
      (assemblyai.getStatusMessage as jest.Mock).mockReturnValue('대기 중');

      const request = createRequest('job-123');
      const response = await GET(request, { params: { jobId: 'job-123' } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.job_id).toBe('job-123');
      expect(data.data.status).toBe('queued');
      expect(data.data.status_message).toBe('대기 중');
      expect(data.data.text).toBeNull();
      expect(data.data.utterances).toBeNull();
    });

    it('should return processing status', async () => {
      (assemblyai.getTranscriptionResult as jest.Mock).mockResolvedValue({
        status: 'processing',
        text: null,
        utterances: null,
        error: null,
      });
      (assemblyai.getStatusMessage as jest.Mock).mockReturnValue('처리 중');

      const request = createRequest('job-456');
      const response = await GET(request, { params: { jobId: 'job-456' } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.status).toBe('processing');
      expect(data.data.status_message).toBe('처리 중');
    });
  });

  describe('Success - Completed', () => {
    beforeEach(() => {
      (supabase.getAuthenticatedUser as jest.Mock).mockResolvedValue({
        user: mockUser,
        error: null,
      });

      const fromMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { user_id: mockUser.id },
          error: null,
        }),
        update: jest.fn().mockReturnThis(),
      });
      (mockSupabaseClient.from as jest.Mock) = fromMock;
    });

    it('should return completed transcription with text and utterances', async () => {
      const mockUtterances = [
        {
          speaker: 'A',
          text: '안녕하세요',
          start: 0,
          end: 1000,
          confidence: 0.95,
        },
        {
          speaker: 'B',
          text: '반갑습니다',
          start: 1500,
          end: 2500,
          confidence: 0.92,
        },
      ];

      (assemblyai.getTranscriptionResult as jest.Mock).mockResolvedValue({
        status: 'completed',
        text: '안녕하세요 반갑습니다',
        utterances: mockUtterances,
        error: null,
      });
      (assemblyai.getStatusMessage as jest.Mock).mockReturnValue('완료');

      const request = createRequest('job-789');
      const response = await GET(request, { params: { jobId: 'job-789' } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.job_id).toBe('job-789');
      expect(data.data.status).toBe('completed');
      expect(data.data.status_message).toBe('완료');
      expect(data.data.text).toBe('안녕하세요 반갑습니다');
      expect(data.data.utterances).toEqual(mockUtterances);
    });
  });

  describe('Error - Transcription Failed', () => {
    beforeEach(() => {
      (supabase.getAuthenticatedUser as jest.Mock).mockResolvedValue({
        user: mockUser,
        error: null,
      });

      const fromMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { user_id: mockUser.id },
          error: null,
        }),
        update: jest.fn().mockReturnThis(),
      });
      (mockSupabaseClient.from as jest.Mock) = fromMock;
    });

    it('should return 500 if transcription failed', async () => {
      (assemblyai.getTranscriptionResult as jest.Mock).mockResolvedValue({
        status: 'error',
        text: null,
        utterances: null,
        error: 'Audio file is corrupted',
      });

      const request = createRequest('job-error');
      const response = await GET(request, { params: { jobId: 'job-error' } });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('TRANSCRIPTION_ERROR');
      expect(data.error.message).toBe('Audio file is corrupted');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      (supabase.getAuthenticatedUser as jest.Mock).mockResolvedValue({
        user: mockUser,
        error: null,
      });

      const fromMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { user_id: mockUser.id },
          error: null,
        }),
      });
      (mockSupabaseClient.from as jest.Mock) = fromMock;
    });

    it('should return 500 if AssemblyAI service fails', async () => {
      (assemblyai.getTranscriptionResult as jest.Mock).mockRejectedValue(
        new Error('AssemblyAI API error')
      );

      const request = createRequest('job-123');
      const response = await GET(request, { params: { jobId: 'job-123' } });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('SERVER_ERROR');
      expect(data.error.message).toBe('Failed to get transcription status');
    });
  });
});
