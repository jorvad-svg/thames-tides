import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// ── Service worker registration ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/thames-tides/sw.js').then((reg) => {
    // Check for updates every 15 minutes
    setInterval(() => reg.update(), 15 * 60 * 1000);
  });
}

// ── Force reload when returning from background (iOS standalone) ──
// iOS suspends standalone web apps rather than killing them, so the page
// can be hours old when the user taps the icon again. This detects that
// resume and reloads if enough time has passed.
let lastActive = Date.now();
const STALE_THRESHOLD = 10 * 60 * 1000; // 10 minutes

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const elapsed = Date.now() - lastActive;
    if (elapsed > STALE_THRESHOLD) {
      window.location.reload();
    }
  } else {
    lastActive = Date.now();
  }
});
