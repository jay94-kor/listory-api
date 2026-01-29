import { POST } from '@/app/api/storage/presigned-url/route';
import { createMockRequest } from '../../helpers/test-utils';
import * as supabase from '@/lib/supabase';
import * as s3 from '@/lib/s3';

// Mock dependencies
jest.mock('@/lib/supabase');
jest.mock('@/lib/s3');

describe('POST /api/storage/presigned-url', () => {
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
          type: 'card_image',
          filename: 'test.jpg',
          content_type: 'image/jpeg',
          size: 1024,
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

    it('should return 400 if type is missing', async () => {
      const request = createMockRequest({
        body: {
          filename: 'test.jpg',
          content_type: 'image/jpeg',
          size: 1024,
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 if filename is missing', async () => {
      const request = createMockRequest({
        body: {
          type: 'card_image',
          content_type: 'image/jpeg',
          size: 1024,
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 if content_type is invalid', async () => {
      (s3.validateFile as jest.Mock).mockReturnValue({
        valid: false,
        error: 'Invalid content type',
      });

      const request = createMockRequest({
        body: {
          type: 'card_image',
          filename: 'test.txt',
          content_type: 'text/plain',
          size: 1024,
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_FILE');
    });

    it('should return 400 if file size exceeds limit', async () => {
      (s3.validateFile as jest.Mock).mockReturnValue({
        valid: false,
        error: 'File too large. Maximum size: 10MB',
      });

      const request = createMockRequest({
        body: {
          type: 'card_image',
          filename: 'huge.jpg',
          content_type: 'image/jpeg',
          size: 20 * 1024 * 1024, // 20MB
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_FILE');
    });
  });

  describe('Success', () => {
    beforeEach(() => {
      (supabase.getAuthenticatedUser as jest.Mock).mockResolvedValue({
        user: mockUser,
        error: null,
      });
      (s3.validateFile as jest.Mock).mockReturnValue({ valid: true });
    });

    it('should generate presigned URL for card_image', async () => {
      const mockUploadData = {
        uploadUrl: 'https://bucket.s3.amazonaws.com/cards/test-user-123/1234567890_test.jpg?signature=xyz',
        publicUrl: 'https://bucket.s3.amazonaws.com/cards/test-user-123/1234567890_test.jpg',
        key: 'cards/test-user-123/1234567890_test.jpg',
      };

      (s3.generateUploadUrl as jest.Mock).mockResolvedValue(mockUploadData);
      (s3.FILE_CONFIGS as any) = {
        card_image: { expiresIn: 900 },
      };

      const request = createMockRequest({
        body: {
          type: 'card_image',
          filename: 'test.jpg',
          content_type: 'image/jpeg',
          size: 1024,
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.upload_url).toBe(mockUploadData.uploadUrl);
      expect(data.data.public_url).toBe(mockUploadData.publicUrl);
      expect(data.data.key).toBe(mockUploadData.key);
      expect(data.data.path).toBe(mockUploadData.key);
      expect(data.data.method).toBe('PUT');
      expect(data.data.expires_in).toBe(900);
      expect(data.data.headers['Content-Type']).toBe('image/jpeg');

      expect(s3.generateUploadUrl).toHaveBeenCalledWith(
        'card_image',
        mockUser.id,
        'test.jpg',
        'image/jpeg'
      );
    });

    it('should generate presigned URL for audio file', async () => {
      const mockUploadData = {
        uploadUrl: 'https://bucket.s3.amazonaws.com/audio/test-user-123/1234567890_meeting.wav?signature=xyz',
        publicUrl: 'https://bucket.s3.amazonaws.com/audio/test-user-123/1234567890_meeting.wav',
        key: 'audio/test-user-123/1234567890_meeting.wav',
      };

      (s3.generateUploadUrl as jest.Mock).mockResolvedValue(mockUploadData);
      (s3.FILE_CONFIGS as any) = {
        audio: { expiresIn: 3600 },
      };

      const request = createMockRequest({
        body: {
          type: 'audio',
          filename: 'meeting.wav',
          content_type: 'audio/wav',
          size: 50 * 1024 * 1024, // 50MB
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.upload_url).toBe(mockUploadData.uploadUrl);
      expect(data.data.expires_in).toBe(3600);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      (supabase.getAuthenticatedUser as jest.Mock).mockResolvedValue({
        user: mockUser,
        error: null,
      });
      (s3.validateFile as jest.Mock).mockReturnValue({ valid: true });
    });

    it('should return 500 if S3 operation fails', async () => {
      (s3.generateUploadUrl as jest.Mock).mockRejectedValue(
        new Error('S3 connection failed')
      );

      const request = createMockRequest({
        body: {
          type: 'card_image',
          filename: 'test.jpg',
          content_type: 'image/jpeg',
          size: 1024,
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('SERVER_ERROR');
      expect(data.error.message).toBe('Failed to generate upload URL');
    });
  });
});
