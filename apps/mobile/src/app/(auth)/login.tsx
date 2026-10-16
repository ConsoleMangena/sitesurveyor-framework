import { useState } from 'react';
import { Link, useRouter } from 'expo-router';
import { ScrollView } from 'react-native';
import { ThemeView } from '@/components/ui/theme-view';
import { ThemeText } from '@/components/ui/theme-text';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { signInWithEmail } from '@/lib/auth/session';
import { formatAuthUserFacingError } from '@/lib/auth/auth-errors';
import { tokens } from '@/lib/theme/tokens';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    const { error: authError } = await signInWithEmail({ email, password });
    setBusy(false);
    if (authError) {
      setError(formatAuthUserFacingError(authError));
      return;
    }
    router.replace('/(app)/(tabs)/dashboard');
  }

  return (
    <ScrollView contentContainerStyle={{ padding: tokens.space.lg, gap: tokens.space.md }}>
      <ThemeText variant="semibold" style={{ fontSize: tokens.text.lg }}>Sign in</ThemeText>
      <TextField placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextField placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
      {error ? <ThemeText style={{ color: tokens.colors.danger }}>{error}</ThemeText> : null}
      <Button label={busy ? 'Signing in…' : 'Sign in'} disabled={busy} onPress={onSubmit} />
      <Link href="/(auth)/signup"><ThemeText variant="sm">Create an account</ThemeText></Link>
      <Link href="/(auth)/forgot-password"><ThemeText variant="sm">Forgot password?</ThemeText></Link>
    </ScrollView>
  );
}
