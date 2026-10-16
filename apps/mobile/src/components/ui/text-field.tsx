import { TextInput, type TextInputProps } from 'react-native';
import { tokens } from '@/lib/theme/tokens';

export function TextField(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={tokens.colors.mutedForeground}
      {...props}
      style={{
        backgroundColor: tokens.colors.muted,
        borderColor: tokens.colors.border,
        borderWidth: 1,
        borderRadius: tokens.radius.md,
        paddingHorizontal: tokens.space.md,
        paddingVertical: tokens.space.sm,
        color: tokens.colors.foreground,
      }}
    />
  );
}
