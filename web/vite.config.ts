import { cpSync, createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
// pnpm links packages in; copy from the real folder, not the link.
const pdfjs = realpathSync(join(here, 'node_modules', 'pdfjs-dist'));

/**
 * pdf.js's fonts (for PDFs that don't embed theirs), character maps (Chinese,
 * Japanese, Korean), colour profiles and image decoders, served at /pdfjs/. Its scripting
 * sandbox (quickjs) and no-WebAssembly fallbacks are left out: PDFs never run
 * scripts here, and the CSP allows WebAssembly.
 */
function pdfAssets(): Plugin {
  const wanted = (rel: string) =>
    /^(standard_fonts|cmaps|iccs)\//.test(rel) ||
    /^wasm\/(?!quickjs)[\w-]+\.wasm$/.test(rel) ||
    /^wasm\/LICENSE/.test(rel);
  let outDir = '';
  return {
    name: 'cloudbox-pdfjs-assets',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    configureServer(server) {
      server.middlewares.use('/pdfjs/', (req, res, next) => {
        const rel = normalize(decodeURIComponent((req.url ?? '').split('?')[0]!)).replace(
          /^\/+/,
          '',
        );
        const file = join(pdfjs, rel);
        if (
          !wanted(rel) ||
          !file.startsWith(pdfjs) ||
          !existsSync(file) ||
          !statSync(file).isFile()
        )
          return next();
        if (rel.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
        createReadStream(file).pipe(res);
      });
    },
    writeBundle() {
      cpSync(pdfjs, join(outDir, 'pdfjs'), {
        recursive: true,
        filter: (src) => {
          const rel = src.slice(pdfjs.length + 1);
          return (
            rel === '' ||
            rel === 'standard_fonts' ||
            rel === 'cmaps' ||
            rel === 'iccs' ||
            rel === 'wasm' ||
            wanted(rel)
          );
        },
      });
    },
  };
}

// The build is embedded by boxd (box/web, go:embed) and served with a strict
// CSP: no inline scripts or styles, fonts self-hosted. In dev, Vite serves the
// app on http://localhost:5173 (a secure context) and proxies the box's API.
const box = { target: 'https://localhost:8443', secure: false, changeOrigin: true };

export default defineConfig({
  plugins: [react(), pdfAssets()],
  build: {
    outDir: '../box/web/dist',
    emptyOutDir: true,
    // Fonts and icons are files, never data: URIs (CSP font-src/img-src 'self').
    assetsInlineLimit: 0,
    sourcemap: false,
    // libsodium (sumo, with its WebAssembly inlined) is most of the main chunk
    // and every screen needs it; the app is served over the home network.
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/v1': box, '/dev': box },
  },
  worker: { format: 'es' },
});
