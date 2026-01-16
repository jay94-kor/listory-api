import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/supabase';
import { generateUploadUrl, validateFile, FileType, FILE_CONFIGS } from '@/lib/s3';

// Request validation schema
const requestSchema = z.object({
  type: z.enum(['card_image', 'audio', 'voice_memo', 'profile_image']),
  filename: z.string().min(1).max(255),
  content_type: z.string().min(1),
  size: z.number().positive(),
});

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: { message: 'Unauthorized', code: 'AUTH_ERROR' } },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const parseResult = requestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Invalid request',
            code: 'VALIDATION_ERROR',
            details: parseResult.error.flatten(),
          },
        },
        { status: 400 }
      );
    }

    const { type, filename, content_type, size } = parseResult.data;

    // Validate file type and size
    const validation = validateFile(type as FileType, content_type, size);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: { message: validation.error, code: 'INVALID_FILE' },
        },
        { status: 400 }
      );
    }

    // Generate presigned URL
    const { uploadUrl, publicUrl, key } = await generateUploadUrl(
      type as FileType,
      user.id,
      filename,
      content_type
    );

    const config = FILE_CONFIGS[type as FileType];

    return NextResponse.json({
      success: true,
      data: {
        upload_url: uploadUrl,
        public_url: publicUrl,
        key: key, // Flutter expects 'key', not 'path'
        path: key, // Keep 'path' for backward compatibility
        method: 'PUT',
        expires_in: config.expiresIn,
        headers: {
          'Content-Type': content_type,
        },
      },
    });
  } catch (error) {
    console.error('Presigned URL error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { message: 'Failed to generate upload URL', code: 'SERVER_ERROR' },
      },
      { status: 500 }
    );
  }
}
