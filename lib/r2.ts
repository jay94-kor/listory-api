import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Cloudflare R2 client (S3-compatible)
const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME!;
const PUBLIC_URL = process.env.R2_PUBLIC_URL!;

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
    allowedTypes: ['audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/m4a'],
    path: 'audio',
    expiresIn: 3600, // 1 hour for large files
  },
  voice_memo: {
    maxSize: 50 * 1024 * 1024, // 50MB
    allowedTypes: ['audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/m4a'],
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
): Promise<{ uploadUrl: string; publicUrl: string; path: string }> {
  const config = FILE_CONFIGS[type];
  const timestamp = Date.now();
  const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const key = `${config.path}/${userId}/${timestamp}_${safeName}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(r2Client, command, {
    expiresIn: config.expiresIn,
  });

  const publicUrl = `${PUBLIC_URL}/${key}`;

  return { uploadUrl, publicUrl, path: key };
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

  return getSignedUrl(r2Client, command, { expiresIn });
}

// Delete file from R2
export async function deleteFile(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await r2Client.send(command);
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
