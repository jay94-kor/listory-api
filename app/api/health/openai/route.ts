import { NextResponse } from 'next/server';
import { getOpenAIClient } from '@/lib/openai';

// Force dynamic rendering to avoid build-time execution
export const dynamic = 'force-dynamic';

/**
 * GET /api/health/openai
 * Test OpenAI API connectivity
 */
export async function GET(request: Request) {
  const startTime = Date.now();
  const url = new URL(request.url);
  const useFetch = url.searchParams.get('fetch') === 'true';

  // Check if API key is set
  const apiKey = process.env.OPENAI_API_KEY;
  const apiKeySet = !!apiKey;
  const apiKeyLength = apiKey?.length || 0;
  const apiKeyPrefix = apiKey?.substring(0, 10) || 'NOT_SET';

  console.log('OpenAI health check starting:', {
    apiKeySet,
    apiKeyLength,
    apiKeyPrefix,
    useFetch,
  });

  try {
    if (useFetch) {
      // Test with raw fetch
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Say "OK"' }],
          max_tokens: 5,
        }),
      });

      const data = await response.json();
      const latency = Date.now() - startTime;

      if (!response.ok) {
        return NextResponse.json({
          success: false,
          status: 'unhealthy',
          latency_ms: latency,
          method: 'fetch',
          error: data.error || { message: 'Unknown error' },
          debug: {
            apiKeySet,
            apiKeyLength,
            apiKeyPrefix,
            httpStatus: response.status,
          },
        }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        status: 'healthy',
        latency_ms: latency,
        method: 'fetch',
        response: data.choices?.[0]?.message?.content,
        model: data.model,
        debug: {
          apiKeySet,
          apiKeyLength,
          apiKeyPrefix,
        },
      });
    } else {
      // Test with OpenAI SDK
      const openai = getOpenAIClient();

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say "OK"' }],
        max_tokens: 5,
      });

      const content = response.choices[0]?.message?.content;
      const latency = Date.now() - startTime;

      return NextResponse.json({
        success: true,
        status: 'healthy',
        latency_ms: latency,
        method: 'sdk',
        response: content,
        model: response.model,
        debug: {
          apiKeySet,
          apiKeyLength,
          apiKeyPrefix,
        },
      });
    }
  } catch (error: any) {
    const latency = Date.now() - startTime;

    console.error('OpenAI health check failed:', {
      message: error.message,
      code: error.code,
      type: error.type,
      status: error.status,
      name: error.name,
      cause: error.cause?.message || error.cause,
    });

    return NextResponse.json({
      success: false,
      status: 'unhealthy',
      latency_ms: latency,
      method: useFetch ? 'fetch' : 'sdk',
      error: {
        message: error.message,
        code: error.code || error.status || 'UNKNOWN',
        type: error.type || error.name || 'Error',
        cause: error.cause?.message || String(error.cause || ''),
      },
      debug: {
        apiKeySet,
        apiKeyLength,
        apiKeyPrefix,
      },
    }, { status: 500 });
  }
}
