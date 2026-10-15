/**
 * Install-as-app support. The browser's "can install" signal
 * (beforeinstallprompt) can fire before React mounts, so it is caught here at
 * module load and kept until an Install button asks for it.
 */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferredPrompt: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    installed ||
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
  );
}

/** iPhone / iPad: no install prompt exists; Safari's Share → Add to Home Screen is the way. */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1);
}

export function canPromptInstall(): boolean {
  return deferredPrompt !== null;
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferredPrompt;
  if (!event) return 'unavailable';
  deferredPrompt = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  notify();
  return outcome;
}

export function subscribeInstall(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function initPwa() {
  if (typeof window === 'undefined' || (window as any).__balwynPwa) return;
  (window as any).__balwynPwa = true;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // show our own Install button instead of the mini-infobar
    deferredPrompt = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    notify();
  });

  if ('serviceWorker' in navigator) {
    const register = () => navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('[pwa] service worker', err));
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }
}

/**
 * New-version check. Every build gives the entry script a new hashed name
 * (/assets/index-XXXX.js). An app left open (an installed app keeps running in
 * the background) would otherwise stay on the old code after a Publish, so the
 * page is re-fetched when the app comes back into view, regains focus, and
 * every 10 minutes, and a different entry name means a new version is out.
 */
const ENTRY_RE = /\/assets\/index-[\w-]+\.js/;
let updateAvailable = false;
const updateListeners = new Set<() => void>();

function runningEntry(): string | null {
  const el = document.querySelector<HTMLScriptElement | HTMLLinkElement>(
    'script[src*="/assets/index-"], link[rel="modulepreload"][href*="/assets/index-"]',
  );
  const url = el ? (el as HTMLScriptElement).src || (el as HTMLLinkElement).href : '';
  return url.match(ENTRY_RE)?.[0] ?? null;
}

async function checkForUpdate(): Promise<void> {
  if (updateAvailable || !navigator.onLine) return;
  const current = runningEntry();
  if (!current) return; // dev server: no hashed build
  try {
    const res = await fetch('/', { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) return;
    const latest = (await res.text()).match(ENTRY_RE)?.[0];
    if (latest && latest !== current) {
      updateAvailable = true;
      updateListeners.forEach((fn) => fn());
    }
  } catch {
    /* offline or blocked: try again on the next trigger */
  }
}

export function isUpdateAvailable(): boolean {
  return updateAvailable;
}

export function subscribeUpdate(fn: () => void): () => void {
  updateListeners.add(fn);
  return () => updateListeners.delete(fn);
}

function initUpdateCheck() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  });
  window.addEventListener('focus', () => void checkForUpdate());
  window.addEventListener('online', () => void checkForUpdate());
  setInterval(() => void checkForUpdate(), 10 * 60 * 1000);
}

initPwa();
if (typeof window !== 'undefined' && !(window as any).__balwynUpdateCheck) {
  (window as any).__balwynUpdateCheck = true;
  initUpdateCheck();
}
