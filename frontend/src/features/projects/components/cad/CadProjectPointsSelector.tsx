import { useMemo, useState } from "react";
import { MapPin, CheckSquare, Square, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { DialogTemplate } from "@/components/templates/DialogTemplate.tsx";
import { Input } from "@/components/ui/input.tsx";
import { useProjectPoints } from "../../tools/calculators/projectPoints.ts";

interface CadProjectPointsSelectorProps {
  projectId?: string;
  onImport: (rows: { pointNo: string; n: number; e: number; z: number | null; code: string }[]) => void;
  onClose: () => void;
}

export function CadProjectPointsSelector({ projectId, onImport, onClose }: CadProjectPointsSelectorProps) {
  const { points, sections } = useProjectPoints(projectId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const sectionNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sections) {
      map.set(s.id, s.name.trim() || "Untitled section");
    }
    return map;
  }, [sections]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return points;
    return points.filter((p) => {
      const sectionName = p.sectionId ? sectionNameById.get(p.sectionId) ?? "" : "";
      return (
        p.pointNo.toLowerCase().includes(q) ||
        (p.code ?? "").toLowerCase().includes(q) ||
        sectionName.toLowerCase().includes(q)
      );
    });
  }, [points, filter, sectionNameById]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof points>();
    for (const p of filtered) {
      const key = p.sectionId
        ? (sectionNameById.get(p.sectionId) ?? "Untitled section")
        : "No section";
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    // Sort groups alphabetically; within each group sort by point number as an integer when possible.
    const sorted = Array.from(map.entries());
    sorted.sort((a, b) => a[0].localeCompare(b[0]));
    return sorted.map(([sectionName, list]) => [
      sectionName,
      list.sort((a, b) => {
        const na = parseInt(a.pointNo, 10);
        const nb = parseInt(b.pointNo, 10);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return a.pointNo.localeCompare(b.pointNo);
      }),
    ] as const);
  }, [filtered, sectionNameById]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((p) => p.id)));
  };

  const toggleGroup = (ids: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const toggleGroupFold = (code: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const collapseAll = () => setCollapsedGroups(new Set(groups.map(([code]) => code)));
  const expandAll = () => setCollapsedGroups(new Set());

  const selectedRows = points
    .filter((p) => selected.has(p.id))
    .map((p) => ({ pointNo: p.pointNo, n: p.n, e: p.e, z: p.z ?? null, code: p.code ?? "" }));

  const gridCols = "grid-cols-[40px_minmax(100px,1.25fr)_1fr_1fr_1fr]";

  return (
    <DialogTemplate
      open
      onOpenChange={(open) => !open && onClose()}
      title={
        <span className="flex items-center gap-2">
          <MapPin size={18} /> Project Coordinates
        </span>
      }
      description="Select coordinates from the project workspace to bring into the CAD drawing. Duplicates are skipped."
      className="flex! h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-none flex-col overflow-hidden!"
      contentClassName="flex flex-1 flex-col overflow-hidden"
      footer={
        <>
          <span className="text-sm text-muted-foreground mr-auto">
            {selected.size} selected
          </span>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onImport(selectedRows)} disabled={selectedRows.length === 0}>
            Import {selectedRows.length}
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search point no. or code"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-9 flex-1 min-w-[160px]"
        />
        <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={toggleAll}>
          {selected.size === filtered.length && filtered.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}
          {selected.size === filtered.length && filtered.length > 0 ? "Deselect all" : "Select all"}
        </Button>
        <Button variant="outline" size="sm" className="shrink-0" onClick={collapseAll}>
          Collapse all
        </Button>
        <Button variant="outline" size="sm" className="shrink-0" onClick={expandAll}>
          Expand all
        </Button>
      </div>

      <div className="overflow-auto border rounded-md flex-1 min-h-0">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No project coordinates found. Add or import them in Project Hub → Coordinates.
          </div>
        ) : (
          <div className="text-sm min-w-[520px]">
            <div className={`grid ${gridCols} gap-2 px-3 py-2 bg-muted/50 font-medium sticky top-0 z-10`}>
              <div></div>
              <div>Point no.</div>
              <div className="text-right">Easting</div>
              <div className="text-right">Northing</div>
              <div className="text-right">RL</div>
            </div>
            {groups.map(([code, rows]) => {
              const ids = rows.map((p) => p.id);
              const selectedCount = rows.filter((p) => selected.has(p.id)).length;
              const allSelected = selectedCount === rows.length;
              const collapsed = collapsedGroups.has(code);
              return (
                <div key={code} className="border-b last:border-b-0">
                  <div className="flex items-center gap-1 px-3 py-2 bg-muted/40 hover:bg-muted/60 border-b">
                    <button
                      type="button"
                      className="shrink-0 p-1 rounded hover:bg-muted"
                      onClick={() => toggleGroupFold(code)}
                      aria-label={collapsed ? `Expand ${code}` : `Collapse ${code}`}
                      title={collapsed ? "Expand section" : "Collapse section"}
                    >
                      {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <button
                      type="button"
                      className="flex flex-1 items-center gap-2 min-w-0 text-left"
                      onClick={() => toggleGroup(ids)}
                    >
                      {allSelected ? (
                        <CheckSquare size={16} className="text-accent" />
                      ) : (
                        <Square size={16} />
                      )}
                      <span className="font-semibold truncate">{code}</span>
                      <span className="ml-auto text-xs text-muted-foreground shrink-0">
                        {selectedCount} / {rows.length}
                      </span>
                    </button>
                  </div>

                  {!collapsed && rows.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`grid ${gridCols} gap-2 items-center w-full px-3 py-2 hover:bg-muted/30 border-t text-left`}
                      onClick={() => toggle(p.id)}
                    >
                      {selected.has(p.id) ? (
                        <CheckSquare size={16} className="text-accent" />
                      ) : (
                        <Square size={16} />
                      )}
                      <span className="font-medium">{p.pointNo}</span>
                      <span className="tabular-nums text-right">{p.e.toFixed(3)}</span>
                      <span className="tabular-nums text-right">{p.n.toFixed(3)}</span>
                      <span className="tabular-nums text-right">
                        {p.z == null ? "—" : p.z.toFixed(3)}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DialogTemplate>
  );
}
