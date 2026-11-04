import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  BASEMAP_ATTRIBUTION,
  BASEMAP_BASE_URL,
  BASEMAP_LABELS_URL,
  BASEMAP_MAX_NATIVE_ZOOM,
} from "../map/basemap.ts";
import {
  isOnTheRoad,
  type TransportCheckpoint,
  type TransportCorridor,
  type TransportRun,
  type TransportStop,
} from "../../lib/repositories/transportNetwork.ts";

/**
 * The corridor network drawn as a survey plot. Each published route is a hairline
 * polyline through its stations; a run that has left the depot is drawn solid
 * from the origin up to the last checkpoint a person reported, and stops there.
 * Nothing is inferred between stations: the solid line means "it passed through
 * here", and the dashed line beyond it means "not yet".
 */

const ZWANGE: L.LatLngTuple = [-17.83, 31.04];
const DEFAULT_ZOOM = 6;

export interface TransportMapHandle {
  /** Frame one corridor, or the whole network when no route is given. */
  fit: (routeId?: string) => void;
}

type TransportMapProps = {
  corridors: TransportCorridor[];
  runs: TransportRun[];
  stops: TransportStop[];
  checkpoints: TransportCheckpoint[];
  /** Route the customer is shipping to; its corridor is drawn in ink. */
  destinationCityId: string | null;
  onSelectRun: (run: TransportRun) => void;
  className?: string;
};

/** A live run plus the checkpoint it was last reported at. */
type LiveRun = {
  run: TransportRun;
  checkpoint: TransportCheckpoint | null;
  stops: TransportStop[];
};

function token(el: HTMLElement, name: string, fallback: string): string {
  const value = getComputedStyle(el).getPropertyValue(name).trim();
  return value || fallback;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function stopSequence(a: TransportStop, b: TransportStop): number {
  return a.sequence - b.sequence;
}

/**
 * Stations that are actually on this corridor's ground, ordered along it. A
 * checkpoint whose city is not in the list yields nothing rather than a guess,
 * so an unexpected report cannot invent geometry.
 */
function stationsFor(
  routeId: string,
  stops: TransportStop[],
): TransportStop[] {
  return stops.filter((stop) => stop.route_id === routeId).sort(stopSequence);
}

function reportedStop(
  chain: TransportStop[],
  checkpoint: TransportCheckpoint | null,
): number {
  if (!checkpoint) return -1;
  return chain.findIndex((stop) => stop.city === checkpoint.city);
}

/** The vertices the vehicle has physically passed, origin through report. */
function traversedChain(
  chain: TransportStop[],
  reportIndex: number,
): L.LatLngTuple[] {
  if (reportIndex < 1) return [];
  return chain.slice(0, reportIndex + 1).map((stop) => [stop.latitude, stop.longitude]);
}

function liveRuns(
  runs: TransportRun[],
  stops: TransportStop[],
  checkpoints: TransportCheckpoint[],
): LiveRun[] {
  return runs
    .filter((run) => isOnTheRoad(run.status))
    .map((run) => {
      const chain = stationsFor(run.route_id, stops);
      const reported = checkpoints.filter((cp) => cp.departure_id === run.departure_id);
      const last = reported.length > 0 ? reported[reported.length - 1] : null;
      return { run, checkpoint: last, stops: chain };
    })
    .filter((live) => live.stops.length > 1);
}

const TransportMap = forwardRef<TransportMapHandle, TransportMapProps>(
  function TransportMap(
    { corridors, runs, stops, checkpoints, destinationCityId, onSelectRun, className },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const layerRef = useRef<L.LayerGroup | null>(null);
    const inputsRef = useRef({ corridors, runs, stops, checkpoints, destinationCityId });
    inputsRef.current = { corridors, runs, stops, checkpoints, destinationCityId };
    const onSelectRef = useRef(onSelectRun);
    onSelectRef.current = onSelectRun;

    const draw = useCallback(() => {
      const map = mapRef.current;
      const layer = layerRef.current;
      const container = containerRef.current;
      if (!map || !layer || !container) return;
      layer.clearLayers();

      const current = inputsRef.current;
      const ink = token(container, "--foreground", "#1a1d21");
      const brand = token(container, "--primary", "#d1273e");
      const hub = token(container, "--card", "#ffffff");
      const muted = token(container, "--muted-foreground", "#6b7280");

      const live = liveRuns(current.runs, current.stops, current.checkpoints);

      for (const corridor of current.corridors) {
        const chain = stationsFor(corridor.route_id, current.stops);
        if (chain.length < 2) continue;

        const isSample = corridor.is_sample;
        const isTarget =
          current.destinationCityId !== null &&
          corridor.destination_city_id === current.destinationCityId;
        const weight = isTarget ? 2.4 : 1.2;
        const opacity = isSample ? 0.34 : isTarget ? 0.95 : 0.55;
        // Red on this plot means one thing only: a vehicle has reported out of
        // its origin. The town the visitor asked about is drawn heavier in ink.
        const color = corridor.live_runs > 0 ? brand : ink;

        const latlngs = chain.map(
          (stop) => [stop.latitude, stop.longitude] as L.LatLngTuple,
        );

        // The corridor itself: a quiet ruled line, dashed so nobody reads it
        // as a road the vehicle has travelled.
        L.polyline(latlngs, {
          color,
          weight,
          opacity,
          dashArray: isTarget ? "7 5" : "3 6",
          interactive: false,
        }).addTo(layer);

        // Stations sit on the line. A hub is a closed square; a plain station
        // is an open ring, so the collection points read without a label.
        for (const stop of chain) {
          const marker = L.circleMarker([stop.latitude, stop.longitude], {
            radius: stop.has_hub ? 4.6 : 3.2,
            weight: 1.5,
            color: stop.has_hub ? ink : muted,
            fillColor: stop.has_hub ? hub : "transparent",
            fillOpacity: stop.has_hub ? 1 : 0,
            opacity: isSample ? 0.5 : 0.95,
          });
          marker.bindTooltip(
            `<div class="tp-map-tip"><b>${escapeHtml(stop.city)}</b>${
              stop.has_hub ? '<span class="tp-map-tip__hub">hub</span>' : ""
            }<em>${stop.stop_offset_km ?? 0} km along ${escapeHtml(corridor.code)}</em></div>`,
            { direction: "top", offset: [0, -6], opacity: 0.97, className: "tp-map-tipbox" },
          );
          marker.addTo(layer);
        }
      }

      // Live runs on top: the part of the corridor the vehicle has actually
      // covered, then the vehicle pinned at its last report.
      for (const item of live) {
        const reportIndex = reportedStop(item.stops, item.checkpoint);
        const travelled = traversedChain(item.stops, reportIndex);

        if (travelled.length > 1) {
          L.polyline(travelled, {
            color: brand,
            weight: 3,
            opacity: 0.9,
            interactive: false,
          }).addTo(layer);
        }

        const at =
          item.checkpoint !== null && reportIndex >= 0
            ? ([item.stops[reportIndex].latitude, item.stops[reportIndex].longitude] as L.LatLngTuple)
            : null;
        if (!at) continue;

        const plate = escapeHtml(item.run.route_code);
        const marker = L.marker(at, {
          icon: L.divIcon({
            className: "tp-map-vehicle",
            html: `<span class="tp-map-vehicle__plate${
              item.run.status === "at_destination" ? " is-arrived" : ""
            }">${plate}</span>`,
            iconSize: [58, 20],
            iconAnchor: [29, 10],
          }),
          keyboard: true,
          title: `${item.run.route_code} — last reported at ${
            item.checkpoint?.city ?? "unknown"
          }`,
          alt: `${item.run.route_code} to ${item.run.destination_city}, last reported at ${
            item.checkpoint?.city ?? "an unknown station"
          }. Press Enter to open it.`,
        });
        marker.on("click", () => onSelectRef.current(item.run));
        marker.addTo(layer);
      }
    }, []);

    useEffect(() => {
      const container = containerRef.current;
      if (!container || mapRef.current) return;

      const map = L.map(container, {
        center: ZWANGE,
        zoom: DEFAULT_ZOOM,
        minZoom: 5,
        maxZoom: 13,
        zoomControl: false,
        attributionControl: true,
      });

      L.tileLayer(BASEMAP_BASE_URL, {
        attribution: BASEMAP_ATTRIBUTION,
        maxNativeZoom: BASEMAP_MAX_NATIVE_ZOOM,
        maxZoom: 19,
      }).addTo(map);

      L.tileLayer(BASEMAP_LABELS_URL, {
        maxNativeZoom: BASEMAP_MAX_NATIVE_ZOOM,
        maxZoom: 19,
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;

      draw();

      const timer = setTimeout(() => map.invalidateSize(), 120);
      const resize = new ResizeObserver(() => map.invalidateSize());
      resize.observe(container);

      // Tokens resolve to concrete colours at draw time, so a theme flip has
      // to re-draw or the plot keeps the previous theme's ink.
      const theme = new MutationObserver(draw);
      theme.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "data-theme"],
      });

      return () => {
        clearTimeout(timer);
        resize.disconnect();
        theme.disconnect();
        map.remove();
        mapRef.current = null;
        layerRef.current = null;
      };
    }, [draw]);

    useEffect(() => {
      draw();
    }, [draw, corridors, runs, stops, checkpoints, destinationCityId]);

    useImperativeHandle(
      ref,
      () => ({
        fit(routeId?: string) {
          const map = mapRef.current;
          if (!map) return;
          const chain = routeId
            ? stationsFor(routeId, inputsRef.current.stops)
            : [];
          if (chain.length > 1) {
            map.fitBounds(
              L.latLngBounds(chain.map((s) => [s.latitude, s.longitude] as L.LatLngTuple)),
              { padding: [44, 44], maxZoom: 9, animate: true },
            );
            return;
          }
          const all = inputsRef.current.stops;
          if (all.length === 0) {
            map.setView(ZWANGE, DEFAULT_ZOOM, { animate: false });
            return;
          }
          map.fitBounds(
            L.latLngBounds(all.map((s) => [s.latitude, s.longitude] as L.LatLngTuple)),
            { padding: [44, 44], maxZoom: 8, animate: true },
          );
        },
      }),
      [],
    );

    return (
      <div className={`tp-map${className ? ` ${className}` : ""}`}>
        <p className="sr-only">
          Map of published transport corridors. Each line is a route between
          stations, dashed until a vehicle is reported along it. Solid red runs
          from the origin to the last checkpoint a person reported; the plate on
          a station is the vehicle parked there.
        </p>
        <div ref={containerRef} className="tp-map__canvas" />
      </div>
    );
  },
);

export default TransportMap;
