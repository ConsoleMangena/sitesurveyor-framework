import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView } from 'react-native';
import { ThemeText } from '@/components/ui/theme-text';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { updatePassword } from '@/lib/auth/session';
import { formatAuthUserFacingError } from '@/lib/auth/auth-errors';
import { tokens } from '@/lib/theme/tokens';

export default function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    const { error: authError } = await updatePassword(password);
    setBusy(false);
    if (authError) {
      setError(formatAuthUserFacingError(authError));
      return;
    }
    router.replace('/(auth)/login');
  }

  return (
    <ScrollView contentContainerStyle={{ padding: tokens.space.lg, gap: tokens.space.md }}>
      <ThemeText variant="semibold" style={{ fontSize: tokens.text.lg }}>Reset password</ThemeText>
      <TextField placeholder="New password" secureTextEntry value={password} onChangeText={setPassword} />
      {error ? <ThemeText style={{ color: tokens.colors.danger }}>{error}</ThemeText> : null}
      <Button label={busy ? 'Updating…' : 'Update password'} disabled={busy} onPress={onSubmit} />
    </ScrollView>
  );
}
