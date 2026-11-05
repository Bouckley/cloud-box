import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ChevronIcon,
  ChevronLeftIcon,
  FitWidthIcon,
  MinusIcon,
  PlusIcon,
} from '../../app/icons.tsx';
import {
  firstZoom,
  fitWidth,
  zoomIn,
  zoomOut,
  zoomText,
  type PdfDoc,
  type PdfPage,
} from '../../app/pdf.ts';

/** Frame width when it can't be measured (tests, a hidden tab). */
const FALLBACK_WIDTH = 800;

/**
 * A PDF in Cloud Box's own frame: a toolbar (Previous / Page n of N / Next,
 * Zoom out / size / Zoom in, Fit width) over the pages, which scroll in a
 * sunken frame. Only pages near the screen are drawn, so long files open fast.
 */
export function PdfView({ doc, name }: { doc: PdfDoc; name: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const [first, setFirst] = useState<PdfPage | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const [current, setCurrent] = useState(1);

  useEffect(() => {
    let live = true;
    void doc.page(1).then((p) => {
      if (!live) return;
      setFirst(p);
      setZoom(firstZoom(p.width, frame.current?.clientWidth || FALLBACK_WIDTH));
    });
    return () => {
      live = false;
    };
  }, [doc]);

  const pageEl = (n: number) =>
    frame.current?.querySelector<HTMLElement>(`[data-page="${n}"]`) ?? null;

  const show = useCallback((n: number) => {
    setCurrent(n);
    const el = frame.current?.querySelector<HTMLElement>(`[data-page="${n}"]`);
    if (frame.current && el) frame.current.scrollTop = el.offsetTop - 16;
  }, []);

  // A new zoom keeps the page you were on in view.
  const keep = useRef(current);
  useLayoutEffect(() => {
    keep.current = current;
  });
  useLayoutEffect(() => {
    if (zoom !== null && keep.current > 1) show(keep.current);
  }, [zoom, show]);

  // Scrolling by hand: the page nearest the top of the frame is "this page".
  const onScroll = () => {
    const f = frame.current;
    if (!f) return;
    const mid = f.scrollTop + f.clientHeight / 3;
    let at = 1;
    for (let n = 1; n <= doc.pages; n++) {
      const el = pageEl(n);
      if (el && el.offsetTop <= mid) at = n;
    }
    setCurrent(at);
  };

  return (
    <div className="pdf">
      <div className="pdf__bar" role="toolbar" aria-label="Pages and zoom">
        <div className="pdf__group">
          <button
            type="button"
            className="icon-button pdf__button"
            aria-label="Previous page"
            disabled={current <= 1}
            onClick={() => show(current - 1)}
          >
            <ChevronLeftIcon size={20} />
          </button>
          <p className="pdf__count" aria-live="polite">
            Page {current.toLocaleString()} of {doc.pages.toLocaleString()}
          </p>
          <button
            type="button"
            className="icon-button pdf__button"
            aria-label="Next page"
            disabled={current >= doc.pages}
            onClick={() => show(current + 1)}
          >
            <ChevronIcon size={20} />
          </button>
        </div>
        <div className="pdf__group">
          <button
            type="button"
            className="icon-button pdf__button"
            aria-label="Zoom out"
            disabled={zoom === null}
            onClick={() => zoom !== null && setZoom(zoomOut(zoom))}
          >
            <MinusIcon size={20} />
          </button>
          <p className="pdf__zoom">{zoom === null ? '' : zoomText(zoom)}</p>
          <button
            type="button"
            className="icon-button pdf__button"
            aria-label="Zoom in"
            disabled={zoom === null}
            onClick={() => zoom !== null && setZoom(zoomIn(zoom))}
          >
            <PlusIcon size={20} />
          </button>
        </div>
        <button
          type="button"
          className="button pdf__fit"
          disabled={!first}
          onClick={() =>
            first && setZoom(fitWidth(first.width, frame.current?.clientWidth || FALLBACK_WIDTH))
          }
        >
          <FitWidthIcon size={18} />
          Fit width
        </button>
      </div>
      {/* The pages scroll here; the frame takes focus so arrow keys and Page Down work. */}
      <div
        ref={frame}
        className="pdf__frame"
        role="region"
        aria-label={`Pages of ${name}`}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling region must take focus to scroll by keyboard
        tabIndex={0}
        onScroll={onScroll}
      >
        {zoom !== null &&
          first &&
          Array.from({ length: doc.pages }, (_, i) => (
            <Page
              key={i + 1}
              doc={doc}
              n={i + 1}
              of={doc.pages}
              zoom={zoom}
              guess={first}
              root={frame}
            />
          ))}
      </div>
    </div>
  );
}

/** One page: sized at once (so scrolling is steady), drawn when near the screen. */
function Page({
  doc,
  n,
  of,
  zoom,
  guess,
  root,
}: {
  doc: PdfDoc;
  n: number;
  of: number;
  zoom: number;
  guess: { width: number; height: number };
  root: React.RefObject<HTMLDivElement | null>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(typeof IntersectionObserver === 'undefined');
  const [page, setPage] = useState<PdfPage | null>(null);
  const [words, setWords] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (near || !box.current) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) setNear(true);
      },
      { root: root.current, rootMargin: '100% 0px' },
    );
    io.observe(box.current);
    return () => io.disconnect();
  }, [near, root]);

  useEffect(() => {
    if (!near) return;
    let live = true;
    void doc.page(n).then((p) => {
      if (!live) return;
      setPage(p);
      void p.text().then((t) => live && setWords(t));
    });
    return () => {
      live = false;
    };
  }, [near, doc, n]);

  useEffect(() => {
    if (!page || !canvas.current) return;
    let live = true;
    page.render(canvas.current, zoom).then(
      (drawn) => live && drawn && setFailed(false),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [page, zoom]);

  const size = page ?? guess;
  return (
    <div
      ref={box}
      className="pdf__page"
      data-page={n}
      role="group"
      aria-label={`Page ${n.toLocaleString()} of ${of.toLocaleString()}`}
      style={{ width: `${size.width * zoom}px`, height: `${size.height * zoom}px` }}
    >
      {page && <canvas ref={canvas} aria-hidden="true" />}
      {failed && (
        <p className="pdf__failed">
          This page couldn&apos;t be shown. Download the file to see it.
        </p>
      )}
      <p className="visually-hidden">{words}</p>
    </div>
  );
}
