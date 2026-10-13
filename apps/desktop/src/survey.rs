//! Desktop-only Tauri command adapters around `survey-core`.
//!
//! These let the native desktop build run TIN / contour / volume computations
//! over IPC. The web build does NOT use these — it loads the same logic via the
//! `survey-wasm` WebAssembly module so behaviour is identical everywhere. Never
//! make a web feature depend on these commands.

use survey_core::alignment::{self, CurveStation, HorizontalCurve, VerticalCurve};
use survey_core::cogo;
use survey_core::geojson_io::{self, GeoModel};
use survey_core::geom::{self, Bounds};
use survey_core::terrain::{self, TerrainStats, TriangleAnalysis};
use survey_core::{contour, tin, volume, ContourLine, Point3, Tin, Vertex, VolumeResult};

#[cfg(feature = "gdal")]
use gdal::Metadata;
#[cfg(feature = "gdal")]
use std::collections::HashMap;

#[derive(Debug, Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CadImportStyle {
    /// Explicit object colour as an AutoCAD colour index (e.g. "1") or hex string.
    pub color: Option<String>,
    /// AutoCAD/ DXF linetype name (e.g. "CONTINUOUS", "DASHED").
    pub line_type: Option<String>,
    /// Line weight in millimetres; 0 means ByLayer.
    pub line_weight: Option<f64>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CadImportPoint {
    pub point_no: String,
    pub e: f64,
    pub n: f64,
    pub z: Option<f64>,
    pub code: String,
    pub layer_name: String,
    pub paper_space: bool,
    pub style: CadImportStyle,
    pub metadata: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CadImportVertex {
    pub e: f64,
    pub n: f64,
    pub z: Option<f64>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CadImportLinework {
    pub kind: String,
    pub vertices: Vec<CadImportVertex>,
    pub closed: bool,
    pub layer_name: String,
    pub paper_space: bool,
    pub style: CadImportStyle,
    pub metadata: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CadImportText {
    pub e: f64,
    pub n: f64,
    pub z: Option<f64>,
    pub text: String,
    pub layer_name: String,
    /// Text height in drawing units (from DXF TextHeight).
    pub height: Option<f64>,
    /// Rotation in degrees, counter-clockwise from the X axis.
    pub rotation: Option<f64>,
    pub paper_space: bool,
    pub style: CadImportStyle,
    pub metadata: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CadImportArc {
    pub center_e: f64,
    pub center_n: f64,
    pub center_z: Option<f64>,
    pub radius: f64,
    /// Start angle in degrees, counter-clockwise from the positive X axis.
    pub start_angle: f64,
    /// End angle in degrees, counter-clockwise from the positive X axis.
    pub end_angle: f64,
    pub layer_name: String,
    pub paper_space: bool,
    pub style: CadImportStyle,
    pub metadata: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CadImportCircle {
    pub center_e: f64,
    pub center_n: f64,
    pub center_z: Option<f64>,
    pub radius: f64,
    pub layer_name: String,
    pub paper_space: bool,
    pub style: CadImportStyle,
    pub metadata: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CadImportEllipse {
    pub center_e: f64,
    pub center_n: f64,
    pub center_z: Option<f64>,
    pub semi_major: f64,
    pub semi_minor: f64,
    /// Rotation of the major axis in degrees.
    pub rotation: f64,
    pub layer_name: String,
    pub paper_space: bool,
    pub style: CadImportStyle,
    pub metadata: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CadImportHatch {
    pub vertices: Vec<CadImportVertex>,
    pub holes: Vec<Vec<CadImportVertex>>,
    /// Hatch pattern name (e.g. "SOLID", "ANGLE").
    pub pattern: Option<String>,
    /// Hatch pattern scale.
    pub pattern_scale: Option<f64>,
    /// Hatch pattern rotation in degrees.
    pub pattern_angle: Option<f64>,
    pub layer_name: String,
    pub paper_space: bool,
    pub style: CadImportStyle,
    pub metadata: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CadImportDimension {
    pub kind: String,
    pub text: String,
    pub text_e: f64,
    pub text_n: f64,
    pub text_z: Option<f64>,
    pub def_points: Vec<CadImportVertex>,
    pub angle: Option<f64>,
    pub layer_name: String,
    pub paper_space: bool,
    pub style: CadImportStyle,
    pub metadata: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CadImportInsert {
    pub block_name: String,
    pub e: f64,
    pub n: f64,
    pub z: Option<f64>,
    pub scale_x: f64,
    pub scale_y: f64,
    pub scale_z: f64,
    pub rotation: f64,
    pub layer_name: String,
    pub paper_space: bool,
    pub style: CadImportStyle,
    pub metadata: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CadImportResult {
    pub points: Vec<CadImportPoint>,
    pub linework: Vec<CadImportLinework>,
    pub texts: Vec<CadImportText>,
    pub arcs: Vec<CadImportArc>,
    pub circles: Vec<CadImportCircle>,
    pub ellipses: Vec<CadImportEllipse>,
    pub hatches: Vec<CadImportHatch>,
    pub dimensions: Vec<CadImportDimension>,
    pub inserts: Vec<CadImportInsert>,
    pub layer_names: Vec<String>,
    pub layer_styles: std::collections::HashMap<String, CadImportStyle>,
    pub unsupported: Vec<String>,
    /// Scale factor applied to all coordinates based on DXF INSUNITS.
    pub unit_scale: f64,
}

fn stringify_err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[tauri::command]
pub fn build_tin(points: Vec<Point3>) -> Result<Tin, String> {
    tin::build_tin(&points).map_err(stringify_err)
}

#[tauri::command]
pub fn generate_contours(tin: Tin, interval: f64, base: f64) -> Result<Vec<ContourLine>, String> {
    contour::generate_contours(&tin, interval, base).map_err(stringify_err)
}

#[tauri::command]
pub fn volume_to_elevation(tin: Tin, reference: f64) -> Result<VolumeResult, String> {
    volume::volume_to_elevation(&tin, reference).map_err(stringify_err)
}

#[tauri::command]
pub fn volume_between(top: Tin, base: Tin) -> Result<VolumeResult, String> {
    volume::volume_between(&top, &base).map_err(stringify_err)
}

// ── COGO (parity with the wasm surface) ─────────────────────────────────────

#[tauri::command]
pub fn cogo_inverse(from: cogo::Ne, to: cogo::Ne) -> Result<(f64, f64), String> {
    cogo::inverse(&from, &to).map_err(stringify_err)
}

#[tauri::command]
pub fn cogo_forward(start: cogo::Ne, azimuth_deg: f64, distance: f64) -> Result<cogo::Ne, String> {
    cogo::forward(&start, azimuth_deg, distance).map_err(stringify_err)
}

#[tauri::command]
pub fn cogo_polygon_area(ring: Vec<cogo::Ne>) -> Result<f64, String> {
    cogo::polygon_area(&ring).map_err(stringify_err)
}

#[tauri::command]
pub fn cogo_intersection_bearing_bearing(
    p1: cogo::Ne,
    az1_deg: f64,
    p2: cogo::Ne,
    az2_deg: f64,
) -> Result<cogo::Ne, String> {
    cogo::intersection_bearing_bearing(&p1, az1_deg, &p2, az2_deg).map_err(stringify_err)
}

// ── GeoRust `geo` algorithms (parity with the wasm surface) ─────────────────

#[tauri::command]
pub fn polygon_area(ring: Vec<Vertex>) -> f64 {
    geom::polygon_area(&ring)
}

#[tauri::command]
pub fn convex_hull(points: Vec<Vertex>) -> Vec<Vertex> {
    geom::convex_hull(&points)
}

#[tauri::command]
pub fn simplify(line: Vec<Vertex>, epsilon: f64) -> Vec<Vertex> {
    geom::simplify(&line, epsilon)
}

#[tauri::command]
pub fn centroid(ring: Vec<Vertex>) -> Option<Vertex> {
    geom::centroid(&ring)
}

#[tauri::command]
pub fn point_in_polygon(ring: Vec<Vertex>, point: Vertex) -> bool {
    geom::point_in_polygon(&ring, &point)
}

#[tauri::command]
pub fn bounds(points: Vec<Vertex>) -> Option<Bounds> {
    geom::bounds(&points)
}

// ── Alignment setting-out (parity with the wasm surface) ────────────────────

/// Solve a simple horizontal circular curve from the point of intersection,
/// the two tangent azimuths (degrees) and the radius. Returns `None` for
/// degenerate input.
#[tauri::command]
pub fn horizontal_curve(
    pi: Vertex,
    back_azimuth: f64,
    fwd_azimuth: f64,
    radius: f64,
) -> Option<HorizontalCurve> {
    alignment::horizontal_curve(&pi, back_azimuth, fwd_azimuth, radius)
}

/// Solve and stake a horizontal curve at a fixed arc `interval`. Returns the
/// curve geometry and its stations, or `None` for degenerate input.
#[tauri::command]
pub fn stake_horizontal_curve(
    pi: Vertex,
    back_azimuth: f64,
    fwd_azimuth: f64,
    radius: f64,
    interval: f64,
) -> Option<(HorizontalCurve, Vec<CurveStation>)> {
    let curve = alignment::horizontal_curve(&pi, back_azimuth, fwd_azimuth, radius)?;
    let stations = alignment::stake_horizontal_curve(&curve, back_azimuth, interval);
    Some((curve, stations))
}

/// Design an equal-tangent vertical parabolic curve. Grades are in percent.
#[tauri::command]
pub fn vertical_curve(
    bvc_elevation: f64,
    g1: f64,
    g2: f64,
    length: f64,
    interval: f64,
) -> Option<VerticalCurve> {
    alignment::vertical_curve(bvc_elevation, g1, g2, length, interval)
}

// ── Terrain analysis (parity with the wasm surface) ─────────────────────────

/// Per-triangle slope, aspect and area for every triangle of the TIN.
#[tauri::command]
pub fn analyse_terrain(tin: Tin) -> Vec<TriangleAnalysis> {
    terrain::analyse_triangles(&tin)
}

/// Whole-surface terrain statistics. Returns `None` for an empty TIN.
#[tauri::command]
pub fn terrain_stats(tin: Tin) -> Option<TerrainStats> {
    terrain::terrain_stats(&tin)
}

// ── GeoJSON interchange ──────────────────────────────────────────────────────

#[tauri::command]
pub fn model_to_geojson(model: GeoModel) -> String {
    geojson_io::model_to_geojson(&model)
}

#[tauri::command]
pub fn model_from_geojson(text: String) -> GeoModel {
    geojson_io::model_from_geojson(&text)
}

// ── Datum / CRS transforms (PROJ-backed, desktop-only, feature-gated) ───────
//
// Real datum transforms need the PROJ library and are only available in the
// native desktop build compiled with `--features proj`. The web build uses the
// hand-rolled Karney projection in `projection.ts`.

/// A reprojected coordinate result (X = Easting, Y = Northing).
#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize)]
pub struct ReprojectedPoint {
    pub e: f64,
    pub n: f64,
}

/// Whether this build can perform PROJ-backed datum transforms.
///
/// The frontend calls this once to decide whether to offer real reprojection
/// (desktop build compiled with `--features proj`) or to fall back to the
/// in-app Karney projection. Cheap and side-effect free.
#[tauri::command]
pub fn proj_available() -> bool {
    cfg!(feature = "proj")
}

/// Reproject a batch of coordinates between two CRS identified by PROJ strings
/// or EPSG codes (e.g. "EPSG:4326" -> "EPSG:32735"). Input/output use the
/// X = Easting, Y = Northing convention.
///
/// When the crate is built WITHOUT the `proj` feature this returns an error so
/// the caller can fall back to the in-app projection math.
#[tauri::command]
pub fn reproject(
    from: String,
    to: String,
    points: Vec<Vertex>,
) -> Result<Vec<ReprojectedPoint>, String> {
    reproject_impl(&from, &to, &points)
}

#[cfg(feature = "proj")]
fn reproject_impl(
    from: &str,
    to: &str,
    points: &[Vertex],
) -> Result<Vec<ReprojectedPoint>, String> {
    use proj::Proj;

    if from.trim().is_empty() || to.trim().is_empty() {
        return Err("Both source and target CRS must be specified.".into());
    }
    // Building the transformer is the expensive step; do it once and reuse it
    // across the whole batch.
    let transformer = Proj::new_known_crs(from, to, None)
        .map_err(|e| format!("PROJ init failed ({from} -> {to}): {e}"))?;

    let mut out = Vec::with_capacity(points.len());
    for v in points {
        // PROJ works in (x, y) = (Easting/lon, Northing/lat).
        let (x, y) = transformer
            .convert((v.e, v.n))
            .map_err(|e| format!("PROJ convert failed: {e}"))?;
        if !x.is_finite() || !y.is_finite() {
            return Err("PROJ produced a non-finite coordinate (out of CRS domain?).".into());
        }
        out.push(ReprojectedPoint { e: x, n: y });
    }
    Ok(out)
}

#[cfg(not(feature = "proj"))]
fn reproject_impl(
    _from: &str,
    _to: &str,
    _points: &[Vertex],
) -> Result<Vec<ReprojectedPoint>, String> {
    Err("PROJ support not compiled in (build with --features proj)".into())
}

// ── GDAL raster/vector I/O (desktop-only, feature-gated) ────────────────────
//
// GDAL wraps the system GDAL C library and only exists in the native desktop
// build compiled with `--features gdal`. The web build has no equivalent.

/// Whether this build can perform GDAL-backed raster/vector I/O.
#[tauri::command]
pub fn gdal_available() -> bool {
    cfg!(feature = "gdal")
}

/// Read the corner coordinates of a raster dataset (e.g. a GeoTIFF DEM) as a
/// bounding box, using GDAL's geotransform. Returns an error when GDAL support
/// is not compiled in or the file cannot be opened.
#[tauri::command]
pub fn raster_bounds(path: String) -> Result<Bounds, String> {
    raster_bounds_impl(&path)
}

#[cfg(feature = "gdal")]
fn raster_bounds_impl(path: &str) -> Result<Bounds, String> {
    use gdal::Dataset;

    let ds = Dataset::open(path).map_err(|e| format!("GDAL open failed ({path}): {e}"))?;
    let (width, height) = ds.raster_size();
    let gt = ds
        .geo_transform()
        .map_err(|e| format!("GDAL geotransform unavailable: {e}"))?;

    // gt = [origin_x, pixel_w, row_rot, origin_y, col_rot, pixel_h]
    let corner = |px: f64, py: f64| -> (f64, f64) {
        let x = gt[0] + px * gt[1] + py * gt[2];
        let y = gt[3] + px * gt[4] + py * gt[5];
        (x, y)
    };
    let (w, h) = (width as f64, height as f64);
    let (x0, y0) = corner(0.0, 0.0);
    let (x1, y1) = corner(w, h);

    Ok(Bounds {
        min_e: x0.min(x1),
        max_e: x0.max(x1),
        min_n: y0.min(y1),
        max_n: y0.max(y1),
    })
}

#[cfg(not(feature = "gdal"))]
fn raster_bounds_impl(_path: &str) -> Result<Bounds, String> {
    Err("GDAL support not compiled in (build with --features gdal)".into())
}

/// Parse a DXF/DWG byte buffer through GDAL's OGR vector drivers and return a
/// simplified CAD import structure. Desktop builds compiled with `--features gdal`
/// can use the system GDAL library; web builds fall back to the WASM parser.
#[tauri::command]
pub fn parse_cad_file_gdal(bytes: Vec<u8>, file_name: String) -> Result<CadImportResult, String> {
    parse_cad_file_gdal_impl(&bytes, &file_name)
}

#[cfg(feature = "gdal")]
fn parse_cad_file_gdal_impl(bytes: &[u8], file_name: &str) -> Result<CadImportResult, String> {
    use gdal::vector::{FieldValue, LayerAccess};
    use gdal::Dataset;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    /// DXF `$INSUNITS` drawing-unit codes converted to a metres multiplier.
    /// The code is an enum, NOT a scale factor: mm (4) → 0.001, not ×4.
    fn insunits_to_metres(code: i64) -> f64 {
        match code {
            1 => 0.0254,                      // inches
            2 => 0.3048,                      // feet
            3 => 1609.344,                    // miles
            4 => 0.001,                       // millimetres
            5 => 0.01,                        // centimetres
            6 => 1.0,                         // metres
            7 => 1_000.0,                     // kilometres
            8 => 0.000_025_4,                 // microinches
            9 => 0.001,                       // mils (≈mm)
            10 => 0.9144,                     // yards
            11 => 1e-10,                      // ångströms
            12 => 1e-9,                       // nanometres
            13 => 1e-6,                       // micrometres
            14 => 0.1,                        // decimetres
            15 => 10.0,                       // decametres
            16 => 100.0,                      // hectometres
            18 => 149_597_870_700.0,          // astronomical units
            21 => 0.304_800_609_6,            // US survey feet
            22 => 0.025_400_050_8,            // US survey inches
            _ => 1.0,                         // 0 unitless / unknown → metres
        }
    }

    /// True when the OGR geometry carries Z coordinates. Legacy WKB encodes
    /// 25D geometries with bit 31 set (e.g. wkbPoint25D = 0x80000001); ISO WKB
    /// encodes the dimension family in the thousands digit (1 = Z, 3 = ZM).
    fn geometry_has_z(geom: &gdal::vector::Geometry) -> bool {
        let gt = geom.geometry_type() as u32;
        (gt & 0x8000_0000) != 0 || ((gt / 1000) % 10) == 1 || ((gt / 1000) % 10) == 3
    }

    /// Convert an OGR point to survey (Easting, Northing, Elevation). DXF drawing
    /// coordinates map directly: X → E, Y → N, Z → elevation. A genuine 0.000
    /// elevation must survive as Some(0.0) — a coastal benchmark is not "2D".
    fn vertex((x, y, z): (f64, f64, f64), has_z: bool) -> CadImportVertex {
        CadImportVertex {
            e: x,
            n: y,
            z: if has_z { Some(z) } else { None },
        }
    }

    fn ring_vertices(geom: &gdal::vector::Geometry) -> Vec<CadImportVertex> {
        // Query the dimension family ONCE per geometry, not per vertex: z is 0.0
        // in OGR tuples even when the geometry is 2D, and stripping z == 0.0
        // would silently demote every sea-level elevation in a 3D file.
        let has_z = geometry_has_z(geom);
        let count = geom.point_count();
        (0..count)
            .map(|i| vertex(geom.get_point(i as i32), has_z))
            .collect()
    }

    fn field_string(feature: &gdal::vector::Feature, name: &str) -> Option<String> {
        let idx = feature.field_index(name).ok()?;
        match feature.field(idx) {
            Ok(Some(FieldValue::StringValue(s))) if !s.is_empty() => Some(s),
            _ => None,
        }
    }

    fn field_real(feature: &gdal::vector::Feature, name: &str) -> Option<f64> {
        let idx = feature.field_index(name).ok()?;
        match feature.field(idx) {
            Ok(Some(FieldValue::RealValue(v))) => Some(v),
            Ok(Some(FieldValue::IntegerValue(v))) => Some(f64::from(v)),
            Ok(Some(FieldValue::Integer64Value(v))) => Some(v as f64),
            _ => None,
        }
    }

    fn field_real_any(feature: &gdal::vector::Feature, names: &[&str]) -> Option<f64> {
        for name in names {
            if let Some(v) = field_real(feature, name) {
                return Some(v);
            }
        }
        None
    }

    /// Read the DXF colour index / string that GDAL exposes in the Color field.
    fn field_color(feature: &gdal::vector::Feature) -> Option<String> {
        let idx = feature.field_index("Color").ok()?;
        match feature.field(idx) {
            Ok(Some(FieldValue::StringValue(s))) if !s.is_empty() => Some(s),
            Ok(Some(FieldValue::IntegerValue(v))) => Some(v.to_string()),
            Ok(Some(FieldValue::Integer64Value(v))) => Some(v.to_string()),
            _ => None,
        }
    }

    fn is_paper_space(feature: &gdal::vector::Feature) -> bool {
        if let Ok(idx) = feature.field_index("PaperSpace") {
            match feature.field(idx) {
                Ok(Some(FieldValue::IntegerValue(v))) => return v == 1,
                Ok(Some(FieldValue::Integer64Value(v))) => return v == 1,
                Ok(Some(FieldValue::StringValue(s))) => return s == "1",
                _ => {}
            }
        }
        false
    }

    fn extract_style(feature: &gdal::vector::Feature) -> CadImportStyle {
        CadImportStyle {
            color: field_color(feature),
            line_type: field_string(feature, "LineType"),
            line_weight: field_real(feature, "LineWeight"),
        }
    }

    fn extract_metadata(feature: &gdal::vector::Feature) -> HashMap<String, String> {
        let mut map = HashMap::new();
        for key in ["EntityHandle", "LinetypeScale", "Thickness"] {
            if let Some(v) = field_string(feature, key) {
                map.insert(key.to_string(), v);
            }
        }
        map
    }

    fn geom_text(feature: &gdal::vector::Feature) -> Option<String> {
        // GDAL DXF driver stores TEXT/MTEXT strings in the "Text" field.
        field_string(feature, "Text")
    }

    fn feature_layer_name(feature: &gdal::vector::Feature, fallback: &str) -> String {
        field_string(feature, "Layer").unwrap_or_else(|| fallback.to_string())
    }

    fn push_layer(result: &mut CadImportResult, name: &str) {
        if !result.layer_names.iter().any(|n| n == name) {
            result.layer_names.push(name.to_string());
        }
    }

    fn push_layer_style(result: &mut CadImportResult, name: &str, style: CadImportStyle) {
        result
            .layer_styles
            .entry(name.to_string())
            .or_insert(style);
    }

    fn apply_scale(v: &mut CadImportVertex, scale: f64) {
        v.e *= scale;
        v.n *= scale;
        if let Some(z) = v.z.as_mut() {
            *z *= scale;
        }
    }

    fn scaled_point(
        (x, y, z): (f64, f64, f64),
        scale: f64,
        has_elevation: bool,
    ) -> (f64, f64, Option<f64>) {
        (
            x * scale,
            y * scale,
            if has_elevation { Some(z * scale) } else { None },
        )
    }

    fn add_linestring(
        result: &mut CadImportResult,
        geom: &gdal::vector::Geometry,
        closed: bool,
        layer_name: &str,
        paper_space: bool,
        style: &CadImportStyle,
        metadata: &HashMap<String, String>,
        unit_scale: f64,
    ) {
        let mut vertices = ring_vertices(geom);
        if vertices.len() >= 2 {
            for v in &mut vertices {
                apply_scale(v, unit_scale);
            }
            result.linework.push(CadImportLinework {
                kind: if vertices.len() == 2 {
                    "line".to_string()
                } else {
                    "polyline".to_string()
                },
                vertices,
                closed,
                layer_name: layer_name.to_string(),
                paper_space,
                style: style.clone(),
                metadata: metadata.clone(),
            });
        }
    }

    /// Import a point geometry. If the feature carries a Text field the OGR
    /// driver has exposed it as a TEXT/MTEXT entity, otherwise it is a plain
    /// reference point.
    fn add_point_or_text(
        result: &mut CadImportResult,
        feature: &gdal::vector::Feature,
        geom: &gdal::vector::Geometry,
        layer_name: &str,
        paper_space: bool,
        style: &CadImportStyle,
        metadata: &HashMap<String, String>,
        counter: &mut u64,
        unit_scale: f64,
    ) {
        let (x, y, z) = geom.get_point(0);
        let (e, n, z) = scaled_point((x, y, z), unit_scale, geometry_has_z(geom));
        if let Some(text) = geom_text(feature) {
            result.texts.push(CadImportText {
                e,
                n,
                z,
                text,
                layer_name: layer_name.to_string(),
                height: field_real(feature, "TextHeight"),
                rotation: field_real(feature, "TextRotation"),
                paper_space,
                style: style.clone(),
                metadata: metadata.clone(),
            });
        } else {
            *counter += 1;
            result.points.push(CadImportPoint {
                point_no: counter.to_string(),
                e,
                n,
                z,
                code: "CAD".to_string(),
                layer_name: layer_name.to_string(),
                paper_space,
                style: style.clone(),
                metadata: metadata.clone(),
            });
        }
    }

    /// Fit a circle through three vertices. Returns (center_e, center_n, radius).
    fn circle_from_three_points(a: &CadImportVertex, b: &CadImportVertex, c: &CadImportVertex) -> Option<(f64, f64, f64)> {
        let d = 2.0 * (a.e * (b.n - c.n) + b.e * (c.n - a.n) + c.e * (a.n - b.n));
        if d.abs() < 1e-12 {
            return None;
        }
        let a2 = a.e * a.e + a.n * a.n;
        let b2 = b.e * b.e + b.n * b.n;
        let c2 = c.e * c.e + c.n * c.n;
        let ux = (a2 * (b.n - c.n) + b2 * (c.n - a.n) + c2 * (a.n - b.n)) / d;
        let uy = (a2 * (c.e - b.e) + b2 * (a.e - c.e) + c2 * (b.e - a.e)) / d;
        let r = ((a.e - ux).powi(2) + (a.n - uy).powi(2)).sqrt();
        Some((ux, uy, r))
    }

    fn add_arc(
        result: &mut CadImportResult,
        center_e: f64,
        center_n: f64,
        center_z: Option<f64>,
        radius: f64,
        start_deg: f64,
        end_deg: f64,
        layer_name: &str,
        paper_space: bool,
        style: &CadImportStyle,
        metadata: &HashMap<String, String>,
        unit_scale: f64,
    ) {
        // Structured entity ONLY — rendering a duplicate 72-segment polyline
        // approximation alongside made every imported arc/circle/ellipse
        // appear twice on the canvas.
        result.arcs.push(CadImportArc {
            center_e: center_e * unit_scale,
            center_n: center_n * unit_scale,
            center_z: center_z.map(|z| z * unit_scale),
            radius: radius * unit_scale,
            start_angle: start_deg,
            end_angle: end_deg,
            layer_name: layer_name.to_string(),
            paper_space,
            style: style.clone(),
            metadata: metadata.clone(),
        });
    }

    fn add_circle(
        result: &mut CadImportResult,
        center_e: f64,
        center_n: f64,
        center_z: Option<f64>,
        radius: f64,
        layer_name: &str,
        paper_space: bool,
        style: &CadImportStyle,
        metadata: &HashMap<String, String>,
        unit_scale: f64,
    ) {
        // Structured circle only (no polyline duplicate — see add_arc).
        result.circles.push(CadImportCircle {
            center_e: center_e * unit_scale,
            center_n: center_n * unit_scale,
            center_z: center_z.map(|z| z * unit_scale),
            radius: radius * unit_scale,
            layer_name: layer_name.to_string(),
            paper_space,
            style: style.clone(),
            metadata: metadata.clone(),
        });
    }

    /// Add an ellipse as structured data only.
    fn add_ellipse(
        result: &mut CadImportResult,
        center_e: f64,
        center_n: f64,
        center_z: Option<f64>,
        semi_major: f64,
        semi_minor: f64,
        rotation_deg: f64,
        layer_name: &str,
        paper_space: bool,
        style: &CadImportStyle,
        metadata: &HashMap<String, String>,
        unit_scale: f64,
    ) {
        // Structured entity only — the frontend renders ellipses natively
        // (a polyline approximation alongside made imports appear twice).
        result.ellipses.push(CadImportEllipse {
            center_e: center_e * unit_scale,
            center_n: center_n * unit_scale,
            center_z: center_z.map(|z| z * unit_scale),
            semi_major: semi_major * unit_scale,
            semi_minor: semi_minor * unit_scale,
            rotation: rotation_deg,
            layer_name: layer_name.to_string(),
            paper_space,
            style: style.clone(),
            metadata: metadata.clone(),
        });
    }

    fn add_hatch(
        result: &mut CadImportResult,
        feature: &gdal::vector::Feature,
        geom: &gdal::vector::Geometry,
        layer_name: &str,
        paper_space: bool,
        style: &CadImportStyle,
        metadata: &HashMap<String, String>,
        unit_scale: f64,
    ) {
        let mut outer;
        let mut holes = Vec::new();
        if geom.geometry_count() > 0 {
            let ring = geom.get_geometry(0);
            outer = ring_vertices(&*ring);
            for h in 1..geom.geometry_count() {
                let hole = geom.get_geometry(h);
                holes.push(ring_vertices(&*hole));
            }
        } else {
            outer = ring_vertices(geom);
        }
        for v in &mut outer {
            apply_scale(v, unit_scale);
        }
        for hole in &mut holes {
            for v in hole {
                apply_scale(v, unit_scale);
            }
        }
        let mut pattern = field_string(feature, "HatchPattern").or_else(|| field_string(feature, "PatternName"));
        if pattern.is_none() {
            // GDAL DXF driver sometimes exposes the pattern in a style string.
            pattern = field_string(feature, "OGR_STYLE").and_then(|s| {
                s.split(';').find_map(|part| {
                    let part = part.trim();
                    if part.starts_with("BRUSH") {
                        part.split(',').find_map(|kv| {
                            let kv = kv.trim();
                            if kv.starts_with("id:") {
                                Some(kv[3..].to_string())
                            } else {
                                None
                            }
                        })
                    } else {
                        None
                    }
                })
            });
        }
        result.hatches.push(CadImportHatch {
            vertices: outer.clone(),
            holes,
            pattern,
            pattern_scale: field_real(feature, "HatchPatternScale"),
            pattern_angle: field_real(feature, "HatchPatternAngle"),
            layer_name: layer_name.to_string(),
            paper_space,
            style: style.clone(),
            metadata: metadata.clone(),
        });
        // Rendered natively by the frontend (fill + holes) — no boundary
        // linework duplicate.
    }

    fn add_dimension(
        result: &mut CadImportResult,
        feature: &gdal::vector::Feature,
        geom: &gdal::vector::Geometry,
        layer_name: &str,
        paper_space: bool,
        style: &CadImportStyle,
        metadata: &HashMap<String, String>,
        unit_scale: f64,
    ) {
        let mut def_points = ring_vertices(geom);
        for v in &mut def_points {
            apply_scale(v, unit_scale);
        }
        let text = geom_text(feature).unwrap_or_default();
        let text_e = field_real(feature, "TextX").or_else(|| def_points.first().map(|v| v.e)).unwrap_or(0.0);
        let text_n = field_real(feature, "TextY").or_else(|| def_points.first().map(|v| v.n)).unwrap_or(0.0);
        let text_z = field_real(feature, "TextZ");
        // Field-sourced Z stays None when the field is absent; a stored 0.000
        // is a real elevation and must be scaled, not stripped.
        let (text_e, text_n, text_z) = (
            text_e * unit_scale,
            text_n * unit_scale,
            text_z.map(|z| z * unit_scale),
        );
        let kind = field_string(feature, "DimensionType")
            .or_else(|| field_string(feature, "DimType"))
            .unwrap_or_else(|| "linear".to_string());
        result.dimensions.push(CadImportDimension {
            kind: kind.to_lowercase(),
            text: text.clone(),
            text_e,
            text_n,
            text_z,
            def_points: def_points.clone(),
            angle: field_real(feature, "DimAngle"),
            layer_name: layer_name.to_string(),
            paper_space,
            style: style.clone(),
            metadata: metadata.clone(),
        });
        // Rendered natively by the frontend (extension lines + text) — no
        // separate text/polyline duplicates.
    }

    fn add_insert(
        result: &mut CadImportResult,
        feature: &gdal::vector::Feature,
        geom: &gdal::vector::Geometry,
        layer_name: &str,
        paper_space: bool,
        style: &CadImportStyle,
        metadata: &HashMap<String, String>,
        counter: &mut u64,
        unit_scale: f64,
    ) {
        let (x, y, z) = geom.get_point(0);
        let (e, n, z) = scaled_point((x, y, z), unit_scale, geometry_has_z(geom));
        let block_name = field_string(feature, "BlockName").unwrap_or_else(|| "BLOCK".to_string());
        let scale_x = field_real_any(feature, &["BlockScaleX", "ScaleX"]).unwrap_or(1.0);
        let scale_y = field_real_any(feature, &["BlockScaleY", "ScaleY"]).unwrap_or(1.0);
        let scale_z = field_real_any(feature, &["BlockScaleZ", "ScaleZ"]).unwrap_or(1.0);
        let rotation = field_real_any(feature, &["BlockAngle", "Rotation"]).unwrap_or(0.0);
        result.inserts.push(CadImportInsert {
            block_name: block_name.clone(),
            e,
            n,
            z,
            scale_x,
            scale_y,
            scale_z,
            rotation,
            layer_name: layer_name.to_string(),
            paper_space,
            style: style.clone(),
            metadata: metadata.clone(),
        });
        // The frontend represents the insert as a text label — a duplicate
        // reference point made it appear twice.
    }

    /// Detect a roughly circular polygon by checking that all vertices lie close
    /// to a common radius from the centroid.
    fn detect_circle_polygon(verts: &[CadImportVertex]) -> Option<(f64, f64, f64)> {
        if verts.len() < 8 {
            return None;
        }
        let (sum_e, sum_n) = verts.iter().fold((0.0, 0.0), |(se, sn), v| (se + v.e, sn + v.n));
        let (ce, cn) = (sum_e / verts.len() as f64, sum_n / verts.len() as f64);
        let mut r_sum = 0.0;
        let mut r_max: f64 = 0.0;
        for v in verts {
            let r = ((v.e - ce).powi(2) + (v.n - cn).powi(2)).sqrt();
            r_sum += r;
            r_max = r_max.max(r);
        }
        let r_avg = r_sum / verts.len() as f64;
        if r_avg <= 0.0 || r_max / r_avg > 1.05 {
            return None;
        }
        Some((ce, cn, r_avg))
    }

    /// Try to recover arcs, circles and ellipses from curve geometries or from
    /// DXF-specific fields exposed by the GDAL DXF driver.
    fn try_curve_geometry(
        result: &mut CadImportResult,
        feature: &gdal::vector::Feature,
        geom: &gdal::vector::Geometry,
        layer_name: &str,
        paper_space: bool,
        style: &CadImportStyle,
        metadata: &HashMap<String, String>,
        unit_scale: f64,
    ) {
        let gt = geom.geometry_type();

        // Curve types that GDAL can expose for CIRCLE / ARC / ELLIPSE.
        let is_curve = matches!(
            gt,
            gdal::vector::OGRwkbGeometryType::wkbCircularString
                | gdal::vector::OGRwkbGeometryType::wkbCircularStringZ
                | gdal::vector::OGRwkbGeometryType::wkbCompoundCurve
                | gdal::vector::OGRwkbGeometryType::wkbCompoundCurveZ
                | gdal::vector::OGRwkbGeometryType::wkbCurvePolygon
                | gdal::vector::OGRwkbGeometryType::wkbCurvePolygonZ
        );

        if is_curve {
            let verts = ring_vertices(geom);
            if verts.len() == 3 {
                if let Some((ce, cn, r)) = circle_from_three_points(&verts[0], &verts[1], &verts[2]) {
                    let (start, end) = if geom.geometry_count() == 1 &&
                        field_real_any(feature, &["StartAngle", "Start_Angle"]).is_some()
                    {
                        let s = field_real_any(feature, &["StartAngle", "Start_Angle"]).unwrap_or(0.0);
                        let e = field_real_any(feature, &["EndAngle", "End_Angle"]).unwrap_or(360.0);
                        (s, e)
                    } else {
                        (0.0, 360.0)
                    };
                    if (end - start).abs() < 1.0 || (end - start).abs() > 359.0 {
                        add_circle(result, ce, cn, verts[0].z, r, layer_name, paper_space, style, metadata, unit_scale);
                    } else {
                        add_arc(result, ce, cn, verts[0].z, r, start, end, layer_name, paper_space, style, metadata, unit_scale);
                    }
                    return;
                }
            }
        }

        // Field-based detection for CIRCLE / ARC / ELLIPSE.
        if let Some(radius) = field_real_any(feature, &["Radius", "R"]) {
            let (x, y, center_z) = if geom.point_count() > 0 {
                let (x, y, z) = geom.get_point(0);
                (
                    x,
                    y,
                    if geometry_has_z(geom) { Some(z) } else { None },
                )
            } else {
                (
                    field_real(feature, "CenterX").unwrap_or(0.0),
                    field_real(feature, "CenterY").unwrap_or(0.0),
                    field_real(feature, "CenterZ"),
                )
            };
            let start = field_real_any(feature, &["StartAngle", "Start_Angle"]);
            let end = field_real_any(feature, &["EndAngle", "End_Angle"]);

            if let (Some(s), Some(e)) = (start, end) {
                if (e - s).abs() < 1.0 || (e - s).abs() > 359.0 {
                    add_circle(result, x, y, center_z, radius, layer_name, paper_space, style, metadata, unit_scale);
                } else {
                    add_arc(result, x, y, center_z, radius, s, e, layer_name, paper_space, style, metadata, unit_scale);
                }
                return;
            }
            add_circle(result, x, y, center_z, radius, layer_name, paper_space, style, metadata, unit_scale);
            return;
        }

        // Ellipse fields.
        if field_real_any(feature, &["SemiMajor", "MajorRadius", "RadiusRatio"]).is_some() {
            let x = field_real(feature, "CenterX").unwrap_or(0.0);
            let y = field_real(feature, "CenterY").unwrap_or(0.0);
            // Keep the field Option — a stored 0.000 is a real elevation.
            let center_z = field_real(feature, "CenterZ");
            let ratio = field_real_any(feature, &["RadiusRatio", "SemiMinorRatio"]).unwrap_or(1.0);
            let a = field_real_any(feature, &["SemiMajor", "MajorRadius"]).unwrap_or(0.0);
            let b = a * ratio;
            let rot = field_real_any(feature, &["Rotation", "EllipseRotation"]).unwrap_or(0.0);
            if a > 0.0 {
                add_ellipse(result, x, y, center_z, a, b.abs(), rot, layer_name, paper_space, style, metadata, unit_scale);
                return;
            }
        }
    }

    fn add_geometry(
        result: &mut CadImportResult,
        feature: &gdal::vector::Feature,
        geom: &gdal::vector::Geometry,
        fallback_layer: &str,
        counter: &mut u64,
        unit_scale: f64,
    ) {
        let layer_name = feature_layer_name(feature, fallback_layer);
        push_layer(result, &layer_name);
        let style = extract_style(feature);
        push_layer_style(result, &layer_name, style.clone());
        let metadata = extract_metadata(feature);
        let paper_space = is_paper_space(feature);

        // INSERT references have a BlockName and a single insertion point.
        if field_string(feature, "BlockName").is_some() {
            add_insert(result, feature, geom, &layer_name, paper_space, &style, &metadata, counter, unit_scale);
            return;
        }

        // Dimensions carry explicit dimension fields.
        if field_string(feature, "DimensionType").is_some()
            || field_string(feature, "DimType").is_some()
            || field_string(feature, "DimStyle").is_some()
        {
            add_dimension(result, feature, geom, &layer_name, paper_space, &style, &metadata, unit_scale);
            return;
        }

        // Hatches are polygons with a pattern.
        if field_string(feature, "HatchPattern").is_some()
            || field_string(feature, "PatternName").is_some()
            || (geom.geometry_type() == gdal::vector::OGRwkbGeometryType::wkbPolygon
                && field_real(feature, "HatchPatternScale").is_some())
        {
            add_hatch(result, feature, geom, &layer_name, paper_space, &style, &metadata, unit_scale);
            return;
        }

        match geom.geometry_type() {
            gdal::vector::OGRwkbGeometryType::wkbPoint
            | gdal::vector::OGRwkbGeometryType::wkbPoint25D => {
                add_point_or_text(result, feature, geom, &layer_name, paper_space, &style, &metadata, counter, unit_scale);
            }
            gdal::vector::OGRwkbGeometryType::wkbLineString
            | gdal::vector::OGRwkbGeometryType::wkbLineString25D => {
                // A short line with Radius/Start/End fields is an arc.
                if field_real_any(feature, &["Radius", "StartAngle", "EndAngle"]).is_some() {
                    try_curve_geometry(result, feature, geom, &layer_name, paper_space, &style, &metadata, unit_scale);
                } else {
                    add_linestring(result, geom, false, &layer_name, paper_space, &style, &metadata, unit_scale);
                }
            }
            gdal::vector::OGRwkbGeometryType::wkbPolygon
            | gdal::vector::OGRwkbGeometryType::wkbPolygon25D => {
                let ext = geom.get_geometry(0);
                let mut outer = ring_vertices(&*ext);
                if let Some((ce, cn, r)) = detect_circle_polygon(&outer) {
                    let center_z = outer.first().and_then(|v| v.z);
                    add_circle(result, ce, cn, center_z, r, &layer_name, paper_space, &style, &metadata, unit_scale);
                } else {
                    for v in &mut outer {
                        apply_scale(v, unit_scale);
                    }
                    result.linework.push(CadImportLinework {
                        kind: "boundary".to_string(),
                        vertices: outer,
                        closed: true,
                        layer_name: layer_name.clone(),
                        paper_space,
                        style: style.clone(),
                        metadata: metadata.clone(),
                    });
                }
            }
            gdal::vector::OGRwkbGeometryType::wkbMultiLineString
            | gdal::vector::OGRwkbGeometryType::wkbMultiPolygon
            | gdal::vector::OGRwkbGeometryType::wkbMultiPoint
            | gdal::vector::OGRwkbGeometryType::wkbGeometryCollection => {
                for i in 0..geom.geometry_count() {
                    let sub = geom.get_geometry(i);
                    add_geometry(result, feature, &*sub, fallback_layer, counter, unit_scale);
                }
            }
            // DXF arcs/circles/ellipses may be exposed as curve geometries.
            other => {
                try_curve_geometry(result, feature, geom, &layer_name, paper_space, &style, &metadata, unit_scale);
                let vertices = ring_vertices(geom);
                if vertices.len() >= 2 {
                    add_linestring(result, geom, false, &layer_name, paper_space, &style, &metadata, unit_scale);
                } else if vertices.is_empty() {
                    result.unsupported.push(format!("{:?}", other));
                }
            }
        }
    }

    let ext = file_name.rsplit('.').next().unwrap_or("dxf").to_lowercase();
    let tmp = std::env::temp_dir().join(format!(
        "sitesurveyor_cad_import_{}_{}.{}",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed),
        ext
    ));
    std::fs::write(&tmp, bytes).map_err(|e| format!("Failed to stage CAD file for GDAL: {e}"))?;

    let result = (|| -> Result<CadImportResult, String> {
        let ds = Dataset::open(&tmp).map_err(|e| format!("GDAL open failed ({file_name}): {e}"))?;

        // Try to read DXF INSUNITS. GDAL exposes it in the dataset metadata in
        // some form depending on the build; fall back to 1.0 (no scaling).
        // IMPORTANT: INSUNITS is a unit CODE (4=mm, 6=m, 2=ft...) — never a
        // multiplier, so code 4 must scale a drawing DOWN (0.001), not ×4.
        let unit_scale: f64 = ds
            .metadata_item("INSUNITS", "DXF")
            .and_then(|v| v.trim().parse::<i64>().ok())
            .map(insunits_to_metres)
            .unwrap_or(1.0);

        let mut result = CadImportResult {
            points: Vec::new(),
            linework: Vec::new(),
            texts: Vec::new(),
            arcs: Vec::new(),
            circles: Vec::new(),
            ellipses: Vec::new(),
            hatches: Vec::new(),
            dimensions: Vec::new(),
            inserts: Vec::new(),
            layer_names: Vec::new(),
            layer_styles: HashMap::new(),
            unsupported: Vec::new(),
            unit_scale,
        };

        let mut point_counter = 0u64;

        for mut layer in ds.layers() {
            let fallback_layer = layer.name();
            for feature in layer.features() {
                if let Some(geom) = feature.geometry() {
                    add_geometry(
                        &mut result,
                        &feature,
                        geom,
                        &fallback_layer,
                        &mut point_counter,
                        unit_scale,
                    );
                } else if let Some(text) = geom_text(&feature) {
                    result.unsupported.push(format!(
                        "TEXT without geometry: {}",
                        text.chars().take(40).collect::<String>()
                    ));
                }
            }
        }

        // Deduplicate unsupported list while preserving order.
        let mut seen = std::collections::HashSet::new();
        result.unsupported.retain(|u| seen.insert(u.clone()));

        Ok(result)
    })();

    let _ = std::fs::remove_file(&tmp);
    result
}

#[cfg(not(feature = "gdal"))]
fn parse_cad_file_gdal_impl(_bytes: &[u8], _file_name: &str) -> Result<CadImportResult, String> {
    Err("GDAL support not compiled in (build with --features gdal)".into())
}

// ── Shapefile import (desktop-only, feature-gated) ──────────────────────────

/// Whether this build can read ESRI Shapefiles.
#[tauri::command]
pub fn shapefile_available() -> bool {
    cfg!(feature = "shapefile")
}

/// Read all point geometries from a shapefile into project N/E vertices.
/// Non-point shapes contribute each of their points.
#[tauri::command]
pub fn read_shapefile_points(path: String) -> Result<Vec<Vertex>, String> {
    read_shapefile_points_impl(&path)
}

#[cfg(feature = "shapefile")]
fn read_shapefile_points_impl(path: &str) -> Result<Vec<Vertex>, String> {
    use shapefile::record::point::Point as ShpPoint;
    use shapefile::Shape;

    let mut reader =
        shapefile::Reader::from_path(path).map_err(|e| format!("Shapefile open failed: {e}"))?;

    let mut out = Vec::new();
    let push = |out: &mut Vec<Vertex>, p: &ShpPoint| out.push(Vertex { e: p.x, n: p.y });

    for shape in reader.iter_shapes() {
        let shape = shape.map_err(|e| format!("Shapefile read failed: {e}"))?;
        match shape {
            Shape::Point(p) => push(&mut out, &p),
            Shape::Polyline(pl) => {
                for part in pl.parts() {
                    for p in part {
                        push(&mut out, p);
                    }
                }
            }
            Shape::Polygon(pg) => {
                for ring in pg.rings() {
                    for p in ring.points() {
                        push(&mut out, p);
                    }
                }
            }
            Shape::Multipoint(mp) => {
                for p in mp.points() {
                    push(&mut out, p);
                }
            }
            _ => {}
        }
    }
    Ok(out)
}

#[cfg(not(feature = "shapefile"))]
fn read_shapefile_points_impl(_path: &str) -> Result<Vec<Vertex>, String> {
    Err("Shapefile support not compiled in (build with --features shapefile)".into())
}

// ── LiDAR .las/.laz import (desktop-only, feature-gated) ────────────────────

/// Whether this build can read LiDAR .las/.laz point clouds.
#[tauri::command]
pub fn las_available() -> bool {
    cfg!(feature = "las")
}

/// Read a LiDAR point cloud into 3D survey points (E, N, Z).
#[tauri::command]
pub fn read_las_points(path: String) -> Result<Vec<Point3>, String> {
    read_las_points_impl(&path)
}

#[cfg(feature = "las")]
fn read_las_points_impl(path: &str) -> Result<Vec<Point3>, String> {
    use las::{Read, Reader};

    let mut reader =
        Reader::from_path(path).map_err(|e| format!("LAS open failed ({path}): {e}"))?;
    let mut out = Vec::new();
    for point in reader.points() {
        let p = point.map_err(|e| format!("LAS read failed: {e}"))?;
        out.push(Point3 {
            e: p.x,
            n: p.y,
            z: p.z,
        });
    }
    Ok(out)
}

#[cfg(not(feature = "las"))]
fn read_las_points_impl(_path: &str) -> Result<Vec<Point3>, String> {
    Err("LAS support not compiled in (build with --features las)".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proj_available_matches_feature_flag() {
        assert_eq!(proj_available(), cfg!(feature = "proj"));
    }

    #[cfg(not(feature = "proj"))]
    #[test]
    fn reproject_without_feature_reports_unavailable() {
        let err = reproject_impl("EPSG:4326", "EPSG:32735", &[]).unwrap_err();
        assert!(err.contains("not compiled in"));
    }

    #[cfg(feature = "proj")]
    #[test]
    fn reproject_wgs84_to_utm35s_roundtrips() {
        // A point in central Zimbabwe (lon ~31, lat ~ -17.8). Easting carries
        // longitude, Northing carries latitude in the (x, y) convention.
        let src = [Vertex {
            e: 31.05,
            n: -17.83,
        }];
        let fwd = reproject_impl("EPSG:4326", "EPSG:32735", &src).unwrap();
        assert_eq!(fwd.len(), 1);
        let back = reproject_impl(
            "EPSG:32735",
            "EPSG:4326",
            &[Vertex {
                e: fwd[0].e,
                n: fwd[0].n,
            }],
        )
        .unwrap();
        assert!((back[0].e - 31.05).abs() < 1e-6, "lon was {}", back[0].e);
        assert!((back[0].n + 17.83).abs() < 1e-6, "lat was {}", back[0].n);
    }

    #[cfg(feature = "proj")]
    #[test]
    fn reproject_rejects_empty_crs() {
        assert!(reproject_impl("", "EPSG:4326", &[]).is_err());
    }
}
