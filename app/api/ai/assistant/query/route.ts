import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase';
import { getOpenAIClient } from '@/lib/openai';
import { z } from 'zod';

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

    // Create a thread
    const thread = await openai.beta.threads.create();

    // Add user message to thread
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: context
        ? `Context: ${context}\n\nQuestion: ${query}\n\nIMPORTANT: Answer in ${language} language.`
        : `${query}\n\nIMPORTANT: Answer in ${language} language.`,
    });

    // Run the assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
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

      const updatedRun = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      runStatus = updatedRun.status;
      attempts++;
    }

    if (runStatus !== 'completed') {
      throw new Error('Timeout waiting for assistant response');
    }

    // Get messages from thread
    const messages = await openai.beta.threads.messages.list(thread.id);

    // The first message is the latest (assistant's response)
    const latestMessage = messages.data[0];
    if (latestMessage && latestMessage.content && latestMessage.content.length > 0) {
      const contentBlock = latestMessage.content[0];
      if (contentBlock.type === 'text') {
        return NextResponse.json({
          success: true,
          data: {
            response: contentBlock.text.value,
            thread_id: thread.id,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        response: '',
        thread_id: thread.id,
      },
    });
  } catch (error: any) {
    console.error('Assistant query error:', error);
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
  }
}
