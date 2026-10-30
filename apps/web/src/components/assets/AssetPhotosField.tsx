import { useEffect, useRef, useState } from "react";
import { ImagePlus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  assetMediaUrl,
  removeAssetPhotos,
  uploadAssetPhoto,
} from "@/lib/repositories/assetMedia";

export const MAX_ASSET_PHOTOS = 6;

export function AssetPhotosField({
  workspaceId,
  photos,
  onChange,
  onError,
}: {
  workspaceId: string;
  photos: string[];
  onChange: (photos: string[]) => void;
  onError?: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const photosRef = useRef(photos);
  const uploaded = useRef<string[]>([]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    return () => {
      const abandoned = uploaded.current.filter((p) => !photosRef.current.includes(p));
      if (abandoned.length > 0) {
        void removeAssetPhotos(abandoned);
      }
    };
  }, []);

  const handleAdd = async (files: FileList | null) => {
    if (!files) return;
    const remaining = MAX_ASSET_PHOTOS - photos.length;
    if (remaining <= 0) return;
    const picked = Array.from(files).slice(0, remaining);
    setBusy(true);
    try {
      const paths: string[] = [];
      for (const file of picked) {
        paths.push(await uploadAssetPhoto(file, workspaceId));
      }
      uploaded.current.push(...paths);
      onChange([...photos, ...paths]);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Failed to upload photo.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = (index: number) => {
    const path = photos[index];
    const next = photos.filter((_, i) => i !== index);
    onChange(next);
    uploaded.current = uploaded.current.filter((p) => p !== path);
    void removeAssetPhotos([path]);
  };

  const handleMakeCover = (index: number) => {
    if (index === 0) return;
    const next = [...photos];
    const [path] = next.splice(index, 1);
    onChange([path, ...next]);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <ImagePlus size={15} />
          </div>
          <div className="flex-1">
            <CardTitle className="text-base">Photos</CardTitle>
            <CardDescription>
              Up to {MAX_ASSET_PHOTOS} photos; the first is the marketplace cover.
            </CardDescription>
          </div>
          <span className="text-xs text-muted-foreground">
            {photos.length}/{MAX_ASSET_PHOTOS}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <input
          id="asset-photos-input"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          disabled={busy || photos.length >= MAX_ASSET_PHOTOS}
          onChange={(e) => {
            void handleAdd(e.target.files);
            e.target.value = "";
          }}
          className="hidden"
        />
        <div className="space-y-3">
          {photos.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {photos.map((path, i) => (
                <div key={path} className="relative">
                  <img
                    src={assetMediaUrl(path) ?? undefined}
                    alt={`Photo ${i + 1}`}
                    className={cn(
                      "aspect-square w-full rounded-md border object-cover",
                      i === 0 && "border-primary ring-1 ring-primary",
                    )}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="absolute right-1 top-1 h-6 w-6 bg-background/80"
                    onClick={() => handleRemove(i)}
                    aria-label={`Remove photo ${i + 1}`}
                  >
                    <Trash2 size={12} />
                  </Button>
                  {i !== 0 ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="absolute bottom-1 right-1 h-6 w-6 bg-background/80"
                      onClick={() => handleMakeCover(i)}
                      aria-label="Make cover"
                    >
                      <Star size={12} />
                    </Button>
                  ) : (
                    <span className="absolute bottom-1 left-1 rounded bg-primary/90 px-1 text-[10px] font-medium text-primary-foreground">
                      Cover
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center text-muted-foreground">
              <ImagePlus size={28} className="mb-2" />
              <p className="text-sm">No photos yet.</p>
            </div>
          )}
          <Label
            htmlFor="asset-photos-input"
            className={cn(
              "flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-transparent text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
              (busy || photos.length >= MAX_ASSET_PHOTOS) && "pointer-events-none opacity-50",
            )}
          >
            <ImagePlus size={14} />
            {busy
              ? "Uploading…"
              : photos.length >= MAX_ASSET_PHOTOS
                ? "Limit reached"
                : "Add photos"}
          </Label>
        </div>
      </CardContent>
    </Card>
  );
}