/**
 * Isomorphic key/value facade for the pure business engines.
 *
 * In the browser it is a thin pass-through to localStorage (offline cache).
 * On the server the engines run inside a request-scoped snapshot hydrated
 * from Postgres, so the exact same engine code produces the same results
 * without ever touching a browser API.
 */

export type KvSnapshot = Record<string, string>;

let resolveServerStore: () => KvSnapshot | null = () => null;

/** Called once by the server-only context module. */
export function registerServerStoreResolver(fn: () => KvSnapshot | null) {
  resolveServerStore = fn;
}

function browserStore(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function kvGet(key: string): string | null {
  const ls = browserStore();
  if (ls) return ls.getItem(key);
  const store = resolveServerStore();
  return store ? (store[key] ?? null) : null;
}

export function kvSet(key: string, value: string): void {
  const ls = browserStore();
  if (ls) {
    ls.setItem(key, value);
    return;
  }
  const store = resolveServerStore();
  if (store) store[key] = value;
}

export function kvJson<T>(key: string, fallback: T): T {
  const raw = kvGet(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
