import type { BaseWakala, Owner, SATill } from '../types';
import { normalizeMsisdn } from './msisdn';
import { resolveOwnerMatch } from './ownerMatch';

/**
 * Owner Transaction History. Every Daily MGT row is one transfer from
 * Branch_msisdn (the sending till) to Dest_MSISDN; "Volume (TZS)" is always
 * positive and "Wakala Name" is the sending till's own name. So the
 * direction comes from which end is the owner's till, and the other party's
 * name has to be looked up in the registries.
 */
export type TransactionDirection = 'sent' | 'received' | 'own';

type CounterpartyKind = 'own_till' | 'owner_till' | 'company_till' | 'sa_till' | 'base' | 'iop';

export interface Counterparty {
  msisdn: string;
  name: string | null;
  kind: CounterpartyKind;
  /** Type label, e.g. "Base wakala · MWALE" or "IOP · not in Base Wakala Index". */
  detail: string;
}

export interface OwnerTransaction {
  row: any;
  direction: TransactionDirection;
  amount: number;
  /** The owner's till on this transfer. */
  tillMsisdn: string;
  counterparty: Counterparty;
}

interface TillEntry {
  transactionTill?: string;
  tillName?: string;
  name?: string;
  assignedOwner?: string;
}

export interface CounterpartyRegistries {
  tills: TillEntry[];
  saTills: SATill[];
  baseWakalas: BaseWakala[];
  owners: Owner[];
}

const clean = (v: unknown) => {
  const s = String(v ?? '').trim();
  return s && s.toUpperCase() !== '#N/A' ? s : '';
};

/** Names a number from the tills list, SA till registry and Base Wakala Index (classification order). */
export function buildCounterpartyLookup(
  { tills, saTills, baseWakalas, owners }: CounterpartyRegistries,
  ownTills: Set<string>,
): (msisdn: string) => Counterparty {
  const tillBy = new Map<string, TillEntry>();
  for (const t of tills) {
    const key = normalizeMsisdn(t?.transactionTill);
    if (key) tillBy.set(key, t);
  }
  const saBy = new Map<string, SATill>();
  for (const s of saTills) {
    const key = normalizeMsisdn(s?.tillMsisdn);
    if (key) saBy.set(key, s);
  }
  const baseBy = new Map<string, BaseWakala>();
  for (const b of baseWakalas) {
    const key = normalizeMsisdn(b?.msisdn);
    if (key) baseBy.set(key, b);
  }
  for (const b of baseWakalas) {
    const alt = normalizeMsisdn(b?.altMsisdn || b?.alternateNumber);
    if (alt && !baseBy.has(alt)) baseBy.set(alt, b);
  }

  return (raw: string): Counterparty => {
    const msisdn = normalizeMsisdn(raw) || String(raw || '').trim();
    const till = tillBy.get(msisdn);
    const sa = saBy.get(msisdn);
    const base = baseBy.get(msisdn);
    const name =
      clean(till?.tillName || till?.name) ||
      clean(base?.fullName) ||
      clean(base?.wakalaName) ||
      clean(sa?.ownerName) ||
      null;

    if (ownTills.has(msisdn)) return { msisdn, name, kind: 'own_till', detail: 'Own till' };
    if (till) {
      // Same rule as classification: a till whose holder is no registered
      // owner (a manager, cashier or CP) is a company till.
      const owner = resolveOwnerMatch(till.assignedOwner, owners, 'Transaction History').matchedOwner;
      return owner
        ? { msisdn, name, kind: 'owner_till', detail: `Owner till · ${owner.name}` }
        : { msisdn, name, kind: 'company_till', detail: 'Company till' };
    }
    if (sa) return { msisdn, name, kind: 'sa_till', detail: 'SA till' };
    if (base) {
      const owner = clean(base.ownerName);
      return { msisdn, name, kind: 'base', detail: owner ? `Base wakala · ${owner}` : 'Base wakala · no owner' };
    }
    return { msisdn, name, kind: 'iop', detail: 'IOP · not in Base Wakala Index' };
  };
}

function rowAmount(row: any): number {
  const val = row['Volume (TZS)'] ?? row['Volume'] ?? row['Amount'] ?? row['volume'] ?? 0;
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

/**
 * The owner's side of every transfer touching one of their tills: sent when
 * their till is the sender, received when it is the destination, own when
 * both ends are theirs.
 */
export function ownerTransactions(
  rows: any[],
  ownTills: Set<string>,
  lookup: (msisdn: string) => Counterparty,
): OwnerTransaction[] {
  const out: OwnerTransaction[] = [];
  for (const row of rows) {
    const from = normalizeMsisdn(row?.['Branch_msisdn'] || row?.['branch_msisdn']);
    const to = normalizeMsisdn(row?.['Dest_MSISDN'] || row?.['dest_msisdn']);
    const fromOwn = !!from && ownTills.has(from);
    const toOwn = !!to && ownTills.has(to);
    if (!fromOwn && !toOwn) continue;
    const direction: TransactionDirection = fromOwn && toOwn ? 'own' : fromOwn ? 'sent' : 'received';
    out.push({
      row,
      direction,
      amount: rowAmount(row),
      tillMsisdn: fromOwn ? from : to,
      counterparty: lookup(direction === 'received' ? from : to),
    });
  }
  return out;
}
