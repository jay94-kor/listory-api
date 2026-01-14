import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase';
import { getTranscriptionResult, getStatusMessage } from '@/lib/assemblyai';

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    // Authenticate user
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: { message: 'Unauthorized', code: 'AUTH_ERROR' } },
        { status: 401 }
      );
    }

    const { jobId } = params;

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: { message: 'Job ID required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    // Get transcription result
    const result = await getTranscriptionResult(jobId);

    // If still processing
    if (result.status === 'queued' || result.status === 'processing') {
      return NextResponse.json({
        success: true,
        data: {
          job_id: jobId,
          status: result.status,
          status_message: getStatusMessage(result.status),
          text: null,
          utterances: null,
        },
      });
    }

    // If error
    if (result.status === 'error') {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: result.error || 'Transcription failed',
            code: 'TRANSCRIPTION_ERROR',
          },
        },
        { status: 500 }
      );
    }

    // Completed successfully
    return NextResponse.json({
      success: true,
      data: {
        job_id: jobId,
        status: result.status,
        status_message: getStatusMessage(result.status),
        text: result.text,
        utterances: result.utterances,
      },
    });
  } catch (error) {
    console.error('Transcription status error:', error);

    return NextResponse.json(
      {
        success: false,
        error: { message: 'Failed to get transcription status', code: 'SERVER_ERROR' },
      },
      { status: 500 }
    );
  }
}
