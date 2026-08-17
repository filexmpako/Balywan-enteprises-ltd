import { Owner } from '../types';
import { resolveOwnerMatch } from './ownerMatch';
import { normalizeMsisdn } from './msisdn';

export type TillOwnerResolutionStatus = 'Matched' | 'UnregisteredTill' | 'UnresolvedOwner';

export interface TillOwnerResolutionResult {
  status: TillOwnerResolutionStatus;
  ownerId?: string;
  ownerName?: string;
  assignedOwnerRaw?: string; // the raw assignedOwner string from tillsList, for display/debugging
}

interface TillLike {
  transactionTill: string;
  assignedOwner: string;
}

/**
 * Resolves an owner from a raw MSISDN by looking it up in the Till Name Sync
 * registry first (never trusting a name typed directly in a target file).
 * Two distinct failure states, reported separately since they need different
 * admin actions:
 *   - UnregisteredTill: the MSISDN isn't in tillsList at all — Till Name
 *     Sync needs to run first, nothing to "resolve" here via alias-linking.
 *   - UnresolvedOwner: the till IS registered, but its assignedOwner string
 *     doesn't match any known Owner — this is exactly what the existing
 *     UnresolvedNamesReview flow already handles.
 */
export function resolveOwnerFromTillMsisdn(
  rawMsisdn: string,
  tillsList: TillLike[],
  owners: Owner[]
): TillOwnerResolutionResult {
  const normalized = normalizeMsisdn(rawMsisdn);
  const till = tillsList.find(t => normalizeMsisdn(t.transactionTill) === normalized);

  if (!till) {
    return { status: 'UnregisteredTill' };
  }

  const ownerMatch = resolveOwnerMatch(till.assignedOwner, owners, 'Monthly Target Upload');
  if (ownerMatch.status === 'Matched' && ownerMatch.matchedOwner) {
    return {
      status: 'Matched',
      ownerId: ownerMatch.matchedOwner.id,
      ownerName: ownerMatch.matchedOwner.name,
      assignedOwnerRaw: till.assignedOwner,
    };
  }

  return { status: 'UnresolvedOwner', assignedOwnerRaw: till.assignedOwner };
}
