import { useCallback, useMemo, useState } from "react";
import { Clock, DollarSign, Plus, Search, Trash2, CalendarDays, FileText } from "lucide-react";
import PageLoader from "../../components/PageLoader.tsx";
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
import { Badge } from "../../components/ui/badge.tsx";
import { Card, CardContent, CardHeader } from "../../components/ui/card.tsx";
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
import { cn } from "../../lib/utils.ts";
import "../../styles/pages.css";

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
      <div className="hub-body">
        <PageLoader />
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
        <form id="time-expense-form" onSubmit={handleCreate} className="space-y-6">
          {/* ── Basic Details ────────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <CalendarDays size={14} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Basic Details</h3>
                <p className="text-[11px] text-muted-foreground">Date and project association.</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Date <span className="text-destructive">*</span></Label>
                  <Input
                    type="date"
                    value={activeTab === "time" ? timeForm.entry_date : expenseForm.entry_date}
                    onChange={(e) =>
                      activeTab === "time"
                        ? setTimeForm((prev) => ({ ...prev, entry_date: e.target.value }))
                        : setExpenseForm((prev) => ({ ...prev, entry_date: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Project</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-[color,box-shadow] focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-1"
                    value={activeTab === "time" ? timeForm.project_id : expenseForm.project_id}
                    onChange={(e) =>
                      activeTab === "time"
                        ? setTimeForm((prev) => ({ ...prev, project_id: e.target.value }))
                        : setExpenseForm((prev) => ({ ...prev, project_id: e.target.value }))
                    }
                  >
                    <option value="">Internal / Not linked</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* ── Entry Details ────────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", activeTab === "time" ? "bg-blue-500/10 text-blue-600" : "bg-emerald-500/10 text-emerald-600")}>
                {activeTab === "time" ? <Clock size={14} /> : <DollarSign size={14} />}
              </div>
              <div>
                <h3 className="text-sm font-semibold">{activeTab === "time" ? "Time Details" : "Expense Details"}</h3>
                <p className="text-[11px] text-muted-foreground">{activeTab === "time" ? "Task and hours." : "Category, amount, and vendor."}</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-4">
              {activeTab === "time" ? (
                <>
                  <div className="space-y-1.5">
                    <Label>Task <span className="text-destructive">*</span></Label>
                    <Input
                      placeholder="e.g. Field Survey"
                      value={timeForm.task}
                      onChange={(e) =>
                        setTimeForm((prev) => ({ ...prev, task: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
                    <div className="space-y-1.5">
                      <Label>Hours <span className="text-destructive">*</span></Label>
                      <Input
                        type="number"
                        min="0.25"
                        step="0.25"
                        placeholder="0.00"
                        value={timeForm.hours}
                        onChange={(e) =>
                          setTimeForm((prev) => ({ ...prev, hours: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="flex items-end pb-2">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Switch
                          checked={timeForm.billable}
                          onCheckedChange={(checked) =>
                            setTimeForm((prev) => ({ ...prev, billable: checked }))
                          }
                        />
                        Billable
                      </label>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Category</Label>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-[color,box-shadow] focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-1"
                        value={expenseForm.category}
                        onChange={(e) =>
                          setExpenseForm((prev) => ({
                            ...prev,
                            category: e.target.value as ExpenseCategory,
                          }))
                        }
                      >
                        {expenseCategories.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Amount <span className="text-destructive">*</span></Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={expenseForm.amount}
                        onChange={(e) =>
                          setExpenseForm((prev) => ({ ...prev, amount: e.target.value }))
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
                          setExpenseForm((prev) => ({ ...prev, vendor: e.target.value }))
                        }
                      />
                    </div>
                    <div className="flex items-end pb-2">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Switch
                          checked={expenseForm.reimbursable}
                          onCheckedChange={(checked) =>
                            setExpenseForm((prev) => ({ ...prev, reimbursable: checked }))
                          }
                        />
                        Reimbursable
                      </label>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Additional Notes ─────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600">
                <FileText size={14} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Notes</h3>
                <p className="text-[11px] text-muted-foreground">Optional details or descriptions.</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1"
                  placeholder="Additional information..."
                  value={activeTab === "time" ? timeForm.notes : expenseForm.notes}
                  onChange={(e) =>
                    activeTab === "time"
                      ? setTimeForm((prev) => ({ ...prev, notes: e.target.value }))
                      : setExpenseForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>
        </form>
      </PageForm>
    );
  }

  const stats = [
    {
      label: "Total Hours",
      sub: `${billableHours.toFixed(2)}h billable`,
      value: `${totalHours.toFixed(2)}h`,
      icon: Clock,
      color: "text-emerald-600",
    },
    {
      label: "This Week",
      sub: "Mon–Sun",
      value: `${thisWeekHours.toFixed(2)}h`,
      icon: Clock,
      color: "text-emerald-600",
    },
    {
      label: "Total Expenses",
      sub: `$${reimbursableExpenses.toLocaleString()} reimbursable`,
      value: `$${totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      icon: DollarSign,
      color: "text-amber-600",
    },
    {
      label: "Entries",
      sub: activeTab,
      value: entryCount.toString(),
      icon: Clock,
      color: "text-primary",
    },
  ];

  const renderEmptyState = () => (
    <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <Search className="h-12 w-12 text-muted-foreground/50" />
      <div className="space-y-1">
        <p className="font-medium text-foreground">
          No {activeTab === "time" ? "time" : "expense"} entries match
        </p>
        <p className="text-sm text-muted-foreground">
          Try adjusting your search or project filters, or{" "}
          <button
            className="text-primary underline underline-offset-2 hover:no-underline"
            onClick={() => setShowCreateModal(true)}
          >
            log your first {activeTab === "time" ? "time entry" : "expense"}
          </button>
          .
        </p>
      </div>
    </CardContent>
  );

  return (
    <div className="hub-body mx-auto max-w-6xl space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div>
        <h1>Time & Expenses</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Log your hours and site costs against real projects
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {stat.label}
                </span>
                <stat.icon className={cn("h-4 w-4", stat.color)} />
              </div>
              <div className="mt-1 text-2xl font-semibold text-foreground">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={activeTab} onValueChange={(value) => switchTab(value as typeof activeTab)}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="time">Timesheet</TabsTrigger>
              <TabsTrigger value="expenses">Expenses</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {activeTab === "time" ? "Log Time" : "Log Expense"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
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
            <select
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-[color,box-shadow]
              focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-1 sm:w-[220px]"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
            >
              <option value="all">All projects</option>
              <option value="">Internal / No project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
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
                        <TableCell className="align-middle whitespace-nowrap">{e.entry_date}</TableCell>
                        <TableCell className="align-middle font-medium text-foreground">
                          <span className="block truncate max-w-[180px]" title={e.projects?.name ?? "Internal"}>
                            {e.projects?.name ?? "Internal"}
                          </span>
                        </TableCell>
                        <TableCell className="align-middle hidden md:table-cell">
                          <span className="block truncate max-w-[160px]" title={e.task}>
                            {e.task}
                          </span>
                        </TableCell>
                        <TableCell className="align-middle hidden md:table-cell text-sm text-muted-foreground">
                          <span className="block truncate max-w-[200px]" title={e.notes ?? undefined}>
                            {e.notes ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="align-middle text-center">
                          {e.billable ? (
                            <span className="text-emerald-600">✓</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="align-middle text-right font-semibold whitespace-nowrap">
                          {Number(e.hours).toFixed(2)}
                        </TableCell>
                        <TableCell className="align-middle text-right">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => handleDelete(e.id, "time")}
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
                        <TableCell className="align-middle whitespace-nowrap">{e.entry_date}</TableCell>
                        <TableCell className="align-middle font-medium text-foreground">
                          <span className="block truncate max-w-[180px]" title={e.projects?.name ?? "Internal"}>
                            {e.projects?.name ?? "Internal"}
                          </span>
                        </TableCell>
                        <TableCell className="align-middle whitespace-nowrap">
                          <Badge variant="secondary">{e.category}</Badge>
                        </TableCell>
                        <TableCell className="align-middle hidden md:table-cell">
                          <span className="block truncate max-w-[200px]" title={e.vendor ?? undefined}>
                            {e.vendor ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="align-middle text-center whitespace-nowrap">
                          {e.reimbursable ? (
                            <span className="text-xs font-semibold text-primary">Yes</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="align-middle text-right font-semibold whitespace-nowrap">
                          ${Number(e.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="align-middle text-right">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => handleDelete(e.id, "expense")}
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
