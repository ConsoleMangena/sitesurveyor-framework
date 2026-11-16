import { create } from "zustand";
import type { UiUser } from "../../features/workspace/types";

interface AuthState {
  user: UiUser | null;
  isLoading: boolean;
  isAuthLoading: boolean;
  error: string | null;
  sessionExpired: boolean;
  /**
   * True when the signed-in session is a provider signup (Google/GitHub) that
   * has not completed the onboarding survey yet. Such accounts have no
   * workspace by design, so they never map to a `user` — this flag lets
   * ProtectedRoute admit them to /onboarding and the router send them there.
   */
  pendingOnboarding: boolean;

  setUser: (user: UiUser | null) => void;
  setLoading: (loading: boolean) => void;
  setAuthLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSessionExpired: (expired: boolean) => void;
  dismissSessionExpired: () => void;
  setPendingOnboarding: (pending: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthLoading: false,
  error: null,
  sessionExpired: false,
  pendingOnboarding: false,

  setUser: (user) => set({ user, error: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setAuthLoading: (isAuthLoading) => set({ isAuthLoading }),
  setError: (error) => set({ error }),
  setSessionExpired: (sessionExpired) => set({ sessionExpired }),
  dismissSessionExpired: () => set({ sessionExpired: false }),
  setPendingOnboarding: (pendingOnboarding) => set({ pendingOnboarding }),
}));
