/**
 * Survey report generator (coordinate list, traverse summary, surface
 * summary, cut/fill volume report).
 *
 * Opens in a styled, printable window so the surveyor can save as PDF or
 * hand directly to a client.
 */
import type { CadModelState, SurveySurface } from "../cadModel.ts";
import { fmtCoord, fmtArea } from "../survey/format.ts";
import { planArea as computePlanArea } from "../survey/surface.ts";
import type { TerrainStats } from "../survey/terrain.ts";
import { axisBadgeLabels, type AxisConvention } from "../cadSettings.ts";

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtVol(v: number): string {
  return v.toFixed(2);
}

/* ── Full survey report (coordinate list + traverse + surfaces + cut/fill) ── */

export function buildSurveyReport(
  projectName: string,
  projectId: string,
  model: CadModelState,
  axisConvention: AxisConvention = "yx",
): string {
  const axis = axisBadgeLabels(axisConvention);
  const sections: string[] = [];

  // ── Header ──────────────────────────────────────────────────────────────
  sections.push(reportHeader(projectName, projectId));

  // ── Coordinate list ─────────────────────────────────────────────────────
  sections.push(coordinateListSection(model, axis));

  // ── Surface summaries ───────────────────────────────────────────────────
  if (model.surfaces.length > 0) {
    sections.push(surfaceSummarySection(model.surfaces));
  }

  // ── Cut / fill volume reports ───────────────────────────────────────────
  const cutFillSurfaces = model.surfaces.filter((s) => s.cutFill);
  if (cutFillSurfaces.length > 0) {
    sections.push(cutFillSection(cutFillSurfaces));
  }

  return sections.join("");
}

/* ── Cut/fill-only report (for the dedicated Surface ribbon button) ─────── */

export function buildCutFillReport(
  projectName: string,
  projectId: string,
  model: CadModelState,
): string {
  const sections: string[] = [];
  sections.push(reportHeader(projectName, projectId, "EARTHWORKS VOLUME REPORT"));

  const cutFillSurfaces = model.surfaces.filter((s) => s.cutFill);
  if (cutFillSurfaces.length > 0) {
    sections.push(cutFillSection(cutFillSurfaces));
  } else {
    sections.push(
      `<section class="report-section"><p class="report-empty">No cut/fill computations found. Run <strong>Vol → RL</strong> or <strong>Vol Δ</strong> first.</p></section>`,
    );
  }

  return sections.join("");
}

/* ── Terrain analysis report ────────────────────────────────────────────── */

export function buildTerrainReport(
  projectName: string,
  projectId: string,
  surfaceName: string,
  stats: TerrainStats,
): string {
  const rugosity = stats.planArea > 0 ? stats.surfaceArea / stats.planArea : 1;
  return (
    reportHeader(projectName, projectId, "TERRAIN ANALYSIS REPORT") +
    `
<section class="report-section">
  <h2>${escapeHtml(surfaceName)}</h2>
  <table class="report-table report-table-kv">
    <tbody>
      <tr><td>Plan area</td><td class="num">${fmtArea(stats.planArea)}</td></tr>
      <tr><td>True 3D surface area</td><td class="num">${fmtArea(stats.surfaceArea)}</td></tr>
      <tr><td>Rugosity (3D / plan)</td><td class="num">${rugosity.toFixed(4)}</td></tr>
      <tr><td>Mean slope</td><td class="num">${stats.meanSlopeDeg.toFixed(2)}°</td></tr>
      <tr><td>Min slope</td><td class="num">${stats.minSlopeDeg.toFixed(2)}°</td></tr>
      <tr><td>Max slope</td><td class="num">${stats.maxSlopeDeg.toFixed(2)}°</td></tr>
      <tr><td>Min elevation</td><td class="num">${fmtCoord(stats.minElevation)} m</td></tr>
      <tr><td>Max elevation</td><td class="num">${fmtCoord(stats.maxElevation)} m</td></tr>
      <tr><td>Relief (max − min)</td><td class="num">${fmtCoord(stats.maxElevation - stats.minElevation)} m</td></tr>
      <tr><td>Triangles</td><td class="num">${stats.triangles}</td></tr>
    </tbody>
  </table>
</section>`
  );
}

/* ── Section builders ──────────────────────────────────────────────────── */

function reportHeader(project: string, projectId: string, title = "SURVEY REPORT"): string {
  return `
<header class="report-header">
  <h1>${escapeHtml(title)}</h1>
  <div class="report-meta">
    <span><strong>Project:</strong> ${escapeHtml(project)} (${escapeHtml(projectId)})</span>
    <span><strong>Generated:</strong> ${new Date().toLocaleString()}</span>
  </div>
</header>`;
}

function coordinateListSection(
  model: CadModelState,
  axis: ReturnType<typeof axisBadgeLabels>,
): string {
  if (model.points.length === 0) {
    return `<section class="report-section"><h2>Coordinate List</h2><p class="report-empty">No points in the drawing.</p></section>`;
  }
  let rows = "";
  for (const p of model.points) {
    rows += `<tr>
      <td>${escapeHtml(p.pointNo)}</td>
      <td class="num">${fmtCoord(p.e)}</td>
      <td class="num">${fmtCoord(p.n)}</td>
      <td class="num">${p.z == null ? "—" : fmtCoord(p.z)}</td>
      <td>${escapeHtml(p.code)}</td>
    </tr>`;
  }
  return `
<section class="report-section">
  <h2>Coordinate List <span class="report-count">(${model.points.length} points)</span></h2>
  <table class="report-table">
    <thead><tr><th>Pt#</th><th>${axis.first}</th><th>${axis.second}</th><th>Z (RL)</th><th>Code</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

function surfaceSummarySection(surfaces: SurveySurface[]): string {
  let rows = "";
  for (const s of surfaces) {
    const area = computePlanArea({ points: s.points, triangles: s.triangles });
    const type = s.cutFill ? "Cut/Fill" : "TIN";
    rows += `<tr>
      <td>${escapeHtml(s.name)}</td>
      <td>${type}</td>
      <td class="num">${s.points.length}</td>
      <td class="num">${s.triangles.length}</td>
      <td class="num">${fmtArea(area)}</td>
    </tr>`;
  }
  return `
<section class="report-section">
  <h2>Surface Summary <span class="report-count">(${surfaces.length} surface${surfaces.length === 1 ? "" : "s"})</span></h2>
  <table class="report-table">
    <thead><tr><th>Name</th><th>Type</th><th>Points</th><th>Triangles</th><th>Plan Area</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

function cutFillSection(surfaces: SurveySurface[]): string {
  let html = "";
  for (const s of surfaces) {
    const cf = s.cutFill!;
    const area = computePlanArea({ points: s.points, triangles: s.triangles });

    // Aggregate totals
    let totalCut = 0;
    let totalFill = 0;
    for (const t of cf.triangles) {
      if (t.volume >= 0) totalCut += t.volume;
      else totalFill += -t.volume;
    }
    const net = totalCut - totalFill;

    // Mode label
    const modeLabel =
      cf.mode === "elevation"
        ? `Surface vs Reference Level ${cf.reference != null ? cf.reference.toFixed(2) : "—"} m`
        : "Surface vs Surface (between)";

    const chartMax = Math.max(totalCut, totalFill, 1);
    const cutPct = (totalCut / chartMax) * 100;
    const fillPct = (totalFill / chartMax) * 100;

    html += `
<section class="report-section report-cutfill">
  <div class="report-cutfill-header">
    <div>
      <h2>${escapeHtml(s.name)}</h2>
      <p class="report-mode">${modeLabel}</p>
    </div>
    <span class="report-cutfill-badge ${net >= 0 ? "cut" : "fill"}">${net >= 0 ? "NET CUT" : "NET FILL"}</span>
  </div>

  <div class="report-summary-cards">
    <div class="report-summary-card cut">
      <div class="value">${fmtVol(totalCut)} <span>m³</span></div>
      <div class="label">Total Cut</div>
    </div>
    <div class="report-summary-card fill">
      <div class="value">${fmtVol(totalFill)} <span>m³</span></div>
      <div class="label">Total Fill</div>
    </div>
    <div class="report-summary-card net">
      <div class="value">${fmtVol(Math.abs(net))} <span>m³</span></div>
      <div class="label">Net ${net >= 0 ? "Cut" : "Fill"}</div>
    </div>
  </div>

  <div class="report-volume-chart">
    <div class="report-bar-row">
      <span class="report-bar-label">Cut</span>
      <div class="report-bar-track"><div class="report-bar report-bar-cut" style="width: ${cutPct.toFixed(1)}%"></div></div>
      <span class="report-bar-value">${fmtVol(totalCut)} m³</span>
    </div>
    <div class="report-bar-row">
      <span class="report-bar-label">Fill</span>
      <div class="report-bar-track"><div class="report-bar report-bar-fill" style="width: ${fillPct.toFixed(1)}%"></div></div>
      <span class="report-bar-value">${fmtVol(totalFill)} m³</span>
    </div>
  </div>

  <div class="report-secondary-stats">
    <div class="report-stat"><span>Plan Area</span><strong>${fmtArea(area)}</strong></div>
    <div class="report-stat"><span>Max Cut Depth</span><strong>${cf.maxCut.toFixed(3)} m</strong></div>
    <div class="report-stat"><span>Max Fill Depth</span><strong>${cf.maxFill.toFixed(3)} m</strong></div>
    <div class="report-stat"><span>Triangles</span><strong>${cf.triangles.length.toLocaleString()}</strong></div>
  </div>`;

    // Per-triangle detail table (capped at 200 rows for readability)
    const MAX_DETAIL_ROWS = 200;
    const sorted = [...cf.triangles]
      .map((t, i) => ({ ...t, idx: i }))
      .sort((a, b) => Math.abs(b.volume) - Math.abs(a.volume));
    const shown = sorted.slice(0, MAX_DETAIL_ROWS);

    let detailRows = "";
    for (const t of shown) {
      const triArea = t.volume !== 0 && t.delta !== 0 ? Math.abs(t.volume / t.delta) : 0;
      const cls = t.delta > 0.001 ? "cut-row" : t.delta < -0.001 ? "fill-row" : "";
      detailRows += `<tr class="${cls}">
        <td class="num">${t.idx + 1}</td>
        <td class="num">${triArea.toFixed(2)}</td>
        <td class="num">${t.delta >= 0 ? "+" : ""}${t.delta.toFixed(3)}</td>
        <td class="num">${t.volume >= 0 ? "+" : ""}${t.volume.toFixed(3)}</td>
        <td class="num">${t.delta > 0.001 ? "CUT" : t.delta < -0.001 ? "FILL" : "—"}</td>
      </tr>`;
    }

    html += `
  <h3>Triangle Detail <span class="report-count">(top ${shown.length} by volume${sorted.length > MAX_DETAIL_ROWS ? `, ${sorted.length - MAX_DETAIL_ROWS} more omitted` : ""})</span></h3>
  <table class="report-table report-detail">
    <thead><tr><th>Tri #</th><th>Area (m²)</th><th>Δ Height (m)</th><th>Volume (m³)</th><th>Type</th></tr></thead>
    <tbody>${detailRows}</tbody>
  </table>
</section>`;
  }

  return html;
}

/* ── Report window ─────────────────────────────────────────────────────── */

export const REPORT_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
    font-size: 11px;
    line-height: 1.5;
    color: #1e293b;
    background: #fff;
    padding: 32px 40px;
    max-width: 1100px;
    margin: 0 auto;
  }

  .report-header {
    border-bottom: 3px solid #0f172a;
    padding-bottom: 12px;
    margin-bottom: 24px;
  }
  .report-header h1 {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: #0f172a;
  }
  .report-meta {
    display: flex;
    gap: 24px;
    margin-top: 6px;
    font-size: 11px;
    color: #475569;
  }

  .report-section {
    margin-bottom: 28px;
    page-break-inside: avoid;
  }
  .report-section h2 {
    font-size: 14px;
    font-weight: 600;
    color: #0f172a;
    border-bottom: 1.5px solid #cbd5e1;
    padding-bottom: 4px;
    margin-bottom: 10px;
  }
  .report-section h3 {
    font-size: 12px;
    font-weight: 600;
    color: #334155;
    margin-top: 16px;
    margin-bottom: 6px;
  }
  .report-count {
    font-weight: 400;
    color: #64748b;
    font-size: 0.85em;
  }
  .report-mode {
    font-size: 11px;
    color: #475569;
    font-style: italic;
  }
  .report-empty {
    color: #94a3b8;
    font-style: italic;
  }
  .report-cutfill-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 10px;
    margin-bottom: 16px;
  }
  .report-cutfill-header h2 {
    font-size: 16px;
    font-weight: 700;
    color: #0f172a;
    border: none;
    padding: 0;
    margin-bottom: 2px;
  }
  .report-cutfill-badge {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 5px 10px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .report-cutfill-badge.cut { background: #fee2e2; color: #b91c1c; }
  .report-cutfill-badge.fill { background: #dbeafe; color: #1d4ed8; }

  .report-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
  }
  .report-table th {
    background: #f1f5f9;
    font-weight: 600;
    text-align: left;
    padding: 5px 8px;
    border-bottom: 1.5px solid #94a3b8;
    color: #334155;
    white-space: nowrap;
  }
  .report-table td {
    padding: 3px 8px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: top;
  }
  .report-table td.num,
  .report-table th.num {
    text-align: right;
    font-feature-settings: 'tnum';
  }
  .report-table tbody tr:hover {
    background: #f8fafc;
  }

  .report-summary-cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 20px;
  }
  .report-summary-card {
    border-radius: 10px;
    padding: 18px 12px;
    text-align: center;
    box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  }
  .report-summary-card.cut { background: linear-gradient(180deg, #fef2f2 0%, #fee2e2 100%); border: 1px solid #fecaca; }
  .report-summary-card.fill { background: linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%); border: 1px solid #bfdbfe; }
  .report-summary-card.net { background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%); border: 1px solid #e2e8f0; }
  .report-summary-card .value {
    font-size: 24px;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.15;
  }
  .report-summary-card.cut .value { color: #b91c1c; }
  .report-summary-card.fill .value { color: #1d4ed8; }
  .report-summary-card .value span {
    font-size: 13px;
    font-weight: 500;
    color: #64748b;
    margin-left: 2px;
  }
  .report-summary-card .label {
    font-size: 10px;
    font-weight: 600;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-top: 6px;
  }

  .report-volume-chart {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 20px;
  }
  .report-bar-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }
  .report-bar-row:last-child { margin-bottom: 0; }
  .report-bar-label {
    width: 38px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #475569;
  }
  .report-bar-track {
    flex: 1;
    height: 18px;
    background: #e2e8f0;
    border-radius: 999px;
    overflow: hidden;
  }
  .report-bar {
    height: 100%;
    border-radius: 999px;
    min-width: 2px;
  }
  .report-bar-cut { background: linear-gradient(90deg, #f87171, #dc2626); }
  .report-bar-fill { background: linear-gradient(90deg, #60a5fa, #2563eb); }
  .report-bar-value {
    width: 90px;
    text-align: right;
    font-size: 11px;
    font-weight: 600;
    color: #334155;
    font-variant-numeric: tabular-nums;
  }

  .report-secondary-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 20px;
  }
  .report-stat {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px 10px;
    text-align: center;
  }
  .report-stat span {
    display: block;
    font-size: 9px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 4px;
  }
  .report-stat strong {
    display: block;
    font-size: 13px;
    font-weight: 700;
    color: #0f172a;
  }

  .report-table-kv {
    max-width: 480px;
  }
  .report-table-kv td:first-child {
    font-weight: 500;
    color: #475569;
    width: 200px;
  }

  .report-volume-summary .cut-row td { color: #dc2626; }
  .report-volume-summary .fill-row td { color: #2563eb; }
  .report-volume-summary .net-row td { font-weight: 700; color: #0f172a; }
  .net-label { font-weight: 400; color: #64748b; font-size: 0.9em; }

  .report-detail .cut-row td:nth-child(4),
  .report-detail .cut-row td:nth-child(5) { color: #dc2626; }
  .report-detail .fill-row td:nth-child(4),
  .report-detail .fill-row td:nth-child(5) { color: #2563eb; }

  @media print {
    body { padding: 16px 20px; font-size: 9.5px; }
    .report-header { margin-bottom: 16px; }
    .report-section { margin-bottom: 18px; }
    .report-table th { background: #f1f5f9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .report-summary-card, .report-volume-chart, .report-secondary-stats, .report-cutfill-badge { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .report-summary-card.cut { background: #fee2e2 !important; }
    .report-summary-card.fill { background: #dbeafe !important; }
    .report-bar-cut { background: #dc2626 !important; }
    .report-bar-fill { background: #2563eb !important; }
    .report-detail .cut-row td:nth-child(4),
    .report-detail .cut-row td:nth-child(5) { color: #dc2626 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .report-detail .fill-row td:nth-child(4),
    .report-detail .fill-row td:nth-child(5) { color: #2563eb !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

export function openReportWindow(title: string, bodyHtml: string): void {
  const win = window.open("", "_blank", "width=900,height=960");
  if (!win) return;
  win.document.write(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>${REPORT_CSS}</style>
</head>
<body>${bodyHtml}</body>
</html>`,
  );
  win.document.close();
  win.focus();
}
