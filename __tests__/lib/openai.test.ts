import {
  getOpenAIClient,
  OCR_SYSTEM_PROMPT,
  ANALYSIS_SYSTEM_PROMPT,
  EMAIL_SYSTEM_PROMPT,
  COACHING_SYSTEM_PROMPT,
} from '@/lib/openai';

describe('OpenAI Library', () => {
  describe('getOpenAIClient', () => {
    it('should return an OpenAI client instance', () => {
      const client = getOpenAIClient();
      expect(client).toBeDefined();
      expect(client.chat).toBeDefined();
      expect(client.chat.completions).toBeDefined();
    });

    it('should return singleton instance on subsequent calls', () => {
      const client1 = getOpenAIClient();
      const client2 = getOpenAIClient();

      expect(client1).toBe(client2);
    });
  });

  describe('OCR_SYSTEM_PROMPT', () => {
    it('should be defined and contain business card OCR instructions', () => {
      expect(OCR_SYSTEM_PROMPT).toBeDefined();
      expect(typeof OCR_SYSTEM_PROMPT).toBe('string');
    });

    it('should contain JSON extraction fields', () => {
      expect(OCR_SYSTEM_PROMPT).toContain('name');
      expect(OCR_SYSTEM_PROMPT).toContain('company');
      expect(OCR_SYSTEM_PROMPT).toContain('position');
      expect(OCR_SYSTEM_PROMPT).toContain('email');
      expect(OCR_SYSTEM_PROMPT).toContain('phone');
    });

    it('should include Korean phone number formatting rules', () => {
      expect(OCR_SYSTEM_PROMPT).toContain('010-');
      expect(OCR_SYSTEM_PROMPT).toContain('02-');
    });

    it('should require valid JSON output', () => {
      expect(OCR_SYSTEM_PROMPT).toContain('valid JSON');
    });
  });

  describe('ANALYSIS_SYSTEM_PROMPT', () => {
    it('should be defined and contain meeting analysis instructions', () => {
      expect(ANALYSIS_SYSTEM_PROMPT).toBeDefined();
      expect(typeof ANALYSIS_SYSTEM_PROMPT).toBe('string');
    });

    it('should reference customer info section', () => {
      expect(ANALYSIS_SYSTEM_PROMPT).toContain('[고객 정보]');
    });

    it('should contain analysis fields', () => {
      expect(ANALYSIS_SYSTEM_PROMPT).toContain('summary');
      expect(ANALYSIS_SYSTEM_PROMPT).toContain('needs');
      expect(ANALYSIS_SYSTEM_PROMPT).toContain('positive_signals');
      expect(ANALYSIS_SYSTEM_PROMPT).toContain('negative_signals');
      expect(ANALYSIS_SYSTEM_PROMPT).toContain('suggested_score');
      expect(ANALYSIS_SYSTEM_PROMPT).toContain('action_plan');
    });

    it('should handle STT name errors correctly', () => {
      expect(ANALYSIS_SYSTEM_PROMPT).toContain('STT');
      expect(ANALYSIS_SYSTEM_PROMPT).toContain('mishear');
    });

    it('should specify Korean language for content', () => {
      expect(ANALYSIS_SYSTEM_PROMPT).toContain('Korean');
    });
  });

  describe('EMAIL_SYSTEM_PROMPT', () => {
    it('should be defined and contain email writing instructions', () => {
      expect(EMAIL_SYSTEM_PROMPT).toBeDefined();
      expect(typeof EMAIL_SYSTEM_PROMPT).toBe('string');
    });

    it('should contain context utilization section', () => {
      expect(EMAIL_SYSTEM_PROMPT).toContain('CONTEXT UTILIZATION');
    });

    it('should contain email structure guidelines', () => {
      expect(EMAIL_SYSTEM_PROMPT).toContain('Subject Line');
      expect(EMAIL_SYSTEM_PROMPT).toContain('Opening');
      expect(EMAIL_SYSTEM_PROMPT).toContain('Body');
      expect(EMAIL_SYSTEM_PROMPT).toContain('Closing');
      expect(EMAIL_SYSTEM_PROMPT).toContain('Signature');
    });

    it('should specify tone matching rules', () => {
      expect(EMAIL_SYSTEM_PROMPT).toContain('formal');
      expect(EMAIL_SYSTEM_PROMPT).toContain('casual');
      expect(EMAIL_SYSTEM_PROMPT).toContain('friendly');
    });

    it('should include common mistakes section', () => {
      expect(EMAIL_SYSTEM_PROMPT).toContain('COMMON MISTAKES');
    });

    it('should return JSON with subject and body', () => {
      expect(EMAIL_SYSTEM_PROMPT).toContain('"subject"');
      expect(EMAIL_SYSTEM_PROMPT).toContain('"body"');
    });
  });

  describe('COACHING_SYSTEM_PROMPT', () => {
    it('should be defined and contain coaching instructions', () => {
      expect(COACHING_SYSTEM_PROMPT).toBeDefined();
      expect(typeof COACHING_SYSTEM_PROMPT).toBe('string');
    });

    it('should contain context awareness section', () => {
      expect(COACHING_SYSTEM_PROMPT).toContain('CONTEXT AWARENESS');
      expect(COACHING_SYSTEM_PROMPT).toContain('SALESPERSON');
      expect(COACHING_SYSTEM_PROMPT).toContain('CUSTOMER');
    });

    it('should contain coaching tip guidelines', () => {
      expect(COACHING_SYSTEM_PROMPT).toContain('High-Priority Triggers');
      expect(COACHING_SYSTEM_PROMPT).toContain('Medium-Priority Triggers');
    });

    it('should handle pricing objections', () => {
      expect(COACHING_SYSTEM_PROMPT).toContain('비싸네요');
      expect(COACHING_SYSTEM_PROMPT).toContain('예산');
    });

    it('should specify output format', () => {
      expect(COACHING_SYSTEM_PROMPT).toContain('"tip"');
      expect(COACHING_SYSTEM_PROMPT).toContain('"category"');
      expect(COACHING_SYSTEM_PROMPT).toContain('"priority"');
    });

    it('should include Korean business culture tips', () => {
      expect(COACHING_SYSTEM_PROMPT).toContain('Korean Business Culture');
      expect(COACHING_SYSTEM_PROMPT).toContain('합니다/습니다');
    });
  });
});
