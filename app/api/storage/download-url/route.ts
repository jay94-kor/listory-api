import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/supabase';
import { generateDownloadUrl, extractUserIdFromPath } from '@/lib/s3';

// Request validation schema
const requestSchema = z.object({
  key: z.string().min(1),
  expires_in: z.number().positive().max(7200).default(3600), // max 2 hours
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

    const { key, expires_in } = parseResult.data;

    // SECURITY: Verify the requesting user owns this file
    const fileOwnerId = extractUserIdFromPath(key);
    if (fileOwnerId !== user.id) {
      return NextResponse.json(
        { success: false, error: { message: 'Access denied', code: 'FORBIDDEN' } },
        { status: 403 }
      );
    }

    // Generate presigned download URL
    const downloadUrl = await generateDownloadUrl(key, expires_in);

    return NextResponse.json({
      success: true,
      data: {
        download_url: downloadUrl,
        expires_in,
      },
    });
  } catch (error) {
    console.error('Download URL error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { message: 'Failed to generate download URL', code: 'SERVER_ERROR' },
      },
      { status: 500 }
    );
  }
}
