import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Allowed origins for CORS
const PRODUCTION_ORIGINS = [
  'https://listory.app',
  'https://www.listory.app',
  'https://listory-web.vercel.app',
];

const DEVELOPMENT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8080',
];

// Only allow localhost in development mode
const ALLOWED_ORIGINS = process.env.NODE_ENV === 'production'
  ? PRODUCTION_ORIGINS
  : [...PRODUCTION_ORIGINS, ...DEVELOPMENT_ORIGINS];

function isAllowedOrigin(origin: string | null): boolean {
  // Allow requests with no origin (mobile apps, server-to-server)
  if (!origin) return true;
  // Check against whitelist
  return ALLOWED_ORIGINS.includes(origin);
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin');

  // Block requests from disallowed origins
  if (origin && !isAllowedOrigin(origin)) {
    return new NextResponse(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Create response headers for CORS
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400',
  };

  // Only set specific origin if provided
  if (origin) {
    corsHeaders['Access-Control-Allow-Origin'] = origin;
  }

  // Security headers
  const securityHeaders: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: { ...corsHeaders, ...securityHeaders },
    });
  }

  // Get response and add headers
  const response = NextResponse.next();

  Object.entries({ ...corsHeaders, ...securityHeaders }).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

// Only apply middleware to API routes
export const config = {
  matcher: '/api/:path*',
};
