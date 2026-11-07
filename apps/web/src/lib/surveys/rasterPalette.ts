/**
 * Colour helpers for the classified zone GeoTIFFs.
 *
 * The engine stores class codes 0-6 with 255 as nodata, and writes a TIFF colour map
 * alongside the values. Older files may have no colour map, so the map view can fall
 * back to the category palette and still draw the same classes in the same colours.
 */

/** Class 255 is reserved for pixels with no usable satellite coverage. */
export const RASTER_NODATA_CLASS = 255;

/** Alpha the PNG overlay uses for observed pixels, matched here so both paths look alike. */
export const RASTER_OVERLAY_ALPHA = 215;

export type Rgb = [number, number, number];

/** Parse `#rgb` or `#rrggbb`; `null` when the string is not a colour. */
export function hexToRgb(hex: string): Rgb | null {
  let clean = hex.trim().replace(/^#/, "");
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((part) => part + part)
      .join("");
  }
  if (clean.length !== 6 || !/^[0-9a-f]{6}$/i.test(clean)) return null;
  const value = Number.parseInt(clean, 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/**
 * Build a 256-entry RGBA lookup table from a class palette.
 *
 * Entries past the end of the palette stay fully transparent, so a stray class code
 * cannot acquire a colour the palette never defined.
 */
export function paletteToRgba(
  palette: readonly string[],
  alpha: number = RASTER_OVERLAY_ALPHA,
): Uint8Array {
  const lut = new Uint8Array(256 * 4);
  palette.forEach((hex, code) => {
    if (code > 255) return;
    const rgb = hexToRgb(hex);
    if (!rgb) return;
    const offset = code * 4;
    lut[offset] = rgb[0];
    lut[offset + 1] = rgb[1];
    lut[offset + 2] = rgb[2];
    lut[offset + 3] = alpha;
  });
  return lut;
}

/**
 * Convert a TIFF `ColorMap` tag into an RGBA lookup table.
 *
 * The tag is three consecutive 16-bit planes (red, green, blue), not interleaved RGB
 * triples. Values are scaled from 0-65535 to 0-255, which handles both GDAL's
 * `value * 257` encoding and the `value * 256` encoding other writers use.
 */
export function colorMapToRgba(
  colorMap: ArrayLike<number>,
  alpha: number = RASTER_OVERLAY_ALPHA,
): Uint8Array | null {
  const planes = colorMap.length / 3;
  if (!Number.isInteger(planes) || planes <= 0 || planes > 256) return null;

  const lut = new Uint8Array(256 * 4);
  for (let code = 0; code < planes; code += 1) {
    const offset = code * 4;
    lut[offset] = toByte(colorMap[code]);
    lut[offset + 1] = toByte(colorMap[code + planes]);
    lut[offset + 2] = toByte(colorMap[code + planes * 2]);
    lut[offset + 3] = alpha;
  }
  return lut;
}

/** Make one class code transparent in a lookup table. */
export function makeTransparent(lut: Uint8Array, code: number): void {
  if (!Number.isInteger(code) || code < 0 || code > 255) return;
  lut[code * 4 + 3] = 0;
}

/**
 * Expand single-band class codes into RGBA pixels.
 *
 * Non-integer and out-of-range codes are left transparent rather than coerced into
 * a nearby class. Nodata transparency lives in the lookup table.
 */
export function colorizeClasses(
  classes: ArrayLike<number>,
  lut: Uint8Array,
): Uint8ClampedArray<ArrayBuffer> {
  const rgba = new Uint8ClampedArray(classes.length * 4);
  for (let i = 0; i < classes.length; i += 1) {
    const code = classes[i];
    if (!Number.isInteger(code) || code < 0 || code > 255) continue;
    const source = code * 4;
    const target = i * 4;
    rgba[target] = lut[source];
    rgba[target + 1] = lut[source + 1];
    rgba[target + 2] = lut[source + 2];
    rgba[target + 3] = lut[source + 3];
  }
  return rgba;
}

function toByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round((value / 65535) * 255)));
}
