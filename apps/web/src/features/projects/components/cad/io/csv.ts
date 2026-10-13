/**
 * CSV import/export for survey points.
 *
 * Default field order is the Southern-African surveyor layout: P,Y,X,Z,Code
 * (PointNo, Y/Easting, X/Northing, Z/Elevation, Code), matching the Y=Easting,
 * X=Northing convention used throughout the app (see `fmtPointRef` and the DXF
 * writer). A header row is auto-detected and skipped.
 */
import type { SurveyPoint } from "../cadModel.ts";

export type ParsedPoint = Omit<SurveyPoint, "id" | "layerId">;

export interface CsvParseResult {
  points: ParsedPoint[];
  skipped: number;
  errors: string[];
}

function looksNumeric(v: string | undefined | null): boolean {
  if (v == null) return false;
  // Accept +1, .5, 1e3-style scientific notation as well as plain decimals.
  return /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/.test(v.trim());
}

/** Trim + collapse a raw CSV line for use in error messages. */
function previewLine(line: string, max = 80): string {
  const t = line.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export interface CsvColumnMapping {
  pointNo: number;
  easting: number;
  northing: number;
  elevation: number | null;
  code: number | null;
}

export function parsePointsCsv(
  text: string,
  mapping?: CsvColumnMapping,
  hasHeader?: boolean,
  delimiter?: string,
): CsvParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const points: ParsedPoint[] = [];
  const errors: string[] = [];
  let skipped = 0;

  // When the caller detected a delimiter (typically ";" for decimal-comma
  // exports), split ONLY on it — splitting on commas as well would explode
  // "45,002" into two columns and shift every mapping. With a non-comma
  // delimiter, a comma inside a numeric cell is a DECIMAL point
  // (decimal-comma locale); normalize it to a dot before parseFloat.
  const splitCols = (line: string): string[] =>
    (delimiter ? line.split(delimiter) : line.split(/[,\t;]/)).map((c) => c.trim());
  const parseNum = (raw: string): number =>
    delimiter && delimiter !== "," ? parseFloat(raw.replace(/,/g, ".")) : parseFloat(raw);
  const numericWithDelimiter = (raw: string | undefined | null): boolean =>
    looksNumeric(delimiter && delimiter !== "," ? raw?.replace(/,/g, ".") : raw);

  /**
   * First-row tolerance: if the first data row's E and N columns are both
   * non-numeric, it is almost certainly a header the user forgot to tick
   * ("First row is headers"). Silently skip it rather than erroring — the
   * user gets a successful import instead of a confusing "Line 1: invalid
   * X/Y" message. This is safe because no valid data row would have
   * non-numeric Easting/Northing.
   */
  const firstRowIsLikelyHeader = (cols: string[]): boolean => {
    if (lines.length === 0) return false;
    if (mapping) {
      const eRaw = cols[mapping.easting] ?? "";
      const nRaw = cols[mapping.northing] ?? "";
      return !numericWithDelimiter(eRaw) && !numericWithDelimiter(nRaw);
    }
    return !numericWithDelimiter(cols[1]) && !numericWithDelimiter(cols[2]);
  };

  lines.forEach((line, idx) => {
    const cols = splitCols(line);
    if (cols.length < 2) {
      skipped += 1;
      return;
    }

    if (mapping) {
      // Mapped import: skip the header row when present.
      if (hasHeader && idx === 0) return;
      // First-row tolerance: silently skip a likely header.
      if (!hasHeader && idx === 0 && firstRowIsLikelyHeader(cols)) {
        return;
      }
      const col = (i: number) => cols[i] ?? "";
      const eRaw = col(mapping.easting);
      const nRaw = col(mapping.northing);
      const e = parseNum(eRaw);
      const n = parseNum(nRaw);
      if (!Number.isFinite(n) || !Number.isFinite(e)) {
        errors.push(
          `Line ${idx + 1}: invalid X/Y — "${previewLine(line)}"`,
        );
        skipped += 1;
        return;
      }
      const zRaw = mapping.elevation == null ? "" : col(mapping.elevation);
      const z = zRaw && numericWithDelimiter(zRaw) ? parseNum(zRaw) : null;
      const codeRaw = mapping.code == null ? "" : col(mapping.code);
      const pno = col(mapping.pointNo);
      points.push({
        pointNo: pno || String(idx + 1),
        n,
        e,
        z,
        code: codeRaw,
      });
      return;
    }

    // Header detection: a genuine header row has non-numeric labels across
    // its leading columns (e.g. "PointNo,Y,X"). A data row with a
    // numeric point number but unparseable N/E is NOT a header; it must be
    // reported as an error rather than silently skipped. (looksNumeric is
    // undefined-safe; short rows simply fail the check and parse as data.)
    if (
      idx === 0 &&
      !looksNumeric(cols[0]) &&
      !looksNumeric(cols[1]) &&
      !looksNumeric(cols[2])
    ) {
      return; // skip header silently
    }
    // Column order is PointNo, Y(Easting), X(Northing), Z, Code.
    const [pno, eRaw, nRaw, zRaw, code] = cols;
    const e = parseNum(eRaw);
    const n = parseNum(nRaw);
    if (!Number.isFinite(n) || !Number.isFinite(e)) {
      errors.push(
        `Line ${idx + 1}: invalid X/Y — "${previewLine(line)}"`,
      );
      skipped += 1;
      return;
    }
    const z = zRaw && numericWithDelimiter(zRaw) ? parseNum(zRaw) : null;
    points.push({
      pointNo: pno || String(idx + 1),
      n,
      e,
      z,
      code: code ?? "",
    });
  });

  return { points, skipped, errors };
}

export function pointsToCsv(points: SurveyPoint[]): string {
  // Y = Easting, X = Northing (Southern-African convention).
  const header = "PointNo,Y,X,Z,Code";
  const rows = points.map((p) =>
    [p.pointNo, p.e.toFixed(4), p.n.toFixed(4), p.z == null ? "" : p.z.toFixed(4), p.code]
      .join(","),
  );
  return [header, ...rows].join("\n");
}

