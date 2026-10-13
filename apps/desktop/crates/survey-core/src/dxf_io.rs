//! Minimal DXF (AutoCAD 2000 / AC1015 ASCII) writer for survey deliverables.
//!
//! AutoCAD and all major CAD packages open DXF natively. We emit:
//! - LAYER table entries (one per CAD layer, with AutoCAD colour indices)
//! - POINT entities for survey points (+ TEXT labels for point numbers)
//! - LINE / LWPOLYLINE entities for linework
//! - 3DFACE entities for TIN surfaces
//! - TEXT entities for annotations
//!
//! Coordinates are written as X = Easting, Y = Northing, Z = Elevation, the
//! standard mapping when bringing survey data into CAD. This is a write-only
//! module that mirrors the TypeScript DXF exporter in the frontend.

use crate::{Point3, Triangle, Vertex};
use serde::{Deserialize, Serialize};

/// AutoCAD-style layer definition.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DxfLayer {
    pub id: String,
    pub name: String,
    pub color: String,
    pub visible: bool,
    pub locked: bool,
}

/// Survey point to emit as a DXF POINT (+ label TEXT).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DxfPoint {
    pub point_no: String,
    pub n: f64,
    pub e: f64,
    pub z: Option<f64>,
    pub layer_id: String,
    pub code: String,
    pub color: Option<String>,
}

/// Linework kind, used to decide when to emit a simple LINE versus an
/// LWPOLYLINE.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DxfLineworkKind {
    Line,
    Polyline,
    Boundary,
}

/// Open or closed linework to emit as DXF.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DxfLinework {
    pub vertices: Vec<Vertex>,
    pub closed: bool,
    pub layer_id: String,
    pub color: Option<String>,
    pub kind: DxfLineworkKind,
}

/// TIN surface to emit as 3DFACEs.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DxfSurface {
    pub name: String,
    pub points: Vec<Point3>,
    pub triangles: Vec<Triangle>,
    pub layer_id: String,
}

/// Text annotation to emit as DXF TEXT.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DxfText {
    pub n: f64,
    pub e: f64,
    pub text: String,
    pub layer_id: String,
    pub color: Option<String>,
}

/// Top-level model for DXF export.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DxfModel {
    pub layers: Vec<DxfLayer>,
    pub points: Vec<DxfPoint>,
    pub linework: Vec<DxfLinework>,
    pub surfaces: Vec<DxfSurface>,
    pub texts: Vec<DxfText>,
}

/// Map a hex colour to the nearest AutoCAD Color Index (ACI).
fn aci(hex: &str) -> i32 {
    let palette: std::collections::HashMap<&str, i32> = [
        ("#f43f5e", 1),
        ("#ff0000", 1),
        ("#22c55e", 3),
        ("#38bdf8", 4),
        ("#22d3ee", 4),
        ("#a78bfa", 6),
        ("#a855f7", 6),
        ("#eab308", 2),
        ("#ffff00", 2),
        ("#f97316", 30),
        ("#ff7a00", 30),
        ("#3b82f6", 5),
        ("#94a3b8", 8),
        ("#ffffff", 7),
        ("#e2e8f0", 7),
    ]
    .iter()
    .cloned()
    .collect();
    palette
        .get(hex.to_lowercase().as_str())
        .copied()
        .unwrap_or(7)
}

fn group(code: i32, value: impl std::fmt::Display) -> String {
    format!("{}\n{}\n", code, value)
}

fn obj_color(color: Option<&str>) -> String {
    color.map(|c| group(62, aci(c))).unwrap_or_default()
}

fn layer_name(layers: &[DxfLayer], id: &str) -> String {
    let l = layers.iter().find(|l| l.id == id);
    let name = l.map(|l| l.name.as_str()).unwrap_or(id);
    name.to_uppercase().replace(' ', "_")
}

fn layer_table(layers: &[DxfLayer]) -> String {
    let mut out = group(0, "TABLE") + &group(2, "LAYER") + &group(70, layers.len() as i32);
    for l in layers {
        let color = if l.visible {
            aci(&l.color)
        } else {
            -aci(&l.color)
        };
        out += &(group(0, "LAYER")
            + &group(2, layer_name(layers, &l.id))
            + &group(70, if l.locked { 4 } else { 0 })
            + &group(62, color)
            + &group(6, "CONTINUOUS"));
    }
    out += &group(0, "ENDTAB");
    out
}

/// Export the model to a DXF R2000 (AC1015) ASCII string.
pub fn model_to_dxf(model: &DxfModel) -> String {
    let mut dxf = String::new();

    // HEADER
    dxf += &group(0, "SECTION");
    dxf += &group(2, "HEADER");
    dxf += &(group(9, "$ACADVER") + &group(1, "AC1015"));
    dxf += &group(0, "ENDSEC");

    // TABLES
    dxf += &group(0, "SECTION");
    dxf += &group(2, "TABLES");
    dxf += &layer_table(&model.layers);
    dxf += &group(0, "ENDSEC");

    // ENTITIES
    dxf += &group(0, "SECTION");
    dxf += &group(2, "ENTITIES");

    for p in &model.points {
        let ln = layer_name(&model.layers, &p.layer_id);
        dxf += &(group(0, "POINT")
            + &group(8, &ln)
            + &obj_color(p.color.as_deref())
            + &group(10, p.e)
            + &group(20, p.n)
            + &group(30, p.z.unwrap_or(0.0)));
        // Point number label.
        let label = format!(
            "{}{}",
            p.point_no,
            if p.code.is_empty() {
                String::new()
            } else {
                format!(" {}", p.code)
            }
        );
        dxf += &(group(0, "TEXT")
            + &group(8, &ln)
            + &group(10, p.e)
            + &group(20, p.n)
            + &group(30, 0)
            + &group(40, 1.5)
            + &group(1, label));
    }

    for lw in &model.linework {
        let ln = layer_name(&model.layers, &lw.layer_id);
        if lw.vertices.len() == 2 && lw.kind == DxfLineworkKind::Line {
            let a = &lw.vertices[0];
            let b = &lw.vertices[1];
            dxf += &(group(0, "LINE")
                + &group(8, &ln)
                + &obj_color(lw.color.as_deref())
                + &group(10, a.e)
                + &group(20, a.n)
                + &group(30, 0)
                + &group(11, b.e)
                + &group(21, b.n)
                + &group(31, 0));
        } else {
            dxf += &(group(0, "LWPOLYLINE")
                + &group(8, &ln)
                + &obj_color(lw.color.as_deref())
                + &group(90, lw.vertices.len() as i32)
                + &group(70, if lw.closed { 1 } else { 0 }));
            for v in &lw.vertices {
                dxf += &(group(10, v.e) + &group(20, v.n));
            }
        }
    }

    for srf in &model.surfaces {
        let ln = layer_name(&model.layers, &srf.layer_id);
        for tri in &srf.triangles {
            if let (Some(a), Some(b), Some(c)) = (
                srf.points.get(tri.a),
                srf.points.get(tri.b),
                srf.points.get(tri.c),
            ) {
                dxf += &(group(0, "3DFACE")
                    + &group(8, &ln)
                    + &group(10, a.e)
                    + &group(20, a.n)
                    + &group(30, a.z)
                    + &group(11, b.e)
                    + &group(21, b.n)
                    + &group(31, b.z)
                    + &group(12, c.e)
                    + &group(22, c.n)
                    + &group(32, c.z)
                    // 4th corner repeats the 3rd (triangular face).
                    + &group(13, c.e)
                    + &group(23, c.n)
                    + &group(33, c.z));
            }
        }
    }

    for t in &model.texts {
        dxf += &(group(0, "TEXT")
            + &group(8, layer_name(&model.layers, &t.layer_id))
            + &obj_color(t.color.as_deref())
            + &group(10, t.e)
            + &group(20, t.n)
            + &group(30, 0)
            + &group(40, 2.0)
            + &group(1, &t.text));
    }

    dxf += &group(0, "ENDSEC");
    dxf += &group(0, "EOF");
    dxf
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_model() -> DxfModel {
        DxfModel {
            layers: vec![DxfLayer {
                id: "TOPO".into(),
                name: "Topo".into(),
                color: "#22c55e".into(),
                visible: true,
                locked: false,
            }],
            points: vec![DxfPoint {
                point_no: "1001".into(),
                n: 1000.0,
                e: 5000.0,
                z: Some(12.5),
                layer_id: "TOPO".into(),
                code: "CP".into(),
                color: None,
            }],
            linework: vec![DxfLinework {
                vertices: vec![
                    Vertex::new(0.0, 0.0),
                    Vertex::new(0.0, 10.0),
                    Vertex::new(10.0, 10.0),
                ],
                closed: true,
                layer_id: "TOPO".into(),
                color: None,
                kind: DxfLineworkKind::Boundary,
            }],
            surfaces: vec![DxfSurface {
                name: "Surface".into(),
                points: vec![
                    Point3::new(0.0, 0.0, 0.0),
                    Point3::new(0.0, 10.0, 1.0),
                    Point3::new(10.0, 10.0, 2.0),
                ],
                triangles: vec![Triangle { a: 0, b: 1, c: 2 }],
                layer_id: "TOPO".into(),
            }],
            texts: vec![DxfText {
                n: 5.0,
                e: 5.0,
                text: "A".into(),
                layer_id: "TOPO".into(),
                color: None,
            }],
        }
    }

    #[test]
    fn dxf_contains_required_sections() {
        let dxf = model_to_dxf(&sample_model());
        assert!(dxf.contains("$ACADVER")); // HEADER section
        assert!(dxf.contains("LAYER")); // TABLES section
        assert!(dxf.contains("ENTITIES")); // ENTITIES section
        assert!(dxf.trim_end().ends_with("EOF"));
    }

    #[test]
    fn dxf_writes_point_and_label() {
        let dxf = model_to_dxf(&sample_model());
        assert!(dxf.contains("POINT"));
        assert!(dxf.contains("1001 CP"));
    }

    #[test]
    fn dxf_writes_lwpolyline_and_3dface() {
        let dxf = model_to_dxf(&sample_model());
        assert!(dxf.contains("LWPOLYLINE"));
        assert!(dxf.contains("3DFACE"));
    }
}
