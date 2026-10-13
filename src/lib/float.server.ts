import type { SupabaseClient } from '@supabase/supabase-js';
import type { FloatRequest, FloatReturnEntry, LoanRecord } from '../types';
import { fromRow, getMapper, toRow, type CollectionMapper } from './hasidadi/collections';
import { loadCollection } from './hasidadi/repo.server';
import { ensurePrivateBucket, ImageUploadError, parseImageDataUrl } from './storageImages.server';

/**
 * Float requests and loans, written one record at a time.
 *
 * Every action reads the record's current state, checks the step is allowed
 * from that state, and updates only that record — never the whole list, so a
 * device with an out-of-date list can't overwrite or delete other people's
 * requests. Staff (admin / float manager) write as themselves (RLS gives them
 * full access). Owners may only insert Pending requests and update their own
 * loans under RLS, so an owner's return is checked here and then written with
 * the server client.
 */
type DB = SupabaseClient<any, any, any>;

const FLOAT = getMapper('floatRequests') as CollectionMapper;
const LOANS = getMapper('loanRecords') as CollectionMapper;

export const RECEIPT_BUCKET = 'float-receipts';
const RECEIPT_PREFIX = 'cloud:';

export class FloatActionError extends Error {}

export interface FloatActor {
  userId: string;
  isStaff: boolean;
  ownerId: string | null;
}

export type FloatAction =
  | { type: 'create'; ownerId: string; amount: number }
  | { type: 'confirm'; requestId: string; managerId: string; managerName: string; sentAmount?: number }
  | { type: 'rejectRequest'; requestId: string; managerId: string; managerName: string; reason?: string }
  | { type: 'submitReturn'; requestId: string; entries: FloatReturnEntry[]; shortfallReason?: string }
  | { type: 'complete'; requestId: string; managerId: string; managerName: string }
  | { type: 'rejectReturn'; requestId: string; managerId: string; managerName: string }
  | { type: 'approveLoan'; requestId: string; managerId: string; managerName: string }
  | { type: 'submitRepayment'; loanId: string; amount: number; description?: string }
  | { type: 'markLoanPaid'; loanId: string; managerId: string; managerName: string }
  | { type: 'rejectRepayment'; loanId: string; managerId: string; managerName: string };

const STAFF_ACTIONS = new Set<FloatAction['type']>([
  'confirm',
  'rejectRequest',
  'complete',
  'rejectReturn',
  'approveLoan',
  'markLoanPaid',
  'rejectRepayment',
]);

export async function resolveActor(supabase: DB, userId: string): Promise<FloatActor> {
  const [staff, owner] = await Promise.all([
    supabase.rpc('is_staff', { _user_id: userId }),
    supabase.rpc('current_owner_id'),
  ]);
  if (staff.error) throw new Error(`is_staff: ${staff.error.message}`);
  return { userId, isStaff: staff.data === true, ownerId: (owner.data as string | null) || null };
}

/** The requests and loans this user may see (RLS: owners their own, staff all). */
export async function loadFloatData(supabase: DB): Promise<{ requests: FloatRequest[]; loans: LoanRecord[] }> {
  const [requests, loans] = await Promise.all([loadCollection(supabase, FLOAT), loadCollection(supabase, LOANS)]);
  return { requests, loans };
}

/** Every mapped column, null where the object has no value (so cleared fields really clear). */
function fullRow(mapper: CollectionMapper, obj: any): Record<string, any> {
  const row = toRow(mapper, obj, 0);
  for (const column of Object.values(mapper.columns)) {
    if (column !== mapper.pk && row[column] === undefined) row[column] = null;
  }
  return row;
}

async function readOne<T>(db: DB, mapper: CollectionMapper, id: string): Promise<T> {
  const { data, error } = await db.from(mapper.table).select('*').eq(mapper.pk, id).maybeSingle();
  if (error) throw new Error(`${mapper.table} read: ${error.message}`);
  if (!data) throw new FloatActionError('This record no longer exists. The list has been refreshed.');
  return fromRow(mapper, data) as T;
}

async function writeOne(db: DB, mapper: CollectionMapper, obj: any): Promise<void> {
  const { error } = await db.from(mapper.table).update(fullRow(mapper, obj)).eq(mapper.pk, obj.id);
  if (error) throw new Error(`${mapper.table} update: ${error.message}`);
}

function expectStatus(current: string, allowed: string[], what: string) {
  if (!allowed.includes(current)) {
    throw new FloatActionError(`This ${what} is already ${current}. The list has been refreshed.`);
  }
}

const totalReturned = (r: FloatRequest) => (r.returnEntries || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
/** The amount the owner owes back: what was sent, else what was requested. */
const owedAmount = (r: FloatRequest) => (Number(r.sentAmount) > 0 ? Number(r.sentAmount) : r.requestedAmount);

const CHANNELS = new Set(['CRDB', 'YAS', 'NBC', 'Other']);

function cleanEntries(entries: FloatReturnEntry[]): FloatReturnEntry[] {
  if (!Array.isArray(entries) || entries.length === 0) throw new FloatActionError('Add at least one return amount.');
  return entries.map((e, i) => {
    const amount = Number(e?.amount);
    if (!(amount > 0)) throw new FloatActionError('Every return row needs an amount greater than 0.');
    const channel = CHANNELS.has(String(e?.channel)) ? (e.channel as FloatReturnEntry['channel']) : 'Other';
    const entry: FloatReturnEntry = { id: String(e?.id || `entry_${Date.now()}_${i}`), channel, amount };
    if (channel === 'Other') entry.channelOther = String(e?.channelOther || '').trim() || 'Other';
    if (e?.receiptPhotoId) entry.receiptPhotoId = String(e.receiptPhotoId);
    return entry;
  });
}

const newId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

/**
 * Applies one float action. `getAdminDb` supplies the server client, used only
 * for an owner's own return (owners have no UPDATE right on float_requests).
 */
export async function runFloatAction(
  userDb: DB,
  getAdminDb: () => Promise<DB>,
  actor: FloatActor,
  action: FloatAction,
  now: Date = new Date(),
): Promise<void> {
  const at = now.toISOString();
  if (STAFF_ACTIONS.has(action.type) && !actor.isStaff) {
    throw new FloatActionError('Only a float manager or admin can do this.');
  }
  const ownsRecord = (ownerId: string) => actor.isStaff || (!!actor.ownerId && actor.ownerId === ownerId);

  switch (action.type) {
    case 'create': {
      const amount = Number(action.amount);
      if (!(amount > 0)) throw new FloatActionError('Enter an amount greater than 0.');
      if (!ownsRecord(action.ownerId)) throw new FloatActionError('You can only request float for your own account.');
      const request: FloatRequest = {
        id: newId('float'),
        ownerId: action.ownerId,
        requestedAmount: amount,
        requestedAt: at,
        status: 'Pending',
      };
      const { error } = await userDb.from(FLOAT.table).insert(fullRow(FLOAT, request));
      if (error) throw new Error(`float_requests insert: ${error.message}`);
      return;
    }

    case 'confirm': {
      const r = await readOne<FloatRequest>(userDb, FLOAT, action.requestId);
      expectStatus(r.status, ['Pending'], 'request');
      const sent = action.sentAmount === undefined ? r.requestedAmount : Number(action.sentAmount);
      if (!(sent > 0)) throw new FloatActionError('Enter the amount sent (greater than 0).');
      await writeOne(userDb, FLOAT, {
        ...r,
        sentAmount: sent !== r.requestedAmount ? sent : undefined,
        status: 'Confirmed',
        confirmedByManagerId: action.managerId,
        confirmedByManagerName: action.managerName,
        confirmedAt: at,
      });
      return;
    }

    case 'rejectRequest': {
      const r = await readOne<FloatRequest>(userDb, FLOAT, action.requestId);
      expectStatus(r.status, ['Pending'], 'request');
      await writeOne(userDb, FLOAT, {
        ...r,
        status: 'Rejected',
        requestRejectedAt: at,
        requestRejectedByManagerId: action.managerId,
        requestRejectedByManagerName: action.managerName,
        requestRejectionReason: action.reason?.trim() || undefined,
      });
      return;
    }

    case 'submitReturn': {
      const db = actor.isStaff ? userDb : await getAdminDb();
      const r = await readOne<FloatRequest>(db, FLOAT, action.requestId);
      if (!ownsRecord(r.ownerId)) throw new FloatActionError('You can only return float for your own account.');
      expectStatus(r.status, ['Confirmed'], 'request');
      const entries = cleanEntries(action.entries);
      const returned = entries.reduce((s, e) => s + e.amount, 0);
      const shortfallReason = returned < owedAmount(r) ? action.shortfallReason?.trim() || '' : undefined;
      if (shortfallReason === '') throw new FloatActionError('Please explain why this return is short.');
      await writeOne(db, FLOAT, { ...r, status: 'Returned', returnEntries: entries, returnedAt: at, shortfallReason });
      return;
    }

    case 'complete': {
      const r = await readOne<FloatRequest>(userDb, FLOAT, action.requestId);
      expectStatus(r.status, ['Returned'], 'request');
      if (totalReturned(r) !== owedAmount(r)) {
        throw new FloatActionError('The returned amount does not match the amount sent.');
      }
      await writeOne(userDb, FLOAT, {
        ...r,
        status: 'Completed',
        confirmedByManagerId: action.managerId,
        confirmedByManagerName: action.managerName,
      });
      return;
    }

    case 'rejectReturn': {
      const r = await readOne<FloatRequest>(userDb, FLOAT, action.requestId);
      expectStatus(r.status, ['Returned'], 'return');
      await writeOne(userDb, FLOAT, {
        ...r,
        status: 'Confirmed',
        returnEntries: undefined,
        returnedAt: undefined,
        shortfallReason: undefined,
        rejectedAt: at,
        rejectedByManagerId: action.managerId,
        rejectedByManagerName: action.managerName,
      });
      return;
    }

    case 'approveLoan': {
      const r = await readOne<FloatRequest>(userDb, FLOAT, action.requestId);
      expectStatus(r.status, ['Returned'], 'request');
      if (r.loanId) throw new FloatActionError('A loan already exists for this request.');
      const shortfall = owedAmount(r) - totalReturned(r);
      if (shortfall <= 0) throw new FloatActionError('This return is not short, so no loan is needed.');
      const loan: LoanRecord = {
        id: newId('loan'),
        ownerId: r.ownerId,
        floatRequestId: r.id,
        amount: shortfall,
        reason: r.shortfallReason || '',
        createdAt: at,
        approvedByManagerId: action.managerId,
        approvedByManagerName: action.managerName,
        status: 'Outstanding',
      };
      // The loan must exist before the request can point at it (loan_id FK).
      const { error } = await userDb.from(LOANS.table).insert(fullRow(LOANS, loan));
      if (error) throw new Error(`loan_records insert: ${error.message}`);
      await writeOne(userDb, FLOAT, { ...r, status: 'Completed', loanId: loan.id });
      return;
    }

    case 'submitRepayment': {
      const l = await readOne<LoanRecord>(userDb, LOANS, action.loanId);
      if (!ownsRecord(l.ownerId)) throw new FloatActionError('You can only repay your own loans.');
      if (l.status === 'Paid') throw new FloatActionError('This loan is already marked as paid.');
      const amount = Number(action.amount);
      if (!(amount > 0)) throw new FloatActionError('Enter a repayment amount greater than 0.');
      const description = action.description?.trim() || undefined;
      if (amount > l.amount && !description) {
        throw new FloatActionError('A description is required when repaying more than the outstanding loan amount.');
      }
      await writeOne(userDb, LOANS, {
        ...l,
        status: 'Repayment Submitted',
        repaidAmount: amount,
        repaymentDescription: description,
        repaymentSubmittedAt: at,
      });
      return;
    }

    case 'markLoanPaid': {
      const l = await readOne<LoanRecord>(userDb, LOANS, action.loanId);
      expectStatus(l.status, ['Repayment Submitted'], 'loan');
      await writeOne(userDb, LOANS, {
        ...l,
        status: 'Paid',
        paidAt: at,
        markedPaidByManagerId: action.managerId,
        markedPaidByManagerName: action.managerName,
      });
      return;
    }

    case 'rejectRepayment': {
      const l = await readOne<LoanRecord>(userDb, LOANS, action.loanId);
      expectStatus(l.status, ['Repayment Submitted'], 'loan');
      await writeOne(userDb, LOANS, {
        ...l,
        status: 'Outstanding',
        repaidAmount: undefined,
        repaymentDescription: undefined,
        repaymentSubmittedAt: undefined,
        repaymentRejectedAt: at,
        repaymentRejectedByManagerId: action.managerId,
        repaymentRejectedByManagerName: action.managerName,
      });
      return;
    }

    default:
      throw new FloatActionError('Unknown float action.');
  }
}

/** Stores a return receipt in private cloud storage; returns its receipt id. */
export async function storeReceipt(
  adminDb: DB,
  actor: FloatActor,
  requestId: string,
  dataUrl: string,
): Promise<string> {
  const r = await readOne<FloatRequest>(adminDb, FLOAT, requestId);
  if (!(actor.isStaff || (!!actor.ownerId && actor.ownerId === r.ownerId))) {
    throw new FloatActionError('You can only add receipts to your own float request.');
  }
  let image: ReturnType<typeof parseImageDataUrl>;
  try {
    image = parseImageDataUrl(dataUrl);
  } catch (e) {
    throw new FloatActionError(e instanceof ImageUploadError ? e.message.replace('The file', 'The receipt') : 'Invalid receipt photo.');
  }

  await ensurePrivateBucket(adminDb, RECEIPT_BUCKET);
  const path = `${r.ownerId}/${r.id}/${crypto.randomUUID()}.${image.ext}`;
  const { error } = await adminDb.storage
    .from(RECEIPT_BUCKET)
    .upload(path, image.bytes, { contentType: image.contentType, upsert: false });
  if (error) throw new Error(`receipt upload: ${error.message}`);
  return `${RECEIPT_PREFIX}${path}`;
}

/** A short-lived link to a stored receipt, for staff or the owner it belongs to. */
export async function receiptLink(adminDb: DB, actor: FloatActor, receiptId: string): Promise<string> {
  if (!String(receiptId).startsWith(RECEIPT_PREFIX)) throw new FloatActionError('Unknown receipt.');
  const path = receiptId.slice(RECEIPT_PREFIX.length);
  const ownerId = path.split('/')[0];
  if (!ownerId || path.includes('..')) throw new FloatActionError('Unknown receipt.');
  if (!(actor.isStaff || (!!actor.ownerId && actor.ownerId === ownerId))) {
    throw new FloatActionError('You cannot view this receipt.');
  }
  const { data, error } = await adminDb.storage.from(RECEIPT_BUCKET).createSignedUrl(path, 600);
  if (error || !data?.signedUrl) throw new Error(`receipt link: ${error?.message || 'not found'}`);
  return data.signedUrl;
}
