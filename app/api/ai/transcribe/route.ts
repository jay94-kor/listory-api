import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser, checkUserTier, createServerClient } from '@/lib/supabase';
import { startTranscription, getStatusMessage } from '@/lib/assemblyai';
import { checkRateLimit, recordUsage } from '@/lib/rate-limit';
import { generateDownloadUrl } from '@/lib/s3';

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

    // Rate limiting for basic tier
    const supabase = createServerClient();
    const effectiveTier = profile?.tier || 'basic';
    const { allowed: withinLimit, remaining, limit } = await checkRateLimit(
      supabase,
      user.id,
      effectiveTier,
      'transcribe'
    );

    if (!withinLimit) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: `Monthly limit reached (${limit}/month for Basic plan). Upgrade to Pro for unlimited access.`,
            code: 'RATE_LIMIT_EXCEEDED',
            remaining: 0,
            limit,
          },
        },
        { status: 429 }
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

    const { audio_url, language, enable_diarization } = parseResult.data;

    // If audio_url is an S3 URL from our bucket, generate a presigned download URL
    // so AssemblyAI can actually access the file (S3 Block Public Access is enabled)
    const s3BucketHost = `${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION || 'ap-northeast-2'}.amazonaws.com`;
    let accessibleUrl = audio_url;
    
    if (audio_url.includes(s3BucketHost)) {
      try {
        const url = new URL(audio_url);
        const key = decodeURIComponent(url.pathname.slice(1)); // remove leading /
        accessibleUrl = await generateDownloadUrl(key, 3600); // 1 hour expiry
        console.log('Generated presigned download URL for AssemblyAI');
      } catch (e) {
        console.error('Failed to generate presigned URL, using original:', e);
      }
    }

    // Start transcription job
    const { jobId, status } = await startTranscription(
      accessibleUrl,
      language,
      enable_diarization
    );

    // Store job ownership for later verification (SECURITY)
    const { error: insertError } = await supabase.from('transcription_jobs').insert({
      job_id: jobId,
      user_id: user.id,
      audio_url: audio_url,
      language: language,
      status: status,
    });

    if (insertError) {
      console.error('Failed to store transcription job:', insertError);
      // Continue anyway - job started successfully
    }

    // Record usage after successful job start
    await recordUsage(supabase, user.id, 'transcribe');

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
