import type { CadModelState, CadToolId } from "../cadModel.ts";
import type { UseCadModel } from "../useCadModel.ts";
import type { WorkflowDialogs } from "../analysis/workflowCtx.ts";
import { pickSurface } from "../analysis/workflowCtx.ts";
import { circularArcParams } from "../survey/cogo.ts";
import { sampleZ } from "../survey/surface.ts";
import type { ControlPointFormOpenState, PointFormOpenState } from "../../CadWorkspace.tsx";

/**
 * Everything the per-tool pick branches of `CadWorkspace.handlePickPoint`
 * need. The locked-active-layer prologue STAYS at the top of the component's
 * callback; this module owns only the per-tool dispatch.
 *
 * Beyond the planned members the following were required to port every branch
 * verbatim:
 * - `model` — point-form layerId seed and spot-height TIN/point sampling.
 * - `coordDecimals` — dim-linear text + spot-height RL formatting.
 * - functional-updater forms on `setPendingVertices`/`setPointForm`/
 *   `setControlPointForm` (the scale branch calls `setPendingVertices([])`
 *   directly; the point branch uses a `(prev) => …` updater).
 */
export interface PickFlowCtx {
  world: { n: number; e: number };
  tool: CadToolId;
  cad: UseCadModel;
  model: CadModelState;
  dialog: WorkflowDialogs;
  log(text: string, kind?: "info" | "error"): void;
  activeColor: string | null;
  pendingVertices: { n: number; e: number }[];
  setPendingVertices(
    update:
      | { n: number; e: number }[]
      | ((v: { n: number; e: number }[]) => { n: number; e: number }[]),
  ): void;
  setPointForm(
    form: PointFormOpenState | ((prev: PointFormOpenState) => PointFormOpenState),
  ): void;
  setControlPointForm(
    form:
      | ControlPointFormOpenState
      | ((prev: ControlPointFormOpenState) => ControlPointFormOpenState),
  ): void;
  coordDecimals: number;
}

/** Runs the branch for ctx.tool; returns true when the tool consumed the pick. */
export async function handleToolPick(ctx: PickFlowCtx): Promise<boolean> {
  const { world, tool, cad, model, dialog, log, activeColor, setPendingVertices, setPointForm, setControlPointForm, coordDecimals } = ctx;
  if (tool === "point") {
    setPointForm((prev) => ({
      open: true,
      world,
      pointNo: cad.nextPointNo(),
      code: prev.code,
      elev: prev.elev,
      layerId: model.activeLayerId,
      title: "Place Survey Point",
    }));
    return true;
  }
  if (tool === "control-point") {
    cad.ensureLayerById("CONTROL");
    const controlLayer = cad.layerById("CONTROL");
    if (controlLayer?.locked) {
      log(`Layer "${controlLayer.name}" is locked. Unlock it to place control points.`, "error");
      return true;
    }
    setControlPointForm({ open: true, pointNo: cad.nextPointNo(), code: "CP" });
    return true;
  }
  if (tool === "text") {
    const value = await dialog.prompt("Annotation text:");
    if (value && value.trim()) {
      cad.addText({ n: world.n, e: world.e, text: value.trim(), color: activeColor });
      log(`Text placed: "${value.trim()}"`);
    }
    return true;
  }
  // AutoCAD-style Line / Polyline / Boundary: build a continuous chain of
  // vertices. The LINE tool creates a single open polyline immediately when
  // the second point is picked, so the whole chain can be selected and
  // deleted as one object; polyline/boundary previews stay pending until
  // Enter / right-click.
  if (tool === "line" || tool === "boundary") {
    setPendingVertices((verts) => [...verts, world]);
    return true;
  }

  // CIRCLE: pick centre, then a point on the circumference.
  if (tool === "circle") {
    setPendingVertices((verts) => {
      const next = [...verts, world];
      if (next.length === 2) {
        const [center, rim] = next;
        const radius = Math.hypot(rim.e - center.e, rim.n - center.n);
        if (radius <= 0) {
          log("Circle: radius must be greater than zero.", "error");
          return [];
        }
        const created = cad.addCircle({ center, radius, color: activeColor });
        log(`Circle created — radius ${radius.toFixed(3)} m.`);
        cad.setSelection({ type: "circle", id: created.id });
        return [];
      }
      log("Specify point on circumference:");
      return next;
    });
    return true;
  }

  // ARC: pick start, second, and end points.
  if (tool === "arc") {
    setPendingVertices((verts) => {
      const next = [...verts, world];
      if (next.length === 3) {
        const params = circularArcParams(next[0], next[1], next[2]);
        if (!params) {
          log("Arc: three selected points are collinear or coincident.", "error");
          return [];
        }
        const created = cad.addArc({
          center: params.center,
          radius: params.radius,
          startAngle: params.startAngle,
          endAngle: params.endAngle,
          color: activeColor,
        });
        log(`Arc created — r ${params.radius.toFixed(3)} m.`);
        cad.setSelection({ type: "arc", id: created.id });
        return [];
      }
      if (next.length === 1) log("Specify second point on arc:");
      else log("Specify end point of arc:");
      return next;
    });
    return true;
  }
  // AutoCAD-style MOVE / COPY: pick a base point, then a destination.
  if (tool === "move" || tool === "copy") {
    const hasSel = (cad.selection.items?.length ?? (cad.selection.id ? 1 : 0)) > 0;
    if (!hasSel) {
      log(`${tool === "move" ? "Move" : "Copy"}: select objects first (use Select), then pick base point.`, "error");
      return true;
    }
    setPendingVertices((verts) => {
      const next = [...verts, world];
      if (next.length === 2) {
        const dn = next[1].n - next[0].n;
        const de = next[1].e - next[0].e;
        const count = cad.transformSelection(dn, de, tool === "copy");
        const dist = Math.hypot(dn, de);
        log(`${tool === "copy" ? "Copied" : "Moved"} ${count} object${count === 1 ? "" : "s"} — ${dist.toFixed(3)} m.`);
        return [];
      }
      log("Specify destination point:");
      return next;
    });
    return true;
  }

  // ROTATE / SCALE / MIRROR / OFFSET: operate on the current selection.
  if (tool === "rotate") {
    const hasSel = (cad.selection.items?.length ?? (cad.selection.id ? 1 : 0)) > 0;
    if (!hasSel) {
      log("Rotate: select objects first (use Select), then pick base point.", "error");
      return true;
    }
    setPendingVertices((verts) => {
      const next = [...verts, world];
      if (next.length === 2) {
        const base = next[0];
        const ref = next[1];
        const angle = Math.atan2(ref.n - base.n, ref.e - base.e);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const count = cad.mapSelection((p) => {
          const dx = p.e - base.e;
          const dy = p.n - base.n;
          return { e: base.e + dx * cos - dy * sin, n: base.n + dx * sin + dy * cos };
        }, false, { rotateDeg: (angle * 180) / Math.PI });
        log(`Rotated ${count} object${count === 1 ? "" : "s"} ${((angle * 180) / Math.PI).toFixed(3)}° around base.`);
        return [];
      }
      log("Specify rotation angle (second point):");
      return next;
    });
    return true;
  }

  if (tool === "scale") {
    const hasSel = (cad.selection.items?.length ?? (cad.selection.id ? 1 : 0)) > 0;
    if (!hasSel) {
      log("Scale: select objects first (use Select), then pick base point.", "error");
      return true;
    }
    setPendingVertices((verts) => {
      if (verts.length === 0) {
        log("Enter scale factor after picking the base point.");
        return [world];
      }
      return verts;
    });
    const base = world;
    const raw = await dialog.prompt("Scale factor:", "1");
    setPendingVertices([]);
    if (raw == null) return true;
    const factor = parseFloat(raw);
    if (!Number.isFinite(factor)) {
      log("Scale: invalid factor.", "error");
      return true;
    }
    const count = cad.mapSelection((p) => ({
      e: base.e + (p.e - base.e) * factor,
      n: base.n + (p.n - base.n) * factor,
    }), false, { scaleFactor: factor });
    log(`Scaled ${count} object${count === 1 ? "" : "s"} by ${factor.toFixed(3)}x.`);
    return true;
  }

  if (tool === "mirror") {
    const hasSel = (cad.selection.items?.length ?? (cad.selection.id ? 1 : 0)) > 0;
    if (!hasSel) {
      log("Mirror: select objects first (use Select), then pick mirror line.", "error");
      return true;
    }
    setPendingVertices((verts) => {
      const next = [...verts, world];
      if (next.length === 2) {
        const a = next[0];
        const b = next[1];
        const dx = b.e - a.e;
        const dy = b.n - a.n;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) return next;
        const count = cad.mapSelection((p) => {
          const t = ((p.e - a.e) * dx + (p.n - a.n) * dy) / len2;
          const projE = a.e + t * dx;
          const projN = a.n + t * dy;
          return { e: projE * 2 - p.e, n: projN * 2 - p.n };
        }, false, { mirrorAngleDeg: (Math.atan2(dy, dx) * 180) / Math.PI });
        log(`Mirrored ${count} object${count === 1 ? "" : "s"} across mirror line.`);
        return [];
      }
      log("Specify second point of mirror line:");
      return next;
    });
    return true;
  }

  if (tool === "offset") {
    const sel = cad.selection;
    const lwId = sel.type === "linework" && sel.id ? sel.id : undefined;
    if (!lwId) {
      log("Offset: select a single polyline/boundary first.", "error");
      return true;
    }
    const raw = await dialog.prompt("Offset distance (positive = left side):", "1");
    if (raw == null) return true;
    const distance = parseFloat(raw);
    if (!Number.isFinite(distance)) {
      log("Offset: invalid distance.", "error");
      return true;
    }
    const copy = cad.offsetLinework(lwId, distance);
    if (copy) {
      log(`Offset ${distance.toFixed(3)} m created — ${copy.vertices.length} vertices.`);
    } else {
      log("Offset: could not create offset.", "error");
    }
    return true;
  }

  if (tool === "dim-linear") {
    setPendingVertices((verts) => {
      const next = [...verts, world];
      if (next.length === 2) {
        const a = next[0];
        const b = next[1];
        const dn = b.n - a.n;
        const de = b.e - a.e;
        const dist = Math.hypot(dn, de);
        const midN = (a.n + b.n) / 2;
        const midE = (a.e + b.e) / 2;
        const angle = Math.atan2(de, dn) * (180 / Math.PI);
        cad.ensureLayerById("DIMENSIONS");
        const created = cad.addDimension({
          kind: "linear",
          text: `${dist.toFixed(coordDecimals)}`,
          textPosition: { n: midN, e: midE },
          defPoints: [a, b],
          angle,
          color: activeColor,
        });
        log(`Linear dimension: ${dist.toFixed(3)} m placed.`);
        cad.setSelection({ type: "dimension", id: created.id });
        return [];
      }
      return next;
    });
    return true;
  }

  if (tool === "spot-height") {
    cad.ensureLayerById("SPOT_HEIGHTS");
    let z: number | undefined;

    // 1) Prefer sampling a TIN surface — chosen explicitly when more than
    // one exists (was silently the LAST surface in the list).
    if (model.surfaces.length > 0) {
      const surface = model.surfaces.length === 1
        ? model.surfaces[0]
        : await pickSurface(model.surfaces, dialog, "Choose surface to sample for the spot height");
      if (!surface) return true;
      const sampled = sampleZ({ points: surface.points, triangles: surface.triangles }, world.n, world.e);
      if (sampled !== null) z = sampled;
    }

    // 2) Fallback: a surveyed point within 0.5 m of the click.
    if (z === undefined) {
      const nearby = model.points
        .filter((p) => p.z != null && Number.isFinite(p.z))
        .sort((a, b) => {
          const da = Math.hypot(a.n - world.n, a.e - world.e);
          const db = Math.hypot(b.n - world.n, b.e - world.e);
          return da - db;
        })[0];
      if (nearby && Math.hypot(nearby.n - world.n, nearby.e - world.e) <= 0.5) {
        z = nearby.z!;
      }
    }

    // 3) Last resort: let the surveyor type the RL.
    if (z === undefined) {
      const raw = await dialog.prompt("Spot elevation (RL m):", "");
      if (raw == null) return true;
      const parsed = parseFloat(raw);
      if (!Number.isFinite(parsed)) {
        log("Spot Height: invalid elevation.", "error");
        return true;
      }
      z = parsed;
    }

    const text = `RL ${z.toFixed(coordDecimals)}`;
    cad.addText({ n: world.n, e: world.e, text, color: activeColor, layerId: "SPOT_HEIGHTS" });
    log(`Spot Height placed: ${text}`);
    return true;
  }

  if (tool === "measure") {
    setPendingVertices((verts) => {
      const next = [...verts, world];
      if (next.length === 2) {
        const dn = next[1].n - next[0].n;
        const de = next[1].e - next[0].e;
        const dist = Math.hypot(dn, de);
        let az = (Math.atan2(de, dn) * 180) / Math.PI;
        if (az < 0) az += 360;
        const dnAbs = Math.abs(dn);
        const deAbs = Math.abs(de);
        log(`Measure: ${dist.toFixed(3)} m @ ${az.toFixed(4)}°  dX:${dnAbs.toFixed(3)}  dY:${deAbs.toFixed(3)}`);
        return [];
      }
      return next;
    });
    return true;
  }

  return false;
}
