//! Delaunay triangulation of 3D survey points into a TIN (digital terrain
//! model), built on the `spade` crate.
//!
//! Coordinates are shifted by the point-cloud centroid before insertion so the
//! triangulation runs near the origin (preserving `f64` precision on large
//! UTM-style coordinates), then results are reported back in original space.

use crate::{Point3, SurveyError, Tin, Triangle};
use geo::algorithm::Area;
use geo_types::{Coord, Triangle as GeoTriangle};
use spade::{DelaunayTriangulation, Point2, Triangulation};

/// Configuration controlling how a TIN is built.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TinOptions {
    /// Duplicate plan-location tolerance, as a fraction of the point cloud's
    /// diagonal extent. A value of `1e-9` corresponds to ~mm-level de-duplication
    /// for a 1 km site while scaling automatically for smaller/larger projects.
    pub relative_tolerance: f64,
    /// Minimum plan area a triangle must have to be kept (relative to the
    /// point cloud's diagonal squared). Tiny sliver triangles are dropped.
    pub min_area_ratio: f64,
}

impl Default for TinOptions {
    fn default() -> Self {
        Self {
            relative_tolerance: 1e-9,
            min_area_ratio: 1e-12,
        }
    }
}

/// Compute a representative scale of the point cloud.
fn cloud_diagonal(points: &[Point3]) -> f64 {
    if points.is_empty() {
        return 1.0;
    }
    let mut min_e = points[0].e;
    let mut max_e = points[0].e;
    let mut min_n = points[0].n;
    let mut max_n = points[0].n;
    for p in &points[1..] {
        min_e = min_e.min(p.e);
        max_e = max_e.max(p.e);
        min_n = min_n.min(p.n);
        max_n = max_n.max(p.n);
    }
    let de = max_e - min_e;
    let dn = max_n - min_n;
    de.hypot(dn).max(1.0)
}

/// Build a TIN from a set of 3D survey points with sensible defaults.
///
/// Duplicate (N, E) locations are skipped (first wins) and the resulting
/// triangulation is filtered for degenerate triangles.
pub fn build_tin(points: &[Point3]) -> crate::Result<Tin> {
    build_tin_with_options(points, &TinOptions::default())
}

/// Build a TIN with explicit tolerances.
pub fn build_tin_with_options(points: &[Point3], options: &TinOptions) -> crate::Result<Tin> {
    if points.len() < 3 {
        return Err(SurveyError::InsufficientPoints {
            got: points.len(),
            need: 3,
        });
    }

    // Local shift origin = centroid, for numerical robustness.
    let (sum_n, sum_e) = points
        .iter()
        .fold((0.0_f64, 0.0_f64), |(an, ae), p| (an + p.n, ae + p.e));
    let cn = sum_n / points.len() as f64;
    let ce = sum_e / points.len() as f64;

    let scale = cloud_diagonal(points);
    let tol = (options.relative_tolerance * scale).max(1e-12);
    let min_area = options.min_area_ratio * scale * scale;

    let mut dt: DelaunayTriangulation<Point2<f64>> = DelaunayTriangulation::new();

    // Map each inserted spade vertex handle back to the original point index.
    // spade assigns handle indices in insertion order, so we track them.
    let mut original_index: Vec<usize> = Vec::with_capacity(points.len());
    let mut seen: Vec<(f64, f64)> = Vec::with_capacity(points.len());
    let mut dropped_duplicates = 0usize;
    let mut insertion_failures = 0usize;

    for (idx, p) in points.iter().enumerate() {
        // X = Easting, Y = Northing (standard CAD mapping), shifted to origin.
        let x = p.e - ce;
        let y = p.n - cn;

        // Skip near-duplicate plan coordinates to keep the triangulation valid.
        // Tolerance is now relative to the point-cloud extent rather than a
        // hard-coded absolute value.
        if seen.iter().any(|(sx, sy)| (sx - x).hypot(sy - y) < tol) {
            dropped_duplicates += 1;
            continue;
        }

        match dt.insert(Point2::new(x, y)) {
            Ok(_) => {
                seen.push((x, y));
                original_index.push(idx);
            }
            Err(_) => {
                insertion_failures += 1;
            }
        }
    }

    let unique_count = original_index.len();
    if unique_count < 3 {
        return Err(SurveyError::DegenerateGeometry {
            reason: format!(
                "only {unique_count} unique plan locations from {} input points \
                 (dropped {dropped_duplicates} duplicates, {insertion_failures} insertion failures)",
                points.len()
            ),
        });
    }

    let triangles: Vec<Triangle> = dt
        .inner_faces()
        .filter_map(|face| {
            let [v0, v1, v2] = face.vertices();
            let a = points[original_index[v0.index()]];
            let b = points[original_index[v1.index()]];
            let c = points[original_index[v2.index()]];
            let area = triangle_area_2d(a.e, a.n, b.e, b.n, c.e, c.n);
            if area < min_area {
                return None;
            }
            Some(Triangle {
                a: original_index[v0.index()],
                b: original_index[v1.index()],
                c: original_index[v2.index()],
            })
        })
        .collect();

    if triangles.is_empty() {
        return Err(SurveyError::DegenerateGeometry {
            reason: "all triangles were degenerate after filtering".into(),
        });
    }

    Ok(Tin {
        points: points.to_vec(),
        triangles,
    })
}

/// Total plan (2D, projected) area of all triangles in the TIN.
pub fn plan_area(tin: &Tin) -> f64 {
    tin.triangles
        .iter()
        .map(|t| {
            let a = &tin.points[t.a];
            let b = &tin.points[t.b];
            let c = &tin.points[t.c];
            triangle_area_2d(a.e, a.n, b.e, b.n, c.e, c.n)
        })
        .sum()
}

/// Unsigned triangle area in the E/N plane, via the GeoRust `geo` crate's
/// `Area` trait. X = Easting, Y = Northing.
pub(crate) fn triangle_area_2d(ax: f64, ay: f64, bx: f64, by: f64, cx: f64, cy: f64) -> f64 {
    GeoTriangle::new(
        Coord { x: ax, y: ay },
        Coord { x: bx, y: by },
        Coord { x: cx, y: cy },
    )
    .unsigned_area()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn square() -> Vec<Point3> {
        vec![
            Point3::new(0.0, 0.0, 0.0),
            Point3::new(0.0, 10.0, 0.0),
            Point3::new(10.0, 10.0, 0.0),
            Point3::new(10.0, 0.0, 0.0),
        ]
    }

    #[test]
    fn too_few_points_is_an_error() {
        let err = build_tin(&[Point3::new(0.0, 0.0, 0.0)]).unwrap_err();
        assert!(matches!(
            err,
            SurveyError::InsufficientPoints { got: 1, need: 3 }
        ));
    }

    #[test]
    fn square_triangulates_into_two_triangles() {
        let tin = build_tin(&square()).unwrap();
        assert_eq!(tin.triangles.len(), 2);
    }

    #[test]
    fn plan_area_matches_square() {
        let tin = build_tin(&square()).unwrap();
        let area = plan_area(&tin);
        assert!((area - 100.0).abs() < 1e-6, "area was {area}");
    }

    #[test]
    fn large_utm_coordinates_stay_precise() {
        // Coordinates near a real Zimbabwe UTM 36S location.
        let base_n = 8_000_000.0;
        let base_e = 300_000.0;
        let pts = vec![
            Point3::new(base_n, base_e, 1000.0),
            Point3::new(base_n + 50.0, base_e, 1002.0),
            Point3::new(base_n + 50.0, base_e + 50.0, 1004.0),
            Point3::new(base_n, base_e + 50.0, 1001.0),
        ];
        let tin = build_tin(&pts).unwrap();
        assert_eq!(tin.triangles.len(), 2);
        assert!((plan_area(&tin) - 2500.0).abs() < 1e-3);
    }

    #[test]
    fn duplicate_points_are_dropped() {
        let pts = vec![
            Point3::new(0.0, 0.0, 0.0),
            Point3::new(0.0, 10.0, 0.0),
            Point3::new(10.0, 10.0, 0.0),
            Point3::new(0.0, 0.0, 5.0), // duplicate plan location
        ];
        let tin = build_tin(&pts).unwrap();
        assert_eq!(tin.triangles.len(), 1);
    }

    #[test]
    fn all_collinear_points_fail() {
        let pts = vec![
            Point3::new(0.0, 0.0, 0.0),
            Point3::new(10.0, 10.0, 0.0),
            Point3::new(20.0, 20.0, 0.0),
        ];
        let err = build_tin(&pts).unwrap_err();
        assert!(matches!(err, SurveyError::DegenerateGeometry { .. }));
    }
}
