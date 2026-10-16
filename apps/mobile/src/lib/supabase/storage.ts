import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SupabaseStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

const serverStorage: SupabaseStorage = {
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
};

export function getSupabaseStorage(): SupabaseStorage {
  if (typeof window === 'undefined') {
    return serverStorage;
  }

  return AsyncStorage;
}
