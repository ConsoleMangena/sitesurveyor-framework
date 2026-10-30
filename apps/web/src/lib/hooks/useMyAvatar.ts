import { useEffect, useState } from "react";
import { getMyProfile, getAvatarSignedUrl } from "../repositories/profiles.ts";

/**
 * Resolve the signed-in user's profile picture.
 *
 * Returns a short-lived signed URL for the private avatars bucket, or `null`
 * when the user has not set a photo (callers should fall back to initials).
 * The URL is fetched once on mount.
 */
export function useMyAvatar(): string | null {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const profile = await getMyProfile();
        if (cancelled) return;
        const path = profile?.avatar_path ?? null;
        if (!path) {
          setAvatarUrl(null);
          return;
        }
        const url = await getAvatarSignedUrl(path);
        if (!cancelled) setAvatarUrl(url);
      } catch {
        if (!cancelled) setAvatarUrl(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return avatarUrl;
}
