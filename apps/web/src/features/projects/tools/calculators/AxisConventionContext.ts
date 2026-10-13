import { createContext } from "react";
import type { AxisConvention } from "../../components/cad/cadSettings.ts";

export const AxisConventionContext = createContext<AxisConvention>("yx");
