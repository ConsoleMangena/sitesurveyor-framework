import { getCurrentUser } from "../auth/session.ts";
import { supabase } from "../supabase/client.ts";
import type { Tables, TablesUpdate } from "../supabase/types.ts";

// Keep compatibility when generated DB types lag behind migrations.
export type ProfileRow = Tables<"profiles"> & {
  is_platform_admin?: boolean;
  auth_signup_account_type?: string | null;
  deletion_requested_at?: string | null;
  deleted_at?: string | null;
};
export type ProfileUpdate = TablesUpdate<"profiles">;

export async function getMyProfile(): Promise<ProfileRow | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateMyProfile(
  patch: ProfileUpdate,
): Promise<ProfileRow> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("You must be signed in to update your profile.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", user.id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function requestAccountDeletion(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("You must be signed in to delete your account.");
  }

  const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>(
    "delete-user",
    { body: {} },
  );

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

// ── Avatar (private `avatars` bucket, per-user folder) ──────────────────────

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_URL_TTL_SECONDS = 60 * 60;

/**
 * Upload a new profile photo into the user's own avatars/ folder, delete the
 * previous file, and stamp `profiles.avatar_path`. Returns the storage path.
 */
export async function uploadMyAvatar(file: File, previousPath?: string | null): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to upload a photo.");
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file (PNG, JPG, WebP…).");
  }
  if (file.size > AVATAR_MAX_BYTES) {
    throw new Error("Photo is too large — maximum 5 MB.");
  }
  const ext = (file.type.split("/")[1] ?? "png").replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "");
  const path = `${user.id}/avatar-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;

  await updateMyProfile({ avatar_path: path });

  // Old file cleanup is best-effort (never fail the upload over it).
  if (previousPath && previousPath !== path) {
    await supabase.storage.from("avatars").remove([previousPath]).catch(() => undefined);
  }
  return path;
}

/** Short-lived signed URL for the private avatars bucket; null when no photo. */
export async function getAvatarSignedUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from("avatars")
    .createSignedUrl(path, AVATAR_URL_TTL_SECONDS);
  if (error) return null; // e.g. file was deleted out-of-band — silently fall back to initials.
  return data.signedUrl;
}

/** Delete the profile photo (bucket + column). */
export async function removeMyAvatar(): Promise<void> {
  const profile = await getMyProfile();
  const path = profile?.avatar_path;
  if (path) {
    await supabase.storage.from("avatars").remove([path]).catch(() => undefined);
  }
  await updateMyProfile({ avatar_path: null });
}

// ── Password reset ──────────────────────────────────────────────────────────

/** Send the Supabase password-reset email to the signed-in account's address. */
export async function sendPasswordResetEmail(): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.email) throw new Error("No sign-in email found on this account.");
  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
}
