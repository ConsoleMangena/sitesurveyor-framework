import type { UseCadModel } from "./useCadModel.ts";
import { fmtBearing, fmtCoord, fmtDistance, parseBearing, type BearingFormat } from "./survey/format.ts";
import { forward, inverse, polygonArea, polylineLength } from "./survey/cogo.ts";
import type { CadToolId, SurveyPoint } from "./cadModel.ts";
import { axisBadgeLabels, type AxisConvention } from "./cadSettings.ts";

export interface CommandContext {
  cad: UseCadModel;
  bearingFormat: BearingFormat;
  axisConvention: AxisConvention;
  setTool: (t: CadToolId) => void;
  log: (text: string, kind?: "info" | "error") => void;
  fitExtents: () => void;
  /** AutoCAD-style layout control, optional so tests/other callers can omit it. */
  layout?: {
    /** Switch to the model-space tab. */
    toModel: () => void;
    /** Enter paper space: activate the current/first layout, creating one if needed. */
    toLayout: () => void;
    /** Create a new layout and make it active. */
    newLayout: () => void;
    /** Open the print/PDF flow for the active sheet. */
    plot: () => void;
    /** Names of existing layouts (for listing). */
    names: () => string[];
  };
}

const TOOL_COMMANDS: Record<string, CadToolId> = {
  LINE: "line",
  L: "line",
  PLINE: "line",
  POLYLINE: "line",
  POINT: "point",
  PO: "point",
  BOUNDARY: "boundary",
  PARCEL: "boundary",
  TEXT: "text",
  DT: "text",
  SELECT: "select",
  PAN: "pan",
  MEASURE: "measure",
  DIST: "measure",
};

export function runCommand(raw: string, ctx: CommandContext): void {
  const { cad, bearingFormat, axisConvention, setTool, log, fitExtents, layout } = ctx;
  const axis = axisBadgeLabels(axisConvention);
  const text = raw.trim();
  const upper = text.toUpperCase();

  // Tool switch.
  if (TOOL_COMMANDS[upper]) {
    setTool(TOOL_COMMANDS[upper]);
    log(`Command: ${upper}`);
    return;
  }

  // ── Paper space / layout commands (AutoCAD: PLOT, LAYOUT, MODEL) ───────────
  if (upper === "PLOT" || upper === "PRINT") {
    if (!layout) { log("PLOT: layouts unavailable here.", "error"); return; }
    layout.plot();
    return;
  }
  if (upper === "MODEL" || upper === "MS" || upper === "MSPACE") {
    if (!layout) { log("MODEL: layouts unavailable here.", "error"); return; }
    layout.toModel();
    log("Switched to Model space.");
    return;
  }
  // LAYOUT, with optional subcommand: LAYOUT NEW / LAYOUT LIST. Bare LAYOUT
  // (or the PS / PSPACE aliases) enters paper space, mirroring AutoCAD.
  const layoutCmd = upper.match(/^(?:LAYOUT|LO|PS|PSPACE)(?:\s+(\w+))?$/);
  if (layoutCmd) {
    if (!layout) { log("LAYOUT: layouts unavailable here.", "error"); return; }
    const sub = layoutCmd[1];
    if (sub === "NEW" || sub === "N") {
      layout.newLayout();
      log("New layout created.");
    } else if (sub === "LIST" || sub === "L" || sub === "?") {
      const names = layout.names();
      log(names.length ? `Layouts: ${names.join(", ")}` : "No layouts defined.");
    } else {
      layout.toLayout();
      log("Switched to paper space (layout).");
    }
    return;
  }

  // Zoom extents.
  if (upper === "ZE" || upper === "ZOOM E" || upper === "ZOOM EXTENTS") {
    fitExtents();
    log("Zoom extents.");
    return;
  }

  // Clear command history.
  if (upper === "CLS" || upper === "CLEAR") {
    log("Command history cleared.");
    return;
  }

  // ERASE / DELETE — delete selection.
  if (upper === "ERASE" || upper === "E" || upper === "DELETE") {
    const sel = cad.selection;
    if (sel.type === "point" && sel.id) {
      cad.deletePoint(sel.id);
      log("Point deleted.");
    } else if (sel.type === "linework" && sel.id) {
      cad.deleteLinework(sel.id);
      log("Linework deleted.");
    } else if (sel.type === "text" && sel.id) {
      cad.deleteText(sel.id);
      log("Text deleted.");
    } else {
      log("ERASE: nothing selected.", "error");
    }
    return;
  }

  // LIST — show entity properties in command log.
  if (upper === "LIST" || upper === "LI") {
    const sel = cad.selection;
    if (sel.type === "point" && sel.id) {
      const p = cad.model.points.find((x) => x.id === sel.id);
      if (p) {
        const zText = p.z != null ? ` H ${fmtCoord(p.z)}` : "";
        log(`${p.pointNo} (${axis.first} ${fmtCoord(p.e)}, ${axis.second} ${fmtCoord(p.n)}${zText})${p.code ? ` code: ${p.code}` : ""}  layer: ${cad.model.layers.find((l) => l.id === p.layerId)?.name ?? p.layerId}`);
      }
    } else if (sel.type === "linework" && sel.id) {
      const lw = cad.model.linework.find((x) => x.id === sel.id);
      if (lw) {
        let len = 0;
        for (let i = 1; i < lw.vertices.length; i++) {
          len += inverse(lw.vertices[i - 1], lw.vertices[i]).distance;
        }
        log(`${lw.kind}: ${lw.vertices.length} vertices, length ${fmtDistance(len)} m${lw.closed ? ", closed" : ""}  layer: ${cad.model.layers.find((l) => l.id === lw.layerId)?.name ?? lw.layerId}`);
      }
    } else if (sel.type === "text" && sel.id) {
      const t = cad.model.texts.find((x) => x.id === sel.id);
      if (t) {
        log(`Text: "${t.text}" at ${axis.first} ${fmtCoord(t.e)} ${axis.second} ${fmtCoord(t.n)}  layer: ${cad.model.layers.find((l) => l.id === t.layerId)?.name ?? t.layerId}`);
      }
    } else if (sel.type === "circle" && sel.id) {
      const c = cad.model.circles.find((x) => x.id === sel.id);
      if (c) {
        log(`Circle: r ${fmtCoord(c.radius)} at ${axis.first} ${fmtCoord(c.center.e)} ${axis.second} ${fmtCoord(c.center.n)}  layer: ${cad.model.layers.find((l) => l.id === c.layerId)?.name ?? c.layerId}`);
      }
    } else if (sel.type === "ellipse" && sel.id) {
      const el = cad.model.ellipses.find((x) => x.id === sel.id);
      if (el) {
        log(`Ellipse: a ${fmtCoord(el.semiMajor)} b ${fmtCoord(el.semiMinor)} rot ${fmtCoord(el.rotation)}° at ${axis.first} ${fmtCoord(el.center.e)} ${axis.second} ${fmtCoord(el.center.n)}  layer: ${cad.model.layers.find((l) => l.id === el.layerId)?.name ?? el.layerId}`);
      }
    } else if (sel.type === "arc" && sel.id) {
      const a = cad.model.arcs.find((x) => x.id === sel.id);
      if (a) {
        log(`Arc: r ${fmtCoord(a.radius)} at ${axis.first} ${fmtCoord(a.center.e)} ${axis.second} ${fmtCoord(a.center.n)} angles ${fmtCoord(a.startAngle)}°..${fmtCoord(a.endAngle)}°  layer: ${cad.model.layers.find((l) => l.id === a.layerId)?.name ?? a.layerId}`);
      }
    } else if (sel.type === "dimension" && sel.id) {
      const d = cad.model.dimensions.find((x) => x.id === sel.id);
      if (d) {
        log(`Dimension: ${d.kind} "${d.text}" points ${d.defPoints.length}  layer: ${cad.model.layers.find((l) => l.id === d.layerId)?.name ?? d.layerId}`);
      }
    } else if (sel.type === "hatch" && sel.id) {
      const h = cad.model.hatches.find((x) => x.id === sel.id);
      if (h) {
        log(`Hatch: ${h.vertices.length} vertices${h.holes?.length ? `, ${h.holes.length} hole(s)` : ""}  pattern: ${h.pattern ?? "SOLID"}  layer: ${cad.model.layers.find((l) => l.id === h.layerId)?.name ?? h.layerId}`);
      }
    } else {
      log("LIST: nothing selected.", "error");
    }
    return;
  }

  // FORWARD <pno> <bearing> <distance>
  const fwd = upper.match(/^F(?:ORWARD)?\s+(\S+)\s+(\S+)\s+(\S+)$/);
  if (fwd) {
    const start = findPoint(cad, fwd[1]);
    const az = parseBearing(fwd[2]);
    const dist = parseFloat(fwd[3]);
    if (!start) { log("FORWARD: start point not found.", "error"); return; }
    if (az == null) { log("FORWARD: invalid bearing.", "error"); return; }
    if (!Number.isFinite(dist) || dist <= 0) { log("FORWARD: distance must be positive.", "error"); return; }
    const res = forward(start, az, dist);
    const p = cad.addPoint({ pointNo: cad.nextPointNo(), n: res.n, e: res.e, z: start.z, code: "FWD" });
    log(
      `Forward point ${p.pointNo}: ${axis.first} ${fmtCoord(res.e)} ${axis.second} ${fmtCoord(res.n)} ` +
        `from ${start.pointNo} @ ${fmtBearing(az, bearingFormat)} · ${fmtDistance(dist)} m`,
    );
    return;
  }

  // Coordinate entry "N,E" or "N,E,Z".
  const coordMatch = text.match(/^(-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)(?:[ ,]+(-?\d+(?:\.\d+)?))?$/);
  if (coordMatch) {
    const n = parseFloat(coordMatch[1]);
    const e = parseFloat(coordMatch[2]);
    const z = coordMatch[3] != null ? parseFloat(coordMatch[3]) : null;
    const created = cad.addPoint({ pointNo: cad.nextPointNo(), n, e, z, code: "" });
    log(`Point ${created.pointNo}: ${axis.first} ${fmtCoord(e)} ${axis.second} ${fmtCoord(n)}`);
    return;
  }

  // INVERSE p1 p2.
  const inv = upper.match(/^INV(?:ERSE)?\s+(\S+)\s+(\S+)$/);
  if (inv) {
    const a = findPoint(cad, inv[1]);
    const b = findPoint(cad, inv[2]);
    if (!a || !b) { log("INVERSE: point(s) not found.", "error"); return; }
    const r = inverse(a, b);
    log(`Inverse ${inv[1]}→${inv[2]}: ${fmtBearing(r.azimuth, bearingFormat)} · ${fmtDistance(r.distance)} m`);
    return;
  }

  // AREA / AA — area + perimeter of selected closed linework, hatch, or circle.
  if (upper === "AREA" || upper === "AA") {
    const sel = cad.selection;
    if (sel.type === "linework" && sel.id) {
      const lw = cad.model.linework.find((x) => x.id === sel.id);
      if (lw) {
        const area = lw.closed ? polygonArea(lw.vertices) : 0;
        const len = polylineLength(lw.vertices);
        log(`Area: ${Math.abs(area).toFixed(2)} m² · perimeter ${fmtDistance(len)} m`);
        return;
      }
    }
    if (sel.type === "hatch" && sel.id) {
      const h = cad.model.hatches.find((x) => x.id === sel.id);
      if (h) {
        log(`Area: ${Math.abs(polygonArea(h.vertices)).toFixed(2)} m²`);
        return;
      }
    }
    if (sel.type === "circle" && sel.id) {
      const c = cad.model.circles.find((x) => x.id === sel.id);
      if (c) {
        const area = Math.PI * c.radius * c.radius;
        const circum = 2 * Math.PI * c.radius;
        log(`Area: ${area.toFixed(2)} m² · circumference ${fmtDistance(circum)} m`);
        return;
      }
    }
    if (sel.type === "ellipse" && sel.id) {
      const el = cad.model.ellipses.find((x) => x.id === sel.id);
      if (el) {
        const area = Math.PI * el.semiMajor * el.semiMinor;
        log(`Area: ${area.toFixed(2)} m²`);
        return;
      }
    }
    log("AREA: select a closed boundary, hatch, circle, or ellipse first.", "error");
    return;
  }

  // HATCH — convert a selected closed boundary into a filled hatch.
  if (upper === "HATCH" || upper === "H") {
    const sel = cad.selection;
    if (sel.type === "linework" && sel.id) {
      const lw = cad.model.linework.find((x) => x.id === sel.id);
      if (lw && lw.closed && lw.vertices.length >= 3) {
        cad.ensureLayerById("HATCHES");
        const created = cad.addHatch({
          vertices: lw.vertices,
          holes: [],
          layerId: "HATCHES",
          color: lw.color ?? null,
        });
        log(`Hatch created on HATCHES layer: ${created.vertices.length} vertices · ${Math.abs(polygonArea(created.vertices)).toFixed(2)} m²`);
        return;
      }
    }
    log("HATCH: select a single closed boundary first.", "error");
    return;
  }

  // LAYER list
  if (upper === "LAYER" || upper === "LA") {
    const layers = cad.model.layers;
    const info = layers.map((l) => `${l.name}${l.locked ? " (locked)" : ""}${!l.visible ? " (off)" : ""}`).join(", ");
    log(`Layers: ${info}`);
    return;
  }

  log(`Unknown command: ${text}`, "error");
}

function findPoint(cad: UseCadModel, pno: string): SurveyPoint | null {
  return cad.model.points.find((x) => x.pointNo === pno.trim()) ?? null;
}
