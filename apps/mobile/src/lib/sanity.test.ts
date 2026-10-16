import { summarize } from '@/lib/sanity';

describe('summarize', () => {
  it('counts characters', () => {
    expect(summarize('hello')).toBe(5);
  });
});
