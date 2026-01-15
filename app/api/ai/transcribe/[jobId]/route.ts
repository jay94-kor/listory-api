import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createServerClient } from '@/lib/supabase';
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

    // SECURITY: Verify job ownership before returning results
    const supabase = createServerClient();
    const { data: jobRecord, error: jobError } = await supabase
      .from('transcription_jobs')
      .select('user_id')
      .eq('job_id', jobId)
      .single();

    if (jobError || !jobRecord) {
      return NextResponse.json(
        { success: false, error: { message: 'Job not found', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }

    // Verify the requesting user owns this job
    if (jobRecord.user_id !== user.id) {
      return NextResponse.json(
        { success: false, error: { message: 'Access denied', code: 'FORBIDDEN' } },
        { status: 403 }
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
      // Update job status in database
      await supabase
        .from('transcription_jobs')
        .update({ status: 'error' })
        .eq('job_id', jobId);

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

    // Update job status to completed
    await supabase
      .from('transcription_jobs')
      .update({ status: 'completed' })
      .eq('job_id', jobId);

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
