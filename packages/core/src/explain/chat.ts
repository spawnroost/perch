export interface DeepseekChatOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface DeepseekChatRequest {
  system: string;
  /** Sent as the user message; objects are JSON-stringified. */
  user: unknown;
  maxTokens: number;
  temperature: number;
}

/**
 * One DeepSeek chat completion (OpenAI-compatible endpoint) in JSON mode with thinking off.
 * Resolves to the message content; throws on an HTTP error or blank content.
 */
export async function deepseekChat(
  o: DeepseekChatOptions,
  req: DeepseekChatRequest,
): Promise<string> {
  const doFetch = o.fetch ?? fetch;
  const baseUrl = (o.baseUrl ?? 'https://api.deepseek.com').replace(/\/+$/, '');
  const res = await doFetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${o.apiKey}` },
    signal: AbortSignal.timeout(o.timeoutMs ?? 20_000),
    body: JSON.stringify({
      model: o.model ?? 'deepseek-flash',
      messages: [
        { role: 'system', content: req.system },
        {
          role: 'user',
          content: typeof req.user === 'string' ? req.user : JSON.stringify(req.user),
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: req.maxTokens,
      // deepseek-flash reasons by default; that burns the token budget and can leave content blank.
      thinking: { type: 'disabled' },
      temperature: req.temperature,
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`deepseek HTTP ${res.status}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  // JSON mode returns blank content when the model produced invalid JSON.
  if (!content?.trim()) throw new Error('deepseek returned empty content');
  return content;
}
