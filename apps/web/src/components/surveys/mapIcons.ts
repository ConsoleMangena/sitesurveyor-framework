import L from "leaflet";

/**
 * The two drawn markers, as Leaflet divIcons.
 *
 * Both are built from constants the platform owns — a category colour and a single
 * letter — never from a client name or an address, so nothing a workspace typed can end
 * up inside an HTML string.
 */

const TARGET_SVG = (color: string) => `
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
    <circle cx="15" cy="15" r="13" fill="${color}" fill-opacity="0.16"></circle>
    <circle cx="15" cy="15" r="8.4" fill="none" stroke="${color}" stroke-width="2.3"></circle>
    <circle cx="15" cy="15" r="2.7" fill="${color}" stroke="#fff" stroke-width="1.1"></circle>
    <path d="M15 0.5v5M15 24.5v5M0.5 15h5M24.5 15h5" stroke="${color}" stroke-width="1.6"></path>
  </svg>`;

export function targetIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "sw-pin",
    html: TARGET_SVG(color),
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14],
  });
}

/** Colour carries the category, the letter carries which of them, and the white rim is
 *  what keeps both legible on satellite imagery. */
export function candidateIcon(color: string, letter: string): L.DivIcon {
  return L.divIcon({
    className: "sw-cand-wrap",
    html: `<span style="background:${color}">${letter}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -12],
  });
}
