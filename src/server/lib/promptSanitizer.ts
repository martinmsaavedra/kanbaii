/**
 * Sanitize user-controlled text before injecting into Claude prompts.
 * Strips prompt injection patterns without altering normal text.
 */
export function sanitizeForPrompt(text: string): string {
  if (!text || typeof text !== 'string') return '';

  let sanitized = text;

  // Strip system/assistant role markers that could override prompt structure
  sanitized = sanitized.replace(/^(system|assistant|human|user):/gim, '[role]:');

  // Strip XML-like tags that Claude interprets specially
  sanitized = sanitized.replace(/<\/?(?:system|instructions|context|prompt|tool_use|tool_result|thinking)[^>]*>/gi, '');

  // Strip markdown heading overrides that look like injection
  sanitized = sanitized.replace(/^#{1,3}\s*(system|instructions|role|override|ignore|forget)/gim, '[$1]');

  // Limit length to prevent context flooding
  if (sanitized.length > 10000) {
    sanitized = sanitized.slice(0, 10000) + '\n[truncated]';
  }

  return sanitized;
}
