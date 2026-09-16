//! GeoJSON import/export backed by the GeoRust `geojson` crate.
//!
//! Survey points become GeoJSON `Point` features, linework becomes
//! `LineString` (open) or `Polygon` (closed) features. Each feature carries the
//! surveyor attributes (point number, code, elevation, layer) as GeoJSON
//! properties so the data round-trips through GIS tools (QGIS, ArcGIS) without
//! losing meaning.
//!
//! COORDINATES: GeoJSON is X/Y = longitude/latitude by spec, but for projected
//! engineering data we follow the universal CAD/GIS interchange convention of
//! writing X = Easting, Y = Northing (and Z = Elevation as the optional third
//! ordinate). Re-projection to geographic coordinates, when required, is a
//! separate explicit step (see the desktop `proj` commands / `projection.ts`).

use crate::{Point3, Vertex};
use geojson::{Feature, FeatureCollection, GeoJson, Geometry, Value};
use serde_json::{Map, Value as JsonValue};

/// A survey point for GeoJSON interchange (mirrors the TS `SurveyPoint`).
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct GeoPoint {
    pub point_no: String,
    pub n: f64,
    pub e: f64,
    pub z: Option<f64>,
    #[serde(default)]
    pub code: String,
    #[serde(default)]
    pub layer_id: String,
}

/// A linework feature for GeoJSON interchange (mirrors the TS `SurveyLinework`).
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct GeoLinework {
    pub vertices: Vec<Vertex>,
    pub closed: bool,
    #[serde(default)]
    pub layer_id: String,
}

/// The exportable/importable subset of the CAD model.
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct GeoModel {
    #[serde(default)]
    pub points: Vec<GeoPoint>,
    #[serde(default)]
    pub linework: Vec<GeoLinework>,
}

fn str_prop(props: &Map<String, JsonValue>, key: &str) -> String {
    props
        .get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn point_feature(p: &GeoPoint) -> Feature {
    // X = Easting, Y = Northing, optional Z = Elevation.
    let position = match p.z {
        Some(z) => vec![p.e, p.n, z],
        None => vec![p.e, p.n],
    };
    let mut props = Map::new();
    props.insert("pointNo".into(), JsonValue::from(p.point_no.clone()));
    props.insert("code".into(), JsonValue::from(p.code.clone()));
    props.insert("layer".into(), JsonValue::from(p.layer_id.clone()));
    if let Some(z) = p.z {
        props.insert("z".into(), JsonValue::from(z));
    }
    Feature {
        bbox: None,
        geometry: Some(Geometry::new(Value::Point(position))),
        id: None,
        properties: Some(props),
        foreign_members: None,
    }
}

fn linework_feature(l: &GeoLinework) -> Feature {
    let coords: Vec<Vec<f64>> = l.vertices.iter().map(|v| vec![v.e, v.n]).collect();
    let geometry = if l.closed && l.vertices.len() >= 3 {
        // GeoJSON polygons must be explicitly closed (first == last).
        let mut ring = coords.clone();
        if ring.first() != ring.last() {
            if let Some(first) = ring.first().cloned() {
                ring.push(first);
            }
        }
        Geometry::new(Value::Polygon(vec![ring]))
    } else {
        Geometry::new(Value::LineString(coords))
    };
    let mut props = Map::new();
    props.insert("layer".into(), JsonValue::from(l.layer_id.clone()));
    props.insert("closed".into(), JsonValue::from(l.closed));
    Feature {
        bbox: None,
        geometry: Some(geometry),
        id: None,
        properties: Some(props),
        foreign_members: None,
    }
}

/// Serialise a model into a GeoJSON `FeatureCollection` string (pretty-printed).
pub fn model_to_geojson(model: &GeoModel) -> String {
    let mut features: Vec<Feature> = Vec::with_capacity(model.points.len() + model.linework.len());
    features.extend(model.points.iter().map(point_feature));
    features.extend(model.linework.iter().map(linework_feature));

    let fc = FeatureCollection {
        bbox: None,
        features,
        foreign_members: None,
    };
    GeoJson::FeatureCollection(fc).to_string()
}

/// Parse a GeoJSON string into a model. Unsupported geometry types are skipped.
/// Returns an empty model when the input is not valid GeoJSON.
pub fn model_from_geojson(text: &str) -> GeoModel {
    let mut model = GeoModel::default();
    let parsed: GeoJson = match text.parse() {
        Ok(g) => g,
        Err(_) => return model,
    };

    let features: Vec<Feature> = match parsed {
        GeoJson::FeatureCollection(fc) => fc.features,
        GeoJson::Feature(f) => vec![f],
        GeoJson::Geometry(g) => vec![Feature {
            bbox: None,
            geometry: Some(g),
            id: None,
            properties: None,
            foreign_members: None,
        }],
    };

    for f in features {
        let props = f.properties.clone().unwrap_or_default();
        let Some(geom) = f.geometry else { continue };
        match geom.value {
            Value::Point(pos) => {
                let e = pos.first().copied().unwrap_or(0.0);
                let n = pos.get(1).copied().unwrap_or(0.0);
                let z = pos
                    .get(2)
                    .copied()
                    .or_else(|| props.get("z").and_then(|v| v.as_f64()));
                model.points.push(GeoPoint {
                    point_no: str_prop(&props, "pointNo"),
                    n,
                    e,
                    z,
                    code: str_prop(&props, "code"),
                    layer_id: str_prop(&props, "layer"),
                });
            }
            Value::LineString(coords) => {
                model.linework.push(GeoLinework {
                    vertices: coords.iter().map(coord_to_vertex).collect(),
                    closed: false,
                    layer_id: str_prop(&props, "layer"),
                });
            }
            Value::Polygon(rings) => {
                if let Some(outer) = rings.first() {
                    let mut verts: Vec<Vertex> = outer.iter().map(coord_to_vertex).collect();
                    // Drop the GeoJSON closing vertex; our model closes implicitly.
                    if verts.len() > 1 && verts.first() == verts.last() {
                        verts.pop();
                    }
                    model.linework.push(GeoLinework {
                        vertices: verts,
                        closed: true,
                        layer_id: str_prop(&props, "layer"),
                    });
                }
            }
            _ => { /* MultiPoint / MultiLineString / etc. unsupported for now */ }
        }
    }
    model
}

fn coord_to_vertex(c: &Vec<f64>) -> Vertex {
    Vertex {
        e: c.first().copied().unwrap_or(0.0),
        n: c.get(1).copied().unwrap_or(0.0),
    }
}

/// Convenience: derive 3D points from the model's points (Z defaults to 0).
pub fn points3(model: &GeoModel) -> Vec<Point3> {
    model
        .points
        .iter()
        .map(|p| Point3::new(p.n, p.e, p.z.unwrap_or(0.0)))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> GeoModel {
        GeoModel {
            points: vec![GeoPoint {
                point_no: "1001".into(),
                n: 1000.0,
                e: 5000.0,
                z: Some(12.5),
                code: "CP".into(),
                layer_id: "CONTROL".into(),
            }],
            linework: vec![GeoLinework {
                vertices: vec![
                    Vertex::new(0.0, 0.0),
                    Vertex::new(0.0, 10.0),
                    Vertex::new(10.0, 10.0),
                ],
                closed: true,
                layer_id: "BOUNDARY".into(),
            }],
        }
    }

    #[test]
    fn exports_feature_collection() {
        let gj = model_to_geojson(&sample());
        assert!(gj.contains("FeatureCollection"));
        assert!(gj.contains("Point"));
        assert!(gj.contains("Polygon"));
        assert!(gj.contains("1001"));
    }

    #[test]
    fn round_trips_points_and_linework() {
        let gj = model_to_geojson(&sample());
        let back = model_from_geojson(&gj);
        assert_eq!(back.points.len(), 1);
        assert_eq!(back.linework.len(), 1);
        let p = &back.points[0];
        assert_eq!(p.point_no, "1001");
        assert!((p.e - 5000.0).abs() < 1e-9 && (p.n - 1000.0).abs() < 1e-9);
        assert_eq!(p.z, Some(12.5));
        assert!(back.linework[0].closed);
        // Closing vertex dropped on import.
        assert_eq!(back.linework[0].vertices.len(), 3);
    }

    #[test]
    fn invalid_input_yields_empty_model() {
        let m = model_from_geojson("not json at all");
        assert!(m.points.is_empty() && m.linework.is_empty());
    }
}
