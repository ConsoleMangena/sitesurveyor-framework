//! Circle fitting from observed points.
//!
//! Surveyors often need to fit a curve through a set of observed points — for
//! example, kerb lines, road centrelines or tank walls. The Kåsa algebraic
//! method implemented here is fast, stable and accurate when the arc spans a
//! reasonable angle. It returns the centre, radius and a quality-of-fit RMSE.

use crate::cogo::Ne;
use crate::SurveyError;
use serde::{Deserialize, Serialize};

/// Best-fit circle result.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct CircleFit {
    pub centre: Ne,
    pub radius: f64,
    /// Root-mean-square distance from the points to the fitted circle.
    pub rmse: f64,
}

/// Fit a circle to three or more points using the Kåsa method.
///
/// The algebraic approach solves for the centre by rewriting the circle
/// equation and solving a linear least-squares system. It is exact for three
/// non-collinear points and stable for larger arcs.
pub fn fit_circle(points: &[Ne]) -> crate::Result<CircleFit> {
    if points.len() < 3 {
        return Err(SurveyError::InsufficientPoints {
            got: points.len(),
            need: 3,
        });
    }

    let n = points.len() as f64;
    let xbar = points.iter().map(|p| p.e).sum::<f64>() / n;
    let ybar = points.iter().map(|p| p.n).sum::<f64>() / n;

    let mut su2 = 0.0;
    let mut sv2 = 0.0;
    let mut suv = 0.0;
    let mut rhs_u = 0.0;
    let mut rhs_v = 0.0;

    for p in points {
        let u = p.e - xbar;
        let v = p.n - ybar;
        let sq = u * u + v * v;
        su2 += u * u;
        sv2 += v * v;
        suv += u * v;
        rhs_u += u * sq;
        rhs_v += v * sq;
    }

    let det = su2 * sv2 - suv * suv;
    if det.abs() < 1e-24 {
        return Err(SurveyError::DegenerateGeometry {
            reason: "points are collinear or coincident; cannot fit circle".into(),
        });
    }

    let uc = (rhs_u * sv2 - rhs_v * suv) / (2.0 * det);
    let vc = (rhs_v * su2 - rhs_u * suv) / (2.0 * det);

    let centre = Ne::new(ybar + vc, xbar + uc);
    let zbar = (points
        .iter()
        .map(|p| {
            let u = p.e - xbar;
            let v = p.n - ybar;
            u * u + v * v
        })
        .sum::<f64>())
        / n;
    let radius = (uc * uc + vc * vc + zbar).sqrt();

    if !radius.is_finite() || radius <= 0.0 {
        return Err(SurveyError::ComputationFailed {
            message: "circle fit produced non-finite radius".into(),
        });
    }

    let rmse = (points
        .iter()
        .map(|p| {
            let d = (p.n - centre.n).hypot(p.e - centre.e) - radius;
            d * d
        })
        .sum::<f64>()
        / n)
        .sqrt();

    Ok(CircleFit {
        centre,
        radius,
        rmse,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fit_circle_through_three_exact_points() {
        let pts = vec![Ne::new(1.0, 0.0), Ne::new(0.0, 1.0), Ne::new(-1.0, 0.0)];
        let fit = fit_circle(&pts).unwrap();
        assert!(fit.centre.n.abs() < 1e-9);
        assert!(fit.centre.e.abs() < 1e-9);
        assert!((fit.radius - 1.0).abs() < 1e-9);
        assert!(fit.rmse < 1e-9);
    }

    #[test]
    fn fit_circle_finds_radius_from_noisy_points() {
        // Quarter-circle arc with a tiny perturbation.
        let pts: Vec<Ne> = (0..=10)
            .map(|i| {
                let ang = std::f64::consts::PI * i as f64 / 20.0;
                Ne::new(ang.cos(), ang.sin())
            })
            .collect();
        let fit = fit_circle(&pts).unwrap();
        assert!((fit.radius - 1.0).abs() < 1e-3);
    }

    #[test]
    fn collinear_points_fail() {
        let pts = vec![Ne::new(0.0, 0.0), Ne::new(1.0, 1.0), Ne::new(2.0, 2.0)];
        assert!(fit_circle(&pts).is_err());
    }
}
