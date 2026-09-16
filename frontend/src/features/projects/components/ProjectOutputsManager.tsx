import { useState } from "react";
import {
  Download,
  Trash2,
  FolderInput,
  FileText,
  FileSpreadsheet,
  FileJson,
  File,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { useProjectOutputs, downloadOutput } from "../tools/calculators/projectOutputs.ts";
import { SendToFileManagerDialog } from "./SendToFileManagerDialog.tsx";
import type { ProjectOutput } from "../tools/calculators/projectOutputs.ts";

interface ProjectOutputsManagerProps {
  projectId?: string;
  workspaceId?: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

function OutputIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.includes("csv") || mimeType.includes("spreadsheet")) {
    return <FileSpreadsheet size={18} className="text-emerald-500" />;
  }
  if (mimeType.includes("json") || mimeType.includes("geojson")) {
    return <FileJson size={18} className="text-amber-500" />;
  }
  if (mimeType.includes("text") || mimeType.includes("report")) {
    return <FileText size={18} className="text-blue-500" />;
  }
  return <File size={18} className="text-muted-foreground" />;
}

export function ProjectOutputsManager({ projectId, workspaceId }: ProjectOutputsManagerProps) {
  const { sorted, remove } = useProjectOutputs(projectId);
  const [sending, setSending] = useState<ProjectOutput | null>(null);

  if (!projectId) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Open a project to view saved outputs.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText size={18} /> Project Outputs
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Exports, reports and calculator results saved in this project. Use this workspace to
            review your outputs before sending them to the workspace File Manager for on-chain or
            off-chain storage.
          </p>
          <div className="text-sm text-muted-foreground">
            {sorted.length} saved output{sorted.length === 1 ? "" : "s"}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {sorted.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No saved outputs yet. Export points, CAD data or calculator results to populate this
              workspace.
            </div>
          ) : (
            <div className="hidden overflow-auto md:block">
              <table className="w-full text-sm min-w-[520px]">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-2 sm:px-4 py-2 font-medium w-[45%]">Output</th>
                    <th className="px-2 sm:px-4 py-2 font-medium hidden sm:table-cell w-[25%]">File name</th>
                    <th className="px-2 sm:px-4 py-2 font-medium w-[12%]">Size</th>
                    <th className="px-2 sm:px-4 py-2 font-medium hidden md:table-cell w-[18%]">Created</th>
                    <th className="px-2 sm:px-4 py-2 font-medium text-right w-[21%]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((o) => (
                    <tr key={o.id} className="border-t">
                      <td className="px-2 sm:px-4 py-2 sm:py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <OutputIcon mimeType={o.mimeType} />
                          <div className="min-w-0">
                            <p className="font-medium truncate max-w-[180px] sm:max-w-[240px]">{o.label}</p>
                            {o.description ? (
                              <p className="text-xs text-muted-foreground truncate max-w-[180px] sm:max-w-[240px]">{o.description}</p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 hidden sm:table-cell text-muted-foreground truncate max-w-[200px]">
                        {o.fileName}
                      </td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-muted-foreground whitespace-nowrap">{formatBytes(o.size)}</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 hidden md:table-cell text-muted-foreground whitespace-nowrap">
                        {formatDate(o.createdAt)}
                      </td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Download"
                            onClick={() => downloadOutput(o)}
                          >
                            <Download size={16} />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Send to File Manager"
                            onClick={() => setSending(o)}
                          >
                            <FolderInput size={16} />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Delete"
                            className="text-destructive hover:text-destructive"
                            onClick={() => remove(o.id)}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {sorted.length > 0 && (
            <div className="flex flex-col gap-3 p-3 md:hidden">
              {sorted.map((o) => (
                <article key={o.id} className="rounded-none border border-border/40 bg-muted/30 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <OutputIcon mimeType={o.mimeType} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{o.label}</p>
                        {o.description ? (
                          <p className="text-xs text-muted-foreground truncate">{o.description}</p>
                        ) : null}
                        <p className="text-xs text-muted-foreground truncate">{o.fileName}</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0 whitespace-nowrap">
                      {formatBytes(o.size)}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">{formatDate(o.createdAt)}</span>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="Download" onClick={() => downloadOutput(o)}>
                        <Download size={15} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="Send to File Manager" onClick={() => setSending(o)}>
                        <FolderInput size={15} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        title="Delete"
                        onClick={() => remove(o.id)}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <SendToFileManagerDialog
        open={sending !== null}
        output={sending}
        workspaceId={workspaceId}
        onClose={() => setSending(null)}
      />
    </div>
  );
}
