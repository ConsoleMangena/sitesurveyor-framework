import {
  Database,
  HardDrive,
  Crown,
  Users,
  FileText,
  Shield,
  Bell,
  Palette,
  Server,
  Loader2,
} from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card.tsx";
import { Separator } from "../../components/ui/separator.tsx";
import { Switch } from "../../components/ui/switch.tsx";
import { useDatabaseStats } from "../../lib/hooks/useDatabaseStats.ts";
import { useWorkspaceStorage } from "../../lib/hooks/useWorkspaceStorage.ts";

interface WorkspaceSettingsProps {
  workspaceId: string;
  isPlatformAdmin?: boolean;
}

export default function WorkspaceSettingsPage({ workspaceId, isPlatformAdmin = false }: WorkspaceSettingsProps) {
  // Admin view - system-wide database stats from Supabase
  const { totalSizeGB, tablesSizeGB, loading, error } = useDatabaseStats();

  // Regular user view - workspace storage from Supabase RPC
  const { usedMb, limitMb, percent, fileCount, loading: storageLoading, error: storageError } = useWorkspaceStorage(workspaceId);

  const storageUsedGB = usedMb / 1024;
  const storageLimitGB = limitMb / 1024;
  const isNearLimit = percent >= 80;
  const isAtLimit = percent >= 95;

  if (isPlatformAdmin) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">System Settings</h1>
          <p className="text-muted-foreground mt-1">
            Platform-wide database and system statistics.
          </p>
        </div>

        {/* System Database Stats */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Server size={20} className="text-primary" />
              </div>
              <div>
                <CardTitle>System Database</CardTitle>
                <CardDescription>
                  Platform-wide storage and usage statistics
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading database stats...</span>
              </div>
            ) : error ? (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <HardDrive size={16} className="text-destructive" />
                <div>
                  <p className="text-sm font-medium">Unable to load database stats</p>
                  <p className="text-xs text-muted-foreground mt-1">{error}</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="p-4 rounded-none border bg-card">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Database size={14} />
                    <span className="text-xs font-medium uppercase tracking-wide">Total Database Size</span>
                  </div>
                  <p className="text-2xl font-bold">{totalSizeGB.toFixed(2)} GB</p>
                </div>
                <div className="p-4 rounded-none border bg-card">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Server size={14} />
                    <span className="text-xs font-medium uppercase tracking-wide">Tables Size</span>
                  </div>
                  <p className="text-2xl font-bold">{tablesSizeGB.toFixed(2)} GB</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Separator />

        {/* Notifications */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Bell size={20} className="text-primary" />
              </div>
              <div>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>Configure notification preferences</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Email notifications</p>
                <p className="text-xs text-muted-foreground">Receive email updates for important events</p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Project updates</p>
                <p className="text-xs text-muted-foreground">Get notified about project changes</p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Regular user view
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Workspace Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your workspace storage, team, and preferences.
        </p>
      </div>

      {/* Storage Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Database size={20} className="text-primary" />
              </div>
              <div>
                <CardTitle>Storage</CardTitle>
                <CardDescription>
                  {storageLoading ? (
                    "Loading..."
                  ) : storageError ? (
                    "Unable to load storage info"
                  ) : (
                    <>{storageUsedGB.toFixed(2)} GB of {storageLimitGB.toFixed(2)} GB used · {fileCount} files</>
                  )}
                </CardDescription>
              </div>
            </div>
            <Button variant="outline" className="gap-2">
              <Crown size={16} />
              Upgrade Plan
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {storageLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading storage...</span>
            </div>
          ) : storageError ? (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <HardDrive size={16} className="text-destructive" />
              <div>
                <p className="text-sm font-medium">Unable to load storage info</p>
                <p className="text-xs text-muted-foreground mt-1">{storageError}</p>
              </div>
            </div>
          ) : (
            <>
              {/* Storage Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Storage used</span>
                  <span className={isAtLimit ? "text-destructive font-medium" : isNearLimit ? "text-amber-500" : ""}>
                    {percent}%
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      isAtLimit ? "bg-destructive" : isNearLimit ? "bg-amber-500" : "bg-primary"
                    }`}
                    style={{ width: `${Math.min(percent, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {(limitMb / 1024 - usedMb / 1024).toFixed(2)} GB remaining
                </p>
              </div>

              {isNearLimit && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <HardDrive size={16} className="text-amber-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">
                      {isAtLimit ? "Storage limit reached" : "Storage almost full"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Upgrade your plan to add more storage space for your projects and files.
                    </p>
                  </div>
                </div>
              )}

              {/* Upgrade Options */}
              <div className="grid gap-3 pt-2">
                <div className="flex items-center justify-between p-4 rounded-none border bg-card hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10">
                      <Database size={16} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">10 GB Storage</p>
                      <p className="text-xs text-muted-foreground">+$5/month</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">Select</Button>
                </div>
                <div className="flex items-center justify-between p-4 rounded-none border bg-card hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center bg-primary/10">
                      <Database size={16} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">50 GB Storage</p>
                      <p className="text-xs text-muted-foreground">+$15/month</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">Select</Button>
                </div>
                <div className="flex items-center justify-between p-4 rounded-none border bg-card hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center bg-primary/10">
                      <Database size={16} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Unlimited Storage</p>
                      <p className="text-xs text-muted-foreground">+$30/month</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">Select</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Team Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Users size={20} className="text-primary" />
            </div>
            <div>
              <CardTitle>Team</CardTitle>
              <CardDescription>Manage team members and permissions</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Allow team invites</p>
              <p className="text-xs text-muted-foreground">Members can invite others to the workspace</p>
            </div>
            <Switch />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Require admin approval</p>
              <p className="text-xs text-muted-foreground">New members must be approved before joining</p>
            </div>
            <Switch />
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Bell size={20} className="text-primary" />
            </div>
            <div>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>Configure notification preferences</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Email notifications</p>
              <p className="text-xs text-muted-foreground">Receive email updates for important events</p>
            </div>
            <Switch defaultChecked />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Project updates</p>
              <p className="text-xs text-muted-foreground">Get notified about project changes</p>
            </div>
            <Switch defaultChecked />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
