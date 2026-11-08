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
  target?: { latitude: number; longitude: number };
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

/**
 * Capture the current visible Leaflet map extent onto an HTML5 canvas
 * with cartographic header, scale bar, north arrow, and legend.
 */
export async function captureMapCanvas(
  map: LeafletMap,
  options: MapExportOptions = {}
): Promise<HTMLCanvasElement> {
  const container = map.getContainer();
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 600;
  const dpr = Math.min(window.devicePixelRatio || 2, 2);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas 2d context");

  ctx.scale(dpr, dpr);

  // 1. Draw base background
  ctx.fillStyle = "#0b1018";
  ctx.fillRect(0, 0, width, height);

  // 2. Draw all map pane images (tiles, image overlays)
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

    // Check if within bounds
    if (x + w <= 0 || y + h <= 0 || x >= width || y >= height) continue;

    const drawable = await loadCleanDrawable(img);
    if (!drawable) continue;

    ctx.save();
    // Inherit opacity if set on parent or element
    const opacity = parseFloat(window.getComputedStyle(img).opacity || "1");
    if (opacity < 1) ctx.globalAlpha = opacity;

    try {
      ctx.drawImage(drawable, x, y, w, h);
    } catch {
      // Ignore
    }
    ctx.restore();
  }

  // 3. Draw SVG overlays (AOI bounds rectangle, circles)
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

  // 4. Draw Target Marker Pin
  if (options.target) {
    try {
      const pt = map.latLngToContainerPoint([options.target.latitude, options.target.longitude]);
      if (pt.x >= -30 && pt.x <= width + 30 && pt.y >= -30 && pt.y <= height + 30) {
        ctx.save();
        ctx.fillStyle = "#D14141";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 8.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = "#D14141";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pt.x - 15, pt.y);
        ctx.lineTo(pt.x + 15, pt.y);
        ctx.moveTo(pt.x, pt.y - 15);
        ctx.lineTo(pt.x, pt.y + 15);
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } catch {
      // Ignore marker coordinate conversion
    }
  }

  // 5. Cartographic Header (if enabled)
  if (options.includeHeader !== false) {
    ctx.save();
    ctx.fillStyle = "rgba(11, 16, 24, 0.88)";
    ctx.fillRect(16, 16, Math.min(width - 32, 420), 56);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1;
    ctx.strokeRect(16, 16, Math.min(width - 32, 420), 56);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(options.title || "SiteSurveyor Earth Observation Export", 28, 36);

    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const subText = [
      options.categoryName,
      options.client,
      options.coords,
      new Date().toLocaleDateString(),
    ]
      .filter(Boolean)
      .join(" · ");
    ctx.fillText(subText, 28, 54);
    ctx.restore();
  }

  // 6. Cartographic Legend (if enabled)
  if (options.includeLegend !== false) {
    ctx.save();
    const legW = 160;
    const legH = 135;
    const legX = width - legW - 16;
    const legY = height - legH - 24;

    ctx.fillStyle = "rgba(11, 16, 24, 0.9)";
    ctx.fillRect(legX, legY, legW, legH);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
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

  // 7. Scale and North indicator (bottom left)
  ctx.save();
  const infoX = 16;
  const infoY = height - 24;
  ctx.fillStyle = "rgba(11, 16, 24, 0.85)";
  ctx.fillRect(infoX, infoY - 18, 180, 24);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1;
  ctx.strokeRect(infoX, infoY - 18, 180, 24);

  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.font = "10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(
    `Scale: ${options.scale || "—"}  |  North ↑`,
    infoX + 10,
    infoY - 3
  );
  ctx.restore();

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

/** Export current map view as a high-resolution PNG */
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
 * Generate a standard PDF 1.4 document embedding the captured high-resolution map image.
 * Works completely in-memory with zero external dependencies.
 */
export async function exportMapAsPdf(
  map: LeafletMap,
  filename = "sitesurveyor_map_extent.pdf",
  options: MapExportOptions = {}
): Promise<void> {
  const canvas = await captureMapCanvas(map, options);

  // Convert canvas to JPEG bytes
  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL("image/jpeg", 0.95);
  } catch (err) {
    throw new Error("Failed to encode map image for PDF generation: " + (err instanceof Error ? err.message : String(err)));
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

  // A4 Landscape dimensions in PDF points (72 points per inch)
  const pageWidth = 842;
  const pageHeight = 595;

  // Fit image into printable area with margins
  const margin = 28;
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2 - 20;

  const imgAspect = canvas.width / canvas.height;
  let renderWidth = maxWidth;
  let renderHeight = renderWidth / imgAspect;

  if (renderHeight > maxHeight) {
    renderHeight = maxHeight;
    renderWidth = renderHeight * imgAspect;
  }

  const renderX = margin + (maxWidth - renderWidth) / 2;
  const renderY = margin + (maxHeight - renderHeight) / 2;

  // Build standard PDF 1.4 binary structure
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
