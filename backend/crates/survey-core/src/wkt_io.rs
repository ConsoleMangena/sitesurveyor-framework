//! WKT import/export for CAD geometry.
//!
//! WKT is the lingua franca for exchanging points and linework with GIS
//! packages. This module reads and writes the survey-oriented subset:
//! `POINT`, `LINESTRING`, and `POLYGON` (including 3D / `Z` variants). Z is
//! treated as elevation and round-trips through `GeoModel`.

use crate::geojson_io::{GeoLinework, GeoModel, GeoPoint};
use crate::{SurveyError, Vertex};

/// Parse a WKT string into a `GeoModel`.
///
/// Supported geometry types: `POINT`, `POINT Z`, `LINESTRING`, `LINESTRING Z`,
/// `POLYGON`, `POLYGON Z` and `GEOMETRYCOLLECTION` containing those types. If
/// a polygon has holes, only the outer ring is imported; holes are ignored for
/// the simple linework model.
pub fn model_from_wkt(text: &str) -> crate::Result<GeoModel> {
    let wkt: wkt::Wkt<f64> = text.parse().map_err(|e| SurveyError::ParseError {
        message: format!("WKT parse error: {e}"),
    })?;
    let mut model = GeoModel::default();
    process_wkt(&wkt, &mut model)?;
    Ok(model)
}

fn process_wkt(geom: &wkt::Wkt<f64>, model: &mut GeoModel) -> crate::Result<()> {
    use wkt::Wkt;
    match &geom {
        Wkt::Point(p) => {
            if let Some(c) = &p.0 {
                model.points.push(coord_to_geo_point(c));
            }
        }
        Wkt::LineString(ls) => {
            let verts: Vec<Vertex> = ls.0.iter().map(coord_to_vertex).collect();
            if verts.len() >= 2 {
                model.linework.push(GeoLinework {
                    vertices: verts,
                    closed: false,
                    layer_id: String::new(),
                });
            }
        }
        Wkt::Polygon(poly) => {
            // Outer ring only.
            if let Some(ring) = poly.0.first() {
                let mut verts: Vec<Vertex> = ring.0.iter().map(coord_to_vertex).collect();
                if verts.len() > 1 && verts.first() == verts.last() {
                    verts.pop();
                }
                if verts.len() >= 3 {
                    model.linework.push(GeoLinework {
                        vertices: verts,
                        closed: true,
                        layer_id: String::new(),
                    });
                }
            }
        }
        Wkt::GeometryCollection(gc) => {
            for g in gc.0.iter() {
                process_wkt(g, model)?;
            }
        }
        Wkt::MultiPoint(mp) => {
            for p in mp.0.iter() {
                process_wkt(&Wkt::Point(p.clone()), model)?;
            }
        }
        Wkt::MultiLineString(mls) => {
            for ls in mls.0.iter() {
                process_wkt(&Wkt::LineString(ls.clone()), model)?;
            }
        }
        Wkt::MultiPolygon(mpol) => {
            for poly in mpol.0.iter() {
                process_wkt(&Wkt::Polygon(poly.clone()), model)?;
            }
        }
    }
    Ok(())
}

/// Convert a `GeoModel` to a WKT `GEOMETRYCOLLECTION` string.
pub fn model_to_wkt(model: &GeoModel) -> String {
    let mut parts: Vec<String> = model
        .points
        .iter()
        .map(|p| format!("POINT Z ({:.6} {:.6} {:.6})", p.e, p.n, p.z.unwrap_or(0.0)))
        .collect();

    for l in &model.linework {
        if l.closed && l.vertices.len() >= 3 {
            parts.push(format!("POLYGON Z ({})", ring_to_wkt(&l.vertices)));
        } else if !l.closed && l.vertices.len() >= 2 {
            parts.push(format!("LINESTRING Z {}", line_to_wkt(&l.vertices)));
        }
    }

    if parts.is_empty() {
        return "GEOMETRYCOLLECTION Z EMPTY".to_string();
    }
    format!("GEOMETRYCOLLECTION Z ({})", parts.join(", "))
}

fn line_to_wkt(verts: &[Vertex]) -> String {
    format!(
        "({})",
        verts
            .iter()
            .map(|v| format!("{:.6} {:.6} 0.0", v.e, v.n))
            .collect::<Vec<_>>()
            .join(", ")
    )
}

fn ring_to_wkt(verts: &[Vertex]) -> String {
    let mut coords: Vec<String> = verts
        .iter()
        .map(|v| format!("{:.6} {:.6} 0.0", v.e, v.n))
        .collect();
    if let Some(first) = coords.first().cloned() {
        coords.push(first);
    }
    format!("({})", coords.join(", "))
}

fn coord_to_vertex(c: &wkt::types::Coord<f64>) -> Vertex {
    Vertex::new(c.y, c.x)
}

fn coord_to_geo_point(c: &wkt::types::Coord<f64>) -> GeoPoint {
    GeoPoint {
        point_no: String::new(),
        n: c.y,
        e: c.x,
        z: c.z,
        code: String::new(),
        layer_id: String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_point_and_line() {
        let model = GeoModel {
            points: vec![GeoPoint {
                point_no: "P1".into(),
                n: 1000.0,
                e: 5000.0,
                z: Some(12.5),
                code: "CP".into(),
                layer_id: String::new(),
            }],
            linework: vec![GeoLinework {
                vertices: vec![
                    Vertex::new(0.0, 0.0),
                    Vertex::new(0.0, 10.0),
                    Vertex::new(10.0, 10.0),
                ],
                closed: false,
                layer_id: String::new(),
            }],
        };
        let wkt = model_to_wkt(&model);
        let back = model_from_wkt(&wkt).unwrap();
        assert_eq!(back.points.len(), 1);
        assert!((back.points[0].n - 1000.0).abs() < 1e-6);
        assert!((back.points[0].e - 5000.0).abs() < 1e-6);
        assert!((back.points[0].z.unwrap() - 12.5).abs() < 1e-6);
        assert_eq!(back.linework.len(), 1);
        assert_eq!(back.linework[0].vertices.len(), 3);
    }

    #[test]
    fn parses_polygon_closed_ring() {
        let wkt = "POLYGON Z ((0 0 0, 0 10 0, 10 10 0, 10 0 0, 0 0 0))";
        let model = model_from_wkt(wkt).unwrap();
        assert_eq!(model.linework.len(), 1);
        assert!(model.linework[0].closed);
        // Closing vertex should be dropped.
        assert_eq!(model.linework[0].vertices.len(), 4);
    }

    #[test]
    fn parses_2d_point_with_z_default() {
        let model = model_from_wkt("POINT (5 10)").unwrap();
        assert_eq!(model.points.len(), 1);
        assert!((model.points[0].n - 10.0).abs() < 1e-9);
        assert!(model.points[0].z.is_none());
    }

    #[test]
    fn empty_model_writes_empty_collection() {
        let model = GeoModel::default();
        assert_eq!(model_to_wkt(&model), "GEOMETRYCOLLECTION Z EMPTY");
    }
}
