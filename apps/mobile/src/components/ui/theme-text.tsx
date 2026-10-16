import { Text, type TextProps } from 'react-native';
import { tokens } from '@/lib/theme/tokens';

type Variant = 'base' | 'sm' | 'semibold';

export function ThemeText({ variant = 'base', style, ...props }: TextProps & { variant?: Variant }) {
  const base = variant === 'sm' ? tokens.text.sm : tokens.text.base;
  const weight = variant === 'semibold' ? tokens.text.semibold : '400';
  return (
    <Text
      {...props}
      style={[{ color: tokens.colors.foreground, fontSize: base, fontWeight: weight }, style]}
    />
  );
}
