import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// AWS S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-northeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET!;

// File type configurations
export const FILE_CONFIGS = {
  card_image: {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    path: 'cards',
    expiresIn: 900, // 15 minutes
  },
  audio: {
    maxSize: 500 * 1024 * 1024, // 500MB
    allowedTypes: ['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/m4a'],
    path: 'audio',
    expiresIn: 3600, // 1 hour for large files
  },
  voice_memo: {
    maxSize: 50 * 1024 * 1024, // 50MB
    allowedTypes: ['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/m4a'],
    path: 'memos',
    expiresIn: 900,
  },
  profile_image: {
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    path: 'profiles',
    expiresIn: 900,
  },
} as const;

export type FileType = keyof typeof FILE_CONFIGS;

// Validate file type and size
export function validateFile(
  type: FileType,
  contentType: string,
  size: number
): { valid: boolean; error?: string } {
  const config = FILE_CONFIGS[type];

  if (!config) {
    return { valid: false, error: `Invalid file type: ${type}` };
  }

  if (!config.allowedTypes.includes(contentType as never)) {
    return {
      valid: false,
      error: `Invalid content type. Allowed: ${config.allowedTypes.join(', ')}`,
    };
  }

  if (size > config.maxSize) {
    const maxMB = config.maxSize / 1024 / 1024;
    return { valid: false, error: `File too large. Maximum size: ${maxMB}MB` };
  }

  return { valid: true };
}

// Generate presigned upload URL
export async function generateUploadUrl(
  type: FileType,
  userId: string,
  filename: string,
  contentType: string
): Promise<{ uploadUrl: string; publicUrl: string; key: string }> {
  const config = FILE_CONFIGS[type];
  const timestamp = Date.now();
  const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const key = `${config.path}/${userId}/${timestamp}_${safeName}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    // ACL 제거 - Block Public Access 설정으로 인해 실패할 수 있음
    // 대신 OCR 엔드포인트에서 presigned download URL 사용
  });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: config.expiresIn,
  });

  // S3 public URL format
  const publicUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'ap-northeast-2'}.amazonaws.com/${key}`;

  return { uploadUrl, publicUrl, key };
}

// Generate presigned download URL
export async function generateDownloadUrl(
  key: string,
  expiresIn: number = 900
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

// Delete file from S3
export async function deleteFile(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
}

// Extract user ID from file path for authorization
export function extractUserIdFromPath(path: string): string | null {
  // Path format: {type}/{userId}/{timestamp}_{filename}
  const parts = path.split('/');
  if (parts.length >= 2) {
    return parts[1];
  }
  return null;
}
