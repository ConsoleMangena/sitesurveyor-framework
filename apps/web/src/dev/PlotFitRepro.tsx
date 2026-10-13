// Dev-only repro harness for the plot dialog preview fit bug.
// Mounted when the app URL contains ?plotrepro (see main.tsx).
import "../styles/cad.css";
import { CadPlotDialog } from "@/features/projects/components/cad/CadPlotDialog";
import type { CadModelState } from "@/features/projects/components/cad/cadModel";
import { DEFAULT_PLOT_OPTIONS, DEFAULT_TITLE_BLOCK, type PlotOptions } from "@/features/projects/components/cad/io/plot";

const model: CadModelState = {
  layers: [{ id: "L1", name: "0", color: "#ff0000", visible: true, locked: false }],
  points: [
    { id: "p1", pointNo: "1", n: 501000, e: 284500, z: 100, code: "b1", layerId: "L1" },
    { id: "p2", pointNo: "2", n: 501200, e: 284500, z: 101, code: "b2", layerId: "L1" },
    { id: "p3", pointNo: "3", n: 501200, e: 284700, z: 99, code: "b3", layerId: "L1" },
  ],
  linework: [
    {
      id: "lw1",
      kind: "boundary",
      layerId: "L1",
      closed: true,
      vertices: [
        { n: 501000, e: 284500 },
        { n: 501200, e: 284500 },
        { n: 501200, e: 284700 },
        { n: 501000, e: 284700 },
      ],
    },
  ],
  texts: [],
  surfaces: [],
  arcs: [],
  circles: [],
  ellipses: [],
  dimensions: [],
  hatches: [],
  activeLayerId: "L1",
};

export function PlotFitRepro() {
  const seed = DEFAULT_TITLE_BLOCK("Fit Repro", "prj-fit", "Acme", "UTM 36S");
  const opts: PlotOptions = { ...DEFAULT_PLOT_OPTIONS(seed), paper: "A4", orientation: "landscape" };
  return (
    <CadPlotDialog
      model={model}
      bearingFormat="azimuth"
      axisConvention="yx"
      initialOptions={opts}
      fileStem="fit-repro"
      onClose={() => undefined}
      log={(t) => console.log("[repro]", t)}
    />
  );
}
