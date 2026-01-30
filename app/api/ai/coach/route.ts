import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createHash } from 'crypto';
import { getAuthenticatedUser, checkUserTier, createServerClient } from '@/lib/supabase';
import { getOpenAIClient, COACHING_SYSTEM_PROMPT } from '@/lib/openai';
import { recordUsage } from '@/lib/rate-limit';
import { sanitizeUserInput } from '@/lib/sanitize';
import { coachingResponseSchema } from '@/lib/schemas/coaching-response';

// Request validation schema
const requestSchema = z.object({
  transcript_chunk: z.string().min(1).max(5000),
  context: z
    .object({
      lead_name: z.string().optional(),
      lead_company: z.string().optional(),
      meeting_topic: z.string().optional(),
      current_score: z.number().min(0).max(100).optional(),
    })
    .optional(),
  recent_tips: z.array(z.string()).max(50).optional(), // Tip hashes for deduplication
  meeting_start_time: z.string().optional(), // ISO timestamp
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

    // Check tier - coaching is Pro+ only
    const { allowed, error: tierError } = await checkUserTier(request, ['pro', 'business']);
    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Real-time coaching requires Pro or Business tier',
            code: 'TIER_ERROR',
          },
        },
        { status: 403 }
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

    const { transcript_chunk, context, recent_tips } = parseResult.data;

    // Sanitize user input
    const sanitizedTranscript = sanitizeUserInput(transcript_chunk);

    // Build context string
    let contextString = '';
    if (context) {
      const parts = [];
      if (context.lead_name) parts.push(`고객: ${context.lead_name}`);
      if (context.lead_company) parts.push(`회사: ${context.lead_company}`);
      if (context.meeting_topic) parts.push(`주제: ${context.meeting_topic}`);
      if (context.current_score !== undefined) {
        parts.push(`현재 점수: ${context.current_score}점`);
      }
      if (parts.length > 0) {
        contextString = `\n[상황] ${parts.join(', ')}\n`;
      }
    }

    // Call OpenAI API with short timeout for real-time response
    const openai = getOpenAIClient();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await openai.chat.completions.create(
        {
          model: 'gpt-4o-mini', // Fastest model
          messages: [
            {
              role: 'system',
              content: COACHING_SYSTEM_PROMPT,
            },
            {
              role: 'user',
              content: `${contextString}[대화]\n${sanitizedTranscript}`,
            },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 150, // Short response
          temperature: 0.5,
        },
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);

      const content = response.choices[0]?.message?.content;
      if (!content) {
        // No tip needed - graceful response
        return NextResponse.json({
          success: true,
          data: null,
        });
      }

      // Parse AI response
      let coachingResult;
      try {
        coachingResult = JSON.parse(content);
      } catch (parseError) {
        console.error('Failed to parse Coaching AI response:', content);
        return NextResponse.json({
          success: true,
          data: null,
        });
      }

      // If category is "none" or no tip, return null
      if (!coachingResult || coachingResult.category === 'none' || !coachingResult.tip) {
        return NextResponse.json({
          success: true,
          data: null,
        });
      }

      // Generate tip hash for deduplication
      const tipHash = createHash('md5')
        .update(coachingResult.tip)
        .digest('hex')
        .substring(0, 8);

      // Check if duplicate tip (15-minute deduplication window handled client-side)
      if (recent_tips?.includes(tipHash)) {
        return NextResponse.json({
          success: true,
          data: null,
        });
      }

      // Add tip_hash to result
      coachingResult.tip_hash = tipHash;

      // Validate coaching response format
      const validationResult = coachingResponseSchema.safeParse(coachingResult);
      if (!validationResult.success) {
        console.error('Coaching response validation failed:', validationResult.error);
        return NextResponse.json({
          success: true,
          data: null,
        });
      }

      // Log token usage
      if (response.usage) {
        console.log('Token usage:', {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
        });
      }

      // Record usage after successful coaching response
      const supabase = createServerClient();
      await recordUsage(supabase, user.id, 'coach');

      return NextResponse.json({
        success: true,
        data: validationResult.data,
      });
    } catch (abortError) {
      clearTimeout(timeoutId);
      // Timeout or abort - return graceful null response
      console.log('Coaching request timed out or aborted');
      return NextResponse.json({
        success: true,
        data: null,
      });
    }
  } catch (error) {
    console.error('Coaching error:', error);

    // For coaching, always return graceful response to not interrupt flow
    return NextResponse.json({
      success: true,
      data: null,
    });
  }
}
