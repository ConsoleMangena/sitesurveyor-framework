//! survey-core — pure-Rust survey geometry engine for SiteSurveyor.
//!
//! Conventions match the existing TypeScript COGO layer (`survey/cogo.ts`):
//! - Coordinates are Northing (N) / Easting (E) / Elevation (Z).
//! - All functions are pure and side-effect free so they can be unit tested
//!   and compiled cleanly to WebAssembly.
//!
//! Numerical note: real survey coordinates are large (e.g. UTM easting
//! ~300,000+). Triangulation runs on *locally shifted* coordinates (the
//! centroid is subtracted before insertion and added back on output) to
//! preserve `f64` precision. Callers do not need to shift manually.

pub mod alignment;
pub mod circle_fit;
pub mod cogo;
pub mod constrained_tin;
pub mod contour;
pub mod csv_io;
pub mod dxf_io;
pub mod geojson_io;
pub mod geom;
pub mod intersections;
pub mod profile;
pub mod resection;
pub mod terrain;
pub mod tin;
pub mod transform;
pub mod volume;
pub mod wkt_io;

use serde::{Deserialize, Serialize};
use std::fmt;

/// Errors returned by survey-core operations.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum SurveyError {
    /// Not enough valid points to perform the operation.
    InsufficientPoints { got: usize, need: usize },
    /// All supplied points are collinear, coincident, or otherwise degenerate.
    DegenerateGeometry { reason: String },
    /// Invalid parameter value.
    InvalidParameter { name: String, value: String },
    /// Footprints of two surfaces do not overlap sufficiently.
    FootprintMismatch { reason: String },
    /// A requested point falls outside the valid domain (e.g., TIN footprint).
    OutOfBounds { reason: String },
    /// Failed to parse external data (GeoJSON, etc.).
    ParseError { message: String },
    /// General computation failure with an explanatory message.
    ComputationFailed { message: String },
}

impl fmt::Display for SurveyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SurveyError::InsufficientPoints { got, need } => {
                write!(f, "insufficient points: got {got}, need at least {need}")
            }
            SurveyError::DegenerateGeometry { reason } => {
                write!(f, "degenerate geometry: {reason}")
            }
            SurveyError::InvalidParameter { name, value } => {
                write!(f, "invalid parameter '{name}': {value}")
            }
            SurveyError::FootprintMismatch { reason } => write!(f, "footprint mismatch: {reason}"),
            SurveyError::OutOfBounds { reason } => write!(f, "out of bounds: {reason}"),
            SurveyError::ParseError { message } => write!(f, "parse error: {message}"),
            SurveyError::ComputationFailed { message } => {
                write!(f, "computation failed: {message}")
            }
        }
    }
}

impl std::error::Error for SurveyError {}

/// Short alias for survey-core results.
pub type Result<T> = std::result::Result<T, SurveyError>;

/// A 3D survey point in Northing/Easting/Elevation.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Point3 {
    pub n: f64,
    pub e: f64,
    pub z: f64,
}

impl Point3 {
    pub fn new(n: f64, e: f64, z: f64) -> Self {
        Self { n, e, z }
    }
}

/// A planar (N, E) vertex without elevation.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Vertex {
    pub n: f64,
    pub e: f64,
}

impl Vertex {
    pub fn new(n: f64, e: f64) -> Self {
        Self { n, e }
    }
}

/// A single triangle of a TIN, referencing indices into the input point list.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Triangle {
    pub a: usize,
    pub b: usize,
    pub c: usize,
}

/// A triangulated irregular network (digital terrain model).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Tin {
    /// The 3D points, in the original (unshifted) coordinate space.
    pub points: Vec<Point3>,
    /// Triangles as index triples into `points`.
    pub triangles: Vec<Triangle>,
}

/// A single contour polyline at a fixed elevation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ContourLine {
    pub elevation: f64,
    pub vertices: Vec<Vertex>,
}

/// Result of a cut/fill volume computation.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct VolumeResult {
    /// Volume above the reference (material to remove), in cubic units.
    pub cut: f64,
    /// Volume below the reference (material to add), in cubic units.
    pub fill: f64,
    /// Net = cut - fill.
    pub net: f64,
    /// Plan area of the triangulated region, in square units.
    pub plan_area: f64,
}
