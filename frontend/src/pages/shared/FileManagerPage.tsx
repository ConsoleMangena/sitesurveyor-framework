import { useState, useEffect, useCallback, useRef } from "react";
import {
  Upload,
  Search,
  X,
  Folder,
  MoreVertical,
  Download,
  Link2,
  ShieldCheck,
  ExternalLink,
  Tags,
  FolderInput,
  Activity,
  Trash2,
  RotateCcw,
  Copy,
  Eye,
  Share2,
  Loader2,
  Pencil,
  History,
} from "lucide-react";

import {
  listAttachments,
  softDeleteAttachment,
  restoreAttachment,
  permanentDeleteAttachment,
  uploadWorkspaceAttachment,
  getAttachmentAccessUrl,
  getAttachmentVersionAccessUrl,
  recordAttachmentAnchor,
  verifyAttachmentIntegrity,
  moveAttachmentsToFolder,
  renameAttachment,
  createAttachmentVersion,
  listAttachmentVersions,
  listFolders,
  listTags,
  createTag,
  getAttachmentTags,
  setAttachmentTags,
  listActivityLog,
  type StorageTier,
  type FolderRow,
  type TagRow,
  type ActivityLogEntry,
  type AttachmentVersionRow,
} from "../../lib/repositories/attachments.ts";
import { anchorFileHash, explorerTxUrl, explorerAccountUrl } from "../../features/solana/payments/fileAnchor.ts";
import { saveWalletActivity } from "../../features/solana/lib/walletHistory.ts";
import { SOLANA_CLUSTER } from "../../features/solana/lib/config.ts";
import PageLoader from "@/components/PageLoader.tsx";
import { DashboardShell } from "@/components/dashboard/DashboardShell.tsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { DialogTemplate } from "@/components/templates/DialogTemplate";
import { ConfirmDialog } from "@/components/templates/ConfirmDialog.tsx";
import { useDialogState } from "@/lib/hooks/useDialogState.ts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEmbeddedWallet } from "../../features/solana/hooks/useEmbeddedWallet.ts";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import type { AttachmentRow } from "../../lib/repositories/attachments.ts";

import "../../styles/pages.css";

interface FileManagerPageProps {
  workspaceId: string;
}

type SortOption = "date-desc" | "date-asc" | "name-asc" | "size-desc" | "size-asc";
type ViewMode = "offchain" | "onchain" | "trash";

const TAG_COLORS = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#7c3aed",
  "#d97706",
  "#0891b2",
  "#db2777",
  "#4b5563",
];

const getFileName = (path: string) => path.split("/").pop() ?? path;

const getFileType = (path: string, mime: string | null): string => {
  const ext = path.split(".").pop()?.toUpperCase() ?? "";
  if (["DXF", "DWG"].includes(ext)) return "DXF";
  if (ext === "CSV") return "CSV";
  if (ext === "PDF") return "PDF";
  if (["TIFF", "TIF"].includes(ext)) return "TIFF";
  if (["XLSX", "XLS"].includes(ext)) return "XLSX";
  if (mime?.startsWith("image/")) return "IMG";
  return ext || "FILE";
};

const formatSize = (bytes: number | null): string => {
  if (bytes === null || bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatDateLabel = (isoDate: string): string =>
  new Date(isoDate).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const CHAIN_BADGES: Record<
  AttachmentRow["chain_status"],
  { label: string; bg: string; color: string }
> = {
  anchored: { label: "On-chain", bg: "#dcfce7", color: "#15803d" },
  pending: { label: "Anchoring…", bg: "#fef9c3", color: "#a16207" },
  failed: { label: "Anchor failed", bg: "#fee2e2", color: "#b91c1c" },
  none: { label: "Off-chain", bg: "#f1f5f9", color: "#475569" },
};



const shortSig = (sig: string): string =>
  sig.length > 12 ? `${sig.slice(0, 6)}…${sig.slice(-4)}` : sig;

export default function FileManagerPage({ workspaceId }: FileManagerPageProps) {
  const embeddedWallet = useEmbeddedWallet();
  const [files, setFiles] = useState<AttachmentRow[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [fileTagMap, setFileTagMap] = useState<Record<string, TagRow[]>>({});
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [showActivityPanel, setShowActivityPanel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeType, setActiveType] = useState<string>("ALL");
  const [activeTagId, setActiveTagId] = useState<string | "all">("all");
  const [sortBy, setSortBy] = useState<SortOption>("date-desc");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<
    { name: string; status: "pending" | "done" | "error" }[]
  >([]);
  const [busyFileId, setBusyFileId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("offchain");
  const [moveMenuFileId, setMoveMenuFileId] = useState<string | null>(null);
  const [tagMenuFileId, setTagMenuFileId] = useState<string | null>(null);
  const [detailFile, setDetailFile] = useState<AttachmentRow | null>(null);
  const [previewFile, setPreviewFile] = useState<AttachmentRow | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewTextLoading, setPreviewTextLoading] = useState(false);
  const [shareFile, setShareFile] = useState<AttachmentRow | null>(null);
  const [shareExpiryHours, setShareExpiryHours] = useState(24);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [renameFile, setRenameFile] = useState<AttachmentRow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameLoading, setRenameLoading] = useState(false);
  const [versionHistoryFile, setVersionHistoryFile] = useState<AttachmentRow | null>(null);
  const [attachmentVersions, setAttachmentVersions] = useState<AttachmentVersionRow[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const noticeTimeoutRef = useRef<number | undefined>(undefined);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const versionUploadInputRef = useRef<HTMLInputElement | null>(null);
  const versionTargetRef = useRef<AttachmentRow | null>(null);
  const deleteFileRef = useRef<AttachmentRow | null>(null);
  const deleteState = useDialogState();

  const fetchFiles = useCallback(async () => {
    try {
      setError(null);
      const [fileData, folderData, tagData, logData] = await Promise.all([
        listAttachments(workspaceId, {
          includeDeleted: viewMode === "trash",
        }),
        listFolders(workspaceId),
        listTags(workspaceId),
        listActivityLog(workspaceId, { limit: 50 }),
      ]);
      setFiles(fileData);
      setFolders(folderData);
      setTags(tagData);
      setActivityLog(logData);

      const tagMap: Record<string, TagRow[]> = {};
      await Promise.all(
        fileData.map(async (file) => {
          tagMap[file.id] = await getAttachmentTags(file.id);
        }),
      );
      setFileTagMap(tagMap);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, viewMode]);

  useAsyncAction(fetchFiles, [fetchFiles]);

  const uploadTier: StorageTier = viewMode === "onchain" ? "on_chain" : "off_chain";

  const fileTypes = Array.from(
    new Set(files.map((f) => getFileType(f.storage_path, f.mime_type))),
  );
  const hasActiveFilters =
    search.trim() !== "" || activeType !== "ALL" || activeTagId !== "all";

  let filtered = files;
  if (viewMode === "trash") {
    filtered = filtered.filter((f) => f.deleted_at != null);
  } else {
    const tier: StorageTier = viewMode === "onchain" ? "on_chain" : "off_chain";
    filtered = filtered.filter((f) => f.deleted_at == null && f.storage_tier === tier);
  }
  if (activeType !== "ALL") {
    filtered = filtered.filter((f) => getFileType(f.storage_path, f.mime_type) === activeType);
  }
  if (activeTagId !== "all") {
    filtered = filtered.filter((f) => fileTagMap[f.id]?.some((t) => t.id === activeTagId));
  }
  if (search.trim()) {
    const query = search.trim().toLowerCase();
    filtered = filtered.filter((f) => getFileName(f.storage_path).toLowerCase().includes(query));
  }

  filtered = [...filtered].sort((a, b) => {
    const nameA = getFileName(a.storage_path);
    const nameB = getFileName(b.storage_path);
    if (sortBy === "name-asc") return nameA.localeCompare(nameB);
    if (sortBy === "size-desc") return (b.size_bytes ?? 0) - (a.size_bytes ?? 0);
    if (sortBy === "size-asc") return (a.size_bytes ?? 0) - (b.size_bytes ?? 0);
    if (sortBy === "date-asc") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const allVisibleSelected = filtered.length > 0 && filtered.every((f) => selectedFiles.has(f.id));
  const visibleSelectedCount = filtered.filter((f) => selectedFiles.has(f.id)).length;

  const completedUploads = uploadQueue.filter((q) => q.status === "done").length;
  const uploadProgressPct = uploadQueue.length
    ? Math.round((completedUploads / uploadQueue.length) * 100)
    : 0;

  const toggleSelect = (id: string) => {
    const next = new Set(selectedFiles);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedFiles(next);
  };

  const toggleAll = () => {
    const next = new Set(selectedFiles);
    if (allVisibleSelected) {
      filtered.forEach((f) => next.delete(f.id));
    } else {
      filtered.forEach((f) => next.add(f.id));
    }
    setSelectedFiles(next);
  };

  const clearFilters = () => {
    setSearch("");
    setActiveType("ALL");
    setActiveTagId("all");
  };

  const handleMoveToFolder = async (attachmentId: string, targetFolderId: string | null) => {
    try {
      await moveAttachmentsToFolder(workspaceId, [attachmentId], targetFolderId);
      setMoveMenuFileId(null);
      await fetchFiles();
      showNotice("File moved.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to move file.");
    }
  };

  const handleBulkMoveToFolder = async (targetFolderId: string | null) => {
    if (visibleSelectedCount === 0) return;
    const ids = filtered.filter((f) => selectedFiles.has(f.id)).map((f) => f.id);
    try {
      await moveAttachmentsToFolder(workspaceId, ids, targetFolderId);
      setSelectedFiles(new Set());
      await fetchFiles();
      showNotice(`${ids.length} file${ids.length === 1 ? "" : "s"} moved.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to move files.");
    }
  };

  const handleCreateTag = async () => {
    const name = newTagName.trim();
    if (!name) return;
    try {
      const color = TAG_COLORS[tags.length % TAG_COLORS.length];
      await createTag(workspaceId, name, color);
      setNewTagName("");
      setShowNewTagInput(false);
      await fetchFiles();
      showNotice("Tag created.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create tag.");
    }
  };

  const handleToggleTag = async (attachmentId: string, tagId: string) => {
    try {
      const current = fileTagMap[attachmentId] ?? [];
      const next = current.some((t) => t.id === tagId)
        ? current.filter((t) => t.id !== tagId)
        : [...current, tags.find((t) => t.id === tagId)!].filter(Boolean);
      await setAttachmentTags(attachmentId, next.map((t) => t.id));
      setFileTagMap((prev) => ({ ...prev, [attachmentId]: next }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update tags.");
    }
  };

  const showNotice = (message: string) => {
    if (noticeTimeoutRef.current) {
      window.clearTimeout(noticeTimeoutRef.current);
    }
    setNotice(message);
    noticeTimeoutRef.current = window.setTimeout(() => setNotice(null), 2200);
  };

  useEffect(() => {
    return () => {
      if (noticeTimeoutRef.current) window.clearTimeout(noticeTimeoutRef.current);
    };
  }, []);

  const openFilePicker = () => {
    uploadInputRef.current?.click();
  };

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const uploadFiles = Array.from(fileList);

    setUploading(true);
    setError(null);
    setUploadQueue(uploadFiles.map((f) => ({ name: f.name, status: "pending" })));

    const tier = uploadTier;
    const results = await Promise.allSettled(
      uploadFiles.map(async (file, index) => {
        try {
          const result = await uploadWorkspaceAttachment(workspaceId, file, {
            storageTier: tier,
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

    const uploaded = results
      .filter((r): r is PromiseFulfilledResult<AttachmentRow> => r.status === "fulfilled")
      .map((r) => r.value);
    const successCount = uploaded.length;
    const failureCount = results.length - successCount;

    if (failureCount > 0) {
      setError(`${failureCount} upload${failureCount === 1 ? "" : "s"} failed. Please retry those files.`);
    }

    if (successCount > 0) {
      showNotice(`${successCount} file${successCount === 1 ? "" : "s"} uploaded.`);
      await fetchFiles();
    }

    setUploading(false);
    setUploadQueue([]);
    if (uploadInputRef.current) uploadInputRef.current.value = "";

    if (tier === "on_chain") {
      for (const att of uploaded) {
        await anchorFile(att);
      }
    }
  };

  const anchorFile = async (file: AttachmentRow) => {
    if (!file.content_hash) {
      setError("This file has no content hash and cannot be anchored.");
      return;
    }
    setBusyFileId(file.id);
    setError(null);
    try {
      const { signature, network, recordPda } = await anchorFileHash(
        workspaceId,
        file.content_hash,
        embeddedWallet.unlockedWallet?.keypair,
      );
      await recordAttachmentAnchor(file.id, {
        txSignature: signature,
        network,
        programAddress: recordPda || undefined,
      });
      saveWalletActivity({
        type: "anchor",
        label: "Anchored file on Solana",
        signature,
        detail: getFileName(file.storage_path),
        network: SOLANA_CLUSTER,
      });
      showNotice("File anchored on Solana.");
      await fetchFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to anchor file on-chain.");
    } finally {
      setBusyFileId(null);
    }
  };

  const handleVerifyIntegrity = async (file: AttachmentRow) => {
    setBusyFileId(file.id);
    setError(null);
    try {
      const { ok } = await verifyAttachmentIntegrity(file);
      showNotice(ok ? "Integrity verified — file is unchanged." : "Mismatch! File differs from its hash.");
      if (!ok) setError("Integrity check failed: the stored file does not match its recorded hash.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify file integrity.");
    } finally {
      setBusyFileId(null);
    }
  };

  const viewOnExplorer = (file: AttachmentRow) => {
    if (!file.chain_network) return;
    const url = file.chain_program_address
      ? explorerAccountUrl(file.chain_program_address, file.chain_network)
      : file.chain_tx_signature
        ? explorerTxUrl(file.chain_tx_signature, file.chain_network)
        : null;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleFileDownload = async (file: AttachmentRow) => {
    try {
      const url = await getAttachmentAccessUrl(file);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open file.");
    }
  };

  const handleCopyFileLink = async (file: AttachmentRow) => {
    try {
      const url = await getAttachmentAccessUrl(file);
      await navigator.clipboard.writeText(url);
      showNotice("Secure file link copied.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy link.");
    }
  };

  const canPreviewFile = (file: AttachmentRow): boolean => {
    const mime = file.mime_type ?? "";
    const name = getFileName(file.storage_path).toLowerCase();
    if (mime.startsWith("image/")) return true;
    if (mime === "application/pdf" || name.endsWith(".pdf")) return true;
    if (mime.startsWith("text/") || name.endsWith(".csv")) return true;
    return false;
  };

  const isTextPreviewFile = (file: AttachmentRow): boolean => {
    const mime = file.mime_type ?? "";
    const name = getFileName(file.storage_path).toLowerCase();
    return mime.startsWith("text/") || name.endsWith(".csv");
  };

  const isImagePreviewFile = (file: AttachmentRow): boolean => {
    const mime = file.mime_type ?? "";
    const ext = getFileName(file.storage_path).split(".").pop()?.toLowerCase() ?? "";
    if (mime.startsWith("image/")) return true;
    return ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "tiff", "tif"].includes(ext);
  };

  const openPreview = async (file: AttachmentRow) => {
    if (!canPreviewFile(file)) return;
    setPreviewFile(file);
    setPreviewLoading(true);
    setPreviewUrl(null);
    setPreviewText(null);
    setPreviewTextLoading(false);
    try {
      const url = await getAttachmentAccessUrl(file, 60 * 60);
      setPreviewUrl(url);
      if (isTextPreviewFile(file)) {
        setPreviewTextLoading(true);
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error("Could not load file text.");
          const text = await res.text();
          setPreviewText(text);
        } catch (err) {
          setPreviewText(err instanceof Error ? err.message : "Failed to load text preview.");
        } finally {
          setPreviewTextLoading(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load preview.");
      setPreviewFile(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const generateShareLink = async () => {
    if (!shareFile) return;
    setShareLoading(true);
    setShareUrl(null);
    try {
      const url = await getAttachmentAccessUrl(
        shareFile,
        shareExpiryHours * 60 * 60,
      );
      setShareUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate share link.");
    } finally {
      setShareLoading(false);
    }
  };

  const openShare = (file: AttachmentRow) => {
    setShareFile(file);
    setShareExpiryHours(24);
    setShareUrl(null);
    setShareLoading(false);
  };

  const openRename = (file: AttachmentRow) => {
    setRenameFile(file);
    setRenameValue(getFileName(file.storage_path));
    setRenameLoading(false);
  };

  const handleRename = async () => {
    if (!renameFile) return;
    const newName = renameValue.trim();
    if (!newName) {
      setError("File name cannot be empty.");
      return;
    }
    if (newName === getFileName(renameFile.storage_path)) {
      setError("New name must be different from the current name.");
      return;
    }
    setRenameLoading(true);
    try {
      await renameAttachment(renameFile, newName);
      showNotice("File renamed.");
      setRenameFile(null);
      setRenameValue("");
      await fetchFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename file.");
    } finally {
      setRenameLoading(false);
    }
  };

  const openVersionHistory = async (file: AttachmentRow) => {
    setVersionHistoryFile(file);
    setVersionsLoading(true);
    setAttachmentVersions([]);
    try {
      const rows = await listAttachmentVersions(file.id);
      setAttachmentVersions(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load version history.");
      setVersionHistoryFile(null);
    } finally {
      setVersionsLoading(false);
    }
  };

  const handleDownloadVersion = async (
    file: AttachmentRow,
    version: AttachmentVersionRow,
  ) => {
    try {
      const url = await getAttachmentVersionAccessUrl(version, file);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open version.");
    }
  };

  const handleUploadVersion = async (file: File, attachment: AttachmentRow) => {
    setBusyFileId(attachment.id);
    try {
      await createAttachmentVersion(attachment, file);
      showNotice("New version uploaded.");
      await fetchFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload new version.");
    } finally {
      setBusyFileId(null);
    }
  };

  const handleSingleDelete = async (file: AttachmentRow) => {
    try {
      if (viewMode === "trash") {
        await permanentDeleteAttachment(file);
        showNotice("File permanently deleted.");
      } else {
        await softDeleteAttachment(file);
        showNotice("File moved to trash.");
      }
      setSelectedFiles((prev) => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });
      await fetchFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete file.");
    }
  };

  const handleBulkDelete = async () => {
    if (visibleSelectedCount === 0) return;
    const toDelete = filtered.filter((f) => selectedFiles.has(f.id));
    const results = await Promise.allSettled(
      toDelete.map((f) =>
        viewMode === "trash" ? permanentDeleteAttachment(f) : softDeleteAttachment(f),
      ),
    );

    const successCount = results.filter((r) => r.status === "fulfilled").length;
    const failureCount = results.length - successCount;

    if (successCount > 0) {
      setSelectedFiles(new Set());
      showNotice(
        `${successCount} file${successCount === 1 ? "" : "s"} ${
          viewMode === "trash" ? "permanently deleted" : "moved to trash"
        }.`,
      );
      await fetchFiles();
    }

    if (failureCount > 0) {
      setError(`${failureCount} delete${failureCount === 1 ? "" : "s"} failed. Please retry.`);
    }
  };

  const handleRestore = async (file: AttachmentRow) => {
    try {
      await restoreAttachment(file);
      showNotice("File restored.");
      await fetchFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore file.");
    }
  };

  const handleBulkRestore = async () => {
    if (visibleSelectedCount === 0) return;
    const toRestore = filtered.filter((f) => selectedFiles.has(f.id));
    const results = await Promise.allSettled(toRestore.map((f) => restoreAttachment(f)));
    const successCount = results.filter((r) => r.status === "fulfilled").length;
    if (successCount > 0) {
      setSelectedFiles(new Set());
      showNotice(`${successCount} file${successCount === 1 ? "" : "s"} restored.`);
      await fetchFiles();
    }
  };

  const handleBulkCopyLinks = async () => {
    if (visibleSelectedCount === 0) return;
    const first = filtered.find((f) => selectedFiles.has(f.id));
    if (!first) return;
    try {
      const url = await getAttachmentAccessUrl(first);
      await navigator.clipboard.writeText(url);
      showNotice("Copied link for first selected file");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy link.");
    }
  };

  const handleBulkAnchor = async () => {
    if (visibleSelectedCount === 0) return;
    const toAnchor = filtered.filter(
      (f) => selectedFiles.has(f.id) && f.content_hash && f.chain_status !== "anchored",
    );
    if (toAnchor.length === 0) {
      showNotice("No selected files are available for anchoring.");
      return;
    }
    for (const file of toAnchor) {
      await anchorFile(file);
    }
  };

  if (loading) {
    return (
      <div className="hub-body p-6 file-manager-page">
        <PageLoader />
      </div>
    );
  }

  return (
    <DashboardShell className="hub-body file-manager-page">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">File Manager</h1>
          <p className="text-sm text-muted-foreground">
            Secure storage for CAD files, plans, and survey data.
          </p>
        </div>
        <Button onClick={openFilePicker} disabled={uploading || viewMode === "trash"} className="gap-2 w-full sm:w-auto">
          <Upload size={16} />
          {uploading ? "Uploading..." : viewMode === "trash" ? "Upload disabled in trash" : "Upload Files"}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {notice}
        </div>
      )}

      <input
        ref={uploadInputRef}
        type="file"
        className="hidden"
        multiple
        onChange={(e) => void handleUploadFiles(e.target.files)}
      />
      <input
        ref={versionUploadInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const target = versionTargetRef.current;
          if (file && target) {
            void handleUploadVersion(file, target);
          }
          if (e.target) e.target.value = "";
        }}
      />

      {uploading && uploadQueue.length > 0 && (
        <div className="rounded-lg border bg-muted/50 p-2 flex items-center gap-2 text-xs">
          <span className="shrink-0">Uploading {completedUploads} of {uploadQueue.length} files…</span>
          <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${uploadProgressPct}%` }} />
          </div>
          <span className="shrink-0">{uploadProgressPct}%</span>
        </div>
      )}

      <div className={`grid gap-4 ${showActivityPanel ? "grid-cols-1 lg:grid-cols-[1fr_280px]" : "grid-cols-1"}`}>
        {/* Main table */}
        <div className="space-y-3 min-w-0">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 border-b pb-2">
              <Button
                variant={viewMode === "offchain" ? "default" : "outline"}
                size="sm"
                onClick={() => { setViewMode("offchain"); setSelectedFiles(new Set()); }}
              >
                Off-chain
              </Button>
              <Button
                variant={viewMode === "onchain" ? "default" : "outline"}
                size="sm"
                onClick={() => { setViewMode("onchain"); setSelectedFiles(new Set()); }}
              >
                On-chain
              </Button>
              <Button
                variant={viewMode === "trash" ? "default" : "outline"}
                size="sm"
                onClick={() => { setViewMode("trash"); setSelectedFiles(new Set()); }}
              >
                Trash
              </Button>
              <div className="relative w-full sm:w-48">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search files..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 pr-7 h-9"
                />
                {search && (
                  <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
                    <X size={14} />
                  </button>
                )}
              </div>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="w-full sm:w-36 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="date-desc">Newest first</SelectItem>
                  <SelectItem value="date-asc">Oldest first</SelectItem>
                  <SelectItem value="name-asc">Name A-Z</SelectItem>
                  <SelectItem value="size-desc">Largest first</SelectItem>
                  <SelectItem value="size-asc">Smallest first</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant={showActivityPanel ? "default" : "outline"}
                size="icon"
                className="h-9 w-9"
                onClick={() => setShowActivityPanel((p) => !p)}
                aria-label="Toggle activity panel"
              >
                <Activity size={16} />
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Button size="sm" variant={activeType === "ALL" ? "default" : "outline"} onClick={() => setActiveType("ALL")}>All types</Button>
              {fileTypes.map((type) => (
                <Button key={type} size="sm" variant={activeType === type ? "default" : "outline"} onClick={() => setActiveType(type)}>{type}</Button>
              ))}
              <Separator orientation="vertical" className="h-5 hidden sm:block" />
              <Button size="sm" variant={activeTagId === "all" ? "default" : "outline"} onClick={() => setActiveTagId("all")}>All tags</Button>
              {tags.map((tag) => (
                <Button
                  key={tag.id}
                  size="sm"
                  variant={activeTagId === tag.id ? "default" : "outline"}
                  onClick={() => setActiveTagId(tag.id)}
                  title={tag.name}
                >
                  {tag.name}
                </Button>
              ))}
              {hasActiveFilters && (
                <Button size="sm" variant="ghost" onClick={clearFilters}>Clear</Button>
              )}
              <span className="text-xs text-muted-foreground ml-auto">{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>
            </div>

          {visibleSelectedCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/50 p-3 text-sm">
              <span>{visibleSelectedCount} selected</span>
              <div className="flex flex-wrap items-center gap-2">
                {viewMode !== "trash" ? (
                  <>
                    <Button size="sm" variant="outline" onClick={handleBulkCopyLinks}>Copy Links</Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleBulkAnchor}
                      disabled={!embeddedWallet.unlocked}
                      title={
                        embeddedWallet.unlocked
                          ? undefined
                          : "Unlock your embedded wallet to anchor files on-chain."
                      }
                    >
                      {embeddedWallet.unlocked ? "Anchor on Solana" : "Unlock wallet to anchor"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setMoveMenuFileId("__bulk__")}><FolderInput size={14} className="mr-1" /> Move</Button>
                    <Button size="sm" variant="destructive" onClick={handleBulkDelete}><Trash2 size={14} className="mr-1" /> Trash</Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="outline" onClick={handleBulkRestore}><RotateCcw size={14} className="mr-1" /> Restore</Button>
                    <Button size="sm" variant="destructive" onClick={handleBulkDelete}><Trash2 size={14} className="mr-1" /> Delete forever</Button>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="border rounded-md overflow-hidden">
            <ResponsiveTable>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleAll}
                        aria-label="Select all visible files"
                      />
                    </TableHead>
                    <TableHead>File Name</TableHead>
                    <TableHead className="hidden sm:table-cell">Type</TableHead>
                    <TableHead className="hidden md:table-cell text-right">Size</TableHead>
                    <TableHead className="hidden lg:table-cell">Date</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
              <TableBody>
                {filtered.map((file) => {
                  const type = getFileType(file.storage_path, file.mime_type);
                  const name = getFileName(file.storage_path);
                  const isOnchain = viewMode === "onchain";
                  const isTrash = viewMode === "trash";
                  const fileTags = fileTagMap[file.id] ?? [];
                  return (
                    <TableRow key={file.id} data-state={selectedFiles.has(file.id) ? "selected" : undefined}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedFiles.has(file.id)}
                          onChange={() => toggleSelect(file.id)}
                          aria-label={`Select ${name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <div
                            className={`truncate max-w-[200px] sm:max-w-xs ${canPreviewFile(file) ? "cursor-pointer text-primary hover:underline" : ""}`}
                            onClick={() => {
                              if (canPreviewFile(file)) void openPreview(file);
                            }}
                            title={canPreviewFile(file) ? "Click to preview" : name}
                          >
                            {name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {fileTags.length > 0 && <span>{fileTags.map((t) => t.name).join(", ")}</span>}
                            {isOnchain && file.chain_status !== "none" && (
                              <span>
                                {fileTags.length > 0 && " · "}
                                {busyFileId === file.id ? "Working…" : CHAIN_BADGES[file.chain_status].label.toLowerCase()}
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">
                        {type}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-right text-muted-foreground">{formatSize(file.size_bytes)}</TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">
                        {formatDateLabel(isTrash ? file.deleted_at ?? file.created_at : file.created_at)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${name}`}>
                              <MoreVertical size={16} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {!isTrash ? (
                              <>
                                <DropdownMenuItem onClick={() => void handleFileDownload(file)}>
                                  <Download size={14} className="mr-2" /> Open / Download
                                </DropdownMenuItem>
                                {canPreviewFile(file) && (
                                  <DropdownMenuItem onClick={() => void openPreview(file)}>
                                    <Eye size={14} className="mr-2" /> Preview
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => void handleCopyFileLink(file)}>
                                  <Link2 size={14} className="mr-2" /> Copy Link
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openShare(file)}>
                                  <Share2 size={14} className="mr-2" /> Share link
                                </DropdownMenuItem>
                                {isOnchain ? (
                                  <>
                                    <DropdownMenuItem onClick={() => setDetailFile(file)}>
                                      <ShieldCheck size={14} className="mr-2" /> On-chain details
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => void handleVerifyIntegrity(file)} disabled={busyFileId === file.id || file.chain_status !== "anchored"}>
                                      <ShieldCheck size={14} className="mr-2" /> Verify integrity
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => viewOnExplorer(file)}>
                                      <ExternalLink size={14} className="mr-2" /> View on explorer
                                    </DropdownMenuItem>
                                  </>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() => void anchorFile(file)}
                                    disabled={busyFileId === file.id || !embeddedWallet.unlocked}
                                    title={
                                      embeddedWallet.unlocked
                                        ? undefined
                                        : "Unlock your embedded wallet to anchor files on-chain."
                                    }
                                  >
                                    <ShieldCheck size={14} className="mr-2" />
                                    {file.chain_status === "failed"
                                      ? "Retry anchor on Solana"
                                      : embeddedWallet.unlocked
                                        ? "Anchor on Solana"
                                        : "Unlock wallet to anchor"}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => openRename(file)}>
                                  <Pencil size={14} className="mr-2" /> Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setMoveMenuFileId(file.id)}>
                                  <FolderInput size={14} className="mr-2" /> Move to folder
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setTagMenuFileId(file.id)}>
                                  <Tags size={14} className="mr-2" /> Tags
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    versionTargetRef.current = file;
                                    versionUploadInputRef.current?.click();
                                  }}
                                  disabled={busyFileId === file.id}
                                >
                                  <Upload size={14} className="mr-2" /> Upload new version
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => void openVersionHistory(file)}>
                                  <History size={14} className="mr-2" /> Version history
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    deleteFileRef.current = file;
                                    deleteState.setOpen(true);
                                  }}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 size={14} className="mr-2" /> Move to trash
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <>
                                <DropdownMenuItem onClick={() => void handleRestore(file)}>
                                  <RotateCcw size={14} className="mr-2" /> Restore
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    deleteFileRef.current = file;
                                    deleteState.setOpen(true);
                                  }}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 size={14} className="mr-2" /> Delete forever
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-48 text-center align-middle">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <Folder size={40} />
                        <h3 className="mt-3 text-lg font-semibold text-foreground">
                          {files.length === 0
                            ? "No files yet"
                            : viewMode === "trash"
                              ? "Trash is empty"
                              : "No matching files"}
                        </h3>
                        <p>
                          {files.length === 0
                            ? "Upload your first file to get started."
                            : viewMode === "onchain"
                              ? "Anchor off-chain files to see them here."
                              : "Adjust your filters or upload a new file."}
                        </p>
                        <div className="mt-3">
                          {files.length === 0 || viewMode === "onchain" ? (
                            <Button size="sm" onClick={openFilePicker}>
                              {viewMode === "onchain" ? "Upload a file" : "Upload your first file"}
                            </Button>
                          ) : hasActiveFilters ? (
                            <Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                </TableBody>
              </Table>
            </ResponsiveTable>
          </div>
        </div>
      </div>

        {/* Activity panel */}
        {showActivityPanel && (
          <div className="h-fit space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">Activity</h3>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowActivityPanel(false)} aria-label="Close activity panel">
                  <X size={14} />
                </Button>
              </div>
              <div className="space-y-3">
                {activityLog.length === 0 && <p className="text-sm text-muted-foreground">No recent activity.</p>}
                {activityLog.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 text-sm">
                    <div className="mt-0.5 text-muted-foreground">
                      {entry.action.includes("deleted") ? <Trash2 size={14} /> : entry.action.includes("uploaded") ? <Upload size={14} /> : entry.action.includes("restored") ? <RotateCcw size={14} /> : <Activity size={14} />}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium capitalize">{entry.action.replace(/_/g, " ")}</p>
                      <p className="text-xs text-muted-foreground">{formatDateLabel(entry.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
          </div>
        )}
      </div>

      {/* Move Dialog */}
      <DialogTemplate
        open={moveMenuFileId !== null}
        onOpenChange={(open) => { if (!open) setMoveMenuFileId(null); }}
        title="Move to folder"
        size="sm"
        contentClassName="p-0"
        footer={
          <Button variant="outline" onClick={() => setMoveMenuFileId(null)}>Cancel</Button>
        }
      >
        <div className="space-y-1">
          <Button variant="ghost" className="w-full justify-start gap-2" onClick={() => moveMenuFileId === "__bulk__" ? void handleBulkMoveToFolder(null) : void handleMoveToFolder(moveMenuFileId!, null)}>
            <Folder size={16} /> Files root
          </Button>
          {folders.map((folder) => (
            <Button
              key={folder.id}
              variant="ghost"
              className="w-full justify-start gap-2"
              onClick={() => moveMenuFileId === "__bulk__" ? void handleBulkMoveToFolder(folder.id) : void handleMoveToFolder(moveMenuFileId!, folder.id)}
            >
              <Folder size={16} /> {folder.name}
            </Button>
          ))}
          {folders.length === 0 && <p className="text-sm text-muted-foreground">No folders available.</p>}
        </div>
      </DialogTemplate>

      {/* On-chain Detail Dialog */}
      <DialogTemplate
        open={detailFile !== null}
        onOpenChange={(open) => { if (!open) setDetailFile(null); }}
        title="On-chain details"
        size="md"
      >
        {detailFile && (
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-muted-foreground">File</p>
              <p className="font-medium break-all">{getFileName(detailFile.storage_path)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Status</p>
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
                style={{
                  background: CHAIN_BADGES[detailFile.chain_status].bg,
                  color: CHAIN_BADGES[detailFile.chain_status].color,
                  borderColor: CHAIN_BADGES[detailFile.chain_status].color,
                }}
              >
                {CHAIN_BADGES[detailFile.chain_status].label}
              </span>
            </div>
            <div>
              <p className="text-muted-foreground">Network</p>
              <p className="font-medium">{detailFile.chain_network ?? "—"}</p>
            </div>
            {detailFile.chain_tx_signature && (
              <div>
                <p className="text-muted-foreground">Transaction</p>
                <div className="flex items-center gap-2">
                  <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{shortSig(detailFile.chain_tx_signature)}</code>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => void navigator.clipboard.writeText(detailFile.chain_tx_signature!)}
                    aria-label="Copy transaction signature"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            )}
            {detailFile.chain_program_address && (
              <div>
                <p className="text-muted-foreground">File Record PDA</p>
                <div className="flex items-center gap-2">
                  <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{shortSig(detailFile.chain_program_address)}</code>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => void navigator.clipboard.writeText(detailFile.chain_program_address!)}
                    aria-label="Copy PDA address"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            )}
            <div>
              <p className="text-muted-foreground">Content hash (SHA-256)</p>
              <div className="flex items-center gap-2">
                <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{shortSig(detailFile.content_hash ?? "")}</code>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => void navigator.clipboard.writeText(detailFile.content_hash ?? "")}
                  aria-label="Copy content hash"
                >
                  <Copy size={14} />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleVerifyIntegrity(detailFile)}
                disabled={busyFileId === detailFile.id || detailFile.chain_status !== "anchored"}
              >
                <ShieldCheck size={14} className="mr-2" /> Verify integrity
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => viewOnExplorer(detailFile)}
                disabled={!detailFile.chain_network}
              >
                <ExternalLink size={14} className="mr-2" /> View on explorer
              </Button>
            </div>
          </div>
        )}
      </DialogTemplate>

      {/* Preview Dialog */}
      <DialogTemplate
        open={previewFile !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewFile(null);
            setPreviewUrl(null);
            setPreviewText(null);
          }
        }}
        title={
          <span className="block truncate pr-8">
            {previewFile ? getFileName(previewFile.storage_path) : "File preview"}
          </span>
        }
        size="full"
        className="sm:max-w-4xl p-0"
        contentClassName="p-0 px-6 pb-6"
        footer={
          <>
            {previewFile && (
              <Button variant="outline" onClick={() => void handleFileDownload(previewFile)}>
                <Download size={14} className="mr-2" /> Download
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                setPreviewFile(null);
                setPreviewUrl(null);
                setPreviewText(null);
              }}
            >
              Close
            </Button>
          </>
        }
      >
        {!previewFile || previewLoading || !previewUrl ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading preview…
          </div>
        ) : isTextPreviewFile(previewFile) ? (
          previewTextLoading ? (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading text…
            </div>
          ) : (
            <pre className="max-h-[70vh] overflow-auto rounded-lg bg-muted p-4 text-xs font-mono whitespace-pre-wrap">
              {previewText ?? "No content."}
            </pre>
          )
        ) : isImagePreviewFile(previewFile) ? (
          <img
            src={previewUrl}
            alt={getFileName(previewFile.storage_path)}
            className="max-h-[70vh] w-full object-contain rounded-lg border"
          />
        ) : (
          <iframe
            src={previewUrl}
            title={getFileName(previewFile.storage_path)}
            className="w-full h-[70vh] rounded-lg border"
          />
        )}
      </DialogTemplate>

      {/* Share Link Dialog */}
      <DialogTemplate
        open={shareFile !== null}
        onOpenChange={(open) => {
          if (!open) {
            setShareFile(null);
            setShareUrl(null);
          }
        }}
        title="Share file"
        size="md"
        footer={
          <Button
            variant="outline"
            onClick={() => {
              setShareFile(null);
              setShareUrl(null);
            }}
          >
            Close
          </Button>
        }
      >
        {shareFile && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Create a secure, time-limited link for{" "}
              <span className="font-medium text-foreground">
                {getFileName(shareFile.storage_path)}
              </span>
              .
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">Link expires in</label>
              <Select
                value={String(shareExpiryHours)}
                onValueChange={(value) => {
                  setShareExpiryHours(Number(value));
                  setShareUrl(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 hour</SelectItem>
                  <SelectItem value="24">24 hours</SelectItem>
                  <SelectItem value="168">7 days</SelectItem>
                  <SelectItem value="720">30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {shareUrl ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Shareable link</label>
                <div className="flex gap-2">
                  <Input value={shareUrl} readOnly className="font-mono text-xs" />
                  <Button
                    variant="outline"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(shareUrl)
                        .then(() => showNotice("Share link copied."))
                    }
                  >
                    <Copy size={14} />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This link will expire in approximately{" "}
                  {shareExpiryHours >= 24
                    ? `${Math.round(shareExpiryHours / 24)} day(s)`
                    : `${shareExpiryHours} hour(s)`}
                  .
                </p>
              </div>
            ) : (
              <Button onClick={() => void generateShareLink()} disabled={shareLoading}>
                {shareLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Share2 size={16} className="mr-2" />
                )}
                Generate link
              </Button>
            )}
          </div>
        )}
      </DialogTemplate>

      {/* Rename Dialog */}
      <DialogTemplate
        open={renameFile !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRenameFile(null);
            setRenameValue("");
          }
        }}
        title="Rename file"
        size="sm"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setRenameFile(null);
                setRenameValue("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleRename()}
              disabled={
                renameLoading ||
                !renameValue.trim() ||
                renameValue.trim() === getFileName(renameFile?.storage_path ?? "")
              }
            >
              {renameLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pencil size={16} className="mr-2" />}
              Rename
            </Button>
          </>
        }
      >
        {renameFile && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter a new name for{" "}
              <span className="font-medium text-foreground">
                {getFileName(renameFile.storage_path)}
              </span>
              .
            </p>
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleRename();
                if (e.key === "Escape") {
                  setRenameFile(null);
                  setRenameValue("");
                }
              }}
              placeholder="New file name"
              autoFocus
            />
          </div>
        )}
      </DialogTemplate>

      {/* Version History Dialog */}
      <DialogTemplate
        open={versionHistoryFile !== null}
        onOpenChange={(open) => {
          if (!open) {
            setVersionHistoryFile(null);
            setAttachmentVersions([]);
          }
        }}
        title="Version history"
        size="lg"
        footer={
          <Button
            variant="outline"
            onClick={() => {
              setVersionHistoryFile(null);
              setAttachmentVersions([]);
            }}
          >
            Close
          </Button>
        }
      >
        {versionHistoryFile && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Current file:{" "}
              <span className="font-medium text-foreground">
                {getFileName(versionHistoryFile.storage_path)}
              </span>
            </p>
            {versionsLoading ? (
              <div className="flex h-32 items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading versions…
              </div>
            ) : attachmentVersions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No previous versions. Upload a new version to create one.
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-auto space-y-2">
                {attachmentVersions.map((version, idx) => (
                  <div
                    key={version.id}
                    className="flex items-center justify-between rounded-lg border p-3 gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Version {attachmentVersions.length - idx}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateLabel(version.created_at)} · {formatSize(version.size_bytes)} ·{" "}
                        {shortSig(version.content_hash ?? "")}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (versionHistoryFile) {
                          void handleDownloadVersion(versionHistoryFile, version);
                        }
                      }}
                    >
                      <Download size={14} className="mr-2" /> Download
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogTemplate>

      {/* Tag Dialog */}
      <DialogTemplate
        open={tagMenuFileId !== null}
        onOpenChange={(open) => { if (!open) { setTagMenuFileId(null); setShowNewTagInput(false); setNewTagName(""); } }}
        title="Tags"
        size="sm"
      >
        <div className="space-y-2">
          {tags.length === 0 && <p className="text-sm text-muted-foreground">No tags yet.</p>}
          {tags.map((tag) => {
            const fileId = tagMenuFileId!;
            const isAttached = fileTagMap[fileId]?.some((t) => t.id === tag.id) ?? false;
            return (
              <div key={tag.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="h-2 w-2 rounded-full" style={{ background: tag.color ?? "currentColor" }} />
                  {tag.name}
                </div>
                <Switch checked={isAttached} onCheckedChange={() => void handleToggleTag(fileId, tag.id)} />
              </div>
            );
          })}
          <div className="pt-2">
            {showNewTagInput ? (
              <div className="space-y-2">
                <Input
                  placeholder="New tag"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleCreateTag(); if (e.key === "Escape") { setShowNewTagInput(false); setNewTagName(""); } }}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void handleCreateTag()}>Add</Button>
                  <Button size="sm" variant="outline" onClick={() => { setShowNewTagInput(false); setNewTagName(""); }}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="w-full gap-1" onClick={() => setShowNewTagInput(true)}>
                <Upload size={14} /> Create new tag
              </Button>
            )}
          </div>
        </div>
      </DialogTemplate>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={deleteState.open}
        onOpenChange={deleteState.setOpen}
        title="Delete file"
        description="This action cannot be undone."
        confirmText="Delete"
        destructive
        onConfirm={() => {
          deleteState.setOpen(false);
          const file = deleteFileRef.current;
          if (file) void handleSingleDelete(file);
        }}
      />
    </DashboardShell>
  );
}
