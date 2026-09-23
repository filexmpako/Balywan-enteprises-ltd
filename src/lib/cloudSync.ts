/**
 * Cloud sync layer.
 *
 * Postgres is the system of record. localStorage remains a write-through
 * cache for collections/documents (queuing writes while offline); Daily MGT
 * transactions have no local cache at all and are always read live from the
 * server.
 */
import { COLLECTION_KEYS, DOCUMENT_KEYS } from './hasidadi/collections';
import { fetchWorkspace, saveCollection, saveDocument } from './hasidadi.functions';
import { CLOUD_HYDRATED_EVENT } from './cloudSyncEvents';

const QUEUE_KEY = 'hasidadi_sync_queue';
const SYNCED = new Set<string>([...COLLECTION_KEYS, ...(DOCUMENT_KEYS as readonly string[])]);

let installed = false;
let suspended = false;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

type QueueEntry = { key: string; kind: 'collection' | 'document'; value: string };

function readQueue(): QueueEntry[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeQueue(entries: QueueEntry[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(entries.slice(-200)));
}

function enqueue(entry: QueueEntry) {
  const queue = readQueue().filter((q) => q.key !== entry.key);
  queue.push(entry);
  writeQueue(queue);
}

async function hasSession(): Promise<boolean> {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data } = await supabase.auth.getSession();
    return Boolean(data.session?.access_token);
  } catch {
    return false;
  }
}

/**
 * Daily MGT transactions have no local cache to warm — every consumer
 * (dashboard, KPI Reports, Targets, ...) reads straight from Postgres. This
 * just tells mounted views to re-fetch, via the same 'servicing-rows-updated'
 * signal they already listen for.
 */
function notifyDailyTransactionsChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('servicing-rows-updated'));
}

async function push(entry: QueueEntry) {
  // No signed-in session => the protected server fn would 401. Keep the write
  // in the offline queue instead and let flushQueue retry after sign-in.
  if (!(await hasSession())) throw new Error('No active session; deferring sync');
  const parsed = JSON.parse(entry.value);
  if (entry.kind === 'collection') {
    await saveCollection({ data: { key: entry.key, items: Array.isArray(parsed) ? parsed : [] } });
  } else {
    await saveDocument({ data: { key: entry.key, value: parsed } });
  }
}

export async function flushQueue(): Promise<void> {
  const queue = readQueue();
  if (!queue.length) return;
  const remaining: QueueEntry[] = [];
  for (const entry of queue) {
    try {
      await push(entry);
    } catch {
      remaining.push(entry);
    }
  }
  writeQueue(remaining);
}

function schedulePush(key: string, value: string) {
  const kind: QueueEntry['kind'] = COLLECTION_KEYS.includes(key) ? 'collection' : 'document';
  const entry: QueueEntry = { key, kind, value };
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  timers.set(
    key,
    setTimeout(async () => {
      timers.delete(key);
      try {
        await push(entry);
      } catch {
        enqueue(entry);
      }
    }, 600),
  );
}

/** Write-through: every cached mutation is mirrored to Postgres. */
export function installCloudSync() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function patchedSetItem(key: string, value: string) {
    original.call(this, key, value);
    if (this === window.localStorage && !suspended && SYNCED.has(key)) {
      try {
        schedulePush(key, value);
      } catch {
        /* cache write must never break the UI */
      }
    }
  };

  window.addEventListener('online', () => {
    void flushQueue();
  });
}

/** Pulls the server state into the offline cache without echoing it back. */
export async function hydrateFromCloud(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const workspace = await fetchWorkspace();
    suspended = true;
    for (const [key, items] of Object.entries(workspace.collections ?? {})) {
      localStorage.setItem(key, JSON.stringify(items));
    }
    for (const [key, value] of Object.entries(workspace.documents ?? {})) {
      if (value !== null && value !== undefined) localStorage.setItem(key, JSON.stringify(value));
    }
    localStorage.setItem('hasidadi_last_sync', new Date().toISOString());

    notifyDailyTransactionsChanged();

    // Views that read the cache at mount need to re-read once server data lands.
    window.dispatchEvent(new Event(CLOUD_HYDRATED_EVENT));
    return true;
  } catch (err) {
    console.warn('[cloudSync] hydration failed, continuing from offline cache', err);
    return false;
  } finally {
    suspended = false;
    void flushQueue();
  }
}

let realtimeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Keeps an already-open session live: hydrateFromCloud() only runs at
 * sign-in, so a dashboard left open on one device would otherwise never see
 * a Daily MGT upload made from another device until the next sign-in or
 * reload. Subscribes to Postgres changes on daily_transaction_records and
 * tells mounted views to re-fetch, debounced so one multi-row upload
 * (persisted as chunked upserts) triggers a single refresh instead of many.
 *
 * Requires daily_transaction_records to be added to the supabase_realtime
 * publication (see the matching migration) — without that, this
 * subscription is inert and notifyDailyTransactionsChanged() still runs at
 * every sign-in via hydrateFromCloud().
 */
export async function subscribeToDailyTransactions(): Promise<() => void> {
  if (typeof window === 'undefined') return () => {};
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const channel = supabase
      .channel('daily-transaction-records-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_transaction_records' },
        () => {
          if (realtimeDebounceTimer) clearTimeout(realtimeDebounceTimer);
          realtimeDebounceTimer = setTimeout(() => {
            realtimeDebounceTimer = null;
            notifyDailyTransactionsChanged();
          }, 1000);
        },
      )
      .subscribe();

    return () => {
      if (realtimeDebounceTimer) {
        clearTimeout(realtimeDebounceTimer);
        realtimeDebounceTimer = null;
      }
      void supabase.removeChannel(channel);
    };
  } catch (err) {
    console.warn('[cloudSync] Could not subscribe to Daily MGT realtime updates', err);
    return () => {};
  }
}
