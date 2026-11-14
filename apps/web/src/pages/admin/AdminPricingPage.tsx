import { useCallback, useState, type FormEvent, type ReactNode } from "react";
import { Loader2, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import ErrorNotice from "@/components/errors/ErrorNotice";
import { DashboardHeader } from "@/components/dashboard/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DialogTemplate } from "@/components/templates/DialogTemplate";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import {
  getAdminPricingConfiguration,
  updateBillingOperationRate,
  updateBillingPackage,
  updateSurveyCreditRate,
  type AdminPricingConfiguration,
  type BillingOperationRate,
  type BillingPackage,
  type OperationEditorValues,
  type PackageEditorValues,
  type SurveyCreditRate,
  type SurveyEditorValues,
} from "../../lib/repositories/adminPricing";

interface AdminPricingPageProps {
  isPlatformAdmin: boolean;
}

type Editor =
  | { kind: "package"; row: BillingPackage }
  | { kind: "operation"; row: BillingOperationRate }
  | { kind: "survey"; row: SurveyCreditRate };

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const integer = /^-?\d+$/;

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <Field id={id} label={label} hint={hint}>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint ? <span id={`${id}-hint`} className="sr-only">Enter a numeric value.</span> : null}
    </Field>
  );
}

function AvailabilityField({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-3">
      <div className="space-y-1">
        <Label htmlFor={id}>Available for future charges</Label>
        <p className="text-xs text-muted-foreground">
          Inactive entries stop new work; existing records are unchanged.
        </p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function numberFrom(
  value: string,
  label: string,
  { positive = false, whole = false }: { positive?: boolean; whole?: boolean } = {},
): number {
  if (value.trim() === "" || (whole && !integer.test(value.trim()))) {
    throw new Error(`${label} must be ${whole ? "a whole number" : "a valid number"}.`);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || (positive ? number <= 0 : number < 0)) {
    throw new Error(`${label} must be ${positive ? "greater than zero" : "zero or greater"}.`);
  }
  return number;
}

function EditorDialog({
  open,
  title,
  description,
  saving,
  onCancel,
  onSave,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  saving: boolean;
  onCancel: () => void;
  onSave: (setError: (message: string) => void) => Promise<void>;
  children: ReactNode;
}) {
  const [error, setError] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSave(setError);
  };
  return (
    <DialogTemplate
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) onCancel();
      }}
      title={title}
      description={description}
      size="lg"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="pricing-editor-form" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {saving ? "Saving changes…" : "Save pricing"}
          </Button>
        </>
      }
      footerNote="Changes apply to future purchases, quotes and charges."
    >
      <form id="pricing-editor-form" className="space-y-5" onSubmit={submit}>
        {error ? <ErrorNotice>{error}</ErrorNotice> : null}
        {children}
      </form>
    </DialogTemplate>
  );
}

function PackageForm({
  row,
  saving,
  onCancel,
  onSave,
}: {
  row: BillingPackage;
  saving: boolean;
  onCancel: () => void;
  onSave: (
    values: PackageEditorValues,
    setError: (message: string) => void,
  ) => Promise<void>;
}) {
  const [values, setValues] = useState({
    label: row.label,
    description: row.description,
    credits: row.credits?.toString() ?? "",
    storage_mb: row.storage_mb?.toString() ?? "",
    duration_days: row.duration_days?.toString() ?? "",
    amount: row.amount.toString(),
    estimated_infrastructure_cost: row.estimated_infrastructure_cost.toString(),
    estimated_payment_fee: row.estimated_payment_fee.toString(),
    sort_order: row.sort_order.toString(),
  });
  const [active, setActive] = useState(row.active);
  const patch = (field: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  return (
    <EditorDialog
      open
      title={row.label}
      description={`${row.id} · ${row.kind === "ai_credits" ? "AI credit package" : "Storage package"}`}
      saving={saving}
      onCancel={onCancel}
      onSave={(setError) => {
        try {
          if (!values.label.trim() || !values.description.trim()) {
            throw new Error("Enter a package label and description.");
          }
          return onSave({
            label: values.label.trim(),
            description: values.description.trim(),
            credits: row.kind === "ai_credits"
              ? numberFrom(values.credits, "Credits", { positive: true, whole: true })
              : null,
            storage_mb: row.kind === "storage"
              ? numberFrom(values.storage_mb, "Storage (MB)", { positive: true, whole: true })
              : null,
            duration_days: row.kind === "storage"
              ? numberFrom(values.duration_days, "Duration (days)", { positive: true, whole: true })
              : null,
            amount: numberFrom(values.amount, "Price", { positive: true }),
            estimated_infrastructure_cost: numberFrom(
              values.estimated_infrastructure_cost,
              "Infrastructure estimate",
            ),
            estimated_payment_fee: numberFrom(values.estimated_payment_fee, "Payment fee estimate"),
            active,
            sort_order: numberFrom(values.sort_order, "Display order", { whole: true }),
          }, setError);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Check the entered values.");
          return Promise.resolve();
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="package-label" label="Package name">
          <Input id="package-label" value={values.label} onChange={(e) => patch("label")(e.target.value)} />
        </Field>
        <NumberField id="package-price" label="Price (USD)" value={values.amount} onChange={patch("amount")} />
      </div>
      <Field id="package-description" label="Customer-facing description">
        <Textarea
          id="package-description"
          value={values.description}
          onChange={(e) => patch("description")(e.target.value)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        {row.kind === "ai_credits" ? (
          <NumberField id="package-credits" label="Credit entitlement" value={values.credits} onChange={patch("credits")} />
        ) : (
          <>
            <NumberField id="package-storage" label="Storage (MB)" value={values.storage_mb} onChange={patch("storage_mb")} />
            <NumberField id="package-days" label="Duration (days)" value={values.duration_days} onChange={patch("duration_days")} />
          </>
        )}
        <NumberField
          id="package-order"
          label="Display order"
          value={values.sort_order}
          onChange={patch("sort_order")}
          hint="Lower numbers appear first."
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          id="package-infrastructure"
          label="Infrastructure cost estimate (USD)"
          value={values.estimated_infrastructure_cost}
          onChange={patch("estimated_infrastructure_cost")}
        />
        <NumberField
          id="package-fee"
          label="Payment fee estimate (USD)"
          value={values.estimated_payment_fee}
          onChange={patch("estimated_payment_fee")}
        />
      </div>
      <AvailabilityField id="package-active" checked={active} onChange={setActive} />
    </EditorDialog>
  );
}

function OperationForm({
  row,
  saving,
  onCancel,
  onSave,
}: {
  row: BillingOperationRate;
  saving: boolean;
  onCancel: () => void;
  onSave: (
    values: OperationEditorValues,
    setError: (message: string) => void,
  ) => Promise<void>;
}) {
  const [credits, setCredits] = useState(row.credits.toString());
  const [estimatedCost, setEstimatedCost] = useState(row.estimated_cost.toString());
  const [active, setActive] = useState(row.active);
  const isComputedSurvey = row.operation === "satellite.survey";

  return (
    <EditorDialog
      open
      title={row.operation === "ai.chat" ? "AI chat" : row.operation}
      description={`${row.operation} · Fixed operation rate`}
      saving={saving}
      onCancel={onCancel}
      onSave={(setError) => {
        try {
          return onSave({
            credits: numberFrom(credits, "Credits", { positive: true, whole: true }),
            estimated_cost: numberFrom(estimatedCost, "Estimated cost"),
            active,
          }, setError);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Check the entered values.");
          return Promise.resolve();
        }
      }}
    >
      {isComputedSurvey ? (
        <ErrorNotice tone="info" title="Survey quotes use the formula rate card">
          This entry enables the survey operation for the credit ledger. Its fixed credit value does
          not override the base, hectare and minimum rates in Survey formulas.
        </ErrorNotice>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          id="operation-credits"
          label={isComputedSurvey ? "Ledger registration credits" : "Credits per operation"}
          value={credits}
          onChange={setCredits}
        />
        <NumberField id="operation-cost" label="Estimated cost (USD)" value={estimatedCost} onChange={setEstimatedCost} />
      </div>
      <AvailabilityField id="operation-active" checked={active} onChange={setActive} />
    </EditorDialog>
  );
}

function SurveyForm({
  row,
  saving,
  onCancel,
  onSave,
}: {
  row: SurveyCreditRate;
  saving: boolean;
  onCancel: () => void;
  onSave: (
    values: SurveyEditorValues,
    setError: (message: string) => void,
  ) => Promise<void>;
}) {
  const [values, setValues] = useState({
    label: row.label,
    base_credits: row.base_credits.toString(),
    per_hectare_credits: row.per_hectare_credits.toString(),
    minimum_credits: row.minimum_credits.toString(),
    estimated_cost: row.estimated_cost.toString(),
  });
  const [active, setActive] = useState(row.active);
  const patch = (field: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  return (
    <EditorDialog
      open
      title={row.label}
      description={`${row.category} · Area-based survey formula`}
      saving={saving}
      onCancel={onCancel}
      onSave={(setError) => {
        try {
          if (!values.label.trim()) throw new Error("Enter a survey name.");
          return onSave({
            label: values.label.trim(),
            base_credits: numberFrom(values.base_credits, "Base credits", { whole: true }),
            per_hectare_credits: numberFrom(values.per_hectare_credits, "Credits per hectare"),
            minimum_credits: numberFrom(values.minimum_credits, "Minimum credits", { whole: true }),
            estimated_cost: numberFrom(values.estimated_cost, "Estimated cost"),
            active,
          }, setError);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Check the entered values.");
          return Promise.resolve();
        }
      }}
    >
      <Field id="survey-label" label="Survey name">
        <Input id="survey-label" value={values.label} onChange={(e) => patch("label")(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField id="survey-base" label="Base credits" value={values.base_credits} onChange={patch("base_credits")} />
        <NumberField
          id="survey-hectare"
          label="Credits per hectare"
          value={values.per_hectare_credits}
          onChange={patch("per_hectare_credits")}
          hint="Small fractions are allowed, up to 8 decimal places."
        />
        <NumberField id="survey-minimum" label="Minimum credits" value={values.minimum_credits} onChange={patch("minimum_credits")} />
      </div>
      <div className="rounded-lg border bg-muted/30 px-3 py-3 text-sm">
        <span className="font-medium">Quote formula</span>
        <p className="mt-1 text-muted-foreground">
          max(minimum credits, ceil(base credits + credits per hectare × area))
        </p>
      </div>
      <NumberField id="survey-cost" label="Estimated cost (USD)" value={values.estimated_cost} onChange={patch("estimated_cost")} />
      <AvailabilityField id="survey-active" checked={active} onChange={setActive} />
    </EditorDialog>
  );
}

function RateRow({
  title,
  identifier,
  children,
  active,
  onEdit,
}: {
  title: string;
  identifier: string;
  children: ReactNode;
  active: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium">{title}</h3>
          <Badge variant={active ? "success" : "outline"}>{active ? "Active" : "Inactive"}</Badge>
        </div>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{identifier}</p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">{children}</div>
      </div>
      <Button variant="outline" size="sm" onClick={onEdit} className="shrink-0 gap-2 self-start">
        <Pencil aria-hidden="true" />
        Edit price
      </Button>
    </div>
  );
}

export default function AdminPricingPage({ isPlatformAdmin }: AdminPricingPageProps) {
  const [config, setConfig] = useState<AdminPricingConfiguration>({
    packages: [],
    operations: [],
    surveys: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!isPlatformAdmin) return;
    setLoading(true);
    setError(null);
    try {
      setConfig(await getAdminPricingConfiguration());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load pricing configuration.");
    } finally {
      setLoading(false);
    }
  }, [isPlatformAdmin]);

  useAsyncAction(load, [load]);

  if (!isPlatformAdmin) return null;

  const save = async (
    action: () => Promise<void>,
    name: string,
    setError: (message: string) => void,
  ) => {
    setSaving(true);
    setError("");
    try {
      await action();
      await load();
      setEditor(null);
      toast.success(`${name} pricing saved.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save pricing. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <DashboardHeader
        title="Pricing"
        subtitle="Control the platform rate card used by future purchases and quotes."
        badge={<Badge variant="secondary">Platform admin</Badge>}
        meta={`${config.packages.length + config.operations.length + config.surveys.length} configured entries`}
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
            Refresh
          </Button>
        }
      />
      <p className="max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
        Prices and entitlements affect new activity only. Historical purchases keep their recorded
        amounts. Disable an entry to prevent new purchases or charges without deleting its history.
      </p>

      {error ? <ErrorNotice>{error}</ErrorNotice> : null}
      {loading && config.packages.length + config.operations.length + config.surveys.length === 0 ? (
        <div className="space-y-3" role="status" aria-label="Loading pricing">
          <Skeleton className="h-10 w-full max-w-xl" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : (
        <Tabs defaultValue="packages" className="gap-5">
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto sm:w-fit">
            <TabsTrigger value="packages">Packages ({config.packages.length})</TabsTrigger>
            <TabsTrigger value="operations">AI operations ({config.operations.length})</TabsTrigger>
            <TabsTrigger value="surveys">Survey formulas ({config.surveys.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="packages">
            <section aria-label="Credit and storage packages" className="divide-y rounded-lg border px-5 py-0">
              {config.packages.map((row) => (
                <RateRow
                  key={row.id}
                  title={row.label}
                  identifier={`${row.id} · ${row.kind === "ai_credits" ? "AI credits" : "Storage"}`}
                  active={row.active}
                  onEdit={() => setEditor({ kind: "package", row })}
                >
                  <span className="font-semibold tabular-nums">{money.format(row.amount)}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {row.kind === "ai_credits"
                      ? `${row.credits?.toLocaleString()} credits`
                      : `${(row.storage_mb ?? 0) / 1024} GB · ${row.duration_days} days`}
                  </span>
                  {row.kind === "ai_credits" ? (
                    <span className="text-muted-foreground tabular-nums">
                      {money.format(row.amount / (row.credits ?? 1))} / credit
                    </span>
                  ) : null}
                </RateRow>
              ))}
            </section>
          </TabsContent>
          <TabsContent value="operations">
            <section aria-label="AI operation rates" className="divide-y rounded-lg border px-5 py-0">
              {config.operations.map((row) => (
                <RateRow
                  key={row.operation}
                  title={row.operation === "ai.chat" ? "AI chat" : row.operation}
                  identifier={row.operation}
                  active={row.active}
                  onEdit={() => setEditor({ kind: "operation", row })}
                >
                  <span className="font-semibold tabular-nums">{row.credits} credits / operation</span>
                  <span className="text-muted-foreground tabular-nums">
                    Cost estimate {money.format(row.estimated_cost)}
                  </span>
                </RateRow>
              ))}
            </section>
          </TabsContent>
          <TabsContent value="surveys">
            <p className="mb-3 max-w-[70ch] text-sm text-muted-foreground">
              Each quote is the greater of its minimum or the rounded base plus area charge.
            </p>
            <section aria-label="Survey credit formulas" className="divide-y rounded-lg border px-5 py-0">
              {config.surveys.map((row) => (
                <RateRow
                  key={row.category}
                  title={row.label}
                  identifier={row.category}
                  active={row.active}
                  onEdit={() => setEditor({ kind: "survey", row })}
                >
                  <span className="tabular-nums">{row.base_credits} base credits</span>
                  <span className="tabular-nums">{row.per_hectare_credits} credits / ha</span>
                  <span className="text-muted-foreground tabular-nums">Minimum {row.minimum_credits} credits</span>
                </RateRow>
              ))}
            </section>
          </TabsContent>
        </Tabs>
      )}

      {editor?.kind === "package" ? (
        <PackageForm
          key={editor.row.id}
          row={editor.row}
          saving={saving}
          onCancel={() => setEditor(null)}
          onSave={(values, setError) => save(
            () => updateBillingPackage(editor.row.id, values),
            editor.row.label,
            setError,
          )}
        />
      ) : null}
      {editor?.kind === "operation" ? (
        <OperationForm
          key={editor.row.operation}
          row={editor.row}
          saving={saving}
          onCancel={() => setEditor(null)}
          onSave={(values, setError) => save(
            () => updateBillingOperationRate(editor.row.operation, values),
            editor.row.operation,
            setError,
          )}
        />
      ) : null}
      {editor?.kind === "survey" ? (
        <SurveyForm
          key={editor.row.category}
          row={editor.row}
          saving={saving}
          onCancel={() => setEditor(null)}
          onSave={(values, setError) => save(
            () => updateSurveyCreditRate(editor.row.category, values),
            editor.row.label,
            setError,
          )}
        />
      ) : null}
    </div>
  );
}
