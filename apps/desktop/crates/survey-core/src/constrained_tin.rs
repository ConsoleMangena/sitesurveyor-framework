//! Constrained TIN — breakline enforcement and boundary clipping.
//!
//! Engineering survey surfaces often contain hard edges that the raw Delaunay
//! triangulation must honour: ridge lines, kerbs, retaining walls, ditches and
//! surveyed parcel boundaries. This module builds an unconstrained Delaunay
//! over the point set and then post-filters triangles so that:
//!
//!   - no triangle interior is crossed by a breakline segment, and
//!   - no triangle centroid falls outside an optional boundary ring.
//!
//! This matches the behaviour of Civil 3D / Trimble Business Center when
//! breaklines and outer boundaries are added to a surface, and it mirrors the
//! existing pure-TypeScript implementation in `frontend/.../survey/surface.ts`.

use crate::tin::{build_tin_with_options, TinOptions};
use crate::{geom, Point3, Tin, Triangle, Vertex};
use serde::{Deserialize, Serialize};

/// A 2-D constraint expressed as a polyline in Northing/Easting.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Constraint {
    pub vertices: Vec<Vertex>,
}

/// Options controlling how the constrained TIN is built.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ConstrainedTinOptions {
    /// Hard breaklines; triangles whose interiors are crossed by a breakline
    /// segment are discarded.
    #[serde(default)]
    pub breaklines: Vec<Constraint>,
    /// Optional outer boundary ring; triangles whose centroid falls outside
    /// this ring are discarded.
    pub boundary: Option<Constraint>,
}

impl Default for ConstrainedTinOptions {
    fn default() -> Self {
        Self {
            breaklines: Vec::new(),
            boundary: None,
        }
    }
}

/// Build a TIN that honours breaklines and an optional clip boundary.
///
/// Returns an error only when the unconstrained Delaunay fails; a constrained
/// surface whose filters remove every triangle is returned as an empty `Tin`.
pub fn build_constrained_tin(
    points: &[Point3],
    options: &ConstrainedTinOptions,
) -> crate::Result<Tin> {
    let base = build_tin_with_options(points, &TinOptions::default())?;

    let boundary_ring: Option<&[Vertex]> = options
        .boundary
        .as_ref()
        .filter(|b| b.vertices.len() >= 3)
        .map(|b| b.vertices.as_slice());

    let triangles: Vec<Triangle> = base
        .triangles
        .iter()
        .filter(|&&t| {
            let a = base.points[t.a];
            let b = base.points[t.b];
            let c = base.points[t.c];

            // Boundary clip: keep triangles whose centroid is inside the ring.
            if let Some(ring) = boundary_ring {
                let centroid = Vertex {
                    n: (a.n + b.n + c.n) / 3.0,
                    e: (a.e + b.e + c.e) / 3.0,
                };
                if !geom::point_in_polygon(ring, &centroid) {
                    return false;
                }
            }

            // Breakline enforcement: discard triangles cut by any breakline.
            for bl in &options.breaklines {
                if triangle_crosses_line(&a, &b, &c, &bl.vertices) {
                    return false;
                }
            }

            true
        })
        .copied()
        .collect();

    Ok(Tin {
        points: base.points,
        triangles,
    })
}

/// True when any edge of triangle (a,b,c) is properly crossed by any segment
/// of `line`. Shared endpoints (i.e. the triangle edge *is* the breakline
/// segment) are treated as not crossing so conforming triangles survive.
fn triangle_crosses_line(a: &Point3, b: &Point3, c: &Point3, line: &[Vertex]) -> bool {
    if line.len() < 2 {
        return false;
    }
    let edges: [(Vertex, Vertex); 3] = [
        (Vertex { n: a.n, e: a.e }, Vertex { n: b.n, e: b.e }),
        (Vertex { n: b.n, e: b.e }, Vertex { n: c.n, e: c.e }),
        (Vertex { n: c.n, e: c.e }, Vertex { n: a.n, e: a.e }),
    ];

    for i in 1..line.len() {
        let p = &line[i - 1];
        let q = &line[i];
        for (u, v) in &edges {
            if segments_properly_intersect(u.e, u.n, v.e, v.n, p.e, p.n, q.e, q.n) {
                return true;
            }
        }
    }
    false
}

fn orient(ax: f64, ay: f64, bx: f64, by: f64, cx: f64, cy: f64) -> f64 {
    (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
}

/// Proper segment intersection (interiors cross, excluding shared endpoints).
fn segments_properly_intersect(
    ax: f64,
    ay: f64,
    bx: f64,
    by: f64,
    cx: f64,
    cy: f64,
    dx: f64,
    dy: f64,
) -> bool {
    let d1 = orient(cx, cy, dx, dy, ax, ay);
    let d2 = orient(cx, cy, dx, dy, bx, by);
    let d3 = orient(ax, ay, bx, by, cx, cy);
    let d4 = orient(ax, ay, bx, by, dx, dy);

    ((d1 > 0.0 && d2 < 0.0) || (d1 < 0.0 && d2 > 0.0))
        && ((d3 > 0.0 && d4 < 0.0) || (d3 < 0.0 && d4 > 0.0))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn grid() -> Vec<Point3> {
        let mut pts = Vec::new();
        for n in [0.0, 10.0, 20.0] {
            for e in [0.0, 10.0, 20.0] {
                pts.push(Point3::new(n, e, 0.0));
            }
        }
        pts
    }

    #[test]
    fn matches_unconstrained_when_no_options() {
        let pts = grid();
        let plain = build_tin_with_options(&pts, &TinOptions::default()).unwrap();
        let constrained = build_constrained_tin(&pts, &ConstrainedTinOptions::default()).unwrap();
        assert_eq!(constrained.triangles.len(), plain.triangles.len());
    }

    #[test]
    fn clips_triangles_outside_boundary() {
        let pts = grid();
        let boundary = Constraint {
            vertices: vec![
                Vertex::new(0.0, 0.0),
                Vertex::new(0.0, 10.0),
                Vertex::new(10.0, 10.0),
                Vertex::new(10.0, 0.0),
            ],
        };
        let full = build_constrained_tin(&pts, &ConstrainedTinOptions::default()).unwrap();
        let clipped = build_constrained_tin(
            &pts,
            &ConstrainedTinOptions {
                breaklines: Vec::new(),
                boundary: Some(boundary),
            },
        )
        .unwrap();
        assert!(!clipped.triangles.is_empty());
        assert!(clipped.triangles.len() < full.triangles.len());

        for t in &clipped.triangles {
            let a = clipped.points[t.a];
            let b = clipped.points[t.b];
            let c = clipped.points[t.c];
            let cx = (a.e + b.e + c.e) / 3.0;
            let cy = (a.n + b.n + c.n) / 3.0;
            assert!(cx >= -1e-9 && cx <= 10.0 + 1e-9, "centroid e={cx}");
            assert!(cy >= -1e-9 && cy <= 10.0 + 1e-9, "centroid n={cy}");
        }
    }

    #[test]
    fn removes_triangles_crossed_by_breakline() {
        let pts = grid();
        let breakline = Constraint {
            vertices: vec![Vertex::new(5.0, 0.0), Vertex::new(5.0, 20.0)],
        };
        let full = build_constrained_tin(&pts, &ConstrainedTinOptions::default()).unwrap();
        let with_break = build_constrained_tin(
            &pts,
            &ConstrainedTinOptions {
                breaklines: vec![breakline],
                boundary: None,
            },
        )
        .unwrap();
        assert!(with_break.triangles.len() < full.triangles.len());
    }
}
