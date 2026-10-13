/**
 * Cartographic point-symbol geometry.
 *
 * Returns SVG child markup for a feature symbol centred at (0,0) in a local
 * coordinate frame scaled by `r` (the nominal symbol radius in the target
 * units — screen pixels in the viewport, millimetres on the plot). Keeping the
 * geometry in one place means the interactive viewport and the printed plan
 * draw identical symbols, the way a survey package shares a symbol library
 * between the CAD view and the plotted sheet.
 */

import type { FeatureSymbol } from "./featureCodes.ts";

/**
 * Build the inner SVG for a symbol. The caller wraps this in a
 * `<g transform="translate(cx cy)" stroke=… fill=…>` so colour and position are
 * applied once. `r` is the symbol's nominal half-size.
 */
export function symbolMarkup(symbol: FeatureSymbol, r: number): string {
  const f = (v: number) => (Math.round(v * 1000) / 1000).toString();
  switch (symbol) {
    case "dot":
      return `<circle cx="0" cy="0" r="${f(r * 0.5)}" />`;

    case "circle":
      return `<circle cx="0" cy="0" r="${f(r)}" fill="none" />`;

    case "square":
      return `<rect x="${f(-r)}" y="${f(-r)}" width="${f(r * 2)}" height="${f(r * 2)}" fill="none" />`;

    case "triangle":
      return `<polygon points="0,${f(-r)} ${f(r * 0.87)},${f(r * 0.5)} ${f(-r * 0.87)},${f(r * 0.5)}" fill="none" />`;

    case "cross":
      return (
        `<line x1="${f(-r)}" y1="0" x2="${f(r)}" y2="0" />` +
        `<line x1="0" y1="${f(-r)}" x2="0" y2="${f(r)}" />`
      );

    case "tree":
      // Canopy circle + short trunk.
      return (
        `<circle cx="0" cy="${f(-r * 0.3)}" r="${f(r * 0.8)}" fill="none" />` +
        `<line x1="0" y1="${f(r * 0.5)}" x2="0" y2="${f(r)}" />`
      );

    case "manhole":
      // Circle with an inner dot.
      return (
        `<circle cx="0" cy="0" r="${f(r)}" fill="none" />` +
        `<circle cx="0" cy="0" r="${f(r * 0.28)}" />`
      );

    case "pole":
      // Circle with a small centre dot (utility pole).
      return (
        `<circle cx="0" cy="0" r="${f(r * 0.85)}" fill="none" />` +
        `<circle cx="0" cy="0" r="${f(r * 0.18)}" />`
      );

    case "light":
      // Pole symbol with radiating strokes (luminaire).
      return (
        `<circle cx="0" cy="0" r="${f(r * 0.5)}" fill="none" />` +
        `<line x1="0" y1="${f(-r)}" x2="0" y2="${f(-r * 0.55)}" />` +
        `<line x1="0" y1="${f(r)}" x2="0" y2="${f(r * 0.55)}" />` +
        `<line x1="${f(-r)}" y1="0" x2="${f(-r * 0.55)}" y2="0" />` +
        `<line x1="${f(r)}" y1="0" x2="${f(r * 0.55)}" y2="0" />`
      );

    case "hydrant":
      // Filled triangle over a base line.
      return (
        `<polygon points="0,${f(-r)} ${f(r * 0.7)},${f(r * 0.4)} ${f(-r * 0.7)},${f(r * 0.4)}" />` +
        `<line x1="${f(-r * 0.7)}" y1="${f(r * 0.7)}" x2="${f(r * 0.7)}" y2="${f(r * 0.7)}" />`
      );

    case "sign":
      // Small square on a post.
      return (
        `<rect x="${f(-r * 0.6)}" y="${f(-r)}" width="${f(r * 1.2)}" height="${f(r * 0.9)}" fill="none" />` +
        `<line x1="0" y1="${f(-r * 0.1)}" x2="0" y2="${f(r)}" />`
      );

    case "bollard":
      return `<rect x="${f(-r * 0.35)}" y="${f(-r)}" width="${f(r * 0.7)}" height="${f(r * 2)}" fill="none" />`;

    default:
      return `<circle cx="0" cy="0" r="${f(r * 0.5)}" />`;
  }
}

/**
 * Symbols the current code table actually uses, for building a plot legend of
 * symbols (as opposed to layers).
 */
export const SYMBOL_LEGEND_LABEL: Record<FeatureSymbol, string> = {
  dot: "Point",
  circle: "Valve / node",
  square: "Structure",
  triangle: "Control / bank",
  cross: "Detail string",
  tree: "Tree",
  manhole: "Manhole",
  pole: "Pole",
  hydrant: "Hydrant",
  sign: "Sign",
  bollard: "Bollard",
  light: "Light pole",
};
