import { downloadBlob } from "./mapExport.ts";

/**
 * Renders the composed sheet PDF back to pixels — the live layout preview and
 * the PNG/JPEG products. The preview is the real document, not a mock-up, so
 * what the surveyor signs off is exactly what the export writes.
 */

type Pdfjs = typeof import("pdfjs-dist");
type PdfPage = import("pdfjs-dist").PDFPageProxy;

let pdfjsPromise: Promise<Pdfjs> | null = null;

function loadPdfjs(): Promise<Pdfjs> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

async function renderPageToCanvas(page: PdfPage, scale: number): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create the sheet render canvas.");
  await page.render({ canvas, viewport }).promise;
  return canvas;
}

export interface SheetPreview {
  canvas: HTMLCanvasElement;
  pageCount: number;
}

/** Render one page of the sheet at a preview scale (1 = 72 dpi). */
export async function renderSheetPreview(
  pdfBytes: Uint8Array,
  pageIndex: number,
  scale: number,
): Promise<SheetPreview> {
  const pdfjs = await loadPdfjs();
  // pdfjs hands the buffer to its worker; keep the caller's copy intact so the
  // same bytes can still be downloaded as the PDF product.
  const task = pdfjs.getDocument({ data: pdfBytes.slice() });
  const doc = await task.promise;
  try {
    const pageCount = doc.numPages;
    const index = Math.min(Math.max(0, pageIndex), pageCount - 1);
    const page = await doc.getPage(index + 1);
    const canvas = await renderPageToCanvas(page, scale);
    return { canvas, pageCount };
  } finally {
    await task.destroy();
  }
}

export type SheetImageFormat = "png" | "jpeg";

/**
 * Export the sheet as raster images at print resolution — one file per page,
 * the way a layout tool ships a multi-sheet job. Returns the page count.
 */
export async function downloadSheetImages(
  pdfBytes: Uint8Array,
  baseName: string,
  format: SheetImageFormat,
  dpi: number,
  onPage?: (page: number, total: number) => void,
): Promise<number> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: pdfBytes.slice() });
  const doc = await task.promise;
  try {
    const scale = dpi / 72;
    const mime = format === "png" ? "image/png" : "image/jpeg";
    const extension = format === "png" ? "png" : "jpg";
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const canvas = await renderPageToCanvas(page, scale);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, mime, 0.92),
      );
      if (!blob) throw new Error("The sheet image could not be encoded.");
      downloadBlob(blob, `${baseName}_sheet_${i}.${extension}`);
      onPage?.(i, doc.numPages);
    }
    return doc.numPages;
  } finally {
    await task.destroy();
  }
}