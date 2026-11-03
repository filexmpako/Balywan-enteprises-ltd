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

/** Confirmed loan repayments so far. */
export const loanPaid = (l: LoanRecord) => (l.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);

/** What is still owed on a loan. */
export const loanBalance = (l: LoanRecord) => Math.max(0, l.amount - loanPaid(l));

export type OutstandingKind = 'float' | 'shortReturn' | 'loan';

export interface OutstandingItem {
  kind: OutstandingKind;
  /** The float request id, or the loan id for a loan. */
  id: string;
  ownerId: string;
  /** What was given / lent. */
  given: number;
  /** Paid back so far (returned float, confirmed loan repayments). */
  paid: number;
  /** Still owed: given − paid. */
  amount: number;
  /** When it became owed: float confirmed (else requested), return made, loan created. */
  since: string;
  reminder?: { byName: string; at: string };
  /** A loan repayment the owner has sent, waiting for the float manager's check. */
  repaymentSubmitted?: boolean;
}

export interface OwnerOutstanding {
  ownerId: string;
  given: number;
  paid: number;
  /** Still owed. */
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
      items.push({ kind: 'float', id: r.id, ownerId: r.ownerId, given: floatOwed(r), paid: 0, amount: floatOwed(r), since: r.confirmedAt || r.requestedAt, reminder: r.reminder });
    } else if (r.status === 'Returned' && floatShortfall(r) > 0) {
      items.push({
        kind: 'shortReturn', id: r.id, ownerId: r.ownerId, given: floatOwed(r), paid: floatReturned(r), amount: floatShortfall(r),
        since: r.returnedAt || r.requestedAt, reminder: r.reminder,
      });
    }
  }
  for (const l of loans) {
    if (l.status === 'Paid' || loanBalance(l) <= 0) continue;
    items.push({
      kind: 'loan', id: l.id, ownerId: l.ownerId, given: l.amount, paid: loanPaid(l), amount: loanBalance(l), since: l.createdAt, reminder: l.reminder,
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
      o = { ownerId: item.ownerId, given: 0, paid: 0, total: 0, items: [], since: item.since };
      byOwner.set(item.ownerId, o);
    }
    o.given += item.given;
    o.paid += item.paid;
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
