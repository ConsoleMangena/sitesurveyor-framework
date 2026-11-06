/**
 * SiteSurveyor — Classified Vector Engine Utilities
 * ==================================================
 * Lossless vector extraction, geodesic polygon buffer generation,
 * distance/bearing telemetry, and RFC 7946 GeoJSON export for
 * multi-spectral satellite classified Earth Observation results.
 */
import type { MapCandidate } from "./workbench.ts";
import { CATEGORY_LABELS, type DossierCategory } from "./labels.ts";

export interface GeoJsonPointGeometry {
  type: "Point";
  coordinates: [number, number]; // [lon, lat]
}

export interface GeoJsonPolygonGeometry {
  type: "Polygon";
  coordinates: [number, number][][]; // [[[lon, lat], ...]]
}

export interface GeoJsonLineStringGeometry {
  type: "LineString";
  coordinates: [number, number][]; // [[lon, lat], ...]
}

export type GeoJsonGeometry =
  | GeoJsonPointGeometry
  | GeoJsonPolygonGeometry
  | GeoJsonLineStringGeometry;

export interface GeoJsonFeature {
  type: "Feature";
  id?: string | number;
  geometry: GeoJsonGeometry;
  properties: Record<string, unknown>;
}

export interface ClassifiedVectorFeatureCollection {
  type: "FeatureCollection";
  crs: {
    type: "name";
    properties: { name: string };
  };
  metadata: {
    title: string;
    generatedAt: string;
    category: DossierCategory;
    categoryName: string;
    clientName: string;
    targetLatitude: number;
    targetLongitude: number;
    totalClassifiedTargets: number;
  };
  features: GeoJsonFeature[];
}

/** Earth radius in meters */
const R_EARTH = 6371000;

/** Great circle distance in meters between two lat/lon coordinates */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R_EARTH * c;
}

/** Initial forward azimuth / bearing in degrees (0 - 360) from point 1 to point 2 */
export function initialBearingDegrees(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dLambda = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

/** 16-point compass heading abbreviation from bearing degrees */
export function compassDirection(degrees: number): string {
  const cardinals = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  const index = Math.round(degrees / 22.5) % 16;
  return cardinals[index];
}

/**
 * Generate a closed geodesic circular polygon ring [lon, lat] around a coordinate.
 * Used for vector potential zones, catchment buffers, and exploration envelopes.
 */
export function generateGeodesicCircle(
  centerLat: number,
  centerLon: number,
  radiusMeters: number,
  steps = 36,
): [number, number][] {
  const d = radiusMeters / R_EARTH;
  const phi1 = (centerLat * Math.PI) / 180;
  const lambda1 = (centerLon * Math.PI) / 180;
  const ring: [number, number][] = [];

  for (let i = 0; i <= steps; i++) {
    const bearing = (i * 2 * Math.PI) / steps;
    const phi2 = Math.asin(
      Math.sin(phi1) * Math.cos(d) +
        Math.cos(phi1) * Math.sin(d) * Math.cos(bearing),
    );
    const lambda2 =
      lambda1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(d) * Math.cos(phi1),
        Math.cos(d) - Math.sin(phi1) * Math.sin(phi2),
      );
    ring.push([
      Number(((lambda2 * 180) / Math.PI).toFixed(6)),
      Number(((phi2 * 180) / Math.PI).toFixed(6)),
    ]);
  }
  return ring;
}

/**
 * Build a complete RFC 7946 Classified Vector FeatureCollection for GIS & Vector Viewer.
 */
export function buildClassifiedVectorCollection({
  target,
  halfDeg,
  candidates,
  category,
  clientName,
  crsName = "urn:ogc:def:crs:OGC:1.3:CRS84",
}: {
  target: { latitude: number; longitude: number };
  halfDeg: number;
  candidates: MapCandidate[];
  category: DossierCategory;
  clientName: string;
  crsName?: string;
}): ClassifiedVectorFeatureCollection {
  const features: GeoJsonFeature[] = [];
  const catLabel = CATEGORY_LABELS[category];

  // 1. AOI Bounding Polygon
  const minLat = Number((target.latitude - halfDeg).toFixed(6));
  const maxLat = Number((target.latitude + halfDeg).toFixed(6));
  const minLon = Number((target.longitude - halfDeg).toFixed(6));
  const maxLon = Number((target.longitude + halfDeg).toFixed(6));

  features.push({
    type: "Feature",
    id: "aoi_envelope",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [minLon, minLat],
          [maxLon, minLat],
          [maxLon, maxLat],
          [minLon, maxLat],
          [minLon, minLat],
        ],
      ],
    },
    properties: {
      featureType: "aoi_boundary",
      label: "Area of Interest Envelope",
      halfDeg,
      minLatitude: minLat,
      maxLatitude: maxLat,
      minLongitude: minLon,
      maxLongitude: maxLon,
    },
  });

  // 2. Client Target Property Point
  features.push({
    type: "Feature",
    id: "target_site",
    geometry: {
      type: "Point",
      coordinates: [
        Number(target.longitude.toFixed(6)),
        Number(target.latitude.toFixed(6)),
      ],
    },
    properties: {
      featureType: "target_property",
      label: `Target Property: ${clientName || "Survey Site"}`,
      clientName: clientName || "Survey Site",
      latitude: target.latitude,
      longitude: target.longitude,
    },
  });

  // 3. Candidate Vectors (Points, Buffers, Bearing Lines)
  for (const cand of candidates) {
    const bearing = initialBearingDegrees(
      target.latitude,
      target.longitude,
      cand.latitude,
      cand.longitude,
    );
    const compass = compassDirection(bearing);
    const distanceMeters = Math.round(
      cand.distanceKm !== null
        ? cand.distanceKm * 1000
        : haversineDistanceMeters(
            target.latitude,
            target.longitude,
            cand.latitude,
            cand.longitude,
          ),
    );

    // 3a. Candidate Point Feature
    features.push({
      type: "Feature",
      id: `candidate_${cand.rank}`,
      geometry: {
        type: "Point",
        coordinates: [
          Number(cand.longitude.toFixed(6)),
          Number(cand.latitude.toFixed(6)),
        ],
      },
      properties: {
        featureType: "classified_candidate_site",
        category,
        categoryName: catLabel.name,
        rank: cand.rank,
        title: `${catLabel.name} #${cand.rank}`,
        score: cand.score,
        potentialScore: cand.score,
        distanceMeters,
        distanceKm: Number((distanceMeters / 1000).toFixed(2)),
        bearingDegrees: Math.round(bearing),
        compassHeading: compass,
        readout: cand.readout,
        ...(cand.payload ?? {}),
      },
    });

    // 3b. 50m Core High-Potential Buffer Polygon
    const coreZoneRing = generateGeodesicCircle(
      cand.latitude,
      cand.longitude,
      50,
      36,
    );
    features.push({
      type: "Feature",
      id: `core_zone_${cand.rank}`,
      geometry: {
        type: "Polygon",
        coordinates: [coreZoneRing],
      },
      properties: {
        featureType: "core_potential_zone",
        candidateRank: cand.rank,
        radiusMeters: 50,
        score: cand.score,
        description: `50m core high-potential footprint for Target #${cand.rank}`,
      },
    });

    // 3c. 150m Verification Envelope Polygon
    const envelopeRing = generateGeodesicCircle(
      cand.latitude,
      cand.longitude,
      150,
      36,
    );
    features.push({
      type: "Feature",
      id: `verification_zone_${cand.rank}`,
      geometry: {
        type: "Polygon",
        coordinates: [envelopeRing],
      },
      properties: {
        featureType: "verification_envelope",
        candidateRank: cand.rank,
        radiusMeters: 150,
        score: cand.score,
        description: `150m field investigation perimeter for Target #${cand.rank}`,
      },
    });

    // 3d. Bearing Vector LineString from Target to Candidate
    features.push({
      type: "Feature",
      id: `bearing_vector_${cand.rank}`,
      geometry: {
        type: "LineString",
        coordinates: [
          [
            Number(target.longitude.toFixed(6)),
            Number(target.latitude.toFixed(6)),
          ],
          [
            Number(cand.longitude.toFixed(6)),
            Number(cand.latitude.toFixed(6)),
          ],
        ],
      },
      properties: {
        featureType: "bearing_vector",
        candidateRank: cand.rank,
        distanceMeters,
        distanceKm: Number((distanceMeters / 1000).toFixed(2)),
        bearingDegrees: Math.round(bearing),
        compassHeading: compass,
      },
    });
  }

  return {
    type: "FeatureCollection",
    crs: {
      type: "name",
      properties: { name: crsName },
    },
    metadata: {
      title: `SiteSurveyor AI — ${catLabel.name} Classified Vector Siting`,
      generatedAt: new Date().toISOString(),
      category,
      categoryName: catLabel.name,
      clientName: clientName || "Survey Site",
      targetLatitude: target.latitude,
      targetLongitude: target.longitude,
      totalClassifiedTargets: candidates.length,
    },
    features,
  };
}

/** Trigger client-side download of GeoJSON file */
export function downloadGeoJsonFile(
  filename: string,
  data: ClassifiedVectorFeatureCollection | Record<string, unknown>,
): void {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: "application/geo+json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".geojson") ? filename : `${filename}.geojson`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
