import React, { useEffect, useState } from 'react';

// ── Install Prompt ─────────────────────────────────────────────────────────────

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if already installed (running in standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setVisible(false);
    setDeferredPrompt(null);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
      <div className="bg-[#1e3a5f] text-white rounded-2xl shadow-2xl p-4 flex items-center gap-3">
        <div className="text-3xl shrink-0">📲</div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">Add MGSG to Home Screen</p>
          <p className="text-xs text-blue-200 mt-0.5">Quick access, works offline, no browser bar</p>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={handleInstall}
            className="bg-white text-[#1e3a5f] text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
          >
            Install
          </button>
          <button
            onClick={() => setVisible(false)}
            className="text-blue-300 text-xs hover:text-white text-center"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Update Banner ──────────────────────────────────────────────────────────────

export const UpdateBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = () => setVisible(true);
    window.addEventListener('sw-update-available', handler);
    return () => window.removeEventListener('sw-update-available', handler);
  }, []);

  const handleRefresh = () => {
    // Tell the waiting service worker to activate immediately
    navigator.serviceWorker.getRegistration().then((reg) => {
      reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    });
    window.location.reload();
  };

  if (!visible) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
      <div className="bg-green-600 text-white rounded-2xl shadow-2xl p-4 flex items-center gap-3">
        <div className="text-2xl shrink-0">🔄</div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">Update Available</p>
          <p className="text-xs text-green-100 mt-0.5">A new version of MGSG is ready</p>
        </div>
        <button
          onClick={handleRefresh}
          className="bg-white text-green-700 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-green-50 transition-colors shrink-0"
        >
          Refresh
        </button>
      </div>
    </div>
  );
};
