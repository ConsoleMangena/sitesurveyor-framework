import { useCallback, useMemo, useState } from "react";
import { Clock, DollarSign, Plus, Search, Trash2, CalendarDays, FileText, Check } from "lucide-react";
import {
  createExpenseEntry,
  createTimeEntry,
  deleteExpenseEntry,
  deleteTimeEntry,
  listExpenseEntries,
  listTimeEntries,
  type ExpenseEntryRow,
  type TimeEntryRow,
} from "../../lib/repositories/timeTracking.ts";
import { listProjects, type ProjectWithOrg } from "../../lib/repositories/projects.ts";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Textarea } from "../../components/ui/textarea.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../../components/ui/card.tsx";
import { MetricStrip } from "../../components/dashboard/MetricStrip.tsx";
import { DashboardHeader } from "../../components/dashboard/DashboardShell.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select.tsx";
import { ComboboxField } from "../../components/templates/ComboboxField.tsx";
import { PageForm } from "../../components/templates/PageForm.tsx";
import { SuccessDialog } from "../../components/SuccessDialog.tsx";
import { Alert, AlertDescription } from "../../components/ui/alert.tsx";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs.tsx";
import { Switch } from "../../components/ui/switch.tsx";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table.tsx";
import { ResponsiveTable } from "../../components/ui/responsive-table.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../components/ui/empty.tsx";

interface TimeTrackingPageProps {
  workspaceId: string;
}

const expenseCategories = [
  "Fuel",
  "Accommodation",
  "Permits/Fees",
  "Meals",
  "Materials",
  "Other",
] as const;
type ExpenseCategory = (typeof expenseCategories)[number];

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

export default function TimeTrackingPage({ workspaceId }: TimeTrackingPageProps) {
  const [timeEntries, setTimeEntries] = useState<TimeEntryRow[]>([]);
  const [expenseEntries, setExpenseEntries] = useState<ExpenseEntryRow[]>([]);
  const [projects, setProjects] = useState<ProjectWithOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"time" | "expenses">("time");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");

  const [timeForm, setTimeForm] = useState({
    entry_date: new Date().toISOString().slice(0, 10),
    project_id: "",
    task: "",
    hours: "1",
    billable: true,
    notes: "",
  });

  const [expenseForm, setExpenseForm] = useState<{
    entry_date: string;
    project_id: string;
    category: ExpenseCategory;
    amount: string;
    vendor: string;
    reimbursable: boolean;
    notes: string;
  }>({
    entry_date: new Date().toISOString().slice(0, 10),
    project_id: "",
    category: expenseCategories[0],
    amount: "0",
    vendor: "",
    reimbursable: false,
    notes: "",
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [time, expenses, projectRows] = await Promise.all([
        listTimeEntries(workspaceId),
        listExpenseEntries(workspaceId),
        listProjects(workspaceId),
      ]);
      setTimeEntries(time);
      setExpenseEntries(expenses);
      setProjects(projectRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load time tracking data.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useAsyncAction(loadData, [loadData]);

  const filteredTimeEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return timeEntries.filter((entry) => {
      if (projectFilter !== "all" && entry.project_id !== projectFilter) return false;
      if (!q) return true;
      return (
        entry.task.toLowerCase().includes(q) ||
        (entry.notes ?? "").toLowerCase().includes(q) ||
        (entry.projects?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [timeEntries, searchQuery, projectFilter]);

  const filteredExpenseEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return expenseEntries.filter((entry) => {
      if (projectFilter !== "all" && entry.project_id !== projectFilter) return false;
      if (!q) return true;
      return (
        entry.category.toLowerCase().includes(q) ||
        (entry.vendor ?? "").toLowerCase().includes(q) ||
        (entry.notes ?? "").toLowerCase().includes(q) ||
        (entry.projects?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [expenseEntries, searchQuery, projectFilter]);

  const totalHours = useMemo(
    () => timeEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0),
    [timeEntries],
  );
  const billableHours = useMemo(
    () =>
      timeEntries
        .filter((entry) => entry.billable)
        .reduce((sum, entry) => sum + Number(entry.hours || 0), 0),
    [timeEntries],
  );
  const totalExpenses = useMemo(
    () => expenseEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
    [expenseEntries],
  );
  const reimbursableExpenses = useMemo(
    () =>
      expenseEntries
        .filter((entry) => entry.reimbursable)
        .reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
    [expenseEntries],
  );

  const thisWeekHours = useMemo(() => {
    const start = startOfWeekMonday(new Date());
    const end = addDays(start, 7);
    return timeEntries
      .filter((e) => e.entry_date >= toIsoDate(start) && e.entry_date < toIsoDate(end))
      .reduce((sum, e) => sum + Number(e.hours || 0), 0);
  }, [timeEntries]);

  const entryCount = activeTab === "time" ? filteredTimeEntries.length : filteredExpenseEntries.length;

  const switchTab = (tab: "time" | "expenses") => {
    setActiveTab(tab);
    setSearchQuery("");
    setProjectFilter("all");
  };

  const handleDelete = async (id: string, type: "time" | "expense") => {
    const confirmed = window.confirm(
      type === "time" ? "Delete this time entry?" : "Delete this expense entry?",
    );
    if (!confirmed) return;
    try {
      setError(null);
      if (type === "time") {
        await deleteTimeEntry(id);
      } else {
        await deleteExpenseEntry(id);
      }
      await loadData();
      setSuccessMessage(
        type === "time" ? "Time entry deleted successfully." : "Expense entry deleted successfully.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete entry.");
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (activeTab === "time") {
        await createTimeEntry(workspaceId, {
          entry_date: timeForm.entry_date,
          task: timeForm.task.trim(),
          hours: Number(timeForm.hours),
          billable: timeForm.billable,
          project_id: timeForm.project_id || null,
          notes: timeForm.notes.trim() || null,
        });
      } else {
        await createExpenseEntry(workspaceId, {
          entry_date: expenseForm.entry_date,
          category: expenseForm.category,
          amount: Number(expenseForm.amount),
          vendor: expenseForm.vendor.trim() || null,
          reimbursable: expenseForm.reimbursable,
          project_id: expenseForm.project_id || null,
          notes: expenseForm.notes.trim() || null,
        });
      }
      setShowCreateModal(false);
      await loadData();
      setSuccessMessage(
        activeTab === "time" ? "Time entry saved successfully." : "Expense entry saved successfully.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save entry.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (showCreateModal) {
    return (
      <PageForm
        title={activeTab === "time" ? "Log Time" : "Log Expense"}
        description="Create a new time or expense entry."
        onBack={() => setShowCreateModal(false)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button type="submit" form="time-expense-form" disabled={submitting}>
              {submitting ? "Saving..." : "Save"}
            </Button>
          </>
        }
      >
        <form id="time-expense-form" onSubmit={handleCreate} className="mx-auto w-full max-w-6xl">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-6">
              {/* ── Basic Details ────────────────────────────── */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none bg-primary/10 text-primary">
                      <CalendarDays size={15} />
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        Basic details
                      </CardTitle>
                      <CardDescription>
                        Date and project association.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>
                        Date <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="date"
                        value={
                          activeTab === "time"
                            ? timeForm.entry_date
                            : expenseForm.entry_date
                        }
                        onChange={(e) =>
                          activeTab === "time"
                            ? setTimeForm((prev) => ({
                                ...prev,
                                entry_date: e.target.value,
                              }))
                            : setExpenseForm((prev) => ({
                                ...prev,
                                entry_date: e.target.value,
                              }))
                        }
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <ComboboxField
                        label="Project"
                        value={
                          activeTab === "time"
                            ? timeForm.project_id
                            : expenseForm.project_id
                        }
                        onChange={(val) =>
                          activeTab === "time"
                            ? setTimeForm((prev) => ({
                                ...prev,
                                project_id: val,
                              }))
                            : setExpenseForm((prev) => ({
                                ...prev,
                                project_id: val,
                              }))
                        }
                        options={projects.map((project) => ({
                          value: project.id,
                          label: project.name,
                        }))}
                        placeholder="Internal / Not linked"
                        emptyText="No projects found."
                        optional
                        optionalLabel="Internal / Not linked"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ── Entry Details ────────────────────────────── */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none bg-primary/10 text-primary">
                      {activeTab === "time" ? (
                        <Clock size={15} />
                      ) : (
                        <DollarSign size={15} />
                      )}
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        {activeTab === "time" ? "Time details" : "Expense details"}
                      </CardTitle>
                      <CardDescription>
                        {activeTab === "time"
                          ? "Task and hours."
                          : "Category, amount, and vendor."}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {activeTab === "time" ? (
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label>
                          Task <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          placeholder="e.g. Field Survey"
                          value={timeForm.task}
                          onChange={(e) =>
                            setTimeForm((prev) => ({
                              ...prev,
                              task: e.target.value,
                            }))
                          }
                          required
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
                        <div className="space-y-1.5">
                          <Label>
                            Hours <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            type="number"
                            min="0.25"
                            step="0.25"
                            placeholder="0.00"
                            value={timeForm.hours}
                            onChange={(e) =>
                              setTimeForm((prev) => ({
                                ...prev,
                                hours: e.target.value,
                              }))
                            }
                            required
                          />
                        </div>
                        <div className="flex items-end pb-2">
                          <label className="flex cursor-pointer items-center gap-2 text-sm">
                            <Switch
                              checked={timeForm.billable}
                              onCheckedChange={(checked) =>
                                setTimeForm((prev) => ({
                                  ...prev,
                                  billable: checked,
                                }))
                              }
                            />
                            Billable
                          </label>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Category</Label>
                          <Select
                            value={expenseForm.category}
                            onValueChange={(v) =>
                              setExpenseForm((prev) => ({
                                ...prev,
                                category: v as ExpenseCategory,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {expenseCategories.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>
                            Amount{" "}
                            <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={expenseForm.amount}
                            onChange={(e) =>
                              setExpenseForm((prev) => ({
                                ...prev,
                                amount: e.target.value,
                              }))
                            }
                            required
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
                        <div className="space-y-1.5">
                          <Label>Vendor</Label>
                          <Input
                            placeholder="e.g. Hardware Store"
                            value={expenseForm.vendor}
                            onChange={(e) =>
                              setExpenseForm((prev) => ({
                                ...prev,
                                vendor: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="flex items-end pb-2">
                          <label className="flex cursor-pointer items-center gap-2 text-sm">
                            <Switch
                              checked={expenseForm.reimbursable}
                              onCheckedChange={(checked) =>
                                setExpenseForm((prev) => ({
                                  ...prev,
                                  reimbursable: checked,
                                }))
                              }
                            />
                            Reimbursable
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ── Additional Notes ─────────────────────────── */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none bg-primary/10 text-primary">
                      <FileText size={15} />
                    </div>
                    <div>
                      <CardTitle className="text-base">Notes</CardTitle>
                      <CardDescription>
                        Optional details or descriptions.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    <Label>Notes</Label>
                    <Textarea
                      rows={3}
                      placeholder="Additional information..."
                      value={
                        activeTab === "time"
                          ? timeForm.notes
                          : expenseForm.notes
                      }
                      onChange={(e) =>
                        activeTab === "time"
                          ? setTimeForm((prev) => ({
                              ...prev,
                              notes: e.target.value,
                            }))
                          : setExpenseForm((prev) => ({
                              ...prev,
                              notes: e.target.value,
                            }))
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── Summary ───────────────────────────────────── */}
            <aside className="h-fit space-y-6 lg:sticky lg:top-0">
              <Card className="gap-4">
                <CardHeader>
                  <CardTitle className="text-base">
                    {activeTab === "time" ? "Time entry" : "Expense entry"}
                  </CardTitle>
                  <CardDescription>Summary at a glance.</CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Date</dt>
                      <dd className="truncate font-medium">
                        {(activeTab === "time"
                          ? timeForm.entry_date
                          : expenseForm.entry_date) || "—"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Project</dt>
                      <dd className="truncate font-medium">
                        {projects.find(
                          (p) =>
                            p.id ===
                            (activeTab === "time"
                              ? timeForm.project_id
                              : expenseForm.project_id)
                        )?.name || "Internal / Not linked"}
                      </dd>
                    </div>
                    {activeTab === "time" ? (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-muted-foreground">Hours</dt>
                          <dd className="truncate font-medium">
                            {timeForm.hours || "0.00"}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-muted-foreground">Billable</dt>
                          <dd className="font-medium">
                            {timeForm.billable ? "Yes" : "No"}
                          </dd>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-muted-foreground">Category</dt>
                          <dd className="truncate font-medium">
                            {expenseForm.category || "—"}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-muted-foreground">Amount</dt>
                          <dd className="font-medium tabular-nums">
                            ${expenseForm.amount || "0.00"}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-muted-foreground">
                            Reimbursable
                          </dt>
                          <dd className="font-medium">
                            {expenseForm.reimbursable ? "Yes" : "No"}
                          </dd>
                        </div>
                      </>
                    )}
                  </dl>
                </CardContent>
              </Card>
            </aside>
          </div>
        </form>
      </PageForm>
    );
  }

  const stats = [
    {
      label: "Total Hours",
      subtext: `${billableHours.toFixed(2)}h billable`,
      value: `${totalHours.toFixed(2)}h`,
      tone: "success" as const,
      icon: <Clock />,
    },
    {
      label: "This Week",
      subtext: "Mon–Sun",
      value: `${thisWeekHours.toFixed(2)}h`,
      tone: "success" as const,
      icon: <Clock />,
    },
    {
      label: "Total Expenses",
      subtext: `$${reimbursableExpenses.toLocaleString()} reimbursable`,
      value: `$${totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      tone: "warning" as const,
      icon: <DollarSign />,
    },
    {
      label: "Entries",
      subtext: activeTab,
      value: entryCount.toString(),
      tone: "primary" as const,
      icon: <Clock />,
    },
  ];

  const renderEmptyState = () => (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Search className="h-5 w-5" />
        </EmptyMedia>
        <EmptyTitle>
          No {activeTab === "time" ? "time" : "expense"} entries match
        </EmptyTitle>
        <EmptyDescription>
          Try adjusting your search or project filters, or{" "}
          <button
            className="text-primary underline underline-offset-2 hover:no-underline"
            onClick={() => setShowCreateModal(true)}
          >
            log your first {activeTab === "time" ? "time entry" : "expense"}
          </button>
          .
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent />
    </Empty>
  );

  return (
    <div className="space-y-4">
      <DashboardHeader
        title="Time & Expenses"
        badge={<Badge variant="secondary">Field log</Badge>}
        subtitle="Log your hours and site costs against real projects"
        meta={`${entryCount} ${entryCount === 1 ? "entry" : "entries"}`}
        actions={
          <Button size="sm" className="gap-2" onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" />
            {activeTab === "time" ? "Log Time" : "Log Expense"}
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <MetricStrip metrics={stats} />

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={activeTab} onValueChange={(value) => switchTab(value as typeof activeTab)}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="time">Timesheet</TabsTrigger>
              <TabsTrigger value="expenses">Expenses</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={
                  activeTab === "time" ? "Search task or notes..." : "Search vendor or notes..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={projectFilter === "" ? "internal" : projectFilter}
              onValueChange={(value) =>
                setProjectFilter(value === "internal" ? "" : value)
              }
            >
              <SelectTrigger className="w-full sm:w-48" aria-label="Filter by project">
                <SelectValue placeholder="All projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                <SelectItem value="internal">Internal / No project</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground sm:ml-auto">
              {entryCount} {entryCount === 1 ? "entry" : "entries"} shown
            </span>
          </div>

          {activeTab === "time" ? (
            <ResponsiveTable>
              {filteredTimeEntries.length === 0 ? (
                renderEmptyState()
              ) : (
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Date</TableHead>
                      <TableHead className="min-w-[160px]">Project</TableHead>
                      <TableHead className="hidden md:table-cell min-w-[140px]">Task</TableHead>
                      <TableHead className="hidden md:table-cell min-w-[180px]">Notes</TableHead>
                      <TableHead className="text-center w-[80px]">Billable</TableHead>
                      <TableHead className="text-right w-[80px]">Hours</TableHead>
                      <TableHead className="text-right w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTimeEntries.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell data-label="Date" className="align-middle whitespace-nowrap">{e.entry_date}</TableCell>
                        <TableCell data-label="Project" className="align-middle font-medium text-foreground">
                          <span className="block truncate max-w-[180px]" title={e.projects?.name ?? "Internal"}>
                            {e.projects?.name ?? "Internal"}
                          </span>
                        </TableCell>
                        <TableCell data-label="Task" className="align-middle hidden md:table-cell">
                          <span className="block truncate max-w-[160px]" title={e.task}>
                            {e.task}
                          </span>
                        </TableCell>
                        <TableCell data-label="Notes" className="align-middle hidden md:table-cell text-sm text-muted-foreground">
                          <span className="block truncate max-w-[200px]" title={e.notes ?? undefined}>
                            {e.notes ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell data-label="Billable" className="align-middle text-center">
                          {e.billable ? (
                            <Check className="h-4 w-4 text-success" />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell data-label="Hours" className="align-middle text-right font-semibold whitespace-nowrap">
                          {Number(e.hours).toFixed(2)}
                        </TableCell>
                        <TableCell data-label="Actions" className="align-middle text-right">
                          <Button
                            variant="outline"
                            size="icon"
                            className="relative h-9 w-9 after:absolute after:-inset-1 after:content-['']"
                            onClick={() => handleDelete(e.id, "time")}
                            aria-label="Delete time entry"
                            title="Delete time entry"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ResponsiveTable>
          ) : (
            <ResponsiveTable>
              {filteredExpenseEntries.length === 0 ? (
                renderEmptyState()
              ) : (
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Date</TableHead>
                      <TableHead className="min-w-[160px]">Project</TableHead>
                      <TableHead className="w-[120px]">Category</TableHead>
                      <TableHead className="hidden md:table-cell min-w-[180px]">Vendor/Details</TableHead>
                      <TableHead className="text-center w-[100px]">Reimbursable</TableHead>
                      <TableHead className="text-right w-[100px]">Amount</TableHead>
                      <TableHead className="text-right w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpenseEntries.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell data-label="Date" className="align-middle whitespace-nowrap">{e.entry_date}</TableCell>
                        <TableCell data-label="Project" className="align-middle font-medium text-foreground">
                          <span className="block truncate max-w-[180px]" title={e.projects?.name ?? "Internal"}>
                            {e.projects?.name ?? "Internal"}
                          </span>
                        </TableCell>
                        <TableCell data-label="Category" className="align-middle whitespace-nowrap">
                          <Badge variant="secondary">{e.category}</Badge>
                        </TableCell>
                        <TableCell data-label="Vendor" className="align-middle hidden md:table-cell">
                          <span className="block truncate max-w-[200px]" title={e.vendor ?? undefined}>
                            {e.vendor ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell data-label="Reimbursable" className="align-middle text-center whitespace-nowrap">
                          {e.reimbursable ? (
                            <span className="text-xs font-semibold text-primary">Yes</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell data-label="Amount" className="align-middle text-right font-semibold whitespace-nowrap">
                          ${Number(e.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell data-label="Actions" className="align-middle text-right">
                          <Button
                            variant="outline"
                            size="icon"
                            className="relative h-9 w-9 after:absolute after:-inset-1 after:content-['']"
                            onClick={() => handleDelete(e.id, "expense")}
                            aria-label="Delete expense entry"
                            title="Delete expense entry"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ResponsiveTable>
          )}
        </CardContent>
      </Card>

      <SuccessDialog
        open={!!successMessage}
        onOpenChange={() => setSuccessMessage(null)}
        message={successMessage ?? ""}
      />
    </div>
  );
}
