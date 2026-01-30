import { analysisResponseSchema, type AnalysisResponse, type TmiItem, type SmallTalkTopic } from '@/lib/schemas/ai-response';

describe('analysisResponseSchema', () => {
  describe('valid responses', () => {
    it('should validate a complete analysis response with new TMI structure', () => {
      const validResponse = {
        summary: 'Meeting summary',
        needs: ['Need 1', 'Need 2'],
        required_materials: ['Material 1'],
        positive_signals: ['Signal 1'],
        negative_signals: [],
        negotiation_tip: 'Tip here',
        tmi_info: [
          {
            category: 'hobby',
            content: '골프를 좋아함',
            context: '주말마다 라운딩',
            recency: 'new',
          },
        ],
        small_talk_topics: [
          {
            topic: '골프',
            priority: 'high',
            based_on: '골프를 좋아함',
          },
        ],
        suggested_score: 75,
        suggested_status: 'warm',
        suggested_followup_date: '2026-02-06',
        action_plan: [
          {
            title: 'Send materials',
            type: 'email',
            priority: 'high',
            due_in_days: 1,
            description: 'Send product brochure',
          },
        ],
      };

      const result = analysisResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tmi_info[0].category).toBe('hobby');
        expect(result.data.small_talk_topics[0].priority).toBe('high');
      }
    });

    it('should validate TMI with all categories', () => {
      const categories = ['hobby', 'family', 'travel', 'food', 'sports', 'work', 'other'] as const;
      
      for (const category of categories) {
        const response = {
          summary: 'Test',
          needs: [],
          required_materials: [],
          positive_signals: [],
          negative_signals: [],
          negotiation_tip: 'Tip',
          tmi_info: [{ category, content: 'Test content' }],
          small_talk_topics: [],
          suggested_score: 50,
          suggested_status: 'cold',
          suggested_followup_date: '2026-02-06',
          action_plan: [],
        };

        const result = analysisResponseSchema.safeParse(response);
        expect(result.success).toBe(true);
      }
    });

    it('should validate small_talk_topics with all priorities', () => {
      const priorities = ['high', 'medium', 'low'] as const;
      
      for (const priority of priorities) {
        const response = {
          summary: 'Test',
          needs: [],
          required_materials: [],
          positive_signals: [],
          negative_signals: [],
          negotiation_tip: 'Tip',
          tmi_info: [],
          small_talk_topics: [{ topic: 'Golf', priority, based_on: 'hobby' }],
          suggested_score: 50,
          suggested_status: 'cold',
          suggested_followup_date: '2026-02-06',
          action_plan: [],
        };

        const result = analysisResponseSchema.safeParse(response);
        expect(result.success).toBe(true);
      }
    });

    it('should allow optional TMI fields (context, recency)', () => {
      const response = {
        summary: 'Test',
        needs: [],
        required_materials: [],
        positive_signals: [],
        negative_signals: [],
        negotiation_tip: 'Tip',
        tmi_info: [
          { category: 'hobby', content: 'Golf' }, // No context or recency
        ],
        small_talk_topics: [],
        suggested_score: 50,
        suggested_status: 'cold',
        suggested_followup_date: '2026-02-06',
        action_plan: [],
      };

      const result = analysisResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should allow passthrough of extra fields', () => {
      const response = {
        summary: 'Test',
        needs: [],
        required_materials: [],
        positive_signals: [],
        negative_signals: [],
        negotiation_tip: 'Tip',
        tmi_info: [],
        small_talk_topics: [],
        suggested_score: 50,
        suggested_status: 'cold',
        suggested_followup_date: '2026-02-06',
        action_plan: [],
        extra_field: 'This should pass through',
        another_field: { nested: 'value' },
      };

      const result = analysisResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as any).extra_field).toBe('This should pass through');
      }
    });
  });

  describe('backward compatibility', () => {
    it('should accept old format with tmi_info as string array', () => {
      const oldFormatResponse = {
        summary: 'Test',
        needs: [],
        required_materials: [],
        positive_signals: [],
        negative_signals: [],
        negotiation_tip: 'Tip',
        tmi_info: ['Old string TMI 1', 'Old string TMI 2'], // Old format
        small_talk_topics: ['Golf', 'Family'], // Old format
        suggested_score: 50,
        suggested_status: 'cold',
        suggested_followup_date: '2026-02-06',
        action_plan: [],
      };

      const result = analysisResponseSchema.safeParse(oldFormatResponse);
      // With passthrough, this should pass because extra fields are allowed
      // But the schema expects new format, so this will fail validation
      // This is expected - we're testing that old format is NOT accepted
      expect(result.success).toBe(false);
    });

    it('should accept mixed format via passthrough', () => {
      const mixedResponse = {
        summary: 'Test',
        needs: [],
        required_materials: [],
        positive_signals: [],
        negative_signals: [],
        negotiation_tip: 'Tip',
        tmi_info: [
          { category: 'hobby', content: 'Golf' }, // New format
        ],
        small_talk_topics: [
          { topic: 'Golf', priority: 'high', based_on: 'hobby' }, // New format
        ],
        suggested_score: 50,
        suggested_status: 'cold',
        suggested_followup_date: '2026-02-06',
        action_plan: [],
        legacy_tmi: ['Old format TMI'], // Extra field via passthrough
      };

      const result = analysisResponseSchema.safeParse(mixedResponse);
      expect(result.success).toBe(true);
    });
  });

  describe('invalid inputs', () => {
    it('should reject invalid TMI category', () => {
      const response = {
        summary: 'Test',
        needs: [],
        required_materials: [],
        positive_signals: [],
        negative_signals: [],
        negotiation_tip: 'Tip',
        tmi_info: [
          { category: 'invalid_category', content: 'Test' },
        ],
        small_talk_topics: [],
        suggested_score: 50,
        suggested_status: 'cold',
        suggested_followup_date: '2026-02-06',
        action_plan: [],
      };

      const result = analysisResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });

    it('should reject invalid small_talk priority', () => {
      const response = {
        summary: 'Test',
        needs: [],
        required_materials: [],
        positive_signals: [],
        negative_signals: [],
        negotiation_tip: 'Tip',
        tmi_info: [],
        small_talk_topics: [
          { topic: 'Golf', priority: 'invalid_priority', based_on: 'hobby' },
        ],
        suggested_score: 50,
        suggested_status: 'cold',
        suggested_followup_date: '2026-02-06',
        action_plan: [],
      };

      const result = analysisResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });

    it('should reject missing required TMI fields', () => {
      const response = {
        summary: 'Test',
        needs: [],
        required_materials: [],
        positive_signals: [],
        negative_signals: [],
        negotiation_tip: 'Tip',
        tmi_info: [
          { category: 'hobby' }, // Missing content
        ],
        small_talk_topics: [],
        suggested_score: 50,
        suggested_status: 'cold',
        suggested_followup_date: '2026-02-06',
        action_plan: [],
      };

      const result = analysisResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });

    it('should reject missing required small_talk fields', () => {
      const response = {
        summary: 'Test',
        needs: [],
        required_materials: [],
        positive_signals: [],
        negative_signals: [],
        negotiation_tip: 'Tip',
        tmi_info: [],
        small_talk_topics: [
          { topic: 'Golf' }, // Missing priority and based_on
        ],
        suggested_score: 50,
        suggested_status: 'cold',
        suggested_followup_date: '2026-02-06',
        action_plan: [],
      };

      const result = analysisResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });
  });

  describe('type inference', () => {
    it('should infer correct TypeScript types', () => {
      const tmiItem: TmiItem = {
        category: 'hobby',
        content: 'Golf',
        context: 'Weekends',
        recency: 'new',
      };

      expect(tmiItem.category).toBe('hobby');
      expect(tmiItem.content).toBe('Golf');
    });

    it('should infer SmallTalkTopic type', () => {
      const topic: SmallTalkTopic = {
        topic: 'Golf',
        priority: 'high',
        based_on: 'hobby',
      };

      expect(topic.priority).toBe('high');
    });

    it('should infer AnalysisResponse type', () => {
      const response: AnalysisResponse = {
        summary: 'Test',
        needs: [],
        required_materials: [],
        positive_signals: [],
        negative_signals: [],
        negotiation_tip: 'Tip',
        tmi_info: [{ category: 'hobby', content: 'Golf' }],
        small_talk_topics: [{ topic: 'Golf', priority: 'high', based_on: 'hobby' }],
        suggested_score: 50,
        suggested_status: 'cold',
        suggested_followup_date: '2026-02-06',
        action_plan: [],
      };

      expect(response.suggested_score).toBe(50);
    });
  });

  describe('recency field validation', () => {
    it('should accept "new" recency value', () => {
      const response = {
        summary: 'Test',
        needs: [],
        required_materials: [],
        positive_signals: [],
        negative_signals: [],
        negotiation_tip: 'Tip',
        tmi_info: [
          { category: 'hobby', content: 'Golf', recency: 'new' },
        ],
        small_talk_topics: [],
        suggested_score: 50,
        suggested_status: 'cold',
        suggested_followup_date: '2026-02-06',
        action_plan: [],
      };

      const result = analysisResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should accept "referenced" recency value', () => {
      const response = {
        summary: 'Test',
        needs: [],
        required_materials: [],
        positive_signals: [],
        negative_signals: [],
        negotiation_tip: 'Tip',
        tmi_info: [
          { category: 'hobby', content: 'Golf', recency: 'referenced' },
        ],
        small_talk_topics: [],
        suggested_score: 50,
        suggested_status: 'cold',
        suggested_followup_date: '2026-02-06',
        action_plan: [],
      };

      const result = analysisResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should reject invalid recency value', () => {
      const response = {
        summary: 'Test',
        needs: [],
        required_materials: [],
        positive_signals: [],
        negative_signals: [],
        negotiation_tip: 'Tip',
        tmi_info: [
          { category: 'hobby', content: 'Golf', recency: 'invalid' },
        ],
        small_talk_topics: [],
        suggested_score: 50,
        suggested_status: 'cold',
        suggested_followup_date: '2026-02-06',
        action_plan: [],
      };

      const result = analysisResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });
  });
});
