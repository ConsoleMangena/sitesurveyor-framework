import { useState } from 'react';
import { Link } from 'expo-router';
import { ScrollView } from 'react-native';
import { ThemeText } from '@/components/ui/theme-text';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { requestPasswordReset } from '@/lib/auth/session';
import { formatAuthUserFacingError } from '@/lib/auth/auth-errors';
import { tokens } from '@/lib/theme/tokens';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error: authError } = await requestPasswordReset(email);
    setBusy(false);
    if (authError) {
      setError(formatAuthUserFacingError(authError));
      return;
    }
    setMessage('Check your email for a password reset link.');
  }

  return (
    <ScrollView contentContainerStyle={{ padding: tokens.space.lg, gap: tokens.space.md }}>
      <ThemeText variant="semibold" style={{ fontSize: tokens.text.lg }}>Forgot password</ThemeText>
      <TextField placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      {error ? <ThemeText style={{ color: tokens.colors.danger }}>{error}</ThemeText> : null}
      {message ? <ThemeText>{message}</ThemeText> : null}
      <Button label={busy ? 'Sending…' : 'Send reset link'} disabled={busy} onPress={onSubmit} />
      <Link href="/(auth)/login"><ThemeText variant="sm">Back to sign in</ThemeText></Link>
    </ScrollView>
  );
}
