import type { CadModelState, CadSelection } from "../cadModel.ts";
import { sampleZ } from "../survey/surface.ts";
import { inverse, polylineLength } from "../survey/cogo.ts";
import { pickSurface, type WorkflowApi, type WorkflowServices } from "./workflowCtx.ts";

export async function runExtractProfile(
  model: CadModelState,
  selection: CadSelection,
  api: WorkflowApi,
  services: WorkflowServices,
): Promise<void> {
  if (model.surfaces.length === 0) { services.log("Profile: build a TIN surface first (Surface ▸ Build TIN).", "error"); return; }
  const sel = selection;
  const lw = sel.type === "linework" && sel.id
    ? model.linework.find((l) => l.id === sel.id)
    : undefined;
  if (!lw || lw.vertices.length < 2) {
    services.log("Profile: select a polyline or boundary to section along.", "error");
    return;
  }
  const surface = model.surfaces.length === 1
    ? model.surfaces[0]
    : await pickSurface(model.surfaces, services.dialog, "Choose surface to sample for the long section");
  if (!surface) return;
  const tin = { points: surface.points, triangles: surface.triangles };

  const totalLen = polylineLength(lw.vertices);
  const defInterval = Math.max(1, Math.round(totalLen / 60));
  const intRaw = await services.dialog.prompt(
    `Sampling interval (m). Chain length ${totalLen.toFixed(2)} m:`,
    String(defInterval),
  );
  if (intRaw == null) return;
  const interval = parseFloat(intRaw);
  if (!Number.isFinite(interval) || interval <= 0) {
    services.log("Profile: invalid interval.", "error");
    return;
  }

  // Walk the chain: sample at every even interval AND at every vertex
  // chainage (bends must appear in the profile).
  const stations: { ch: number; z: number | null }[] = [];
  let chain = 0;
  for (let i = 0; i < lw.vertices.length; i++) {
    if (i > 0) chain += inverse(lw.vertices[i - 1], lw.vertices[i]).distance;
    stations.push({ ch: chain, z: sampleZ(tin, lw.vertices[i].n, lw.vertices[i].e) });
    if (i + 1 < lw.vertices.length) {
      const segLen = inverse(lw.vertices[i], lw.vertices[i + 1]).distance;
      if (segLen <= 0) continue;
      for (let s = Math.ceil((chain + 1e-6) / interval) * interval; s < chain + segLen - 1e-9; s += interval) {
        const t = (s - chain) / segLen;
        const vx = lw.vertices[i];
        const vy = lw.vertices[i + 1];
        stations.push({ ch: s, z: sampleZ(tin, vx.n + (vy.n - vx.n) * t, vx.e + (vy.e - vx.e) * t) });
      }
    }
  }
  stations.sort((a, b) => a.ch - b.ch);
  const sampled = stations.filter((s) => s.z != null);
  if (sampled.length < 2) {
    services.log("Profile: the section line falls (mostly) outside the surface — fewer than 2 samples.", "error");
    return;
  }

  let zMin = Infinity, zMax = -Infinity, chMax = 0;
  for (const s of sampled) {
    if (s.z! < zMin) zMin = s.z!;
    if (s.z! > zMax) zMax = s.z!;
    if (s.ch > chMax) chMax = s.ch;
  }
  const zPad = Math.max(0.5, (zMax - zMin) * 0.1);
  zMin -= zPad; zMax += zPad;

  // Build a long-section chart as inline SVG for the report window.
  const W = 960, H = 360, ml = 70, mr = 24, mt = 26, mb = 46;
  const px = (ch: number) => ml + (chMax > 0 ? (ch / chMax) : 0) * (W - ml - mr);
  const py = (z: number) => mt + (1 - (z - zMin) / (zMax - zMin)) * (H - mt - mb);
  const zTicks: number[] = [];
  const zStep = (zMax - zMin) / 5;
  for (let i = 0; i <= 5; i++) zTicks.push(zMin + i * zStep);
  const grid = zTicks.map((z) =>
    `<line x1="${ml}" y1="${py(z)}" x2="${W - mr}" y2="${py(z)}" stroke="#d7dde5" stroke-width="0.8"/>` +
    `<text x="${ml - 8}" y="${py(z) + 3.5}" text-anchor="end" font-size="10" fill="#475569">${z.toFixed(2)}</text>`
  ).join("");
  const chTickStep = Math.max(interval * 2, chMax / 8);
  const chTicks: string[] = [];
  for (let ch = 0; ch <= chMax + 1e-6; ch += chTickStep) {
    chTicks.push(
      `<line x1="${px(ch)}" y1="${H - mb}" x2="${px(ch)}" y2="${H - mb + 5}" stroke="#94a3b8" stroke-width="1"/>` +
      `<text x="${px(ch)}" y="${H - mb + 18}" text-anchor="middle" font-size="10" fill="#475569">${ch.toFixed(0)}</text>`,
    );
  }
  // Break the chain into runs of valid samples (gaps stay gaps).
  const runs: string[] = [];
  let run: string[] = [];
  const flush = () => { if (run.length >= 2) runs.push(run.join(" ")); run = []; };
  for (const s of stations) {
    if (s.z == null || s.ch > chMax + 1) { flush(); continue; }
    run.push(`${px(s.ch).toFixed(1)},${py(s.z).toFixed(1)}`);
  }
  flush();
  const paths = runs
    .map((r) => `<polyline points="${r}" fill="none" stroke="#0369a1" stroke-width="1.8" stroke-linejoin="round"/>`)
    .join("");
  const svg =
    `<svg viewBox="0 0 ${W} ${H}" width="100%" style="background:#fff;border:1px solid #d7dde5;border-radius:8px">` +
    grid + chTicks.join("") +
    `<line x1="${ml}" y1="${H - mb}" x2="${W - mr}" y2="${H - mb}" stroke="#334155" stroke-width="1"/>` +
    `<line x1="${ml}" y1="${mt}" x2="${ml}" y2="${H - mb}" stroke="#334155" stroke-width="1"/>` +
    paths +
    `<text x="${ml - 46}" y="${mt - 8}" font-size="11" font-weight="bold" fill="#0f172a">RL (m)</text>` +
    `<text x="${W - mr}" y="${H - mb + 32}" text-anchor="end" font-size="11" font-weight="bold" fill="#0f172a">Chainage (m)</text>` +
    `</svg>`;

  const name = `Long Section — "${surface.name}"`;
  const body =
    `<h1>${name}</h1>` +
    `<p class="muted">Surface: ${surface.name} · interval ${interval} m · ${sampled.length} of ${stations.length} samples inside footprint · ` +
    `RL range ${zMin.toFixed(3)}–${zMax.toFixed(3)} m · chainage ${chMax.toFixed(3)} m</p>` +
    svg +
    `<table><thead><tr><th>Chainage (m)</th><th>RL (m)</th></tr></thead><tbody>` +
    stations
      .map((s) => `<tr><td>${s.ch.toFixed(3)}</td><td>${s.z == null ? "—" : s.z.toFixed(3)}</td></tr>`)
      .join("") +
    `</tbody></table>`;
  services.openReport(name, body);

  // CSV via the project outputs store (and a direct download).
  const csvRows: (string | number)[][] = [
    ["Chainage", "RL"],
    ...stations.map((s) => [s.ch.toFixed(3), s.z == null ? "" : s.z.toFixed(3)]),
  ];
  services.downloadCsv("long-section.csv", csvRows);
  services.addOutput({
    label: "Long Section (Chainage/Level)",
    description: `${stations.length} stations, interval ${interval} m`,
    fileName: `long-section-${services.projectDbId}.csv`,
    mimeType: "text/csv",
    content: csvRows.map((r) => r.join(",")).join("\n"),
  });
  services.log(`Long section: ${sampled.length}/${stations.length} samples, RL ${zMin.toFixed(2)}–${zMax.toFixed(2)} m — chart opened + CSV saved.`);
}
