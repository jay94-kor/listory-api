import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Health check endpoint for monitoring
// SECURITY: Does not expose configuration details or environment variable names
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const checks: Record<string, { status: 'ok' | 'error'; latency?: number }> = {};

  // 1. Check Supabase connection
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      checks.database = { status: 'error' };
    } else {
      const supabaseStart = Date.now();
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { error } = await supabase.from('profiles').select('count').limit(1).single();

      checks.database = {
        status: error && error.code !== 'PGRST116' ? 'error' : 'ok',
        latency: Date.now() - supabaseStart,
      };
    }
  } catch (e) {
    checks.database = { status: 'error' };
  }

  // 2. Check AI services (without revealing which specific service)
  const aiConfigured = !!(process.env.OPENAI_API_KEY && process.env.ASSEMBLY_AI_API_KEY);
  checks.ai_services = { status: aiConfigured ? 'ok' : 'error' };

  // 3. Check storage (AWS S3)
  const storageConfigured = !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_S3_BUCKET
  );
  checks.storage = { status: storageConfigured ? 'ok' : 'error' };

  // Overall status
  const allOk = Object.values(checks).every((c) => c.status === 'ok');
  const totalLatency = Date.now() - startTime;

  return NextResponse.json(
    {
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      latency: totalLatency,
      checks,
    },
    { status: allOk ? 200 : 503 }
  );
}
