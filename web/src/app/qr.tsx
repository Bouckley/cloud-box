import QRCode from 'qrcode';
import { useMemo } from 'react';

/** Blank modules round the code, as scanners expect. */
const QUIET = 4;

/**
 * A QR code drawn as SVG squares (no canvas, no data URL, so the CSP stays
 * strict). Dark runs on a row are joined into one rect.
 */
export function QrCode({ text }: { text: string }) {
  const { size, runs } = useMemo(() => {
    const m = QRCode.create(text, { errorCorrectionLevel: 'M' }).modules;
    const found: { x: number; y: number; w: number }[] = [];
    for (let y = 0; y < m.size; y++) {
      let start = -1;
      for (let x = 0; x <= m.size; x++) {
        const dark = x < m.size && m.get(y, x);
        if (dark && start < 0) start = x;
        if (!dark && start >= 0) {
          found.push({ x: start, y, w: x - start });
          start = -1;
        }
      }
    }
    return { size: m.size, runs: found };
  }, [text]);
  const all = size + QUIET * 2;
  return (
    <svg
      className="qr"
      role="img"
      aria-label="QR code for the pairing code"
      viewBox={`0 0 ${all} ${all}`}
      shapeRendering="crispEdges"
    >
      <rect width={all} height={all} className="qr__ground" />
      {runs.map((r) => (
        <rect key={`${r.x},${r.y}`} x={r.x + QUIET} y={r.y + QUIET} width={r.w} height={1} />
      ))}
    </svg>
  );
}
