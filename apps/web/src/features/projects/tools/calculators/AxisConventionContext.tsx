import { AxisConventionContext } from "./AxisConventionContext.ts";
import type { AxisConvention } from "../../components/cad/cadSettings.ts";

export function AxisConventionProvider({
  convention,
  children,
}: {
  convention: AxisConvention;
  children: React.ReactNode;
}) {
  return (
    <AxisConventionContext.Provider value={convention}>{children}</AxisConventionContext.Provider>
  );
}
