import type { FloatRequest } from '../types';

/**
 * The one rule for "may this owner request new float?": not while an earlier
 * request is still open (Pending, Confirmed or Returned-awaiting-check), unless
 * a float manager has granted a one-time exception on that open request.
 * Shared by the server, the owner screen and the float manager screen.
 */
export const isOpenRequest = (r: FloatRequest) => r.status !== 'Completed' && r.status !== 'Rejected' && !r.loanId;

export interface OwnerFloatBlock {
  /** Open requests that stop the owner from requesting. */
  blocking: FloatRequest[];
  /** An open request carrying an unused exception, if any. */
  exceptionOn: FloatRequest | null;
  canRequest: boolean;
}

export function ownerFloatBlock(requests: FloatRequest[], ownerId: string): OwnerFloatBlock {
  const blocking = requests.filter(r => r.ownerId === ownerId && isOpenRequest(r));
  const exceptionOn = blocking.find(r => r.requestException) || null;
  return { blocking, exceptionOn, canRequest: blocking.length === 0 || !!exceptionOn };
}

/** The visible float-manager status for a request (one meaning per filter). */
export type FloatViewStatus = 'Pending' | 'Not returned' | 'Returned' | 'Completed' | 'Loan' | 'Rejected';

export function floatViewStatus(r: FloatRequest): FloatViewStatus {
  if (r.loanId) return 'Loan';
  if (r.status === 'Confirmed') return 'Not returned';
  return r.status as FloatViewStatus;
}
