import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser, checkUserTier } from '@/lib/supabase';
import { startTranscription, getStatusMessage } from '@/lib/assemblyai';

// Request validation schema
const requestSchema = z.object({
  audio_url: z.string().url(),
  language: z.enum(['ko', 'en']).default('ko'),
  enable_diarization: z.boolean().default(true),
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

    // Check tier for STT (basic tier has limited usage)
    const { allowed, profile, error: tierError } = await checkUserTier(request, ['basic', 'pro', 'business']);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { message: tierError || 'Access denied', code: 'TIER_ERROR' } },
        { status: 403 }
      );
    }

    // Note: In production, implement rate limiting for basic tier (10/month)
    // This would require tracking usage in a separate table

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

    const { audio_url, language, enable_diarization } = parseResult.data;

    // Start transcription job
    const { jobId, status } = await startTranscription(
      audio_url,
      language,
      enable_diarization
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          job_id: jobId,
          status: status,
          status_message: getStatusMessage(status as any),
        },
      },
      { status: 202 } // Accepted - processing async
    );
  } catch (error) {
    console.error('Transcription start error:', error);

    return NextResponse.json(
      {
        success: false,
        error: { message: 'Failed to start transcription', code: 'SERVER_ERROR' },
      },
      { status: 500 }
    );
  }
}
