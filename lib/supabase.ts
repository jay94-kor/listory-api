import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

// Server-side Supabase client with service role (for admin operations)
export function createServerClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Client-side Supabase client from request (uses user's token)
export function createClientFromRequest(request: NextRequest): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

  // Get authorization header
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return client;
}

// Helper to get authenticated user from request
export async function getAuthenticatedUser(request: NextRequest) {
  const client = createClientFromRequest(request);
  const { data: { user }, error } = await client.auth.getUser();

  if (error || !user) {
    return { user: null, error: error?.message || 'Unauthorized' };
  }

  return { user, error: null };
}

// Helper to get user's profile
export async function getUserProfile(request: NextRequest) {
  const client = createClientFromRequest(request);
  const { data: { user }, error: authError } = await client.auth.getUser();

  if (authError || !user) {
    return { profile: null, error: authError?.message || 'Unauthorized' };
  }

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profileError) {
    return { profile: null, error: profileError.message };
  }

  return { profile, error: null };
}

// Helper to check user tier
export async function checkUserTier(request: NextRequest, requiredTiers: string[]) {
  const { profile, error } = await getUserProfile(request);

  if (error || !profile) {
    return { allowed: false, profile: null, error: error || 'Unauthorized' };
  }

  // Check if user is in trial period
  const isInTrial = profile.trial_ends_at && new Date(profile.trial_ends_at) > new Date();

  // If in trial, treat as 'pro' tier
  const effectiveTier = isInTrial ? 'pro' : profile.tier;

  const allowed = requiredTiers.includes(effectiveTier);

  return { allowed, profile, error: allowed ? null : 'Upgrade required' };
}
