import { POST, DELETE } from '@/app/api/storage/delete-file/route';
import { createMockRequest } from '../../helpers/test-utils';
import * as supabase from '@/lib/supabase';
import * as s3 from '@/lib/s3';

// Mock dependencies
jest.mock('@/lib/supabase');
jest.mock('@/lib/s3');

describe('POST/DELETE /api/storage/delete-file', () => {
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

      const request = createMockRequest({
        body: {
          key: 'audio/test-user-123/meeting.wav',
        },
      });

      const response = await POST(request);
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

    it('should return 400 if key is missing', async () => {
      const request = createMockRequest({
        body: {},
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 if key format is invalid', async () => {
      (s3.extractUserIdFromPath as jest.Mock).mockReturnValue(null);

      const request = createMockRequest({
        body: {
          key: 'invalid-path',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_PATH');
    });
  });

  describe('Authorization', () => {
    beforeEach(() => {
      (supabase.getAuthenticatedUser as jest.Mock).mockResolvedValue({
        user: mockUser,
        error: null,
      });
    });

    it('should return 403 if user tries to delete another user\'s file', async () => {
      (s3.extractUserIdFromPath as jest.Mock).mockReturnValue('other-user-456');

      const request = createMockRequest({
        body: {
          key: 'audio/other-user-456/meeting.wav',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.message).toBe('Permission denied');
    });
  });

  describe('Success', () => {
    beforeEach(() => {
      (supabase.getAuthenticatedUser as jest.Mock).mockResolvedValue({
        user: mockUser,
        error: null,
      });
      (s3.extractUserIdFromPath as jest.Mock).mockReturnValue(mockUser.id);
    });

    it('should delete file successfully', async () => {
      (s3.deleteFile as jest.Mock).mockResolvedValue(undefined);

      const fileKey = 'audio/test-user-123/1234567890_meeting.wav';
      const request = createMockRequest({
        body: { key: fileKey },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.key).toBe(fileKey);
      expect(data.data.message).toBe('File deleted successfully');
      expect(s3.deleteFile).toHaveBeenCalledWith(fileKey);
    });

    it('should return success if file does not exist (NoSuchKey)', async () => {
      const noSuchKeyError = new Error('NoSuchKey');
      (noSuchKeyError as any).name = 'NoSuchKey';
      (s3.deleteFile as jest.Mock).mockRejectedValue(noSuchKeyError);

      const fileKey = 'audio/test-user-123/nonexistent.wav';
      const request = createMockRequest({
        body: { key: fileKey },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.key).toBe(fileKey);
      expect(data.data.message).toBe('File not found (already deleted)');
    });

    it('should support DELETE method alias', async () => {
      (s3.deleteFile as jest.Mock).mockResolvedValue(undefined);

      const fileKey = 'audio/test-user-123/1234567890_meeting.wav';
      const request = createMockRequest({
        method: 'POST',
        body: { key: fileKey },
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.key).toBe(fileKey);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      (supabase.getAuthenticatedUser as jest.Mock).mockResolvedValue({
        user: mockUser,
        error: null,
      });
      (s3.extractUserIdFromPath as jest.Mock).mockReturnValue(mockUser.id);
    });

    it('should return 500 if S3 operation fails', async () => {
      (s3.deleteFile as jest.Mock).mockRejectedValue(
        new Error('S3 connection failed')
      );

      const request = createMockRequest({
        body: {
          key: 'audio/test-user-123/meeting.wav',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('SERVER_ERROR');
      expect(data.error.message).toBe('Failed to delete file');
    });
  });
});
