//! COGO (Coordinate Geometry) — pure Rust survey math.
//!
//! Conventions match the TypeScript `survey/cogo.ts` layer:
//! - Coordinates are Northing (N) / Easting (E) / Elevation (Z).
//! - Azimuth is clockwise from North, in DECIMAL DEGREES [0, 360).
//! - Distances are horizontal (plan) metres.
//! - All functions are pure and side-effect-free to compile cleanly to WASM.

use crate::SurveyError;
use serde::{Deserialize, Serialize};

const DEG: f64 = 180.0 / std::f64::consts::PI;
const RAD: f64 = std::f64::consts::PI / 180.0;
const EPSILON: f64 = 1e-12;

fn finite_or(label: &str, value: f64) -> crate::Result<f64> {
    if value.is_finite() {
        Ok(value)
    } else {
        Err(SurveyError::InvalidParameter {
            name: label.into(),
            value: value.to_string(),
        })
    }
}

/// Plan coordinate pair (Northing, Easting).
#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
pub struct Ne {
    pub n: f64,
    pub e: f64,
}

impl Ne {
    pub fn new(n: f64, e: f64) -> Self {
        Self { n, e }
    }
}

/// Normalise an azimuth (degrees) into the range [0, 360).
pub fn normalize_azimuth(az_deg: f64) -> f64 {
    let mut a = az_deg % 360.0;
    if a < 0.0 {
        a += 360.0;
    }
    a
}

/// Forward computation from a start point, azimuth and horizontal distance.
pub fn forward(start: &Ne, azimuth_deg: f64, distance: f64) -> crate::Result<Ne> {
    finite_or("distance", distance)?;
    let az = normalize_azimuth(azimuth_deg) * RAD;
    Ok(Ne {
        n: start.n + distance * az.cos(),
        e: start.e + distance * az.sin(),
    })
}

/// Inverse azimuth and horizontal distance from `from` to `to`.
pub fn inverse(from: &Ne, to: &Ne) -> crate::Result<(f64, f64)> {
    let dn = to.n - from.n;
    let de = to.e - from.e;
    let distance = dn.hypot(de);
    if distance < EPSILON {
        return Err(SurveyError::DegenerateGeometry {
            reason: "inverse on coincident points".into(),
        });
    }
    let azimuth = normalize_azimuth(de.atan2(dn) * DEG);
    Ok((azimuth, distance))
}

/// Stake-out / setting-out elements.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct StakeOutResult {
    pub azimuth: f64,
    pub distance: f64,
    pub backsight_azimuth: f64,
    pub angle_right: f64,
    pub along: f64,
    pub offset: f64,
    pub delta_z: Option<f64>,
}

pub fn stake_out(
    occupied: &Ne,
    backsight: &Ne,
    target: &Ne,
    occupied_z: Option<f64>,
    target_z: Option<f64>,
) -> crate::Result<StakeOutResult> {
    let (backsight_azimuth, _) = inverse(occupied, backsight)?;
    let (azimuth, distance) = inverse(occupied, target)?;
    let angle_right = normalize_azimuth(azimuth - backsight_azimuth);
    let rel = angle_right * RAD;
    let along = distance * rel.cos();
    let offset = distance * rel.sin();
    let delta_z = match (occupied_z, target_z) {
        (Some(a), Some(b)) => Some(b - a),
        _ => None,
    };
    Ok(StakeOutResult {
        azimuth,
        distance,
        backsight_azimuth,
        angle_right,
        along,
        offset,
        delta_z,
    })
}

/// Grade / slope as a ratio and percent.
pub fn grade(distance: f64, dz: f64) -> crate::Result<(f64, f64)> {
    finite_or("distance", distance)?;
    if distance.abs() < EPSILON {
        return Ok((0.0, 0.0));
    }
    let ratio = dz / distance;
    Ok((ratio, ratio * 100.0))
}

/// Bearing-bearing intersection.
pub fn intersection_bearing_bearing(
    p1: &Ne,
    az1_deg: f64,
    p2: &Ne,
    az2_deg: f64,
) -> crate::Result<Ne> {
    let a1 = normalize_azimuth(az1_deg) * RAD;
    let a2 = normalize_azimuth(az2_deg) * RAD;
    let d1n = a1.cos();
    let d1e = a1.sin();
    let d2n = a2.cos();
    let d2e = a2.sin();
    let denom = d1e * d2n - d1n * d2e;
    if denom.abs() < EPSILON {
        return Err(SurveyError::DegenerateGeometry {
            reason: "intersection rays are parallel".into(),
        });
    }
    let t = ((p2.e - p1.e) * d2n - (p2.n - p1.n) * d2e) / denom;
    Ok(Ne {
        n: p1.n + t * d1n,
        e: p1.e + t * d1e,
    })
}

/// Distance-distance intersection (two circles).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum DistanceDistanceIntersection {
    Two(Ne, Ne),
    One(Ne),
    None,
}

pub fn intersection_distance_distance(
    p1: &Ne,
    r1: f64,
    p2: &Ne,
    r2: f64,
) -> crate::Result<DistanceDistanceIntersection> {
    finite_or("r1", r1)?;
    finite_or("r2", r2)?;
    if r1 < 0.0 || r2 < 0.0 {
        return Err(SurveyError::InvalidParameter {
            name: "radius".into(),
            value: format!("{}, {}", r1, r2),
        });
    }
    let dn = p2.n - p1.n;
    let de = p2.e - p1.e;
    let d = dn.hypot(de);
    if d < EPSILON {
        return Ok(DistanceDistanceIntersection::None);
    }
    if d > r1 + r2 + 1e-9 {
        return Ok(DistanceDistanceIntersection::None);
    }
    if d < (r1 - r2).abs() - 1e-9 {
        return Ok(DistanceDistanceIntersection::None);
    }
    let a = (r1 * r1 - r2 * r2 + d * d) / (2.0 * d);
    let h_sq = r1 * r1 - a * a;
    let h = if h_sq > 0.0 { h_sq.sqrt() } else { 0.0 };
    let mn = p1.n + (a * dn) / d;
    let me = p1.e + (a * de) / d;
    if h < EPSILON {
        return Ok(DistanceDistanceIntersection::One(Ne::new(mn, me)));
    }
    let off_n = (h * de) / d;
    let off_e = (h * dn) / d;
    Ok(DistanceDistanceIntersection::Two(
        Ne::new(mn + off_n, me - off_e),
        Ne::new(mn - off_n, me + off_e),
    ))
}

/// Polygon area by the shoelace formula; first point does not need to be repeated.
pub fn polygon_area(points: &[Ne]) -> crate::Result<f64> {
    if points.len() < 3 {
        return Err(SurveyError::InsufficientPoints {
            got: points.len(),
            need: 3,
        });
    }
    let mut sum = 0.0;
    for i in 0..points.len() {
        let a = points[i];
        let b = points[(i + 1) % points.len()];
        sum += a.e * b.n - b.e * a.n;
    }
    Ok(sum.abs() / 2.0)
}

/// Perimeter of an open polyline.
pub fn polyline_length(points: &[Ne]) -> crate::Result<f64> {
    if points.len() < 2 {
        return Err(SurveyError::InsufficientPoints {
            got: points.len(),
            need: 2,
        });
    }
    let mut total = 0.0;
    for i in 1..points.len() {
        let dn = points[i].n - points[i - 1].n;
        let de = points[i].e - points[i - 1].e;
        total += dn.hypot(de);
    }
    Ok(total)
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct TraverseLeg {
    pub azimuth: f64,
    pub distance: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TraverseType {
    ClosedLoop,
    ClosedLink,
    Open,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TraverseResult {
    pub traverse_type: TraverseType,
    pub computed: Vec<Ne>,
    pub misclosure_n: f64,
    pub misclosure_e: f64,
    pub linear_misclosure: f64,
    pub perimeter: f64,
    pub precision: f64,
    pub adjusted: Vec<Ne>,
    pub has_closure: bool,
}

pub fn compute_traverse(
    start: &Ne,
    legs: &[TraverseLeg],
    traverse_type: TraverseType,
    closing_point: Option<&Ne>,
) -> crate::Result<TraverseResult> {
    if legs.is_empty() {
        return Err(SurveyError::InsufficientPoints { got: 0, need: 1 });
    }
    let mut computed = vec![*start];
    let mut perimeter = 0.0;
    for leg in legs {
        let prev = *computed.last().unwrap();
        computed.push(forward(&prev, leg.azimuth, leg.distance)?);
        perimeter += leg.distance;
    }
    let last = *computed.last().unwrap();

    let expected_close = match traverse_type {
        TraverseType::ClosedLoop => Some(*start),
        TraverseType::ClosedLink => closing_point.copied(),
        TraverseType::Open => None,
    };
    let has_closure = expected_close.is_some();
    if has_closure && expected_close.is_none() {
        return Err(SurveyError::InvalidParameter {
            name: "closing_point".into(),
            value: "missing".into(),
        });
    }

    let expected = expected_close.unwrap_or(*start);
    let misclosure_n = last.n - expected.n;
    let misclosure_e = last.e - expected.e;
    let linear_misclosure = if has_closure {
        misclosure_n.hypot(misclosure_e)
    } else {
        0.0
    };

    const MISCLOSURE_EPSILON: f64 = 1e-9;
    let precision = if !has_closure || linear_misclosure < MISCLOSURE_EPSILON {
        f64::INFINITY
    } else {
        perimeter / linear_misclosure
    };

    let mut adjusted = vec![*start];
    let mut cumulative = 0.0;
    for leg in legs {
        cumulative += leg.distance;
        let ratio = if !has_closure || perimeter < EPSILON {
            0.0
        } else {
            cumulative / perimeter
        };
        let raw = *computed.get(adjusted.len()).unwrap();
        adjusted.push(Ne {
            n: raw.n - misclosure_n * ratio,
            e: raw.e - misclosure_e * ratio,
        });
    }

    Ok(TraverseResult {
        traverse_type,
        computed,
        misclosure_n,
        misclosure_e,
        linear_misclosure,
        perimeter,
        precision,
        adjusted,
        has_closure,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TraverseAngleMode {
    Interior,
    Deflection,
    AngleRight,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AngularObservation {
    pub angle: f64,
    pub distance: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AngularTraverseResult {
    pub azimuths: Vec<f64>,
    pub legs: Vec<TraverseLeg>,
    pub angle_sum: f64,
    pub theoretical_sum: f64,
    pub angular_misclosure: f64,
    pub per_angle_correction: f64,
    pub has_angular_closure: bool,
}

pub fn reduce_angular_traverse(
    start_azimuth: f64,
    observations: &[AngularObservation],
    mode: TraverseAngleMode,
    closed: bool,
) -> crate::Result<AngularTraverseResult> {
    if observations.is_empty() {
        return Err(SurveyError::InsufficientPoints { got: 0, need: 1 });
    }
    let n = observations.len();
    let angle_sum: f64 = observations.iter().map(|o| o.angle).sum();

    let mut theoretical_sum = 0.0;
    let mut has_angular_closure = false;
    if closed && n >= 3 {
        has_angular_closure = true;
        theoretical_sum = match mode {
            TraverseAngleMode::Interior => (n as f64 - 2.0) * 180.0,
            TraverseAngleMode::Deflection => 360.0,
            TraverseAngleMode::AngleRight => (n as f64 + 2.0) * 180.0,
        };
    }

    let angular_misclosure = if has_angular_closure {
        angle_sum - theoretical_sum
    } else {
        0.0
    };
    let per_angle_correction = if has_angular_closure && n > 0 {
        -angular_misclosure / n as f64
    } else {
        0.0
    };

    let mut azimuths = Vec::with_capacity(n);
    let mut az = normalize_azimuth(start_azimuth);
    for o in observations {
        let corrected = o.angle + per_angle_correction;
        az = normalize_azimuth(match mode {
            TraverseAngleMode::Interior => az + 180.0 - corrected,
            TraverseAngleMode::Deflection => az + corrected,
            TraverseAngleMode::AngleRight => az + corrected - 180.0,
        });
        azimuths.push(az);
    }

    let legs = observations
        .iter()
        .zip(azimuths.iter())
        .map(|(o, &a)| TraverseLeg {
            azimuth: a,
            distance: o.distance,
        })
        .collect();

    Ok(AngularTraverseResult {
        azimuths,
        legs,
        angle_sum,
        theoretical_sum,
        angular_misclosure,
        per_angle_correction,
        has_angular_closure,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StaffKind {
    Bs,
    Is,
    Fs,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LevellingReading {
    pub label: String,
    pub kind: StaffKind,
    pub reading: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LevellingRow {
    pub label: String,
    pub bs: Option<f64>,
    pub is: Option<f64>,
    pub fs: Option<f64>,
    pub hpc: Option<f64>,
    pub rise: Option<f64>,
    pub fall: Option<f64>,
    pub rl: f64,
    pub adjusted_rl: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LevellingMethod {
    RiseFall,
    Hpc,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LevellingResult {
    pub method: LevellingMethod,
    pub rows: Vec<LevellingRow>,
    pub sum_bs: f64,
    pub sum_fs: f64,
    pub sum_rise: f64,
    pub sum_fall: f64,
    pub bs_minus_fs: f64,
    pub rise_minus_fall: f64,
    pub last_minus_first: f64,
    pub check_ok: bool,
    pub misclose: Option<f64>,
}

const LEVEL_EPS: f64 = 1e-6;

pub fn reduce_levelling(
    readings: &[LevellingReading],
    start_rl: f64,
    method: LevellingMethod,
    known_closing_rl: Option<f64>,
) -> crate::Result<LevellingResult> {
    if readings.is_empty() {
        return Err(SurveyError::InsufficientPoints { got: 0, need: 1 });
    }
    if !matches!(readings[0].kind, StaffKind::Bs) {
        return Err(SurveyError::InvalidParameter {
            name: "first reading kind".into(),
            value: "must be BS".into(),
        });
    }

    let mut rows = Vec::with_capacity(readings.len());
    let mut sum_bs = 0.0;
    let mut sum_fs = 0.0;
    let mut sum_rise = 0.0;
    let mut sum_fall = 0.0;
    let mut prev_reading = readings[0].reading;
    let mut prev_rl = start_rl;
    let mut hpc = start_rl + readings[0].reading;

    for (i, r) in readings.iter().enumerate() {
        let mut row = LevellingRow {
            label: r.label.clone(),
            bs: None,
            is: None,
            fs: None,
            hpc: None,
            rise: None,
            fall: None,
            rl: prev_rl,
            adjusted_rl: prev_rl,
        };

        if i == 0 {
            row.bs = Some(r.reading);
            row.rl = start_rl;
            sum_bs += r.reading;
            row.hpc = Some(hpc);
            rows.push(row);
            continue;
        }

        match r.kind {
            StaffKind::Bs => {
                // New instrument setup on the current turning point. Its RL was
                // established by the previous FS/IS; the BS only sets the new HPC.
                row.rl = prev_rl;
                row.bs = Some(r.reading);
                sum_bs += r.reading;
                hpc = prev_rl + r.reading;
                row.hpc = Some(hpc);
                // No rise/fall for a turning-point backsight row.
            }
            StaffKind::Is | StaffKind::Fs => {
                let rl = hpc - r.reading;
                row.rl = rl;
                if matches!(r.kind, StaffKind::Is) {
                    row.is = Some(r.reading);
                } else {
                    row.fs = Some(r.reading);
                    sum_fs += r.reading;
                }
                if matches!(method, LevellingMethod::Hpc) {
                    row.hpc = Some(hpc);
                } else {
                    let diff = prev_reading - r.reading;
                    if diff >= 0.0 {
                        row.rise = Some(diff);
                        sum_rise += diff;
                    } else {
                        row.fall = Some(-diff);
                        sum_fall += -diff;
                    }
                }
            }
        }

        row.adjusted_rl = row.rl;
        prev_reading = r.reading;
        prev_rl = row.rl;
        rows.push(row);
    }

    let first_rl = rows.first().map(|r| r.rl).unwrap_or(start_rl);
    let last_rl = rows.last().map(|r| r.rl).unwrap_or(start_rl);
    let bs_minus_fs = sum_bs - sum_fs;
    let rise_minus_fall = sum_rise - sum_fall;
    let last_minus_first = last_rl - first_rl;
    let check_ok = (bs_minus_fs - last_minus_first).abs() < LEVEL_EPS
        && (matches!(method, LevellingMethod::Hpc)
            || (rise_minus_fall - last_minus_first).abs() < LEVEL_EPS);

    let mut misclose: Option<f64> = None;
    if let Some(closing) = known_closing_rl {
        if closing.is_finite() {
            let m = last_rl - closing;
            misclose = Some(m);
            let setups = rows.iter().filter(|r| r.fs.is_some()).count().max(1);
            let per_setup = m / setups as f64;
            let mut completed = 0usize;
            for row in &mut rows {
                row.adjusted_rl = row.rl - completed as f64 * per_setup;
                if row.fs.is_some() {
                    completed += 1;
                    row.adjusted_rl = row.rl - completed as f64 * per_setup;
                }
            }
            if let Some(last) = rows.last_mut() {
                last.adjusted_rl = closing;
            }
        }
    }

    Ok(LevellingResult {
        method,
        rows,
        sum_bs,
        sum_fs,
        sum_rise,
        sum_fall,
        bs_minus_fs,
        rise_minus_fall,
        last_minus_first,
        check_ok,
        misclose,
    })
}

/// One interior angle of a triangle at vertex `at`.
fn triangle_angle_at(at: &Ne, p1: &Ne, p2: &Ne) -> crate::Result<f64> {
    let (a1, _) = inverse(at, p1)?;
    let (a2, _) = inverse(at, p2)?;
    let mut d = (a1 - a2).abs() % 360.0;
    if d > 180.0 {
        d = 360.0 - d;
    }
    Ok(d)
}

/// Tienstra three-point resection.
pub fn resection_tienstra(
    a: &Ne,
    b: &Ne,
    c: &Ne,
    alpha: f64,
    beta: f64,
    gamma: f64,
) -> crate::Result<Ne> {
    let ang_a = triangle_angle_at(a, b, c)?;
    let ang_b = triangle_angle_at(b, c, a)?;
    let ang_c = triangle_angle_at(c, a, b)?;

    let cot = |deg: f64| -> crate::Result<f64> {
        let t = (deg * RAD).tan();
        if t.abs() < EPSILON {
            return Err(SurveyError::DegenerateGeometry {
                reason: "cotangent near zero in Tienstra resection".into(),
            });
        }
        Ok(1.0 / t)
    };

    let cot_a = cot(ang_a)?;
    let cot_b = cot(ang_b)?;
    let cot_c = cot(ang_c)?;
    let cot_alpha = cot(alpha)?;
    let cot_beta = cot(beta)?;
    let cot_gamma = cot(gamma)?;

    let k1 = 1.0 / (cot_a - cot_alpha);
    let k2 = 1.0 / (cot_b - cot_beta);
    let k3 = 1.0 / (cot_c - cot_gamma);
    let sum = k1 + k2 + k3;
    if !sum.is_finite() || sum.abs() < EPSILON {
        return Err(SurveyError::DegenerateGeometry {
            reason: "Tienstra denominator invalid".into(),
        });
    }
    let n = (k1 * a.n + k2 * b.n + k3 * c.n) / sum;
    let e = (k1 * a.e + k2 * b.e + k3 * c.e) / sum;
    if !n.is_finite() || !e.is_finite() {
        return Err(SurveyError::ComputationFailed {
            message: "Tienstra produced non-finite coordinates".into(),
        });
    }
    Ok(Ne::new(n, e))
}

pub const EARTH_MEAN_RADIUS: f64 = 6_371_000.0;

pub fn height_scale_factor(height_meters: f64, earth_radius: f64) -> crate::Result<f64> {
    finite_or("height_meters", height_meters)?;
    finite_or("earth_radius", earth_radius)?;
    Ok(earth_radius / (earth_radius + height_meters))
}

pub fn combined_scale_factor(
    point_scale_factor: f64,
    height_meters: f64,
    earth_radius: f64,
) -> crate::Result<f64> {
    height_scale_factor(height_meters, earth_radius).map(|hsf| point_scale_factor * hsf)
}

/// Reduce a ground (measured) distance to grid using the combined scale factor.
///
/// grid_distance = ground_distance × combined_scale_factor
pub fn ground_to_grid(ground_distance: f64, combined_sf: f64) -> crate::Result<f64> {
    finite_or("ground_distance", ground_distance)?;
    finite_or("combined_sf", combined_sf)?;
    Ok(ground_distance * combined_sf)
}

/// Expand a grid distance to ground using the combined scale factor.
///
/// ground_distance = grid_distance / combined_scale_factor
pub fn grid_to_ground(grid_distance: f64, combined_sf: f64) -> crate::Result<f64> {
    finite_or("grid_distance", grid_distance)?;
    finite_or("combined_sf", combined_sf)?;
    if combined_sf.abs() < EPSILON {
        return Err(SurveyError::DegenerateGeometry {
            reason: "combined scale factor is zero".into(),
        });
    }
    Ok(grid_distance / combined_sf)
}

/// Grid-method volume from a row-major regular grid of elevations.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct GridVolumeResult {
    pub cut: f64,
    pub fill: f64,
    pub net: f64,
    pub cells: usize,
}

pub fn volume_grid(
    grid: &[Vec<f64>],
    cell_size_x: f64,
    cell_size_y: f64,
    base_level: f64,
) -> crate::Result<GridVolumeResult> {
    finite_or("cell_size_x", cell_size_x)?;
    finite_or("cell_size_y", cell_size_y)?;
    if grid.len() < 2 {
        return Err(SurveyError::InsufficientPoints {
            got: grid.len(),
            need: 2,
        });
    }
    let cell_area = cell_size_x * cell_size_y;
    let mut cut = 0.0;
    let mut fill = 0.0;
    let mut cells = 0usize;
    for r in 0..grid.len() - 1 {
        let row = &grid[r];
        let next = &grid[r + 1];
        let cols = row.len().min(next.len());
        for c in 0..cols.saturating_sub(1) {
            let corners = [row[c], row[c + 1], next[c], next[c + 1]];
            if !corners.iter().all(|v| v.is_finite()) {
                continue;
            }
            let mean_depth = corners.iter().sum::<f64>() / 4.0 - base_level;
            let vol = mean_depth * cell_area;
            if vol >= 0.0 {
                cut += vol;
            } else {
                fill += -vol;
            }
            cells += 1;
        }
    }
    Ok(GridVolumeResult {
        cut,
        fill,
        net: cut - fill,
        cells,
    })
}

/// A cross-section at a known chainage, used for road/rail/drain earthworks.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct CrossSection {
    /// Chainage / station along the alignment (m).
    pub chainage: f64,
    /// Cross-sectional area at that chainage (m²).
    pub area: f64,
}

/// Volume between successive cross-sections using the end-area (trapezoidal)
/// method: V = Σ ((Aᵢ + Aᵢ₊₁) / 2) · (chainageᵢ₊₁ − chainageᵢ).
///
/// Sections are sorted by chainage internally.
pub fn volume_end_area(sections: &[CrossSection]) -> f64 {
    if sections.len() < 2 {
        return 0.0;
    }
    let mut sorted = sections.to_vec();
    sorted.sort_by(|a, b| {
        a.chainage
            .partial_cmp(&b.chainage)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let mut total = 0.0;
    for i in 0..sorted.len() - 1 {
        let h = sorted[i + 1].chainage - sorted[i].chainage;
        if h <= 0.0 || !h.is_finite() {
            continue;
        }
        total += ((sorted[i].area + sorted[i + 1].area) / 2.0) * h;
    }
    total
}

/// Prismoidal volume using Simpson's 1/3 rule.
///
/// Requires an odd number of equally-spaced cross-sections; returns `None`
/// when the sections do not fit.
pub fn volume_prismoidal(sections: &[CrossSection]) -> Option<f64> {
    if sections.len() < 3 {
        return None;
    }
    let mut sorted = sections.to_vec();
    sorted.sort_by(|a, b| {
        a.chainage
            .partial_cmp(&b.chainage)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let n = sorted.len();
    if n % 2 == 0 {
        return None;
    }
    let h = sorted[1].chainage - sorted[0].chainage;
    if h <= 0.0 || !h.is_finite() {
        return None;
    }
    const SPACING_TOL: f64 = 1e-6;
    for i in 1..n - 1 {
        if (sorted[i + 1].chainage - sorted[i].chainage - h).abs() > SPACING_TOL {
            return None;
        }
    }
    let mut sum = sorted[0].area + sorted[n - 1].area;
    for i in 1..n - 1 {
        sum += if i % 2 == 1 { 4.0 } else { 2.0 } * sorted[i].area;
    }
    Some((sum * h) / 3.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn forward_and_inverse_are_consistent() {
        let start = Ne::new(1000.0, 2000.0);
        let target = forward(&start, 123.4, 50.0).unwrap();
        let (az, dist) = inverse(&start, &target).unwrap();
        assert!((az - 123.4).abs() < 1e-9);
        assert!((dist - 50.0).abs() < 1e-9);
    }

    #[test]
    fn stake_out_angle_right_on_perpendicular() {
        let occ = Ne::new(0.0, 0.0);
        let bs = Ne::new(10.0, 0.0);
        let target = Ne::new(0.0, 10.0);
        let so = stake_out(&occ, &bs, &target, None, None).unwrap();
        assert!((so.angle_right - 90.0).abs() < 1e-9);
        assert!((so.distance - 10.0).abs() < 1e-9);
        assert!((so.offset - 10.0).abs() < 1e-9);
    }

    #[test]
    fn bearing_bearing_intersection() {
        let p1 = Ne::new(0.0, 0.0);
        let p2 = Ne::new(10.0, 0.0);
        let p = intersection_bearing_bearing(&p1, 45.0, &p2, 135.0).unwrap();
        assert!((p.n - 5.0).abs() < 1e-9);
        assert!((p.e - 5.0).abs() < 1e-9);
    }

    #[test]
    fn distance_distance_intersection() {
        let p1 = Ne::new(0.0, 0.0);
        let p2 = Ne::new(10.0, 0.0);
        match intersection_distance_distance(&p1, 10.0, &p2, 10.0).unwrap() {
            DistanceDistanceIntersection::Two(_, _) => {}
            _ => panic!("expected two intersections"),
        }
    }

    #[test]
    fn polygon_area_square() {
        let pts = vec![
            Ne::new(0.0, 0.0),
            Ne::new(10.0, 0.0),
            Ne::new(10.0, 10.0),
            Ne::new(0.0, 10.0),
        ];
        assert!((polygon_area(&pts).unwrap() - 100.0).abs() < 1e-9);
    }

    #[test]
    fn closed_loop_traverse_adjusts_to_start() {
        let start = Ne::new(0.0, 0.0);
        let legs = vec![
            TraverseLeg {
                azimuth: 0.0,
                distance: 10.0,
            },
            TraverseLeg {
                azimuth: 90.0,
                distance: 10.0,
            },
            TraverseLeg {
                azimuth: 180.0,
                distance: 10.0,
            },
            TraverseLeg {
                azimuth: 270.0,
                distance: 9.9,
            }, // deliberate small misclosure
        ];
        let res = compute_traverse(&start, &legs, TraverseType::ClosedLoop, None).unwrap();
        assert!(res.has_closure);
        assert!(res.linear_misclosure > 0.0);
        assert!(res.precision.is_finite());
        let last = res.adjusted.last().unwrap();
        assert!((last.n - start.n).abs() < 1e-6);
        assert!((last.e - start.e).abs() < 1e-6);
    }

    #[test]
    fn reduce_levelling_check_ok() {
        let readings = vec![
            LevellingReading {
                label: "BM".into(),
                kind: StaffKind::Bs,
                reading: 1.5,
            },
            LevellingReading {
                label: "TP1".into(),
                kind: StaffKind::Fs,
                reading: 0.5,
            },
            LevellingReading {
                label: "TP1".into(),
                kind: StaffKind::Bs,
                reading: 1.2,
            },
            LevellingReading {
                label: "A".into(),
                kind: StaffKind::Fs,
                reading: 0.8,
            },
        ];
        let res = reduce_levelling(&readings, 100.0, LevellingMethod::RiseFall, None).unwrap();
        assert!(res.check_ok);
        // BM -> TP1: +1.0; TP1 -> A: +0.4 => A = 101.4
        assert!((res.rows.last().unwrap().rl - 101.4).abs() < 1e-9);
    }

    #[test]
    fn scale_factor_ground_grid_round_trip() {
        let hsf = height_scale_factor(1500.0, EARTH_MEAN_RADIUS).unwrap();
        let csf = combined_scale_factor(0.9996, 1500.0, EARTH_MEAN_RADIUS).unwrap();
        let ground = 100.0;
        let grid = ground_to_grid(ground, csf).unwrap();
        let back = grid_to_ground(grid, csf).unwrap();
        assert!((back - ground).abs() < 1e-9);
        // Height factor alone should be present in the combined factor.
        assert!((csf - 0.9996 * hsf).abs() < 1e-12);
    }

    #[test]
    fn end_area_volume_of_uniform_prism() {
        let sections = vec![
            CrossSection {
                chainage: 0.0,
                area: 20.0,
            },
            CrossSection {
                chainage: 10.0,
                area: 20.0,
            },
        ];
        assert!((volume_end_area(&sections) - 200.0).abs() < 1e-9);
    }

    #[test]
    fn prismoidal_volume_matches_pyramid() {
        // Three equally-spaced sections forming a prismoid: Simpson's 1/3 rule
        // over A0=0, A1=4, A2=0 with h=3 -> V = (3/3)*(0 + 0 + 4*4) = 16.
        let sections = vec![
            CrossSection {
                chainage: 0.0,
                area: 0.0,
            },
            CrossSection {
                chainage: 3.0,
                area: 4.0,
            },
            CrossSection {
                chainage: 6.0,
                area: 0.0,
            },
        ];
        assert!((volume_prismoidal(&sections).unwrap() - 16.0).abs() < 1e-9);
    }

    #[test]
    fn prismoidal_rejects_even_count() {
        let sections = vec![
            CrossSection {
                chainage: 0.0,
                area: 0.0,
            },
            CrossSection {
                chainage: 3.0,
                area: 4.0,
            },
            CrossSection {
                chainage: 6.0,
                area: 0.0,
            },
            CrossSection {
                chainage: 9.0,
                area: 2.0,
            },
        ];
        assert!(volume_prismoidal(&sections).is_none());
    }
}
