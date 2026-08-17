export interface NameResolutionLogEntry {
  timestamp: string;
  rawName: string;
  matchedOwnerId: string | null;
  matchedOwnerName: string | null;
  matchedVia: 'alias' | 'heuristic' | 'unresolved';
  sourceContext: string;
}

const LOG_KEY = 'nameResolutionLog';

// In-memory buffer — entries accumulate here during a synchronous loop
// (e.g. parsing thousands of upload rows) instead of hitting localStorage
// on every single call.
let pendingEntries: NameResolutionLogEntry[] = [];
let flushScheduled = false;

function flushPendingEntries(): void {
  flushScheduled = false;
  if (pendingEntries.length === 0) return;

  try {
    const existing = localStorage.getItem(LOG_KEY);
    const log: NameResolutionLogEntry[] = existing ? JSON.parse(existing) : [];
    log.push(...pendingEntries);
    pendingEntries = [];
    const trimmed = log.length > 5000 ? log.slice(log.length - 5000) : log;
    localStorage.setItem(LOG_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('Failed to write name resolution log:', e);
    pendingEntries = []; // drop the batch rather than retry forever
  }
}

/**
 * Queues a resolution event. Entries are batched in memory and flushed to
 * localStorage in a single write after the current synchronous work
 * finishes (via setTimeout 0), instead of one localStorage round-trip per
 * call. This is what makes bulk uploads (thousands of rows in one parse
 * loop) fast instead of freezing the tab.
 */
export function logNameResolution(entry: NameResolutionLogEntry): void {
  pendingEntries.push(entry);
  if (!flushScheduled) {
    flushScheduled = true;
    setTimeout(flushPendingEntries, 0);
  }
}

export function getNameResolutionLog(): NameResolutionLogEntry[] {
  try {
    const existing = localStorage.getItem(LOG_KEY);
    const stored: NameResolutionLogEntry[] = existing ? JSON.parse(existing) : [];
    // Include anything still buffered but not yet flushed, so a read
    // immediately after a bulk operation doesn't appear to be missing data
    return [...stored, ...pendingEntries];
  } catch (e) {
    return [...pendingEntries];
  }
}
