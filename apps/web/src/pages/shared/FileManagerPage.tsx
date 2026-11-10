import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Upload,
  Search,
  X,
  Folder,
  MoreVertical,
  Download,
  Link2,
  ShieldCheck,
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
  Anchor,
  HardDrive,
  Info,
  FolderPlus,
  FolderUp,
} from "lucide-react";

import {
  listAttachments,
  softDeleteAttachment,
  restoreAttachment,
  permanentDeleteAttachment,
  uploadWorkspaceAttachment,
  getAttachmentAccessUrl,
  getAttachmentVersionAccessUrl,
  verifyAttachmentIntegrity,
  moveAttachmentsToFolder,
  renameAttachment,
  createAttachmentVersion,
  listAttachmentVersions,
  listFolders,
  createFolder,
  listTags,
  createTag,
  getAttachmentTags,
  setAttachmentTags,
  listActivityLog,
  getWorkspaceStorageUsage,
  type FolderRow,
  type TagRow,
  type ActivityLogEntry,
  type AttachmentVersionRow,
  type StorageUsage,
} from "../../lib/repositories/attachments.ts";
import {
  getLatestAnchorStates,
  listAnchorOperations,
  type AnchorMode,
  type AnchorOperationRow,
} from "../../lib/repositories/fileAnchors.ts";
import { useSiteSurveyorWallet } from "../../features/phantom/hooks/useSiteSurveyorWallet.ts";
import {
  anchorAttachment,
  buildAnchorMemo,
  estimateAnchorFeeLamports,
  type AnchorSigner,
} from "../../features/phantom/anchor/fileAnchor.ts";
import {
  downloadAttachmentBlob,
  runFullFileAnchor,
  verifyFullFileAnchor,
  type FullFileAnchorProgress,
} from "../../features/phantom/anchor/fullFileAnchorRunner.ts";
import { DEFAULT_FULL_FILE_CHUNK_SIZE } from "../../features/phantom/anchor/fullFileAnchor.ts";
import {
  SOLANA_CLUSTER,
  SOLANA_CLUSTER_LABEL,
  explorerTxUrl,
  type SolanaCluster,
} from "../../features/phantom/lib/config.ts";
import PageLoader from "@/components/PageLoader.tsx";
import ErrorNotice from "@/components/errors/ErrorNotice.tsx";
import { DashboardHeader, DashboardShell } from "@/components/dashboard/DashboardShell.tsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import type { AttachmentRow } from "../../lib/repositories/attachments.ts";


interface FileManagerPageProps {
  workspaceId: string;
}

type SortOption = "date-desc" | "date-asc" | "name-asc" | "size-desc" | "size-asc";
type ViewMode = "files" | "trash";

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

const shortSig = (sig: string): string =>
  sig.length > 12 ? `${sig.slice(0, 6)}…${sig.slice(-4)}` : sig;

/** Cluster recorded on the row, falling back to the one this build targets. */
const asCluster = (network: string | null): SolanaCluster =>
  network === "mainnet-beta" || network === "testnet" ? network : SOLANA_CLUSTER;

const formatLamports = (lamports: number): string =>
  `${lamports.toLocaleString()} lamports`;

const chunkPlanFor = (sizeBytes: number | null): number =>
  Math.max(1, Math.ceil((sizeBytes ?? 0) / DEFAULT_FULL_FILE_CHUNK_SIZE));

/** Short passphrases are brute-forceable from the wrapped key, so they are refused. */
const ANCHOR_PASSPHRASE_MIN_LENGTH = 8;

const ANCHOR_STATUS_LABELS: Record<string, string> = {
  preparing: "Preparing",
  uploading: "Storing chunks",
  ready: "Ready to sign",
  submitting: "Waiting for wallet",
  submitted: "Submitted to Solana",
  confirming: "Confirming on Solana",
  anchored: "Anchored",
  failed: "Failed",
  cancelled: "Cancelled in wallet",
};

const anchorStatusLabel = (status: string): string =>
  ANCHOR_STATUS_LABELS[status] ?? status;

const formatAnchorError = (err: unknown): string => {
  const message = err instanceof Error ? err.message : String(err);
  if (/network mismatch|wrong network/i.test(message)) {
    return `Your wallet is on the wrong Solana network. Open your wallet, switch to ${SOLANA_CLUSTER_LABEL[SOLANA_CLUSTER]}, reconnect it, and try signing again.`;
  }
  return message || "Failed to anchor file on Solana.";
};

/**
 * A file can clear the client-side quota check and still be refused by the
 * storage trigger, so that precise reason must reach the user instead of a
 * generic "retry those files".
 */
const formatUploadFailures = (failures: unknown[]): string => {
  const messages = failures.map((err) => (err instanceof Error ? err.message : String(err)));
  if (messages.some((message) => /STORAGE_QUOTA_EXCEEDED/i.test(message))) {
    return "Storage quota reached: new uploads are paused while existing files stay available. Buy more storage or free up space, then upload the rest.";
  }
  const detail = messages.find((message) => message && message !== "undefined") ?? "";
  const count = failures.length;
  return `${count} upload${count === 1 ? "" : "s"} failed${detail ? `: ${detail}` : ". Please retry those files."}`;
};

export default function FileManagerPage({ workspaceId }: FileManagerPageProps) {
  const [files, setFiles] = useState<AttachmentRow[]>([]);
  const [anchorStates, setAnchorStates] = useState<Map<string, AnchorOperationRow>>(
    () => new Map(),
  );
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
  const [viewMode, setViewMode] = useState<ViewMode>("files");
  const [moveMenuFileId, setMoveMenuFileId] = useState<string | null>(null);
  const [tagMenuFileId, setTagMenuFileId] = useState<string | null>(null);
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
  const [activeFolderId, setActiveFolderId] = useState<string>("__all__");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParentId, setNewFolderParentId] = useState<string>("__root__");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const noticeTimeoutRef = useRef<number | undefined>(undefined);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const versionUploadInputRef = useRef<HTMLInputElement | null>(null);
  const versionTargetRef = useRef<AttachmentRow | null>(null);
  const deleteFileRef = useRef<AttachmentRow | null>(null);
  const deleteState = useDialogState();

  const wallet = useSiteSurveyorWallet();
  const {
    publicKey: walletPublicKey,
    sendTransaction: walletSendTransaction,
  } = wallet;
  const [anchorFile, setAnchorFile] = useState<AttachmentRow | null>(null);
  const [anchorFee, setAnchorFee] = useState<string | null>(null);
  const [anchoring, setAnchoring] = useState(false);
  const [anchorMode, setAnchorMode] = useState<AnchorMode>("hash");
  const [anchorProgress, setAnchorProgress] = useState<FullFileAnchorProgress | null>(null);
  const [anchorPassphrase, setAnchorPassphrase] = useState("");
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);
  const [detailsFile, setDetailsFile] = useState<AttachmentRow | null>(null);
  const [anchorRecords, setAnchorRecords] = useState<AnchorOperationRow[]>([]);
  const [anchorRecordsLoading, setAnchorRecordsLoading] = useState(false);
  const [verifyingOperationId, setVerifyingOperationId] = useState<string | null>(null);
  const [verificationNote, setVerificationNote] = useState<string | null>(null);
  const [verifyPassphrase, setVerifyPassphrase] = useState("");
  const [recoveryFile, setRecoveryFile] = useState<{ url: string; fileName: string } | null>(null);

  const anchorSigner = useMemo<AnchorSigner | null>(() => {
    if (!walletPublicKey || !walletSendTransaction) return null;
    return {
      publicKey: walletPublicKey,
      sendTransaction: (tx, connection) => walletSendTransaction(tx, connection),
    };
  }, [walletPublicKey, walletSendTransaction]);

  const fetchFiles = useCallback(async () => {
    try {
      setError(null);
      const [fileData, folderData, tagData, logData, usage] = await Promise.all([
        listAttachments(workspaceId, {
          includeDeleted: viewMode === "trash",
        }),
        listFolders(workspaceId),
        listTags(workspaceId),
        listActivityLog(workspaceId, { limit: 50 }),
        getWorkspaceStorageUsage(workspaceId).catch(() => null),
      ]);
      setFiles(fileData);
      setFolders(folderData);
      setTags(tagData);
      setActivityLog(logData);
      setStorageUsage(usage);
      setAnchorStates(
        await getLatestAnchorStates(
          workspaceId,
          fileData.map((file) => file.id),
        ).catch(() => new Map<string, AnchorOperationRow>()),
      );

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

  const fileTypes = Array.from(
    new Set(files.map((f) => getFileType(f.storage_path, f.mime_type))),
  );
  const hasActiveFilters =
    search.trim() !== "" ||
    activeType !== "ALL" ||
    activeTagId !== "all" ||
    activeFolderId !== "__all__";

  let filtered = files;
  if (viewMode === "trash") {
    filtered = filtered.filter((f) => f.deleted_at != null);
  } else {
    filtered = filtered.filter((f) => f.deleted_at == null);
  }
  if (activeFolderId !== "__all__") {
    filtered = filtered.filter((f) => f.folder_id === activeFolderId);
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

  // The same quota the database trigger enforces, read straight from it.
  const uploadBlocked = storageUsage ? !storageUsage.upload_allowed : false;

  const fullFileAnchoredIds = useMemo(
    () =>
      new Set(
        [...anchorStates.values()]
          .filter((record) => record.mode === "full_file" && record.status === "anchored")
          .map((record) => record.attachment_id),
      ),
    [anchorStates],
  );

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
    setActiveFolderId("__all__");
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

  const openFolderPicker = () => {
    folderInputRef.current?.click();
  };

  // Uploads land in the folder currently open, or at the workspace root.
  const currentFolderId = activeFolderId === "__all__" ? null : activeFolderId;

  const markUpload = (index: number, status: "done" | "error") => {
    setUploadQueue((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], status };
      return next;
    });
  };

  const finishUpload = async (successCount: number, failures: unknown[]) => {
    if (failures.length > 0) {
      setError(formatUploadFailures(failures));
    }
    if (successCount > 0) {
      showNotice(`${successCount} file${successCount === 1 ? "" : "s"} uploaded.`);
      await fetchFiles();
    }
    setUploading(false);
    setUploadQueue([]);
    if (uploadInputRef.current) uploadInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const uploadFiles = Array.from(fileList);

    setUploading(true);
    setError(null);
    setUploadQueue(uploadFiles.map((f) => ({ name: f.name, status: "pending" })));

    const results = await Promise.allSettled(
      uploadFiles.map(async (file, index) => {
        try {
          const result = await uploadWorkspaceAttachment(workspaceId, file, {
            folderId: currentFolderId,
          });
          markUpload(index, "done");
          return result;
        } catch (err) {
          markUpload(index, "error");
          throw err;
        }
      }),
    );

    const successCount = results.filter((r) => r.status === "fulfilled").length;
    const failures = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => r.reason);
    await finishUpload(successCount, failures);
  };

  /**
   * Recreate the picked directory tree as workspace folders, then upload every
   * file into the folder it came from. One entry per folder level, so a 3-deep
   * tree costs 3 inserts rather than one per file.
   */
  const handleUploadFolder = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const entries = Array.from(fileList).map((file) => ({
      file,
      segments: file.webkitRelativePath
        ? file.webkitRelativePath.split("/").slice(0, -1)
        : [],
    }));

    setUploading(true);
    setError(null);
    setUploadQueue(entries.map(({ file }) => ({ name: file.name, status: "pending" })));

    const createdFolders = new Map<string, string>();
    const ensureFolder = async (segments: string[]): Promise<string | null> => {
      if (segments.length === 0) return currentFolderId;
      const path = segments.join("/");
      const known = createdFolders.get(path);
      if (known) return known;
      const parentId = await ensureFolder(segments.slice(0, -1));
      const folder = await createFolder(workspaceId, segments[segments.length - 1], parentId);
      createdFolders.set(path, folder.id);
      return folder.id;
    };

    let successCount = 0;
    const failures: unknown[] = [];
    // Sequential: a parent folder has to exist before its children are created.
    for (const [index, entry] of entries.entries()) {
      try {
        const folderId = await ensureFolder(entry.segments);
        await uploadWorkspaceAttachment(workspaceId, entry.file, { folderId });
        markUpload(index, "done");
        successCount += 1;
      } catch (err) {
        markUpload(index, "error");
        failures.push(err);
      }
    }

    await finishUpload(successCount, failures);
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    setCreatingFolder(true);
    setError(null);
    try {
      await createFolder(
        workspaceId,
        name,
        newFolderParentId === "__root__" ? null : newFolderParentId,
      );
      setNewFolderName("");
      setNewFolderOpen(false);
      await fetchFiles();
      showNotice(`Folder "${name}" created.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create folder.");
    } finally {
      setCreatingFolder(false);
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

  const openAnchorDialog = (file: AttachmentRow, mode: AnchorMode = "hash") => {
    setAnchorFile(file);
    setAnchorMode(mode);
    setAnchorProgress(null);
    setAnchorPassphrase("");
    setAnchorFee(anchorSigner && file.content_hash ? "…" : null);
  };

  const closeAnchorDialog = () => {
    setAnchorFile(null);
    setAnchorFee(null);
    setAnchorProgress(null);
    // Never leave an encryption passphrase sitting in component state.
    setAnchorPassphrase("");
  };

  // openAnchorDialog seeds the "…" placeholder; this resolves the RPC estimate.
  useEffect(() => {
    const hash = anchorFile?.content_hash;
    if (!hash || !walletPublicKey) return;
    const fileId = anchorFile.id;
    let cancelled = false;
    void estimateAnchorFeeLamports(buildAnchorMemo(fileId, hash), walletPublicKey)
      .then((lamports) => {
        if (!cancelled) setAnchorFee(formatLamports(lamports));
      })
      .catch(() => {
        if (!cancelled) setAnchorFee(null);
      });
    return () => {
      cancelled = true;
    };
  }, [anchorFile, walletPublicKey]);

  const handleAnchorFile = async () => {
    if (!anchorFile || !anchorSigner) return;
    const file = anchorFile;
    if (anchorMode === "full_file" && anchorPassphrase.length < ANCHOR_PASSPHRASE_MIN_LENGTH) {
      setError(
        `Full-file anchoring encrypts the stored chunks, so choose a passphrase of at least ${ANCHOR_PASSPHRASE_MIN_LENGTH} characters.`,
      );
      return;
    }
    setAnchoring(true);
    setBusyFileId(file.id);
    setError(null);
    try {
      const outcome =
        anchorMode === "hash"
          ? await anchorAttachment(file, anchorSigner)
          : await runFullFileAnchor({
              attachment: file,
              source: await downloadAttachmentBlob(file),
              signer: anchorSigner,
              anchoringPassphrase: anchorPassphrase,
              onProgress: setAnchorProgress,
            });
      closeAnchorDialog();
      await fetchFiles();
      showNotice(
        `${anchorMode === "hash" ? "Hash" : "Full file"} anchored on ${
          SOLANA_CLUSTER_LABEL[SOLANA_CLUSTER]
        }: ${shortSig(outcome.signature)}`,
      );
    } catch (err) {
      // The anchor record shows how far the attempt got, so always reload it.
      await fetchFiles();
      setError(formatAnchorError(err));
    } finally {
      setAnchoring(false);
      setBusyFileId(null);
    }
  };

  const loadAnchorRecords = async (file: AttachmentRow) => {
    setAnchorRecordsLoading(true);
    try {
      setAnchorRecords(await listAnchorOperations(workspaceId, { attachmentId: file.id }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load anchor records.");
    } finally {
      setAnchorRecordsLoading(false);
    }
  };

  const openFileDetails = async (file: AttachmentRow) => {
    setDetailsFile(file);
    setAnchorRecords([]);
    setVerificationNote(null);
    setVerifyPassphrase("");
    await loadAnchorRecords(file);
  };

  const handleVerifyAnchorRecord = async (record: AnchorOperationRow) => {
    setVerifyingOperationId(record.id);
    setVerificationNote(null);
    try {
      if (record.mode === "full_file") {
        if (record.encryption && !verifyPassphrase) {
          setVerificationNote(
            "These chunks are stored encrypted. Enter the anchoring passphrase to rebuild them.",
          );
          return;
        }
        const { verified, blob } = await verifyFullFileAnchor(record, verifyPassphrase);
        if (verified.ok && blob) {
          setRecoveryFile({ url: URL.createObjectURL(blob), fileName: record.file_name });
        }
        setVerificationNote(
          verified.ok
            ? verified.encrypted
              ? "Rebuilt from its encrypted chunks — the original digest matches the chain commit. Download it below to check the file itself."
              : "Rebuilt from its stored chunks — the original digest matches the chain commit. Download it below to check the file itself."
            : `Reassembly did not match the anchored digest: ${verified.errors.join(" ")}`,
        );
      } else {
        const file = files.find((candidate) => candidate.id === record.attachment_id);
        if (!file) throw new Error("The anchored file is no longer in this workspace.");
        const { ok } = await verifyAttachmentIntegrity(file);
        setVerificationNote(
          ok
            ? "Stored file re-hashes to the digest written on chain."
            : "Mismatch: the stored file no longer matches the anchored digest.",
        );
      }
      if (detailsFile) await loadAnchorRecords(detailsFile);
    } catch (err) {
      setVerificationNote(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setVerifyingOperationId(null);
    }
  };

  const handleRecoveryDownload = () => {
    if (!recoveryFile) return;
    const anchor = document.createElement("a");
    anchor.href = recoveryFile.url;
    anchor.download = recoveryFile.fileName;
    anchor.click();
  };

  useEffect(() => {
    if (!recoveryFile) return;
    return () => URL.revokeObjectURL(recoveryFile.url);
  }, [recoveryFile]);

  const handleConnectForAnchor = async () => {
    try {
      await wallet.connect();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect your wallet.");
    }
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

  if (loading) {
    return (
      <div className="w-full max-w-full p-6">
        <PageLoader />
      </div>
    );
  }

  return (
    <DashboardShell className="w-full max-w-full">
      <DashboardHeader
        badge={<Badge variant="secondary">Secure storage</Badge>}
        title="File Manager"
        subtitle="Secure storage for plans and survey data."
        meta={`${files.filter((f) => f.deleted_at == null).length} ${
          files.filter((f) => f.deleted_at == null).length === 1 ? "file" : "files"
        }${storageUsage ? ` · ${storageUsage.used_mb.toFixed(0)} of ${storageUsage.limit_mb.toFixed(0)} MB` : ""}`}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setNewFolderParentId(currentFolderId ?? "__root__");
                setNewFolderOpen(true);
              }}
              disabled={viewMode === "trash"}
              className="gap-2 w-full sm:w-auto"
            >
              <FolderPlus size={16} />
              New folder
            </Button>
            <Button
              variant="outline"
              onClick={openFolderPicker}
              disabled={uploading || viewMode === "trash" || uploadBlocked}
              className="gap-2 w-full sm:w-auto"
            >
              <FolderUp size={16} />
              Upload folder
            </Button>
            <Button
              onClick={openFilePicker}
              disabled={uploading || viewMode === "trash" || uploadBlocked}
              className="gap-2 w-full sm:w-auto"
            >
              <Upload size={16} />
              {uploading
                ? "Uploading..."
                : viewMode === "trash"
                  ? "Upload disabled in trash"
                  : uploadBlocked
                    ? "Quota reached"
                    : "Upload Files"}
            </Button>
          </>
        }
      />

      {storageUsage?.expiring_storage_mb ? (
        <div className="rounded-none border border-border/70 bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          {storageUsage.expiring_storage_mb.toFixed(0)} MB of purchased storage ends{" "}
          {storageUsage.next_storage_expiration
            ? formatDateLabel(storageUsage.next_storage_expiration)
            : "soon"}
          . Files already stored are never deleted when a package expires.
        </div>
      ) : null}

      {error ? (
        <ErrorNotice tone="danger">
          {error}
        </ErrorNotice>
      ) : null}

      {uploadBlocked && (
        <div className="flex items-start gap-3 rounded-none border border-destructive/20 bg-destructive/10 p-4">
          <HardDrive size={16} className="mt-0.5 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="text-sm font-medium">Storage quota reached</p>
            <p className="mt-1 text-sm text-muted-foreground">
              New uploads are paused. Existing files stay available for preview, download and
              sharing until the workspace buys more storage.
            </p>
          </div>
        </div>
      )}

      {notice && (
        <div className="rounded-none border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          {notice}
        </div>
      )}

      <input
        ref={uploadInputRef}
        type="file"
        className="hidden"
        multiple
        aria-label="Select files to upload"
        onChange={(e) => void handleUploadFiles(e.target.files)}
      />
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        multiple
        aria-label="Select a folder to upload"
        // Non-standard but supported in Chrome, Edge, Firefox and Safari: lets the
        // picker return a whole directory with each file's relative path.
        {...{ webkitdirectory: "", directory: "" }}
        onChange={(e) => void handleUploadFolder(e.target.files)}
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
        <div className="rounded-none border bg-muted/50 p-2 flex items-center gap-2 text-xs">
          <span className="shrink-0">Uploading {completedUploads} of {uploadQueue.length} files…</span>
          <div className="h-1.5 flex-1 rounded-none bg-muted overflow-hidden">
            <div className="h-full rounded-none bg-primary transition-all" style={{ width: `${uploadProgressPct}%` }} />
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
                variant={viewMode === "files" ? "default" : "outline"}
                size="sm"
                onClick={() => { setViewMode("files"); setSelectedFiles(new Set()); }}
              >
                Files
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
              <Select value={activeFolderId} onValueChange={setActiveFolderId}>
                <SelectTrigger className="w-full sm:w-44 h-9" aria-label="Filter by folder">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All folders</SelectItem>
                  {folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={activeType} onValueChange={setActiveType}>
                <SelectTrigger className="w-full sm:w-36 h-9" aria-label="Filter by file type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All types</SelectItem>
                  {fileTypes.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={activeTagId} onValueChange={(value) => setActiveTagId(value)}>
                <SelectTrigger className="w-full sm:w-36 h-9" aria-label="Filter by tag">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tags</SelectItem>
                  {tags.map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasActiveFilters && (
                <Button size="sm" variant="ghost" onClick={clearFilters}>Clear</Button>
              )}
              {currentFolderId && viewMode !== "trash" ? (
                <span className="text-xs text-muted-foreground">
                  New uploads go to {folders.find((folder) => folder.id === currentFolderId)?.name}
                </span>
              ) : null}
              <span className="text-xs text-muted-foreground ml-auto">{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>
            </div>

          {visibleSelectedCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-none border bg-muted/50 p-3 text-sm">
              <span>{visibleSelectedCount} selected</span>
              <div className="flex flex-wrap items-center gap-2">
                {viewMode !== "trash" ? (
                  <>
                    <Button size="sm" variant="outline" onClick={handleBulkCopyLinks}>Copy Links</Button>
                    <Button size="sm" variant="outline" onClick={() => setMoveMenuFileId("__bulk__")}><FolderInput /> Move</Button>
                    <Button size="sm" variant="destructive" onClick={handleBulkDelete}><Trash2 /> Trash</Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="outline" onClick={handleBulkRestore}><RotateCcw /> Restore</Button>
                    <Button size="sm" variant="destructive" onClick={handleBulkDelete}><Trash2 /> Delete forever</Button>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="border rounded-none overflow-hidden">
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
                          {file.folder_id && activeFolderId === "__all__" && (
                            <button
                              type="button"
                              onClick={() => setActiveFolderId(file.folder_id!)}
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                            >
                              <Folder size={11} />
                              {folders.find((folder) => folder.id === file.folder_id)?.name ?? "Folder"}
                            </button>
                          )}
                          {fileTags.length > 0 && (
                            <div className="text-xs text-muted-foreground">
                              <span>{fileTags.map((t) => t.name).join(", ")}</span>
                            </div>
                          )}
                          {file.chain_status !== "none" && (
                            <div className="text-xs">
                              {file.chain_status === "anchored" && file.chain_tx_signature ? (
                                <a
                                  href={explorerTxUrl(
                                    file.chain_tx_signature,
                                    asCluster(file.chain_network),
                                  )}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                                >
                                  <Anchor className="size-3" />
                                  Anchored on {SOLANA_CLUSTER_LABEL[asCluster(file.chain_network)]} ·{" "}
                                  {shortSig(file.chain_tx_signature)}
                                </a>
                              ) : file.chain_status === "pending" ? (
                                <span className="inline-flex items-center gap-1 text-muted-foreground">
                                  <Loader2 className="size-3 animate-spin" />
                                  Anchoring on {SOLANA_CLUSTER_LABEL[asCluster(file.chain_network)]}…
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-destructive">
                                  <Anchor className="size-3" />
                                  Anchor failed
                                </span>
                              )}
                            </div>
                          )}
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
                                  <Download /> Open / Download
                                </DropdownMenuItem>
                                {canPreviewFile(file) && (
                                  <DropdownMenuItem onClick={() => void openPreview(file)}>
                                    <Eye /> Preview
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => void handleCopyFileLink(file)}>
                                  <Link2 /> Copy Link
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openShare(file)}>
                                  <Share2 /> Share link
                                </DropdownMenuItem>
                                {file.content_hash && (
                                  <DropdownMenuItem onClick={() => void handleVerifyIntegrity(file)} disabled={busyFileId === file.id}>
                                    <ShieldCheck /> Verify integrity
                                  </DropdownMenuItem>
                                )}
                                {file.content_hash && (
                                  <DropdownMenuItem onClick={() => void openFileDetails(file)}>
                                    <Info /> File details
                                  </DropdownMenuItem>
                                )}
                                {file.content_hash && file.chain_status !== "anchored" && (
                                  <DropdownMenuItem
                                    onClick={() => openAnchorDialog(file, "hash")}
                                    disabled={busyFileId === file.id || file.chain_status === "pending"}
                                  >
                                    <Anchor /> Anchor hash on Solana
                                  </DropdownMenuItem>
                                )}
                                {file.content_hash && !fullFileAnchoredIds.has(file.id) && (
                                  <DropdownMenuItem
                                    onClick={() => openAnchorDialog(file, "full_file")}
                                    disabled={busyFileId === file.id || file.chain_status === "pending"}
                                  >
                                    <Anchor /> Anchor full file on Solana
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => openRename(file)}>
                                  <Pencil /> Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setMoveMenuFileId(file.id)}>
                                  <FolderInput /> Move to folder
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setTagMenuFileId(file.id)}>
                                  <Tags /> Tags
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    versionTargetRef.current = file;
                                    versionUploadInputRef.current?.click();
                                  }}
                                  disabled={busyFileId === file.id}
                                >
                                  <Upload /> Upload new version
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => void openVersionHistory(file)}>
                                  <History /> Version history
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    deleteFileRef.current = file;
                                    deleteState.setOpen(true);
                                  }}
                                  variant="destructive"
                                >
                                  <Trash2 /> Move to trash
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <>
                                <DropdownMenuItem onClick={() => void handleRestore(file)}>
                                  <RotateCcw /> Restore
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    deleteFileRef.current = file;
                                    deleteState.setOpen(true);
                                  }}
                                  variant="destructive"
                                >
                                  <Trash2 /> Delete forever
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
                            : "Adjust your filters or upload a new file."}
                        </p>
                        <div className="mt-3">
                          {files.length === 0 ? (
                            <Button size="sm" onClick={openFilePicker}>
                              Upload your first file
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

      {/* New Folder Dialog */}
      <DialogTemplate
        open={newFolderOpen}
        onOpenChange={(open) => {
          if (!open) {
            setNewFolderOpen(false);
            setNewFolderName("");
          }
        }}
        title="New folder"
        size="sm"
        footer={
          <>
            <Button
              variant="outline"
              disabled={creatingFolder}
              onClick={() => {
                setNewFolderOpen(false);
                setNewFolderName("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleCreateFolder()}
              disabled={creatingFolder || newFolderName.trim() === ""}
            >
              {creatingFolder ? <Loader2 className="animate-spin" /> : <FolderPlus />}
              Create folder
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            autoFocus
            placeholder="e.g. Site photos"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreateFolder();
            }}
          />
          <Select value={newFolderParentId} onValueChange={setNewFolderParentId}>
            <SelectTrigger aria-label="Parent folder"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__root__">Workspace root</SelectItem>
              {folders.map((folder) => (
                <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Folders organise files inside this workspace. Uploading a folder from your device
            recreates its structure here.
          </p>
        </div>
      </DialogTemplate>

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
                <Download /> Download
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
            <pre className="max-h-[70vh] overflow-auto rounded-none bg-muted p-4 text-xs font-mono whitespace-pre-wrap">
              {previewText ?? "No content."}
            </pre>
          )
        ) : isImagePreviewFile(previewFile) ? (
          <img
            src={previewUrl}
            alt={getFileName(previewFile.storage_path)}
            className="max-h-[70vh] w-full object-contain rounded-none border"
          />
        ) : (
          <iframe
            src={previewUrl}
            title={getFileName(previewFile.storage_path)}
            className="w-full h-[70vh] rounded-none border"
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

      {/* Anchor on Solana Dialog */}
      <DialogTemplate
        open={anchorFile !== null}
        onOpenChange={(open) => {
          if (!open && !anchoring) closeAnchorDialog();
        }}
        kicker="Proof of existence"
        title={
          anchorMode === "full_file" ? "Anchor full file on Solana" : "Anchor file hash on Solana"
        }
        size="sm"
        footer={
          <>
            <Button variant="outline" disabled={anchoring} onClick={closeAnchorDialog}>
              Cancel
            </Button>
            {anchorSigner ? (
              <Button
                onClick={() => void handleAnchorFile()}
                disabled={
                  anchoring ||
                  anchorFile?.chain_status === "pending" ||
                  (anchorMode === "full_file" &&
                    anchorPassphrase.length < ANCHOR_PASSPHRASE_MIN_LENGTH)
                }
              >
                {anchoring ? <Loader2 className="animate-spin" /> : <Anchor />}
                {anchoring ? "Anchoring…" : "Sign anchor transaction"}
              </Button>
            ) : (
              <Button onClick={() => void handleConnectForAnchor()} disabled={wallet.connecting}>
                {wallet.connecting ? <Loader2 className="animate-spin" /> : null}
                Connect Solana wallet
              </Button>
            )}
          </>
        }
      >
        {anchorFile && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={anchorMode === "hash" ? "default" : "outline"}
                disabled={anchoring}
                onClick={() => setAnchorMode("hash")}
              >
                Hash only
              </Button>
              <Button
                size="sm"
                variant={anchorMode === "full_file" ? "default" : "outline"}
                disabled={anchoring}
                onClick={() => setAnchorMode("full_file")}
              >
                Full file
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              {anchorMode === "hash"
                ? "Writes this file’s SHA-256 hash to a Solana transaction signed by your wallet. The file itself stays in workspace storage."
                : "Splits the file into chunks, encrypts each one, hashes the plaintext chunks, and writes the file digest plus the chunk-manifest digest on chain. The originals stay in workspace storage; the chunk copies are unreadable without your passphrase."}
            </p>

            <dl className="flex flex-col divide-y divide-border">
              <div className="flex items-baseline justify-between gap-4 py-2 first:pt-0">
                <dt className="text-xs text-muted-foreground">File</dt>
                <dd className="min-w-0 truncate text-xs font-medium text-foreground">
                  {getFileName(anchorFile.storage_path)}
                  {anchorFile.size_bytes !== null ? ` · ${formatSize(anchorFile.size_bytes)}` : ""}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-xs text-muted-foreground">Network</dt>
                <dd className="font-mono text-xs">
                  Solana {SOLANA_CLUSTER_LABEL[asCluster(anchorFile.chain_network)]}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-xs text-muted-foreground">Hash</dt>
                <dd className="font-mono text-xs">
                  sha256 · {shortSig(anchorFile.content_hash ?? "")}
                </dd>
              </div>
              {anchorMode === "full_file" && (
                <div className="flex items-baseline justify-between gap-4 py-2">
                  <dt className="text-xs text-muted-foreground">Chunk plan</dt>
                  <dd className="font-mono text-xs">
                    {chunkPlanFor(anchorFile.size_bytes)} chunks ×{" "}
                    {formatSize(DEFAULT_FULL_FILE_CHUNK_SIZE)}
                  </dd>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-xs text-muted-foreground">Network fee</dt>
                <dd className="font-mono text-xs font-semibold">{anchorFee ?? "—"}</dd>
              </div>
            </dl>

            {anchorMode === "full_file" && (
              <div className="space-y-2 border-t border-border pt-3">
                <Label htmlFor="anchor-passphrase" className="text-xs">
                  Chunk encryption passphrase
                </Label>
                <Input
                  id="anchor-passphrase"
                  type="password"
                  autoComplete="new-password"
                  value={anchorPassphrase}
                  onChange={(event) => setAnchorPassphrase(event.target.value)}
                  placeholder="At least 8 characters"
                />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Encrypts the chunk copies before they upload — they are stored as AES-256-GCM
                  ciphertext and only this passphrase can unlock them. It is not stored anywhere and
                  cannot be reset for you. If you lose it, the file itself is safe in your workspace
                  and the on-chain proof still stands; only rebuilding from chunks needs it.
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  One transaction either way: only the digests go on chain. The chunk copies count
                  toward workspace storage, so anchoring a large file needs free space.
                </p>
              </div>
            )}

            {anchoring && anchorProgress && (
              <div className="space-y-1 rounded-none border bg-muted/50 p-3 text-xs">
                <p className="font-medium">{anchorStatusLabel(anchorProgress.status)}</p>
                {anchorProgress.chunkCount > 0 && (
                  <div className="h-1.5 overflow-hidden rounded-none bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{
                        width: `${Math.round(
                          (anchorProgress.uploadedChunks / anchorProgress.chunkCount) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                )}
                {anchorProgress.chunkCount > 0 && (
                  <p className="text-muted-foreground">
                    {anchorProgress.uploadedChunks} of {anchorProgress.chunkCount} chunks stored
                  </p>
                )}
              </div>
            )}

            {anchorSigner ? (
              <p className="flex items-start gap-2 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                Signed by {wallet.wallet?.adapter.name ?? "your wallet"} ({wallet.shortAddress}) on{" "}
                {SOLANA_CLUSTER_LABEL[SOLANA_CLUSTER]}. The network fee is paid from that wallet,
                never from your SiteSurveyor credits or SiteSurveyor balance.
              </p>
            ) : (
              <p className="flex items-start gap-2 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                {wallet.address
                  ? `${wallet.wallet?.adapter.name ?? "This wallet"} has a saved address but isn't connected in this session. Connect it to sign the anchor.`
                  : "Connect a Solana wallet to sign the anchor transaction."}
              </p>
            )}
          </div>
        )}
      </DialogTemplate>

      {/* File details dialog */}
      <DialogTemplate
        open={detailsFile !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDetailsFile(null);
            setVerificationNote(null);
          }
        }}
        title="File details"
        size="md"
        contentClassName="p-0"
      >
        {detailsFile && (
          <div className="space-y-4 p-4">
            <dl className="flex flex-col divide-y divide-border text-sm">
              <div className="flex items-baseline justify-between gap-4 py-2 first:pt-0">
                <dt className="text-xs text-muted-foreground">Name</dt>
                <dd className="min-w-0 truncate font-medium">
                  {getFileName(detailsFile.storage_path)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-xs text-muted-foreground">Type</dt>
                <dd>{getFileType(detailsFile.storage_path, detailsFile.mime_type)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-xs text-muted-foreground">Size</dt>
                <dd className="font-mono text-xs">{formatSize(detailsFile.size_bytes)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-xs text-muted-foreground">Workspace storage</dt>
                <dd className="font-mono text-xs">
                  {storageUsage
                    ? `${storageUsage.used_mb.toFixed(1)} of ${storageUsage.limit_mb.toFixed(0)} MB (${storageUsage.percent}%)`
                    : "—"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-xs text-muted-foreground">Integrity hash</dt>
                <dd className="max-w-40 truncate font-mono text-xs" title={detailsFile.content_hash ?? undefined}>
                  {detailsFile.content_hash ? shortSig(detailsFile.content_hash) : "not hashed yet"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-xs text-muted-foreground">Folder</dt>
                <dd className="truncate text-xs">
                  {folders.find((folder) => folder.id === detailsFile.folder_id)?.name ?? "Workspace root"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-xs text-muted-foreground">Uploaded</dt>
                <dd className="text-xs">{formatDateLabel(detailsFile.created_at)}</dd>
              </div>
            </dl>

            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium">Blockchain anchors</h3>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => openAnchorDialog(detailsFile, "hash")}
                  disabled={detailsFile.chain_status === "pending"}
                >
                  <Anchor size={14} />
                  Anchor
                </Button>
              </div>

              {anchorRecordsLoading ? (
                <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" />
                  Loading anchor records…
                </div>
              ) : anchorRecords.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  This file has no anchor attempts yet.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {anchorRecords.map((record) => (
                    <li key={record.id} className="space-y-1 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {record.mode === "full_file" ? "Full file" : "Hash only"} ·{" "}
                            {anchorStatusLabel(record.status)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateLabel(record.created_at)} · Solana{" "}
                            {SOLANA_CLUSTER_LABEL[asCluster(record.network)]}
                            {record.wallet_address ? ` · ${shortSig(record.wallet_address)}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {record.chunk_count
                              ? `${record.uploaded_chunks}/${record.chunk_count} chunks · `
                              : ""}
                            {record.fee_lamports !== null
                              ? `${formatLamports(record.fee_lamports)} · `
                              : ""}
                            {record.tx_slot !== null ? `slot ${record.tx_slot}` : "no slot yet"}
                          </p>
                          {record.error_message && (
                            <p className="text-xs text-destructive">{record.error_message}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          {record.tx_signature && (
                            <a
                              href={explorerTxUrl(record.tx_signature, asCluster(record.network))}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs underline underline-offset-2"
                            >
                              {shortSig(record.tx_signature)}
                            </a>
                          )}
                          {record.status === "anchored" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              disabled={verifyingOperationId === record.id}
                              onClick={() => void handleVerifyAnchorRecord(record)}
                            >
                              {verifyingOperationId === record.id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <ShieldCheck size={14} />
                              )}
                              Verify
                            </Button>
                          )}
                          {(record.status === "failed" || record.status === "cancelled") && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              onClick={() => {
                                const mode: AnchorMode =
                                  record.mode === "full_file" ? "full_file" : "hash";
                                setDetailsFile(null);
                                openAnchorDialog(detailsFile, mode);
                              }}
                            >
                              <RotateCcw size={14} />
                              Retry
                            </Button>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Verification:{" "}
                        {record.verification_status === "verified"
                          ? "chunks rebuild to the anchored digest"
                          : record.verification_status === "mismatch"
                            ? "rebuild did not match"
                            : record.mode === "full_file"
                              ? "not checked yet"
                              : "file re-hash only"}
                        {record.mode === "full_file" &&
                          ` · stored chunks ${record.encryption ? "encrypted" : "unencrypted (legacy)"}`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              {anchorRecords.some(
                (record) => record.mode === "full_file" && record.status === "anchored" && record.encryption,
              ) && (
                <div className="mt-3 space-y-1.5">
                  <Label htmlFor="verify-passphrase" className="text-xs text-muted-foreground">
                    Anchoring passphrase
                  </Label>
                  <Input
                    id="verify-passphrase"
                    type="password"
                    autoComplete="off"
                    value={verifyPassphrase}
                    onChange={(event) => setVerifyPassphrase(event.target.value)}
                    placeholder="Required to decrypt the stored chunks"
                  />
                </div>
              )}

              {verificationNote && (
                <p className="mt-2 text-xs text-muted-foreground">{verificationNote}</p>
              )}

              {recoveryFile && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 gap-2"
                  onClick={handleRecoveryDownload}
                >
                  <Download size={14} />
                  Download the rebuilt file
                </Button>
              )}
            </div>
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
                    className="flex items-center justify-between rounded-none border p-3 gap-3"
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
                      <Download /> Download
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
              <div key={tag.id} className="flex items-center justify-between rounded-none border px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="h-2 w-2 rounded-none" style={{ background: tag.color ?? "currentColor" }} />
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
