import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser, checkUserTier, createServerClient } from '@/lib/supabase';
import { getOpenAIClient, ANALYSIS_SYSTEM_PROMPT } from '@/lib/openai';
import { checkRateLimit, recordUsage } from '@/lib/rate-limit';

// Request validation schema
const requestSchema = z.object({
  transcript: z.string().min(10),
  lead_context: z
    .object({
      name: z.string().optional(),
      company: z.string().optional(),
      position: z.string().optional(),
      previous_meetings: z.number().optional(),
      current_status: z.enum(['hot', 'warm', 'cold']).optional(),
      current_score: z.number().min(0).max(100).optional(),
    })
    .optional(),
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
      'analyze'
    );

    if (!withinLimit) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: `Monthly analysis limit reached (${limit}/month for Basic plan). Upgrade to Pro for unlimited access.`,
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

    const { transcript, lead_context } = parseResult.data;

    // Build context string
    let contextString = '';
    if (lead_context) {
      const parts = [];
      if (lead_context.name) parts.push(`고객명: ${lead_context.name}`);
      if (lead_context.company) parts.push(`회사: ${lead_context.company}`);
      if (lead_context.position) parts.push(`직책: ${lead_context.position}`);
      if (lead_context.previous_meetings !== undefined) {
        parts.push(`이전 미팅 횟수: ${lead_context.previous_meetings}회`);
      }
      if (lead_context.current_status) {
        parts.push(`현재 상태: ${lead_context.current_status}`);
      }
      if (lead_context.current_score !== undefined) {
        parts.push(`현재 점수: ${lead_context.current_score}점`);
      }
      if (parts.length > 0) {
        contextString = `\n\n[고객 정보]\n${parts.join('\n')}`;
      }
    }

    // Call OpenAI API
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: ANALYSIS_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: `다음 미팅 내용을 분석해주세요.${contextString}\n\n[미팅 녹취록]\n${transcript}`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 4000,
      temperature: 0.3,
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
    let analysisResult;
    try {
      analysisResult = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse Analysis AI response:', content);
      return NextResponse.json(
        {
          success: false,
          error: { message: 'AI response parsing failed', code: 'PARSE_ERROR' },
        },
        { status: 500 }
      );
    }

    // Record usage after successful analysis
    await recordUsage(supabase, user.id, 'analyze');

    return NextResponse.json({
      success: true,
      data: analysisResult,
    });
  } catch (error) {
    console.error('Analysis error:', error);

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
        error: { message: 'Analysis failed', code: 'SERVER_ERROR' },
      },
      { status: 500 }
    );
  }
}
