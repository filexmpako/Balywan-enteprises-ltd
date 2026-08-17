import { AsyncLocalStorage } from 'node:async_hooks';
import { registerServerStoreResolver, type KvSnapshot } from './kv';

const als = new AsyncLocalStorage<KvSnapshot>();

registerServerStoreResolver(() => als.getStore() ?? null);

/**
 * Runs the shared (browser-authored) business engines against a
 * request-scoped snapshot of the database instead of localStorage.
 */
export function runWithSnapshot<T>(snapshot: KvSnapshot, fn: () => T): T {
  return als.run(snapshot, fn);
}

export type { KvSnapshot };
