//! Resection / free-station computation.
//!
//! A free station determines the unknown instrument position by observing
//! azimuths and/or horizontal distances to known control stations. This module
//! implements a Gauss-Newton least-squares adjustment that handles any mixture
//! of bearing and distance observations, with optional per-observation weights.

use crate::cogo::{self, inverse, DistanceDistanceIntersection, Ne};
use crate::SurveyError;
use serde::{Deserialize, Serialize};

const RAD: f64 = std::f64::consts::PI / 180.0;

/// A single observation from the unknown station to a known control point.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Observation {
    pub station: Ne,
    /// Observed azimuth from the unknown station to the control point, in
    /// decimal degrees clockwise from North. Omit when the observation is a
    /// pure distance.
    pub azimuth_deg: Option<f64>,
    /// Observed horizontal distance from the unknown station to the control
    /// point. Omit when the observation is a pure bearing.
    pub distance: Option<f64>,
    /// Relative weight of this observation in the least-squares adjustment.
    /// When mixing bearings and distances the weights should reflect relative
    /// precision (e.g. 1 / σ²) so both observation types contribute sensibly.
    #[serde(default = "default_weight")]
    pub weight: f64,
}

fn default_weight() -> f64 {
    1.0
}

impl Observation {
    pub fn bearing(station: Ne, azimuth_deg: f64) -> Self {
        Self {
            station,
            azimuth_deg: Some(azimuth_deg),
            distance: None,
            weight: 1.0,
        }
    }

    pub fn distance(station: Ne, distance: f64) -> Self {
        Self {
            station,
            azimuth_deg: None,
            distance: Some(distance),
            weight: 1.0,
        }
    }

    pub fn bearing_and_distance(station: Ne, azimuth_deg: f64, distance: f64) -> Self {
        Self {
            station,
            azimuth_deg: Some(azimuth_deg),
            distance: Some(distance),
            weight: 1.0,
        }
    }

    pub fn with_weight(mut self, weight: f64) -> Self {
        self.weight = weight;
        self
    }
}

/// Result of a free-station resection.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FreeStationResult {
    pub position: Ne,
    /// Number of Gauss-Newton iterations performed.
    pub iterations: usize,
    /// Final sum of squared weighted residuals.
    pub sum_squared_residuals: f64,
    /// Root-mean-square of the unweighted residuals.
    pub rmse: f64,
}

/// Compute a free-station position from mixed bearing/distance observations.
///
/// - `observations` must contain at least two independent observations that
///   geometrically fix the position (e.g. two bearings, or one bearing + one
///   distance, or two distances).
/// - `initial_guess` is optional; when absent the function derives a starting
///   point from the first bearing-and-distance pair or from the centroid of the
///   observed stations.
pub fn free_station(
    observations: &[Observation],
    initial_guess: Option<&Ne>,
) -> crate::Result<FreeStationResult> {
    if observations.len() < 2 {
        return Err(SurveyError::InsufficientPoints {
            got: observations.len(),
            need: 2,
        });
    }

    let mut pos = initial_guess
        .copied()
        .unwrap_or(initial_estimate(observations)?);

    const MAX_ITER: usize = 50;
    const TOL: f64 = 1e-9;

    let mut last_ssr = f64::INFINITY;
    for iteration in 0..MAX_ITER {
        let (at_a, at_r, ssr, rmse) = build_normals(observations, &pos);
        last_ssr = ssr;

        let det = at_a[0][0] * at_a[1][1] - at_a[0][1] * at_a[1][0];
        if det.abs() < 1e-24 {
            return Err(SurveyError::DegenerateGeometry {
                reason: "normal equations are singular; geometry is too weak".into(),
            });
        }

        let d_n = (at_r[0] * at_a[1][1] - at_r[1] * at_a[0][1]) / det;
        let d_e = (at_a[0][0] * at_r[1] - at_a[1][0] * at_r[0]) / det;

        pos.n += d_n;
        pos.e += d_e;

        if d_n.hypot(d_e) < TOL {
            return Ok(FreeStationResult {
                position: pos,
                iterations: iteration + 1,
                sum_squared_residuals: ssr,
                rmse,
            });
        }
    }

    // Return the best available result even if convergence was slow.
    Ok(FreeStationResult {
        position: pos,
        iterations: MAX_ITER,
        sum_squared_residuals: last_ssr,
        rmse: last_ssr.sqrt() / observations.len() as f64,
    })
}

fn initial_estimate(obs: &[Observation]) -> crate::Result<Ne> {
    // Prefer an exact solution from the first combined bearing+distance pair.
    for o in obs {
        if let (Some(az), Some(d)) = (o.azimuth_deg, o.distance) {
            let az_rad = normalize_azimuth(az) * RAD;
            return Ok(Ne {
                n: o.station.n - d * az_rad.cos(),
                e: o.station.e - d * az_rad.sin(),
            });
        }
    }

    // Otherwise use the first two observations that fix the point geometrically.
    if obs.len() >= 2 {
        // Two distances -> circle intersection.
        if obs[0].distance.is_some() && obs[1].distance.is_some() {
            let result = cogo::intersection_distance_distance(
                &obs[0].station,
                obs[0].distance.unwrap(),
                &obs[1].station,
                obs[1].distance.unwrap(),
            );
            match result {
                Ok(DistanceDistanceIntersection::Two(a, _)) => return Ok(a),
                Ok(DistanceDistanceIntersection::One(a)) => return Ok(a),
                _ => {}
            }
        }

        // Two bearings -> ray intersection.
        if let (Some(az1), Some(az2)) = (obs[0].azimuth_deg, obs[1].azimuth_deg) {
            let r1 = normalize_azimuth(az1) * RAD;
            let r2 = normalize_azimuth(az2) * RAD;
            let a = obs[0].station;
            let b = Ne::new(obs[0].station.n + r1.cos(), obs[0].station.e + r1.sin());
            let c = obs[1].station;
            let d = Ne::new(obs[1].station.n + r2.cos(), obs[1].station.e + r2.sin());
            if let Ok(p) = crate::intersections::line_line(&a, &b, &c, &d) {
                return Ok(p);
            }
        }
    }

    Err(SurveyError::DegenerateGeometry {
        reason: "initial estimate could not be formed from the supplied observations".into(),
    })
}

fn build_normals(obs: &[Observation], pos: &Ne) -> ([[f64; 2]; 2], [f64; 2], f64, f64) {
    let mut ata = [[0.0; 2]; 2];
    let mut atr = [0.0; 2];
    let mut ssr = 0.0;

    for o in obs {
        let dn = o.station.n - pos.n;
        let de = o.station.e - pos.e;
        let dist2 = dn * dn + de * de;
        let dist = dist2.sqrt();
        let w = o.weight;

        if let Some(az_deg) = o.azimuth_deg {
            let (computed_az, _) = inverse(pos, &o.station).unwrap_or((0.0, 0.0));
            let mut r = (computed_az - az_deg) * RAD;
            if r > std::f64::consts::PI {
                r -= 2.0 * std::f64::consts::PI;
            } else if r < -std::f64::consts::PI {
                r += 2.0 * std::f64::consts::PI;
            }
            // Partial derivatives of atan2(de, dn).
            if dist2 > 1e-24 {
                let a_n = de / dist2; // ∂r/∂n
                let a_e = -dn / dist2; // ∂r/∂e
                let row = [a_n, a_e];
                for i in 0..2 {
                    for j in 0..2 {
                        ata[i][j] += w * row[i] * row[j];
                    }
                    atr[i] -= w * row[i] * r;
                }
                ssr += w * r * r;
            }
        }

        if let Some(d_obs) = o.distance {
            let r = if dist > 1e-12 { dist - d_obs } else { -d_obs };
            if dist > 1e-12 {
                let a_n = -dn / dist;
                let a_e = -de / dist;
                let row = [a_n, a_e];
                for i in 0..2 {
                    for j in 0..2 {
                        ata[i][j] += w * row[i] * row[j];
                    }
                    atr[i] -= w * row[i] * r;
                }
                ssr += w * r * r;
            }
        }
    }

    let rmse = if obs.is_empty() {
        0.0
    } else {
        (ssr / obs.len() as f64).sqrt()
    };
    (ata, atr, ssr, rmse)
}

fn normalize_azimuth(deg: f64) -> f64 {
    let mut a = deg % 360.0;
    if a < 0.0 {
        a += 360.0;
    }
    a
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn free_station_from_three_distances() {
        // Unknown at (10, 20); three horizontal distances to known stations.
        let obs = vec![
            Observation::distance(Ne::new(0.0, 0.0), 10.0f64.hypot(20.0)),
            Observation::distance(Ne::new(30.0, 0.0), 20.0f64.hypot(20.0)),
            Observation::distance(Ne::new(10.0, 30.0), 10.0),
        ];
        let res = free_station(&obs, None).unwrap();
        assert!((res.position.n - 10.0).abs() < 1e-6, "n={}", res.position.n);
        assert!((res.position.e - 20.0).abs() < 1e-6, "e={}", res.position.e);
        assert!(res.rmse < 1e-6);
    }

    #[test]
    fn free_station_from_two_bearing_distance_pairs() {
        // Unknown at (5,5). Two combined observations:
        //   to (10,5): az=0°, distance 5
        //   to (5,10): az=90°, distance 5
        let obs = vec![
            Observation::bearing_and_distance(Ne::new(10.0, 5.0), 0.0, 5.0),
            Observation::bearing_and_distance(Ne::new(5.0, 10.0), 90.0, 5.0),
        ];
        let res = free_station(&obs, None).unwrap();
        assert!((res.position.n - 5.0).abs() < 1e-6, "n={}", res.position.n);
        assert!((res.position.e - 5.0).abs() < 1e-6, "e={}", res.position.e);
    }

    #[test]
    fn free_station_requires_two_observations() {
        assert!(free_station(&[], None).is_err());
    }

    #[test]
    fn free_station_initial_guess_used_when_supplied() {
        let obs = vec![
            Observation::bearing_and_distance(Ne::new(10.0, 5.0), 0.0, 5.0),
            Observation::bearing_and_distance(Ne::new(5.0, 10.0), 90.0, 5.0),
        ];
        let res = free_station(&obs, Some(&Ne::new(5.0, 5.0))).unwrap();
        assert!((res.position.n - 5.0).abs() < 1e-6);
        assert!((res.position.e - 5.0).abs() < 1e-6);
    }
}
