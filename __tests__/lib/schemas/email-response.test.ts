import { emailResponseSchema, EmailResponse } from '@/lib/schemas/email-response';

describe('emailResponseSchema', () => {
  describe('valid inputs', () => {
    it('should validate a complete email response', () => {
      const validData = {
        subject: 'Follow-up Meeting',
        body: 'Thank you for taking the time to meet with us yesterday. We discussed several important points.',
        tone_used: 'formal',
        context_references: ['meeting_notes', 'product_demo'],
      };

      const result = emailResponseSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.subject).toBe('Follow-up Meeting');
        expect(result.data.tone_used).toBe('formal');
      }
    });

    it('should validate email response without context_references', () => {
      const validData = {
        subject: 'Quick Follow-up',
        body: 'Just wanted to check in and see if you had any questions about our proposal.',
        tone_used: 'casual',
      };

      const result = emailResponseSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.context_references).toBeUndefined();
      }
    });

    it('should validate all tone options', () => {
      const tones: Array<'formal' | 'casual' | 'friendly'> = ['formal', 'casual', 'friendly'];

      tones.forEach((tone) => {
        const data = {
          subject: 'Test Subject',
          body: 'This is a test email body with sufficient length.',
          tone_used: tone,
        };

        const result = emailResponseSchema.safeParse(data);
        expect(result.success).toBe(true);
      });
    });

    it('should allow empty context_references array', () => {
      const validData = {
        subject: 'Subject',
        body: 'This is a valid email body with minimum length.',
        tone_used: 'friendly',
        context_references: [],
      };

      const result = emailResponseSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });

  describe('invalid inputs', () => {
    it('should reject empty subject', () => {
      const invalidData = {
        subject: '',
        body: 'This is a valid email body.',
        tone_used: 'formal',
      };

      const result = emailResponseSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject body shorter than 10 characters', () => {
      const invalidData = {
        subject: 'Subject',
        body: 'Short',
        tone_used: 'formal',
      };

      const result = emailResponseSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid tone', () => {
      const invalidData = {
        subject: 'Subject',
        body: 'This is a valid email body.',
        tone_used: 'aggressive',
      };

      const result = emailResponseSchema.safeParse(invalidData as any);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const invalidData = {
        subject: 'Subject',
      };

      const result = emailResponseSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject non-string context_references', () => {
      const invalidData = {
        subject: 'Subject',
        body: 'This is a valid email body.',
        tone_used: 'formal',
        context_references: [123, 456],
      };

      const result = emailResponseSchema.safeParse(invalidData as any);
      expect(result.success).toBe(false);
    });
  });

  describe('type inference', () => {
    it('should infer correct TypeScript type', () => {
      const validData = {
        subject: 'Test',
        body: 'This is a test email body.',
        tone_used: 'formal' as const,
        context_references: ['ref1'],
      };

      const result = emailResponseSchema.safeParse(validData);
      if (result.success) {
        const email: EmailResponse = result.data;
        expect(email.subject).toBeDefined();
        expect(email.body).toBeDefined();
        expect(email.tone_used).toBeDefined();
      }
    });
  });

  describe('passthrough behavior', () => {
    it('should allow additional properties', () => {
      const dataWithExtra = {
        subject: 'Subject',
        body: 'This is a valid email body.',
        tone_used: 'formal',
        extra_field: 'should be allowed',
      };

      const result = emailResponseSchema.safeParse(dataWithExtra);
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as any).extra_field).toBe('should be allowed');
      }
    });
  });
});
