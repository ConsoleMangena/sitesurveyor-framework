import { ThemeView } from '@/components/ui/theme-view';
import { ThemeText } from '@/components/ui/theme-text';

export default function ProfileScreen() {
  return (
    <ThemeView style={{ flex: 1, padding: 24 }}>
      <ThemeText variant="semibold">Profile</ThemeText>
    </ThemeView>
  );
}
