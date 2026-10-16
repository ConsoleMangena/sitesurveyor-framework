import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import Login from '@/app/(auth)/login';
import { signInWithEmail } from '@/lib/auth/session';

jest.mock('@/lib/auth/session', () => ({
  signInWithEmail: jest.fn(),
}));

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useRouter: () => ({ replace: jest.fn() }),
}));

const signInWithEmailMock = signInWithEmail as unknown as jest.Mock;

describe('Login', () => {
  it('submits email and password', async () => {
    signInWithEmailMock.mockResolvedValue({ error: null });
    await render(<Login />);
    await fireEvent.changeText(screen.getByPlaceholderText('Email'), 'a@b.co');
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'secret123');
    await fireEvent.press(screen.getAllByText('Sign in')[1]);
    await waitFor(() =>
      expect(signInWithEmailMock).toHaveBeenCalledWith({
        email: 'a@b.co',
        password: 'secret123',
      }),
    );
  });
});
