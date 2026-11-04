import '@fontsource-variable/inter';
// The pairing code only: a face where I, l, 1, 0 and O can't be mistaken.
import '@fontsource/ibm-plex-mono/latin-600.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/print.css';
import { ready } from '@cloudbox/crypto';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';

// libsodium (WebAssembly) loads before anything renders: every screen needs it.
await ready();
document.documentElement.dataset.crypto = 'ready';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
