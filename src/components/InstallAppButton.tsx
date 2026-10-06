import { useEffect, useState } from 'react';
import { Download, Share, SquarePlus, X } from 'lucide-react';
import { canPromptInstall, isIos, isStandalone, promptInstall, subscribeInstall } from '../lib/pwa';

/**
 * Download / install the app. Chrome, Edge and Android open the browser's
 * install dialog; iPhone/iPad (no install prompt exists) get the two Safari
 * steps. Hidden once the app is installed and running as an app.
 */
export default function InstallAppButton({ variant = 'icon' }: { variant?: 'icon' | 'full' }) {
  const [, setTick] = useState(0);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [ios, setIos] = useState(false);
  const [standalone, setStandalone] = useState(true); // hidden until checked in the browser

  useEffect(() => {
    setIos(isIos());
    setStandalone(isStandalone());
    return subscribeInstall(() => {
      setStandalone(isStandalone());
      setTick((t) => t + 1);
    });
  }, []);

  const canPrompt = canPromptInstall();
  if (standalone || (!canPrompt && !ios)) return null;

  const onClick = async () => {
    if (canPrompt) await promptInstall();
    else setShowIosHelp((v) => !v);
  };

  return (
    <div className="relative">
      {variant === 'full' ? (
        <button
          type="button"
          onClick={onClick}
          className="inline-flex items-center gap-2 rounded-xl border border-brand-primary/30 bg-white px-4 py-2.5 font-sans text-xs font-bold text-brand-primary shadow-sm hover:bg-brand-primary/5 cursor-pointer"
          id="install-app-btn"
        >
          <Download className="h-4 w-4" />
          Download app
        </button>
      ) : (
        <button
          type="button"
          onClick={onClick}
          className="relative rounded-full p-2.5 text-brand-text-variant hover:bg-brand-gray-hover hover:text-brand-primary transition-colors cursor-pointer"
          title="Download app"
          aria-label="Download app"
          id="install-app-icon-btn"
        >
          <Download className="h-5 w-5" />
        </button>
      )}

      {showIosHelp && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowIosHelp(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-4 text-left font-sans text-xs text-slate-700 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-extrabold text-slate-900">Install on iPhone / iPad</p>
              <button type="button" onClick={() => setShowIosHelp(false)} className="cursor-pointer text-slate-400" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ol className="space-y-2">
              <li className="flex items-center gap-2">
                <span className="font-bold">1.</span> In Safari tap <Share className="h-4 w-4 text-brand-primary" /> Share
              </li>
              <li className="flex items-center gap-2">
                <span className="font-bold">2.</span> Choose <SquarePlus className="h-4 w-4 text-brand-primary" /> Add to Home Screen
              </li>
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
