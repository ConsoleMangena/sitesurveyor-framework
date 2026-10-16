import { parseNdjsonLines } from '@/features/assistant/stream-client';

describe('parseNdjsonLines', () => {
  it('parses complete lines and keeps the remainder', () => {
    const input = '{"type":"delta","text":"hi"}\n{"type":"final"}\n{"type":"st';
    const { events, rest } = parseNdjsonLines(input);
    expect(events).toEqual([
      { type: 'delta', text: 'hi' },
      { type: 'final' },
    ]);
    expect(rest).toBe('{"type":"st');
  });

  it('skips blank lines', () => {
    const { events } = parseNdjsonLines('\n\n{"type":"status"}\n');
    expect(events).toEqual([{ type: 'status' }]);
  });
});
