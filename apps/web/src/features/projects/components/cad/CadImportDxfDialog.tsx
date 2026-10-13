import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  type ChangeEvent,
} from "react";
import { FileText, Loader2, Search, Upload, FileInput, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DialogTemplate } from "@/components/templates/DialogTemplate";
import { Input } from "@/components/ui/input";
import { useAsyncAction } from "../../../../hooks/useAsyncAction.ts";
import type { AttachmentRow } from "../../../../lib/repositories/attachments.ts";
import {
  listAttachments,
  getAttachmentAccessUrl,
} from "../../../../lib/repositories/attachments.ts";
import { addLocalProjectFile } from "../../../../lib/projectFileCache.ts";

interface CadImportDxfDialogProps {
  open: boolean;
  workspaceId: string;
  projectId?: string;
  onClose: () => void;
  onImport: (file: File) => void;
}

function getFileName(path: string): string {
  return path.split("/").pop() ?? path;
}

function getExtension(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

function mimeForExtension(ext: string): string {
  return ext === "dxf" ? "application/dxf" : "application/octet-stream";
}

export function CadImportDxfDialog({
  open,
  workspaceId,
  projectId,
  onClose,
  onImport,
}: CadImportDxfDialogProps) {
  const [files, setFiles] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [importingId, setImportingId] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [localBusy, setLocalBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const on = () => setIsOffline(false);
    const off = () => setIsOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const handleLocalImport = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setLocalBusy(true);
      try {
        if (!/\.dxf$/i.test(file.name)) {
          setError("Please select a .dxf file.");
          return;
        }
        addLocalProjectFile(projectId, file);
        onImport(file);
        onClose();
      } finally {
        setLocalBusy(false);
        // Reset the input so the same file can be selected again if reopened.
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [projectId, onImport, onClose],
  );

  const fetchFiles = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listAttachments(workspaceId);
      setFiles(rows.filter((r) => getExtension(r.storage_path) === "dxf"));
    } catch (err) {
      if (!navigator.onLine) {
        // Workspace files are not reachable offline; the local import option below still works.
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load files.");
      }
    } finally {
      setLoading(false);
    }
  }, [open, workspaceId]);

  useAsyncAction(fetchFiles, [fetchFiles]);

  const filteredFiles = useMemo(() => {
    if (!search.trim()) return files;
    const query = search.trim().toLowerCase();
    return files.filter((f) => getFileName(f.storage_path).toLowerCase().includes(query));
  }, [files, search]);

  const handleImport = async (file: AttachmentRow) => {
    setImportingId(file.id);
    try {
      const url = await getAttachmentAccessUrl(file);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch file: ${response.statusText}`);
      const bytes = await response.arrayBuffer();
      const name = getFileName(file.storage_path);
      const ext = getExtension(name);
      const blob = new File([bytes], name, { type: mimeForExtension(ext) });
      onImport(blob);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import file.");
    } finally {
      setImportingId(null);
    }
  };

  return (
    <DialogTemplate
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Import DXF file"
      description="Pick a DXF from your device or from workspace files. The drawing is parsed locally and added to the current project."
      icon={<FileInput className="size-4" />}
      size="xl"
      className="sm:rounded-none"
      footer={
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-2 sm:w-auto">
          <X size={14} /> Close
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search DXF files..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
            <Upload className="size-4 text-muted-foreground" />
            Import from this device
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={localBusy}
              onClick={() => fileInputRef.current?.click()}
              className="gap-2"
            >
              {localBusy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload size={14} />
              )}
              Choose .dxf file
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".dxf"
              className="hidden"
              onChange={handleLocalImport}
            />
            <span className="text-xs text-muted-foreground">
              Works offline too.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Workspace files
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="max-h-72 overflow-auto rounded-lg border bg-card">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="px-3 py-10 text-center text-sm text-muted-foreground">
              {isOffline
                ? "Workspace files are unavailable while offline. Import a local .dxf file above."
                : "No DXF files found in workspace files. Upload a .dxf file in File Manager first."}
            </div>
          ) : (
            <ul className="divide-y">
              {filteredFiles.map((file) => {
                const name = getFileName(file.storage_path);
                const busy = importingId === file.id;
                return (
                  <li
                    key={file.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600">
                        <FileText size={14} />
                      </span>
                      <span className="truncate text-sm" title={name}>
                        {name}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => handleImport(file)}
                      className="shrink-0"
                    >
                      {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Import"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </DialogTemplate>
  );
}
