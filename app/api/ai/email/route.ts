import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser, checkUserTier, createServerClient } from '@/lib/supabase';
import { getOpenAIClient, EMAIL_SYSTEM_PROMPT } from '@/lib/openai';
import { checkRateLimit, recordUsage } from '@/lib/rate-limit';
import { sanitizeUserInput } from '@/lib/sanitize';
import { emailResponseSchema } from '@/lib/schemas/email-response';

// Request validation schema
const requestSchema = z.object({
  lead: z.object({
    name: z.string(),
    company: z.string(),
    position: z.string().optional(),
    email: z.string().email().optional(),
    meeting_summary: z.string().optional(),
    needs: z.array(z.string()).optional(),
    action_plan: z.array(z.object({
      title: z.string(),
      type: z.string(),
    })).optional(),
  }),
  type: z.enum(['followup', 'introduction', 'thank_you', 'proposal', 'material_send']),
  tone: z.enum(['formal', 'casual', 'friendly']).default('formal'),
  sender_name: z.string(),
  sender_company: z.string().optional(),
  sender_position: z.string().optional(),
  custom_instructions: z.string().optional(),
  current_time: z.string().optional(),
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
      'email'
    );

    if (!withinLimit) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: `Monthly email generation limit reached (${limit}/month for Basic plan). Upgrade to Pro for unlimited access.`,
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
      lead,
      type,
      tone,
      sender_name,
      sender_company,
      sender_position,
      custom_instructions,
      current_time,
    } = parseResult.data;

    // Build email type description
    const typeDescriptions: Record<string, string> = {
      followup: '미팅 후속 이메일',
      introduction: '자기소개 이메일',
      thank_you: '감사 인사 이메일',
      proposal: '제안서 송부 이메일',
      material_send: '자료 송부 이메일',
    };

    const toneDescriptions: Record<string, string> = {
      formal: '격식체 (비즈니스)',
      casual: '평어체 (친근한)',
      friendly: '친근하면서도 전문적인',
    };

    // Build context for AI
    let contextParts = [
      `이메일 유형: ${typeDescriptions[type]}`,
      `어조: ${toneDescriptions[tone]}`,
      ``,
      `[받는 사람]`,
      `이름: ${lead.name}`,
      `회사: ${lead.company}`,
    ];

    if (lead.position) contextParts.push(`직책: ${lead.position}`);

    contextParts.push('', `[보내는 사람]`, `이름: ${sender_name}`);
    if (sender_company) contextParts.push(`회사: ${sender_company}`);
    if (sender_position) contextParts.push(`직책: ${sender_position}`);

    if (lead.meeting_summary) {
      contextParts.push('', `[미팅 요약]`, lead.meeting_summary);
    }

    if (lead.needs && lead.needs.length > 0) {
      contextParts.push('', `[고객 니즈]`, ...lead.needs.map((n) => `- ${n}`));
    }

    if (lead.action_plan && lead.action_plan.length > 0) {
      contextParts.push(
        '',
        `[액션 플랜]`,
        ...lead.action_plan.map((a) => `- ${a.title} (${a.type})`)
      );
    }

    if (custom_instructions) {
      contextParts.push('', `[추가 지시사항]`, sanitizeUserInput(custom_instructions));
    }

    if (current_time) {
      const date = new Date(current_time);
      const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
      const hour = date.getHours();
      contextParts.push('', `[현재 시간 정보]`, `요일: ${dayOfWeek}요일, 시간: ${hour}시`);
    }

    // Call OpenAI API
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Faster model for email generation
      messages: [
        {
          role: 'system',
          content: EMAIL_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: contextParts.join('\n'),
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 2000,
      temperature: 0.7, // Some creativity for natural emails
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
    let emailResult;
    try {
      emailResult = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse Email AI response:', content);
      return NextResponse.json(
        {
          success: false,
          error: { message: 'AI response parsing failed', code: 'PARSE_ERROR' },
        },
        { status: 500 }
      );
    }

    // Validate email response format
    const validationResult = emailResponseSchema.safeParse(emailResult);
    if (!validationResult.success) {
      console.error('Email response validation failed:', validationResult.error);
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Invalid email response format',
            code: 'VALIDATION_ERROR',
          },
        },
        { status: 500 }
      );
    }

    // Log token usage
    if (response.usage) {
      console.log('Token usage:', {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens,
      });
    }

    // Record usage after successful email generation
    await recordUsage(supabase, user.id, 'email');

    return NextResponse.json({
      success: true,
      data: {
        subject: validationResult.data.subject,
        body: validationResult.data.body,
        tone_used: validationResult.data.tone_used,
        type: type,
        tone: tone,
      },
    });
  } catch (error) {
    console.error('Email generation error:', error);

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
        error: { message: 'Email generation failed', code: 'SERVER_ERROR' },
      },
      { status: 500 }
    );
  }
}
