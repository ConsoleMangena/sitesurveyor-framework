import { tokens } from '@/lib/theme/tokens';

describe('tokens', () => {
  it('uses square corners everywhere (DESIGN.md contract)', () => {
    expect(tokens.radius.none).toBe(0);
    expect(tokens.radius.sm).toBe(0);
    expect(tokens.radius.md).toBe(0);
  });

  it('exposes the core color roles', () => {
    expect(tokens.colors.background).toMatch(/^#|rgb/);
    expect(tokens.colors.card).toMatch(/^#|rgb/);
    expect(tokens.colors.border).toMatch(/^#|rgb/);
    expect(tokens.colors.primary).toMatch(/^#|rgb/);
  });
});
