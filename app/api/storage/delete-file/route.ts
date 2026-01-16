import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/supabase';
import { deleteFile, extractUserIdFromPath } from '@/lib/s3';

// Request validation schema
const requestSchema = z.object({
  key: z.string().min(1).max(500),
});

/**
 * DELETE /api/storage/delete-file
 *
 * S3/R2에서 파일을 삭제합니다.
 * Free 사용자의 경우 AI 분석 후 24시간 뒤에 자동으로 호출됩니다.
 *
 * Request Body:
 * - key: S3 object key (예: "audio/user123/meeting_abc.wav")
 *
 * Security:
 * - 인증된 사용자만 호출 가능
 * - 사용자는 자신의 파일만 삭제 가능 (path에서 userId 추출하여 검증)
 */
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

    const { key } = parseResult.data;

    // Security check: Verify user owns this file
    const fileOwnerId = extractUserIdFromPath(key);
    if (!fileOwnerId) {
      return NextResponse.json(
        {
          success: false,
          error: { message: 'Invalid file path', code: 'INVALID_PATH' },
        },
        { status: 400 }
      );
    }

    if (fileOwnerId !== user.id) {
      console.warn(`[Delete] User ${user.id} attempted to delete file owned by ${fileOwnerId}`);
      return NextResponse.json(
        {
          success: false,
          error: { message: 'Permission denied', code: 'FORBIDDEN' },
        },
        { status: 403 }
      );
    }

    // Delete file from S3
    try {
      await deleteFile(key);
      console.log(`[Delete] Successfully deleted: ${key}`);
    } catch (s3Error: unknown) {
      // S3 NoSuchKey error means file doesn't exist - treat as success
      const errorCode = (s3Error as { name?: string })?.name;
      if (errorCode === 'NoSuchKey') {
        console.log(`[Delete] File not found (already deleted): ${key}`);
        return NextResponse.json({
          success: true,
          data: {
            key,
            message: 'File not found (already deleted)',
          },
        });
      }
      throw s3Error;
    }

    return NextResponse.json({
      success: true,
      data: {
        key,
        message: 'File deleted successfully',
      },
    });
  } catch (error) {
    console.error('Delete file error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { message: 'Failed to delete file', code: 'SERVER_ERROR' },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE method alias (for RESTful clients)
 */
export async function DELETE(request: NextRequest) {
  return POST(request);
}
