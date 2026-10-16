import { ScrollView } from 'react-native';
import { useAuthStore } from '@/lib/auth/auth-store';
import { ThemeView } from '@/components/ui/theme-view';
import { ThemeText } from '@/components/ui/theme-text';
import { getAccountTypeLabel } from '@/features/workspace/account';
import { tokens } from '@/lib/theme/tokens';

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);

  return (
    <ScrollView contentContainerStyle={{ padding: tokens.space.lg, gap: tokens.space.md }}>
      <ThemeText variant="semibold" style={{ fontSize: tokens.text.lg }}>
        {user ? `Welcome, ${user.name}` : 'Welcome'}
      </ThemeText>
      <ThemeView tone="card" style={{ padding: tokens.space.md }}>
        <ThemeText variant="sm">
          {user ? `${getAccountTypeLabel(user.accountType)} · ${user.company}` : ''}
        </ThemeText>
      </ThemeView>
    </ScrollView>
  );
}
