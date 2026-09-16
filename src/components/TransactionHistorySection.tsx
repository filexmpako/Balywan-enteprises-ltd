import React, { useState, useEffect, useMemo } from 'react';
import { 
  ChevronDown, 
  ChevronUp, 
  Search, 
  Calendar, 
  X, 
  ArrowUpDown,
  History
} from 'lucide-react';
import { Owner } from '../types';

import { getDailyServicingRows } from '../utils/indexedDB';
import { formatDate as formatDateUtil, formatDateTime as formatDateTimeUtil } from '../utils/dateFormat';
import { resolveOwnerMatch } from '../utils/ownerMatch';

interface TransactionHistorySectionProps {
  localOwner: Owner;
  tillsList: any[];
  ownersList?: Owner[];
}

const cleanMsisdn = (num: string) => {
  const cleaned = num.replace(/\D/g, '');
  return cleaned.slice(-9); // last 9 digits (handles 255... and 0... identically)
};

export default function TransactionHistorySection({ localOwner, tillsList, ownersList = [] }: TransactionHistorySectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [allRows, setAllRows] = useState<any[]>([]);
  
  // Filter and Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  // Load daily servicing rows from IndexedDB
  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        const rows = await getDailyServicingRows();
        if (isMounted) {
          setAllRows(rows);
        }
      } catch (e) {
        console.error('Failed to load daily servicing rows in TransactionHistorySection:', e);
      }
    };

    loadData();

    window.addEventListener('servicing-rows-updated', loadData);
    return () => {
      isMounted = false;
      window.removeEventListener('servicing-rows-updated', loadData);
    };
  }, []);

  // Filter rows belonging to this owner's tills
  const myTransactions = useMemo(() => {
    const searchOwners = ownersList.length > 0 ? ownersList : [localOwner];
    const assignedTills = (tillsList || [])
      .filter((t: any) => {
        if (!t.assignedOwner) return false;
        const match = resolveOwnerMatch(t.assignedOwner, searchOwners, 'Transaction History');
        return match.matchedOwner?.id === localOwner.id;
      })
      .map((t: any) => (t.transactionTill || t.id || '').trim());

    const cleanAssignedTills = assignedTills.map(t => cleanMsisdn(t)).filter(Boolean);

    return allRows.filter((row: any) => {
      const branchMsisdn = String(row['Branch_msisdn'] || row['branch_msisdn'] || '').trim();
      if (!branchMsisdn) return false;
      const cleanBranch = cleanMsisdn(branchMsisdn);
      return assignedTills.includes(branchMsisdn) || (cleanBranch && cleanAssignedTills.includes(cleanBranch));
    });
  }, [allRows, tillsList, localOwner, ownersList]);

  // Sort by Servicing Timestamp descending (most recent first)
  const sortedTransactions = useMemo(() => {
    const txs = [...myTransactions];
    txs.sort((a, b) => {
      const tsA = a['Servicing Timestamp'] || a['servicing_timestamp'] || a['timestamp'] || a['Servicing Date'] || '';
      const tsB = b['Servicing Timestamp'] || b['servicing_timestamp'] || b['timestamp'] || b['Servicing Date'] || '';
      
      const dateA = tsA ? new Date(tsA).getTime() : 0;
      const dateB = tsB ? new Date(tsB).getTime() : 0;
      return dateB - dateA;
    });
    return txs;
  }, [myTransactions]);

  // Apply search and date-range filters
  const filteredTxns = useMemo(() => {
    return sortedTransactions.filter((txn) => {
      // 1. Transaction ID match
      if (searchQuery) {
        const txId = String(txn['Transaction ID'] || txn['transactionId'] || '').toLowerCase();
        if (!txId.includes(searchQuery.toLowerCase())) {
          return false;
        }
      }

      // 2. Date Range match (inclusive)
      const servicingDateStr = txn['Servicing Date'] || txn['date'] || '';
      if (!servicingDateStr) return true;

      let formattedServDate = '';
      try {
        const d = new Date(servicingDateStr);
        if (!isNaN(d.getTime())) {
          formattedServDate = d.toISOString().split('T')[0]; // YYYY-MM-DD
        }
      } catch (e) {
        // Fallback
      }

      if (startDate) {
        if (formattedServDate && formattedServDate < startDate) {
          return false;
        }
      }

      if (endDate) {
        if (formattedServDate && formattedServDate > endDate) {
          return false;
        }
      }

      return true;
    });
  }, [sortedTransactions, searchQuery, startDate, endDate]);

  // Date range covered string calculation (unfiltered rows)
  const dateRangeStr = useMemo(() => {
    if (sortedTransactions.length === 0) return '';
    const newest = sortedTransactions[0];
    const oldest = sortedTransactions[sortedTransactions.length - 1];

    const formatDate = (dateStr: string) => {
      const formatted = formatDateUtil(dateStr);
      return formatted === '—' ? '' : formatted;
    };

    const newestDate = newest['Servicing Date'] || newest['date'] || '';
    const oldestDate = oldest['Servicing Date'] || oldest['date'] || '';

    const formattedNewest = formatDate(newestDate);
    const formattedOldest = formatDate(oldestDate);

    if (formattedNewest && formattedOldest) {
      if (formattedNewest === formattedOldest) {
        return formattedNewest;
      }
      return `${formattedOldest} - ${formattedNewest}`;
    }
    return '';
  }, [sortedTransactions]);

  // Header Summary Line representation
  const summaryLine = useMemo(() => {
    const count = sortedTransactions.length;
    if (count === 0) {
      return 'No transactions recorded for this owner yet';
    }
    return `${count} transaction${count > 1 ? 's' : ''}${dateRangeStr ? ` · ${dateRangeStr}` : ''}`;
  }, [sortedTransactions, dateRangeStr]);

  // Determine if owner has more than one till
  const assignedTillsCount = useMemo(() => {
    return (tillsList || [])
      .filter((t: any) => t.assignedOwner && t.assignedOwner.toLowerCase() === localOwner.name.toLowerCase())
      .length;
  }, [tillsList, localOwner]);

  const hasMultipleTills = assignedTillsCount > 1;

  // Pagination bounds calculation
  const totalPages = Math.ceil(filteredTxns.length / pageSize);
  const paginatedTxns = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredTxns.slice(startIndex, startIndex + pageSize);
  }, [filteredTxns, currentPage]);

  // Reset page index on search/filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, startDate, endDate]);

  const getAmountVal = (row: any) => {
    const val = row['Volume (TZS)'] || row['Volume'] || row['Amount'] || row['value'] || row['volume'] || row['SA_Servicing_Val'] || row['sa_servicing_val'] || 0;
    if (typeof val === 'number') return val;
    const cleaned = String(val).replace(/,/g, '').replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Compute live totals based on filtered transaction set
  const totals = useMemo(() => {
    let received = 0;
    let sent = 0;
    filteredTxns.forEach((txn) => {
      const amt = getAmountVal(txn);
      if (amt > 0) {
        received += amt;
      } else {
        sent += Math.abs(amt);
      }
    });
    return {
      received,
      sent,
      net: received - sent
    };
  }, [filteredTxns]);

  const formatDateTime = (tsStr: string, dateStr: string) => {
    const d = tsStr ? new Date(tsStr) : (dateStr ? new Date(dateStr) : null);
    if (!d || isNaN(d.getTime())) return tsStr || dateStr || '—';
    return formatDateTimeUtil(d);
  };

  return (
    <div className="rounded-2xl border border-brand-gray-border bg-brand-card overflow-hidden shadow-ambient">
      {/* Header Panel (Expandable Trigger) */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between px-6 py-5 cursor-pointer hover:bg-brand-gray-hover/20 select-none transition-all"
        id="transaction-history-header"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary-container/20 text-brand-primary">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-sans text-base font-bold text-brand-text flex items-center gap-2">
              Transaction History
            </h3>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
              <span className="font-sans text-xs text-brand-text-variant">
                {summaryLine}
              </span>
              {sortedTransactions.length > 0 && (
                <>
                  <span className="text-brand-text-variant/40 text-[10px] hidden md:inline">•</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-emerald-50 text-emerald-700 border border-emerald-100">
                    Received: TZS {totals.received.toLocaleString()}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-rose-50 text-rose-700 border border-rose-100">
                    Sent: TZS {totals.sent.toLocaleString()}
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${totals.net >= 0 ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>
                    Net: {totals.net >= 0 ? '+' : '−'}TZS {Math.abs(totals.net).toLocaleString()}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="text-brand-text-variant/70 hover:text-brand-text">
          {isExpanded ? (
            <ChevronUp className="h-5 w-5" />
          ) : (
            <ChevronDown className="h-5 w-5" />
          )}
        </div>
      </div>

      {/* Expanded Table & Filters View */}
      {isExpanded && (
        <div className="border-t border-brand-gray-border" id="transaction-history-expanded-panel">
          {/* Filters Toolbar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 bg-brand-gray-hover/10 border-b border-brand-gray-border">
            <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
              {/* Search Field */}
              <div className="relative min-w-[220px]">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-brand-text-variant/50" />
                <input
                  type="text"
                  placeholder="Search by Transaction ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-9 py-2 text-xs rounded-xl border border-brand-gray-border bg-white text-brand-text placeholder-brand-text-variant/40 focus:outline-none focus:border-brand-primary font-sans"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')} 
                    className="absolute right-3 top-2.5 text-brand-text-variant hover:text-brand-text cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Datepicker Filters */}
              <div className="flex items-center gap-2">
                <span className="font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">From</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-xl border border-brand-gray-border bg-white text-brand-text focus:outline-none focus:border-brand-primary font-sans"
                />
                <span className="font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">To</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-xl border border-brand-gray-border bg-white text-brand-text focus:outline-none focus:border-brand-primary font-sans"
                />
              </div>

              {/* Reset trigger */}
              {(searchQuery || startDate || endDate) && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="px-3.5 py-1.5 font-sans text-xs font-bold text-brand-primary hover:bg-brand-primary-container/20 rounded-xl transition-all cursor-pointer"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* Records Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-brand-gray-border bg-brand-gray-hover/50 font-sans text-[11px] font-bold text-brand-text-variant uppercase tracking-wider">
                  <th className="px-6 py-4">Date & Time</th>
                  {hasMultipleTills && <th className="px-6 py-4">Till MSISDN</th>}
                  <th className="px-6 py-4">Transaction ID</th>
                  <th className="px-6 py-4">Received</th>
                  <th className="px-6 py-4">Sent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-gray-border">
                {filteredTxns.length === 0 ? (
                  <tr>
                    <td colSpan={hasMultipleTills ? 5 : 4} className="px-6 py-12 text-center font-sans text-xs text-brand-text-variant font-semibold">
                      {sortedTransactions.length === 0 
                        ? "No transactions recorded for this owner yet" 
                        : "No transactions matching the filter criteria found"}
                    </td>
                  </tr>
                ) : (
                  paginatedTxns.map((row, index) => {
                    const amount = getAmountVal(row);
                    const txId = row['Transaction ID'] || row['transactionId'] || '—';
                    const tillMsisdn = row['Branch_msisdn'] || row['branch_msisdn'] || '—';
                    const ts = row['Servicing Timestamp'] || '';
                    const sDate = row['Servicing Date'] || '';
                    
                    const isPositive = amount >= 0;
                    const displayAmount = Math.abs(amount).toLocaleString();

                    return (
                      <tr key={`${txId}-${index}`} className="hover:bg-brand-gray-hover/30 transition-colors">
                        <td className="px-6 py-4.5 font-sans text-xs text-brand-text-variant">
                          {formatDateTime(ts, sDate)}
                        </td>
                        {hasMultipleTills && (
                          <td className="px-6 py-4.5 font-mono text-xs font-semibold text-brand-text">
                            {tillMsisdn}
                          </td>
                        )}
                        <td className="px-6 py-4.5 font-mono text-xs font-bold text-brand-primary">
                          {txId}
                        </td>
                        <td className="px-6 py-4.5 font-mono text-xs font-bold text-emerald-600">
                          {isPositive ? `TZS ${displayAmount}` : ''}
                        </td>
                        <td className="px-6 py-4.5 font-mono text-xs font-bold text-rose-600">
                          {!isPositive ? `TZS ${displayAmount}` : ''}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-brand-gray-border bg-brand-gray-hover/10">
              <span className="font-sans text-xs text-brand-text-variant">
                Showing <span className="font-bold text-brand-text">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                <span className="font-bold text-brand-text">
                  {Math.min(currentPage * pageSize, filteredTxns.length)}
                </span>{' '}
                of <span className="font-bold text-brand-text">{filteredTxns.length}</span> transactions
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 font-sans text-xs font-bold text-brand-text bg-white border border-brand-gray-border rounded-lg shadow-sm hover:bg-brand-gray-hover disabled:opacity-50 transition-all cursor-pointer"
                >
                  Previous
                </button>
                <span className="font-sans text-xs text-brand-text-variant">
                  Page <span className="font-bold text-brand-text">{currentPage}</span> of{' '}
                  <span className="font-bold text-brand-text">{totalPages}</span>
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 font-sans text-xs font-bold text-brand-text bg-white border border-brand-gray-border rounded-lg shadow-sm hover:bg-brand-gray-hover disabled:opacity-50 transition-all cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
