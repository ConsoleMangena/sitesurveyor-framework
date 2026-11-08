import type { Map as LeafletMap } from "leaflet";

export interface MapExportOptions {
  title?: string;
  client?: string;
  categoryName?: string;
  coords?: string;
  scale?: string;
  dpr?: number;
  includeLegend?: boolean;
  includeHeader?: boolean;
  includeNorthArrow?: boolean;
  includeScaleBar?: boolean;
  includeNeatline?: boolean;
  target?: { latitude: number; longitude: number };
  bounds?: [[number, number], [number, number]];
  mpp?: number;
}

export interface OptimalQuality {
  dpr: number;
  dpi: number;
  label: string;
}

/**
 * Dynamically determines optimal export resolution (DPI) based on the user's
 * computer hardware (hardwareConcurrency, devicePixelRatio, GPU limits).
 */
export function detectOptimalQuality(requestedDpr?: number): OptimalQuality {
  if (requestedDpr && requestedDpr > 0) {
    const dpi = Math.round(requestedDpr * 96);
    return { dpr: requestedDpr, dpi, label: `${dpi} DPI (Custom)` };
  }

  const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
  const cores = typeof navigator !== "undefined" ? (navigator.hardwareConcurrency || 4) : 4;

  // On modern multi-core machines (>=6 cores or high-DPI Retina/4K screens),
  // target 300 DPI print quality (approx 3.125x scale)
  if (cores >= 6 || dpr >= 2) {
    return { dpr: 3.125, dpi: 300, label: "300 DPI (Ultra High-Res Print Quality)" };
  }
  if (cores >= 4 || dpr >= 1.5) {
    return { dpr: 2.5, dpi: 240, label: "240 DPI (High-Res Executive Quality)" };
  }
  return { dpr: 2.0, dpi: 192, label: "192 DPI (Standard Crisp Quality)" };
}

/**
 * Safely load an image source without tainting the target canvas.
 * If the image element cannot be safely drawn, it is fetched via CORS or converted to ImageBitmap.
 * If that fails, returns null so the canvas remains clean.
 */
async function loadCleanDrawable(img: HTMLImageElement): Promise<CanvasImageSource | null> {
  const src = img.currentSrc || img.src;
  if (!src) return null;

  // Data URLs and Blob URLs are local and inherently origin-clean
  if (src.startsWith("data:") || src.startsWith("blob:")) {
    return img;
  }

  // If already CORS-enabled in DOM and loaded
  if (
    (img.crossOrigin === "anonymous" || img.crossOrigin === "use-credentials" || img.crossOrigin === "") &&
    img.complete &&
    img.naturalWidth > 0
  ) {
    try {
      // Test drawing on a tiny scratch canvas to verify origin-cleanliness
      const testCanvas = document.createElement("canvas");
      testCanvas.width = 1;
      testCanvas.height = 1;
      const testCtx = testCanvas.getContext("2d");
      if (testCtx) {
        testCtx.drawImage(img, 0, 0, 1, 1);
        testCtx.getImageData(0, 0, 1, 1);
        return img;
      }
    } catch {
      // Fall through to fetch
    }
  }

  // Fetch with CORS to obtain a guaranteed origin-clean ImageBitmap or ObjectURL
  try {
    const res = await fetch(src, { mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (typeof createImageBitmap === "function") {
      try {
        return await createImageBitmap(blob);
      } catch {
        // Fallback below
      }
    }
    const blobUrl = URL.createObjectURL(blob);
    return await new Promise<HTMLImageElement | null>((resolve) => {
      const cleanImg = new window.Image();
      cleanImg.onload = () => resolve(cleanImg);
      cleanImg.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        resolve(null);
      };
      cleanImg.src = blobUrl;
    });
  } catch {
    // Return null to protect the destination canvas from being tainted
    return null;
  }
}

/** Draw professional surveyor compass rose with cardinal directions and star points */
function drawCompassRose(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.save();
  ctx.translate(cx, cy);

  // Semi-transparent circular plate backing
  ctx.fillStyle = "rgba(11, 16, 24, 0.85)";
  ctx.beginPath();
  ctx.arc(0, 0, radius + 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Outer ring
  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Inner ring
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.72, 0, Math.PI * 2);
  ctx.stroke();

  // Degree ticks
  for (let deg = 0; deg < 360; deg += 30) {
    const rad = (deg * Math.PI) / 180;
    const isMajor = deg % 90 === 0;
    const r1 = radius;
    const r2 = isMajor ? radius - 6 : radius - 3.5;
    ctx.strokeStyle = isMajor ? "rgba(255, 255, 255, 0.85)" : "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = isMajor ? 1.4 : 0.8;
    ctx.beginPath();
    ctx.moveTo(Math.cos(rad) * r1, Math.sin(rad) * r1);
    ctx.lineTo(Math.cos(rad) * r2, Math.sin(rad) * r2);
    ctx.stroke();
  }

  // 4 Cardinal Star Points (North, East, South, West)
  const mainLen = radius * 0.95;
  const innerLen = radius * 0.22;

  const points = [
    { angle: -Math.PI / 2, color: "#D14141", altColor: "#ffffff" }, // North (Red/White)
    { angle: 0, color: "#cbd5e1", altColor: "#475569" },             // East
    { angle: Math.PI / 2, color: "#cbd5e1", altColor: "#475569" },  // South
    { angle: Math.PI, color: "#cbd5e1", altColor: "#475569" },       // West
  ];

  for (const pt of points) {
    const a = pt.angle;
    const aLeft = a - Math.PI / 4;
    const aRight = a + Math.PI / 4;

    // Left triangle
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * mainLen, Math.sin(a) * mainLen);
    ctx.lineTo(Math.cos(aLeft) * innerLen, Math.sin(aLeft) * innerLen);
    ctx.closePath();
    ctx.fill();

    // Right triangle (shaded)
    ctx.fillStyle = pt.altColor;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * mainLen, Math.sin(a) * mainLen);
    ctx.lineTo(Math.cos(aRight) * innerLen, Math.sin(aRight) * innerLen);
    ctx.closePath();
    ctx.fill();
  }

  // North 'N' letter above the rose
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.round(radius * 0.42)}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("N", 0, -radius - 3);

  // Center hub
  ctx.fillStyle = "#0b1018";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

/** Draw cartographic segmented scale bar with metric divisions */
function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  mpp: number,
  scaleLabel: string
): void {
  ctx.save();
  const targetPixels = 150;
  const rawMeters = Math.max(1, targetPixels * mpp);

  // Nice round distance choices
  const steps = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
  let chosenMeters = steps[0];
  for (const step of steps) {
    if (step <= rawMeters * 1.4) {
      chosenMeters = step;
    }
  }

  const barWidth = Math.max(60, chosenMeters / mpp);
  const halfWidth = barWidth / 2;
  const barHeight = 6;

  // Background card
  const plateW = Math.max(barWidth + 36, 180);
  const plateH = 46;
  ctx.fillStyle = "rgba(11, 16, 24, 0.88)";
  ctx.fillRect(x - 10, y - 22, plateW, plateH);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 10, y - 22, plateW, plateH);

  // Left segment (white)
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y - barHeight / 2, halfWidth, barHeight);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 0.8;
  ctx.strokeRect(x, y - barHeight / 2, halfWidth, barHeight);

  // Right segment (dark slate)
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(x + halfWidth, y - barHeight / 2, halfWidth, barHeight);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 0.8;
  ctx.strokeRect(x + halfWidth, y - barHeight / 2, halfWidth, barHeight);

  // Outer border
  ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y - barHeight / 2, barWidth, barHeight);

  // Scale numbers above bar
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 9.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  ctx.fillText("0", x, y - 5);
  const midLabel = chosenMeters >= 1000 ? `${(chosenMeters / 2000).toFixed(1)} km` : `${chosenMeters / 2} m`;
  ctx.fillText(midLabel, x + halfWidth, y - 5);
  const fullLabel = chosenMeters >= 1000 ? `${(chosenMeters / 1000).toFixed(0)} km` : `${chosenMeters} m`;
  ctx.fillText(fullLabel, x + barWidth, y - 5);

  // Ground resolution readout below bar
  ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
  ctx.font = "9px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(
    `Scale: ${scaleLabel || "—"}  •  Res: ${mpp < 10 ? mpp.toFixed(2) : mpp.toFixed(1)} m/px`,
    x,
    y + 7
  );

  ctx.restore();
}

/** Draw surveyor neatline, double border, and corner GPS labels */
function drawNeatlineAndTicks(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  bounds?: [[number, number], [number, number]]
): void {
  ctx.save();
  const pad = 10;
  const innerPad = 15;

  // Outer border
  ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(pad, pad, width - pad * 2, height - pad * 2);

  // Inner neatline
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = 0.8;
  ctx.strokeRect(innerPad, innerPad, width - innerPad * 2, height - innerPad * 2);

  // Corner tick crosshairs
  const tickLen = 6;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
  ctx.lineWidth = 1;

  const corners = [
    { x: innerPad, y: innerPad, dx: 1, dy: 1 },
    { x: width - innerPad, y: innerPad, dx: -1, dy: 1 },
    { x: innerPad, y: height - innerPad, dx: 1, dy: -1 },
    { x: width - innerPad, y: height - innerPad, dx: -1, dy: -1 },
  ];
  for (const c of corners) {
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + c.dx * tickLen, c.y);
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x, c.y + c.dy * tickLen);
    ctx.stroke();
  }

  // Corner coordinates if available
  if (bounds) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, monospace";

    // NW corner: top-left
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`${bounds[1][0].toFixed(4)}° N, ${bounds[0][1].toFixed(4)}° E`, innerPad + 6, innerPad + 4);

    // SE corner: bottom-right
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${bounds[0][0].toFixed(4)}° S, ${bounds[1][1].toFixed(4)}° E`, width - innerPad - 6, height - innerPad - 4);
  }

  // Legal / Certification watermark footer line
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.font = "7.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(
    "OFFICIAL SITESURVEYOR™ OBSERVATION SHEET  •  MULTI-SPECTRAL EO SCREENING  •  CONFIDENTIAL & PROPRIETARY",
    width / 2,
    height - 4
  );

  ctx.restore();
}

/**
 * Capture the current visible Leaflet map extent onto an HTML5 canvas
 * with complete surveyor cartographic elements: North arrow rose,
 * segmented graphic scale bar, title block, coordinate ticks, neatline, and legend.
 */
export async function captureMapCanvas(
  map: LeafletMap,
  options: MapExportOptions = {}
): Promise<HTMLCanvasElement> {
  const container = map.getContainer();
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 600;

  // Determine optimal resolution from computer capabilities
  const quality = detectOptimalQuality(options.dpr);
  const dpr = quality.dpr;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas 2d context");

  ctx.scale(dpr, dpr);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // 1. Base dark background
  ctx.fillStyle = "#080c12";
  ctx.fillRect(0, 0, width, height);

  // 2. Draw map tiles and image overlays
  const mapRect = container.getBoundingClientRect();
  const images = Array.from(
    container.querySelectorAll<HTMLImageElement>(
      ".leaflet-pane img, .leaflet-overlay-pane img, .leaflet-marker-pane img"
    )
  );

  for (const img of images) {
    if (!img.complete || img.naturalWidth === 0) continue;
    const rect = img.getBoundingClientRect();
    const x = rect.left - mapRect.left;
    const y = rect.top - mapRect.top;
    const w = rect.width;
    const h = rect.height;

    // Boundary check
    if (x + w <= 0 || y + h <= 0 || x >= width || y >= height) continue;

    const drawable = await loadCleanDrawable(img);
    if (!drawable) continue;

    ctx.save();
    const opacity = parseFloat(window.getComputedStyle(img).opacity || "1");
    if (opacity < 1) ctx.globalAlpha = opacity;

    try {
      ctx.drawImage(drawable, x, y, w, h);
    } catch {
      // Ignore
    }
    ctx.restore();
  }

  // 3. Draw SVG overlays (AOI rectangle, candidate circles)
  const svgs = Array.from(
    container.querySelectorAll<SVGSVGElement>(".leaflet-overlay-pane svg")
  );
  for (const svg of svgs) {
    const rect = svg.getBoundingClientRect();
    const x = rect.left - mapRect.left;
    const y = rect.top - mapRect.top;

    try {
      let xml = new XMLSerializer().serializeToString(svg);
      if (!xml.includes("xmlns=")) {
        xml = xml.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      const img = new window.Image();
      await new Promise<void>((resolve) => {
        img.onload = () => {
          ctx.drawImage(img, x, y, rect.width, rect.height);
          URL.revokeObjectURL(url);
          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        img.src = url;
      });
    } catch {
      // Ignore SVG render errors
    }
  }

  // 4. Draw Target Site Reticle Marker
  if (options.target) {
    try {
      const pt = map.latLngToContainerPoint([options.target.latitude, options.target.longitude]);
      if (pt.x >= -30 && pt.x <= width + 30 && pt.y >= -30 && pt.y <= height + 30) {
        ctx.save();
        // Red surveyor reticle
        ctx.fillStyle = "#D14141";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = "#D14141";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pt.x - 16, pt.y);
        ctx.lineTo(pt.x + 16, pt.y);
        ctx.moveTo(pt.x, pt.y - 16);
        ctx.lineTo(pt.x, pt.y + 16);
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } catch {
      // Ignore coordinate conversion
    }
  }

  // 5. Cartographic Title Block (top-left)
  if (options.includeHeader !== false) {
    ctx.save();
    const boxW = Math.min(width - 48, 430);
    const boxH = 62;
    const boxX = 22;
    const boxY = 22;

    ctx.fillStyle = "rgba(11, 16, 24, 0.9)";
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    // Accent line on left
    ctx.fillStyle = "#D14141";
    ctx.fillRect(boxX, boxY, 3.5, boxH);

    // Brand tag
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.font = "bold 8.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("SITESURVEYOR™  •  EARTH OBSERVATION DOSSIER", boxX + 14, boxY + 16);

    // Main Title
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(options.title || "Earth Observation Survey Sheet", boxX + 14, boxY + 36);

    // Metadata line
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.font = "10.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const subText = [
      options.categoryName,
      options.coords,
      new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
    ]
      .filter(Boolean)
      .join("  •  ");
    ctx.fillText(subText, boxX + 14, boxY + 52);
    ctx.restore();
  }

  // 6. North Arrow Compass Rose (top-right)
  if (options.includeNorthArrow !== false) {
    const roseRadius = 26;
    const roseX = width - 48;
    const roseY = 48;
    drawCompassRose(ctx, roseX, roseY, roseRadius);
  }

  // 7. Graphic Segmented Scale Bar (bottom-left)
  if (options.includeScaleBar !== false) {
    const scaleX = 26;
    const scaleY = height - 44;
    const mpp = options.mpp || 1.2;
    drawScaleBar(ctx, scaleX, scaleY, mpp, options.scale || "—");
  }

  // 8. Classified Potential Legend (bottom-right)
  if (options.includeLegend !== false) {
    ctx.save();
    const legW = 160;
    const legH = 135;
    const legX = width - legW - 22;
    const legY = height - legH - 24;

    ctx.fillStyle = "rgba(11, 16, 24, 0.9)";
    ctx.fillRect(legX, legY, legW, legH);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
    ctx.lineWidth = 1;
    ctx.strokeRect(legX, legY, legW, legH);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("CLASSIFIED POTENTIAL", legX + 12, legY + 18);

    const classes = [
      { color: "#1a9850", label: "Very High" },
      { color: "#a6d96a", label: "High" },
      { color: "#fdae61", label: "Moderate" },
      { color: "#f46d43", label: "Low" },
      { color: "#d73027", label: "Very Low" },
    ];

    let rowY = legY + 36;
    for (const item of classes) {
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(legX + 16, rowY - 3, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.font = "10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillText(item.label, legX + 28, rowY);
      rowY += 18;
    }
    ctx.restore();
  }

  // 9. Surveyor Neatline & Border (perimeter)
  if (options.includeNeatline !== false) {
    drawNeatlineAndTicks(ctx, width, height, options.bounds);
  }

  return canvas;
}

/** Trigger browser download for a Blob */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    try {
      if (anchor.parentNode) {
        anchor.parentNode.removeChild(anchor);
      }
      URL.revokeObjectURL(url);
    } catch {
      // Ignored
    }
  }, 1000);
}

/** Export current map view as a high-resolution PNG (fallback utility) */
export async function exportMapAsPng(
  map: LeafletMap,
  filename = "sitesurveyor_map_extent.png",
  options: MapExportOptions = {}
): Promise<void> {
  const canvas = await captureMapCanvas(map, options);
  await new Promise<void>((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          try {
            const dataUrl = canvas.toDataURL("image/png");
            const arr = dataUrl.split(",");
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
              u8arr[n] = bstr.charCodeAt(n);
            }
            const fallbackBlob = new Blob([u8arr], { type: "image/png" });
            downloadBlob(fallbackBlob, filename);
            resolve();
          } catch (e) {
            reject(new Error("Failed to produce PNG blob from canvas."));
          }
          return;
        }
        downloadBlob(blob, filename);
        resolve();
      }, "image/png");
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generate a standard, ultra high-resolution PDF 1.4 survey map sheet.
 * Embeds the high-DPI rendered cartographic canvas with complete surveyor elements.
 */
export async function exportMapAsPdf(
  map: LeafletMap,
  filename = "sitesurveyor_map_extent.pdf",
  options: MapExportOptions = {}
): Promise<void> {
  const canvas = await captureMapCanvas(map, options);

  // Convert canvas to JPEG bytes at high quality (0.98)
  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL("image/jpeg", 0.98);
  } catch (err) {
    throw new Error(
      "Failed to encode map image for PDF generation: " +
        (err instanceof Error ? err.message : String(err))
    );
  }

  const base64Data = dataUrl.split(",")[1];
  if (!base64Data) {
    throw new Error("Canvas did not produce valid image data.");
  }

  const binaryString = atob(base64Data);
  const jpegBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    jpegBytes[i] = binaryString.charCodeAt(i);
  }

  // A4 Landscape dimensions in PDF points (72 points per inch: 842 x 595)
  const pageWidth = 842;
  const pageHeight = 595;

  // Fit image into printable area with margins
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;

  const imgAspect = canvas.width / canvas.height;
  let renderWidth = maxWidth;
  let renderHeight = renderWidth / imgAspect;

  if (renderHeight > maxHeight) {
    renderHeight = maxHeight;
    renderWidth = renderHeight * imgAspect;
  }

  const renderX = margin + (maxWidth - renderWidth) / 2;
  const renderY = margin + (maxHeight - renderHeight) / 2;

  // Build standard PDF 1.4 binary structure with LF linefeeds
  const nl = "\n";
  const header = "%PDF-1.4" + nl + "%\xE2\xE3\xCF\xD3" + nl;

  const obj1 = "1 0 obj" + nl + "<< /Type /Catalog /Pages 2 0 R >>" + nl + "endobj" + nl;
  const obj2 = "2 0 obj" + nl + "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" + nl + "endobj" + nl;
  const obj3 =
    "3 0 obj" + nl +
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
    "/Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> /ProcSet [/PDF /ImageC] >> >>" + nl +
    "endobj" + nl;

  const streamContent = `q${nl}${renderWidth.toFixed(2)} 0 0 ${renderHeight.toFixed(2)} ${renderX.toFixed(2)} ${renderY.toFixed(2)} cm${nl}/Im0 Do${nl}Q${nl}`;
  const obj4 = "4 0 obj" + nl + `<< /Length ${streamContent.length} >>` + nl + "stream" + nl + streamContent + "endstream" + nl + "endobj" + nl;

  const imageObjHeader =
    "5 0 obj" + nl +
    `<< /Type /XObject /Subtype /Image /Width ${canvas.width} ` +
    `/Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 ` +
    `/Filter /DCTDecode /Length ${jpegBytes.length} >>` + nl +
    "stream" + nl;
  const imageObjFooter = nl + "endstream" + nl + "endobj" + nl;

  // Calculate offsets for cross-reference table (xref)
  const enc = new TextEncoder();
  const hBytes = enc.encode(header);
  const o1Bytes = enc.encode(obj1);
  const o2Bytes = enc.encode(obj2);
  const o3Bytes = enc.encode(obj3);
  const o4Bytes = enc.encode(obj4);
  const imgHBytes = enc.encode(imageObjHeader);
  const imgFBytes = enc.encode(imageObjFooter);

  const off1 = hBytes.length;
  const off2 = off1 + o1Bytes.length;
  const off3 = off2 + o2Bytes.length;
  const off4 = off3 + o3Bytes.length;
  const off5 = off4 + o4Bytes.length;

  const endOf5 = off5 + imgHBytes.length + jpegBytes.length + imgFBytes.length;

  const xref =
    "xref" + nl +
    "0 6" + nl +
    "0000000000 65535 f " + nl +
    `${String(off1).padStart(10, "0")} 00000 n ` + nl +
    `${String(off2).padStart(10, "0")} 00000 n ` + nl +
    `${String(off3).padStart(10, "0")} 00000 n ` + nl +
    `${String(off4).padStart(10, "0")} 00000 n ` + nl +
    `${String(off5).padStart(10, "0")} 00000 n ` + nl;

  const trailer =
    "trailer" + nl +
    "<< /Size 6 /Root 1 0 R >>" + nl +
    "startxref" + nl +
    `${endOf5}` + nl +
    "%%EOF" + nl;
  const trailerBytes = enc.encode(xref + trailer);

  // Combine into single Uint8Array
  const totalLength = endOf5 + trailerBytes.length;
  const pdfBuffer = new Uint8Array(totalLength);

  let cursor = 0;
  pdfBuffer.set(hBytes, cursor);
  cursor += hBytes.length;
  pdfBuffer.set(o1Bytes, cursor);
  cursor += o1Bytes.length;
  pdfBuffer.set(o2Bytes, cursor);
  cursor += o2Bytes.length;
  pdfBuffer.set(o3Bytes, cursor);
  cursor += o3Bytes.length;
  pdfBuffer.set(o4Bytes, cursor);
  cursor += o4Bytes.length;
  pdfBuffer.set(imgHBytes, cursor);
  cursor += imgHBytes.length;
  pdfBuffer.set(jpegBytes, cursor);
  cursor += jpegBytes.length;
  pdfBuffer.set(imgFBytes, cursor);
  cursor += imgFBytes.length;
  pdfBuffer.set(trailerBytes, cursor);

  const pdfBlob = new Blob([pdfBuffer], { type: "application/pdf" });
  downloadBlob(pdfBlob, filename);
}
