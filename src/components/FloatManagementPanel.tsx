import React, { useState, useEffect } from 'react';
import { FloatRequest, FloatReturnEntry, Personnel, LoanRecord } from '../types';
import { formatDate } from '../utils/dateFormat';
import {
  getFloatRequestsForOwner, createFloatRequest, confirmFloatRequest,
  submitFloatReturn, completeFloatRequest, rejectFloatReturn, getPendingDays,
  getResolutionDays, getTotalReturned, approveLoanForShortfall,
  getLoanRecordsForOwner, submitLoanRepayment
} from '../utils/floatManagement';
import { savePhoto, getPhoto } from '../utils/db';
import { Banknote, X, Camera, CheckCircle2, AlertTriangle, Clock, FileText, XCircle, DollarSign, Send, Check } from 'lucide-react';

interface FloatManagementPanelProps {
  ownerId: string;
  isAdmin: boolean;
  embedded?: boolean;
}

interface DraftReturnRow {
  channel: 'CRDB' | 'YAS' | 'NBC' | 'Other';
  channelOther: string;
  amount: string;
  receiptFile: string | null;
}

export default function FloatManagementPanel({ ownerId, isAdmin, embedded = false }: FloatManagementPanelProps) {
  const [requests, setRequests] = useState<FloatRequest[]>(() => getFloatRequestsForOwner(ownerId));
  const [loans, setLoans] = useState<LoanRecord[]>(() => getLoanRecordsForOwner(ownerId));
  const [managers, setManagers] = useState<Personnel[]>([]);
  const [showPanel, setShowPanel] = useState(embedded);
  const [activeFloatTab, setActiveFloatTab] = useState<'request' | 'return' | 'loans'>('request');
  const [amountInput, setAmountInput] = useState('');
  const [shortfallReasonInput, setShortfallReasonInput] = useState('');

  // Loan Repayment Form state
  const [repayingLoan, setRepayingLoan] = useState<LoanRecord | null>(null);
  const [repaymentAmountInput, setRepaymentAmountInput] = useState('');
  const [repaymentDescriptionInput, setRepaymentDescriptionInput] = useState('');
  const [repaymentError, setRepaymentError] = useState('');

  const emptyRow = (): DraftReturnRow => ({ channel: 'CRDB', channelOther: '', amount: '', receiptFile: null });
  const [returnRows, setReturnRows] = useState<DraftReturnRow[]>([emptyRow()]);
  const [returnValidationError, setReturnValidationError] = useState('');

  const [confirmManagerId, setConfirmManagerId] = useState('');
  const [activeConfirmRequestId, setActiveConfirmRequestId] = useState<string | null>(null);
  const [confirmRejectTarget, setConfirmRejectTarget] = useState<{ request: FloatRequest; managerId: string; managerName: string } | null>(null);
  const [receiptPreviews, setReceiptPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    const saved = localStorage.getItem('personnelList');
    const all: Personnel[] = saved ? JSON.parse(saved) : [];
    setManagers(all.filter(p => (p.title || '').toUpperCase() === 'MANAGER'));
  }, []);

  useEffect(() => {
    requests.forEach(async (r) => {
      for (const entry of r.returnEntries || []) {
        if (entry.receiptPhotoId && !receiptPreviews[entry.receiptPhotoId]) {
          try {
            const photo = await getPhoto(entry.receiptPhotoId);
            if (photo?.imageData) {
              setReceiptPreviews(prev => ({ ...prev, [entry.receiptPhotoId!]: photo.imageData }));
            }
          } catch (e) {
            console.error('Failed to load receipt photo', e);
          }
        }
      }
    });
  }, [requests]);

  const refresh = () => {
    setRequests(getFloatRequestsForOwner(ownerId));
    setLoans(getLoanRecordsForOwner(ownerId));
  };

  const pendingRequest = requests.find(r => r.status === 'Pending');
  const confirmedRequest = requests.find(r => r.status === 'Confirmed');
  const hasActiveRequest = requests.some(r => r.status !== 'Completed');
  const unpaidLoans = loans.filter(l => l.status !== 'Paid');

  const handleSubmitRequest = () => {
    const amt = parseFloat(amountInput);
    if (!amt || amt <= 0) return;
    createFloatRequest(ownerId, amt);
    setAmountInput('');
    refresh();
  };

  const handleRowReceiptFile = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setReturnRows(prev => prev.map((row, i) => i === idx ? { ...row, receiptFile: reader.result as string } : row));
    };
    reader.readAsDataURL(file);
  };

  const addReturnRow = () => setReturnRows(prev => [...prev, emptyRow()]);
  const removeReturnRow = (idx: number) => setReturnRows(prev => prev.filter((_, i) => i !== idx));
  const updateReturnRow = (idx: number, patch: Partial<DraftReturnRow>) => {
    setReturnRows(prev => prev.map((row, i) => i === idx ? { ...row, ...patch } : row));
    setReturnValidationError('');
  };

  const returnRowsTotal = returnRows.reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0);

  const returnedRequestTargetId = confirmedRequest?.id;

  const handleSubmitReturn = async () => {
    if (!returnedRequestTargetId) return;

    for (const row of returnRows) {
      const amt = parseFloat(row.amount);
      if (!amt || amt <= 0) {
        setReturnValidationError('Every channel row needs a valid amount greater than 0.');
        return;
      }
      if (row.channel === 'Other' && !row.channelOther.trim()) {
        setReturnValidationError('Please specify the deposit method detail for "Other" rows.');
        return;
      }
    }

    if (returnRowsTotal < (confirmedRequest?.requestedAmount || 0) && shortfallReasonInput.trim() === '') {
      setReturnValidationError('Please explain why this return is short before submitting.');
      return;
    }

    const entries: FloatReturnEntry[] = [];
    for (const row of returnRows) {
      let receiptPhotoId: string | undefined;
      if (row.receiptFile) {
        receiptPhotoId = await savePhoto(ownerId, row.receiptFile, undefined, 'receipt');
      }
      entries.push({
        id: `entry_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        channel: row.channel,
        channelOther: row.channel === 'Other' ? row.channelOther.trim() : undefined,
        amount: parseFloat(row.amount),
        receiptPhotoId,
      });
    }

    submitFloatReturn(
      returnedRequestTargetId,
      entries,
      returnRowsTotal < (confirmedRequest?.requestedAmount || 0) ? shortfallReasonInput.trim() : undefined
    );
    setReturnRows([emptyRow()]);
    setShortfallReasonInput('');
    setReturnValidationError('');
    refresh();
  };

  const handleConfirm = (requestId: string) => {
    setActiveConfirmRequestId(requestId);
  };

  const handleFinalizeConfirm = (asReturn: boolean) => {
    if (!activeConfirmRequestId || !confirmManagerId) return;
    const manager = managers.find(m => m.id === confirmManagerId);
    if (!manager) return;
    if (asReturn) {
      completeFloatRequest(activeConfirmRequestId, manager.id, manager.name);
    } else {
      confirmFloatRequest(activeConfirmRequestId, manager.id, manager.name);
    }
    setActiveConfirmRequestId(null);
    setConfirmManagerId('');
    refresh();
  };

  const handleOpenRepayModal = (loan: LoanRecord) => {
    setRepayingLoan(loan);
    setRepaymentAmountInput(loan.repaidAmount !== undefined ? String(loan.repaidAmount) : String(loan.amount));
    setRepaymentDescriptionInput(loan.repaymentDescription || '');
    setRepaymentError('');
  };

  const handleCloseRepayModal = () => {
    setRepayingLoan(null);
    setRepaymentAmountInput('');
    setRepaymentDescriptionInput('');
    setRepaymentError('');
  };

  const handleSubmitRepaymentAction = () => {
    if (!repayingLoan) return;
    const amt = parseFloat(repaymentAmountInput);
    if (!amt || amt <= 0) {
      setRepaymentError('Please enter a valid repayment amount greater than 0.');
      return;
    }

    if (amt > repayingLoan.amount && !repaymentDescriptionInput.trim()) {
      setRepaymentError('A description is required when repaying more than the outstanding loan amount.');
      return;
    }

    const result = submitLoanRepayment(repayingLoan.id, amt, repaymentDescriptionInput);
    if (!result.success) {
      setRepaymentError(result.error || 'Failed to submit loan repayment.');
      return;
    }

    handleCloseRepayModal();
    refresh();
  };

  const statusBadge = (r: FloatRequest) => {
    if (r.loanId) return <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full border border-indigo-200">Loan Created</span>;
    if (r.status === 'Completed') return <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">Completed</span>;
    if (r.status === 'Returned') {
      const mismatch = getTotalReturned(r) !== r.requestedAmount;
      return mismatch
        ? <span className="text-[10px] font-extrabold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">Amount Mismatch</span>
        : <span className="text-[10px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">Awaiting Final Confirm</span>;
    }
    if (r.status === 'Confirmed') return <span className="text-[10px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">Confirmed</span>;
    return <span className="text-[10px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">Pending</span>;
  };

  return (
    <div className="space-y-3">
      {!showPanel ? (
        <button
          type="button"
          onClick={() => setShowPanel(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-brand-gray-border bg-white px-4 py-2.5 font-sans text-xs font-bold text-brand-primary hover:bg-brand-gray-hover transition-all cursor-pointer"
        >
          <Banknote className="h-4 w-4" />
          Float
        </button>
      ) : (
        <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient space-y-4">
          <div className="flex items-center justify-between border-b border-brand-gray-border pb-3">
            <h4 className="font-sans text-sm font-bold text-brand-text flex items-center gap-1.5">
              <Banknote className="h-4 w-4 text-brand-primary" /> Float Management
            </h4>
            {!embedded && (
              <button onClick={() => setShowPanel(false)} className="text-brand-text-variant hover:text-brand-text cursor-pointer">
                <X className="h-4.5 w-4.5" />
              </button>
            )}
          </div>

          {/* Sub-Tab Navigation Bar */}
          <div className="flex items-center gap-6 border-b border-slate-200 mb-4">
            <button
              onClick={() => setActiveFloatTab('request')}
              className={`pb-2.5 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeFloatTab === 'request'
                  ? 'text-brand-primary border-b-2 border-brand-primary'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Request Float
            </button>

            <button
              onClick={() => setActiveFloatTab('return')}
              className={`pb-2.5 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeFloatTab === 'return'
                  ? 'text-brand-primary border-b-2 border-brand-primary'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Return Float
              {confirmedRequest && (
                <span className="h-2 w-2 rounded-full bg-amber-500 inline-block shrink-0 animate-pulse" title="Active float awaiting return" />
              )}
            </button>

            <button
              onClick={() => setActiveFloatTab('loans')}
              className={`pb-2.5 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeFloatTab === 'loans'
                  ? 'text-brand-primary border-b-2 border-brand-primary'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Loans
              {unpaidLoans.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-700 border border-indigo-200 leading-none">
                  {unpaidLoans.length}
                </span>
              )}
            </button>
          </div>

          {/* TAB 1: Request Float */}
          {activeFloatTab === 'request' && (
            <div className="space-y-4">
              {!hasActiveRequest ? (
                <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div>
                    <label className="text-xs font-bold text-brand-text block mb-1">Requested Amount (TZS)</label>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 500000"
                      value={amountInput}
                      onChange={e => setAmountInput(e.target.value)}
                      className="w-full text-sm rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono focus:outline-none focus:border-brand-primary"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    {amountInput && (
                      <button
                        onClick={() => setAmountInput('')}
                        className="px-4 py-2 text-xs font-bold text-slate-600 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 transition-all cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                    <button
                      onClick={handleSubmitRequest}
                      disabled={!amountInput || parseFloat(amountInput) <= 0}
                      className="flex-1 rounded-lg bg-brand-primary hover:bg-brand-primary-light disabled:opacity-50 text-white text-xs font-bold py-2 transition-all cursor-pointer shadow-xs"
                    >
                      Submit Request
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-3 text-xs">
                  <div className="flex items-start gap-2.5">
                    <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-amber-900">
                        {pendingRequest
                          ? `You have a pending float request of TZS ${pendingRequest.requestedAmount.toLocaleString()} awaiting manager confirmation.`
                          : confirmedRequest
                          ? `You have an active confirmed float of TZS ${confirmedRequest.requestedAmount.toLocaleString()} currently in use.`
                          : `You have an active float request in progress.`}
                      </p>
                      <p className="text-[11px] text-amber-800 mt-1">
                        Only one active float cycle is permitted at a time. Once returned and reconciled, you can request fresh float.
                      </p>
                    </div>
                  </div>
                  {confirmedRequest && (
                    <button
                      onClick={() => setActiveFloatTab('return')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-primary hover:bg-brand-primary-light text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
                    >
                      Go to Return Float
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Return Float & History Ledger */}
          {activeFloatTab === 'return' && (
            <div className="space-y-5">
              {confirmedRequest?.rejectedAt && (
                <div className="flex items-start gap-2 text-xs font-bold text-amber-800 bg-amber-50 p-3 rounded-xl border border-amber-200">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    Previous return was rejected on {formatDate(confirmedRequest.rejectedAt)}{confirmedRequest.rejectedByManagerName ? ` by ${confirmedRequest.rejectedByManagerName}` : ''} — please resubmit correct amount.
                  </div>
                </div>
              )}

              {confirmedRequest ? (
                <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <span className="text-xs font-bold text-slate-700">Active Float Return Form</span>
                    <span className="font-mono font-bold text-xs text-brand-primary">
                      Float: TZS {confirmedRequest.requestedAmount.toLocaleString()}
                    </span>
                  </div>

                  {returnRows.map((row, idx) => (
                    <div key={idx} className="space-y-2 bg-white p-3 rounded-lg border border-slate-200">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-500">Channel {idx + 1}</span>
                        {returnRows.length > 1 && (
                          <button onClick={() => removeReturnRow(idx)} className="text-[11px] text-rose-600 font-bold cursor-pointer">Remove</button>
                        )}
                      </div>
                      <input
                        type="number" min="0" placeholder="Amount (TZS)"
                        value={row.amount}
                        onChange={e => updateReturnRow(idx, { amount: e.target.value })}
                        className="w-full text-sm rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono focus:outline-none focus:border-brand-primary"
                      />
                      <select
                        value={row.channel}
                        onChange={e => updateReturnRow(idx, { channel: e.target.value as DraftReturnRow['channel'], channelOther: '' })}
                        className="w-full text-sm rounded-lg border border-slate-300 bg-white px-3 py-2 focus:outline-none focus:border-brand-primary font-bold"
                      >
                        <option value="CRDB">CRDB</option>
                        <option value="YAS">YAS</option>
                        <option value="NBC">NBC</option>
                        <option value="Other">Other</option>
                      </select>
                      {row.channel === 'Other' && (
                        <input
                          type="text" placeholder="e.g. M-Pesa agent, cash handover"
                          value={row.channelOther}
                          onChange={e => updateReturnRow(idx, { channelOther: e.target.value })}
                          className="w-full text-sm rounded-lg border border-slate-300 bg-white px-3 py-2 focus:outline-none focus:border-brand-primary font-medium"
                        />
                      )}
                      <label className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 cursor-pointer hover:bg-slate-100 transition-all w-fit">
                        <Camera className="h-3.5 w-3.5 text-brand-primary" /> Upload Receipt
                        <input type="file" accept="image/*" onChange={e => handleRowReceiptFile(idx, e)} className="hidden" />
                      </label>
                      {row.receiptFile && <img src={row.receiptFile} alt="Receipt preview" className="h-16 rounded-lg border border-slate-200 object-cover" />}
                    </div>
                  ))}
                  <button onClick={addReturnRow} className="text-xs font-bold text-brand-primary cursor-pointer">+ Add Another Channel</button>
                  <div className="flex items-center justify-between text-xs font-bold pt-1 border-t border-slate-200">
                    <span className="text-slate-600">Total across channels:</span>
                    <span className={returnRowsTotal === confirmedRequest.requestedAmount ? 'text-emerald-700' : 'text-slate-800'}>
                      TZS {returnRowsTotal.toLocaleString()}
                    </span>
                  </div>

                  {returnRowsTotal < confirmedRequest.requestedAmount && returnRowsTotal > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mt-2">
                      <label className="block text-[11px] font-bold text-amber-800 mb-1">
                        This return is short by TZS {(confirmedRequest.requestedAmount - returnRowsTotal).toLocaleString()}. Please explain why:
                      </label>
                      <textarea
                        value={shortfallReasonInput}
                        onChange={e => setShortfallReasonInput(e.target.value)}
                        className="w-full text-xs rounded-lg border border-amber-300 p-2 bg-white focus:outline-none focus:border-amber-500"
                        rows={2}
                        placeholder="e.g. Customer dispute pending, partial theft, cash still in transit..."
                      />
                    </div>
                  )}

                  {returnValidationError && (
                    <p className="text-xs text-rose-600 font-bold">{returnValidationError}</p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button onClick={handleSubmitReturn} className="w-full rounded-lg bg-brand-primary hover:bg-brand-primary-light text-white text-xs font-bold py-2.5 transition-all cursor-pointer shadow-xs">
                      Submit Return
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500 space-y-1">
                  <p className="font-bold text-slate-700">No confirmed float awaiting return</p>
                  <p className="text-[11px]">When a requested float is confirmed by a manager, you can record and submit returned deposits here.</p>
                </div>
              )}

              {/* Float Request & Return History Ledger */}
              <div className="space-y-3 pt-3 border-t border-brand-gray-border">
                <h5 className="font-sans text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider">
                  <FileText className="h-3.5 w-3.5 text-brand-primary" /> Float History & Receipts ({requests.length})
                </h5>

                {requests.length === 0 && <p className="text-xs text-brand-text-variant">No float activity yet.</p>}
                <div className="space-y-2.5">
                  {requests.map(r => (
                    <div key={r.id} className="text-xs bg-slate-50 rounded-xl p-3 space-y-2 border border-slate-200">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-brand-text text-sm">TZS {r.requestedAmount.toLocaleString()}</span>
                        {statusBadge(r)}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
                        <span>Requested: <strong className="text-slate-700">{formatDate(r.requestedAt)}</strong></span>
                        <span>•</span>
                        {r.returnedAt ? (
                          <span>Returned: <strong className="text-slate-700">{formatDate(r.returnedAt)}</strong></span>
                        ) : (
                          <span className="text-amber-600 font-medium">Returned: Not yet returned</span>
                        )}
                        {((r.status === 'Pending' || r.status === 'Confirmed') && !r.loanId) ? (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1 text-slate-700 font-bold">
                              <Clock className="h-3 w-3 text-amber-500" /> {getPendingDays(r)} day(s) pending
                            </span>
                          </>
                        ) : (
                          getResolutionDays(r) !== null ? (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1 text-slate-700 font-bold">
                                <Clock className="h-3 w-3 text-emerald-600" /> Resolved in {getResolutionDays(r)} day(s)
                              </span>
                            </>
                          ) : null
                        )}
                      </div>

                      {r.returnEntries && r.returnEntries.length > 0 && (
                        <div className="pt-1 border-t border-slate-200/80 space-y-2">
                          {r.returnEntries.map(entry => (
                            <div key={entry.id} className="space-y-1">
                              <div className="flex items-center justify-between font-mono text-[11px]">
                                <span className="text-slate-600">TZS {entry.amount.toLocaleString()}</span>
                                <span className="font-bold text-brand-primary">
                                  Via {entry.channel === 'Other' ? (entry.channelOther || 'Other') : entry.channel}
                                </span>
                              </div>
                              {entry.receiptPhotoId && receiptPreviews[entry.receiptPhotoId] && (
                                <img src={receiptPreviews[entry.receiptPhotoId]} alt="Receipt" className="h-20 rounded-lg border border-slate-300 object-cover shadow-xs" />
                              )}
                            </div>
                          ))}
                          <div className="flex items-center justify-between font-mono text-[11px] font-bold pt-1 border-t border-slate-200">
                            <span className="text-slate-700">Total Returned:</span>
                            <span>TZS {getTotalReturned(r).toLocaleString()}</span>
                          </div>
                        </div>
                      )}

                      {r.status === 'Returned' && getTotalReturned(r) !== r.requestedAmount && (
                        <div className="flex items-center gap-1 text-[11px] text-rose-600 font-bold bg-rose-50 p-2 rounded-lg border border-rose-200">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          <span>Requested TZS {r.requestedAmount.toLocaleString()} ≠ Returned TZS {getTotalReturned(r).toLocaleString()}</span>
                        </div>
                      )}

                      {r.status === 'Returned' && getTotalReturned(r) < r.requestedAmount && r.shortfallReason && !r.loanId && (
                        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2 text-[11px]">
                          <p className="font-bold text-indigo-800 mb-0.5">Owner's reason for shortfall:</p>
                          <p className="text-indigo-700 italic">"{r.shortfallReason}"</p>
                        </div>
                      )}

                      {r.rejectedAt && (
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                          <span>Previous return was rejected on {formatDate(r.rejectedAt)}{r.rejectedByManagerName ? ` by ${r.rejectedByManagerName}` : ''} — please resubmit</span>
                        </div>
                      )}

                      {r.confirmedByManagerName && (
                        <p className="text-[11px] text-slate-500 font-medium">Confirmed by Manager: <strong className="text-slate-700">{r.confirmedByManagerName}</strong></p>
                      )}

                      {isAdmin && r.status === 'Pending' && (
                        activeConfirmRequestId === r.id ? (
                          <div className="flex items-center gap-1.5 mt-2 bg-white p-2 rounded-lg border border-slate-200">
                            <select
                              value={confirmManagerId}
                              onChange={e => setConfirmManagerId(e.target.value)}
                              className="text-[11px] rounded-lg border border-slate-300 px-2 py-1 flex-1 font-bold"
                            >
                              <option value="">Select Manager...</option>
                              {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                            <button
                              onClick={() => handleFinalizeConfirm(false)}
                              disabled={!confirmManagerId}
                              className="text-[11px] font-bold text-white bg-brand-primary disabled:opacity-40 px-3 py-1 rounded-lg cursor-pointer transition-all"
                            >
                              Confirm
                            </button>
                          </div>
                        ) : (
                          managers.length === 0 ? (
                            <p className="text-[11px] text-rose-600 font-bold bg-rose-50 p-2 rounded-lg border border-rose-200 mt-1">
                              No Manager registered — add one under People Management → Personnel first.
                            </p>
                          ) : (
                            <button
                              onClick={() => handleConfirm(r.id)}
                              className="mt-1 text-[11px] font-bold text-brand-primary bg-brand-primary/10 hover:bg-brand-primary/20 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                            >
                              Confirm Request
                            </button>
                          )
                        )
                      )}

                      {isAdmin && r.status === 'Returned' && !r.loanId && getTotalReturned(r) === r.requestedAmount && (
                        activeConfirmRequestId === r.id ? (
                          <div className="flex items-center gap-1.5 mt-2 bg-white p-2 rounded-lg border border-slate-200">
                            <select
                              value={confirmManagerId}
                              onChange={e => setConfirmManagerId(e.target.value)}
                              className="text-[11px] rounded-lg border border-slate-300 px-2 py-1 flex-1 font-bold"
                            >
                              <option value="">Select Manager...</option>
                              {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                            <button
                              onClick={() => handleFinalizeConfirm(true)}
                              disabled={!confirmManagerId}
                              className="text-[11px] font-bold text-white bg-emerald-600 disabled:opacity-40 px-3 py-1 rounded-lg cursor-pointer transition-all"
                            >
                              Complete
                            </button>
                          </div>
                        ) : (
                          managers.length === 0 ? (
                            <p className="text-[11px] text-rose-600 font-bold bg-rose-50 p-2 rounded-lg border border-rose-200 mt-1">
                              No Manager registered — add one under People Management → Personnel first.
                            </p>
                          ) : (
                            <button
                              onClick={() => handleConfirm(r.id)}
                              className="mt-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 transition-all cursor-pointer inline-flex items-center gap-1"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> Confirm Return & Complete
                            </button>
                          )
                        )
                      )}

                      {isAdmin && r.status === 'Returned' && !r.loanId && getTotalReturned(r) !== r.requestedAmount && (
                        activeConfirmRequestId === r.id ? (
                          <div className="flex flex-wrap items-center gap-1.5 mt-2 bg-white p-2 rounded-lg border border-slate-200">
                            <select
                              value={confirmManagerId}
                              onChange={e => setConfirmManagerId(e.target.value)}
                              className="text-[11px] rounded-lg border border-slate-300 px-2 py-1 flex-1 font-bold min-w-[140px]"
                            >
                              <option value="">Select Manager...</option>
                              {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                            {getTotalReturned(r) < r.requestedAmount && r.shortfallReason && (
                              <button
                                onClick={() => {
                                  if (!confirmManagerId) return;
                                  approveLoanForShortfall(r.id, confirmManagerId, managers.find(m => m.id === confirmManagerId)?.name || 'Manager');
                                  setActiveConfirmRequestId(null);
                                  setConfirmManagerId('');
                                  refresh();
                                }}
                                disabled={!confirmManagerId}
                                className="text-[11px] font-bold text-white bg-indigo-600 disabled:opacity-40 px-3 py-1 rounded-lg cursor-pointer transition-all"
                              >
                                Agree — Create Loan
                              </button>
                            )}
                            <button
                              onClick={() => {
                                if (!confirmManagerId) return;
                                const manager = managers.find(m => m.id === confirmManagerId);
                                if (manager) {
                                  setConfirmRejectTarget({ request: r, managerId: manager.id, managerName: manager.name });
                                }
                              }}
                              disabled={!confirmManagerId}
                              className="text-[11px] font-bold text-white bg-rose-600 disabled:opacity-40 px-3 py-1 rounded-lg cursor-pointer transition-all"
                            >
                              Reject Return
                            </button>
                          </div>
                        ) : (
                          managers.length === 0 ? (
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <button
                                onClick={() => {
                                  setConfirmRejectTarget({ request: r, managerId: 'admin', managerName: 'System Admin' });
                                }}
                                className="text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg border border-rose-200 transition-all cursor-pointer inline-flex items-center gap-1"
                              >
                                <XCircle className="h-3.5 w-3.5" /> Reject & Request Resubmission
                              </button>
                              {getTotalReturned(r) < r.requestedAmount && r.shortfallReason && (
                                <button
                                  onClick={() => {
                                    approveLoanForShortfall(r.id, 'admin', 'System Admin');
                                    refresh();
                                  }}
                                  className="text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-200 transition-all cursor-pointer inline-flex items-center gap-1"
                                >
                                  Agree — Create Loan
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <button
                                onClick={() => handleConfirm(r.id)}
                                className="text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg border border-rose-200 transition-all cursor-pointer inline-flex items-center gap-1"
                              >
                                <XCircle className="h-3.5 w-3.5" /> Reject & Request Resubmission
                              </button>
                              {getTotalReturned(r) < r.requestedAmount && r.shortfallReason && (
                                <button
                                  onClick={() => handleConfirm(r.id)}
                                  className="text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-200 transition-all cursor-pointer inline-flex items-center gap-1"
                                >
                                  Agree — Create Loan
                                </button>
                              )}
                            </div>
                          )
                        )
                      )}

                      {r.loanId && (
                        <div className="mt-1">
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full border border-indigo-200">
                            Loan Created
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Outstanding Loans */}
          {activeFloatTab === 'loans' && (
            <div className="space-y-4">
              {unpaidLoans.length === 0 ? (
                <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500 space-y-1">
                  <p className="font-bold text-slate-700">No outstanding loans</p>
                  <p className="text-[11px]">All past shortfall loans have been fully repaid and verified.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <h5 className="font-sans text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider">
                      <DollarSign className="h-3.5 w-3.5 text-indigo-600" /> Active Loans ({unpaidLoans.length})
                    </h5>
                    <span className="text-[11px] font-black text-indigo-700">
                      Total: TZS {unpaidLoans.reduce((sum, l) => sum + l.amount, 0).toLocaleString()}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {unpaidLoans.map(loan => {
                      const isSubmitted = loan.status === 'Repayment Submitted';
                      return (
                        <div key={loan.id} className="text-xs bg-indigo-50/50 rounded-xl p-3.5 space-y-2.5 border border-indigo-100">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-black text-indigo-900 text-sm">
                                TZS {loan.amount.toLocaleString()}
                              </span>
                              {isSubmitted ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                  <Clock className="h-3 w-3 text-amber-600" /> Repayment Submitted
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                                  <Clock className="h-3 w-3 text-rose-500" /> Outstanding
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => handleOpenRepayModal(loan)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors cursor-pointer shadow-xs"
                            >
                              <Send className="h-3 w-3" />
                              {isSubmitted ? 'Update Repayment' : 'Submit Repayment'}
                            </button>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
                            <span>Created: <strong className="text-slate-700">{formatDate(loan.createdAt)}</strong></span>
                            <span>•</span>
                            <span>Approved by: <strong className="text-slate-700">{loan.approvedByManagerName || 'System Admin'}</strong></span>
                          </div>

                          {loan.reason && (
                            <div className="text-[11px] text-slate-600 italic bg-white/80 rounded-lg p-2 border border-indigo-100">
                              Shortfall Reason: "{loan.reason}"
                            </div>
                          )}

                          {isSubmitted && (
                            <div className="bg-amber-50/90 border border-amber-200 rounded-lg p-2.5 space-y-1 text-[11px]">
                              <div className="flex items-center justify-between font-medium">
                                <span className="text-amber-900 font-bold">Repayment Pending Confirmation:</span>
                                <span className="font-mono font-bold text-amber-800">
                                  TZS {(loan.repaidAmount ?? loan.amount).toLocaleString()}
                                </span>
                              </div>
                              {loan.repaymentDescription && (
                                <p className="text-slate-600 italic">
                                  Note: "{loan.repaymentDescription}"
                                </p>
                              )}
                              <p className="text-[10px] text-amber-700 font-medium">
                                Submitted {loan.repaymentSubmittedAt ? formatDate(loan.repaymentSubmittedAt) : ''} — awaiting Float Manager to confirm and mark paid.
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Reject Confirmation Modal */}
      {confirmRejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="font-bold text-base text-brand-text">Reject This Return?</h3>
            <p className="text-sm text-brand-text-variant">
              This will clear the submitted return of TZS {getTotalReturned(confirmRejectTarget.request).toLocaleString()} and ask the owner to resubmit the correct amount. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmRejectTarget(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-xs text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  rejectFloatReturn(
                    confirmRejectTarget.request.id,
                    confirmRejectTarget.managerId,
                    confirmRejectTarget.managerName
                  );
                  setConfirmRejectTarget(null);
                  setActiveConfirmRequestId(null);
                  setConfirmManagerId('');
                  refresh();
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 font-bold text-xs text-white cursor-pointer"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Loan Repayment Modal */}
      {repayingLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-brand-gray-border">
              <h3 className="font-bold text-base text-brand-text flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-indigo-600" />
                Submit Loan Repayment
              </h3>
              <button
                onClick={handleCloseRepayModal}
                className="rounded-full p-1 hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl space-y-1 text-xs">
              <div className="flex justify-between font-bold">
                <span className="text-slate-600">Outstanding Loan Balance:</span>
                <span className="text-indigo-900 font-mono">TZS {repayingLoan.amount.toLocaleString()}</span>
              </div>
              {repayingLoan.reason && (
                <p className="text-[11px] text-slate-600 italic">
                  Origin shortfall: "{repayingLoan.reason}"
                </p>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-brand-text mb-1">
                  Repayment Amount (TZS) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 50000"
                  value={repaymentAmountInput}
                  onChange={e => {
                    setRepaymentAmountInput(e.target.value);
                    setRepaymentError('');
                  }}
                  className="w-full text-sm rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono focus:outline-none focus:border-brand-primary"
                />
              </div>

              {parseFloat(repaymentAmountInput) > repayingLoan.amount && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-[11px] font-bold text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    <span>Overpayment detected (+TZS {(parseFloat(repaymentAmountInput) - repayingLoan.amount).toLocaleString()})</span>
                  </div>
                  <label className="block text-xs font-bold text-brand-text">
                    Explanation / Description <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={repaymentDescriptionInput}
                    onChange={e => {
                      setRepaymentDescriptionInput(e.target.value);
                      setRepaymentError('');
                    }}
                    placeholder="Describe reason for overpayment (e.g. advance interest, excess balance settlement, fee reconciliation)..."
                    className="w-full text-xs rounded-xl border border-amber-300 bg-amber-50/40 p-2.5 focus:outline-none focus:border-brand-primary"
                  />
                  <p className="text-[10px] text-slate-500">
                    A description is required whenever repaying more than the outstanding loan balance.
                  </p>
                </div>
              )}

              {parseFloat(repaymentAmountInput) <= repayingLoan.amount && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Description / Note <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={repaymentDescriptionInput}
                    onChange={e => {
                      setRepaymentDescriptionInput(e.target.value);
                      setRepaymentError('');
                    }}
                    placeholder="Optional note for Float Manager..."
                    className="w-full text-xs rounded-xl border border-slate-300 bg-white p-2.5 focus:outline-none focus:border-brand-primary"
                  />
                </div>
              )}

              {repaymentError && (
                <p className="text-xs text-rose-600 font-bold bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                  {repaymentError}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-brand-gray-border">
              <button
                type="button"
                onClick={handleCloseRepayModal}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-xs text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitRepaymentAction}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold text-xs text-white cursor-pointer shadow-xs"
              >
                Submit Repayment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
