import { SupabaseClient } from '@supabase/supabase-js';

export interface MockSupabaseOptions {
  userId?: string;
  tier?: 'free' | 'basic' | 'pro';
  isInTrial?: boolean;
  withinRateLimit?: boolean;
}

export function createMockSupabaseClient(options: MockSupabaseOptions = {}): Partial<SupabaseClient> {
  const {
    userId = 'test-user-123',
    tier = 'pro',
    isInTrial = false,
    withinRateLimit = true,
  } = options;

  const mockUser = {
    id: userId,
    email: 'test@example.com',
    user_metadata: {},
    app_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  };

  const mockProfile = {
    id: userId,
    tier,
    trial_ends_at: isInTrial ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockUsageRecord = {
    id: 'usage-123',
    user_id: userId,
    feature: 'test_feature',
    created_at: new Date().toISOString(),
  };

  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: mockUser },
        error: null,
      }),
      getSession: jest.fn().mockResolvedValue({
        data: { session: null },
        error: null,
      }),
    } as any,
    from: jest.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: mockProfile,
            error: null,
          }),
        };
      }

      if (table === 'usage') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          count: jest.fn().mockResolvedValue({
            count: withinRateLimit ? 5 : 1000,
            error: null,
          }),
          insert: jest.fn().mockResolvedValue({
            data: [mockUsageRecord],
            error: null,
          }),
        };
      }

      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
    }) as any,
  };
}

export function createMockSupabaseError(message: string) {
  return {
    message,
    status: 400,
    code: 'MOCK_ERROR',
  };
}
