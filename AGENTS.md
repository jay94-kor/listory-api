# LISTORY API

**Parent:** [../AGENTS.md](../AGENTS.md)

## OVERVIEW

Next.js 14 API backend (TypeScript). Handles AI processing, file storage, rate limiting. Deployed on Vercel.

## STRUCTURE

```
listory-api/
├── app/api/           # API routes (App Router)
│   ├── ai/            # AI endpoints (analyze, transcribe, ocr, coach, email)
│   ├── health/        # Health checks
│   └── storage/       # S3 presigned URLs, file deletion
├── lib/               # Shared utilities
│   ├── openai.ts      # OpenAI client + ALL system prompts
│   ├── supabase.ts    # Auth helpers, tier checking
│   ├── rate-limit.ts  # Usage tracking per tier
│   ├── s3.ts          # AWS S3 client
│   └── assemblyai.ts  # Transcription client
└── middleware.ts      # CORS, security headers
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add API endpoint | `app/api/{feature}/route.ts` |
| Modify AI prompts | `lib/openai.ts` |
| Change rate limits | `lib/rate-limit.ts` (RATE_LIMITS constant) |
| Auth/tier logic | `lib/supabase.ts` |
| CORS origins | `middleware.ts` |

## ROUTE ANATOMY

Every protected route follows this sequence:

```typescript
export async function POST(request: NextRequest) {
  // 1. Authenticate
  const { user, error } = await getAuthenticatedUser(request);
  if (!user) return 401;

  // 2. Check subscription tier
  const { allowed, profile } = await checkUserTier(request, ['basic', 'pro']);
  if (!allowed) return 403;

  // 3. Rate limiting
  const { allowed: withinLimit } = await checkRateLimit(supabase, user.id, tier, 'feature');
  if (!withinLimit) return 429;

  // 4. Validate request body
  const parseResult = requestSchema.safeParse(await request.json());
  if (!parseResult.success) return 400;

  // 5. Business logic
  const result = await doSomething(parseResult.data);

  // 6. Record usage
  await recordUsage(supabase, user.id, 'feature');

  return NextResponse.json({ success: true, data: result });
}
```

## CONVENTIONS

### Response Format
```typescript
// Success
{ success: true, data: { ... } }

// Error
{ success: false, error: { message: string, code: string } }
```

### Error Codes
| Code | HTTP | Meaning |
|------|------|---------|
| `AUTH_ERROR` | 401 | Invalid/missing token |
| `TIER_ERROR` | 403 | Subscription insufficient |
| `RATE_LIMIT_EXCEEDED` | 429 | Monthly quota hit |
| `VALIDATION_ERROR` | 400 | Zod validation failed |
| `AI_ERROR` | 500 | OpenAI/AssemblyAI failure |

### Zod Validation
```typescript
// Define at top of route file
const requestSchema = z.object({
  transcript: z.string().min(10),
  lead_context: z.object({
    name: z.string().optional(),
    // ...
  }).optional(),
});

// Use safeParse
const result = requestSchema.safeParse(body);
if (!result.success) {
  return NextResponse.json({
    success: false,
    error: { 
      message: 'Invalid request',
      code: 'VALIDATION_ERROR',
      details: result.error.flatten()
    }
  }, { status: 400 });
}
```

### Path Aliases
```typescript
// tsconfig.json: "@/*" → "./*"
import { getOpenAIClient } from '@/lib/openai';
```

## AI PROMPTS

All system prompts live in `lib/openai.ts`:
- `OCR_SYSTEM_PROMPT` - Business card extraction
- `ANALYSIS_SYSTEM_PROMPT` - Meeting analysis
- `EMAIL_SYSTEM_PROMPT` - Follow-up email generation
- `COACHING_SYSTEM_PROMPT` - Real-time sales coaching

**CRITICAL**: Analysis prompt requires `[고객 정보]` section to override STT name errors.

## COMMANDS

```bash
npm install            # Install deps
npm run dev            # Dev server (port 3000)
npm run build          # Production build
npm run lint           # ESLint
npm test               # Jest (tests not yet implemented)
```

## ANTI-PATTERNS

- **NO** skipping auth/tier/rate-limit checks
- **NO** hardcoded API keys (use environment variables)
- **NO** trusting user input without Zod validation
- **NO** blocking routes without retry logic for AI calls
