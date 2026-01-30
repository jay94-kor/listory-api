/**
 * Input sanitization to prevent prompt injection attacks
 * Blocks common injection patterns while preserving legitimate Korean business content
 */

/**
 * Sanitizes user input to prevent prompt injection attacks
 * Blocks patterns like "ignore previous", "system:", "assistant:", code blocks
 * Preserves Korean special characters and legitimate business content
 *
 * @param text - Raw user input to sanitize
 * @returns Sanitized text with injection patterns removed
 */
export function sanitizeUserInput(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let sanitized = text;

  // Block "ignore previous" pattern (case-insensitive)
  // Matches: "ignore previous", "무시해", "이전 무시" etc.
  sanitized = sanitized.replace(/ignore\s+previous/gi, '');
  sanitized = sanitized.replace(/무시해.*?명령/gi, '');
  sanitized = sanitized.replace(/이전.*?무시/gi, '');

  // Block "system:" pattern (case-insensitive)
  // Prevents role-switching attacks like "system: you are now..."
  sanitized = sanitized.replace(/system\s*:/gi, '');
  sanitized = sanitized.replace(/시스템\s*:/gi, '');

  // Block "assistant:" pattern (case-insensitive)
  // Prevents impersonation attacks
  sanitized = sanitized.replace(/assistant\s*:/gi, '');
  sanitized = sanitized.replace(/어시스턴트\s*:/gi, '');

  // Block code blocks (triple backticks)
  // Prevents code injection attempts
  sanitized = sanitized.replace(/```[\s\S]*?```/g, '');

  // Clean up excessive whitespace created by removals
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized;
}
