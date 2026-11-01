import { useState, useRef, useCallback, useMemo } from "react";
import {
  Upload,
  FileText,
  FileImage,
  FileSpreadsheet,
  File as FileIcon,
  Download,
  Trash2,
  Eye,
  Loader2,
  X,
  Search,
  FolderOpen,
} from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import ErrorNotice from "@/components/errors/ErrorNotice.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { ResponsiveTable } from "@/components/ui/responsive-table.tsx";
import { DialogTemplate } from "@/components/templates/DialogTemplate.tsx";
import { useAsyncAction } from "@/hooks/useAsyncAction.ts";
import {
  listAttachments,
  uploadWorkspaceAttachment,
  softDeleteAttachment,
  getAttachmentAccessUrl,
  type AttachmentRow,
} from "@/lib/repositories/attachments.ts";

interface EntityFilesCardProps {
  workspaceId: string;
  entityTable: string;
  entityId: string;
  title?: string;
  description?: string;
  accept?: string;
}

function getFileName(path: string): string {
  return path.split("/").pop() ?? path;
}

function getFileExtension(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

function getFileCategory(path: string, mime: string | null): string {
  const ext = getFileExtension(path);
  if (["dxf", "dwg"].includes(ext)) return "Drawing";
  if (ext === "csv") return "Points";
  if (ext === "pdf") return "PDF";
  if (["tif", "tiff", "jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext)) return "Image";
  if (ext === "geojson") return "GeoJSON";
  if (ext === "txt" || mime?.startsWith("text/")) return "Text";
  return ext.toUpperCase() || "File";
}

function formatSize(bytes: number | null): string {
  if (bytes === null || bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function FileTypeIcon({ path, mime }: { path: string; mime: string | null }) {
  const ext = getFileExtension(path);
  const className = "h-4 w-4 text-muted-foreground";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "tif", "tiff"].includes(ext)) {
    return <FileImage className={className} />;
  }
  if (["csv", "xlsx", "xls"].includes(ext)) {
    return <FileSpreadsheet className={className} />;
  }
  if (["dxf", "dwg", "geojson", "pdf", "txt"].includes(ext) || mime?.startsWith("text/")) {
    return <FileText className={className} />;
  }
  return <FileIcon className={className} />;
}

export function EntityFilesCard({
  workspaceId,
  entityTable,
  entityId,
  title = "Files",
  description = "Upload and manage files related to this record.",
  accept,
}: EntityFilesCardProps) {
  const [files, setFiles] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<
    { name: string; status: "pending" | "done" | "error" }[]
  >([]);
  const [busyFileId, setBusyFileId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<AttachmentRow | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const fetchFiles = useCallback(async () => {
    try {
      setError(null);
      const rows = await listAttachments(workspaceId, {
        entityTable,
        entityId,
      });
      setFiles(rows);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load files.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, entityTable, entityId]);

  useAsyncAction(fetchFiles, [fetchFiles]);

  const filteredFiles = useMemo(() => {
    let list = files;
    if (search.trim()) {
      const query = search.trim().toLowerCase();
      list = list.filter((f) => getFileName(f.storage_path).toLowerCase().includes(query));
    }
    return list;
  }, [files, search]);

  const fileCategories = useMemo(() => {
    return Array.from(new Set(files.map((f) => getFileCategory(f.storage_path, f.mime_type))));
  }, [files]);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3000);
  };

  const openFilePicker = () => uploadInputRef.current?.click();

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const toUpload = Array.from(fileList);
    setUploading(true);
    setUploadQueue(toUpload.map((f) => ({ name: f.name, status: "pending" })));

    const results = await Promise.allSettled(
      toUpload.map(async (file, index) => {
        try {
          await uploadWorkspaceAttachment(workspaceId, file, {
            entityTable,
            entityId,
          });
          setUploadQueue((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], status: "done" };
            return next;
          });
        } catch (err) {
          setUploadQueue((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], status: "error" };
            return next;
          });
          throw err;
        }
      }),
    );

    const successCount = results.filter((r) => r.status === "fulfilled").length;
    const failureCount = results.length - successCount;

    if (failureCount > 0) {
      setError(`${failureCount} upload${failureCount === 1 ? "" : "s"} failed. Please retry.`);
    }

    if (successCount > 0) {
      showNotice(`${successCount} file${successCount === 1 ? "" : "s"} uploaded.`);
      await fetchFiles();
    }

    setUploading(false);
    setUploadQueue([]);
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  };

  const handleDownload = async (file: AttachmentRow) => {
    try {
      const url = await getAttachmentAccessUrl(file);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to open file.");
    }
  };

  const canPreview = (file: AttachmentRow): boolean => {
    const name = getFileName(file.storage_path).toLowerCase();
    const mime = file.mime_type ?? "";
    if (mime.startsWith("image/")) return true;
    if (mime === "application/pdf" || name.endsWith(".pdf")) return true;
    if (mime.startsWith("text/") || name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".geojson")) return true;
    return false;
  };

  const openPreview = async (file: AttachmentRow) => {
    if (!canPreview(file)) return;
    setPreviewFile(file);
    setPreviewLoading(true);
    setPreviewUrl(null);
    setPreviewText(null);
    try {
      const url = await getAttachmentAccessUrl(file, 60 * 60);
      setPreviewUrl(url);
      const name = getFileName(file.storage_path).toLowerCase();
      const mime = file.mime_type ?? "";
      if (mime.startsWith("text/") || name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".geojson")) {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error("Could not load preview.");
          setPreviewText(await res.text());
        } catch (err: unknown) {
          setPreviewText(err instanceof Error ? err.message : "Failed to load preview.");
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load preview.");
      setPreviewFile(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDelete = async (file: AttachmentRow) => {
    setBusyFileId(file.id);
    try {
      await softDeleteAttachment(file);
      showNotice("File removed.");
      await fetchFiles();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete file.");
    } finally {
      setBusyFileId(null);
    }
  };

  const completedUploads = uploadQueue.filter((q) => q.status === "done").length;
  const uploadProgressPct = uploadQueue.length
    ? Math.round((completedUploads / uploadQueue.length) * 100)
    : 0;

  if (loading) {
    return (
      <Card>
        <CardContent className="space-y-4 p-6">
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading files…
          </p>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FolderOpen className="h-5 w-5" /> {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <ErrorNotice tone="danger" onDismiss={() => setError(null)}>
            {error}
          </ErrorNotice>
        ) : null}

        {notice && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
            <span>{notice}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setNotice(null)}
              aria-label="Dismiss notice"
              className="size-7 shrink-0 text-success hover:text-success"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button onClick={openFilePicker} disabled={uploading} className="gap-2">
            <Upload className="h-4 w-4" />
            {uploading ? `Uploading ${completedUploads}/${uploadQueue.length}…` : "Upload Files"}
          </Button>
          <input
            ref={uploadInputRef}
            type="file"
            className="hidden"
            multiple
            accept={accept}
            onChange={(e) => void handleUploadFiles(e.target.files)}
          />
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search files…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-8"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {uploading && uploadQueue.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-2 text-xs">
            <span className="shrink-0">Uploading {completedUploads} of {uploadQueue.length} files…</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${uploadProgressPct}%` }} />
            </div>
            <span className="shrink-0">{uploadProgressPct}%</span>
          </div>
        )}

        {fileCategories.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Types:</span>
            {fileCategories.map((cat) => (
              <Badge key={cat} variant="secondary" className="text-xs">
                {cat}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>

      <CardContent className="p-0">
        {filteredFiles.length === 0 ? (
          <Empty className="border-none">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderOpen />
              </EmptyMedia>
              <EmptyTitle>
                {files.length === 0 ? "No files yet" : "No matching files"}
              </EmptyTitle>
              <EmptyDescription>
                {files.length === 0
                  ? "Upload documents and reference files to keep them with this record."
                  : "Try adjusting your search."}
              </EmptyDescription>
            </EmptyHeader>
            {files.length === 0 && (
              <EmptyContent>
                <Button size="sm" onClick={openFilePicker}>
                  Upload your first file
                </Button>
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <ResponsiveTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead className="hidden sm:table-cell">Type</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Size</TableHead>
                  <TableHead className="hidden lg:table-cell">Uploaded</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFiles.map((file) => {
                  const name = getFileName(file.storage_path);
                  const category = getFileCategory(file.storage_path, file.mime_type);
                  const isBusy = busyFileId === file.id;
                  return (
                    <TableRow key={file.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileTypeIcon path={file.storage_path} mime={file.mime_type} />
                          <div>
                            <p className="max-w-[180px] truncate font-medium sm:max-w-[260px]" title={name}>
                              {name}
                            </p>
                            <p className="text-xs text-muted-foreground">{category}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                        {category}
                      </TableCell>
                      <TableCell className="hidden text-right text-sm text-muted-foreground md:table-cell">
                        {formatSize(file.size_bytes)}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                        {formatDate(file.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Download"
                            aria-label="Download"
                            onClick={() => void handleDownload(file)}
                            disabled={isBusy}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          {canPreview(file) && (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Preview"
                              aria-label="Preview"
                              onClick={() => void openPreview(file)}
                              disabled={isBusy}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Remove"
                            aria-label="Remove"
                            className="text-destructive hover:text-destructive"
                            onClick={() => void handleDelete(file)}
                            disabled={isBusy}
                          >
                            {isBusy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ResponsiveTable>
        )}
      </CardContent>

      <DialogTemplate
        open={previewFile !== null}
        onOpenChange={(open) => { if (!open) { setPreviewFile(null); setPreviewUrl(null); setPreviewText(null); } }}
        title={previewFile ? getFileName(previewFile.storage_path) : "Preview"}
        size="2xl"
        className="sm:max-w-3xl"
      >
        <div className="flex min-h-[200px] flex-1 items-center justify-center overflow-auto">
          {previewLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          {!previewLoading && previewUrl && previewFile && (previewFile.mime_type?.startsWith("image/") || getFileName(previewFile.storage_path).match(/\.(jpg|jpeg|png|gif|webp|bmp|svg|tif|tiff)$/)) && (
            <img src={previewUrl} alt={getFileName(previewFile.storage_path)} className="max-h-[60vh] max-w-full object-contain" />
          )}
          {!previewLoading && previewUrl && previewText !== null && (
            <pre className="w-full max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 text-xs">
              {previewText}
            </pre>
          )}
          {!previewLoading && previewUrl && !previewText && (previewFile?.mime_type === "application/pdf" || getFileName(previewFile?.storage_path ?? "").endsWith(".pdf")) && (
            <iframe src={previewUrl} title={getFileName(previewFile?.storage_path ?? "")} className="h-[60vh] w-full rounded-md border" />
          )}
        </div>
      </DialogTemplate>
    </Card>
  );
}