//! Coordinate transformations for engineering survey.
//!
//! The most common field problem is fitting a local construction or total-
//! station coordinate system onto a project grid. A Helmert (similarity)
//! transform provides the standard 4-parameter solution: two translations, one
//! rotation and one scale. An affine transform adds independent scale and
//! skew for less rigid local distortions.
//!
//! All angles are in decimal degrees; distances/translation in project units.

use crate::cogo::Ne;
use crate::SurveyError;

/// A 2-D Helmert (similarity) transform: scale, rotation and translation.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct HelmertTransform {
    /// Uniform scale factor (source → target).
    pub scale: f64,
    /// Rotation angle clockwise from source axes to target axes, degrees.
    pub rotation_deg: f64,
    /// Translation in the Northing axis applied after rotation/scale.
    pub translation_n: f64,
    /// Translation in the Easting axis applied after rotation/scale.
    pub translation_e: f64,
}

impl HelmertTransform {
    /// Apply the transform to a point (source → target).
    pub fn apply(&self, p: &Ne) -> Ne {
        let r = self.rotation_deg.to_radians();
        let sn = r.sin();
        let cs = r.cos();
        Ne {
            n: self.translation_n + self.scale * (cs * p.n - sn * p.e),
            e: self.translation_e + self.scale * (sn * p.n + cs * p.e),
        }
    }

    /// Return the inverse transform (target → source).
    pub fn inverse(&self) -> HelmertTransform {
        let r = (-self.rotation_deg).to_radians();
        let sn = r.sin();
        let cs = r.cos();
        let s = 1.0 / self.scale;
        HelmertTransform {
            scale: s,
            rotation_deg: -self.rotation_deg,
            translation_n: -(cs * self.translation_n - sn * self.translation_e) * s,
            translation_e: -(sn * self.translation_n + cs * self.translation_e) * s,
        }
    }
}

/// Fit a Helmert transform from matching source/target control points.
///
/// Requires at least two non-coincident source points. Returns a transform that
/// maps `source[i]` as closely as possible to `target[i]` in a least-squares
/// sense. The same number of points must be supplied in both arrays.
pub fn helmert_fit(source: &[Ne], target: &[Ne]) -> crate::Result<HelmertTransform> {
    if source.len() != target.len() {
        return Err(SurveyError::InvalidParameter {
            name: "source/target".into(),
            value: format!("{} / {}", source.len(), target.len()),
        });
    }
    if source.len() < 2 {
        return Err(SurveyError::InsufficientPoints {
            got: source.len(),
            need: 2,
        });
    }

    let centroid = |pts: &[Ne]| {
        let mut n = 0.0;
        let mut e = 0.0;
        for p in pts {
            n += p.n;
            e += p.e;
        }
        let k = pts.len() as f64;
        Ne::new(n / k, e / k)
    };

    let cs = centroid(source);
    let ct = centroid(target);

    let mut sum_a2 = 0.0; // |source - centroid|^2
    let mut re = 0.0; // Re(conj(a) * b)
    let mut im = 0.0; // Im(conj(a) * b)
    for (a, b) in source.iter().zip(target.iter()) {
        let an = a.n - cs.n;
        let ae = a.e - cs.e;
        let bn = b.n - ct.n;
        let be = b.e - ct.e;
        sum_a2 += an * an + ae * ae;
        re += ae * be + an * bn;
        im += ae * bn - an * be;
    }

    const EPS: f64 = 1e-24;
    if sum_a2 < EPS {
        return Err(SurveyError::DegenerateGeometry {
            reason: "source control points are coincident; cannot determine rotation/scale".into(),
        });
    }

    let s_re = re / sum_a2;
    let s_im = im / sum_a2;
    let scale = s_re.hypot(s_im);
    // The negative sign keeps the recovered angle on the same convention as
    // `HelmertTransform::apply`, which treats positive angles as clockwise from
    // the source axes (matching survey azimuth conventions).
    let rotation_deg = -s_im.atan2(s_re).to_degrees();

    if !scale.is_finite() || !rotation_deg.is_finite() {
        return Err(SurveyError::ComputationFailed {
            message: "Helmert fit produced non-finite parameters".into(),
        });
    }

    let r = rotation_deg.to_radians();
    let sn = r.sin();
    let cs_rot = r.cos();
    let translation_n = ct.n - scale * (cs_rot * cs.n - sn * cs.e);
    let translation_e = ct.e - scale * (sn * cs.n + cs_rot * cs.e);

    Ok(HelmertTransform {
        scale,
        rotation_deg,
        translation_n,
        translation_e,
    })
}

/// Residual vector between a transformed source point and its target control.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Residual {
    pub n: f64,
    pub e: f64,
}

impl Residual {
    /// Euclidean magnitude of the residual vector.
    pub fn magnitude(&self) -> f64 {
        (self.n * self.n + self.e * self.e).sqrt()
    }
}

/// Quality-of-fit diagnostics for a fitted transform.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TransformDiagnostics {
    pub residuals: Vec<Residual>,
    /// Root-mean-square of the residual magnitudes.
    pub rmse: f64,
    /// Maximum residual magnitude.
    pub max_offset: f64,
    /// Index of the control pair that produced `max_offset`.
    pub max_index: usize,
}

/// Compute the residual (target − transformed source) for every control pair.
pub fn helmert_residuals(
    transform: &HelmertTransform,
    source: &[Ne],
    target: &[Ne],
) -> crate::Result<Vec<Residual>> {
    if source.len() != target.len() {
        return Err(SurveyError::InvalidParameter {
            name: "source/target".into(),
            value: format!("{} / {}", source.len(), target.len()),
        });
    }
    Ok(source
        .iter()
        .zip(target.iter())
        .map(|(s, t)| {
            let p = transform.apply(s);
            Residual {
                n: t.n - p.n,
                e: t.e - p.e,
            }
        })
        .collect())
}

/// Compute diagnostics for a Helmert transform against a set of control pairs.
pub fn helmert_diagnostics(
    transform: &HelmertTransform,
    source: &[Ne],
    target: &[Ne],
) -> crate::Result<TransformDiagnostics> {
    diagnostics(transform, source, target, &|p| transform.apply(p))
}

fn diagnostics<F: Fn(&Ne) -> Ne>(
    _transform: &impl Copy,
    source: &[Ne],
    target: &[Ne],
    apply: &F,
) -> crate::Result<TransformDiagnostics> {
    if source.len() != target.len() {
        return Err(SurveyError::InvalidParameter {
            name: "source/target".into(),
            value: format!("{} / {}", source.len(), target.len()),
        });
    }
    if source.is_empty() {
        return Ok(TransformDiagnostics {
            residuals: Vec::new(),
            rmse: 0.0,
            max_offset: 0.0,
            max_index: 0,
        });
    }

    let mut residuals = Vec::with_capacity(source.len());
    let mut sum_sq = 0.0;
    let mut max_offset = 0.0;
    let mut max_index = 0;

    for (i, (s, t)) in source.iter().zip(target.iter()).enumerate() {
        let p = apply(s);
        let r = Residual {
            n: t.n - p.n,
            e: t.e - p.e,
        };
        let m = r.magnitude();
        sum_sq += m * m;
        if m > max_offset {
            max_offset = m;
            max_index = i;
        }
        residuals.push(r);
    }

    let rmse = (sum_sq / source.len() as f64).sqrt();
    Ok(TransformDiagnostics {
        residuals,
        rmse,
        max_offset,
        max_index,
    })
}

/// Identify control pairs whose residual magnitude exceeds `threshold * rmse`.
///
/// The transform is first fitted to all points, then diagnostics are
/// evaluated. Returns indices of suspicious points; an empty vector means no
/// outliers were detected at the given threshold.
pub fn detect_outliers(
    source: &[Ne],
    target: &[Ne],
    threshold_multiplier: f64,
) -> crate::Result<Vec<usize>> {
    if source.len() != target.len() {
        return Err(SurveyError::InvalidParameter {
            name: "source/target".into(),
            value: format!("{} / {}", source.len(), target.len()),
        });
    }
    if threshold_multiplier <= 0.0 {
        return Err(SurveyError::InvalidParameter {
            name: "threshold_multiplier".into(),
            value: threshold_multiplier.to_string(),
        });
    }

    let transform = helmert_fit(source, target)?;
    let diag = helmert_diagnostics(&transform, source, target)?;
    if diag.rmse < 1e-12 {
        return Ok(Vec::new());
    }
    let cutoff = threshold_multiplier * diag.rmse;
    let mut outliers: Vec<usize> = diag
        .residuals
        .iter()
        .enumerate()
        .filter(|(_, r)| r.magnitude() > cutoff)
        .map(|(i, _)| i)
        .collect();
    outliers.sort_unstable();
    Ok(outliers)
}

/// A 6-parameter affine transform from source NE to target NE.
///
///   n' = a*n + b*e + c
///   e' = d*n + e*e + f
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct AffineTransform {
    pub a: f64,
    pub b: f64,
    pub c: f64,
    pub d: f64,
    pub ee: f64,
    pub f: f64,
}

impl AffineTransform {
    /// Apply the transform to a point (source → target).
    pub fn apply(&self, p: &Ne) -> Ne {
        Ne {
            n: self.a * p.n + self.b * p.e + self.c,
            e: self.d * p.n + self.ee * p.e + self.f,
        }
    }

    /// Compute residuals (target − transformed source) for every control pair.
    pub fn residuals(&self, source: &[Ne], target: &[Ne]) -> crate::Result<Vec<Residual>> {
        if source.len() != target.len() {
            return Err(SurveyError::InvalidParameter {
                name: "source/target".into(),
                value: format!("{} / {}", source.len(), target.len()),
            });
        }
        Ok(source
            .iter()
            .zip(target.iter())
            .map(|(s, t)| {
                let p = self.apply(s);
                Residual {
                    n: t.n - p.n,
                    e: t.e - p.e,
                }
            })
            .collect())
    }

    /// Diagnostics for the affine transform against a set of control pairs.
    pub fn diagnostics(&self, source: &[Ne], target: &[Ne]) -> crate::Result<TransformDiagnostics> {
        diagnostics(self, source, target, &|p| self.apply(p))
    }

    /// Return the inverse affine transform, or an error if it is singular.
    pub fn inverse(&self) -> crate::Result<AffineTransform> {
        let det = self.a * self.ee - self.b * self.d;
        if det.abs() < 1e-24 {
            return Err(SurveyError::DegenerateGeometry {
                reason: "affine transform is singular; cannot invert".into(),
            });
        }
        let inv_det = 1.0 / det;
        let a_inv = self.ee * inv_det;
        let b_inv = -self.b * inv_det;
        let d_inv = -self.d * inv_det;
        let e_inv = self.a * inv_det;
        Ok(AffineTransform {
            a: a_inv,
            b: b_inv,
            c: -(a_inv * self.c + b_inv * self.f),
            d: d_inv,
            ee: e_inv,
            f: -(d_inv * self.c + e_inv * self.f),
        })
    }
}

/// Fit a 6-parameter affine transform from matching control points.
///
/// Requires at least three non-collinear source points. A pure Helmert fit is
/// preferred when the distortion is rigid; affine is useful for local grid
/// distortions or scanned map registration.
pub fn affine_fit(source: &[Ne], target: &[Ne]) -> crate::Result<AffineTransform> {
    if source.len() != target.len() {
        return Err(SurveyError::InvalidParameter {
            name: "source/target".into(),
            value: format!("{} / {}", source.len(), target.len()),
        });
    }
    if source.len() < 3 {
        return Err(SurveyError::InsufficientPoints {
            got: source.len(),
            need: 3,
        });
    }

    // Build the 2n × 6 design matrix and 2n × 1 observation vector,
    // then solve the 6 × 6 normal equations A^T A x = A^T y.
    let n = source.len();
    let mut ata = [[0.0; 6]; 6];
    let mut aty = [0.0; 6];

    for i in 0..n {
        let sn = source[i].n;
        let se = source[i].e;
        let tn = target[i].n;
        let te = target[i].e;

        // Row for northing equation.
        let row_n = [sn, se, 1.0, 0.0, 0.0, 0.0];
        // Row for easting equation.
        let row_e = [0.0, 0.0, 0.0, sn, se, 1.0];

        for r in 0..6 {
            aty[r] += row_n[r] * tn + row_e[r] * te;
            for c in 0..6 {
                ata[r][c] += row_n[r] * row_n[c] + row_e[r] * row_e[c];
            }
        }
    }

    solve_6x6(&ata, &aty).map(|x| AffineTransform {
        a: x[0],
        b: x[1],
        c: x[2],
        d: x[3],
        ee: x[4],
        f: x[5],
    })
}

/// In-place Gaussian elimination with partial pivoting for a 6×6 system.
fn solve_6x6(a: &[[f64; 6]; 6], b: &[f64; 6]) -> crate::Result<[f64; 6]> {
    let mut m = *a;
    let mut y = *b;

    for col in 0..6 {
        // Partial pivot.
        let mut pivot_row = col;
        let mut pivot_val = m[col][col].abs();
        for row in (col + 1)..6 {
            if m[row][col].abs() > pivot_val {
                pivot_row = row;
                pivot_val = m[row][col].abs();
            }
        }
        if pivot_val < 1e-24 {
            return Err(SurveyError::DegenerateGeometry {
                reason: "affine normal equations are singular (source points collinear?)".into(),
            });
        }
        if pivot_row != col {
            m.swap(col, pivot_row);
            y.swap(col, pivot_row);
        }

        // Eliminate below.
        for row in (col + 1)..6 {
            let factor = m[row][col] / m[col][col];
            y[row] -= factor * y[col];
            for k in col..6 {
                m[row][k] -= factor * m[col][k];
            }
        }
    }

    // Back substitution.
    let mut x = [0.0; 6];
    for i in (0..6).rev() {
        let mut sum = y[i];
        for j in (i + 1)..6 {
            sum -= m[i][j] * x[j];
        }
        x[i] = sum / m[i][i];
    }
    Ok(x)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_helmert_leaves_points_unchanged() {
        let src = vec![Ne::new(0.0, 0.0), Ne::new(10.0, 0.0), Ne::new(0.0, 10.0)];
        let tgt = src.clone();
        let h = helmert_fit(&src, &tgt).unwrap();
        assert!((h.scale - 1.0).abs() < 1e-9);
        assert!(h.rotation_deg.abs() < 1e-9);
        for (s, t) in src.iter().zip(tgt.iter()) {
            let p = h.apply(s);
            assert!((p.n - t.n).abs() < 1e-9);
            assert!((p.e - t.e).abs() < 1e-9);
        }
    }

    #[test]
    fn helmert_recovers_rotation_scale_and_translation() {
        // Source square, target = rotated 90° clockwise, scaled 2×, shifted.
        let src = vec![
            Ne::new(0.0, 0.0),
            Ne::new(10.0, 0.0),
            Ne::new(10.0, 10.0),
            Ne::new(0.0, 10.0),
        ];
        let t = HelmertTransform {
            scale: 2.0,
            rotation_deg: 90.0,
            translation_n: 100.0,
            translation_e: 200.0,
        };
        let tgt: Vec<Ne> = src.iter().map(|p| t.apply(p)).collect();
        let fit = helmert_fit(&src, &tgt).unwrap();
        assert!((fit.scale - 2.0).abs() < 1e-9, "scale {}", fit.scale);
        assert!(
            (fit.rotation_deg - 90.0).abs() < 1e-9,
            "rotation {}",
            fit.rotation_deg
        );
        assert!((fit.translation_n - 100.0).abs() < 1e-9);
        assert!((fit.translation_e - 200.0).abs() < 1e-9);
    }

    #[test]
    fn inverse_helmert_round_trips() {
        let src = vec![Ne::new(1.0, 2.0), Ne::new(5.0, -3.0), Ne::new(-2.0, 7.0)];
        let t = HelmertTransform {
            scale: 0.9996,
            rotation_deg: 12.5,
            translation_n: 1000.0,
            translation_e: 2000.0,
        };
        let tgt: Vec<Ne> = src.iter().map(|p| t.apply(p)).collect();
        let inv = t.inverse();
        for (s, t_pt) in src.iter().zip(tgt.iter()) {
            let back = inv.apply(t_pt);
            assert!((back.n - s.n).abs() < 1e-9);
            assert!((back.e - s.e).abs() < 1e-9);
        }
    }

    #[test]
    fn helmert_fewer_than_two_points_fails() {
        assert!(helmert_fit(&[Ne::new(0.0, 0.0)], &[Ne::new(1.0, 1.0)]).is_err());
    }

    #[test]
    fn affine_recovers_known_mapping() {
        // Prescribed affine: n' = 1.1n + 0.05e + 100, e' = -0.03n + 0.95e - 50.
        let a = AffineTransform {
            a: 1.1,
            b: 0.05,
            c: 100.0,
            d: -0.03,
            ee: 0.95,
            f: -50.0,
        };
        let src = vec![
            Ne::new(0.0, 0.0),
            Ne::new(100.0, 0.0),
            Ne::new(0.0, 100.0),
            Ne::new(50.0, 50.0),
        ];
        let tgt: Vec<Ne> = src.iter().map(|p| a.apply(p)).collect();
        let fit = affine_fit(&src, &tgt).unwrap();
        assert!((fit.a - 1.1).abs() < 1e-9);
        assert!((fit.b - 0.05).abs() < 1e-9);
        assert!((fit.c - 100.0).abs() < 1e-9);
        assert!((fit.d + 0.03).abs() < 1e-9);
        assert!((fit.ee - 0.95).abs() < 1e-9);
        assert!((fit.f + 50.0).abs() < 1e-9);
    }

    #[test]
    fn collinear_source_affine_fails() {
        let src = vec![Ne::new(0.0, 0.0), Ne::new(1.0, 1.0), Ne::new(2.0, 2.0)];
        let tgt = vec![Ne::new(0.0, 0.0), Ne::new(1.0, 1.0), Ne::new(2.0, 2.0)];
        assert!(affine_fit(&src, &tgt).is_err());
    }

    #[test]
    fn helmert_diagnostics_reports_zero_for_perfect_fit() {
        let src = vec![Ne::new(0.0, 0.0), Ne::new(10.0, 0.0), Ne::new(0.0, 10.0)];
        let tgt = src.clone();
        let h = helmert_fit(&src, &tgt).unwrap();
        let d = helmert_diagnostics(&h, &src, &tgt).unwrap();
        assert!(d.rmse < 1e-9);
        assert!(d.max_offset < 1e-9);
        assert_eq!(d.residuals.len(), 3);
    }

    #[test]
    fn detect_outliers_flags_bad_control_point() {
        let src = vec![
            Ne::new(0.0, 0.0),
            Ne::new(10.0, 0.0),
            Ne::new(0.0, 10.0),
            Ne::new(10.0, 10.0),
        ];
        let mut tgt = src.clone();
        tgt[2].n += 100.0; // move one point far from the true square
        let outliers = detect_outliers(&src, &tgt, 1.0).unwrap();
        assert!(outliers.contains(&2));
    }

    #[test]
    fn affine_inverse_round_trips() {
        let a = AffineTransform {
            a: 1.1,
            b: 0.05,
            c: 100.0,
            d: -0.03,
            ee: 0.95,
            f: -50.0,
        };
        let inv = a.inverse().unwrap();
        let p = Ne::new(123.0, 456.0);
        let t = a.apply(&p);
        let back = inv.apply(&t);
        assert!((back.n - p.n).abs() < 1e-9);
        assert!((back.e - p.e).abs() < 1e-9);
    }
}
