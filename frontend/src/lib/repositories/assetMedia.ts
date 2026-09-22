import { supabase } from "../supabase/client.ts";
import { downscaleImageToJpeg } from "../imageUtils.ts";

const ASSET_BUCKET = "asset-media";
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 1200;

export async function uploadAssetPhoto(file: File, workspaceId: string): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file (PNG, JPG, WebP…).");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Image is too large — maximum 8 MB.");
  }
  const blob = await downscaleImageToJpeg(file, MAX_DIMENSION);
  const path = `${workspaceId}/photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage
    .from(ASSET_BUCKET)
    .upload(path, blob, {
      cacheControl: "31536000",
      contentType: "image/jpeg",
      upsert: false,
    });
  if (error) throw new Error(error.message);
  return path;
}

export function assetMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const { data } = supabase.storage.from(ASSET_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function removeAssetPhotos(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await supabase.storage.from(ASSET_BUCKET).remove(paths).catch(() => undefined);
}