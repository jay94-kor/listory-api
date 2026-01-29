import { SupabaseClient } from '@supabase/supabase-js';
import {
  RATE_LIMITS,
  checkRateLimit,
  recordUsage,
  getUsageStats,
} from '@/lib/rate-limit';

describe('Rate Limit Library', () => {
  describe('RATE_LIMITS configuration', () => {
    it('should define limits for all expected API types', () => {
      expect(RATE_LIMITS).toHaveProperty('transcribe');
      expect(RATE_LIMITS).toHaveProperty('ocr');
      expect(RATE_LIMITS).toHaveProperty('analyze');
      expect(RATE_LIMITS).toHaveProperty('email');
      expect(RATE_LIMITS).toHaveProperty('deepgram_token');
    });

    it('should have correct structure for each limit', () => {
      for (const [key, config] of Object.entries(RATE_LIMITS)) {
        expect(config).toHaveProperty('apiType');
        expect(config).toHaveProperty('tierLimits');
        expect(config.tierLimits).toHaveProperty('basic');
        expect(config.tierLimits).toHaveProperty('pro');
        expect(config.tierLimits).toHaveProperty('business');
        expect(config.apiType).toBe(key);
      }
    });

    it('should set basic tier limits to 3 for most API types', () => {
      expect(RATE_LIMITS.transcribe.tierLimits.basic).toBe(3);
      expect(RATE_LIMITS.ocr.tierLimits.basic).toBe(3);
      expect(RATE_LIMITS.analyze.tierLimits.basic).toBe(3);
      expect(RATE_LIMITS.email.tierLimits.basic).toBe(3);
    });

    it('should set pro and business tier limits to 0 (unlimited)', () => {
      expect(RATE_LIMITS.transcribe.tierLimits.pro).toBe(0);
      expect(RATE_LIMITS.transcribe.tierLimits.business).toBe(0);
      expect(RATE_LIMITS.ocr.tierLimits.pro).toBe(0);
      expect(RATE_LIMITS.ocr.tierLimits.business).toBe(0);
    });
  });

  describe('checkRateLimit', () => {
    function createMockSupabaseForCheck(count: number | null, error: any = null) {
      const thirdEq = jest.fn().mockResolvedValue({ count, error });
      const secondEq = jest.fn().mockReturnValue({ eq: thirdEq });
      const firstEq = jest.fn().mockReturnValue({ eq: secondEq });
      const select = jest.fn().mockReturnValue({ eq: firstEq });
      const from = jest.fn().mockReturnValue({ select });

      return { from } as unknown as SupabaseClient;
    }

    it('should allow unlimited usage for unknown API types', async () => {
      const mockSupabase = createMockSupabaseForCheck(0);

      const result = await checkRateLimit(
        mockSupabase,
        'user-123',
        'basic',
        'unknown_api'
      );

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(-1);
      expect(result.limit).toBe(0);
    });

    it('should allow unlimited usage for pro tier', async () => {
      const mockSupabase = createMockSupabaseForCheck(0);

      const result = await checkRateLimit(
        mockSupabase,
        'user-123',
        'pro',
        'transcribe'
      );

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(-1);
      expect(result.limit).toBe(0);
    });

    it('should allow usage when within limit for basic tier', async () => {
      const mockSupabase = createMockSupabaseForCheck(1);

      const result = await checkRateLimit(
        mockSupabase,
        'user-123',
        'basic',
        'transcribe'
      );

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
      expect(result.limit).toBe(3);
    });

    it('should deny usage when limit exceeded for basic tier', async () => {
      const mockSupabase = createMockSupabaseForCheck(5);

      const result = await checkRateLimit(
        mockSupabase,
        'user-123',
        'basic',
        'transcribe'
      );

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.limit).toBe(3);
    });

    it('should fail closed on database error (security measure)', async () => {
      const mockSupabase = createMockSupabaseForCheck(null, { message: 'Database error' });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await checkRateLimit(
        mockSupabase,
        'user-123',
        'basic',
        'transcribe'
      );

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('recordUsage', () => {
    it('should insert usage record with correct data', async () => {
      const insert = jest.fn().mockResolvedValue({ error: null });
      const from = jest.fn().mockReturnValue({ insert });
      const mockSupabase = { from } as unknown as SupabaseClient;

      await recordUsage(mockSupabase, 'user-123', 'transcribe');

      expect(from).toHaveBeenCalledWith('api_usage');
      expect(insert).toHaveBeenCalledWith({
        user_id: 'user-123',
        api_type: 'transcribe',
        month_year: expect.stringMatching(/^\d{4}-\d{2}$/),
      });
    });

    it('should log error but not throw on failure', async () => {
      const insert = jest.fn().mockResolvedValue({ error: { message: 'Insert failed' } });
      const from = jest.fn().mockReturnValue({ insert });
      const mockSupabase = { from } as unknown as SupabaseClient;

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(
        recordUsage(mockSupabase, 'user-123', 'transcribe')
      ).resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('getUsageStats', () => {
    function createMockSupabaseForStats(data: any[] | null, error: any = null) {
      const secondEq = jest.fn().mockResolvedValue({ data, error });
      const firstEq = jest.fn().mockReturnValue({ eq: secondEq });
      const select = jest.fn().mockReturnValue({ eq: firstEq });
      const from = jest.fn().mockReturnValue({ select });

      return { from } as unknown as SupabaseClient;
    }

    it('should return stats for all API types', async () => {
      const mockSupabase = createMockSupabaseForStats([
        { api_type: 'transcribe' },
        { api_type: 'transcribe' },
        { api_type: 'ocr' },
      ]);

      const stats = await getUsageStats(mockSupabase, 'user-123', 'basic');

      expect(stats).toHaveProperty('transcribe');
      expect(stats).toHaveProperty('ocr');
      expect(stats).toHaveProperty('analyze');
      expect(stats).toHaveProperty('email');
      expect(stats).toHaveProperty('deepgram_token');
    });

    it('should calculate used count correctly', async () => {
      const mockSupabase = createMockSupabaseForStats([
        { api_type: 'transcribe' },
        { api_type: 'transcribe' },
        { api_type: 'ocr' },
      ]);

      const stats = await getUsageStats(mockSupabase, 'user-123', 'basic');

      expect(stats.transcribe.used).toBe(2);
      expect(stats.ocr.used).toBe(1);
      expect(stats.analyze.used).toBe(0);
    });

    it('should show remaining for basic tier', async () => {
      const mockSupabase = createMockSupabaseForStats([
        { api_type: 'transcribe' },
        { api_type: 'transcribe' },
        { api_type: 'ocr' },
      ]);

      const stats = await getUsageStats(mockSupabase, 'user-123', 'basic');

      expect(stats.transcribe.limit).toBe(3);
      expect(stats.transcribe.remaining).toBe(1);
      expect(stats.ocr.remaining).toBe(2);
    });

    it('should show -1 for unlimited tiers', async () => {
      const mockSupabase = createMockSupabaseForStats([
        { api_type: 'transcribe' },
      ]);

      const stats = await getUsageStats(mockSupabase, 'user-123', 'pro');

      expect(stats.transcribe.limit).toBe(-1);
      expect(stats.transcribe.remaining).toBe(-1);
    });

    it('should return empty stats on database error', async () => {
      const mockSupabase = createMockSupabaseForStats(null, { message: 'Database error' });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const stats = await getUsageStats(mockSupabase, 'user-123', 'basic');

      expect(stats).toEqual({});
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
