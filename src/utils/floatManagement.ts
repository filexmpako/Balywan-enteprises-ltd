import { FloatRequest, FloatReturnEntry, LoanRecord } from '../types';
import { fetchFloatData, fetchFloatReceiptUrl, runFloatActionFn, uploadFloatReceipt } from '../lib/float.functions';
import type { FloatAction } from '../lib/float.server';
import { getPhoto } from './db';

/**
 * Float requests and loans. The browser keeps a read cache (filled at sign-in
 * and by refreshFloatData); every change goes to the server one record at a
 * time and the cache is then reloaded. Nothing here writes the whole list.
 */
const STORAGE_KEY = 'floatRequests';
const LOAN_STORAGE_KEY = 'loanRecords';

export type FloatResult = { ok: true } | { ok: false; error: string };

export function getFloatRequests(): FloatRequest[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed: FloatRequest[] = JSON.parse(saved);
    // A request with a loan is finished whatever status an older copy carries.
    return parsed.map(r => (r.loanId && r.status !== 'Completed' ? { ...r, status: 'Completed' as const } : r));
  } catch (e) {
    return [];
  }
}

export function getFloatRequestsForOwner(ownerId: string): FloatRequest[] {
  return getFloatRequests()
    .filter(r => r.ownerId === ownerId)
    .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
}

export function getLoanRecords(): LoanRecord[] {
  try {
    const saved = localStorage.getItem(LOAN_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    return [];
  }
}

export function getLoanRecordsForOwner(ownerId: string): LoanRecord[] {
  return getLoanRecords()
    .filter(l => l.ownerId === ownerId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

let lastRefreshedAt: Date | null = null;
export const getFloatLastRefreshed = () => lastRefreshedAt;

/** Reloads requests and loans from the server into the cache. */
export async function refreshFloatData(): Promise<boolean> {
  try {
    const { requests, loans } = await fetchFloatData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(requests || []));
    localStorage.setItem(LOAN_STORAGE_KEY, JSON.stringify(loans || []));
    lastRefreshedAt = new Date();
    window.dispatchEvent(new Event('float-requests-updated'));
    return true;
  } catch (e) {
    console.warn('[float] refresh failed', e);
    return false;
  }
}

const errorText = (e: unknown) =>
  (e instanceof Error && e.message) || 'The float change could not be saved. Please try again.';

async function run(action: FloatAction): Promise<FloatResult> {
  try {
    await runFloatActionFn({ data: { action } });
    await refreshFloatData();
    return { ok: true };
  } catch (e) {
    // The list may be out of date (e.g. another manager acted first).
    await refreshFloatData();
    return { ok: false, error: errorText(e) };
  }
}

export const createFloatRequest = (ownerId: string, amount: number) => run({ type: 'create', ownerId, amount });

export const rejectFloatRequest = (requestId: string, managerId: string, managerName: string, reason?: string) =>
  run({ type: 'rejectRequest', requestId, managerId, managerName, reason });

export const confirmFloatRequest = (requestId: string, managerId: string, managerName: string) =>
  run({ type: 'confirm', requestId, managerId, managerName });

export const submitFloatReturn = (requestId: string, entries: FloatReturnEntry[], shortfallReason?: string) =>
  run({ type: 'submitReturn', requestId, entries, shortfallReason });

export const completeFloatRequest = (requestId: string, managerId: string, managerName: string) =>
  run({ type: 'complete', requestId, managerId, managerName });

export const rejectFloatReturn = (requestId: string, managerId: string, managerName: string) =>
  run({ type: 'rejectReturn', requestId, managerId, managerName });

export const approveLoanForShortfall = (requestId: string, managerId: string, managerName: string) =>
  run({ type: 'approveLoan', requestId, managerId, managerName });

export const submitLoanRepayment = (loanId: string, amount: number, description?: string) =>
  run({ type: 'submitRepayment', loanId, amount, description });

export const markLoanPaid = (loanId: string, managerId: string, managerName: string) =>
  run({ type: 'markLoanPaid', loanId, managerId, managerName });

export const rejectLoanRepayment = (loanId: string, managerId: string, managerName: string) =>
  run({ type: 'rejectRepayment', loanId, managerId, managerName });

/** Uploads a return receipt photo (data URL) to cloud storage; returns its receipt id. */
export async function uploadReceipt(requestId: string, dataUrl: string): Promise<string> {
  const { receiptId } = await uploadFloatReceipt({ data: { requestId, dataUrl } });
  return receiptId;
}

/** Image source for a receipt: a cloud link, or a photo saved on this device by older versions. */
export async function loadReceiptImage(receiptId: string): Promise<string | null> {
  if (receiptId.startsWith('cloud:')) {
    const { url } = await fetchFloatReceiptUrl({ data: { receiptId } });
    return url || null;
  }
  const photo = await getPhoto(receiptId);
  return photo?.imageData || null;
}

const REFRESH_MS = 30000;
let autoRefreshUsers = 0;
let stopAutoRefresh: (() => void) | null = null;

/**
 * Keeps the float lists current while a float screen is open: on open, every
 * 30 seconds while the page is visible, and when the page comes back into view.
 * Returns the cleanup for the calling component.
 */
export function startFloatAutoRefresh(): () => void {
  autoRefreshUsers += 1;
  if (autoRefreshUsers === 1) {
    const tick = () => {
      if (document.visibilityState === 'visible') void refreshFloatData();
    };
    const timer = window.setInterval(tick, REFRESH_MS);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    stopAutoRefresh = () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
    void refreshFloatData();
  }
  return () => {
    autoRefreshUsers -= 1;
    if (autoRefreshUsers === 0) {
      stopAutoRefresh?.();
      stopAutoRefresh = null;
    }
  };
}

export function getTotalReturned(request: FloatRequest): number {
  return (request.returnEntries || []).reduce((sum, e) => sum + e.amount, 0);
}

/** Amount still missing after the owner's return (0 when fully returned). */
export function getShortfall(request: FloatRequest): number {
  return Math.max(0, request.requestedAmount - getTotalReturned(request));
}

/**
 * A short return counts as a loan for the owner; it waits here until the
 * Float Manager approves it (approveLoanForShortfall creates the loan record).
 */
export function isLoanPendingApproval(request: FloatRequest): boolean {
  return request.status === 'Returned' && !request.loanId && getShortfall(request) > 0;
}

/** Short returns awaiting the manager's loan approval. */
export function getPendingLoanRequests(requests: FloatRequest[]): FloatRequest[] {
  return requests.filter(isLoanPendingApproval);
}

export function getPendingDays(request: FloatRequest): number {
  if (request.status === 'Completed' || request.status === 'Rejected') return 0;
  const start = new Date(request.requestedAt).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - start) / 86400000));
}

export function getResolutionDays(request: FloatRequest): number | null {
  if (!request.returnedAt) return null;
  const start = new Date(request.requestedAt).getTime();
  const end = new Date(request.returnedAt).getTime();
  return Math.max(0, Math.floor((end - start) / 86400000));
}

export function getStatusBadgeInfo(r: FloatRequest): {
  label: string;
  badgeClass: string;
} {
  if (r.loanId) {
    return {
      label: 'Loan Created',
      badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    };
  }
  if (r.status === 'Rejected') {
    return {
      label: 'Rejected',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    };
  }
  if (r.status === 'Completed') {
    return {
      label: 'Completed',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  }
  if (r.status === 'Returned') {
    if (isLoanPendingApproval(r)) {
      return {
        label: 'Loan Pending Approval',
        badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      };
    }
    const mismatch = getTotalReturned(r) !== r.requestedAmount;
    if (mismatch) {
      return {
        label: 'Amount Mismatch',
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
      };
    }
    return {
      label: 'Awaiting Final Confirm',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    };
  }
  if (r.status === 'Confirmed') {
    return {
      label: 'Confirmed',
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    };
  }
  return {
    label: 'Pending',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  };
}
