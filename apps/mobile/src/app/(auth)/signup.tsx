import { useState } from 'react';
import { Link, useRouter } from 'expo-router';
import { Pressable, ScrollView } from 'react-native';
import { ThemeText } from '@/components/ui/theme-text';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { signUpWithEmail } from '@/lib/auth/session';
import { formatAuthUserFacingError } from '@/lib/auth/auth-errors';
import { tokens } from '@/lib/theme/tokens';

type AccountType = 'personal' | 'business';

export default function SignUp() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('personal');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const { data, error: authError } = await signUpWithEmail({
      email,
      password,
      accountType,
      fullName,
    });
    setBusy(false);
    if (authError) {
      setError(formatAuthUserFacingError(authError));
      return;
    }
    if (!data.session) {
      setMessage('Check your email to confirm your account.');
      return;
    }
    router.replace('/(app)/(tabs)/dashboard');
  }

  return (
    <ScrollView contentContainerStyle={{ padding: tokens.space.lg, gap: tokens.space.md }}>
      <ThemeText variant="semibold" style={{ fontSize: tokens.text.lg }}>Create account</ThemeText>
      <TextField placeholder="Full name" value={fullName} onChangeText={setFullName} />
      <TextField placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextField placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
      <ThemeText variant="sm">Account type</ThemeText>
      <Pressable
        onPress={() => setAccountType('personal')}
        style={{
          backgroundColor: accountType === 'personal' ? tokens.colors.primary : tokens.colors.muted,
          borderRadius: tokens.radius.md,
          paddingVertical: tokens.space.sm,
          alignItems: 'center',
        }}
      >
        <ThemeText
          variant="semibold"
          style={{ color: accountType === 'personal' ? tokens.colors.primaryForeground : tokens.colors.foreground }}
        >
          Personal
        </ThemeText>
      </Pressable>
      <Pressable
        onPress={() => setAccountType('business')}
        style={{
          backgroundColor: accountType === 'business' ? tokens.colors.primary : tokens.colors.muted,
          borderRadius: tokens.radius.md,
          paddingVertical: tokens.space.sm,
          alignItems: 'center',
        }}
      >
        <ThemeText
          variant="semibold"
          style={{ color: accountType === 'business' ? tokens.colors.primaryForeground : tokens.colors.foreground }}
        >
          Business
        </ThemeText>
      </Pressable>
      {error ? <ThemeText style={{ color: tokens.colors.danger }}>{error}</ThemeText> : null}
      {message ? <ThemeText>{message}</ThemeText> : null}
      <Button label={busy ? 'Creating account…' : 'Create account'} disabled={busy} onPress={onSubmit} />
      <Link href="/(auth)/login"><ThemeText variant="sm">Already have an account? Sign in</ThemeText></Link>
    </ScrollView>
  );
}
