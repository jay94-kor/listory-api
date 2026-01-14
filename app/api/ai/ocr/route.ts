import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/supabase';
import { getOpenAIClient, OCR_SYSTEM_PROMPT } from '@/lib/openai';

// Request validation schema
const requestSchema = z.object({
  image_url: z.string().url(),
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

    const { image_url } = parseResult.data;

    // Call OpenAI Vision API
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: OCR_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: image_url, detail: 'high' },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1000,
      temperature: 0.1, // Low temperature for accuracy
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        {
          success: false,
          error: { message: 'No response from AI', code: 'AI_ERROR' },
        },
        { status: 500 }
      );
    }

    // Parse AI response
    const extractedData = JSON.parse(content);

    return NextResponse.json({
      success: true,
      data: {
        ...extractedData,
        confidence: 0.95, // High confidence for GPT-4o Vision
      },
    });
  } catch (error) {
    console.error('OCR error:', error);

    // Handle specific OpenAI errors
    if (error instanceof Error && error.message.includes('rate_limit')) {
      return NextResponse.json(
        {
          success: false,
          error: { message: 'Rate limit exceeded. Please try again later.', code: 'RATE_LIMIT' },
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: { message: 'OCR processing failed', code: 'SERVER_ERROR' },
      },
      { status: 500 }
    );
  }
}
