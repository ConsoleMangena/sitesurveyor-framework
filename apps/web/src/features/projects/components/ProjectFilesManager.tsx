import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  Upload,
  FileText,
  FileImage,
  FileSpreadsheet,
  File as FileIcon,
  Download,
  Trash2,
  Eye,
  PenTool,
  Loader2,
  X,
  Search,
  FolderOpen,
} from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
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
import { useAsyncAction } from "../../../hooks/useAsyncAction.ts";
import type { AttachmentRow } from "../../../lib/repositories/attachments.ts";
import {
  listAttachments,
  uploadWorkspaceAttachment,
  softDeleteAttachment,
  getAttachmentAccessUrl,
} from "../../../lib/repositories/attachments.ts";
import {
  isLocalProjectFile,
  mergeProjectFiles,
  readProjectFiles,
  removeLocalProjectFile,
  writeProjectFiles,
  type ProjectFile,
} from "../../../lib/projectFileCache.ts";

interface ProjectFilesManagerProps {
  projectId?: string;
  workspaceId: string;
  onOpenInCad?: () => void;
}

const CAD_VIEWABLE_EXTENSIONS = new Set([
  "dxf",
  "dwg",
  "csv",
  "pdf",
  "tif",
  "tiff",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "svg",
  "geojson",
  "txt",
]);

function getFileName(path: string): string {
  return path.split("/").pop() ?? path;
}

function getFileExtension(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

function isCadViewable(path: string): boolean {
  return CAD_VIEWABLE_EXTENSIONS.has(getFileExtension(path));
}

function getFileCategory(path: string, mime: string | null): string {
  const ext = getFileExtension(path);
  if (["dxf", "dwg"].includes(ext)) return "CAD";
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
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "tif", "tiff"].includes(ext)) {
    return <FileImage size={18} className="text-sky-500" />;
  }
  if (["csv", "xlsx", "xls"].includes(ext)) {
    return <FileSpreadsheet size={18} className="text-emerald-500" />;
  }
  if (["dxf", "dwg", "geojson", "pdf", "txt"].includes(ext) || mime?.startsWith("text/")) {
    return <FileText size={18} className="text-amber-500" />;
  }
  return <FileIcon size={18} className="text-muted-foreground" />;
}

export function ProjectFilesManager({ projectId, workspaceId, onOpenInCad }: ProjectFilesManagerProps) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
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
    if (!projectId) {
      setFiles([]);
      setLoading(false);
      return;
    }

    const cached = readProjectFiles(projectId);
    if (!navigator.onLine) {
      // Offline: show the locally cached list so previously loaded/imported
      // files are still visible.
      setFiles(cached.filter((f) => isCadViewable(f.storage_path)));
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const rows = await listAttachments(workspaceId, {
        entityTable: "projects",
        entityId: projectId,
      });
      const viewable = rows.filter((r) => isCadViewable(r.storage_path));
      const merged = mergeProjectFiles(cached, viewable);
      writeProjectFiles(projectId, merged);
      setFiles(merged);
    } catch (err: unknown) {
      // If the server cannot be reached, fall back to the cached list rather
      // than showing an empty folder.
      setFiles(cached.filter((f) => isCadViewable(f.storage_path)));
      if (navigator.onLine) {
        setError(err instanceof Error ? err.message : "Failed to load project files.");
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId, projectId]);

  useAsyncAction(fetchFiles, [fetchFiles]);

  // Refresh the file list when the tab regains focus or the browser comes back
  // online, so files imported locally from the CAD workspace appear here.
  useEffect(() => {
    const handleFocus = () => fetchFiles();
    const handleOnline = () => fetchFiles();
    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
    };
  }, [fetchFiles]);

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
    if (!fileList || fileList.length === 0 || !projectId) return;

    const uploadFiles = Array.from(fileList);
    const rejected = uploadFiles.filter((f) => !isCadViewable(f.name));
    const accepted = uploadFiles.filter((f) => isCadViewable(f.name));

    if (rejected.length > 0) {
      setError(
        `${rejected.length} file${rejected.length === 1 ? "" : "s"} skipped. Only CAD-viewable types are allowed (DXF, DWG, CSV, PDF, images, GeoJSON, TXT).`
      );
      if (accepted.length === 0) {
        if (uploadInputRef.current) uploadInputRef.current.value = "";
        return;
      }
    }

    setUploading(true);
    setUploadQueue(accepted.map((f) => ({ name: f.name, status: "pending" })));

    const results = await Promise.allSettled(
      accepted.map(async (file, index) => {
        try {
          const result = await uploadWorkspaceAttachment(workspaceId, file, {
            entityTable: "projects",
            entityId: projectId,
          });
          setUploadQueue((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], status: "done" };
            return next;
          });
          return result;
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

  const handleDownload = async (file: ProjectFile) => {
    if (isLocalProjectFile(file)) {
      setError("Local files imported while offline are not stored on the server yet.");
      return;
    }
    try {
      const url = await getAttachmentAccessUrl(file);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to open file.");
    }
  };

  const canPreview = (file: ProjectFile): boolean => {
    if (isLocalProjectFile(file)) return false;
    const name = getFileName(file.storage_path).toLowerCase();
    const mime = file.mime_type ?? "";
    if (mime.startsWith("image/")) return true;
    if (mime === "application/pdf" || name.endsWith(".pdf")) return true;
    if (mime.startsWith("text/") || name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".geojson")) return true;
    return false;
  };

  const openPreview = async (file: ProjectFile) => {
    if (isLocalProjectFile(file) || !canPreview(file)) return;
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

  const handleDelete = async (file: ProjectFile) => {
    setBusyFileId(file.id);
    try {
      if (isLocalProjectFile(file)) {
        removeLocalProjectFile(projectId, file.id);
        showNotice("Local file removed.");
        await fetchFiles();
        return;
      }
      await softDeleteAttachment(file);
      showNotice("File removed.");
      await fetchFiles();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete file.");
    } finally {
      setBusyFileId(null);
    }
  };

  const handleOpenInCad = (file: ProjectFile) => {
    if (isLocalProjectFile(file)) {
      onOpenInCad?.();
      showNotice("This file was imported locally into the CAD workspace.");
      return;
    }
    const ext = getFileExtension(file.storage_path);
    if (["dxf", "dwg", "csv"].includes(ext)) {
      onOpenInCad?.();
      showNotice("Opened Engineering Surveyor CAD with selected file for reference.");
    } else {
      showNotice("This file type is kept for reference and is not imported into the CAD model.");
    }
  };

  const completedUploads = uploadQueue.filter((q) => q.status === "done").length;
  const uploadProgressPct = uploadQueue.length
    ? Math.round((completedUploads / uploadQueue.length) * 100)
    : 0;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" /> Loading project files…
        </CardContent>
      </Card>
    );
  }

  if (!projectId) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Open a project to upload and manage CAD files.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FolderOpen size={18} /> Project CAD Files
          </CardTitle>
          <CardDescription>
            Upload DXF, DWG, CSV, PDF, images, GeoJSON and other files that belong to this project.
            Files are managed here separately from the CAD workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start justify-between gap-3">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)} aria-label="Dismiss error" className="text-lg leading-none">
                ×
              </button>
            </div>
          )}

          {notice && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center justify-between gap-3">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notice" className="text-lg leading-none">
                ×
              </button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={openFilePicker} disabled={uploading} className="gap-2">
              <Upload size={16} />
              {uploading ? `Uploading ${completedUploads}/${uploadQueue.length}…` : "Upload CAD Files"}
            </Button>
            <input
              ref={uploadInputRef}
              type="file"
              className="hidden"
              multiple
              onChange={(e) => void handleUploadFiles(e.target.files)}
            />
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
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
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {uploading && uploadQueue.length > 0 && (
            <div className="rounded-lg border bg-muted/50 p-2 flex items-center gap-2 text-xs">
              <span className="shrink-0">Uploading {completedUploads} of {uploadQueue.length} files…</span>
              <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${uploadProgressPct}%` }} />
              </div>
              <span className="shrink-0">{uploadProgressPct}%</span>
            </div>
          )}

          {fileCategories.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Types in this project:</span>
              {fileCategories.map((cat) => (
                <Badge key={cat} variant="secondary" className="text-[10px]">
                  {cat}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {filteredFiles.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <FolderOpen size={40} className="mx-auto mb-3 text-muted-foreground/60" />
              <h3 className="text-lg font-semibold text-foreground">
                {files.length === 0 ? "No CAD files yet" : "No matching files"}
              </h3>
              <p className="text-sm mt-1 max-w-md mx-auto">
                {files.length === 0
                  ? "Upload drawings, point files, PDFs and reference images for this project. They will be stored here instead of inside the CAD workspace."
                  : "Try adjusting your search."}
              </p>
              {files.length === 0 && (
                <Button size="sm" onClick={openFilePicker} className="mt-4">
                  Upload your first file
                </Button>
              )}
            </div>
          ) : (
            <ResponsiveTable>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead className="hidden sm:table-cell">Type</TableHead>
                    <TableHead className="hidden md:table-cell text-right">Size</TableHead>
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
                              <p className="font-medium truncate max-w-[180px] sm:max-w-[260px]" title={name}>
                                {name}
                              </p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                                {category}
                                {isLocalProjectFile(file) && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-auto">
                                    Local
                                  </Badge>
                                )}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                          {category}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-right text-muted-foreground text-sm">
                          {formatSize(file.size_bytes)}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                          {formatDate(file.created_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Download"
                              onClick={() => void handleDownload(file)}
                              disabled={isBusy}
                            >
                              <Download size={16} />
                            </Button>
                            {canPreview(file) && (
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Preview"
                                onClick={() => void openPreview(file)}
                                disabled={isBusy}
                              >
                                <Eye size={16} />
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Open in CAD"
                              onClick={() => handleOpenInCad(file)}
                              disabled={isBusy}
                            >
                              <PenTool size={16} />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Remove"
                              className="text-destructive hover:text-destructive"
                              onClick={() => void handleDelete(file)}
                              disabled={isBusy}
                            >
                              {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
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
      </Card>

      <DialogTemplate
        open={previewFile !== null}
        onOpenChange={(open) => { if (!open) { setPreviewFile(null); setPreviewUrl(null); setPreviewText(null); } }}
        title={previewFile ? getFileName(previewFile.storage_path) : "Preview"}
        size="2xl"
        className="sm:max-w-3xl"
      >
        <div className="flex-1 overflow-auto min-h-[200px] flex items-center justify-center">
          {previewLoading && <Loader2 size={24} className="animate-spin text-muted-foreground" />}
          {!previewLoading && previewUrl && previewFile && (previewFile.mime_type?.startsWith("image/") || getFileName(previewFile.storage_path).match(/\.(jpg|jpeg|png|gif|webp|bmp|svg|tif|tiff)$/)) && (
            <img src={previewUrl} alt={getFileName(previewFile.storage_path)} className="max-w-full max-h-[60vh] object-contain" />
          )}
          {!previewLoading && previewUrl && previewText !== null && (
            <pre className="w-full max-h-[60vh] overflow-auto text-xs bg-muted p-4 rounded whitespace-pre-wrap">
              {previewText}
            </pre>
          )}
          {!previewLoading && previewUrl && !previewText && (previewFile?.mime_type === "application/pdf" || getFileName(previewFile?.storage_path ?? "").endsWith(".pdf")) && (
            <iframe src={previewUrl} title={getFileName(previewFile?.storage_path ?? "")} className="w-full h-[60vh] border rounded" />
          )}
        </div>
      </DialogTemplate>
    </div>
  );
}
