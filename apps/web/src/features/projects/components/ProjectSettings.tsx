import React from 'react';
import { Loader2 } from "lucide-react";
import type { HubProject } from '../../../pages/shared/ProjectHubPage.tsx';
import type { CrsType } from '../../../lib/mappers.ts';
import type { ProjectActivity } from '../../../lib/repositories/projects.ts';
import type { OrganizationRow } from '../../../lib/repositories/organizations.ts';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ProjectSettingsProps {
  activeProject: HubProject;
  editName: string;
  setEditName: (v: string) => void;
  editClient: string;
  organizations: OrganizationRow[];
  editOrgId: string;
  setEditOrgId: (v: string) => void;
  editPhase: string;
  setEditPhase: (v: string) => void;
  editDatum: string;
  setEditDatum: (v: string) => void;
  editAxisConvention: 'yx' | 'xy';
  setEditAxisConvention: (v: 'yx' | 'xy') => void;
  editCrsType: CrsType;
  setEditCrsType: (v: CrsType) => void;
  editCrsEpsg: string;
  setEditCrsEpsg: (v: string) => void;
  editLocalOriginE: string;
  setEditLocalOriginE: (v: string) => void;
  editLocalOriginN: string;
  setEditLocalOriginN: (v: string) => void;
  editBearingFormat: string;
  setEditBearingFormat: (v: string) => void;
  editAngleEntry: string;
  setEditAngleEntry: (v: string) => void;
  editCoordDecimals: string;
  setEditCoordDecimals: (v: string) => void;
  editStatus: string;
  setEditStatus: (v: string) => void;
  editDesc: string;
  setEditDesc: (v: string) => void;
  handleUpdateProject: () => Promise<void>;
  saving: boolean;
  canEditProjects: boolean;
  canInviteProjectMembers: boolean;
  handleUnarchiveProject: (dbId: string) => Promise<void>;
  setSelectedProject: (p: HubProject) => void;
  setShowPermanentDeleteConfirm: (v: boolean) => void;
  setShowDeleteConfirm: (v: boolean) => void;
  setShowAssignModal: (v: boolean) => void;

  activities: ProjectActivity[];
  settingsActivitySections: ProjectActivity[][];
  settingsActivitySectionIndex: number;
  setSettingsActivitySectionIndex: React.Dispatch<React.SetStateAction<number>>;
  newActivityText: string;
  setNewActivityText: (v: string) => void;
  submittingActivity: boolean;
  deletingActivityId: string | null;
  handleAddActivity: (e: React.FormEvent) => Promise<void>;
  handleDeleteActivity: (id: string) => Promise<void>;
}

/**
 * Radix forbids empty-string item values, so the "no client selected" state
 * travels through a sentinel and is mapped back to "" before it reaches the
 * parent — the value the parent already stores for an unassigned project.
 */
const NO_ORGANIZATION = "__no_organization__";

export function ProjectSettings({
  activeProject,
  editName,
  setEditName,
  editClient,
  organizations,
  editOrgId,
  setEditOrgId,
  editPhase,
  setEditPhase,
  editDatum,
  setEditDatum,
  editAxisConvention,
  setEditAxisConvention,
  editCrsType,
  setEditCrsType,
  editCrsEpsg,
  setEditCrsEpsg,
  editLocalOriginE,
  setEditLocalOriginE,
  editLocalOriginN,
  setEditLocalOriginN,
  editBearingFormat,
  setEditBearingFormat,
  editAngleEntry,
  setEditAngleEntry,
  editCoordDecimals,
  setEditCoordDecimals,
  editStatus,
  setEditStatus,
  editDesc,
  setEditDesc,
  handleUpdateProject,
  saving,
  canEditProjects,
  canInviteProjectMembers,
  handleUnarchiveProject,
  setSelectedProject,
  setShowPermanentDeleteConfirm,
  setShowDeleteConfirm,
  setShowAssignModal,
  activities,
  settingsActivitySections,
  settingsActivitySectionIndex,
  setSettingsActivitySectionIndex,
  newActivityText,
  setNewActivityText,
  submittingActivity,
  deletingActivityId,
  handleAddActivity,
  handleDeleteActivity,
}: ProjectSettingsProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-8">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base font-semibold">
              Project Information
            </CardTitle>
            <Button
              size="sm"
              className="w-full sm:w-auto"
              onClick={handleUpdateProject}
              disabled={saving || !canEditProjects}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="project-settings-name">Project Name</Label>
              <Input
                id="project-settings-name"
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="project-settings-client">
                  Client / Organization
                </Label>
                <Select
                  value={editOrgId === '' ? NO_ORGANIZATION : editOrgId}
                  onValueChange={(value) =>
                    setEditOrgId(value === NO_ORGANIZATION ? '' : value)
                  }
                  disabled={!canEditProjects}
                >
                  <SelectTrigger id="project-settings-client">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ORGANIZATION}>
                      {editClient || 'Unassigned'}
                    </SelectItem>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="project-settings-phase">Phase</Label>
                <Select value={editPhase} onValueChange={setEditPhase}>
                  <SelectTrigger id="project-settings-phase">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Planning">Planning</SelectItem>
                    <SelectItem value="Field Execution">
                      Field Execution
                    </SelectItem>
                    <SelectItem value="Data Processing">
                      Data Processing
                    </SelectItem>
                    <SelectItem value="Drafting">Drafting</SelectItem>
                    <SelectItem value="Quality Assurance">
                      Quality Assurance
                    </SelectItem>
                    <SelectItem value="Delivered">Delivered</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="project-settings-status">Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger id="project-settings-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="On Hold">On Hold</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                    <SelectItem value="Archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="project-settings-axis">Axis Convention</Label>
                <Select
                  value={editAxisConvention}
                  onValueChange={(value) =>
                    setEditAxisConvention(value as 'yx' | 'xy')
                  }
                >
                  <SelectTrigger id="project-settings-axis">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yx">
                      Y, X (Zimbabwe / RSA Gauss — Y = Easting first)
                    </SelectItem>
                    <SelectItem value="xy">
                      X, Y (UTM / International — X = Easting first)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Controls coordinate readouts across the project workspace.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="project-settings-crs-type">
                Coordinate System Type
              </Label>
              <Select
                value={editCrsType}
                onValueChange={(value) => setEditCrsType(value as CrsType)}
              >
                <SelectTrigger id="project-settings-crs-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">
                    Local site grid (arbitrary project origin)
                  </SelectItem>
                  <SelectItem value="projected">
                    Projected CRS (UTM, SPCS, Gauss-Conform, ...)
                  </SelectItem>
                  <SelectItem value="other">Other / unspecified</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {editCrsType === 'projected' && (
              <div className="space-y-1.5">
                <Label htmlFor="project-settings-crs-epsg">
                  EPSG Code (optional)
                </Label>
                <Input
                  id="project-settings-crs-epsg"
                  type="text"
                  value={editCrsEpsg}
                  onChange={(e) => setEditCrsEpsg(e.target.value)}
                  placeholder="e.g. 32736"
                />
              </div>
            )}

            {editCrsType === 'local' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="project-settings-origin-e">
                    Local Origin Easting
                  </Label>
                  <Input
                    id="project-settings-origin-e"
                    type="text"
                    value={editLocalOriginE}
                    onChange={(e) => setEditLocalOriginE(e.target.value)}
                    placeholder="Value treated as 0 in local grid"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="project-settings-origin-n">
                    Local Origin Northing
                  </Label>
                  <Input
                    id="project-settings-origin-n"
                    type="text"
                    value={editLocalOriginN}
                    onChange={(e) => setEditLocalOriginN(e.target.value)}
                    placeholder="Value treated as 0 in local grid"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="project-settings-datum">Datum Name</Label>
              <Input
                id="project-settings-datum"
                type="text"
                value={editDatum}
                onChange={(e) => setEditDatum(e.target.value)}
                placeholder="e.g. WGS84, Arc 1950, site local..."
              />
              <p className="text-xs text-muted-foreground">
                A short human-readable datum label. Use the fields above for the
                technical CRS / EPSG code.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="project-settings-bearing">Bearing Format</Label>
                <Select
                  value={editBearingFormat}
                  onValueChange={setEditBearingFormat}
                >
                  <SelectTrigger id="project-settings-bearing">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="azimuth">
                      WCB / Forward Bearing (D°M'S")
                    </SelectItem>
                    <SelectItem value="quadrant">
                      Reduced Bearing (N/S .. E/W)
                    </SelectItem>
                    <SelectItem value="gon">Gon / Grad</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="project-settings-angle">Angle Entry</Label>
                <Select value={editAngleEntry} onValueChange={setEditAngleEntry}>
                  <SelectTrigger id="project-settings-angle">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="packed">Packed DD.MMSS</SelectItem>
                    <SelectItem value="dms">D M S fields</SelectItem>
                    <SelectItem value="decimal">Decimal degrees</SelectItem>
                    <SelectItem value="gon">Gon / Grad</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="project-settings-decimals">
                  Coordinate Decimals
                </Label>
                <Input
                  id="project-settings-decimals"
                  type="number"
                  min={0}
                  max={6}
                  value={editCoordDecimals}
                  onChange={(e) => setEditCoordDecimals(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="project-settings-description">
                Description / Scope of Work
              </Label>
              <Textarea
                id="project-settings-description"
                className="min-h-[100px]"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Danger Zone</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeProject.status === 'Archived' ? (
              <>
                <div className="flex flex-col gap-2.5 rounded-lg border border-success/30 bg-success/10 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-success">
                      Restore Project
                    </span>
                    <span className="text-xs text-success">
                      Make project active and editable again.
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUnarchiveProject(activeProject.dbId)}
                    disabled={!canEditProjects}
                  >
                    Restore
                  </Button>
                </div>
                <div className="flex flex-col gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-destructive">
                      Permanent Delete
                    </span>
                    <span className="text-xs text-destructive">
                      Destroy all project data. This cannot be undone.
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      setSelectedProject(activeProject);
                      setShowPermanentDeleteConfirm(true);
                    }}
                    disabled={!canEditProjects}
                  >
                    Delete
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-destructive">
                    Archive Project
                  </span>
                  <span className="text-xs text-destructive">
                    Mark project as inactive and read-only.
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setSelectedProject(activeProject);
                    setShowDeleteConfirm(true);
                  }}
                  disabled={!canEditProjects}
                >
                  Archive
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Team Members</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {activeProject.members.map((member, idx) => (
              <div
                key={idx}
                className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-foreground">
                    {member.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {member.role}
                  </span>
                </div>
                <Badge
                  variant={member.status === 'active' ? 'success' : 'warning'}
                  className="self-start uppercase sm:self-auto"
                >
                  {member.status}
                </Badge>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="mt-2 w-full sm:w-auto"
              onClick={() => setShowAssignModal(true)}
              disabled={!canInviteProjectMembers}
            >
              Assign Member
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Project Activity Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex max-h-[400px] flex-col gap-4 overflow-y-auto">
              <form
                onSubmit={handleAddActivity}
                className="flex flex-col gap-2 sm:flex-row"
              >
                <Input
                  placeholder="Add a log entry..."
                  value={newActivityText}
                  onChange={(e) => setNewActivityText(e.target.value)}
                  className="h-9 text-sm"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={submittingActivity || !newActivityText.trim()}
                  className="shrink-0"
                >
                  {submittingActivity ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : null}
                  Log
                </Button>
              </form>
              {activities.length > 0 &&
              settingsActivitySections[settingsActivitySectionIndex] ? (
                <>
                  <section className="rounded-lg border border-border bg-card p-2.5">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant="default">
                        Section {settingsActivitySectionIndex + 1}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {settingsActivitySections[settingsActivitySectionIndex].length}{' '}
                        items
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {settingsActivitySectionIndex + 1} /{' '}
                        {settingsActivitySections.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      {settingsActivitySections[
                        settingsActivitySectionIndex
                      ].map((log) => (
                        <div
                          key={log.id}
                          className="flex items-start justify-between gap-2"
                        >
                          <div className="flex items-start gap-2">
                            <span
                              className={cn(
                                'mt-1.5 size-2 shrink-0 rounded-full',
                                log.activity_type === 'system'
                                  ? 'bg-muted-foreground'
                                  : 'bg-primary',
                              )}
                            />
                            <div className="flex flex-col">
                              <span className="text-sm text-foreground">
                                {log.content}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {log.user_name} &bull;{' '}
                                {new Date(log.created_at).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteActivity(log.id)}
                            disabled={deletingActivityId === log.id}
                            className="h-7 px-2 text-xs"
                          >
                            {deletingActivityId === log.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              'Delete'
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </section>
                  <div className="flex justify-between gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setSettingsActivitySectionIndex((prev) =>
                          Math.max(0, prev - 1),
                        )
                      }
                      disabled={settingsActivitySectionIndex <= 0}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setSettingsActivitySectionIndex((prev) =>
                          Math.min(settingsActivitySections.length - 1, prev + 1),
                        )
                      }
                      disabled={
                        settingsActivitySectionIndex >=
                        settingsActivitySections.length - 1
                      }
                    >
                      Next
                    </Button>
                  </div>
                </>
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No activity logged yet.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
