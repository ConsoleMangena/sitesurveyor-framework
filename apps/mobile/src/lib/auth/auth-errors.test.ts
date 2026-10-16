import {
  isEmailNotConfirmedError,
  formatAuthUserFacingError,
} from '@/lib/auth/auth-errors';

describe('auth errors', () => {
  it('detects email-not-confirmed by code', () => {
    expect(isEmailNotConfirmedError({ code: 'email_not_confirmed' })).toBe(true);
    expect(isEmailNotConfirmedError({ message: 'nope' })).toBe(false);
  });

  it('maps invalid credentials to friendly copy', () => {
    expect(formatAuthUserFacingError({ code: 'invalid_credentials' })).toContain(
      'Incorrect email or password',
    );
  });

  it('maps rate limits to the Supabase mailer explanation', () => {
    expect(formatAuthUserFacingError({ status: 429 })).toContain('temporarily limited');
  });

  it('falls back to the provided message', () => {
    expect(formatAuthUserFacingError({ message: 'Boom' })).toBe('Boom');
  });
});
