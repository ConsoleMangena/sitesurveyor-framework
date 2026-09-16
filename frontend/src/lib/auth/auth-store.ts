import { create } from "zustand";
import type { UiUser } from "../../features/workspace/types";

interface AuthState {
  user: UiUser | null;
  isLoading: boolean;
  isAuthLoading: boolean;
  error: string | null;
  sessionExpired: boolean;

  setUser: (user: UiUser | null) => void;
  setLoading: (loading: boolean) => void;
  setAuthLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSessionExpired: (expired: boolean) => void;
  dismissSessionExpired: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthLoading: false,
  error: null,
  sessionExpired: false,

  setUser: (user) => set({ user, error: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setAuthLoading: (isAuthLoading) => set({ isAuthLoading }),
  setError: (error) => set({ error }),
  setSessionExpired: (sessionExpired) => set({ sessionExpired }),
  dismissSessionExpired: () => set({ sessionExpired: false }),
}));
