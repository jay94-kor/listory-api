import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase';
import { getOpenAIClient } from '@/lib/openai';
import { z } from 'zod';

// Request validation schemas
const initializeSchema = z.object({
  force: z.boolean().optional(),
});

const querySchema = z.object({
  query: z.string().min(1),
  context: z.string().optional(),
  language: z.string().default('ko'),
});

/**
 * POST /api/ai/assistant
 * Initialize or retrieve OpenAI Assistant
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
    const parseResult = initializeSchema.safeParse(body);

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

    const openai = getOpenAIClient();

    // Create Vector Store for user
    const vectorStore = await openai.vectorStores.create({
      name: `Listory Knowledge Base - ${user.id}`,
    });

    // Create Assistant with vector store
    const assistant = await openai.beta.assistants.create({
      name: 'Listory Sales Coach',
      instructions:
        'You are an expert Sales Coach. Your goal is to help the sales rep close deals during a meeting. ' +
        'Use the uploaded knowledge base to answer questions or provide tips. ' +
        'Keep answers extremely concise (under 2 sentences) as they constitute real-time hints.',
      model: 'gpt-4o',
      tools: [{ type: 'file_search' }],
      tool_resources: {
        file_search: {
          vector_store_ids: [vectorStore.id],
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        assistant_id: assistant.id,
        vector_store_id: vectorStore.id,
      },
    });
  } catch (error: any) {
    console.error('Assistant initialization error:', error);

    // Extract detailed error info for debugging
    const errorMessage = error.message || 'Failed to initialize assistant';
    const errorCode = error.code || error.status || 'SERVER_ERROR';
    const errorType = error.type || error.name || 'UnknownError';

    // Log detailed error for Vercel logs
    console.error('Error details:', {
      message: errorMessage,
      code: errorCode,
      type: errorType,
      stack: error.stack,
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          message: errorMessage,
          code: errorCode,
          type: errorType,
        },
      },
      { status: 500 }
    );
  }
}
