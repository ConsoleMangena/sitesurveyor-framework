//! Contour generation from a TIN using linear interpolation across triangle
//! edges (the "marching triangles" approach).
//!
//! For each contour elevation, every triangle is intersected by the horizontal
//! plane Z = elevation. A triangle contributes a single line segment when the
//! plane cuts exactly two of its edges. Segments are emitted per elevation; a
//! lightweight chaining pass joins shared endpoints into longer polylines so
//! downstream rendering/DXF export produces clean linework.

use crate::{ContourLine, SurveyError, Tin, Vertex};

/// Generate contour isolines from a regular elevation grid using the GeoRust
/// `contour` crate (marching squares, a d3-contour port).
///
/// This is the proper library-backed path for raster/DEM sources (e.g. a
/// GeoTIFF read via GDAL). For irregular TIN surfaces, prefer
/// [`generate_contours`], which interpolates exactly along triangle edges.
///
/// - `values` is row-major, length `width * height`.
/// - `(origin_e, origin_n)` is the plan coordinate of grid cell (0, 0).
/// - `cell_size` is the ground spacing between adjacent grid cells.
/// - `levels` are the elevations to extract.
///
/// Grid coordinates from the `contour` crate (in cell units) are mapped back to
/// project Easting/Northing: `E = origin_e + col * cell_size`,
/// `N = origin_n + row * cell_size`.
pub fn generate_contours_from_grid(
    values: &[f64],
    width: usize,
    height: usize,
    origin_e: f64,
    origin_n: f64,
    cell_size: f64,
    levels: &[f64],
) -> crate::Result<Vec<ContourLine>> {
    use contour::ContourBuilder;
    use geo_types::Coord;

    if width == 0 || height == 0 {
        return Err(SurveyError::InvalidParameter {
            name: "width/height".into(),
            value: format!("{width}x{height}"),
        });
    }
    if values.len() != width * height {
        return Err(SurveyError::InvalidParameter {
            name: "values.len()".into(),
            value: format!("{} (expected {})", values.len(), width * height),
        });
    }
    if levels.is_empty() {
        return Err(SurveyError::InvalidParameter {
            name: "levels".into(),
            value: "empty".into(),
        });
    }

    let builder = ContourBuilder::new(width, height, true);
    let lines = match builder.lines(values, levels) {
        Ok(lines) => lines,
        Err(e) => {
            return Err(SurveyError::ComputationFailed {
                message: format!("contour crate failed: {e:?}"),
            })
        }
    };

    let to_vertex = |c: &Coord<f64>| Vertex {
        e: origin_e + c.x * cell_size,
        n: origin_n + c.y * cell_size,
    };

    let mut out = Vec::new();
    for line in lines {
        let level = line.threshold();
        for ls in line.geometry() {
            let vertices: Vec<Vertex> = ls.0.iter().map(&to_vertex).collect();
            if vertices.len() >= 2 {
                out.push(ContourLine {
                    elevation: level,
                    vertices,
                });
            }
        }
    }
    Ok(out)
}

/// Generate contours from a TIN at a fixed interval.
///
/// - `interval` must be > 0; otherwise an error is returned.
/// - `base` anchors the contour ladder (e.g. base = 0 gives ..., 95, 100, 105).
/// - Contours are produced for every multiple of `interval` strictly inside the
///   TIN's elevation range.
pub fn generate_contours(tin: &Tin, interval: f64, base: f64) -> crate::Result<Vec<ContourLine>> {
    if interval <= 0.0 {
        return Err(SurveyError::InvalidParameter {
            name: "interval".into(),
            value: interval.to_string(),
        });
    }
    if tin.triangles.is_empty() {
        return Err(SurveyError::DegenerateGeometry {
            reason: "TIN has no triangles".into(),
        });
    }

    let (mut zmin, mut zmax) = (f64::INFINITY, f64::NEG_INFINITY);
    for p in &tin.points {
        zmin = zmin.min(p.z);
        zmax = zmax.max(p.z);
    }
    if !zmin.is_finite() || !zmax.is_finite() {
        return Err(SurveyError::DegenerateGeometry {
            reason: "TIN contains non-finite elevations".into(),
        });
    }
    if zmax <= zmin {
        return Err(SurveyError::DegenerateGeometry {
            reason: "TIN is flat; no contours can be generated".into(),
        });
    }

    // First contour level >= zmin on the base+k*interval ladder.
    let first_k = ((zmin - base) / interval).ceil() as i64;
    let last_k = ((zmax - base) / interval).floor() as i64;

    let mut out = Vec::new();
    for k in first_k..=last_k {
        let level = base + (k as f64) * interval;
        // Skip levels exactly on the extremes (degenerate slivers).
        if level <= zmin || level >= zmax {
            continue;
        }
        let segments = contour_segments_at(tin, level);
        for vertices in chain_segments(segments) {
            if vertices.len() >= 2 {
                out.push(ContourLine {
                    elevation: level,
                    vertices,
                });
            }
        }
    }
    Ok(out)
}

type Seg = (Vertex, Vertex);

/// Classify a scalar relative to a level: -1 below, 0 on, +1 above.
fn sign(z: f64, level: f64, tol: f64) -> i8 {
    if (z - level).abs() <= tol {
        0
    } else if z > level {
        1
    } else {
        -1
    }
}

/// Collect raw (unordered) contour segments at a single elevation.
fn contour_segments_at(tin: &Tin, level: f64) -> Vec<Seg> {
    let mut segments = Vec::new();
    // Tolerance for "on the contour plane" relative to the level magnitude.
    let tol = 1e-9 * level.abs().max(1.0);

    for t in &tin.triangles {
        let a = tin.points[t.a];
        let b = tin.points[t.b];
        let c = tin.points[t.c];

        let sa = sign(a.z, level, tol);
        let sb = sign(b.z, level, tol);
        let sc = sign(c.z, level, tol);

        // All on same side (or all on plane) → no segment.
        if (sa == sb && sb == sc) || (sa == 0 && sb == 0 && sc == 0) {
            continue;
        }

        // Determine the intersection points of the plane with the triangle edges.
        let mut crossings: Vec<Vertex> = Vec::with_capacity(2);

        for (p, q) in [(a, b), (b, c), (c, a)] {
            if let Some(v) = edge_crossing(p.z, q.z, level, p.n, p.e, q.n, q.e, tol) {
                crossings.push(v);
            }
        }

        // Deduplicate near-identical crossings (e.g., a vertex shared by two
        // edges that both report it).
        let deduped = dedup_crossings(&crossings, tol);

        if deduped.len() == 2 {
            segments.push((deduped[0], deduped[1]));
        } else if deduped.len() == 3 {
            // Saddle or vertex-on-plane case: connect the "odd" vertex (the one
            // on the plane or on the opposite side) to the two interpolated
            // points on the opposite edges. We simply emit the two shortest
            // pairings that share the vertex closest to the average of the
            // three points, which correctly resolves the fork in all
            // non-degenerate saddle configurations.
            let mid = Vertex {
                n: (deduped[0].n + deduped[1].n + deduped[2].n) / 3.0,
                e: (deduped[0].e + deduped[1].e + deduped[2].e) / 3.0,
            };
            let closest = (0..3)
                .min_by_key(|&i| {
                    let d = (deduped[i].n - mid.n).hypot(deduped[i].e - mid.e);
                    // Use integer proxy for ordering; distances are small.
                    (d * 1e12) as i64
                })
                .unwrap_or(0);
            let others: Vec<usize> = (0..3).filter(|&i| i != closest).collect();
            segments.push((deduped[closest], deduped[others[0]]));
            segments.push((deduped[closest], deduped[others[1]]));
        }
        // 0 or 1 crossing: degenerate, ignore.
    }
    segments
}

/// Deduplicate crossing vertices within tolerance.
fn dedup_crossings(vs: &[Vertex], tol: f64) -> Vec<Vertex> {
    let mut out: Vec<Vertex> = Vec::with_capacity(vs.len());
    for v in vs {
        if !out.iter().any(|o| (o.n - v.n).hypot(o.e - v.e) < tol) {
            out.push(*v);
        }
    }
    out
}

/// Interpolate the point where Z = level crosses the edge (p -> q), or None.
#[allow(clippy::too_many_arguments)]
fn edge_crossing(
    zp: f64,
    zq: f64,
    level: f64,
    np: f64,
    ep: f64,
    nq: f64,
    eq: f64,
    tol: f64,
) -> Option<Vertex> {
    let dp = zp - level;
    let dq = zq - level;

    // P is exactly on the plane.
    if dp.abs() <= tol {
        return Some(Vertex { n: np, e: ep });
    }
    // Q is exactly on the plane.
    if dq.abs() <= tol {
        return Some(Vertex { n: nq, e: eq });
    }

    // Both on same side (and neither exactly on the plane) -> no crossing.
    if (dp > 0.0 && dq > 0.0) || (dp < 0.0 && dq < 0.0) {
        return None;
    }

    let denom = zp - zq;
    if denom.abs() < 1e-12 {
        return None;
    }
    let t = (zp - level) / denom;
    Some(Vertex {
        n: np + t * (nq - np),
        e: ep + t * (eq - ep),
    })
}

/// Join unordered segments into ordered polylines by matching shared endpoints.
fn chain_segments(segments: Vec<Seg>) -> Vec<Vec<Vertex>> {
    if segments.is_empty() {
        return Vec::new();
    }

    let tol = compute_chain_tol(&segments);
    let mut used = vec![false; segments.len()];
    let mut polylines: Vec<Vec<Vertex>> = Vec::new();

    let close = |x: Vertex, y: Vertex| (x.n - y.n).abs() < tol && (x.e - y.e).abs() < tol;

    // Build an endpoint index for faster lookups: (hash bucket) -> segment indices.
    // The key is the endpoint rounded to integer multiples of tol.
    fn bucket_key(v: &Vertex, tol: f64) -> (i64, i64) {
        (
            (v.n / tol.max(1e-12)).round() as i64,
            (v.e / tol.max(1e-12)).round() as i64,
        )
    }

    let mut endpoint_idx: std::collections::HashMap<(i64, i64), Vec<usize>> =
        std::collections::HashMap::new();
    for (i, (a, b)) in segments.iter().enumerate() {
        endpoint_idx.entry(bucket_key(a, tol)).or_default().push(i);
        endpoint_idx.entry(bucket_key(b, tol)).or_default().push(i);
    }

    for start in 0..segments.len() {
        if used[start] {
            continue;
        }
        used[start] = true;
        let (mut head, mut tail) = (segments[start].0, segments[start].1);
        let mut chain = vec![head, tail];

        // Extend in both directions until no more matches.
        let mut changed = true;
        while changed {
            changed = false;

            for end_factor in [1.0, -1.0] {
                let target = if end_factor > 0.0 { tail } else { head };
                let mk = bucket_key(&target, tol);
                let candidates: Vec<usize> = endpoint_idx
                    .get(&mk)
                    .map(|v| v.iter().copied().filter(|&i| !used[i]).collect())
                    .unwrap_or_default();

                for j in candidates {
                    let (a, b) = segments[j];
                    if close(target, a) {
                        if end_factor > 0.0 {
                            tail = b;
                            chain.push(b);
                        } else {
                            head = b;
                            chain.insert(0, b);
                        }
                        used[j] = true;
                        changed = true;
                        break;
                    } else if close(target, b) {
                        if end_factor > 0.0 {
                            tail = a;
                            chain.push(a);
                        } else {
                            head = a;
                            chain.insert(0, a);
                        }
                        used[j] = true;
                        changed = true;
                        break;
                    }
                }
            }
        }

        polylines.push(chain);
    }

    polylines
}

/// Derive a chaining tolerance from the segment coordinates.
fn compute_chain_tol(segments: &[Seg]) -> f64 {
    let mut max_coord = 0.0_f64;
    for (a, b) in segments {
        max_coord = max_coord
            .max(a.n.abs())
            .max(a.e.abs())
            .max(b.n.abs())
            .max(b.e.abs());
    }
    (max_coord * 1e-9).max(1e-6)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tin::build_tin;
    use crate::Point3;

    /// A simple inclined plane: Z increases with N. Contours should be lines of
    /// constant N spanning the width.
    fn ramp() -> Tin {
        let pts = vec![
            Point3::new(0.0, 0.0, 0.0),
            Point3::new(0.0, 10.0, 0.0),
            Point3::new(10.0, 0.0, 10.0),
            Point3::new(10.0, 10.0, 10.0),
        ];
        build_tin(&pts).unwrap()
    }

    #[test]
    fn zero_interval_is_an_error() {
        let err = generate_contours(&ramp(), 0.0, 0.0).unwrap_err();
        assert!(matches!(err, SurveyError::InvalidParameter { name, .. } if name == "interval"));
    }

    #[test]
    fn empty_tin_is_an_error() {
        let empty = Tin {
            points: Vec::new(),
            triangles: Vec::new(),
        };
        let err = generate_contours(&empty, 1.0, 0.0).unwrap_err();
        assert!(matches!(err, SurveyError::DegenerateGeometry { .. }));
    }

    #[test]
    fn ramp_produces_expected_levels() {
        let contours = generate_contours(&ramp(), 2.0, 0.0).unwrap();
        let mut levels: Vec<f64> = contours.iter().map(|c| c.elevation).collect();
        levels.sort_by(|a, b| a.partial_cmp(b).unwrap());
        levels.dedup();
        assert_eq!(levels, vec![2.0, 4.0, 6.0, 8.0]);
    }

    #[test]
    fn grid_contour_on_ramp_returns_requested_level() {
        #[rustfmt::skip]
        let values = vec![
            0.0, 0.0, 0.0,
            1.0, 1.0, 1.0,
            2.0, 2.0, 2.0,
        ];
        let lines = generate_contours_from_grid(&values, 3, 3, 0.0, 0.0, 1.0, &[1.0]).unwrap();
        assert!(!lines.is_empty(), "expected a contour at level 1");
        assert!(lines.iter().all(|l| (l.elevation - 1.0).abs() < 1e-9));
    }

    #[test]
    fn grid_contour_rejects_bad_dimensions() {
        assert!(generate_contours_from_grid(&[1.0, 2.0], 3, 3, 0.0, 0.0, 1.0, &[1.0]).is_err());
        assert!(generate_contours_from_grid(&[], 0, 0, 0.0, 0.0, 1.0, &[1.0]).is_err());
    }

    #[test]
    fn contour_at_level_5_sits_at_midslope() {
        let contours = generate_contours(&ramp(), 5.0, 0.0).unwrap();
        let line = contours.iter().find(|c| (c.elevation - 5.0).abs() < 1e-9);
        assert!(line.is_some());
        for v in &line.unwrap().vertices {
            assert!((v.n - 5.0).abs() < 1e-6, "vertex N was {}", v.n);
        }
    }

    #[test]
    fn flat_tin_rejects_contours() {
        let pts = vec![
            Point3::new(0.0, 0.0, 5.0),
            Point3::new(10.0, 0.0, 5.0),
            Point3::new(10.0, 10.0, 5.0),
            Point3::new(0.0, 10.0, 5.0),
        ];
        let tin = build_tin(&pts).unwrap();
        let err = generate_contours(&tin, 1.0, 0.0).unwrap_err();
        assert!(matches!(err, SurveyError::DegenerateGeometry { .. }));
    }
}
