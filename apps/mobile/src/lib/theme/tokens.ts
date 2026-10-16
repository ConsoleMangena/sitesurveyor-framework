export const tokens = {
  colors: {
    background: '#0b0f14',
    card: 'rgba(255,255,255,0.04)',
    muted: 'rgba(255,255,255,0.06)',
    border: 'rgba(255,255,255,0.12)',
    foreground: '#e8edf2',
    mutedForeground: 'rgba(232,237,242,0.6)',
    primary: '#4f8cff',
    primaryForeground: '#ffffff',
    danger: '#ff5b5b',
  },
  radius: { none: 0, sm: 0, md: 0, pill: 999 },
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, '2xl': 64 },
  text: { sm: 14, base: 16, lg: 20, semibold: '600' as const },
} as const;
