import type { FloatRequest, LoanRecord } from '../types';

/**
 * What each owner still owes on float. An outstanding balance never stops an
 * owner from requesting new float; it is listed for the float manager and
 * shown to the owner as a reminder to return / pay. Shared by the server, the
 * owner screen and the float manager screen.
 */

/** What the owner owes back: the amount the float manager sent, else the amount requested. */
export const floatOwed = (r: FloatRequest) => (Number(r.sentAmount) > 0 ? Number(r.sentAmount) : r.requestedAmount);

export const floatReturned = (r: FloatRequest) => (r.returnEntries || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);

/** Amount still missing after the owner's return (0 when fully returned). */
export const floatShortfall = (r: FloatRequest) => Math.max(0, floatOwed(r) - floatReturned(r));

export type OutstandingKind = 'float' | 'shortReturn' | 'loan';

export interface OutstandingItem {
  kind: OutstandingKind;
  /** The float request id, or the loan id for a loan. */
  id: string;
  ownerId: string;
  amount: number;
  /** When it became owed: float confirmed (else requested), return made, loan created. */
  since: string;
  reminder?: { byName: string; at: string };
  /** A loan repayment the owner has sent, waiting for the float manager's check. */
  repaymentSubmitted?: boolean;
}

export interface OwnerOutstanding {
  ownerId: string;
  total: number;
  items: OutstandingItem[];
  /** The oldest item's date. */
  since: string;
  lastReminder?: { byName: string; at: string };
}

/**
 * Everything owed: float sent and not yet returned, the missing part of a
 * short return waiting for loan approval, and loans not yet paid.
 */
export function outstandingItems(requests: FloatRequest[], loans: LoanRecord[]): OutstandingItem[] {
  const items: OutstandingItem[] = [];
  for (const r of requests) {
    if (r.loanId) continue;
    if (r.status === 'Confirmed') {
      items.push({ kind: 'float', id: r.id, ownerId: r.ownerId, amount: floatOwed(r), since: r.confirmedAt || r.requestedAt, reminder: r.reminder });
    } else if (r.status === 'Returned' && floatShortfall(r) > 0) {
      items.push({ kind: 'shortReturn', id: r.id, ownerId: r.ownerId, amount: floatShortfall(r), since: r.returnedAt || r.requestedAt, reminder: r.reminder });
    }
  }
  for (const l of loans) {
    if (l.status === 'Paid') continue;
    items.push({
      kind: 'loan', id: l.id, ownerId: l.ownerId, amount: l.amount, since: l.createdAt, reminder: l.reminder,
      repaymentSubmitted: l.status === 'Repayment Submitted',
    });
  }
  return items.sort((a, b) => a.since.localeCompare(b.since));
}

/** One line per owner who owes anything, longest outstanding first. */
export function outstandingByOwner(requests: FloatRequest[], loans: LoanRecord[]): OwnerOutstanding[] {
  const byOwner = new Map<string, OwnerOutstanding>();
  for (const item of outstandingItems(requests, loans)) {
    let o = byOwner.get(item.ownerId);
    if (!o) {
      o = { ownerId: item.ownerId, total: 0, items: [], since: item.since };
      byOwner.set(item.ownerId, o);
    }
    o.total += item.amount;
    o.items.push(item);
    if (item.reminder && (!o.lastReminder || item.reminder.at > o.lastReminder.at)) o.lastReminder = item.reminder;
  }
  return Array.from(byOwner.values()).sort((a, b) => a.since.localeCompare(b.since));
}

/** The visible float-manager status for a request (one meaning per filter). */
export type FloatViewStatus = 'Pending' | 'Not returned' | 'Returned' | 'Completed' | 'Loan' | 'Rejected';

export function floatViewStatus(r: FloatRequest): FloatViewStatus {
  if (r.loanId) return 'Loan';
  if (r.status === 'Confirmed') return 'Not returned';
  return r.status as FloatViewStatus;
}
