import { useMemo, useState, useCallback, type DragEvent } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Users,
  Package,
  AlertCircle,
  Truck,
  ClipboardList,
  Loader2,
  AlertTriangle,
} from "lucide-react";

import PageLoader from "@/components/PageLoader.tsx";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DialogTemplate } from "@/components/templates/DialogTemplate.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardHeader, DashboardShell } from "@/components/dashboard/DashboardShell.tsx";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { cn } from "@/lib/utils";

import {
  listJobAssignments,
  createJobAssignment,
  updateJobAssignment,
  replaceAssignmentMembers,
  replaceAssignmentAssets,
  deleteJobAssignment,
  type AssignmentWithDetails,
} from "../../lib/repositories/jobAssignments.ts";
import type { WorkspaceMemberWithProfile } from "../../lib/repositories/workspaceMembers.ts";
import { listWorkspaceMembers } from "../../lib/repositories/workspaceMembers.ts";
import type { AssetRow } from "../../lib/repositories/assets.ts";
import { listAssets } from "../../lib/repositories/assets.ts";
import type { ProjectWithOrg } from "../../lib/repositories/projects.ts";
import { listProjects } from "../../lib/repositories/projects.ts";

interface DispatchPageProps {
  workspaceId: string;
}

const clampDayIndex = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(4, Math.floor(value)));
};

const startOfWeekMonday = (d: Date) => {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = (day + 6) % 7;
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - diff);
  return copy;
};

const addDays = (d: Date, days: number) => {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
};

const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);

const formatDayLabel = (d: Date) => {
  const day = d.toLocaleDateString("en-GB", { weekday: "short" });
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  return `${day} ${date}`;
};

const COLORS = [
  "#dbeafe",
  "#fef3c7",
  "#dcfce7",
  "#fce7f3",
  "#e0e7ff",
  "#fde68a",
  "#d1fae5",
  "#ede9fe",
];

const DayLabel = ({
  label,
  isToday,
  isSelected,
}: {
  label: string;
  isToday: boolean;
  isSelected: boolean;
}) => {
  const [weekday, dayNum, month] = label.split(" ");
  return (
    <span
      className={cn(
        "flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg transition-colors",
        isSelected && "bg-primary text-primary-foreground",
        isToday && !isSelected && "bg-muted text-primary",
      )}
    >
      <span className="text-[10px] uppercase tracking-wide">{weekday}</span>
      <span className="text-sm font-semibold">
        {dayNum} {month}
      </span>
      {isToday && <Badge variant="outline" className="text-[10px] h-4 px-1">Today</Badge>}
    </span>
  );
};

const ResourceAvatar = ({
  name,
  kind,
}: {
  name: string;
  kind: "crew" | "equip" | "vehicle";
}) => {
  const initial = name?.charAt(0).toUpperCase() || "?";
  return (
    <span
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold shrink-0",
        kind === "crew"
          ? "bg-blue-100 text-blue-700"
          : kind === "vehicle"
            ? "bg-orange-100 text-orange-700"
            : "bg-emerald-100 text-emerald-700",
      )}
    >
      {kind === "crew" ? initial : kind === "vehicle" ? <Truck size={12} /> : <Package size={12} />}
    </span>
  );
};

export default function DispatchPage({ workspaceId }: DispatchPageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [members, setMembers] = useState<WorkspaceMemberWithProfile[]>([]);
  const [equipment, setEquipment] = useState<AssetRow[]>([]);
  const [vehicles, setVehicles] = useState<AssetRow[]>([]);
  const [projects, setProjects] = useState<ProjectWithOrg[]>([]);
  const [assignments, setAssignments] = useState<AssignmentWithDetails[]>([]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(() => {
    const start = addDays(startOfWeekMonday(today), 0);
    const days = Array.from({ length: 5 }, (_, i) => addDays(start, i));
    const idx = days.findIndex((d) => toIsoDate(d) === toIsoDate(today));
    return idx >= 0 ? idx : 2;
  });
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);

  const weekStart = useMemo(
    () => addDays(startOfWeekMonday(today), weekOffset * 7),
    [today, weekOffset],
  );
  const weekDays = useMemo(() => Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekLabels = useMemo(() => weekDays.map((d) => formatDayLabel(d)), [weekDays]);
  const weekDates = useMemo(() => weekDays.map((d) => toIsoDate(d)), [weekDays]);
  const todayIso = toIsoDate(today);
  const todayIndex = useMemo(() => {
    const idx = weekDays.findIndex((d) => toIsoDate(d) === todayIso);
    return idx >= 0 ? idx : 2;
  }, [todayIso, weekDays]);

  const resetWeek = useCallback(() => {
    setWeekOffset(0);
    setSelectedDay(todayIndex);
  }, [todayIndex]);

  const fetchAll = useCallback(async () => {
    try {
      setError(null);
      const [membersData, assetsData, projectsData, assignmentsData] = await Promise.all([
        listWorkspaceMembers(workspaceId),
        listAssets(workspaceId),
        listProjects(workspaceId),
        listJobAssignments(workspaceId),
      ]);
      setMembers(membersData);
      setEquipment(assetsData.filter((a) => a.kind !== "vehicle"));
      setVehicles(assetsData.filter((a) => a.kind === "vehicle"));
      setProjects(projectsData);
      setAssignments(assignmentsData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load dispatch data");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useAsyncAction(fetchAll, [fetchAll]);

  const weekAssignments = useMemo(
    () => assignments.filter((a) => weekDates.includes(a.assignment_date)),
    [assignments, weekDates],
  );

  const getAssignmentsForDay = useCallback(
    (dayIndex: number) => {
      const date = weekDates[dayIndex];
      return weekAssignments.filter((a) => a.assignment_date === date);
    },
    [weekDates, weekAssignments],
  );

  const effectiveSelectedAssignmentId = useMemo(
    () =>
      selectedAssignmentId && weekAssignments.some((a) => a.id === selectedAssignmentId)
        ? selectedAssignmentId
        : null,
    [selectedAssignmentId, weekAssignments],
  );

  const selectedAssignment = effectiveSelectedAssignmentId
    ? (weekAssignments.find((a) => a.id === effectiveSelectedAssignmentId) ?? null)
    : null;

  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const equipmentMap = useMemo(() => new Map(equipment.map((e) => [e.id, e])), [equipment]);
  const vehicleMap = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [formError, setFormError] = useState<string | null>(null);

  const [draftProjectId, setDraftProjectId] = useState("");
  const [draftDay, setDraftDay] = useState(0);
  const [draftCrew, setDraftCrew] = useState<string[]>([]);
  const [draftEquipment, setDraftEquipment] = useState<string[]>([]);
  const [draftVehicle, setDraftVehicle] = useState("");
  const [_draftColor, setDraftColor] = useState("#eef2ff");
  const [draftNotes, setDraftNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const openCreate = (day = selectedDay) => {
    setFormError(null);
    setModalMode("create");
    setDraftProjectId("");
    setDraftDay(clampDayIndex(day));
    setDraftCrew([]);
    setDraftEquipment([]);
    setDraftVehicle("");
    setDraftColor(COLORS[assignments.length % COLORS.length]);
    setDraftNotes("");
    setEditingId(null);
    setIsModalOpen(true);
  };

  const openEdit = (a: AssignmentWithDetails) => {
    setFormError(null);
    setModalMode("edit");
    setDraftProjectId(a.project_id ?? "");
    const dayIdx = weekDates.indexOf(a.assignment_date);
    setDraftDay(dayIdx >= 0 ? dayIdx : 0);
    setDraftCrew([...a.member_ids]);
    setDraftEquipment([...a.asset_ids.filter((id) => equipmentMap.has(id))]);
    setDraftVehicle(a.asset_ids.find((id) => vehicleMap.has(id)) ?? "");
    setDraftColor("#eef2ff");
    setDraftNotes(a.notes ?? "");
    setEditingId(a.id);
    setIsModalOpen(true);
  };

  const toggleDraftId = (kind: "crew" | "equipment", id: string) => {
    if (kind === "crew") {
      setDraftCrew((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
    } else {
      setDraftEquipment((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
    }
  };

  const saveDraft = async () => {
    if (!draftProjectId) return setFormError("Project is required.");
    if (draftCrew.length === 0) return setFormError("Select at least one crew member.");

    setSaving(true);
    setFormError(null);
    try {
      const assignmentDate = weekDates[draftDay];
      const allAssetIds = [...draftEquipment];
      if (draftVehicle) allAssetIds.push(draftVehicle);

      if (modalMode === "edit" && editingId) {
        await updateJobAssignment(editingId, {
          project_id: draftProjectId,
          assignment_date: assignmentDate,
          notes: draftNotes.trim() || null,
        });
        await replaceAssignmentMembers(workspaceId, editingId, draftCrew);
        await replaceAssignmentAssets(workspaceId, editingId, allAssetIds);
      } else {
        await createJobAssignment(
          workspaceId,
          {
            project_id: draftProjectId,
            assignment_date: assignmentDate,
            notes: draftNotes.trim() || null,
            status: "confirmed",
          },
          draftCrew,
          allAssetIds,
        );
      }

      setIsModalOpen(false);
      setSelectedDay(draftDay);
      await fetchAll();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to save assignment");
    } finally {
      setSaving(false);
    }
  };

  const deleteSelected = async () => {
    if (!selectedAssignment) return;
    const ok = window.confirm("Delete this assignment?");
    if (!ok) return;
    try {
      await deleteJobAssignment(selectedAssignment.id);
      setSelectedAssignmentId(null);
      await fetchAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete assignment");
    }
  };

  const [draggingAssignmentId, setDraggingAssignmentId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);

  const onDayDragOver = (dayIndex: number, e: DragEvent) => {
    e.preventDefault();
    setDragOverDay(dayIndex);
  };

  const onDayDrop = async (dayIndex: number, e: DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/dispatch-assignment");
    if (!id) return;
    setDraggingAssignmentId(null);
    setDragOverDay(null);
    try {
      await updateJobAssignment(id, { assignment_date: weekDates[dayIndex] });
      setSelectedDay(clampDayIndex(dayIndex));
      setSelectedAssignmentId(id);
      await fetchAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to move assignment");
    }
  };

  const getResourceBusy = (type: "crew" | "equip" | "vehicle", id: string, dayIndex: number) => {
    const dayAssignments = getAssignmentsForDay(dayIndex);
    return dayAssignments.some((a) =>
      type === "crew" ? a.member_ids.includes(id) : a.asset_ids.includes(id),
    );
  };

  const conflictForDay = useMemo(() => {
    const build = (dayIndex: number) => {
      const byMember = new Map<string, number>();
      const byAsset = new Map<string, number>();
      const dayAssignments = getAssignmentsForDay(dayIndex);

      for (const a of dayAssignments) {
        for (const id of a.member_ids) byMember.set(id, (byMember.get(id) ?? 0) + 1);
        for (const id of a.asset_ids) byAsset.set(id, (byAsset.get(id) ?? 0) + 1);
      }

      const crewConflicts = new Set(
        Array.from(byMember.entries())
          .filter(([, count]) => count > 1)
          .map(([id]) => id),
      );
      const assetConflicts = new Set(
        Array.from(byAsset.entries())
          .filter(([, count]) => count > 1)
          .map(([id]) => id),
      );

      return { crewConflicts, assetConflicts };
    };

    return {
      selected: build(selectedDay),
      byDay: Array.from({ length: 5 }, (_, i) => build(i)),
    };
  }, [selectedDay, getAssignmentsForDay]);

  const dispatchStats = useMemo(() => {
    const total = weekAssignments.length;
    const withCrew = weekAssignments.filter((a) => a.member_ids.length > 0).length;
    const withAssets = weekAssignments.filter((a) => a.asset_ids.length > 0).length;
    const conflicts = weekAssignments.filter((a) => {
      const dayIdx = weekDates.indexOf(a.assignment_date);
      const conflicts = conflictForDay.byDay[dayIdx];
      return (
        a.member_ids.some((id) => conflicts.crewConflicts.has(id)) ||
        a.asset_ids.some((id) => conflicts.assetConflicts.has(id))
      );
    }).length;
    return { total, withCrew, withAssets, conflicts };
  }, [weekAssignments, weekDates, conflictForDay]);

  if (loading) {
    return (
      <div className="hub-body p-6">
        <PageLoader />
      </div>
    );
  }

  return (
    <DashboardShell className="hub-body">
      <DashboardHeader
        title="Dispatch Board"
        subtitle="Assign crews, equipment, and vehicles to active projects"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-md border">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setWeekOffset((v) => v - 1)}
                aria-label="Previous week"
              >
                <ChevronLeft size={18} />
              </Button>
              <Button variant="ghost" size="sm"                 onClick={resetWeek}>
                Today
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setWeekOffset((v) => v + 1)}
                aria-label="Next week"
              >
                <ChevronRight size={18} />
              </Button>
            </div>
            <Badge variant="outline" className="gap-1.5 px-2.5">
              <CalendarDays size={14} />
              Week of{" "}
              {weekStart.toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </Badge>
            <Button onClick={() => openCreate(selectedDay)} className="gap-2">
              <Plus size={16} />
              New Assignment
            </Button>
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Week Assignments"
          value={String(dispatchStats.total)}
          subtext="Scheduled this week"
          icon={<ClipboardList className="size-4" />}
        />
        <KpiCard
          title="With Crew"
          value={String(dispatchStats.withCrew)}
          subtext="Crew assigned"
          icon={<Users className="size-4" />}
        />
        <KpiCard
          title="With Assets"
          value={String(dispatchStats.withAssets)}
          subtext="Equipment or vehicles"
          icon={<Package className="size-4" />}
        />
        <KpiCard
          title="Conflicts"
          value={String(dispatchStats.conflicts)}
          subtext="Double-booked resources"
          icon={<AlertTriangle className="size-4" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div className="rounded-none border bg-card shadow-sm overflow-x-auto">
          <div className="grid grid-cols-5 min-w-[640px] border-b">
            {weekLabels.map((day, i) => (
              <button
                key={day}
                className={cn(
                  "p-2 text-center transition-colors hover:bg-muted/50",
                  i === selectedDay && "bg-muted",
                )}
                onClick={() => setSelectedDay(i)}
                aria-pressed={i === selectedDay}
              >
                <DayLabel label={day} isToday={i === todayIndex} isSelected={i === selectedDay} />
              </button>
            ))}
          </div>
          <div className="grid grid-cols-5 min-w-[640px] min-h-[360px]">
            {weekLabels.map((_, dayIndex) => (
              <div
                key={dayIndex}
                className={cn(
                  "border-r last:border-r-0 p-2 space-y-2 transition-colors",
                  dayIndex === todayIndex && "bg-muted/30",
                  dayIndex === selectedDay && "bg-muted/50",
                  dragOverDay === dayIndex && "ring-2 ring-inset ring-primary/40",
                )}
                onDragOver={(e) => onDayDragOver(dayIndex, e)}
                onDragLeave={() => setDragOverDay(null)}
                onDrop={(e) => onDayDrop(dayIndex, e)}
              >
                {getAssignmentsForDay(dayIndex).map((assignment) => {
                  const conflicts = conflictForDay.byDay[dayIndex];
                  const hasConflict =
                    assignment.member_ids.some((id) => conflicts.crewConflicts.has(id)) ||
                    assignment.asset_ids.some((id) => conflicts.assetConflicts.has(id));
                  return (
                    <button
                      key={assignment.id}
                      className={cn(
                        "w-full text-left rounded-lg border p-2.5 text-xs shadow-sm transition-all hover:shadow",
                        effectiveSelectedAssignmentId === assignment.id && "ring-2 ring-primary",
                        draggingAssignmentId === assignment.id && "opacity-50",
                        hasConflict && "border-red-300",
                      )}
                      style={{
                        background: COLORS[assignments.indexOf(assignment) % COLORS.length],
                      }}
                      onClick={() => setSelectedAssignmentId(assignment.id)}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/dispatch-assignment", assignment.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDraggingAssignmentId(assignment.id);
                      }}
                      onDragEnd={() => {
                        setDraggingAssignmentId(null);
                        setDragOverDay(null);
                      }}
                    >
                      {hasConflict && (
                        <Badge variant="destructive" className="mb-1 h-4 px-1 text-[10px]">
                          Conflict
                        </Badge>
                      )}
                      <div className="font-semibold truncate">{assignment.project_name ?? "Untitled"}</div>
                      <div className="truncate opacity-80">
                        {assignment.job_title ?? assignment.notes ?? ""}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 opacity-70">
                        <span className="flex items-center gap-1" title="Crew members">
                          <Users size={13} /> {assignment.member_ids.length}
                        </span>
                        <span className="flex items-center gap-1" title="Assets assigned">
                          <Package size={13} /> {assignment.asset_ids.length}
                        </span>
                      </div>
                    </button>
                  );
                })}
                {getAssignmentsForDay(dayIndex).length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2 py-8">
                    <ClipboardList size={24} />
                    <span className="text-xs">No assignments</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {selectedAssignment ? (
            <div className="rounded-none border bg-card shadow-sm p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold truncate">
                    {selectedAssignment.project_name ?? "Untitled"}
                  </h3>
                  <p className="text-xs text-muted-foreground truncate">
                    {selectedAssignment.job_title ?? ""} ·{" "}
                    {weekLabels[weekDates.indexOf(selectedAssignment.assignment_date)] ??
                      selectedAssignment.assignment_date}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => openEdit(selectedAssignment)}>
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={deleteSelected}>
                    Delete
                  </Button>
                </div>
              </div>

              <DispatchSection label="Assigned Crew">
                {selectedAssignment.member_ids.map((id) => {
                  const member = memberMap.get(id);
                  const dayIdx = weekDates.indexOf(selectedAssignment.assignment_date);
                  const conflict =
                    dayIdx >= 0 && conflictForDay.byDay[dayIdx]?.crewConflicts.has(id);
                  return member ? (
                    <ResourceRow
                      key={id}
                      name={member.full_name ?? member.work_email ?? "Unknown"}
                      meta={conflict ? "Conflict" : member.role}
                      kind="crew"
                      conflict={conflict}
                    />
                  ) : null;
                })}
              </DispatchSection>

              <DispatchSection label="Equipment">
                {selectedAssignment.asset_ids
                  .filter((id) => equipmentMap.has(id))
                  .map((id) => {
                    const eq = equipmentMap.get(id)!;
                    const dayIdx = weekDates.indexOf(selectedAssignment.assignment_date);
                    const conflict =
                      dayIdx >= 0 && conflictForDay.byDay[dayIdx]?.assetConflicts.has(id);
                    return (
                      <ResourceRow
                        key={id}
                        name={eq.name}
                        meta={conflict ? "Conflict" : eq.kind}
                        kind="equip"
                        conflict={conflict}
                      />
                    );
                  })}
              </DispatchSection>

              <DispatchSection label="Vehicles">
                {selectedAssignment.asset_ids
                  .filter((id) => vehicleMap.has(id))
                  .map((id) => {
                    const v = vehicleMap.get(id)!;
                    const dayIdx = weekDates.indexOf(selectedAssignment.assignment_date);
                    const conflict =
                      dayIdx >= 0 && conflictForDay.byDay[dayIdx]?.assetConflicts.has(id);
                    return (
                      <ResourceRow
                        key={id}
                        name={v.name}
                        meta={conflict ? "Conflict" : v.serial_number ?? "Vehicle"}
                        kind="vehicle"
                        conflict={conflict}
                      />
                    );
                  })}
              </DispatchSection>

              {selectedAssignment.notes && (
                <DispatchSection label="Notes">
                  <p className="text-sm text-muted-foreground">{selectedAssignment.notes}</p>
                </DispatchSection>
              )}
            </div>
          ) : (
            <div className="rounded-none border bg-card shadow-sm p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Resource Pool</h3>
                <Button variant="outline" size="sm" onClick={() => openCreate(selectedDay)}>
                  New
                </Button>
              </div>

              <DispatchSection label="Crew Members">
                {members.map((c) => {
                  const busy = getResourceBusy("crew", c.id, selectedDay);
                  const conflict = conflictForDay.selected.crewConflicts.has(c.id);
                  return (
                    <ResourceRow
                      key={c.id}
                      name={c.full_name ?? c.work_email ?? "Unknown"}
                      meta={conflict ? "Conflict" : busy ? "Deployed" : "Available"}
                      kind="crew"
                      conflict={conflict}
                      busy={busy}
                    />
                  );
                })}
                {members.length === 0 && (
                  <p className="text-sm text-muted-foreground">No team members yet.</p>
                )}
              </DispatchSection>

              <DispatchSection label="Equipment">
                {equipment.map((eq) => {
                  const busy = getResourceBusy("equip", eq.id, selectedDay) || eq.status === "maintenance";
                  const conflict = conflictForDay.selected.assetConflicts.has(eq.id);
                  return (
                    <ResourceRow
                      key={eq.id}
                      name={eq.name}
                      meta={
                        eq.status === "maintenance"
                          ? "Maintenance"
                          : conflict
                            ? "Conflict"
                            : busy
                              ? "Deployed"
                              : "Available"
                      }
                      kind="equip"
                      conflict={conflict}
                      busy={busy}
                    />
                  );
                })}
                {equipment.length === 0 && (
                  <p className="text-sm text-muted-foreground">No equipment yet.</p>
                )}
              </DispatchSection>

              <DispatchSection label="Vehicles">
                {vehicles.map((v) => {
                  const busy = getResourceBusy("vehicle", v.id, selectedDay) || v.status === "maintenance";
                  const conflict = conflictForDay.selected.assetConflicts.has(v.id);
                  return (
                    <ResourceRow
                      key={v.id}
                      name={v.name}
                      meta={
                        v.status === "maintenance"
                          ? "In Service"
                          : conflict
                            ? "Conflict"
                            : busy
                              ? "Deployed"
                              : "Available"
                      }
                      kind="vehicle"
                      conflict={conflict}
                      busy={busy}
                    />
                  );
                })}
                {vehicles.length === 0 && (
                  <p className="text-sm text-muted-foreground">No vehicles yet.</p>
                )}
              </DispatchSection>
            </div>
          )}
        </div>
      </div>

      <DialogTemplate
        open={isModalOpen}
        onOpenChange={(open) => !open && setIsModalOpen(false)}
        title={modalMode === "edit" ? "Edit Assignment" : "New Assignment"}
        description="Assign crew, equipment, and a vehicle to a project."
        size="full"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveDraft} disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin mr-2" />}
              {saving ? "Saving..." : modalMode === "edit" ? "Save Changes" : "Create Assignment"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Project</Label>
            <Select value={draftProjectId} onValueChange={setDraftProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Select project</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.organization_name ? ` — ${p.organization_name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Day</Label>
            <Select
              value={draftDay.toString()}
              onValueChange={(val) => setDraftDay(clampDayIndex(Number(val) || 0))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {weekLabels.map((label, i) => (
                  <SelectItem key={i} value={i.toString()}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Vehicle</Label>
            <Select value={draftVehicle} onValueChange={setDraftVehicle}>
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                    {v.serial_number ? ` (${v.serial_number})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              placeholder="Optional notes"
            />
          </div>
        </div>

        <div className="space-y-4 pt-2">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Crew</Label>
              <Badge variant="secondary">{draftCrew.length} selected</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleDraftId("crew", m.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                    draftCrew.includes(m.id)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted",
                  )}
                >
                  {m.full_name ?? m.work_email ?? "Unknown"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Equipment</Label>
              <Badge variant="secondary">{draftEquipment.length} selected</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {equipment.map((eq) => (
                <button
                  key={eq.id}
                  type="button"
                  onClick={() => toggleDraftId("equipment", eq.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                    draftEquipment.includes(eq.id)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted",
                  )}
                >
                  {eq.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {formError && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {formError}
          </div>
        )}
      </DialogTemplate>
    </DashboardShell>
  );
}

function DispatchSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function ResourceRow({
  name,
  meta,
  kind,
  conflict,
  busy,
}: {
  name: string;
  meta: string;
  kind: "crew" | "equip" | "vehicle";
  conflict?: boolean;
  busy?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 py-1">
      <ResourceAvatar name={name} kind={kind} />
      <span className="text-sm font-medium flex-1 truncate">{name}</span>
      <Badge
        variant={conflict ? "destructive" : busy ? "secondary" : "outline"}
        className="text-[10px] h-5"
      >
        {conflict && <AlertCircle size={10} className="mr-1" />}
        {meta}
      </Badge>
    </div>
  );
}
