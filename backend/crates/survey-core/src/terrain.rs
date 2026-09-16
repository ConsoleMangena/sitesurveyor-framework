//! Terrain analysis over a TIN: per-triangle slope, aspect, 3D surface area and
//! whole-surface statistics.
//!
//! These are standard digital-terrain-model deliverables in engineering survey
//! (slope shading, drainage/aspect analysis, true surface area for earthworks
//! and landscaping quantities). All angles are in degrees; X = Easting,
//! Y = Northing, Z = elevation.

use crate::tin::triangle_area_2d;
use crate::Tin;

const DEG: f64 = 180.0 / std::f64::consts::PI;

/// Slope/aspect/area facts for a single TIN triangle.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct TriangleAnalysis {
    /// Index of the triangle within `Tin::triangles`.
    pub index: usize,
    /// Slope angle from horizontal, degrees (0 = flat, 90 = vertical).
    pub slope_deg: f64,
    /// Slope as a percentage grade (rise/run × 100).
    pub slope_percent: f64,
    /// Aspect: downslope-facing azimuth in degrees clockwise from North
    /// (0 = faces North, 90 = East). `None` for a flat triangle.
    pub aspect_deg: Option<f64>,
    /// Plan (projected) area, m².
    pub plan_area: f64,
    /// True 3D surface area, m² (>= plan area).
    pub surface_area: f64,
}

/// Whole-surface terrain statistics aggregated from the per-triangle analysis.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct TerrainStats {
    /// Total plan (projected) area, m².
    pub plan_area: f64,
    /// Total true 3D surface area, m².
    pub surface_area: f64,
    /// Area-weighted mean slope, degrees.
    pub mean_slope_deg: f64,
    /// Minimum triangle slope, degrees.
    pub min_slope_deg: f64,
    /// Maximum triangle slope, degrees.
    pub max_slope_deg: f64,
    /// Minimum elevation across all points.
    pub min_elevation: f64,
    /// Maximum elevation across all points.
    pub max_elevation: f64,
    /// Number of triangles analysed.
    pub triangles: usize,
}

/// Analyse every triangle of the TIN for slope, aspect and area.
pub fn analyse_triangles(tin: &Tin) -> Vec<TriangleAnalysis> {
    let mut out = Vec::with_capacity(tin.triangles.len());
    for (index, t) in tin.triangles.iter().enumerate() {
        let a = tin.points[t.a];
        let b = tin.points[t.b];
        let c = tin.points[t.c];

        // Edge vectors in (E, N, Z).
        let u = (b.e - a.e, b.n - a.n, b.z - a.z);
        let v = (c.e - a.e, c.n - a.n, c.z - a.z);

        // Normal = u × v.
        let nx = u.1 * v.2 - u.2 * v.1;
        let ny = u.2 * v.0 - u.0 * v.2;
        let nz = u.0 * v.1 - u.1 * v.0;
        let nlen = (nx * nx + ny * ny + nz * nz).sqrt();

        let plan_area = triangle_area_2d(a.e, a.n, b.e, b.n, c.e, c.n);
        // 3D surface area = half the magnitude of the cross product.
        let surface_area = nlen / 2.0;

        // Slope = angle between the face normal and vertical (Z) axis.
        let (slope_deg, aspect_deg) = if nlen < 1e-12 {
            (0.0, None)
        } else {
            let cos_slope = (nz.abs()) / nlen;
            let slope = cos_slope.clamp(-1.0, 1.0).acos() * DEG;

            // Aspect = azimuth of the downslope (steepest-descent) direction.
            // For an up-pointing face normal, its horizontal projection already
            // points downslope (toward lower ground), so orient the normal up
            // and use that horizontal component directly.
            let (dx, dy) = if nz >= 0.0 { (nx, ny) } else { (-nx, -ny) };
            if dx.abs() < 1e-12 && dy.abs() < 1e-12 {
                (slope, None)
            } else {
                // Azimuth clockwise from North: atan2(East, North).
                let mut az = dx.atan2(dy) * DEG;
                if az < 0.0 {
                    az += 360.0;
                }
                (slope, Some(az))
            }
        };

        out.push(TriangleAnalysis {
            index,
            slope_deg,
            slope_percent: slope_deg.to_radians().tan() * 100.0,
            aspect_deg,
            plan_area,
            surface_area,
        });
    }
    out
}

/// Aggregate whole-surface statistics from a TIN.
pub fn terrain_stats(tin: &Tin) -> Option<TerrainStats> {
    if tin.triangles.is_empty() || tin.points.is_empty() {
        return None;
    }
    let tris = analyse_triangles(tin);

    let mut plan_area = 0.0;
    let mut surface_area = 0.0;
    let mut weighted_slope = 0.0;
    let mut min_slope = f64::INFINITY;
    let mut max_slope = f64::NEG_INFINITY;

    for t in &tris {
        plan_area += t.plan_area;
        surface_area += t.surface_area;
        weighted_slope += t.slope_deg * t.plan_area;
        min_slope = min_slope.min(t.slope_deg);
        max_slope = max_slope.max(t.slope_deg);
    }

    let (mut min_elevation, mut max_elevation) = (f64::INFINITY, f64::NEG_INFINITY);
    for p in &tin.points {
        min_elevation = min_elevation.min(p.z);
        max_elevation = max_elevation.max(p.z);
    }

    let mean_slope_deg = if plan_area > 0.0 {
        weighted_slope / plan_area
    } else {
        0.0
    };

    Some(TerrainStats {
        plan_area,
        surface_area,
        mean_slope_deg,
        min_slope_deg: if min_slope.is_finite() {
            min_slope
        } else {
            0.0
        },
        max_slope_deg: if max_slope.is_finite() {
            max_slope
        } else {
            0.0
        },
        min_elevation,
        max_elevation,
        triangles: tris.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tin::build_tin;
    use crate::Point3;

    /// Flat surface at Z=5: slope 0, surface area == plan area.
    fn flat() -> Tin {
        build_tin(&[
            Point3::new(0.0, 0.0, 5.0),
            Point3::new(0.0, 10.0, 5.0),
            Point3::new(10.0, 10.0, 5.0),
            Point3::new(10.0, 0.0, 5.0),
        ])
        .unwrap()
    }

    /// Plane tilted so Z rises 1:1 toward increasing Easting: a 45° slope whose
    /// downhill (steepest-descent) direction faces West (aspect 270°).
    /// Points are (N, E, Z); Z == E here.
    fn ramp_east() -> Tin {
        build_tin(&[
            Point3::new(0.0, 0.0, 0.0),
            Point3::new(10.0, 0.0, 0.0),
            Point3::new(0.0, 10.0, 10.0),
            Point3::new(10.0, 10.0, 10.0),
        ])
        .unwrap()
    }

    #[test]
    fn flat_surface_is_zero_slope() {
        let stats = terrain_stats(&flat()).unwrap();
        assert!(stats.max_slope_deg.abs() < 1e-9);
        assert!((stats.surface_area - stats.plan_area).abs() < 1e-6);
        assert!((stats.plan_area - 100.0).abs() < 1e-6);
    }

    #[test]
    fn ramp_is_45_degrees_facing_west() {
        let tris = analyse_triangles(&ramp_east());
        for t in &tris {
            assert!((t.slope_deg - 45.0).abs() < 1e-6, "slope {}", t.slope_deg);
            // Z increases toward +E, so downslope faces West -> aspect ~270°.
            let asp = t.aspect_deg.unwrap();
            assert!((asp - 270.0).abs() < 1e-6, "aspect {asp}");
        }
        // Surface area = plan area / cos(45°) = 100 / 0.7071 ≈ 141.42.
        let stats = terrain_stats(&ramp_east()).unwrap();
        assert!((stats.surface_area - 141.42135).abs() < 1e-3);
        assert!((stats.mean_slope_deg - 45.0).abs() < 1e-6);
    }

    #[test]
    fn empty_tin_has_no_stats() {
        assert!(build_tin(&[Point3::new(0.0, 0.0, 0.0)]).is_err());
    }
}
