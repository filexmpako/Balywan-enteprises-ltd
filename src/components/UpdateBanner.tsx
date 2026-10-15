import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { isUpdateAvailable, subscribeUpdate } from '../lib/pwa';

/** Shown when a newer version has been published while this app was open. */
export default function UpdateBanner() {
  const [show, setShow] = useState(isUpdateAvailable);
  useEffect(() => subscribeUpdate(() => setShow(true)), []);
  if (!show) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-3 bg-brand-primary px-4 py-2.5 text-white shadow-lg"
      style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}
    >
      <span className="font-sans text-xs font-bold sm:text-sm">A new version of Balwyn is available.</span>
      <button
        onClick={() => window.location.reload()}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 font-sans text-xs font-black text-brand-primary"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Reload
      </button>
    </div>
  );
}
