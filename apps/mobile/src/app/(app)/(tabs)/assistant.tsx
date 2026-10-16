import { ThemeView } from '@/components/ui/theme-view';
import { ThemeText } from '@/components/ui/theme-text';

export default function AssistantScreen() {
  return (
    <ThemeView style={{ flex: 1, padding: 24 }}>
      <ThemeText variant="semibold">Assistant</ThemeText>
    </ThemeView>
  );
}
