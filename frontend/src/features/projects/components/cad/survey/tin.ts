/**
 * TIN (Triangulated Irregular Network) helper.
 *
 * Wraps the `delaunator` library so the rest of the app depends on a small,
 * survey-oriented API rather than the raw triangulation primitive. A TIN is the
 * basis for surface (DTM/DEM) volume computation, exactly as used by Leica
 * Infinity, Trimble Business Center and GEOVIA Surpac.
 */
import Delaunator from "delaunator";
import type { NEZ } from "./cogo.ts";

export interface Tin {
  /** The input vertices (X,Y,Z), index-aligned with the triangle list. */
  points: NEZ[];
  /** Flat triangle index array: i0,i1,i2, i3,i4,i5, … into `points`. */
  triangles: Uint32Array;
}

/**
 * Build a Delaunay TIN from 3D survey points. Triangulation is performed on the
 * plan (X = Easting, Y = Northing); Z is carried for volume integration.
 * Requires at least three non-collinear points.
 */
export function buildTin(points: NEZ[]): Tin {
  if (points.length < 3) {
    return { points, triangles: new Uint32Array(0) };
  }
  // Delaunator expects [x0,y0, x1,y1, …]; we triangulate on Easting/Northing.
  const coords = new Float64Array(points.length * 2);
  for (let i = 0; i < points.length; i++) {
    coords[i * 2] = points[i].e;
    coords[i * 2 + 1] = points[i].n;
  }
  const d = new Delaunator(coords);
  return { points, triangles: Uint32Array.from(d.triangles) };
}
