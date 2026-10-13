//! wasm-bindgen surface for `survey-core`.
//!
//! The JS bridge (`frontend/.../survey/tinBridge.ts`) calls these functions
//! with plain serde-serialised structures. Each function accepts and returns
//! `JsValue` via `serde-wasm-bindgen` so the TypeScript types stay aligned with
//! the Rust domain model in `survey-core`.

use serde::{Deserialize, Serialize};
use survey_core::circle_fit;
use survey_core::cogo;
use survey_core::constrained_tin::{self, ConstrainedTinOptions};
use survey_core::csv_io;
use survey_core::dxf_io::{self, DxfModel};
use survey_core::geojson_io::{self, GeoModel};
use survey_core::geom::{self, Bounds};
use survey_core::intersections;
use survey_core::resection;
use survey_core::wkt_io;
use survey_core::{alignment, contour, terrain, tin, volume, Point3, Tin, Vertex};
use wasm_bindgen::prelude::*;

fn err_to_js<E: std::fmt::Display>(e: E) -> JsValue {
    JsValue::from_str(&e.to_string())
}

/// Initialise panic hooks etc. Safe to call multiple times.
#[wasm_bindgen(start)]
pub fn start() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

#[derive(Serialize, Deserialize)]
struct PointsInput {
    points: Vec<Point3>,
}

#[derive(Serialize, Deserialize)]
struct ContourInput {
    tin: Tin,
    interval: f64,
    base: f64,
}

#[derive(Serialize, Deserialize)]
struct VolumeToElevationInput {
    tin: Tin,
    reference: f64,
}

#[derive(Serialize, Deserialize)]
struct VolumeBetweenInput {
    top: Tin,
    base: Tin,
}

fn from_js<T: for<'de> Deserialize<'de>>(value: JsValue) -> Result<T, JsValue> {
    serde_wasm_bindgen::from_value(value).map_err(|e| JsValue::from_str(&e.to_string()))
}

fn to_js<T: Serialize>(value: &T) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(value).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Build a TIN from `{ points: Point3[] }`. Returns a `Tin`.
#[wasm_bindgen]
pub fn build_tin(input: JsValue) -> Result<JsValue, JsValue> {
    let parsed: PointsInput = from_js(input)?;
    let result = tin::build_tin(&parsed.points).map_err(err_to_js)?;
    to_js(&result)
}

#[derive(Serialize, Deserialize)]
struct ConstrainedTinInput {
    points: Vec<Point3>,
    options: ConstrainedTinOptions,
}

/// Build a constrained TIN from `{ points, options: { breaklines, boundary } }`.
/// Returns `Tin`.
#[wasm_bindgen]
pub fn build_constrained_tin(input: JsValue) -> Result<JsValue, JsValue> {
    let parsed: ConstrainedTinInput = from_js(input)?;
    let result = constrained_tin::build_constrained_tin(&parsed.points, &parsed.options)
        .map_err(err_to_js)?;
    to_js(&result)
}

/// Generate contours from `{ tin, interval, base }`. Returns `ContourLine[]`.
#[wasm_bindgen]
pub fn generate_contours(input: JsValue) -> Result<JsValue, JsValue> {
    let parsed: ContourInput = from_js(input)?;
    let result =
        contour::generate_contours(&parsed.tin, parsed.interval, parsed.base).map_err(err_to_js)?;
    to_js(&result)
}

/// Cut/fill against a flat datum from `{ tin, reference }`. Returns `VolumeResult`.
#[wasm_bindgen]
pub fn volume_to_elevation(input: JsValue) -> Result<JsValue, JsValue> {
    let parsed: VolumeToElevationInput = from_js(input)?;
    let result = volume::volume_to_elevation(&parsed.tin, parsed.reference).map_err(err_to_js)?;
    to_js(&result)
}

/// Cut/fill between two surfaces from `{ top, base }`. Returns `VolumeResult`.
#[wasm_bindgen]
pub fn volume_between(input: JsValue) -> Result<JsValue, JsValue> {
    let parsed: VolumeBetweenInput = from_js(input)?;
    let result = volume::volume_between(&parsed.top, &parsed.base).map_err(err_to_js)?;
    to_js(&result)
}

// ── GeoRust `geo` algorithms ────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
struct RingInput {
    ring: Vec<Vertex>,
}

#[derive(Serialize, Deserialize)]
struct PointsInputNE {
    points: Vec<Vertex>,
}

#[derive(Serialize, Deserialize)]
struct SimplifyInput {
    line: Vec<Vertex>,
    epsilon: f64,
}

#[derive(Serialize, Deserialize)]
struct PointInPolygonInput {
    ring: Vec<Vertex>,
    point: Vertex,
}

/// Unsigned polygon area from `{ ring: Vertex[] }`. Returns a number (m²).
#[wasm_bindgen]
pub fn polygon_area(input: JsValue) -> Result<JsValue, JsValue> {
    let parsed: RingInput = from_js(input)?;
    to_js(&geom::polygon_area(&parsed.ring))
}

/// Convex hull from `{ points: Vertex[] }`. Returns `Vertex[]` (open ring).
#[wasm_bindgen]
pub fn convex_hull(input: JsValue) -> Result<JsValue, JsValue> {
    let parsed: PointsInputNE = from_js(input)?;
    to_js(&geom::convex_hull(&parsed.points))
}

/// Douglas–Peucker simplify from `{ line: Vertex[], epsilon }`. Returns `Vertex[]`.
#[wasm_bindgen]
pub fn simplify(input: JsValue) -> Result<JsValue, JsValue> {
    let parsed: SimplifyInput = from_js(input)?;
    to_js(&geom::simplify(&parsed.line, parsed.epsilon))
}

/// Centroid from `{ ring: Vertex[] }`. Returns `Vertex | null`.
#[wasm_bindgen]
pub fn centroid(input: JsValue) -> Result<JsValue, JsValue> {
    let parsed: RingInput = from_js(input)?;
    to_js(&geom::centroid(&parsed.ring))
}

/// Point-in-polygon from `{ ring, point }`. Returns a boolean.
#[wasm_bindgen]
pub fn point_in_polygon(input: JsValue) -> Result<JsValue, JsValue> {
    let parsed: PointInPolygonInput = from_js(input)?;
    to_js(&geom::point_in_polygon(&parsed.ring, &parsed.point))
}

/// Bounding rectangle from `{ points: Vertex[] }`. Returns `Bounds | null`.
#[wasm_bindgen]
pub fn bounds(input: JsValue) -> Result<JsValue, JsValue> {
    let parsed: PointsInputNE = from_js(input)?;
    let result: Option<Bounds> = geom::bounds(&parsed.points);
    to_js(&result)
}

// ── Alignment setting-out ────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
struct HorizontalCurveInput {
    pi: Vertex,
    back_azimuth: f64,
    fwd_azimuth: f64,
    radius: f64,
}

#[derive(Serialize, Deserialize)]
struct StakeHorizontalInput {
    pi: Vertex,
    back_azimuth: f64,
    fwd_azimuth: f64,
    radius: f64,
    interval: f64,
}

#[derive(Serialize, Deserialize)]
struct VerticalCurveInput {
    bvc_elevation: f64,
    g1: f64,
    g2: f64,
    length: f64,
    interval: f64,
}

/// Solve a horizontal circular curve from `{ pi, back_azimuth, fwd_azimuth,
/// radius }`. Returns `HorizontalCurve | null`.
#[wasm_bindgen]
pub fn horizontal_curve(input: JsValue) -> Result<JsValue, JsValue> {
    let p: HorizontalCurveInput = from_js(input)?;
    let result = alignment::horizontal_curve(&p.pi, p.back_azimuth, p.fwd_azimuth, p.radius);
    to_js(&result)
}

/// Solve and stake a horizontal curve at `interval` from `{ pi, back_azimuth,
/// fwd_azimuth, radius, interval }`. Returns `{ curve, stations } | null`.
#[wasm_bindgen]
pub fn stake_horizontal_curve(input: JsValue) -> Result<JsValue, JsValue> {
    let p: StakeHorizontalInput = from_js(input)?;
    match alignment::horizontal_curve(&p.pi, p.back_azimuth, p.fwd_azimuth, p.radius) {
        Some(curve) => {
            let stations = alignment::stake_horizontal_curve(&curve, p.back_azimuth, p.interval);
            #[derive(Serialize)]
            struct Out {
                curve: alignment::HorizontalCurve,
                stations: Vec<alignment::CurveStation>,
            }
            to_js(&Out { curve, stations })
        }
        None => to_js(&Option::<()>::None),
    }
}

/// Design a vertical parabolic curve from `{ bvc_elevation, g1, g2, length,
/// interval }`. Returns `VerticalCurve | null`.
#[wasm_bindgen]
pub fn vertical_curve(input: JsValue) -> Result<JsValue, JsValue> {
    let p: VerticalCurveInput = from_js(input)?;
    let result = alignment::vertical_curve(p.bvc_elevation, p.g1, p.g2, p.length, p.interval);
    to_js(&result)
}

// ── Terrain analysis ─────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
struct TinInput {
    tin: Tin,
}

/// Per-triangle slope/aspect/area from `{ tin }`. Returns `TriangleAnalysis[]`.
#[wasm_bindgen]
pub fn analyse_terrain(input: JsValue) -> Result<JsValue, JsValue> {
    let p: TinInput = from_js(input)?;
    to_js(&terrain::analyse_triangles(&p.tin))
}

/// Whole-surface terrain statistics from `{ tin }`. Returns `TerrainStats | null`.
#[wasm_bindgen]
pub fn terrain_stats(input: JsValue) -> Result<JsValue, JsValue> {
    let p: TinInput = from_js(input)?;
    to_js(&terrain::terrain_stats(&p.tin))
}

// ── GeoJSON interchange ──────────────────────────────────────────────────────

/// Serialise `{ points, linework }` to a GeoJSON FeatureCollection string.
#[wasm_bindgen]
pub fn model_to_geojson(input: JsValue) -> Result<JsValue, JsValue> {
    let parsed: GeoModel = from_js(input)?;
    to_js(&geojson_io::model_to_geojson(&parsed))
}

/// Parse a GeoJSON string into `{ points, linework }`.
#[wasm_bindgen]
pub fn model_from_geojson(text: &str) -> Result<JsValue, JsValue> {
    to_js(&geojson_io::model_from_geojson(text))
}

// ── COGO (parity with the desktop surface) ───────────────────────────────────

#[derive(Serialize, Deserialize)]
struct ForwardInput {
    start: cogo::Ne,
    azimuth_deg: f64,
    distance: f64,
}

#[derive(Serialize, Deserialize)]
struct TwoPointInput {
    from: cogo::Ne,
    to: cogo::Ne,
}

#[derive(Serialize, Deserialize)]
struct BearingBearingInput {
    p1: cogo::Ne,
    az1_deg: f64,
    p2: cogo::Ne,
    az2_deg: f64,
}

#[derive(Serialize, Deserialize)]
struct CogoRingInput {
    ring: Vec<cogo::Ne>,
}

/// Forward computation from `{ start: Ne, azimuth_deg, distance }`. Returns `Ne`.
#[wasm_bindgen]
pub fn cogo_forward(input: JsValue) -> Result<JsValue, JsValue> {
    let p: ForwardInput = from_js(input)?;
    to_js(&cogo::forward(&p.start, p.azimuth_deg, p.distance).map_err(err_to_js)?)
}

/// Inverse computation from `{ from: Ne, to: Ne }`. Returns `{ azimuth, distance }`.
#[wasm_bindgen]
pub fn cogo_inverse(input: JsValue) -> Result<JsValue, JsValue> {
    let p: TwoPointInput = from_js(input)?;
    let (az, dist) = cogo::inverse(&p.from, &p.to).map_err(err_to_js)?;
    #[derive(Serialize)]
    struct Out {
        azimuth: f64,
        distance: f64,
    }
    to_js(&Out {
        azimuth: az,
        distance: dist,
    })
}

/// Polygon area from `{ ring: Ne[] }`. Returns number (m²).
#[wasm_bindgen]
pub fn cogo_polygon_area(input: JsValue) -> Result<JsValue, JsValue> {
    let parsed: CogoRingInput = from_js(input)?;
    to_js(&cogo::polygon_area(&parsed.ring).map_err(err_to_js)?)
}

/// Bearing-bearing intersection from `{ p1, az1_deg, p2, az2_deg }`. Returns `Ne`.
#[wasm_bindgen]
pub fn cogo_intersection_bearing_bearing(input: JsValue) -> Result<JsValue, JsValue> {
    let p: BearingBearingInput = from_js(input)?;
    to_js(
        &cogo::intersection_bearing_bearing(&p.p1, p.az1_deg, &p.p2, p.az2_deg)
            .map_err(err_to_js)?,
    )
}

// ── Extended COGO / survey computations ──────────────────────────────────────

#[derive(Serialize, Deserialize)]
struct StakeOutInput {
    occupied: cogo::Ne,
    backsight: cogo::Ne,
    target: cogo::Ne,
    occupied_z: Option<f64>,
    target_z: Option<f64>,
}

/// Stake-out from `{ occupied, backsight, target, occupied_z?, target_z? }`.
/// Returns `StakeOutResult`.
#[wasm_bindgen]
pub fn cogo_stake_out(input: JsValue) -> Result<JsValue, JsValue> {
    let p: StakeOutInput = from_js(input)?;
    to_js(
        &cogo::stake_out(
            &p.occupied,
            &p.backsight,
            &p.target,
            p.occupied_z,
            p.target_z,
        )
        .map_err(err_to_js)?,
    )
}

#[derive(Serialize, Deserialize)]
struct DistanceDistanceInput {
    p1: cogo::Ne,
    r1: f64,
    p2: cogo::Ne,
    r2: f64,
}

/// Distance-distance intersection from `{ p1, r1, p2, r2 }`. Returns `Ne[]`
/// (0, 1 or 2 solutions).
#[wasm_bindgen]
pub fn cogo_distance_distance(input: JsValue) -> Result<JsValue, JsValue> {
    let p: DistanceDistanceInput = from_js(input)?;
    let result =
        cogo::intersection_distance_distance(&p.p1, p.r1, &p.p2, p.r2).map_err(err_to_js)?;
    let points: Vec<cogo::Ne> = match result {
        cogo::DistanceDistanceIntersection::Two(a, b) => vec![a, b],
        cogo::DistanceDistanceIntersection::One(a) => vec![a],
        cogo::DistanceDistanceIntersection::None => vec![],
    };
    to_js(&points)
}

#[derive(Serialize, Deserialize)]
struct TraverseInput {
    start: cogo::Ne,
    legs: Vec<cogo::TraverseLeg>,
    traverse_type: cogo::TraverseType,
    closing_point: Option<cogo::Ne>,
}

/// Traverse computation from `{ start, legs, traverse_type, closing_point? }`.
/// Returns `TraverseResult`.
#[wasm_bindgen]
pub fn cogo_compute_traverse(input: JsValue) -> Result<JsValue, JsValue> {
    let p: TraverseInput = from_js(input)?;
    to_js(
        &cogo::compute_traverse(&p.start, &p.legs, p.traverse_type, p.closing_point.as_ref())
            .map_err(err_to_js)?,
    )
}

#[derive(Serialize, Deserialize)]
struct AngularTraverseInput {
    start_azimuth: f64,
    observations: Vec<cogo::AngularObservation>,
    mode: cogo::TraverseAngleMode,
    closed: bool,
}

/// Angular traverse reduction from `{ start_azimuth, observations, mode, closed }`.
/// Returns `AngularTraverseResult`.
#[wasm_bindgen]
pub fn cogo_reduce_angular_traverse(input: JsValue) -> Result<JsValue, JsValue> {
    let p: AngularTraverseInput = from_js(input)?;
    to_js(
        &cogo::reduce_angular_traverse(p.start_azimuth, &p.observations, p.mode, p.closed)
            .map_err(err_to_js)?,
    )
}

#[derive(Serialize, Deserialize)]
struct LevellingInput {
    readings: Vec<cogo::LevellingReading>,
    start_rl: f64,
    method: cogo::LevellingMethod,
    known_closing_rl: Option<f64>,
}

/// Levelling reduction from `{ readings, start_rl, method, known_closing_rl? }`.
/// Returns `LevellingResult`.
#[wasm_bindgen]
pub fn cogo_reduce_levelling(input: JsValue) -> Result<JsValue, JsValue> {
    let p: LevellingInput = from_js(input)?;
    to_js(
        &cogo::reduce_levelling(&p.readings, p.start_rl, p.method, p.known_closing_rl)
            .map_err(err_to_js)?,
    )
}

#[derive(Serialize, Deserialize)]
struct ResectionInput {
    a: cogo::Ne,
    b: cogo::Ne,
    c: cogo::Ne,
    alpha: f64,
    beta: f64,
    gamma: f64,
}

/// Tienstra three-point resection from `{ a, b, c, alpha, beta, gamma }`.
/// Returns `Ne | null`.
#[wasm_bindgen]
pub fn cogo_resection_tienstra(input: JsValue) -> Result<JsValue, JsValue> {
    let p: ResectionInput = from_js(input)?;
    to_js(&cogo::resection_tienstra(&p.a, &p.b, &p.c, p.alpha, p.beta, p.gamma).ok())
}

#[derive(Serialize, Deserialize)]
struct HeightScaleInput {
    height_meters: f64,
    earth_radius: f64,
}

/// Height scale factor from `{ height_meters, earth_radius }`.
#[wasm_bindgen]
pub fn cogo_height_scale_factor(input: JsValue) -> Result<JsValue, JsValue> {
    let p: HeightScaleInput = from_js(input)?;
    to_js(&cogo::height_scale_factor(p.height_meters, p.earth_radius).map_err(err_to_js)?)
}

#[derive(Serialize, Deserialize)]
struct CombinedScaleInput {
    point_scale_factor: f64,
    height_meters: f64,
    earth_radius: f64,
}

/// Combined scale factor from `{ point_scale_factor, height_meters, earth_radius }`.
#[wasm_bindgen]
pub fn cogo_combined_scale_factor(input: JsValue) -> Result<JsValue, JsValue> {
    let p: CombinedScaleInput = from_js(input)?;
    to_js(
        &cogo::combined_scale_factor(p.point_scale_factor, p.height_meters, p.earth_radius)
            .map_err(err_to_js)?,
    )
}

#[derive(Serialize, Deserialize)]
struct ScaleConvertInput {
    distance: f64,
    combined_sf: f64,
}

/// `{ distance, combined_sf }` → grid distance.
#[wasm_bindgen]
pub fn cogo_ground_to_grid(input: JsValue) -> Result<JsValue, JsValue> {
    let p: ScaleConvertInput = from_js(input)?;
    to_js(&cogo::ground_to_grid(p.distance, p.combined_sf).map_err(err_to_js)?)
}

/// `{ distance, combined_sf }` → ground distance.
#[wasm_bindgen]
pub fn cogo_grid_to_ground(input: JsValue) -> Result<JsValue, JsValue> {
    let p: ScaleConvertInput = from_js(input)?;
    to_js(&cogo::grid_to_ground(p.distance, p.combined_sf).map_err(err_to_js)?)
}

#[derive(Serialize, Deserialize)]
struct GridVolumeInput {
    grid: Vec<Vec<f64>>,
    cell_size_x: f64,
    cell_size_y: f64,
    base_level: f64,
}

/// Grid-method volume from `{ grid, cell_size_x, cell_size_y, base_level }`.
/// Returns `GridVolumeResult`.
#[wasm_bindgen]
pub fn volume_grid(input: JsValue) -> Result<JsValue, JsValue> {
    let p: GridVolumeInput = from_js(input)?;
    to_js(
        &cogo::volume_grid(&p.grid, p.cell_size_x, p.cell_size_y, p.base_level)
            .map_err(err_to_js)?,
    )
}

/// Cross-section volumes from `CrossSection[]`.
#[wasm_bindgen]
pub fn volume_end_area(sections: JsValue) -> Result<JsValue, JsValue> {
    let parsed: Vec<cogo::CrossSection> = from_js(sections)?;
    to_js(&cogo::volume_end_area(&parsed))
}

/// Prismoidal volume from `CrossSection[]`. Returns `number | null`.
#[wasm_bindgen]
pub fn volume_prismoidal(sections: JsValue) -> Result<JsValue, JsValue> {
    let parsed: Vec<cogo::CrossSection> = from_js(sections)?;
    to_js(&cogo::volume_prismoidal(&parsed))
}

// ── Contours from regular grids ───────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
struct GridContourInput {
    values: Vec<f64>,
    width: usize,
    height: usize,
    origin_e: f64,
    origin_n: f64,
    cell_size: f64,
    levels: Vec<f64>,
}

/// Generate contours from a regular raster grid.
/// Input: `{ values, width, height, origin_e, origin_n, cell_size, levels }`.
/// Returns `ContourLine[]`.
#[wasm_bindgen]
pub fn generate_contours_from_grid(input: JsValue) -> Result<JsValue, JsValue> {
    let p: GridContourInput = from_js(input)?;
    let result = contour::generate_contours_from_grid(
        &p.values,
        p.width,
        p.height,
        p.origin_e,
        p.origin_n,
        p.cell_size,
        &p.levels,
    )
    .map_err(err_to_js)?;
    to_js(&result)
}

// ── Coordinate transformations ─────────────────────────────────────────────

use survey_core::cogo::Ne;
use survey_core::transform;

#[derive(Serialize, Deserialize)]
struct HelmertInput {
    transform: transform::HelmertTransform,
    point: Ne,
}

/// Apply a `HelmertTransform` from `{ transform, point }`.
#[wasm_bindgen]
pub fn transform_helmert_apply(input: JsValue) -> Result<JsValue, JsValue> {
    let p: HelmertInput = from_js(input)?;
    to_js(&p.transform.apply(&p.point))
}

/// Inverse of a `HelmertTransform` from `{ transform }`.
#[wasm_bindgen]
pub fn transform_helmert_inverse(input: JsValue) -> Result<JsValue, JsValue> {
    let p: transform::HelmertTransform = from_js(input)?;
    to_js(&p.inverse())
}

#[derive(Serialize, Deserialize)]
struct PointPairsInput {
    source: Vec<Ne>,
    target: Vec<Ne>,
}

/// Fit a Helmert transform from `{ source: Ne[], target: Ne[] }`.
/// Returns `HelmertTransform`.
#[wasm_bindgen]
pub fn transform_helmert_fit(input: JsValue) -> Result<JsValue, JsValue> {
    let p: PointPairsInput = from_js(input)?;
    to_js(&transform::helmert_fit(&p.source, &p.target).map_err(err_to_js)?)
}

#[derive(Serialize, Deserialize)]
struct AffineApplyInput {
    transform: transform::AffineTransform,
    point: Ne,
}

/// Apply an `AffineTransform` from `{ transform, point }`.
#[wasm_bindgen]
pub fn transform_affine_apply(input: JsValue) -> Result<JsValue, JsValue> {
    let p: AffineApplyInput = from_js(input)?;
    to_js(&p.transform.apply(&p.point))
}

/// Fit an affine transform from `{ source: Ne[], target: Ne[] }`.
/// Returns `AffineTransform`.
#[wasm_bindgen]
pub fn transform_affine_fit(input: JsValue) -> Result<JsValue, JsValue> {
    let p: PointPairsInput = from_js(input)?;
    to_js(&transform::affine_fit(&p.source, &p.target).map_err(err_to_js)?)
}

#[derive(Serialize, Deserialize)]
struct TransformDiagnosticsInput {
    transform: transform::HelmertTransform,
    source: Vec<Ne>,
    target: Vec<Ne>,
}

/// Diagnostics for a Helmert transform from `{ transform, source, target }`.
#[wasm_bindgen]
pub fn transform_helmert_diagnostics(input: JsValue) -> Result<JsValue, JsValue> {
    let p: TransformDiagnosticsInput = from_js(input)?;
    to_js(&transform::helmert_diagnostics(&p.transform, &p.source, &p.target).map_err(err_to_js)?)
}

#[derive(Serialize, Deserialize)]
struct AffineDiagnosticsInput {
    transform: transform::AffineTransform,
    source: Vec<Ne>,
    target: Vec<Ne>,
}

/// Diagnostics for an affine transform from `{ transform, source, target }`.
#[wasm_bindgen]
pub fn transform_affine_diagnostics(input: JsValue) -> Result<JsValue, JsValue> {
    let p: AffineDiagnosticsInput = from_js(input)?;
    to_js(
        &p.transform
            .diagnostics(&p.source, &p.target)
            .map_err(err_to_js)?,
    )
}

#[derive(Serialize, Deserialize)]
struct DetectOutliersInput {
    source: Vec<Ne>,
    target: Vec<Ne>,
    threshold_multiplier: f64,
}

/// Detect outliers in matching point pairs from `{ source, target, threshold_multiplier }`.
/// Returns `number[]` of indices.
#[wasm_bindgen]
pub fn transform_detect_outliers(input: JsValue) -> Result<JsValue, JsValue> {
    let p: DetectOutliersInput = from_js(input)?;
    to_js(
        &transform::detect_outliers(&p.source, &p.target, p.threshold_multiplier)
            .map_err(err_to_js)?,
    )
}

// ── Geometric intersections (extended COGO) ─────────────────────────────────

#[derive(Serialize, Deserialize)]
struct LineLineInput {
    p1: Ne,
    q1: Ne,
    p2: Ne,
    q2: Ne,
}

/// True line-line intersection from `{ p1, q1, p2, q2 }`. Returns `Ne`.
#[wasm_bindgen]
pub fn cogo_line_line(input: JsValue) -> Result<JsValue, JsValue> {
    let p: LineLineInput = from_js(input)?;
    to_js(&intersections::line_line(&p.p1, &p.q1, &p.p2, &p.q2).map_err(err_to_js)?)
}

#[derive(Serialize, Deserialize)]
struct LineArcInput {
    a: Ne,
    b: Ne,
    centre: Ne,
    radius: f64,
}

/// Line-arc intersection from `{ a, b, centre, radius }`. Returns `Ne[]`.
#[wasm_bindgen]
pub fn cogo_line_arc(input: JsValue) -> Result<JsValue, JsValue> {
    let p: LineArcInput = from_js(input)?;
    to_js(&intersections::line_arc(&p.a, &p.b, &p.centre, p.radius).map_err(err_to_js)?)
}

#[derive(Serialize, Deserialize)]
struct ArcArcInput {
    c1: Ne,
    r1: f64,
    c2: Ne,
    r2: f64,
}

/// Arc-arc intersection from `{ c1, r1, c2, r2 }`. Returns `Ne[]`.
#[wasm_bindgen]
pub fn cogo_arc_arc(input: JsValue) -> Result<JsValue, JsValue> {
    let p: ArcArcInput = from_js(input)?;
    to_js(&intersections::arc_arc(&p.c1, p.r1, &p.c2, p.r2).map_err(err_to_js)?)
}

// ── Circle fitting ──────────────────────────────────────────────────────────

/// Best-fit circle from `Ne[]`. Returns `{ centre, radius, rmse }`.
#[wasm_bindgen]
pub fn fit_circle(points: JsValue) -> Result<JsValue, JsValue> {
    let parsed: Vec<Ne> = from_js(points)?;
    to_js(&circle_fit::fit_circle(&parsed).map_err(err_to_js)?)
}

// ── Free-station resection ──────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
struct FreeStationInput {
    observations: Vec<resection::Observation>,
    initial_guess: Option<Ne>,
}

/// Free-station resection from `{ observations, initial_guess? }`.
/// Returns `{ position, iterations, sum_squared_residuals, rmse }`.
#[wasm_bindgen]
pub fn free_station(input: JsValue) -> Result<JsValue, JsValue> {
    let p: FreeStationInput = from_js(input)?;
    let guess = p.initial_guess.as_ref();
    to_js(&resection::free_station(&p.observations, guess).map_err(err_to_js)?)
}

// ── Profiles & cross-sections ────────────────────────────────────────────────

use survey_core::profile;

#[derive(Serialize, Deserialize)]
struct ProfileInput {
    tin: Tin,
    polyline: Vec<Vertex>,
    spacing: Option<f64>,
}

/// Extract a profile from `{ tin, polyline, spacing? }`. Returns `ProfilePoint[]`.
#[wasm_bindgen]
pub fn extract_profile(input: JsValue) -> Result<JsValue, JsValue> {
    let p: ProfileInput = from_js(input)?;
    to_js(&profile::extract_profile(&p.tin, &p.polyline, p.spacing).map_err(err_to_js)?)
}

#[derive(Serialize, Deserialize)]
struct CrossSectionInput {
    tin: Tin,
    polyline: Vec<Vertex>,
    chainage: f64,
    width: f64,
    spacing: f64,
}

/// Extract a cross-section from `{ tin, polyline, chainage, width, spacing }`.
/// Returns `CrossSectionPoint[]`.
#[wasm_bindgen]
pub fn extract_cross_section(input: JsValue) -> Result<JsValue, JsValue> {
    let p: CrossSectionInput = from_js(input)?;
    to_js(
        &profile::extract_cross_section(&p.tin, &p.polyline, p.chainage, p.width, p.spacing)
            .map_err(err_to_js)?,
    )
}

// ── CSV import/export ────────────────────────────────────────────────────────

/// Parse a survey-point CSV string. Returns `{ points, skipped, errors }`.
#[wasm_bindgen]
pub fn parse_points_csv(text: &str) -> Result<JsValue, JsValue> {
    to_js(&csv_io::parse_points_csv(text))
}

/// Export survey points to CSV. Input: `GeoPoint[]`.
#[wasm_bindgen]
pub fn points_to_csv(points: JsValue) -> Result<String, JsValue> {
    let parsed: Vec<geojson_io::GeoPoint> = from_js(points)?;
    Ok(csv_io::points_to_csv(&parsed))
}

// ── WKT import/export ───────────────────────────────────────────────────────

/// Parse a WKT string into `{ points, linework }`.
#[wasm_bindgen]
pub fn model_from_wkt(text: &str) -> Result<JsValue, JsValue> {
    to_js(&wkt_io::model_from_wkt(text).map_err(err_to_js)?)
}

/// Export `{ points, linework }` to a WKT `GEOMETRYCOLLECTION Z` string.
#[wasm_bindgen]
pub fn model_to_wkt(model: JsValue) -> Result<String, JsValue> {
    let parsed: GeoModel = from_js(model)?;
    Ok(wkt_io::model_to_wkt(&parsed))
}

// ── DXF export ──────────────────────────────────────────────────────────────

/// Export a CAD model to a DXF R2000 ASCII string.
#[wasm_bindgen]
pub fn model_to_dxf(model: JsValue) -> Result<String, JsValue> {
    let parsed: DxfModel = from_js(model)?;
    Ok(dxf_io::model_to_dxf(&parsed))
}
