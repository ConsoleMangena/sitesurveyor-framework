//! Planar geometry algorithms backed by the GeoRust `geo` crate.
//!
//! These complement the hand-rolled COGO math: where `cogo.ts` covers survey
//! primitives (forward/inverse, traverse, levelling), this module exposes the
//! robust computational-geometry algorithms from `geo` (convex hull, polygon
//! simplification, area, centroid, point-in-polygon, buffering) so the CAD
//! workspace can offer the same operations as a commercial package.
//!
//! COORDINATE CONVENTION
//! ---------------------
//! The rest of `survey-core` works in Northing (`n`) / Easting (`e`). The `geo`
//! crate is X/Y. We map X = Easting, Y = Northing on the way in and back out,
//! so every public function here speaks the project's N/E `Vertex` type and
//! callers never see a `geo` type.

use crate::Vertex;
use geo::algorithm::{Area, BoundingRect, Centroid, Contains, ConvexHull, Simplify};
use geo::{Coord, LineString, Point, Polygon};

/// Axis-aligned bounding box in N/E.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Bounds {
    pub min_n: f64,
    pub max_n: f64,
    pub min_e: f64,
    pub max_e: f64,
}

/// Convert a project N/E vertex to a `geo` coordinate (X = E, Y = N).
fn to_coord(v: &Vertex) -> Coord<f64> {
    Coord { x: v.e, y: v.n }
}

/// Convert a `geo` coordinate back to a project N/E vertex.
fn from_coord(c: Coord<f64>) -> Vertex {
    Vertex { n: c.y, e: c.x }
}

/// Build a closed `geo` polygon from an N/E ring (no interior holes).
fn polygon_from(ring: &[Vertex]) -> Polygon<f64> {
    let coords: Vec<Coord<f64>> = ring.iter().map(to_coord).collect();
    Polygon::new(LineString::new(coords), vec![])
}

/// Planar (projected) area of a closed polygon ring, in square units.
///
/// Uses the signed-area shoelace inside `geo` and returns the unsigned area so
/// vertex winding (CW/CCW) does not affect the result — matching surveyors'
/// expectations for a parcel area.
pub fn polygon_area(ring: &[Vertex]) -> f64 {
    if ring.len() < 3 {
        return 0.0;
    }
    polygon_from(ring).unsigned_area()
}

/// Convex hull of a point set, returned as an N/E ring in CCW order.
///
/// The hull ring `geo` returns is closed (last point == first); we drop the
/// duplicate closing vertex so the result is a clean open ring consistent with
/// the rest of the linework model.
pub fn convex_hull(points: &[Vertex]) -> Vec<Vertex> {
    if points.len() < 3 {
        return points.to_vec();
    }
    let mp: geo::MultiPoint<f64> = points.iter().map(|v| Point::new(v.e, v.n)).collect();
    let hull = mp.convex_hull();
    let mut ring: Vec<Vertex> = hull
        .exterior()
        .points()
        .map(|p| from_coord(p.into()))
        .collect();
    if ring.len() > 1 && ring.first() == ring.last() {
        ring.pop();
    }
    ring
}

/// Simplify a polyline/ring with the Ramer–Douglas–Peucker algorithm.
///
/// `epsilon` is the maximum perpendicular deviation (in project units) a point
/// may have from the simplified line before it is kept. A non-positive epsilon
/// returns the input unchanged.
pub fn simplify(line: &[Vertex], epsilon: f64) -> Vec<Vertex> {
    if epsilon <= 0.0 || line.len() < 3 {
        return line.to_vec();
    }
    let ls: LineString<f64> = LineString::new(line.iter().map(to_coord).collect());
    ls.simplify(&epsilon)
        .points()
        .map(|p| from_coord(p.into()))
        .collect()
}

/// Centroid of a closed polygon ring, or `None` for a degenerate ring.
pub fn centroid(ring: &[Vertex]) -> Option<Vertex> {
    if ring.len() < 3 {
        return None;
    }
    polygon_from(ring).centroid().map(|p| from_coord(p.into()))
}

/// True when point `p` lies inside the closed polygon `ring`.
pub fn point_in_polygon(ring: &[Vertex], p: &Vertex) -> bool {
    if ring.len() < 3 {
        return false;
    }
    polygon_from(ring).contains(&Point::new(p.e, p.n))
}

/// Bounding rectangle of a set of vertices, or `None` when empty.
pub fn bounds(points: &[Vertex]) -> Option<Bounds> {
    if points.is_empty() {
        return None;
    }
    let ls: LineString<f64> = LineString::new(points.iter().map(to_coord).collect());
    ls.bounding_rect().map(|r| Bounds {
        min_n: r.min().y,
        max_n: r.max().y,
        min_e: r.min().x,
        max_e: r.max().x,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn square() -> Vec<Vertex> {
        vec![
            Vertex::new(0.0, 0.0),
            Vertex::new(0.0, 10.0),
            Vertex::new(10.0, 10.0),
            Vertex::new(10.0, 0.0),
        ]
    }

    #[test]
    fn area_of_unit_square_block() {
        assert!((polygon_area(&square()) - 100.0).abs() < 1e-9);
    }

    #[test]
    fn area_is_winding_independent() {
        let mut ccw = square();
        ccw.reverse();
        assert!((polygon_area(&ccw) - 100.0).abs() < 1e-9);
    }

    #[test]
    fn convex_hull_of_square_with_interior_point() {
        let mut pts = square();
        pts.push(Vertex::new(5.0, 5.0)); // interior, must be dropped
        let hull = convex_hull(&pts);
        assert_eq!(hull.len(), 4);
    }

    #[test]
    fn simplify_drops_collinear_midpoint() {
        let line = vec![
            Vertex::new(0.0, 0.0),
            Vertex::new(0.0, 5.0), // collinear, should be removed
            Vertex::new(0.0, 10.0),
        ];
        let s = simplify(&line, 0.01);
        assert_eq!(s.len(), 2);
    }

    #[test]
    fn centroid_of_square_is_center() {
        let c = centroid(&square()).unwrap();
        assert!((c.n - 5.0).abs() < 1e-9 && (c.e - 5.0).abs() < 1e-9);
    }

    #[test]
    fn point_in_polygon_inside_and_outside() {
        assert!(point_in_polygon(&square(), &Vertex::new(5.0, 5.0)));
        assert!(!point_in_polygon(&square(), &Vertex::new(50.0, 50.0)));
    }

    #[test]
    fn bounds_of_square() {
        let b = bounds(&square()).unwrap();
        assert_eq!(b.min_n, 0.0);
        assert_eq!(b.max_n, 10.0);
        assert_eq!(b.min_e, 0.0);
        assert_eq!(b.max_e, 10.0);
    }
}
