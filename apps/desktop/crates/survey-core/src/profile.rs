//! Profile and cross-section extraction from a TIN along an alignment polyline.
//!
//! These are standard engineering-survey deliverables for roads, railways,
//! pipelines and drains: a long-section samples the ground elevation along the
//! centreline, while a cross-section samples elevations perpendicular to the
//! centreline at a given chainage.

use crate::{volume::sample_z, SurveyError, Tin, Vertex};

/// A single sampled point on a long-section profile.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct ProfilePoint {
    /// Chainage / horizontal distance from the start of the polyline.
    pub chainage: f64,
    pub n: f64,
    pub e: f64,
    /// Ground elevation sampled from the TIN, or `None` when outside the model.
    pub z: Option<f64>,
}

/// A single sampled point on a cross-section perpendicular to the centreline.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct CrossSectionPoint {
    /// Signed perpendicular offset from the centreline (negative left, positive
    /// right when looking along the direction of increasing chainage).
    pub offset: f64,
    pub n: f64,
    pub e: f64,
    /// Ground elevation sampled from the TIN, or `None` when outside the model.
    pub z: Option<f64>,
}

/// Extract a ground profile along `polyline` from the TIN.
///
/// When `spacing` is `None` or zero, only the polyline vertices are returned.
/// Otherwise points are generated every `spacing` (in horizontal plan units)
/// along the centreline and the TIN is sampled at each location.
pub fn extract_profile(
    tin: &Tin,
    polyline: &[Vertex],
    spacing: Option<f64>,
) -> crate::Result<Vec<ProfilePoint>> {
    if polyline.len() < 2 {
        return Err(SurveyError::InsufficientPoints {
            got: polyline.len(),
            need: 2,
        });
    }
    if tin.triangles.is_empty() {
        return Err(SurveyError::DegenerateGeometry {
            reason: "TIN has no triangles".into(),
        });
    }

    let (cum, total) = polyline_chainages(polyline);
    let spacing = spacing.unwrap_or(0.0).max(0.0);

    let samples: Vec<f64> = if spacing > 0.0 && total > 0.0 {
        let n = (total / spacing).ceil() as usize;
        (0..=n).map(|i| (i as f64 * spacing).min(total)).collect()
    } else {
        cum.clone()
    };

    Ok(samples
        .iter()
        .map(|&c| point_on_polyline(tin, polyline, &cum, c))
        .collect())
}

/// Extract a cross-section perpendicular to the centreline at `chainage`.
///
/// Points are generated from `-width/2` to `+width/2` at the requested
/// `spacing`. The section is oriented left-to-right when looking in the
/// direction of increasing chainage.
pub fn extract_cross_section(
    tin: &Tin,
    polyline: &[Vertex],
    chainage: f64,
    width: f64,
    spacing: f64,
) -> crate::Result<Vec<CrossSectionPoint>> {
    if polyline.len() < 2 {
        return Err(SurveyError::InsufficientPoints {
            got: polyline.len(),
            need: 2,
        });
    }
    if tin.triangles.is_empty() {
        return Err(SurveyError::DegenerateGeometry {
            reason: "TIN has no triangles".into(),
        });
    }
    if width <= 0.0 {
        return Err(SurveyError::InvalidParameter {
            name: "width".into(),
            value: width.to_string(),
        });
    }
    if spacing <= 0.0 {
        return Err(SurveyError::InvalidParameter {
            name: "spacing".into(),
            value: spacing.to_string(),
        });
    }

    let (cum, total) = polyline_chainages(polyline);
    if chainage < 0.0 || chainage > total {
        return Err(SurveyError::OutOfBounds {
            reason: format!("chainage {chainage} outside polyline range [0, {total}]"),
        });
    }

    let (centre_n, centre_e, tangent_n, tangent_e) = locate_on_polyline(polyline, &cum, chainage);
    let len = tangent_n.hypot(tangent_e);
    if len < 1e-12 {
        return Err(SurveyError::DegenerateGeometry {
            reason: "zero-length polyline segment at chainage".into(),
        });
    }
    // Perpendicular unit vector pointing to the right of the tangent.
    let perp_n = tangent_e / len;
    let perp_e = -tangent_n / len;

    let half = width / 2.0;
    let n_steps = (width / spacing).ceil() as usize;
    let step = width / n_steps.max(1) as f64;

    let mut out = Vec::with_capacity(n_steps + 1);
    for i in 0..=n_steps {
        let offset = -half + i as f64 * step;
        let n = centre_n + offset * perp_n;
        let e = centre_e + offset * perp_e;
        let z = sample_z(tin, n, e);
        out.push(CrossSectionPoint { offset, n, e, z });
    }
    Ok(out)
}

fn polyline_chainages(polyline: &[Vertex]) -> (Vec<f64>, f64) {
    let mut cum = Vec::with_capacity(polyline.len());
    cum.push(0.0);
    let mut total = 0.0;
    for i in 1..polyline.len() {
        let dn = polyline[i].n - polyline[i - 1].n;
        let de = polyline[i].e - polyline[i - 1].e;
        total += dn.hypot(de);
        cum.push(total);
    }
    (cum, total)
}

fn point_on_polyline(tin: &Tin, polyline: &[Vertex], cum: &[f64], chainage: f64) -> ProfilePoint {
    let (n, e, _, _) = locate_on_polyline(polyline, cum, chainage);
    let z = sample_z(tin, n, e);
    ProfilePoint { chainage, n, e, z }
}

/// Locate the plan coordinate on a polyline at a given chainage and return the
/// (unnormalised) tangent vector of the containing segment.
fn locate_on_polyline(polyline: &[Vertex], cum: &[f64], chainage: f64) -> (f64, f64, f64, f64) {
    let n = polyline.len();
    if chainage <= 0.0 {
        let next = polyline[1];
        let start = polyline[0];
        return (start.n, start.e, next.n - start.n, next.e - start.e);
    }
    if chainage >= cum[n - 1] {
        let prev = polyline[n - 2];
        let end = polyline[n - 1];
        return (end.n, end.e, end.n - prev.n, end.e - prev.e);
    }

    for i in 0..n - 1 {
        if chainage >= cum[i] && chainage <= cum[i + 1] {
            let seg_len = cum[i + 1] - cum[i];
            let t = if seg_len > 1e-12 {
                (chainage - cum[i]) / seg_len
            } else {
                0.0
            };
            let a = polyline[i];
            let b = polyline[i + 1];
            let n = a.n + t * (b.n - a.n);
            let e = a.e + t * (b.e - a.e);
            return (n, e, b.n - a.n, b.e - a.e);
        }
    }

    let end = polyline[n - 1];
    (end.n, end.e, 0.0, 0.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tin::build_tin;
    use crate::Point3;

    fn flat_tin(z: f64) -> Tin {
        build_tin(&[
            Point3::new(0.0, 0.0, z),
            Point3::new(10.0, 0.0, z),
            Point3::new(10.0, 10.0, z),
            Point3::new(0.0, 10.0, z),
        ])
        .unwrap()
    }

    #[test]
    fn profile_vertex_only_on_flat_surface() {
        let tin = flat_tin(5.0);
        let line = vec![Vertex::new(0.0, 0.0), Vertex::new(10.0, 0.0)];
        let profile = extract_profile(&tin, &line, None).unwrap();
        assert_eq!(profile.len(), 2);
        assert!((profile[0].chainage).abs() < 1e-9);
        assert!((profile[1].chainage - 10.0).abs() < 1e-9);
        assert!(profile.iter().all(|p| p.z.unwrap() == 5.0));
    }

    #[test]
    fn profile_samples_at_requested_spacing() {
        let tin = flat_tin(12.0);
        let line = vec![Vertex::new(0.0, 0.0), Vertex::new(0.0, 10.0)];
        let profile = extract_profile(&tin, &line, Some(3.0)).unwrap();
        // Spacing 3 over length 10 -> ceil(10/3) = 4 intervals -> 5 points: 0,3,6,9,10
        assert_eq!(profile.len(), 5);
        for (i, p) in profile.iter().enumerate() {
            let expected = if i == 4 { 10.0 } else { i as f64 * 3.0 };
            assert!((p.chainage - expected).abs() < 1e-9);
            assert!((p.z.unwrap() - 12.0).abs() < 1e-9);
        }
    }

    #[test]
    fn cross_section_samples_perpendicular_offsets() {
        // TIN slopes upward toward +E: z = e.
        let tin = build_tin(&[
            Point3::new(0.0, 0.0, 0.0),
            Point3::new(10.0, 0.0, 0.0),
            Point3::new(0.0, 10.0, 10.0),
            Point3::new(10.0, 10.0, 10.0),
        ])
        .unwrap();
        // Centreline runs North along E=5. Cross-section at chainage 5 should be
        // perpendicular (East-West) and sample z ≈ e.
        let line = vec![Vertex::new(0.0, 5.0), Vertex::new(10.0, 5.0)];
        let xs = extract_cross_section(&tin, &line, 5.0, 6.0, 3.0).unwrap();
        assert!(!xs.is_empty());
        for p in &xs {
            let expected_z = p.e; // z = e on this ramp
            assert!((p.z.unwrap() - expected_z).abs() < 1e-6, "z was {:?}", p.z);
        }
    }

    #[test]
    fn cross_section_out_of_chainage_fails() {
        let tin = flat_tin(0.0);
        let line = vec![Vertex::new(0.0, 0.0), Vertex::new(10.0, 0.0)];
        assert!(extract_cross_section(&tin, &line, 20.0, 4.0, 2.0).is_err());
    }
}
