import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// ── Service Worker Registration (PWA) ─────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[SW] Registered, scope:', registration.scope);

        // Check for updates every 60 seconds when the app is open
        setInterval(() => registration.update(), 60 * 1000);

        registration.onupdatefound = () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.onstatechange = () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available — fire a custom event the UI can listen to
              window.dispatchEvent(new CustomEvent('sw-update-available'));
            }
          };
        };
      })
      .catch((err) => console.error('[SW] Registration failed:', err));
  });
}
