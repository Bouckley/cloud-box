import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The build is embedded by boxd (box/web, go:embed) and served with a strict
// CSP: no inline scripts or styles, fonts self-hosted. In dev, Vite serves the
// app on http://localhost:5173 (a secure context) and proxies the box's API.
const box = { target: 'https://localhost:8443', secure: false, changeOrigin: true };

export default defineConfig({
  plugins: [react()],
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
