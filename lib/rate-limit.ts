import { SupabaseClient } from '@supabase/supabase-js';

export interface RateLimitConfig {
  apiType: string;
  tierLimits: {
    basic: number; // 월별 제한 (0 = 무제한)
    pro: number;
    business: number;
  };
}

// API별 월간 사용량 제한 설정
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  transcribe: {
    apiType: 'transcribe',
    tierLimits: { basic: 10, pro: 0, business: 0 },
  },
  ocr: {
    apiType: 'ocr',
    tierLimits: { basic: 50, pro: 0, business: 0 },
  },
  analyze: {
    apiType: 'analyze',
    tierLimits: { basic: 20, pro: 0, business: 0 },
  },
  email: {
    apiType: 'email',
    tierLimits: { basic: 30, pro: 0, business: 0 },
  },
  deepgram_token: {
    apiType: 'deepgram_token',
    tierLimits: {
      basic: 0,      // Basic tier blocked from real-time features
      pro: 0,        // Unlimited monthly (per-minute limit handled in endpoint)
      business: 0,   // Unlimited monthly (per-minute limit handled in endpoint)
    },
  },
};

/**
 * 사용량 제한 체크
 * @returns allowed: 사용 가능 여부, remaining: 남은 횟수, limit: 총 제한
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string,
  tier: string,
  apiType: string
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const config = RATE_LIMITS[apiType];
  if (!config) return { allowed: true, remaining: -1, limit: 0 };

  const limit = config.tierLimits[tier as keyof typeof config.tierLimits] || 0;

  // 0 = 무제한
  if (limit === 0) return { allowed: true, remaining: -1, limit: 0 };

  const monthYear = new Date().toISOString().slice(0, 7); // '2026-01' 형식

  const { count, error } = await supabase
    .from('api_usage')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('api_type', apiType)
    .eq('month_year', monthYear);

  if (error) {
    console.error('Rate limit check error:', error);
    // SECURITY: Fail closed - deny on error to prevent rate limit bypass
    // If api_usage table doesn't exist, run the migration first
    return { allowed: false, remaining: 0, limit };
  }

  const used = count || 0;
  return {
    allowed: used < limit,
    remaining: Math.max(0, limit - used),
    limit,
  };
}

/**
 * API 사용량 기록
 */
export async function recordUsage(
  supabase: SupabaseClient,
  userId: string,
  apiType: string
): Promise<void> {
  const monthYear = new Date().toISOString().slice(0, 7);

  const { error } = await supabase.from('api_usage').insert({
    user_id: userId,
    api_type: apiType,
    month_year: monthYear,
  });

  if (error) {
    console.error('Usage recording error:', error);
    // 기록 실패해도 API는 진행
  }
}

/**
 * 사용량 조회 (사용자 대시보드용)
 */
export async function getUsageStats(
  supabase: SupabaseClient,
  userId: string,
  tier: string
): Promise<Record<string, { used: number; limit: number; remaining: number }>> {
  const monthYear = new Date().toISOString().slice(0, 7);

  const { data, error } = await supabase
    .from('api_usage')
    .select('api_type')
    .eq('user_id', userId)
    .eq('month_year', monthYear);

  if (error) {
    console.error('Usage stats error:', error);
    return {};
  }

  const stats: Record<string, { used: number; limit: number; remaining: number }> = {};

  for (const [apiType, config] of Object.entries(RATE_LIMITS)) {
    const limit = config.tierLimits[tier as keyof typeof config.tierLimits] || 0;
    const used = data?.filter((d) => d.api_type === apiType).length || 0;

    stats[apiType] = {
      used,
      limit: limit === 0 ? -1 : limit, // -1 = 무제한
      remaining: limit === 0 ? -1 : Math.max(0, limit - used),
    };
  }

  return stats;
}
