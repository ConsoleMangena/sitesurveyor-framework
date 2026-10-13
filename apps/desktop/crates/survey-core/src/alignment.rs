//! Road / rail alignment setting-out: horizontal circular curves and vertical
//! parabolic curves.
//!
//! These are the geometric-design computations an engineering surveyor needs to
//! stake out a centreline. They are pure functions over the project's N/E
//! `Vertex` type (X = Easting, Y = Northing) and decimal-degree azimuths
//! measured clockwise from North, matching the conventions in the TypeScript
//! `cogo.ts` layer.

use crate::Vertex;

const DEG: f64 = 180.0 / std::f64::consts::PI;
const RAD: f64 = std::f64::consts::PI / 180.0;

/// Normalise an azimuth (degrees) into [0, 360).
fn norm_az(deg: f64) -> f64 {
    let mut a = deg % 360.0;
    if a < 0.0 {
        a += 360.0;
    }
    a
}

/// Forward computation: destination from a point, azimuth (deg) and distance.
fn forward(p: &Vertex, az_deg: f64, dist: f64) -> Vertex {
    let az = norm_az(az_deg) * RAD;
    Vertex {
        n: p.n + dist * az.cos(),
        e: p.e + dist * az.sin(),
    }
}

// ── Horizontal circular curve ───────────────────────────────────────────────

/// The geometry of a simple horizontal circular curve, derived from the
/// intersection (PI) point, the two tangent azimuths and the radius.
///
/// All chainages/lengths are in project units (m); azimuths in degrees.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct HorizontalCurve {
    /// Radius of the curve.
    pub radius: f64,
    /// Deflection (intersection) angle between the tangents, degrees (0..180).
    pub deflection: f64,
    /// Tangent length T = R·tan(Δ/2) (PI to PC, and PI to PT).
    pub tangent: f64,
    /// Curve length L = R·Δ (arc).
    pub length: f64,
    /// External distance E = R·(sec(Δ/2) − 1) (PI to mid-curve).
    pub external: f64,
    /// Middle ordinate M = R·(1 − cos(Δ/2)).
    pub middle_ordinate: f64,
    /// Long chord C = 2R·sin(Δ/2) (PC to PT straight line).
    pub long_chord: f64,
    /// Point of curvature (tangent-to-curve), where the curve begins.
    pub pc: Vertex,
    /// Point of tangency (curve-to-tangent), where the curve ends.
    pub pt: Vertex,
    /// Centre of the circular arc.
    pub centre: Vertex,
    /// True when the curve turns to the right (clockwise) from the back tangent.
    pub turns_right: bool,
}

/// Solve a simple circular curve from the point of intersection (`pi`), the
/// incoming (back) tangent azimuth, the outgoing (forward) tangent azimuth and
/// the radius.
///
/// Returns `None` for a non-positive radius or a degenerate (0° or 180°)
/// deflection where no finite curve exists.
pub fn horizontal_curve(
    pi: &Vertex,
    back_azimuth: f64,
    fwd_azimuth: f64,
    radius: f64,
) -> Option<HorizontalCurve> {
    if radius <= 0.0 {
        return None;
    }

    // Deflection angle Δ = signed turn from back tangent to forward tangent.
    let mut delta = norm_az(fwd_azimuth) - norm_az(back_azimuth);
    if delta > 180.0 {
        delta -= 360.0;
    } else if delta < -180.0 {
        delta += 360.0;
    }
    let turns_right = delta > 0.0;
    let delta_abs = delta.abs();
    if delta_abs < 1e-9 || (delta_abs - 180.0).abs() < 1e-9 {
        return None;
    }

    let half = (delta_abs * RAD) / 2.0;
    let tangent = radius * half.tan();
    let length = radius * delta_abs * RAD;
    let external = radius * (1.0 / half.cos() - 1.0);
    let middle_ordinate = radius * (1.0 - half.cos());
    let long_chord = 2.0 * radius * half.sin();

    // PC lies back along the incoming tangent; PT lies along the outgoing one.
    // The incoming tangent points PI->ahead at back_azimuth, so PC is "behind".
    let pc = forward(pi, back_azimuth + 180.0, tangent);
    let pt = forward(pi, fwd_azimuth, tangent);

    // Centre is offset 90° from the back tangent at PC, toward the curve side.
    let centre_az = if turns_right {
        back_azimuth + 90.0
    } else {
        back_azimuth - 90.0
    };
    let centre = forward(&pc, centre_az, radius);

    Some(HorizontalCurve {
        radius,
        deflection: delta_abs,
        tangent,
        length,
        external,
        middle_ordinate,
        long_chord,
        pc,
        pt,
        centre,
        turns_right,
    })
}

/// A staked point on a horizontal curve, at a given arc distance from the PC.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct CurveStation {
    /// Arc distance from the PC along the curve.
    pub arc_from_pc: f64,
    /// Coordinate of the point on the curve.
    pub point: Vertex,
    /// Deflection angle from the PC tangent to this point, degrees (for a
    /// theodolite set up on the PC sighting the PI/back tangent).
    pub deflection: f64,
}

/// Stake out points along a horizontal curve at a fixed arc `interval`,
/// returning every station from the PC to the PT (inclusive).
pub fn stake_horizontal_curve(
    curve: &HorizontalCurve,
    back_azimuth: f64,
    interval: f64,
) -> Vec<CurveStation> {
    let mut out = Vec::new();
    if interval <= 0.0 || curve.length <= 0.0 {
        return out;
    }
    let sign = if curve.turns_right { 1.0 } else { -1.0 };

    let mut arc: f64 = 0.0;
    loop {
        let capped = arc.min(curve.length);
        // Central angle subtended by this arc.
        let theta = capped / curve.radius; // radians
                                           // Chord from PC and its deflection (half the central angle).
        let chord = 2.0 * curve.radius * (theta / 2.0).sin();
        let defl = (theta / 2.0) * DEG;
        // Chord azimuth = back tangent azimuth rotated by the deflection.
        let chord_az = back_azimuth + sign * defl;
        let point = forward(&curve.pc, chord_az, chord);
        out.push(CurveStation {
            arc_from_pc: capped,
            point,
            deflection: defl,
        });
        if capped >= curve.length {
            break;
        }
        arc += interval;
    }
    out
}

// ── Vertical parabolic curve ─────────────────────────────────────────────────

/// A point on a vertical parabolic curve: chainage (horizontal distance from
/// the BVC) and reduced level (elevation).
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct VerticalStation {
    /// Horizontal distance from the start of the curve (BVC).
    pub chainage: f64,
    /// Reduced level (elevation) at this chainage.
    pub elevation: f64,
}

/// Result of a vertical curve design.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct VerticalCurve {
    /// Elevation at the start of the curve (BVC).
    pub bvc_elevation: f64,
    /// Elevation at the end of the curve (EVC).
    pub evc_elevation: f64,
    /// Algebraic grade change A = g2 − g1, in percent.
    pub grade_change: f64,
    /// Chainage of the high or low point from the BVC, or `None` when the
    /// turning point falls outside the curve (no sign change in grade).
    pub turning_chainage: Option<f64>,
    /// Elevation at the turning point, when it exists.
    pub turning_elevation: Option<f64>,
    /// Staked stations along the curve at the requested interval (BVC..EVC).
    pub stations: Vec<VerticalStation>,
}

/// Design an equal-tangent vertical parabolic curve.
///
/// - `bvc_elevation`: reduced level at the curve start (BVC).
/// - `g1`, `g2`: incoming and outgoing grades, in percent (e.g. +2.5, −1.0).
/// - `length`: curve length (horizontal), in project units.
/// - `interval`: staking interval; pass 0 to skip station generation.
///
/// Returns `None` for a non-positive length.
pub fn vertical_curve(
    bvc_elevation: f64,
    g1: f64,
    g2: f64,
    length: f64,
    interval: f64,
) -> Option<VerticalCurve> {
    if length <= 0.0 {
        return None;
    }
    // Grades as ratios (per unit run).
    let m1 = g1 / 100.0;
    let m2 = g2 / 100.0;
    let grade_change = g2 - g1;

    // Elevation along the parabola: y = bvc + m1·x + ((m2−m1)/(2L))·x².
    let a = (m2 - m1) / (2.0 * length);
    let elev_at = |x: f64| bvc_elevation + m1 * x + a * x * x;

    let evc_elevation = elev_at(length);

    // Turning point: dy/dx = 0 -> x = −m1 / (2a) = −m1·L / (m2 − m1).
    let (turning_chainage, turning_elevation) = if (m2 - m1).abs() < 1e-12 {
        (None, None)
    } else {
        let x = -m1 * length / (m2 - m1);
        if x >= 0.0 && x <= length {
            (Some(x), Some(elev_at(x)))
        } else {
            (None, None)
        }
    };

    let mut stations = Vec::new();
    if interval > 0.0 {
        let mut x: f64 = 0.0;
        loop {
            let capped = x.min(length);
            stations.push(VerticalStation {
                chainage: capped,
                elevation: elev_at(capped),
            });
            if capped >= length {
                break;
            }
            x += interval;
        }
    }

    Some(VerticalCurve {
        bvc_elevation,
        evc_elevation,
        grade_change,
        turning_chainage,
        turning_elevation,
        stations,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ninety_degree_curve_geometry() {
        // Back tangent heading North (0°), forward tangent heading East (90°),
        // R = 100. Δ = 90°.
        let pi = Vertex { n: 0.0, e: 0.0 };
        let c = horizontal_curve(&pi, 0.0, 90.0, 100.0).unwrap();
        assert!((c.deflection - 90.0).abs() < 1e-9);
        // T = R·tan(45°) = 100.
        assert!((c.tangent - 100.0).abs() < 1e-6, "T was {}", c.tangent);
        // L = R·Δ = 100·(π/2) ≈ 157.0796.
        assert!((c.length - 157.0796327).abs() < 1e-4, "L was {}", c.length);
        // Long chord = 2R·sin(45°) ≈ 141.4214.
        assert!((c.long_chord - 141.42135).abs() < 1e-3);
        assert!(c.turns_right);
    }

    #[test]
    fn curve_rejects_bad_input() {
        let pi = Vertex { n: 0.0, e: 0.0 };
        assert!(horizontal_curve(&pi, 0.0, 90.0, 0.0).is_none());
        assert!(horizontal_curve(&pi, 10.0, 10.0, 100.0).is_none()); // 0° deflection
        assert!(horizontal_curve(&pi, 0.0, 180.0, 100.0).is_none()); // 180°
    }

    #[test]
    fn stake_curve_starts_at_pc_ends_at_pt() {
        let pi = Vertex { n: 0.0, e: 0.0 };
        let c = horizontal_curve(&pi, 0.0, 90.0, 100.0).unwrap();
        let stations = stake_horizontal_curve(&c, 0.0, 50.0);
        let first = stations.first().unwrap();
        let last = stations.last().unwrap();
        assert!((first.arc_from_pc).abs() < 1e-9);
        assert!((first.point.n - c.pc.n).abs() < 1e-6 && (first.point.e - c.pc.e).abs() < 1e-6);
        assert!((last.arc_from_pc - c.length).abs() < 1e-6);
        assert!(
            (last.point.n - c.pt.n).abs() < 1e-3,
            "end N {}",
            last.point.n
        );
        assert!(
            (last.point.e - c.pt.e).abs() < 1e-3,
            "end E {}",
            last.point.e
        );
    }

    #[test]
    fn crest_curve_has_internal_high_point() {
        // +3% into −2% over 200 m: a crest. High point at x = m1·L/(m1−m2)
        // = 0.03·200 / 0.05 = 120 m.
        let v = vertical_curve(100.0, 3.0, -2.0, 200.0, 50.0).unwrap();
        assert!((v.grade_change + 5.0).abs() < 1e-9);
        let tx = v.turning_chainage.unwrap();
        assert!((tx - 120.0).abs() < 1e-6, "turning at {tx}");
        // Elevation there should exceed both ends (it's a crest).
        let te = v.turning_elevation.unwrap();
        assert!(te > v.bvc_elevation && te > v.evc_elevation);
        // BVC station included, EVC station closes exactly on the length.
        assert!((v.stations.first().unwrap().chainage).abs() < 1e-9);
        assert!((v.stations.last().unwrap().chainage - 200.0).abs() < 1e-9);
    }

    #[test]
    fn constant_grade_has_no_turning_point() {
        let v = vertical_curve(50.0, 2.0, 2.0, 100.0, 0.0).unwrap();
        assert!(v.turning_chainage.is_none());
        // EVC = BVC + g·L = 50 + 0.02·100 = 52.
        assert!((v.evc_elevation - 52.0).abs() < 1e-9);
    }
}
