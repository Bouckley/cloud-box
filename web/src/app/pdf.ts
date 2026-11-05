/**
 * PDFs drawn by pdf.js, here in the browser: the file is decrypted on this
 * device and its pages painted onto canvases, so nothing about it reaches the
 * box. pdf.js loads only when a PDF is opened. Scripts inside PDFs never run
 * (no scripting sandbox is shipped) and form fields are drawn, not editable.
 */

export type PdfPage = {
  /** Size at 100%, in CSS pixels (PDF points). */
  width: number;
  height: number;
  /**
   * Paints the page at this zoom: true once drawn, false if a newer render
   * (a zoom) took its place. Rejects only when the page can't be drawn.
   */
  render(canvas: HTMLCanvasElement, scale: number): Promise<boolean>;
  /** The page's words, for screen readers. */
  text(): Promise<string>;
};

export type PdfDoc = {
  pages: number;
  page(n: number): Promise<PdfPage>;
  destroy(): void;
};

/** Where the build puts pdf.js's fonts and decoders (see vite.config.ts). */
const ASSETS = '/pdfjs/';

export async function openPdf(bytes: Uint8Array): Promise<PdfDoc> {
  // The legacy build: the modern one calls built-ins only the newest browsers
  // have (Map.prototype.getOrInsertComputed), so in Firefox 141 every page
  // came out blank. The legacy build brings its own copies of them.
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({
    data: bytes,
    standardFontDataUrl: `${ASSETS}standard_fonts/`,
    cMapUrl: `${ASSETS}cmaps/`,
    cMapPacked: true,
    wasmUrl: `${ASSETS}wasm/`,
    iccUrl: `${ASSETS}iccs/`,
    enableXfa: false,
  });
  const doc = await task.promise;
  return {
    pages: doc.numPages,
    async page(n) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      let drawing: { cancel(): void } | null = null;
      return {
        width: base.width,
        height: base.height,
        async render(canvas, scale) {
          drawing?.cancel();
          // Sharp on high-density screens: draw at device pixels, show at CSS size.
          const ratio = window.devicePixelRatio || 1;
          const viewport = page.getViewport({ scale: scale * ratio });
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const t = page.render({
            canvas,
            viewport,
            annotationMode: pdfjs.AnnotationMode.ENABLE,
          });
          drawing = t;
          try {
            await t.promise;
            return true;
          } catch (e) {
            if ((e as { name?: string } | null)?.name === 'RenderingCancelledException')
              return false;
            throw e;
          }
        },
        async text() {
          const content = await page.getTextContent();
          return content.items
            .map((i) => ('str' in i ? i.str + (i.hasEOL ? '\n' : '') : ''))
            .join('')
            .trim();
        },
      };
    },
    destroy: () => void task.destroy(),
  };
}

const STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
/** Space either side of the page inside the frame. */
const GUTTER = 24;

export const zoomIn = (z: number) => STEPS.find((s) => s > z + 0.001) ?? STEPS.at(-1)!;
export const zoomOut = (z: number) => [...STEPS].reverse().find((s) => s < z - 0.001) ?? STEPS[0]!;

/** The zoom at which a page this wide fills the frame. */
export const fitWidth = (pageWidth: number, frameWidth: number) =>
  Math.max(0.1, (frameWidth - 2 * GUTTER) / pageWidth);

/** Fit width, but a wide screen doesn't blow a page up past 125%. */
export const firstZoom = (pageWidth: number, frameWidth: number) =>
  Math.min(1.25, fitWidth(pageWidth, frameWidth));

export const zoomText = (z: number) => `${Math.round(z * 100)}%`;
