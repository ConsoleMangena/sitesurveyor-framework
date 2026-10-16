jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import { getSupabaseStorage } from '@/lib/supabase/storage';

describe('getSupabaseStorage', () => {
  it('does not access window during server rendering', async () => {
    const existingWindow = globalThis.window;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: undefined,
    });

    try {
      const storage = getSupabaseStorage();

      expect(await storage.getItem('supabase.auth.token')).toBeNull();
      await expect(
        storage.setItem('supabase.auth.token', 'session'),
      ).resolves.toBeUndefined();
      await expect(
        storage.removeItem('supabase.auth.token'),
      ).resolves.toBeUndefined();
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: existingWindow,
      });
    }
  });
});
