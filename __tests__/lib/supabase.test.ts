import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import {
  createServerClient,
  createClientFromRequest,
  getAuthenticatedUser,
  getUserProfile,
  checkUserTier,
} from '@/lib/supabase';
import { createMockRequest } from '../helpers/test-utils';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

describe('Supabase Library', () => {
  const mockSupabaseClient = {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockReturnValue(mockSupabaseClient);
  });

  describe('createServerClient', () => {
    it('should create client with service role credentials', () => {
      createServerClient();

      expect(createClient).toHaveBeenCalledWith(
        'https://mock.supabase.co',
        'mock-service-key',
        expect.objectContaining({
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        })
      );
    });

    it('should return a SupabaseClient instance', () => {
      const client = createServerClient();
      expect(client).toBeDefined();
    });
  });

  describe('createClientFromRequest', () => {
    it('should create client with anon key and user token', () => {
      const request = createMockRequest({ token: 'user-jwt-token' });

      createClientFromRequest(request);

      expect(createClient).toHaveBeenCalledWith(
        'https://mock.supabase.co',
        'mock-anon-key',
        expect.objectContaining({
          global: {
            headers: { Authorization: 'Bearer user-jwt-token' },
          },
        })
      );
    });

    it('should handle request without authorization header', () => {
      const url = new URL('http://localhost:3000/api/test');
      const request = new NextRequest(url, {
        method: 'GET',
        headers: { 'content-type': 'application/json' },
      });

      createClientFromRequest(request);

      expect(createClient).toHaveBeenCalledWith(
        'https://mock.supabase.co',
        'mock-anon-key',
        expect.objectContaining({
          global: {
            headers: {},
          },
        })
      );
    });
  });

  describe('getAuthenticatedUser', () => {
    it('should return user when authenticated', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
      };
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const request = createMockRequest();
      const result = await getAuthenticatedUser(request);

      expect(result.user).toEqual(mockUser);
      expect(result.error).toBeNull();
    });

    it('should return error when user is not authenticated', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const request = createMockRequest();
      const result = await getAuthenticatedUser(request);

      expect(result.user).toBeNull();
      expect(result.error).toBe('Unauthorized');
    });

    it('should return error message when auth fails', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      const request = createMockRequest();
      const result = await getAuthenticatedUser(request);

      expect(result.user).toBeNull();
      expect(result.error).toBe('Invalid token');
    });
  });

  describe('getUserProfile', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
    };

    const mockProfile = {
      id: 'user-123',
      tier: 'pro',
      trial_ends_at: null,
    };

    it('should return profile for authenticated user', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockProfile,
          error: null,
        }),
      };
      mockSupabaseClient.from.mockReturnValue(mockChain);

      const request = createMockRequest();
      const result = await getUserProfile(request);

      expect(result.profile).toEqual(mockProfile);
      expect(result.error).toBeNull();
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('profiles');
    });

    it('should return error when user is not authenticated', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const request = createMockRequest();
      const result = await getUserProfile(request);

      expect(result.profile).toBeNull();
      expect(result.error).toBe('Unauthorized');
    });

    it('should return error when profile fetch fails', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Profile not found' },
        }),
      };
      mockSupabaseClient.from.mockReturnValue(mockChain);

      const request = createMockRequest();
      const result = await getUserProfile(request);

      expect(result.profile).toBeNull();
      expect(result.error).toBe('Profile not found');
    });
  });

  describe('checkUserTier', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
    };

    it('should allow access for matching tier', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'user-123', tier: 'pro', trial_ends_at: null },
          error: null,
        }),
      };
      mockSupabaseClient.from.mockReturnValue(mockChain);

      const request = createMockRequest();
      const result = await checkUserTier(request, ['basic', 'pro']);

      expect(result.allowed).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should deny access for non-matching tier', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'user-123', tier: 'basic', trial_ends_at: null },
          error: null,
        }),
      };
      mockSupabaseClient.from.mockReturnValue(mockChain);

      const request = createMockRequest();
      const result = await checkUserTier(request, ['pro']);

      expect(result.allowed).toBe(false);
      expect(result.error).toBe('Upgrade required');
    });

    it('should treat trial users as pro tier', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'user-123', tier: 'basic', trial_ends_at: futureDate },
          error: null,
        }),
      };
      mockSupabaseClient.from.mockReturnValue(mockChain);

      const request = createMockRequest();
      const result = await checkUserTier(request, ['pro']);

      expect(result.allowed).toBe(true);
    });

    it('should not treat expired trial as pro tier', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'user-123', tier: 'basic', trial_ends_at: pastDate },
          error: null,
        }),
      };
      mockSupabaseClient.from.mockReturnValue(mockChain);

      const request = createMockRequest();
      const result = await checkUserTier(request, ['pro']);

      expect(result.allowed).toBe(false);
    });

    it('should return error when profile fetch fails', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const request = createMockRequest();
      const result = await checkUserTier(request, ['pro']);

      expect(result.allowed).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });
  });
});
