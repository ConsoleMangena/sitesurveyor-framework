import { fetch } from 'expo/fetch';

export type AssistantEvent = {
  type: 'delta' | 'final' | 'error' | 'status' | 'tool';
  [key: string]: unknown;
};

export function parseNdjsonLines(buffer: string): {
  events: AssistantEvent[];
  rest: string;
} {
  const events: AssistantEvent[] = [];
  const parts = buffer.split('\n');
  const rest = parts.pop() ?? '';
  for (const line of parts) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    events.push(JSON.parse(trimmed) as AssistantEvent);
  }
  return { events, rest };
}

export async function* streamAssistantChat(params: {
  url: string;
  anonKey: string;
  token: string;
  body: unknown;
  signal?: AbortSignal;
}): AsyncGenerator<AssistantEvent> {
  const response = await fetch(`${params.url}/functions/v1/ai-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: params.anonKey,
      Authorization: `Bearer ${params.token}`,
    },
    body: JSON.stringify(params.body),
    signal: params.signal,
  });

  if (!response.body) {
    throw new Error('ai-chat returned no stream');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseNdjsonLines(buffer);
    buffer = parsed.rest;
    for (const event of parsed.events) yield event;
  }

  if (buffer.trim()) {
    yield JSON.parse(buffer.trim()) as AssistantEvent;
  }
}
