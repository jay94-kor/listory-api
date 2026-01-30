export interface MockOpenAIOptions {
  responseContent?: string;
  shouldFail?: boolean;
  errorMessage?: string;
}

export function createMockOpenAIClient(options: MockOpenAIOptions = {}) {
  const {
    responseContent = '{"result": "mock response"}',
    shouldFail = false,
    errorMessage = 'Mock OpenAI error',
  } = options;

  const mockCompletion = {
    id: 'chatcmpl-123',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'gpt-4-vision-preview',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: responseContent,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    } as any,
  };

  return {
    chat: {
      completions: {
        create: jest.fn().mockImplementation(async () => {
          if (shouldFail) {
            throw new Error(errorMessage);
          }
          return mockCompletion;
        }),
      },
    },
    beta: {
      vision: {
        completions: {
          create: jest.fn().mockImplementation(async () => {
            if (shouldFail) {
              throw new Error(errorMessage);
            }
            return mockCompletion;
          }),
        },
      },
    },
  };
}

export function createMockOCRResponse() {
  return {
    name: { value: '김철수', confidence: 0.95 },
    company: { value: 'ABC 주식회사', confidence: 0.92 },
    position: { value: '영업 이사', confidence: 0.88 },
    department: { value: '영업팀', confidence: 0.85 },
    email: { value: 'kim@abc.com', confidence: 0.98 },
    phone: { value: '010-1234-5678', confidence: 0.96 },
    landline: { value: '02-1234-5678', confidence: 0.90 },
    fax: { value: null, confidence: 0.0 },
    address: { value: '서울시 강남구 테헤란로 123', confidence: 0.87 },
    website: { value: 'www.abc.com', confidence: 0.94 },
    needs_review: false,
    detected_languages: ['ko'],
  };
}

export function createMockAnalysisResponse() {
  return {
    summary: '김철수 이사님과의 미팅에서 데이터 분석 자동화에 대한 관심을 확인했습니다.',
    needs: ['데이터 분석 자동화', '실시간 대시보드'],
    required_materials: ['제품 소개서', '가격표'],
    material_sending_info: '이메일로 송부 예정',
    positive_signals: ['제품 기능에 관심 표현', '데모 요청'],
    negative_signals: [],
    negotiation_tip: '가격 협상 시 장기 계약 할인 제안',
    tmi_info: [
      {
        category: 'hobby',
        content: '골프 취미',
        context: '미팅 중 언급',
        recency: 'new',
      },
    ],
    small_talk_topics: [
      {
        topic: '최근 라운딩 경험',
        priority: 'high',
        based_on: '골프 취미',
      },
    ],
    suggested_score: 85,
    suggested_status: 'hot',
    suggested_followup_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    action_plan: [
      {
        title: '제품 소개서 및 가격표 송부',
        type: 'email',
        priority: 'high',
        due_in_days: 1,
        description: '약속한 자료 송부',
      },
    ],
  };
}

export function createMockEmailResponse() {
  return {
    subject: 'ABC 프로젝트 제안서 및 견적서 송부',
    body: `안녕하세요, 김철수 이사님.

어제 ABC 사무실에서 즐거운 미팅이었습니다. 특히 말씀하신 '데이터 분석에 매주 30시간 소요'되는 pain point가 인상 깊었습니다.

약속드린 대로 제품 소개서와 가격표를 첨부합니다. 대표님께서 관심 보이신 실시간 대시보드 기능을 특히 강조해서 표시해두었습니다.

다음 주 화요일(1/23) 오전이나 수요일(1/24) 오후 중 30분 정도 데모 미팅이 가능하실까요? 편하신 시간 알려주시면 일정 조율하겠습니다.

감사합니다.
홍길동
영업 담당자
Listory Inc.
010-9999-9999`,
    tone_used: 'formal',
    context_references: ['데이터 분석 pain point', '실시간 대시보드 기능'],
  };
}

export function createMockCoachingResponse() {
  return {
    tip: '제품 소개서 3페이지의 ROI 계산기를 보여드리며 구체적인 비용 절감 효과를 설명해보세요',
    category: 'information',
    priority: 'high',
    knowledge_base_reference: 'product_brochure_page_3',
  };
}
