import { coachingResponseSchema, CoachingResponse } from '@/lib/schemas/coaching-response';

describe('coachingResponseSchema', () => {
  describe('valid coaching response', () => {
    it('should validate a complete coaching response', () => {
      const validResponse = {
        tip: 'This is a valid coaching tip with sufficient length',
        category: 'objection_handling',
        priority: 'high',
        knowledge_base_reference: 'Document A, Page 3',
        tip_hash: 'abc123def456',
        meeting_stage: 'discovery',
      };

      const result = coachingResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validResponse);
      }
    });

    it('should validate response without optional fields', () => {
      const minimalResponse = {
        tip: 'This is a valid coaching tip with sufficient length',
        category: 'closing',
        priority: 'medium',
        tip_hash: 'hash123',
      };

      const result = coachingResponseSchema.safeParse(minimalResponse);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(minimalResponse);
      }
    });

    it('should validate all category enum values', () => {
      const categories = ['objection_handling', 'closing', 'rapport', 'information', 'none'] as const;

      categories.forEach((category) => {
        const response = {
          tip: 'This is a valid coaching tip with sufficient length',
          category,
          priority: 'low',
          tip_hash: 'hash123',
        };

        const result = coachingResponseSchema.safeParse(response);
        expect(result.success).toBe(true);
      });
    });

    it('should validate all priority enum values', () => {
      const priorities = ['high', 'medium', 'low'] as const;

      priorities.forEach((priority) => {
        const response = {
          tip: 'This is a valid coaching tip with sufficient length',
          category: 'information',
          priority,
          tip_hash: 'hash123',
        };

        const result = coachingResponseSchema.safeParse(response);
        expect(result.success).toBe(true);
      });
    });

    it('should validate all meeting_stage enum values', () => {
      const stages = ['opening', 'discovery', 'presentation', 'negotiation', 'closing'] as const;

      stages.forEach((stage) => {
        const response = {
          tip: 'This is a valid coaching tip with sufficient length',
          category: 'rapport',
          priority: 'high',
          tip_hash: 'hash123',
          meeting_stage: stage,
        };

        const result = coachingResponseSchema.safeParse(response);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('nullable support', () => {
    it('should accept null value', () => {
      const result = coachingResponseSchema.safeParse(null);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });
  });

  describe('invalid coaching response', () => {
    it('should reject tip shorter than 10 characters', () => {
      const invalidResponse = {
        tip: 'short',
        category: 'closing',
        priority: 'high',
        tip_hash: 'hash123',
      };

      const result = coachingResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('should reject tip longer than 200 characters', () => {
      const invalidResponse = {
        tip: 'a'.repeat(201),
        category: 'closing',
        priority: 'high',
        tip_hash: 'hash123',
      };

      const result = coachingResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('should reject invalid category', () => {
      const invalidResponse = {
        tip: 'This is a valid coaching tip with sufficient length',
        category: 'invalid_category',
        priority: 'high',
        tip_hash: 'hash123',
      };

      const result = coachingResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('should reject invalid priority', () => {
      const invalidResponse = {
        tip: 'This is a valid coaching tip with sufficient length',
        category: 'closing',
        priority: 'urgent',
        tip_hash: 'hash123',
      };

      const result = coachingResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('should reject invalid meeting_stage', () => {
      const invalidResponse = {
        tip: 'This is a valid coaching tip with sufficient length',
        category: 'closing',
        priority: 'high',
        tip_hash: 'hash123',
        meeting_stage: 'invalid_stage',
      };

      const result = coachingResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const invalidResponse = {
        tip: 'This is a valid coaching tip with sufficient length',
        category: 'closing',
      };

      const result = coachingResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });
  });

  describe('type inference', () => {
    it('should correctly infer CoachingResponse type', () => {
      const response: CoachingResponse = {
        tip: 'This is a valid coaching tip with sufficient length',
        category: 'closing',
        priority: 'high',
        tip_hash: 'hash123',
        meeting_stage: 'discovery',
      };

      expect(response).toBeDefined();
    });

    it('should allow null for CoachingResponse type', () => {
      const response: CoachingResponse = null;
      expect(response).toBeNull();
    });
  });
});
