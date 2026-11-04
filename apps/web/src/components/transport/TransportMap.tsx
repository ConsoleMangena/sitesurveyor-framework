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
  willRoll,
  type TransportCheckpoint,
  type TransportCorridor,
  type TransportRun,
  type TransportStop,
} from "../../lib/repositories/transportNetwork.ts";

/**
 * The corridor network drawn as a survey plot. Every run the page is holding gets
 * a plate, sitting at the station somebody last reported it at and, while nothing
 * has been reported, at the station it departs from. A run that has left its
 * origin is also drawn solid from origin up to that report, and the line stops
 * there. Nothing is inferred between stations: the solid line means "it passed
 * through here", and the dashed line beyond it means "not yet".
 */

const ZWANGE: L.LatLngTuple = [-17.83, 31.04];
const DEFAULT_ZOOM = 6;

/**
 * The plate box in CSS. Several runs wait at one town, so a stack hangs from the
 * station as a ladder: `DROP` clears the dot, `PITCH` separates the plates, and
 * `LEAD` keeps the column off the hub square it belongs to.
 */
const PLATE_W = 80;
const PLATE_H = 20;
const PLATE_PITCH = 24;
const PLATE_DROP = 4;
const PLATE_LEAD = 9;

/** Room a framed corridor leaves at the bottom-right for a plate ladder that
 *  had to be stepped clear of its neighbour's. */
const PLATE_ROOM_X = PLATE_LEAD + PLATE_W + 20;
const PLATE_ROOM_Y = PLATE_DROP + 4 * PLATE_PITCH + PLATE_H;

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
  /** The run whose plate carries the focus ring, matching the readout below it. */
  focusedRunId: string | null;
  onSelectRun: (run: TransportRun) => void;
  className?: string;
};

/** A run the plot can place, plus where its plate sits and how high it stacks. */
type PlottedRun = {
  run: TransportRun;
  checkpoint: TransportCheckpoint | null;
  chain: TransportStop[];
  /** The station the plate sits on: the last report, else the departure station. */
  at: TransportStop;
  reportIndex: number;
  tier: number;
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

/**
 * Every run, placed. A vehicle with no report has only ever been seen at the
 * station it leaves from, so that is where its plate goes; the plot never puts a
 * vehicle between two stations because a timetable says it should be there.
 */
function plottedRuns(
  runs: TransportRun[],
  stops: TransportStop[],
  checkpoints: TransportCheckpoint[],
): PlottedRun[] {
  const placed: PlottedRun[] = [];
  for (const run of runs) {
    const chain = stationsFor(run.route_id, stops);
    if (chain.length < 2) continue;
    const reported = checkpoints.filter((cp) => cp.departure_id === run.departure_id);
    const last = reported.length > 0 ? reported[reported.length - 1] : null;
    const reportIndex = reportedStop(chain, last);
    placed.push({
      run,
      checkpoint: last,
      chain,
      at: reportIndex >= 0 ? chain[reportIndex] : chain[0],
      reportIndex,
      tier: 0,
    });
  }

  // Several runs wait at the same town. Stacking keeps every plate readable and
  // still honestly attached to the station it sits on, and the ladder reads in
  // roll order so the top plate is the one leaving first.
  const byTown = [...placed].sort(
    (a, b) =>
      a.at.city_id === b.at.city_id
        ? Date.parse(a.run.planned_departure_at) - Date.parse(b.run.planned_departure_at)
        : a.at.city.localeCompare(b.at.city),
  );
  const tiers = new Map<string, number>();
  for (const item of byTown) {
    const next = tiers.get(item.at.city_id) ?? 0;
    item.tier = next;
    tiers.set(item.at.city_id, next + 1);
  }
  return placed;
}

/**
 * The plate's colour keeps the one rule the surface already holds — red means
 * this run will roll — while its position states where it actually is. Green is
 * a vehicle that has finished, ink one still taking load.
 */
function plateTone(run: TransportRun): string {
  if (run.status === "at_destination") return " is-arrived";
  if (willRoll(run.status)) return " is-live";
  return "";
}

function positionWord(item: PlottedRun): string {
  if (item.checkpoint) return `reported at ${item.checkpoint.city}`;
  return `at ${item.at.city}, no report yet`;
}

/**
 * Several departures can share one route code, and on a plot they would then be
 * the same plate wearing the town twice. The roll date is what tells them apart.
 */
function rollDay(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short" });
}

/**
 * A plate is 80px of ink and a phone draws the whole country inside 360 of it,
 * so one town's ladder can land on its neighbour's. Each plate is stepped away
 * from its station in whole pitches — below first, then above — until its box is
 * clear, in roll order so the run leaving soonest keeps the place nearest the
 * dot. A zoom changes every distance on the plot, so this runs again on zoomend.
 */
function plateNudges(
  items: PlottedRun[],
  pointOf: (at: TransportStop) => { x: number; y: number },
): Map<string, number> {
  const taken: { x: number; y: number }[] = [];
  const nudges = new Map<string, number>();
  const ordered = [...items].sort(
    (a, b) =>
      Date.parse(a.run.planned_departure_at) - Date.parse(b.run.planned_departure_at),
  );
  for (const item of ordered) {
    const p = pointOf(item.at);
    const x = p.x + PLATE_LEAD;
    const y = p.y + PLATE_DROP + item.tier * PLATE_PITCH;
    const clear = (dy: number) =>
      !taken.some((b) => Math.abs(b.x - x) < PLATE_W && Math.abs(b.y - (y + dy)) < PLATE_H);
    let dy = 0;
    for (let step = 0; step < 6 && !clear(dy); step++) {
      const below = (step + 1) * PLATE_PITCH;
      const above = -below;
      if (clear(below)) dy = below;
      else if (clear(above)) dy = above;
    }
    taken.push({ x, y: y + dy });
    nudges.set(item.run.departure_id, dy);
  }
  return nudges;
}

const TransportMap = forwardRef<TransportMapHandle, TransportMapProps>(
  function TransportMap(
    {
      corridors,
      runs,
      stops,
      checkpoints,
      destinationCityId,
      focusedRunId,
      onSelectRun,
      className,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const layerRef = useRef<L.LayerGroup | null>(null);
    const inputsRef = useRef({
      corridors,
      runs,
      stops,
      checkpoints,
      destinationCityId,
      focusedRunId,
    });
    inputsRef.current = {
      corridors,
      runs,
      stops,
      checkpoints,
      destinationCityId,
      focusedRunId,
    };
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

      const plotted = plottedRuns(current.runs, current.stops, current.checkpoints);

      for (const corridor of current.corridors) {
        const chain = stationsFor(corridor.route_id, current.stops);
        if (chain.length < 2) continue;

        const isSample = corridor.is_sample;
        const isTarget =
          current.destinationCityId !== null &&
          corridor.destination_city_id === current.destinationCityId;
        const weight = isTarget ? 2.4 : 1.2;
        const opacity = isSample ? 0.45 : isTarget ? 0.95 : 0.55;
        // Red on this plot means one thing only: a vehicle has left the booking
        // window on this corridor. The town the visitor asked about is drawn
        // heavier in ink.
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
            opacity: isSample ? 0.6 : 0.95,
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

      // The part of a corridor a vehicle has physically covered, drawn under the
      // plates and only ever as far as somebody reported it.
      for (const item of plotted) {
        if (!isOnTheRoad(item.run.status)) continue;
        const travelled = traversedChain(item.chain, item.reportIndex);
        if (travelled.length < 2) continue;
        L.polyline(travelled, {
          color: brand,
          weight: 3,
          opacity: 0.9,
          interactive: false,
        }).addTo(layer);
      }

      // Every run gets a plate, so the plot holds the whole manifest rather than
      // only the two vehicles that happen to have moved.
      const nudges = plateNudges(plotted, (stop) =>
        map.latLngToLayerPoint([stop.latitude, stop.longitude]),
      );
      for (const item of plotted) {
        const plate = `${escapeHtml(item.run.route_code)} ${escapeHtml(
          rollDay(item.run.planned_departure_at),
        )}`;
        const focus = item.run.departure_id === current.focusedRunId ? " is-focus" : "";
        const drop = PLATE_DROP + item.tier * PLATE_PITCH + (nudges.get(item.run.departure_id) ?? 0);
        const marker = L.marker([item.at.latitude, item.at.longitude], {
          icon: L.divIcon({
            className: "tp-map-vehicle",
            html: `<span class="tp-map-vehicle__plate${plateTone(item.run)}${
              item.run.is_sample ? " is-specimen" : ""
            }${focus}">${plate}</span>`,
            iconSize: [PLATE_W, PLATE_H],
            iconAnchor: [-PLATE_LEAD, -drop],
          }),
          keyboard: true,
          alt: `${item.run.route_code} to ${item.run.destination_city}, ${positionWord(
            item,
          )}. Press Enter to read the trip.`,
          zIndexOffset: focus ? 1000 : -item.tier * 10,
        });
        marker.bindTooltip(
          `<div class="tp-map-tip"><b>${plate}</b><em>${escapeHtml(item.at.city)} · ${escapeHtml(
            positionWord(item),
          )}</em></div>`,
          {
            direction: "top",
            offset: [PLATE_LEAD + PLATE_W / 2, drop - 2],
            opacity: 0.97,
            className: "tp-map-tipbox",
          },
        );
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
      // Plate collisions are measured in pixels, and a zoom changes every pixel
      // distance on the plot, so the plates are re-laid after each one.
      map.on("zoomend", draw);

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
    }, [draw, corridors, runs, stops, checkpoints, destinationCityId, focusedRunId]);

    useImperativeHandle(
      ref,
      () => ({
        fit(routeId?: string) {
          const map = mapRef.current;
          if (!map) return;
          const chain = routeId
            ? stationsFor(routeId, inputsRef.current.stops)
            : [];
          // Padding wide enough for a plate ladder to hang off the last station
          // without being cut by the edge of the card.
          if (chain.length > 1) {
            map.fitBounds(
              L.latLngBounds(chain.map((s) => [s.latitude, s.longitude] as L.LatLngTuple)),
              {
                paddingTopLeft: [32, 32],
                paddingBottomRight: [PLATE_ROOM_X, PLATE_ROOM_Y],
                maxZoom: 9,
                animate: true,
              },
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
            {
              paddingTopLeft: [32, 32],
              paddingBottomRight: [PLATE_ROOM_X, PLATE_ROOM_Y],
              maxZoom: 8,
              animate: true,
            },
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
          from the origin to the last checkpoint a person reported. Every run
          carries a plate, sitting at the station it was last reported at or,
          while nothing has been reported, at the station it departs from. Press
          a plate to read the trip.
        </p>
        <div ref={containerRef} className="tp-map__canvas" />
      </div>
    );
  },
);

export default TransportMap;
