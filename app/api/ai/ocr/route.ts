import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser, checkUserTier, createServerClient } from '@/lib/supabase';
import { getOpenAIClient, OCR_SYSTEM_PROMPT } from '@/lib/openai';
import { checkRateLimit, recordUsage } from '@/lib/rate-limit';
import { generateDownloadUrl } from '@/lib/s3';

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

    // Check tier
    const { allowed, profile, error: tierError } = await checkUserTier(request, ['basic', 'pro', 'business']);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { message: tierError || 'Subscription required', code: 'TIER_ERROR' } },
        { status: 403 }
      );
    }

    // Rate limiting
    const supabase = createServerClient();
    const effectiveTier = profile?.tier || 'basic';
    const { allowed: withinLimit, remaining, limit } = await checkRateLimit(
      supabase,
      user.id,
      effectiveTier,
      'ocr'
    );

    if (!withinLimit) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: `Monthly OCR limit reached (${limit}/month for Basic plan). Upgrade to Pro for unlimited access.`,
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

    const { image_url } = parseResult.data;

    // Extract S3 key from public URL and generate presigned URL for OpenAI access
    let accessibleUrl = image_url;
    const s3UrlPattern = /https:\/\/([^.]+)\.s3\.([^.]+)\.amazonaws\.com\/(.+)/;
    const match = image_url.match(s3UrlPattern);

    if (match) {
      const key = decodeURIComponent(match[3]);
      try {
        // Generate presigned download URL (valid for 15 minutes)
        accessibleUrl = await generateDownloadUrl(key, 900);
        console.log('Generated presigned URL for S3 key:', key);
      } catch (s3Error) {
        console.error('Failed to generate presigned URL:', s3Error);
        // Continue with original URL as fallback
      }
    }

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
              image_url: { url: accessibleUrl, detail: 'high' },
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
    let extractedData;
    try {
      extractedData = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse OCR AI response:', content);
      return NextResponse.json(
        {
          success: false,
          error: { message: 'AI response parsing failed', code: 'PARSE_ERROR' },
        },
        { status: 500 }
      );
    }

    // Record usage after successful OCR
    await recordUsage(supabase, user.id, 'ocr');

    return NextResponse.json({
      success: true,
      data: {
        ...extractedData,
        confidence: 0.95, // High confidence for GPT-4o Vision
      },
    });
  } catch (error) {
    console.error('OCR error:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    // Handle specific OpenAI errors
    if (errorMessage.includes('rate_limit')) {
      return NextResponse.json(
        {
          success: false,
          error: { message: 'Rate limit exceeded. Please try again later.', code: 'RATE_LIMIT' },
        },
        { status: 429 }
      );
    }

    // Handle invalid API key
    if (errorMessage.includes('Incorrect API key') || errorMessage.includes('invalid_api_key')) {
      return NextResponse.json(
        {
          success: false,
          error: { message: 'AI service configuration error', code: 'CONFIG_ERROR' },
        },
        { status: 500 }
      );
    }

    // Handle image URL access errors
    if (errorMessage.includes('Could not process image') || errorMessage.includes('Invalid image')) {
      return NextResponse.json(
        {
          success: false,
          error: { message: '이미지를 처리할 수 없습니다. 다른 이미지로 시도해주세요.', code: 'IMAGE_ERROR' },
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          message: `OCR 처리 실패: ${errorMessage.substring(0, 100)}`,
          code: 'SERVER_ERROR'
        },
      },
      { status: 500 }
    );
  }
}
