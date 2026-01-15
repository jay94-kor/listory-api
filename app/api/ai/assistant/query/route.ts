import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase';
import { getOpenAIClient } from '@/lib/openai';
import { z } from 'zod';

// Thread cleanup metrics
let threadCleanupSuccessCount = 0;
let threadCleanupFailureCount = 0;

// Request validation schema
const querySchema = z.object({
  assistant_id: z.string().min(1),
  query: z.string().min(1),
  context: z.string().optional(),
  language: z.string().default('ko'),
});

/**
 * POST /api/ai/assistant/query
 * Query the OpenAI Assistant with RAG
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

    const body = await request.json();
    const parseResult = querySchema.safeParse(body);

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

    const { assistant_id, query, context, language } = parseResult.data;

    const openai = getOpenAIClient();
    let threadId: string | null = null;

    try {
      // Create ephemeral thread
      const thread = await openai.beta.threads.create();
      threadId = thread.id;

      // Add user message to thread
      await openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: context
          ? `Context: ${context}\n\nQuestion: ${query}\n\nIMPORTANT: Answer in ${language} language.`
          : `${query}\n\nIMPORTANT: Answer in ${language} language.`,
      });

      // Run the assistant
      const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: assistant_id,
      });

      // Poll for completion (max 10 attempts with 1 second delay)
      let attempts = 0;
      let runStatus = run.status;

      while (attempts < 10 && runStatus !== 'completed') {
        if (runStatus === 'failed' || runStatus === 'expired' || runStatus === 'cancelled') {
          throw new Error(`Run failed with status: ${runStatus}`);
        }

        // Wait 1 second before checking again
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const updatedRun = await openai.beta.threads.runs.retrieve(threadId, run.id);
        runStatus = updatedRun.status;
        attempts++;
      }

      if (runStatus !== 'completed') {
        throw new Error('Timeout waiting for assistant response');
      }

      // Get messages from thread
      const messages = await openai.beta.threads.messages.list(threadId);

      // The first message is the latest (assistant's response)
      const latestMessage = messages.data[0];
      let response = '';

      if (latestMessage && latestMessage.content && latestMessage.content.length > 0) {
        const contentBlock = latestMessage.content[0];
        if (contentBlock.type === 'text') {
          response = contentBlock.text.value;
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          response,
          thread_id: threadId, // Still return for debugging, but will be deleted
        },
      });
    } catch (error: any) {
      console.error('❌ Assistant query error:', error);
      return NextResponse.json(
        {
          success: false,
          error: {
            message: error.message || 'Failed to query assistant',
            code: 'SERVER_ERROR',
          },
        },
        { status: 500 }
      );
    } finally {
      // ✅ CRITICAL: Always delete thread, even on error
      if (threadId) {
        try {
          await openai.beta.threads.del(threadId);
          threadCleanupSuccessCount++;
          console.log(`🗑️ Thread deleted: ${threadId} (success: ${threadCleanupSuccessCount})`);
        } catch (deleteError) {
          threadCleanupFailureCount++;
          console.error(
            `⚠️ Failed to delete thread ${threadId} (failures: ${threadCleanupFailureCount}):`,
            deleteError
          );
          // Don't throw - thread cleanup failure shouldn't break response
        }
      }
    }
  } catch (error: any) {
    console.error('❌ Outer error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          message: error.message || 'Server error',
          code: 'SERVER_ERROR',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ai/assistant/query
 * Get thread cleanup metrics
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    data: {
      thread_cleanup_success: threadCleanupSuccessCount,
      thread_cleanup_failures: threadCleanupFailureCount,
      cleanup_rate:
        threadCleanupSuccessCount + threadCleanupFailureCount > 0
          ? (
              (threadCleanupSuccessCount /
                (threadCleanupSuccessCount + threadCleanupFailureCount)) *
              100
            ).toFixed(2) + "%"
          : "N/A",
    },
  });
}
