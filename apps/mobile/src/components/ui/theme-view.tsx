import { View, type ViewProps } from 'react-native';
import { tokens } from '@/lib/theme/tokens';

type Tone = 'background' | 'card' | 'muted';

export function ThemeView({ tone = 'background', style, ...props }: ViewProps & { tone?: Tone }) {
  return (
    <View
      {...props}
      style={[
        {
          backgroundColor: tokens.colors[tone],
          borderRadius: tokens.radius.md,
          borderColor: tokens.colors.border,
          borderWidth: tone === 'background' ? 0 : 1,
        },
        style,
      ]}
    />
  );
}
