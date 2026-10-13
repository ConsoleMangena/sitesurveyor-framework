//! Extended geometric intersections for engineering survey COGO.
//!
//! Beyond bearing-bearing (two rays) and distance-distance (two circles), field
//! work often needs true line-line, line-arc and arc-arc intersections. These
//! functions are pure, side-effect-free and compile cleanly to WASM.

use crate::cogo::Ne;
use crate::SurveyError;

const EPS: f64 = 1e-12;

/// True line-line intersection: returns the point where the infinite lines
/// through `(p1,q1)` and `(p2,q2)` meet, or an error when they are parallel.
///
/// For ray/ray intersection that is bounded by the line segments, use
/// `cogo::intersection_bearing_bearing`.
pub fn line_line(p1: &Ne, q1: &Ne, p2: &Ne, q2: &Ne) -> crate::Result<Ne> {
    let d1n = q1.n - p1.n;
    let d1e = q1.e - p1.e;
    let d2n = q2.n - p2.n;
    let d2e = q2.e - p2.e;

    let denom = d1e * d2n - d1n * d2e;
    if denom.abs() < EPS {
        return Err(SurveyError::DegenerateGeometry {
            reason: "lines are parallel".into(),
        });
    }

    let dn = p2.n - p1.n;
    let de = p2.e - p1.e;
    let t = (-dn * d2e + de * d2n) / denom;
    Ok(Ne {
        n: p1.n + t * d1n,
        e: p1.e + t * d1e,
    })
}

/// Intersection of an infinite line (through `a` and `b`) with a circle
/// (`centre`, `radius`). Returns zero, one or two points.
pub fn line_arc(a: &Ne, b: &Ne, centre: &Ne, radius: f64) -> crate::Result<Vec<Ne>> {
    if !radius.is_finite() || radius < 0.0 {
        return Err(SurveyError::InvalidParameter {
            name: "radius".into(),
            value: radius.to_string(),
        });
    }
    if radius < EPS {
        return Ok(Vec::new());
    }

    let dn = b.n - a.n;
    let de = b.e - a.e;
    let len = dn.hypot(de);
    if len < EPS {
        return Ok(Vec::new());
    }

    // Unit direction of the line.
    let un = dn / len;
    let ue = de / len;

    // Vector from a to circle centre.
    let vn = centre.n - a.n;
    let ve = centre.e - a.e;

    // Project centre onto the line, relative to a.
    let t0 = vn * un + ve * ue;

    // Closest approach distance from centre to the line.
    let cross = vn * ue - ve * un;
    let d = cross.abs();

    if d > radius + EPS {
        return Ok(Vec::new());
    }

    let half_chord = (radius * radius - cross * cross).sqrt();
    let t1 = t0 - half_chord;
    let t2 = t0 + half_chord;

    if half_chord < EPS {
        Ok(vec![Ne {
            n: a.n + t0 * un,
            e: a.e + t0 * ue,
        }])
    } else {
        Ok(vec![
            Ne {
                n: a.n + t1 * un,
                e: a.e + t1 * ue,
            },
            Ne {
                n: a.n + t2 * un,
                e: a.e + t2 * ue,
            },
        ])
    }
}

/// Intersection of two circles (`c1`, `r1`) and (`c2`, `r2`). Returns zero,
/// one or two points.
pub fn arc_arc(c1: &Ne, r1: f64, c2: &Ne, r2: f64) -> crate::Result<Vec<Ne>> {
    use crate::cogo::intersection_distance_distance;
    match intersection_distance_distance(c1, r1, c2, r2)? {
        crate::cogo::DistanceDistanceIntersection::Two(a, b) => Ok(vec![a, b]),
        crate::cogo::DistanceDistanceIntersection::One(a) => Ok(vec![a]),
        crate::cogo::DistanceDistanceIntersection::None => Ok(Vec::new()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn line_line_meets_at_origin() {
        let p = line_line(
            &Ne::new(-1.0, -1.0),
            &Ne::new(1.0, 1.0),
            &Ne::new(-1.0, 1.0),
            &Ne::new(1.0, -1.0),
        )
        .unwrap();
        assert!(p.n.abs() < 1e-9);
        assert!(p.e.abs() < 1e-9);
    }

    #[test]
    fn parallel_lines_fail() {
        assert!(line_line(
            &Ne::new(0.0, 0.0),
            &Ne::new(1.0, 0.0),
            &Ne::new(0.0, 1.0),
            &Ne::new(1.0, 1.0)
        )
        .is_err());
    }

    #[test]
    fn line_arc_crosses_circle_twice() {
        let a = Ne::new(-2.0, 0.0);
        let b = Ne::new(2.0, 0.0);
        let c = Ne::new(0.0, 0.0);
        let sols = line_arc(&a, &b, &c, 1.0).unwrap();
        assert_eq!(sols.len(), 2);
        for s in &sols {
            assert!(s.n.hypot(s.e).abs() - 1.0 < 1e-9);
        }
    }

    #[test]
    fn arc_arc_two_solutions() {
        // Centres differ along the Easting axis (Ne::new(n, e)).
        let sols = arc_arc(&Ne::new(0.0, 0.0), 5.0, &Ne::new(0.0, 8.0), 5.0).unwrap();
        assert_eq!(sols.len(), 2);
        for s in &sols {
            // Intersections should lie midway along the E axis.
            assert!((s.e - 4.0).abs() < 1e-9);
            assert!((s.n * s.n - 9.0).abs() < 1e-9);
        }
    }
}
