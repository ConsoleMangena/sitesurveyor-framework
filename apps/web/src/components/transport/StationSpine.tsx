import type { TransportCheckpoint, TransportStop } from "../../lib/repositories/transportNetwork.ts";

/**
 * A corridor drawn as its own longitudinal section: stops sit at their real
 * offset along the hairline. When a run is moving, the solid part of the line
 * ends at the last checkpoint a person reported and nowhere further — the
 * vehicle is not drawn between the places it has actually been seen.
 */

type StationSpineProps = {
  stops: TransportStop[];
  directDistanceKm: number | null;
  /** Every checkpoint reported for this run, oldest first. */
  trail: TransportCheckpoint[];
};

function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export function StationSpine({ stops, directDistanceKm, trail }: StationSpineProps) {
  const span = directDistanceKm ?? stops[stops.length - 1]?.stop_offset_km ?? 0;
  if (span <= 0) return null;

  const last = trail.length > 0 ? trail[trail.length - 1] : null;
  const lastIndex = last ? stops.findIndex((stop) => stop.city === last.city) : -1;
  const traversed =
    lastIndex >= 0
      ? Math.min(100, ((stops[lastIndex].stop_offset_km ?? 0) / span) * 100)
      : 0;

  const seen = new Set(trail.map((checkpoint) => checkpoint.city));

  return (
    <div className="tp-spine">
      <div className="tp-spine__rail">
        <span className="tp-spine__remaining" />
        {traversed > 0 && (
          <span
            className="tp-spine__traversed"
            style={{ transform: `scaleX(${traversed / 100})` }}
          />
        )}
        {stops.map((stop) => (
          <span
            key={stop.city_id}
            className={`tp-spine__stop${seen.has(stop.city) ? " is-reported" : ""}${
              stop.has_hub ? " is-hub" : ""
            }${stop.city === last?.city ? " is-current" : ""}`}
            style={{ left: `${Math.min(100, ((stop.stop_offset_km ?? 0) / span) * 100)}%` }}
            title={`${stop.city} · ${stop.stop_offset_km ?? 0} km direct${
              stop.dwell_minutes ? ` · ${stop.dwell_minutes} min dwell` : ""
            }`}
          >
            <span className="tp-spine__stop-name">{stop.city}</span>
          </span>
        ))}
      </div>
      <p className="tp-spine__legend">
        <span>{span.toFixed(0)} km direct</span>
        <span className={`tp-spine__legend--right${last ? " is-reported" : ""}`}>
          {last ? `reported at ${last.city} · ${timeAgo(last.reported_at)}` : `${stops.length} stations`}
        </span>
      </p>
    </div>
  );
}
