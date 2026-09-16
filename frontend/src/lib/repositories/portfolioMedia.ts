import { supabase } from "../supabase/client.ts";

/**
 * Media for the public professional portfolio lives in the public
 * `portfolio-media` bucket so anonymous /market visitors can load it without
 * signed URLs. Paths are workspace-scoped: `{workspace_id}/{kind}-{ts}.jpg`.
 */

const PORTFOLIO_BUCKET = "portfolio-media";
const MAX_BYTES = 8 * 1024 * 1024;

export type PortfolioMediaKind = "avatar" | "banner" | "showcase";

const MAX_DIMENSIONS: Record<PortfolioMediaKind, number> = {
  avatar: 512,
  banner: 1600,
  showcase: 1200,
};

/** Downscale to JPEG via canvas so phone photos don't blow up storage. */
async function downscaleToJpeg(file: File, maxDim: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85),
  );
  return blob ?? file;
}

/** Stable public URL for a portfolio-media path; null when unset. */
export function portfolioMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const { data } = supabase.storage.from(PORTFOLIO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadPortfolioMedia(
  file: File,
  workspaceId: string,
  kind: PortfolioMediaKind,
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file (PNG, JPG, WebP…).");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Image is too large — maximum 8 MB.");
  }
  const blob = await downscaleToJpeg(file, MAX_DIMENSIONS[kind]);
  const path = `${workspaceId}/${kind}-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from(PORTFOLIO_BUCKET)
    .upload(path, blob, {
      cacheControl: "31536000",
      contentType: "image/jpeg",
      upsert: false,
    });
  if (error) throw new Error(error.message);
  return path;
}

/** Best-effort delete — never fails the caller over cleanup. */
export async function removePortfolioMedia(
  path: string | null | undefined,
): Promise<void> {
  if (!path) return;
  await supabase.storage.from(PORTFOLIO_BUCKET).remove([path]).catch(() => undefined);
}
