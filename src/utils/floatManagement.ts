import { FloatRequest, FloatReturnEntry, LoanRecord } from '../types';

const STORAGE_KEY = 'floatRequests';

export function getFloatRequests(): FloatRequest[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed: FloatRequest[] = JSON.parse(saved);
    
    // One-time migration: ensure any historical request with loanId set is marked as 'Completed'
    let migrated = false;
    const updated = parsed.map(r => {
      if (r.loanId && r.status !== 'Completed') {
        migrated = true;
        return { ...r, status: 'Completed' as const };
      }
      return r;
    });
    if (migrated) {
      saveAll(updated);
    }
    return updated;
  } catch (e) {
    return [];
  }
}

export function getFloatRequestsForOwner(ownerId: string): FloatRequest[] {
  return getFloatRequests()
    .filter(r => r.ownerId === ownerId)
    .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
}

function saveAll(requests: FloatRequest[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
}

export function createFloatRequest(ownerId: string, requestedAmount: number): FloatRequest {
  const newRequest: FloatRequest = {
    id: `float_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    ownerId,
    requestedAmount,
    requestedAt: new Date().toISOString(),
    status: 'Pending',
  };
  const all = getFloatRequests();
  saveAll([...all, newRequest]);
  return newRequest;
}

export function rejectFloatRequest(requestId: string, managerId: string, managerName: string, reason?: string): void {
  const all = getFloatRequests();
  const updated = all.map(r =>
    r.id === requestId && r.status === 'Pending'
      ? {
          ...r,
          status: 'Rejected' as const,
          requestRejectedAt: new Date().toISOString(),
          requestRejectedByManagerId: managerId,
          requestRejectedByManagerName: managerName,
          requestRejectionReason: reason?.trim() || undefined,
        }
      : r
  );
  saveAll(updated);
}

export function confirmFloatRequest(requestId: string, managerId: string, managerName: string): void {
  const all = getFloatRequests();
  const updated = all.map(r => r.id === requestId
    ? { 
        ...r, 
        status: 'Confirmed' as const, 
        confirmedByManagerId: managerId, 
        confirmedByManagerName: managerName,
        confirmedAt: new Date().toISOString()
      }
    : r
  );
  saveAll(updated);
}

export function getTotalReturned(request: FloatRequest): number {
  return (request.returnEntries || []).reduce((sum, e) => sum + e.amount, 0);
}

export function submitFloatReturn(requestId: string, entries: FloatReturnEntry[], shortfallReason?: string): void {
  const all = getFloatRequests();
  const updated = all.map(r => r.id === requestId
    ? { ...r, status: 'Returned' as const, returnEntries: entries, returnedAt: new Date().toISOString(), shortfallReason }
    : r
  );
  saveAll(updated);
}

export function completeFloatRequest(requestId: string, managerId: string, managerName: string): void {
  const all = getFloatRequests();
  const target = all.find(r => r.id === requestId);
  if (!target || getTotalReturned(target) !== target.requestedAmount) return;
  const updated = all.map(r => r.id === requestId
    ? { ...r, status: 'Completed' as const, confirmedByManagerId: managerId, confirmedByManagerName: managerName }
    : r
  );
  saveAll(updated);
}

export function rejectFloatReturn(requestId: string, managerId: string, managerName: string): void {
  const all = getFloatRequests();
  const updated = all.map(r => {
    if (r.id === requestId && r.status === 'Returned') {
      return {
        ...r,
        status: 'Confirmed' as const,
        returnEntries: undefined,
        returnedAt: undefined,
        shortfallReason: undefined,
        rejectedAt: new Date().toISOString(),
        rejectedByManagerId: managerId,
        rejectedByManagerName: managerName,
      };
    }
    return r;
  });
  saveAll(updated);
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

const LOAN_STORAGE_KEY = 'loanRecords';

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

export function approveLoanForShortfall(requestId: string, managerId: string, managerName: string): void {
  const all = getFloatRequests();
  const target = all.find(r => r.id === requestId);
  if (!target) return;
  const totalReturned = getTotalReturned(target);
  const shortfall = target.requestedAmount - totalReturned;
  if (shortfall <= 0) return; // not actually a shortfall — do nothing

  const loan: LoanRecord = {
    id: `loan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    ownerId: target.ownerId,
    floatRequestId: target.id,
    amount: shortfall,
    reason: target.shortfallReason || '',
    createdAt: new Date().toISOString(),
    approvedByManagerId: managerId,
    approvedByManagerName: managerName,
    status: 'Outstanding',
  };
  const allLoans = getLoanRecords();
  localStorage.setItem(LOAN_STORAGE_KEY, JSON.stringify([...allLoans, loan]));

  const updatedRequests = all.map(r =>
    r.id === requestId ? { ...r, status: 'Completed' as const, loanId: loan.id } : r
  );
  saveAll(updatedRequests);
}

export function submitLoanRepayment(
  loanId: string,
  repaidAmount: number,
  description?: string
): { success: boolean; error?: string } {
  const loans = getLoanRecords();
  const loan = loans.find(l => l.id === loanId);
  if (!loan) return { success: false, error: 'Loan not found.' };
  if (loan.status === 'Paid') return { success: false, error: 'This loan is already marked as paid.' };
  if (repaidAmount > loan.amount && !description?.trim()) {
    return { success: false, error: 'A description is required when repaying more than the outstanding loan amount.' };
  }
  const updated = loans.map(l => l.id === loanId ? {
    ...l,
    status: 'Repayment Submitted' as const,
    repaidAmount,
    repaymentDescription: description?.trim(),
    repaymentSubmittedAt: new Date().toISOString(),
  } : l);
  localStorage.setItem(LOAN_STORAGE_KEY, JSON.stringify(updated));
  return { success: true };
}

export function markLoanPaid(loanId: string, managerId: string, managerName: string): boolean {
  const loans = getLoanRecords();
  const target = loans.find(l => l.id === loanId);
  if (!target || target.status !== 'Repayment Submitted') return false;

  const updated = loans.map(l => l.id === loanId ? {
    ...l,
    status: 'Paid' as const,
    paidAt: new Date().toISOString(),
    markedPaidByManagerId: managerId,
    markedPaidByManagerName: managerName,
  } : l);
  localStorage.setItem(LOAN_STORAGE_KEY, JSON.stringify(updated));
  return true;
}

/** Sends a submitted repayment back to Outstanding for the owner to correct/resubmit. */
export function rejectLoanRepayment(loanId: string, managerId: string, managerName: string): boolean {
  const loans = getLoanRecords();
  const target = loans.find(l => l.id === loanId);
  if (!target || target.status !== 'Repayment Submitted') return false;

  const updated = loans.map(l => l.id === loanId ? {
    ...l,
    status: 'Outstanding' as const,
    repaidAmount: undefined,
    repaymentDescription: undefined,
    repaymentSubmittedAt: undefined,
    repaymentRejectedAt: new Date().toISOString(),
    repaymentRejectedByManagerId: managerId,
    repaymentRejectedByManagerName: managerName,
  } : l);
  localStorage.setItem(LOAN_STORAGE_KEY, JSON.stringify(updated));
  return true;
}

