import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser, checkUserTier, createServerClient } from '@/lib/supabase';
import { getOpenAIClient, ANALYSIS_SYSTEM_PROMPT } from '@/lib/openai';
import { checkRateLimit, recordUsage } from '@/lib/rate-limit';
import { analysisResponseSchema, tmiItemSchema, TmiItem } from '@/lib/schemas/ai-response';
import { sanitizeUserInput } from '@/lib/sanitize';

// Previous activity schema
const previousActivitySchema = z.object({
  type: z.string(),
  title: z.string(),
  date: z.string(),
});

// User profile schema
const userProfileSchema = z.object({
  name: z.string().optional(),
  company: z.string().optional(),
  position: z.string().optional(),
  product_info: z.string().optional(),
});

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
  // New context fields for enhanced analysis
  voice_memo: z.string().max(2000).optional(),
  previous_activities: z.array(previousActivitySchema).max(10).optional(),
  user_profile: userProfileSchema.optional(),
  materials_list: z.array(z.string()).max(20).optional(),
  previous_tmi: z.array(tmiItemSchema).max(20).optional(),
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

    const { 
      transcript, 
      lead_context, 
      voice_memo, 
      previous_activities, 
      user_profile, 
      materials_list, 
      previous_tmi 
    } = parseResult.data;

    const sanitizedTranscript = sanitizeUserInput(transcript);
    const sanitizedVoiceMemo = voice_memo ? sanitizeUserInput(voice_memo) : undefined;

    const contextParts: string[] = [];

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
        contextParts.push(`[고객 정보]\n${parts.join('\n')}`);
      }
    }

    if (previous_tmi && previous_tmi.length > 0) {
      const tmiLines = previous_tmi.map(
        (tmi) => `- [${tmi.category}] ${tmi.content}${tmi.context ? ` (${tmi.context})` : ''}`
      );
      contextParts.push(`[이전 TMI - 스몰톡에 활용하세요]\n${tmiLines.join('\n')}`);
    }

    if (sanitizedVoiceMemo) {
      contextParts.push(`[음성 메모]\n${sanitizedVoiceMemo}`);
    }

    if (previous_activities && previous_activities.length > 0) {
      const activityLines = previous_activities.map(
        (act) => `- ${act.date}: [${act.type}] ${act.title}`
      );
      contextParts.push(`[이전 활동]\n${activityLines.join('\n')}`);
    }

    if (user_profile) {
      const profileParts = [];
      if (user_profile.name) profileParts.push(`담당자명: ${user_profile.name}`);
      if (user_profile.company) profileParts.push(`소속: ${user_profile.company}`);
      if (user_profile.position) profileParts.push(`직책: ${user_profile.position}`);
      if (user_profile.product_info) profileParts.push(`제품/서비스: ${user_profile.product_info}`);
      if (profileParts.length > 0) {
        contextParts.push(`[영업 담당자]\n${profileParts.join('\n')}`);
      }
    }

    if (materials_list && materials_list.length > 0) {
      contextParts.push(`[발송 가능 자료]\n${materials_list.map((m) => `- ${m}`).join('\n')}`);
    }

    const contextString = contextParts.length > 0 ? '\n\n' + contextParts.join('\n\n') : '';

    // Call OpenAI API with retry logic
    const openai = getOpenAIClient();
    const maxRetries = 2;
    let lastError: any = null;
    let response;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`OpenAI API call attempt ${attempt + 1}/${maxRetries + 1}`);
        response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: ANALYSIS_SYSTEM_PROMPT,
            },
            {
              role: 'user',
              content: `다음 미팅 내용을 분석해주세요.${contextString}\n\n[미팅 녹취록]\n${sanitizedTranscript}`,
            },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 4000,
          temperature: 0.3,
        });
        break; // Success, exit retry loop
      } catch (err: any) {
        lastError = err;
        console.error(`OpenAI API attempt ${attempt + 1} failed:`, {
          message: err.message,
          code: err.code,
          type: err.type,
          status: err.status,
        });

        // Don't retry on authentication or rate limit errors
        if (err.status === 401 || err.status === 429) {
          throw err;
        }

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    if (!response) {
      throw lastError || new Error('OpenAI API call failed after retries');
    }

    if (response.usage) {
      console.log('Token usage:', {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens,
      });
    }

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

    // Validate AI response with Zod schema
    const validation = analysisResponseSchema.safeParse(analysisResult);
    if (!validation.success) {
      console.error('AI response validation failed:', validation.error);
      return NextResponse.json(
        {
          success: false,
          error: { 
            message: 'AI response validation failed', 
            code: 'PARSE_ERROR',
            details: validation.error.flatten()
          },
        },
        { status: 500 }
      );
    }
    analysisResult = validation.data; // Use validated data

    // Record usage after successful analysis
    await recordUsage(supabase, user.id, 'analyze');

    return NextResponse.json({
      success: true,
      data: analysisResult,
    });
  } catch (error: any) {
    console.error('Analysis error:', error);

    // Extract detailed error info
    const errorMessage = error.message || 'Analysis failed';
    const errorCode = error.code || error.status || 'SERVER_ERROR';
    const errorType = error.type || error.name || 'UnknownError';

    console.error('Analysis error details:', {
      message: errorMessage,
      code: errorCode,
      type: errorType,
    });

    if (errorMessage.includes('rate_limit')) {
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
        error: { message: errorMessage, code: errorCode, type: errorType },
      },
      { status: 500 }
    );
  }
}
