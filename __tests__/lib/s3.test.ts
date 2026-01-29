import {
  FILE_CONFIGS,
  FileType,
  validateFile,
  generateUploadUrl,
  generateDownloadUrl,
  deleteFile,
  extractUserIdFromPath,
} from '@/lib/s3';

jest.mock('@aws-sdk/client-s3', () => {
  const mockSend = jest.fn();
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    PutObjectCommand: jest.fn(),
    GetObjectCommand: jest.fn(),
    DeleteObjectCommand: jest.fn(),
    __mockSend: mockSend,
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://mock-presigned-url.com'),
}));

describe('S3 Library', () => {
  describe('FILE_CONFIGS', () => {
    it('should define configurations for all file types', () => {
      expect(FILE_CONFIGS).toHaveProperty('card_image');
      expect(FILE_CONFIGS).toHaveProperty('audio');
      expect(FILE_CONFIGS).toHaveProperty('voice_memo');
      expect(FILE_CONFIGS).toHaveProperty('profile_image');
    });

    it('should have correct structure for each config', () => {
      for (const config of Object.values(FILE_CONFIGS)) {
        expect(config).toHaveProperty('maxSize');
        expect(config).toHaveProperty('allowedTypes');
        expect(config).toHaveProperty('path');
        expect(config).toHaveProperty('expiresIn');
        expect(typeof config.maxSize).toBe('number');
        expect(Array.isArray(config.allowedTypes)).toBe(true);
        expect(typeof config.path).toBe('string');
        expect(typeof config.expiresIn).toBe('number');
      }
    });

    it('should set appropriate max sizes', () => {
      expect(FILE_CONFIGS.card_image.maxSize).toBe(10 * 1024 * 1024);
      expect(FILE_CONFIGS.audio.maxSize).toBe(500 * 1024 * 1024);
      expect(FILE_CONFIGS.voice_memo.maxSize).toBe(50 * 1024 * 1024);
      expect(FILE_CONFIGS.profile_image.maxSize).toBe(5 * 1024 * 1024);
    });

    it('should define correct paths', () => {
      expect(FILE_CONFIGS.card_image.path).toBe('cards');
      expect(FILE_CONFIGS.audio.path).toBe('audio');
      expect(FILE_CONFIGS.voice_memo.path).toBe('memos');
      expect(FILE_CONFIGS.profile_image.path).toBe('profiles');
    });

    it('should allow correct image types for card_image', () => {
      expect(FILE_CONFIGS.card_image.allowedTypes).toContain('image/jpeg');
      expect(FILE_CONFIGS.card_image.allowedTypes).toContain('image/png');
      expect(FILE_CONFIGS.card_image.allowedTypes).toContain('image/webp');
    });

    it('should allow various audio types', () => {
      expect(FILE_CONFIGS.audio.allowedTypes).toContain('audio/wav');
      expect(FILE_CONFIGS.audio.allowedTypes).toContain('audio/mpeg');
      expect(FILE_CONFIGS.audio.allowedTypes).toContain('audio/mp4');
      expect(FILE_CONFIGS.audio.allowedTypes).toContain('audio/webm');
    });

    it('should set appropriate expiration times', () => {
      expect(FILE_CONFIGS.card_image.expiresIn).toBe(900);
      expect(FILE_CONFIGS.audio.expiresIn).toBe(3600);
      expect(FILE_CONFIGS.voice_memo.expiresIn).toBe(900);
      expect(FILE_CONFIGS.profile_image.expiresIn).toBe(900);
    });
  });

  describe('validateFile', () => {
    it('should accept valid card_image file', () => {
      const result = validateFile('card_image', 'image/jpeg', 5 * 1024 * 1024);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid PNG image', () => {
      const result = validateFile('card_image', 'image/png', 1 * 1024 * 1024);
      expect(result.valid).toBe(true);
    });

    it('should accept valid audio file', () => {
      const result = validateFile('audio', 'audio/wav', 100 * 1024 * 1024);
      expect(result.valid).toBe(true);
    });

    it('should accept valid voice_memo file', () => {
      const result = validateFile('voice_memo', 'audio/mpeg', 10 * 1024 * 1024);
      expect(result.valid).toBe(true);
    });

    it('should accept valid profile_image file', () => {
      const result = validateFile('profile_image', 'image/webp', 2 * 1024 * 1024);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid content type for image', () => {
      const result = validateFile('card_image', 'application/pdf', 1000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid content type');
    });

    it('should reject invalid content type for audio', () => {
      const result = validateFile('audio', 'text/plain', 1000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid content type');
    });

    it('should reject file exceeding card_image max size', () => {
      const result = validateFile('card_image', 'image/jpeg', 20 * 1024 * 1024);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too large');
      expect(result.error).toContain('10MB');
    });

    it('should reject file exceeding audio max size', () => {
      const result = validateFile('audio', 'audio/wav', 600 * 1024 * 1024);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too large');
      expect(result.error).toContain('500MB');
    });

    it('should reject file exceeding voice_memo max size', () => {
      const result = validateFile('voice_memo', 'audio/wav', 60 * 1024 * 1024);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too large');
    });

    it('should handle unknown file type', () => {
      const result = validateFile('unknown' as FileType, 'image/jpeg', 1000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid file type');
    });

    it('should allow max size boundary', () => {
      const result = validateFile('card_image', 'image/jpeg', 10 * 1024 * 1024);
      expect(result.valid).toBe(true);
    });

    it('should reject just over max size', () => {
      const result = validateFile('card_image', 'image/jpeg', 10 * 1024 * 1024 + 1);
      expect(result.valid).toBe(false);
    });
  });

  describe('generateUploadUrl', () => {
    it('should generate upload URL for card_image', async () => {
      const result = await generateUploadUrl(
        'card_image',
        'user-123',
        'business_card.jpg',
        'image/jpeg'
      );

      expect(result.uploadUrl).toBe('https://mock-presigned-url.com');
      expect(result.key).toContain('cards/user-123/');
      expect(result.key).toContain('business_card.jpg');
      expect(result.publicUrl).toBeDefined();
    });

    it('should sanitize filename with special characters', async () => {
      const result = await generateUploadUrl(
        'card_image',
        'user-123',
        'my card (copy).jpg',
        'image/jpeg'
      );

      expect(result.key).toContain('my_card__copy_.jpg');
      expect(result.key).not.toContain(' ');
    });

    it('should generate upload URL for audio', async () => {
      const result = await generateUploadUrl(
        'audio',
        'user-456',
        'meeting.wav',
        'audio/wav'
      );

      expect(result.key).toContain('audio/user-456/');
      expect(result.key).toContain('meeting.wav');
    });

    it('should generate upload URL for voice_memo', async () => {
      const result = await generateUploadUrl(
        'voice_memo',
        'user-789',
        'note.m4a',
        'audio/m4a'
      );

      expect(result.key).toContain('memos/user-789/');
    });

    it('should generate upload URL for profile_image', async () => {
      const result = await generateUploadUrl(
        'profile_image',
        'user-abc',
        'avatar.png',
        'image/png'
      );

      expect(result.key).toContain('profiles/user-abc/');
    });
  });

  describe('generateDownloadUrl', () => {
    it('should generate download URL for a key', async () => {
      const result = await generateDownloadUrl('cards/user-123/test.jpg');
      expect(result).toBe('https://mock-presigned-url.com');
    });

    it('should accept custom expiration time', async () => {
      const result = await generateDownloadUrl('cards/user-123/test.jpg', 1800);
      expect(result).toBe('https://mock-presigned-url.com');
    });
  });

  describe('deleteFile', () => {
    it('should delete file from S3', async () => {
      const { __mockSend } = require('@aws-sdk/client-s3');
      __mockSend.mockResolvedValue({});

      await expect(deleteFile('cards/user-123/test.jpg')).resolves.not.toThrow();
    });
  });

  describe('extractUserIdFromPath', () => {
    it('should extract user ID from valid path', () => {
      const userId = extractUserIdFromPath('cards/user-123/1234567890_test.jpg');
      expect(userId).toBe('user-123');
    });

    it('should extract user ID from audio path', () => {
      const userId = extractUserIdFromPath('audio/user-456/recording.wav');
      expect(userId).toBe('user-456');
    });

    it('should extract user ID from profile path', () => {
      const userId = extractUserIdFromPath('profiles/user-789/avatar.png');
      expect(userId).toBe('user-789');
    });

    it('should extract user ID from memo path', () => {
      const userId = extractUserIdFromPath('memos/user-abc/note.m4a');
      expect(userId).toBe('user-abc');
    });

    it('should return null for single segment path', () => {
      const userId = extractUserIdFromPath('invalid');
      expect(userId).toBeNull();
    });

    it('should return null for empty path', () => {
      const userId = extractUserIdFromPath('');
      expect(userId).toBeNull();
    });

    it('should handle path with multiple segments', () => {
      const userId = extractUserIdFromPath('profiles/user-789/nested/file.png');
      expect(userId).toBe('user-789');
    });

    it('should handle UUID-style user IDs', () => {
      const userId = extractUserIdFromPath('cards/550e8400-e29b-41d4-a716-446655440000/card.jpg');
      expect(userId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });
});
