import { ThemeView } from '@/components/ui/theme-view';
import { ThemeText } from '@/components/ui/theme-text';

export default function NotificationsScreen() {
  return (
    <ThemeView style={{ flex: 1, padding: 24 }}>
      <ThemeText variant="semibold">Notifications</ThemeText>
    </ThemeView>
  );
}
