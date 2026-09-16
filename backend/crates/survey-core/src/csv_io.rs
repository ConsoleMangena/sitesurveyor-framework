//! CSV import/export for survey points.
//!
//! The default field order follows the Southern-African surveyor convention:
//! `PointNo, Y(Easting), X(Northing), Z(Elevation), Code`. A header row is
//! auto-detected and skipped. This mirrors the pure-TypeScript implementation
//! in the frontend so the Rust and TS import paths behave identically.

use crate::geojson_io::GeoPoint;
use serde::{Deserialize, Serialize};

/// Result of parsing a survey-point CSV file.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CsvParseResult {
    pub points: Vec<GeoPoint>,
    pub skipped: usize,
    pub errors: Vec<String>,
}

/// True when `v` looks like a signed decimal number.
fn looks_numeric(v: &str) -> bool {
    v.trim().parse::<f64>().is_ok()
}

/// Parse a survey-point CSV string into `GeoPoint`s.
///
/// Expected column order: PointNo, Easting(Y), Northing(X), Z, Code. Delimiters
/// comma, tab and semicolon are accepted. Header rows are skipped when the
/// first three columns are non-numeric.
pub fn parse_points_csv(text: &str) -> CsvParseResult {
    let mut points = Vec::new();
    let mut skipped = 0usize;
    let mut errors = Vec::new();

    for (idx, raw) in text.lines().enumerate() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        let cols: Vec<&str> = line
            .split(&[',', '\t', ';'][..])
            .map(|s| s.trim())
            .collect();
        if cols.len() < 3 {
            skipped += 1;
            continue;
        }

        // Header detection: the first row is a header if its first three
        // columns are all non-numeric.
        if idx == 0 && !looks_numeric(cols[0]) && !looks_numeric(cols[1]) && !looks_numeric(cols[2])
        {
            continue;
        }

        let pno = cols[0];
        let e: f64 = match cols[1].parse() {
            Ok(v) => v,
            Err(_) => {
                errors.push(format!("Line {}: invalid Easting/Y", idx + 1));
                skipped += 1;
                continue;
            }
        };
        let n: f64 = match cols[2].parse() {
            Ok(v) => v,
            Err(_) => {
                errors.push(format!("Line {}: invalid Northing/X", idx + 1));
                skipped += 1;
                continue;
            }
        };
        let z = cols.get(3).and_then(|v| {
            if looks_numeric(v) {
                v.trim().parse().ok()
            } else {
                None
            }
        });
        let code = cols.get(4).unwrap_or(&"").to_string();

        points.push(GeoPoint {
            point_no: if pno.is_empty() {
                (idx + 1).to_string()
            } else {
                pno.to_string()
            },
            n,
            e,
            z,
            code,
            layer_id: String::new(),
        });
    }

    CsvParseResult {
        points,
        skipped,
        errors,
    }
}

/// Export survey points to CSV.
///
/// Column order: `PointNo,Y,X,Z,Code` with Z emitted to 4 decimal places when
/// present.
pub fn points_to_csv(points: &[GeoPoint]) -> String {
    let mut lines: Vec<String> = vec!["PointNo,Y,X,Z,Code".to_string()];
    for p in points {
        let z = match p.z {
            Some(v) => format!("{:.4}", v),
            None => String::new(),
        };
        lines.push(format!(
            "{},{:.4},{:.4},{},{}",
            p.point_no, p.e, p.n, z, p.code
        ));
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_csv(header: bool) -> String {
        let mut s = String::new();
        if header {
            s.push_str("Point,Y,X,Z,Code\n");
        }
        s.push_str("1001,5000.1234,1000.5678,12.500,CP\n");
        s.push_str("1002,5010.0000,1010.0000,,TP\n");
        s.push_str("bad,not_a_number,1015.0,5.0,BAD\n");
        s
    }

    #[test]
    fn parses_csv_with_header() {
        let res = parse_points_csv(&sample_csv(true));
        assert_eq!(res.points.len(), 2);
        assert_eq!(res.skipped, 1);
        assert_eq!(res.errors.len(), 1);
        let p0 = &res.points[0];
        assert_eq!(p0.point_no, "1001");
        assert!((p0.e - 5000.1234).abs() < 1e-9);
        assert!((p0.n - 1000.5678).abs() < 1e-9);
        assert!((p0.z.unwrap() - 12.5).abs() < 1e-9);
        assert_eq!(p0.code, "CP");
    }

    #[test]
    fn parses_csv_without_header() {
        let res = parse_points_csv(&sample_csv(false));
        assert_eq!(res.points.len(), 2);
    }

    #[test]
    fn round_trip_csv() {
        let pts = vec![
            GeoPoint {
                point_no: "1".into(),
                n: 100.0,
                e: 200.0,
                z: Some(10.5),
                code: "CP".into(),
                layer_id: String::new(),
            },
            GeoPoint {
                point_no: "2".into(),
                n: 110.0,
                e: 210.0,
                z: None,
                code: "".into(),
                layer_id: String::new(),
            },
        ];
        let csv = points_to_csv(&pts);
        let back = parse_points_csv(&csv);
        assert_eq!(back.points.len(), 2);
        assert!((back.points[0].z.unwrap() - 10.5).abs() < 1e-4);
        assert!(back.points[1].z.is_none());
    }
}
