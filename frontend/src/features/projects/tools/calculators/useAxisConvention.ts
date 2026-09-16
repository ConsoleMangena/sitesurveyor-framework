import { useContext, useMemo } from "react";
import type { AxisConvention } from "../../components/cad/cadSettings.ts";
import { axisLabels } from "../../components/cad/cadSettings.ts";
import { AxisConventionContext } from "./AxisConventionContext.ts";

/** Hook for computation tools to read the project's axis-convention labels.
 *
 * Returns the Easting/Northing labels plus the order they should be read in,
 * so a tool can display "Start Y / Start X" in Gauss mode or "Start X / Start Y"
 * in UTM/international mode.
 */
export function useAxisLabels() {
  const convention = useContext(AxisConventionContext);
  return useMemo(() => axisLabels(convention), [convention]);
}

export function useAxisConvention(): AxisConvention {
  return useContext(AxisConventionContext);
}
