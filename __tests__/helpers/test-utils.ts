import { NextRequest } from 'next/server';

export interface MockRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  token?: string;
}

export function createMockRequest(options: MockRequestOptions = {}): NextRequest {
  const {
    method = 'POST',
    headers = {},
    body = {},
    token = 'mock-jwt-token',
  } = options;

  const defaultHeaders = {
    'content-type': 'application/json',
    'authorization': `Bearer ${token}`,
    ...headers,
  };

  const url = new URL('http://localhost:3000/api/test');

  const request = new NextRequest(url, {
    method,
    headers: defaultHeaders,
    body: method !== 'GET' && method !== 'DELETE' ? JSON.stringify(body) : undefined,
  });

  return request;
}

export function createMockResponse() {
  return {
    status: 200,
    json: jest.fn().mockResolvedValue({}),
    text: jest.fn().mockResolvedValue(''),
    headers: new Map(),
  };
}

export interface MockResponseData {
  success: boolean;
  data?: any;
  error?: {
    message: string;
    code: string;
    details?: any;
  };
}

export function createSuccessResponse<T>(data: T): MockResponseData {
  return {
    success: true,
    data,
  };
}

export function createErrorResponse(
  message: string,
  code: string,
  details?: any
): MockResponseData {
  return {
    success: false,
    error: {
      message,
      code,
      details,
    },
  };
}

export function createAuthErrorResponse(): MockResponseData {
  return createErrorResponse('Unauthorized', 'AUTH_ERROR');
}

export function createTierErrorResponse(): MockResponseData {
  return createErrorResponse('Upgrade required', 'TIER_ERROR');
}

export function createRateLimitErrorResponse(): MockResponseData {
  return createErrorResponse('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED');
}

export function createValidationErrorResponse(details?: any): MockResponseData {
  return createErrorResponse('Invalid request', 'VALIDATION_ERROR', details);
}

export function createAIErrorResponse(): MockResponseData {
  return createErrorResponse('AI processing failed', 'AI_ERROR');
}

export interface MockContextOptions {
  userId?: string;
  tier?: 'free' | 'basic' | 'pro';
  isInTrial?: boolean;
  withinRateLimit?: boolean;
  token?: string;
}

export function createMockContext(options: MockContextOptions = {}) {
  const {
    userId = 'test-user-123',
    tier = 'pro',
    isInTrial = false,
    withinRateLimit = true,
    token = 'mock-jwt-token',
  } = options;

  return {
    userId,
    tier,
    isInTrial,
    withinRateLimit,
    token,
    request: createMockRequest({ token }),
  };
}

export function expectSuccessResponse(response: MockResponseData) {
  expect(response.success).toBe(true);
  expect(response.data).toBeDefined();
  expect(response.error).toBeUndefined();
}

export function expectErrorResponse(
  response: MockResponseData,
  expectedCode: string,
  expectedMessage?: string
) {
  expect(response.success).toBe(false);
  expect(response.error).toBeDefined();
  expect(response.error?.code).toBe(expectedCode);
  if (expectedMessage) {
    expect(response.error?.message).toContain(expectedMessage);
  }
}

export function expectAuthError(response: MockResponseData) {
  expectErrorResponse(response, 'AUTH_ERROR');
}

export function expectTierError(response: MockResponseData) {
  expectErrorResponse(response, 'TIER_ERROR');
}

export function expectRateLimitError(response: MockResponseData) {
  expectErrorResponse(response, 'RATE_LIMIT_EXCEEDED');
}

export function expectValidationError(response: MockResponseData) {
  expectErrorResponse(response, 'VALIDATION_ERROR');
}

export function expectAIError(response: MockResponseData) {
  expectErrorResponse(response, 'AI_ERROR');
}

export function mockEnvironmentVariables(vars: Record<string, string>) {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ...vars,
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });
}

export function createMockZodError(field: string, message: string) {
  return {
    issues: [
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'undefined',
        path: [field],
        message,
      },
    ],
    flatten: jest.fn().mockReturnValue({
      fieldErrors: {
        [field]: [message],
      },
      formErrors: [],
    }),
  };
}
