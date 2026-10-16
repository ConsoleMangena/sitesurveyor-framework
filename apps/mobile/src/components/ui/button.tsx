import { Pressable, type PressableProps } from 'react-native';
import { tokens } from '@/lib/theme/tokens';
import { ThemeText } from './theme-text';

export function Button({
  label,
  disabled,
  ...props
}: PressableProps & { label: string; disabled?: boolean }) {
  return (
    <Pressable
      {...props}
      disabled={disabled}
      style={{
        backgroundColor: tokens.colors.primary,
        borderRadius: tokens.radius.md,
        paddingVertical: tokens.space.md,
        alignItems: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <ThemeText variant="semibold" style={{ color: tokens.colors.primaryForeground }}>
        {label}
      </ThemeText>
    </Pressable>
  );
}
