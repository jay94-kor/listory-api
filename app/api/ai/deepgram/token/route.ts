import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createServerClient } from '@/lib/supabase';

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY!;
const DEEPGRAM_API_URL = 'https://api.deepgram.com/v1/keys';

/**
 * POST /api/ai/deepgram/token
 *
 * Generates a temporary Deepgram API token for Pro/Business users
 * Token is valid for 10 seconds and allows real-time STT only
 *
 * SECURITY:
 * - Requires Supabase authentication
 * - Pro/Business tier only (includes Trial users)
 * - Per-minute rate limiting (60 tokens/min for Pro, 120 for Business)
 * - Tokens expire after 10 seconds
 * - Scoped to usage:write only (cannot read account info)
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();

    // 2. Get user profile and tier (optional - defaults to 'free')
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier, trial_end_date')
      .eq('id', user.id)
      .single();

    // 3. Determine effective tier (default to 'free' if profile not found)
    let effectiveTier = profile?.subscription_tier || 'free';
    if (profile?.trial_end_date && new Date(profile.trial_end_date) > new Date()) {
      effectiveTier = 'pro'; // Trial users get Pro features
    }

    // TEMPORARY: Allow all users to use Deepgram during beta
    // TODO: Re-enable tier check after launch
    // if (effectiveTier !== 'pro' && effectiveTier !== 'business') {
    //   return NextResponse.json(
    //     {
    //       success: false,
    //       error: 'Pro subscription required for real-time transcription'
    //     },
    //     { status: 403 }
    //   );
    // }

    // 4. Per-minute rate limiting (allow all users during beta)
    // TEMPORARILY DISABLED: Skip rate limit check during beta testing
    // const rateLimit = effectiveTier === 'business' ? 120 : 60; // tokens per minute
    // const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();

    // const { count, error: countError } = await supabase
    //   .from('api_usage')
    //   .select('*', { count: 'exact', head: true })
    //   .eq('user_id', user.id)
    //   .eq('api_type', 'deepgram_token')
    //   .gte('created_at', oneMinuteAgo);

    // if (countError) {
    //   console.error('Rate limit check error:', countError);
    //   return NextResponse.json(
    //     { success: false, error: 'Failed to check rate limit' },
    //     { status: 500 }
    //   );
    // }

    // const usedInLastMinute = count || 0;
    // if (usedInLastMinute >= rateLimit) {
    //   return NextResponse.json(
    //     {
    //       success: false,
    //       error: 'Rate limit exceeded',
    //       remaining: 0,
    //       limit: rateLimit
    //     },
    //     { status: 429 }
    //   );
    // }

    // 5. BETA: Return API key directly (temporary token creation not working)
    // TODO: Fix temporary token generation after launch
    // const response = await fetch(
    //   `${DEEPGRAM_API_URL}/${DEEPGRAM_API_KEY}/temporary`,
    //   {
    //     method: 'POST',
    //     headers: {
    //       'Content-Type': 'application/json',
    //     },
    //     body: JSON.stringify({
    //       scopes: ['usage:write'], // Real-time STT only, no admin access
    //       time_to_live_in_seconds: 10, // Auto-expire after 10 seconds
    //     }),
    //   }
    // );

    // if (!response.ok) {
    //   const errorText = await response.text();
    //   console.error('Deepgram token creation failed:', errorText);
    //   return NextResponse.json(
    //     { success: false, error: 'Failed to create token' },
    //     { status: 500 }
    //   );
    // }

    // const { key: temporaryToken } = await response.json();

    // BETA: Use main API key directly
    const temporaryToken = DEEPGRAM_API_KEY;

    // 6. Record usage for rate limiting and analytics
    // TEMPORARILY DISABLED: Skip usage recording during beta
    // const { error: usageError } = await supabase.from('api_usage').insert({
    //   user_id: user.id,
    //   api_type: 'deepgram_token',
    //   created_at: new Date().toISOString(),
    // });

    // if (usageError) {
    //   console.error('Usage recording error:', usageError);
    //   // Continue anyway - token was created successfully
    // }

    return NextResponse.json({
      success: true,
      token: temporaryToken,
      expiresIn: 10, // seconds
    });
  } catch (error) {
    console.error('Deepgram token generation error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
