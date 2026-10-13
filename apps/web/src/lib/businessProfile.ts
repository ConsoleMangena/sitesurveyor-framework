import { useCallback, useEffect, useState } from "react";

export interface BusinessProfile {
  name: string;
  address: string;
  taxNumber: string;
  phone: string;
  email: string;
  website: string;
}

const STORAGE_KEY = "sitesurveyor-business-profile";

const DEFAULT_PROFILE: BusinessProfile = {
  name: "",
  address: "",
  taxNumber: "",
  phone: "",
  email: "",
  website: "",
};

export function loadBusinessProfile(): BusinessProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    const parsed = JSON.parse(raw) as Partial<BusinessProfile>;
    return { ...DEFAULT_PROFILE, ...parsed };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveBusinessProfile(profile: BusinessProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // ignore storage errors
  }
}

export function useBusinessProfile() {
  const [profile, setProfileState] = useState<BusinessProfile>(loadBusinessProfile);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setProfileState(loadBusinessProfile());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setProfile = useCallback((next: BusinessProfile | ((prev: BusinessProfile) => BusinessProfile)) => {
    setProfileState((prev) => {
      const updated = typeof next === "function" ? next(prev) : next;
      saveBusinessProfile(updated);
      return updated;
    });
  }, []);

  return { profile, setProfile };
}
