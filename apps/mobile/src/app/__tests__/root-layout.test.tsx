import { render, screen } from '@testing-library/react-native';
import Index from '@/app/index';
import { useAuthStore } from '@/lib/auth/auth-store';

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text>redirect:{href}</Text>;
  },
}));

describe('Index', () => {
  it('shows a loader while auth is loading', async () => {
    useAuthStore.setState({ isLoading: true, user: null });
    await render(<Index />);
    expect(JSON.stringify(screen.toJSON())).toContain('ActivityIndicator');
  });

  it('redirects to login when signed out', async () => {
    useAuthStore.setState({ isLoading: false, user: null });
    await render(<Index />);
    expect(screen.getByText('redirect:/(auth)/login')).toBeTruthy();
  });
});
