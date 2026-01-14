import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Health check endpoint for monitoring
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const checks: Record<string, { status: 'ok' | 'error'; latency?: number; error?: string }> = {};

  // 1. Check Supabase connection
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      const missing = [];
      if (!supabaseUrl) missing.push('URL');
      if (!supabaseServiceKey) missing.push('SERVICE_KEY');
      if (!supabaseAnonKey) missing.push('ANON_KEY');
      checks.supabase = { status: 'error', error: `Missing: ${missing.join(', ')}` };
    } else {
      const supabaseStart = Date.now();
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Simple query to test connection
      const { error } = await supabase.from('users').select('count').limit(1).single();

      checks.supabase = {
        status: error && error.code !== 'PGRST116' ? 'error' : 'ok',
        latency: Date.now() - supabaseStart,
        ...(error && error.code !== 'PGRST116' && { error: error.message }),
      };
    }
  } catch (e) {
    checks.supabase = { status: 'error', error: e instanceof Error ? e.message : 'Unknown error' };
  }

  // 2. Check OpenAI API key configuration
  const openaiKey = process.env.OPENAI_API_KEY;
  checks.openai = {
    status: openaiKey && openaiKey.startsWith('sk-') ? 'ok' : 'error',
    ...((!openaiKey || !openaiKey.startsWith('sk-')) && { error: 'Invalid or missing API key' }),
  };

  // 3. Check AssemblyAI configuration (All tiers STT)
  const assemblyaiKey = process.env.ASSEMBLYAI_API_KEY;
  checks.assemblyai = {
    status: assemblyaiKey ? 'ok' : 'error',
    ...(!assemblyaiKey && { error: 'Missing API key' }),
  };

  // 4. Check Deepgram configuration (Pro/Business tier STT - additional)
  const deepgramKey = process.env.DEEPGRAM_API_KEY;
  checks.deepgram = {
    status: deepgramKey ? 'ok' : 'error',
    ...(!deepgramKey && { error: 'Missing API key' }),
  };

  // 5. Check R2 configuration
  const r2Configured =
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME;
  checks.r2_storage = {
    status: r2Configured ? 'ok' : 'error',
    ...(!r2Configured && { error: 'Missing R2 configuration' }),
  };

  // Overall status
  const allOk = Object.values(checks).every((c) => c.status === 'ok');
  const totalLatency = Date.now() - startTime;

  return NextResponse.json(
    {
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      latency: totalLatency,
      checks,
    },
    { status: allOk ? 200 : 503 }
  );
}
