export function logTokenUsage(
  promptType: 'ocr' | 'analyze' | 'email' | 'coach',
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
): void {
  console.log(
    JSON.stringify({
      event: 'token_usage',
      prompt_type: promptType,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      timestamp: new Date().toISOString(),
    })
  );
}
