//! Volume computation from a TIN.
//!
//! Two common engineering cases are supported:
//!   - `volume_to_elevation`: cut/fill between a surface and a flat datum
//!     (stockpile against a pad level, pit against a bench, etc).
//!   - `volume_between`: cut/fill between two TINs sampled over the *first*
//!     TIN's triangles (design vs as-built earthworks).
//!
//! Each triangle is integrated as a triangular prism: the mean height
//! difference at the three vertices times the triangle's plan area. This is
//! exact for planar surfaces and the standard prismoidal approximation for TIN
//! deliverables.
//!
//! Plan areas are computed with the GeoRust `geo` crate's `Area` trait
//! (`unsigned_area` over a `Triangle`) rather than a hand-rolled determinant,
//! so we inherit `geo`'s robust, well-tested area implementation.

use crate::{SurveyError, Tin, VolumeResult};
use geo::algorithm::Area;
use geo_types::{Coord, Triangle as GeoTriangle};

/// Robust plan (E/N) area of a triangle via the GeoRust `geo` crate.
/// X = Easting, Y = Northing.
#[allow(clippy::too_many_arguments)]
fn tri_plan_area(ax: f64, ay: f64, bx: f64, by: f64, cx: f64, cy: f64) -> f64 {
    GeoTriangle::new(
        Coord { x: ax, y: ay },
        Coord { x: bx, y: by },
        Coord { x: cx, y: cy },
    )
    .unsigned_area()
}

/// Options controlling how `volume_between` handles footprint mismatch.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum FootprintMode {
    /// Require every vertex of `top` to lie inside the `base` TIN footprint.
    /// If any vertex is outside, the computation fails.
    Strict,
    /// Allow vertices outside the `base` footprint, but report the
    /// non-overlapping area and only accumulate volumes where the base exists.
    ReportOverlap,
}

/// Cut/fill volume between the TIN surface and a flat reference elevation.
///
/// - `cut` accumulates where the surface is **above** the reference.
/// - `fill` accumulates where the surface is **below** the reference.
pub fn volume_to_elevation(tin: &Tin, reference: f64) -> crate::Result<VolumeResult> {
    if tin.triangles.is_empty() {
        return Err(SurveyError::DegenerateGeometry {
            reason: "TIN has no triangles".into(),
        });
    }
    if !reference.is_finite() {
        return Err(SurveyError::InvalidParameter {
            name: "reference".into(),
            value: reference.to_string(),
        });
    }
    Ok(accumulate(tin, |z| z - reference))
}

/// Cut/fill volume between `top` and `base` TINs, integrated over `top`'s
/// triangles. Heights on `base` are sampled by planar interpolation.
///
/// In `FootprintMode::Strict` (the default), the function returns an error if
/// any vertex of `top` lies outside the `base` footprint. This prevents silent
/// earthworks errors when a design surface extends beyond the surveyed existing
/// ground model.
pub fn volume_between(top: &Tin, base: &Tin) -> crate::Result<VolumeResult> {
    volume_between_with_mode(top, base, FootprintMode::Strict)
}

/// Cut/fill volume with explicit footprint handling.
pub fn volume_between_with_mode(
    top: &Tin,
    base: &Tin,
    mode: FootprintMode,
) -> crate::Result<VolumeResult> {
    validate_volume_pair(top, base)?;

    let mut res = VolumeResult {
        cut: 0.0,
        fill: 0.0,
        net: 0.0,
        plan_area: 0.0,
    };
    for t in &top.triangles {
        let a = top.points[t.a];
        let b = top.points[t.b];
        let c = top.points[t.c];

        let area = tri_plan_area(a.e, a.n, b.e, b.n, c.e, c.n);
        if area <= 0.0 || !area.is_finite() {
            continue;
        }

        let mean_top_z = (a.z + b.z + c.z) / 3.0;

        match mode {
            FootprintMode::Strict => {
                // Require every vertex to lie inside the base footprint so
                // there is no ambiguity about the base elevation.
                let za = sample_z(base, a.n, a.e);
                let zb = sample_z(base, b.n, b.e);
                let zc = sample_z(base, c.n, c.e);
                if za.is_none() || zb.is_none() || zc.is_none() {
                    return Err(SurveyError::FootprintMismatch {
                        reason: format!(
                            "top-surface vertex outside base TIN footprint (triangle {})",
                            top_triangle_label(t)
                        ),
                    });
                }
                res.plan_area += area;
                accumulate_depth_triangle(
                    &mut res,
                    DepthVertex {
                        n: a.n,
                        e: a.e,
                        d: a.z - za.unwrap(),
                    },
                    DepthVertex {
                        n: b.n,
                        e: b.e,
                        d: b.z - zb.unwrap(),
                    },
                    DepthVertex {
                        n: c.n,
                        e: c.e,
                        d: c.z - zc.unwrap(),
                    },
                );
            }
            FootprintMode::ReportOverlap => {
                // Use the base elevation at the top triangle's centroid. This
                // gives a useful, if approximate, volume wherever the centroid
                // falls inside the base footprint, without failing on partial
                // overlap. Triangles whose centroid is outside are ignored.
                let cen_n = (a.n + b.n + c.n) / 3.0;
                let cen_e = (a.e + b.e + c.e) / 3.0;
                if let Some(z_base) = sample_z(base, cen_n, cen_e) {
                    let mean_delta = mean_top_z - z_base;
                    res.plan_area += area;
                    let vol = mean_delta * area;
                    if vol >= 0.0 {
                        res.cut += vol;
                    } else {
                        res.fill += -vol;
                    }
                    res.net = res.cut - res.fill;
                }
            }
        }
    }

    Ok(res)
}

fn validate_volume_pair(top: &Tin, base: &Tin) -> crate::Result<()> {
    if top.triangles.is_empty() {
        return Err(SurveyError::DegenerateGeometry {
            reason: "top TIN has no triangles".into(),
        });
    }
    if base.triangles.is_empty() {
        return Err(SurveyError::DegenerateGeometry {
            reason: "base TIN has no triangles".into(),
        });
    }
    Ok(())
}

fn top_triangle_label(t: &crate::Triangle) -> String {
    format!("({}, {}, {})", t.a, t.b, t.c)
}

#[derive(Clone, Copy)]
struct DepthVertex {
    n: f64,
    e: f64,
    d: f64,
}

fn tri_plan_area_depth(a: &DepthVertex, b: &DepthVertex, c: &DepthVertex) -> f64 {
    ((b.e - a.e) * (c.n - a.n) - (c.e - a.e) * (b.n - a.n)).abs() / 2.0
}

fn signed_depth_volume(a: &DepthVertex, b: &DepthVertex, c: &DepthVertex) -> f64 {
    tri_plan_area_depth(a, b, c) * (a.d + b.d + c.d) / 3.0
}

fn interpolate_depth_edge(p: &DepthVertex, q: &DepthVertex) -> DepthVertex {
    let denom = p.d - q.d;
    let t = p.d / denom;
    DepthVertex {
        n: p.n + t * (q.n - p.n),
        e: p.e + t * (q.e - p.e),
        d: 0.0,
    }
}

/// Accumulate a single triangle's cut/fill contribution, splitting it along the
/// zero-depth plane when the triangle straddles the reference surface. This is
/// the standard engineering-survey treatment so that cut and fill volumes are
/// exact at embankment and datum boundaries.
fn accumulate_depth_triangle(
    res: &mut VolumeResult,
    a: DepthVertex,
    b: DepthVertex,
    c: DepthVertex,
) {
    let pos = [a.d >= 0.0, b.d >= 0.0, c.d >= 0.0];
    let all_positive = pos.iter().all(|&x| x);
    let all_negative = !pos.iter().any(|&x| x);

    if all_positive {
        let vol = signed_depth_volume(&a, &b, &c);
        if vol >= 0.0 {
            res.cut += vol;
        } else {
            res.fill += -vol;
        }
        return;
    }
    if all_negative {
        let vol = signed_depth_volume(&a, &b, &c);
        if vol <= 0.0 {
            res.fill += -vol;
        } else {
            res.cut += vol;
        }
        return;
    }

    // Mixed signs: split into sub-triangles that are entirely above or below.
    let verts = [a, b, c];
    let pos_idx: Vec<usize> = pos
        .iter()
        .enumerate()
        .filter(|(_, &p)| p)
        .map(|(i, _)| i)
        .collect();
    let neg_idx: Vec<usize> = pos
        .iter()
        .enumerate()
        .filter(|(_, &p)| !p)
        .map(|(i, _)| i)
        .collect();

    if pos_idx.len() == 1 {
        let i = pos_idx[0];
        let j = neg_idx[0];
        let k = neg_idx[1];
        let pij = interpolate_depth_edge(&verts[i], &verts[j]);
        let pik = interpolate_depth_edge(&verts[i], &verts[k]);
        let cut_vol = signed_depth_volume(&verts[i], &pij, &pik);
        if cut_vol >= 0.0 {
            res.cut += cut_vol;
        } else {
            res.fill += -cut_vol;
        }
        let fill_vol1 = signed_depth_volume(&pij, &verts[j], &verts[k]);
        if fill_vol1 <= 0.0 {
            res.fill += -fill_vol1;
        } else {
            res.cut += fill_vol1;
        }
        let fill_vol2 = signed_depth_volume(&pij, &verts[k], &pik);
        if fill_vol2 <= 0.0 {
            res.fill += -fill_vol2;
        } else {
            res.cut += fill_vol2;
        }
    } else {
        // One negative, two positive.
        let i = neg_idx[0];
        let j = pos_idx[0];
        let k = pos_idx[1];
        let pji = interpolate_depth_edge(&verts[j], &verts[i]);
        let pki = interpolate_depth_edge(&verts[k], &verts[i]);
        let fill_vol = signed_depth_volume(&verts[i], &pki, &pji);
        if fill_vol <= 0.0 {
            res.fill += -fill_vol;
        } else {
            res.cut += fill_vol;
        }
        let cut_vol1 = signed_depth_volume(&verts[j], &pji, &pki);
        if cut_vol1 >= 0.0 {
            res.cut += cut_vol1;
        } else {
            res.fill += -cut_vol1;
        }
        let cut_vol2 = signed_depth_volume(&verts[j], &pki, &verts[k]);
        if cut_vol2 >= 0.0 {
            res.cut += cut_vol2;
        } else {
            res.fill += -cut_vol2;
        }
    }
}

fn accumulate<F: Fn(f64) -> f64>(tin: &Tin, height: F) -> VolumeResult {
    let mut res = VolumeResult {
        cut: 0.0,
        fill: 0.0,
        net: 0.0,
        plan_area: 0.0,
    };

    for t in &tin.triangles {
        let a = tin.points[t.a];
        let b = tin.points[t.b];
        let c = tin.points[t.c];

        let area = tri_plan_area(a.e, a.n, b.e, b.n, c.e, c.n);
        if area <= 0.0 || !area.is_finite() {
            continue;
        }
        res.plan_area += area;

        let da = height(a.z);
        let db = height(b.z);
        let dc = height(c.z);
        if ![da, db, dc].iter().all(|v| v.is_finite()) {
            continue;
        }

        accumulate_depth_triangle(
            &mut res,
            DepthVertex {
                n: a.n,
                e: a.e,
                d: da,
            },
            DepthVertex {
                n: b.n,
                e: b.e,
                d: db,
            },
            DepthVertex {
                n: c.n,
                e: c.e,
                d: dc,
            },
        );
    }
    res.net = res.cut - res.fill;
    res
}

/// Sample the elevation of a TIN at plan location (n, e) via barycentric
/// interpolation over the containing triangle. Returns None if outside.
pub fn sample_z(tin: &Tin, n: f64, e: f64) -> Option<f64> {
    for t in &tin.triangles {
        let a = tin.points[t.a];
        let b = tin.points[t.b];
        let c = tin.points[t.c];
        if let Some((wa, wb, wc)) = barycentric(e, n, a.e, a.n, b.e, b.n, c.e, c.n) {
            return Some(wa * a.z + wb * b.z + wc * c.z);
        }
    }
    None
}

/// Barycentric weights of point (px, py) in triangle (a, b, c), or None when
/// the point falls outside (small tolerance allows edge/vertex hits).
#[allow(clippy::too_many_arguments)]
fn barycentric(
    px: f64,
    py: f64,
    ax: f64,
    ay: f64,
    bx: f64,
    by: f64,
    cx: f64,
    cy: f64,
) -> Option<(f64, f64, f64)> {
    let det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    let max_edge = ((ax - bx).hypot(ay - by))
        .max((bx - cx).hypot(by - cy))
        .max((cx - ax).hypot(cy - ay));
    let eps = (max_edge * 1e-12).max(1e-12);

    if det.abs() < eps {
        return None;
    }
    let wa = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det;
    let wb = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det;
    let wc = 1.0 - wa - wb;
    // Tolerance scaled to triangle size; a slightly negative weight for a point
    // just outside a large triangle should still be accepted.
    let tol = max_edge * 1e-9;
    if wa >= -tol && wb >= -tol && wc >= -tol {
        Some((wa, wb, wc))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tin::build_tin;
    use crate::Point3;

    fn flat_pad(z: f64) -> Tin {
        build_tin(&[
            Point3::new(0.0, 0.0, z),
            Point3::new(0.0, 10.0, z),
            Point3::new(10.0, 10.0, z),
            Point3::new(10.0, 0.0, z),
        ])
        .unwrap()
    }

    #[test]
    fn flat_surface_above_datum_is_pure_cut() {
        let tin = flat_pad(5.0);
        let v = volume_to_elevation(&tin, 0.0).unwrap();
        assert!((v.cut - 500.0).abs() < 1e-6, "cut was {}", v.cut);
        assert!(v.fill.abs() < 1e-9);
        assert!((v.plan_area - 100.0).abs() < 1e-6);
    }

    #[test]
    fn flat_surface_below_datum_is_pure_fill() {
        let tin = flat_pad(2.0);
        let v = volume_to_elevation(&tin, 10.0).unwrap();
        assert!((v.fill - 800.0).abs() < 1e-6, "fill was {}", v.fill);
        assert!(v.cut.abs() < 1e-9);
        assert!((v.net + 800.0).abs() < 1e-6);
    }

    #[test]
    fn volume_between_two_flat_surfaces() {
        let top = flat_pad(8.0);
        let base = flat_pad(3.0);
        let v = volume_between(&top, &base).unwrap();
        assert!((v.cut - 500.0).abs() < 1e-6, "cut was {}", v.cut);
        assert!(v.fill.abs() < 1e-9);
    }

    #[test]
    fn volume_between_rejects_footprint_mismatch() {
        let top = build_tin(&[
            Point3::new(0.0, 0.0, 8.0),
            Point3::new(0.0, 10.0, 8.0),
            Point3::new(10.0, 10.0, 8.0),
            Point3::new(10.0, 0.0, 8.0),
        ])
        .unwrap();
        let base = build_tin(&[
            Point3::new(2.0, 2.0, 3.0),
            Point3::new(2.0, 8.0, 3.0),
            Point3::new(8.0, 8.0, 3.0),
            Point3::new(8.0, 2.0, 3.0),
        ])
        .unwrap();
        assert!(matches!(
            volume_between(&top, &base),
            Err(SurveyError::FootprintMismatch { .. })
        ));
    }

    #[test]
    fn volume_between_report_overlap_mode_does_not_fail() {
        let top = build_tin(&[
            Point3::new(0.0, 0.0, 8.0),
            Point3::new(0.0, 10.0, 8.0),
            Point3::new(10.0, 10.0, 8.0),
            Point3::new(10.0, 0.0, 8.0),
        ])
        .unwrap();
        let base = build_tin(&[
            Point3::new(2.0, 2.0, 3.0),
            Point3::new(2.0, 8.0, 3.0),
            Point3::new(8.0, 8.0, 3.0),
            Point3::new(8.0, 2.0, 3.0),
        ])
        .unwrap();
        let v = volume_between_with_mode(&top, &base, FootprintMode::ReportOverlap).unwrap();
        // Both top triangles have centroids inside the smaller base square, so
        // the centroid approximation returns the full top plan area × height difference.
        assert!((v.cut - 500.0).abs() < 1e-3, "cut was {}", v.cut);
    }

    #[test]
    fn sample_z_interpolates_center() {
        let tin = flat_pad(7.0);
        let z = sample_z(&tin, 5.0, 5.0).unwrap();
        assert!((z - 7.0).abs() < 1e-9);
    }

    #[test]
    fn triangle_straddling_reference_splits_cut_and_fill() {
        // A single right-triangle of plan area 0.5 with vertices at z = +1, -1, -1.
        // Above z=0 is a small triangle of area 0.125 and mean depth 1/3 -> cut
        // = 1/24. Below z=0 is the remainder -> fill = 5/24. Net signed volume is
        // the same as area * mean_depth = 0.5 * (-1/3) = -1/6.
        let tin = build_tin(&[
            Point3::new(0.0, 0.0, 1.0),
            Point3::new(1.0, 0.0, -1.0),
            Point3::new(0.0, 1.0, -1.0),
        ])
        .unwrap();
        let v = volume_to_elevation(&tin, 0.0).unwrap();
        assert!((v.cut - 1.0 / 24.0).abs() < 1e-9, "cut was {}", v.cut);
        assert!((v.fill - 5.0 / 24.0).abs() < 1e-9, "fill was {}", v.fill);
        assert!((v.net + 1.0 / 6.0).abs() < 1e-9, "net was {}", v.net);
    }
}
