import { useState, useEffect, useMemo } from 'react';
import { 
  ChevronDown, 
  ChevronUp, 
  Search, 
  X, 
  History,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight
} from 'lucide-react';
import { Owner } from '../types';

import { getDailyServicingRows } from '../utils/indexedDB';
import { formatDate as formatDateUtil, formatDateTime as formatDateTimeUtil } from '../utils/dateFormat';
import { resolveOwnerMatch } from '../utils/ownerMatch';
import { normalizeMsisdn } from '../utils/msisdn';
import { formatPeriodDisplay } from '../utils/periodUtils';
import { buildCounterpartyLookup, ownerTransactions, type TransactionDirection } from '../utils/ownerTransactions';
import { CLOUD_HYDRATED_EVENT } from '../lib/cloudSyncEvents';

interface TransactionHistorySectionProps {
  localOwner: Owner;
  /** Reporting month shown (the owner page's selected month). */
  period: string;
  tillsList: any[];
  ownersList?: Owner[];
}

const readList = (key: string) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const DIRECTION_STYLE: Record<TransactionDirection, { label: string; badge: string; amount: string; sign: string }> = {
  sent: { label: 'Sent', badge: 'bg-rose-50 text-rose-700 border-rose-100', amount: 'text-rose-600', sign: '−' },
  received: { label: 'Received', badge: 'bg-emerald-50 text-emerald-700 border-emerald-100', amount: 'text-emerald-600', sign: '+' },
  own: { label: 'Own transfer', badge: 'bg-slate-50 text-slate-600 border-slate-200', amount: 'text-brand-text-variant', sign: '' },
};

const DIRECTION_ICON: Record<TransactionDirection, typeof ArrowUpRight> = {
  sent: ArrowUpRight,
  received: ArrowDownLeft,
  own: ArrowLeftRight,
};

export default function TransactionHistorySection({ localOwner, period, tillsList, ownersList = [] }: TransactionHistorySectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [allRows, setAllRows] = useState<any[]>([]);
  const [registries, setRegistries] = useState(() => ({
    saTills: readList('saTillRegistry'),
    baseWakalas: readList('baseWakalaIndex'),
  }));
  
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
        const rows = await getDailyServicingRows(period);
        if (isMounted) {
          setAllRows(rows);
        }
      } catch (e) {
        console.error('Failed to load daily servicing rows in TransactionHistorySection:', e);
      }
    };
    const reloadRegistries = () => {
      setRegistries({ saTills: readList('saTillRegistry'), baseWakalas: readList('baseWakalaIndex') });
      void loadData();
    };

    loadData();

    window.addEventListener('servicing-rows-updated', loadData);
    window.addEventListener(CLOUD_HYDRATED_EVENT, reloadRegistries);
    return () => {
      isMounted = false;
      window.removeEventListener('servicing-rows-updated', loadData);
      window.removeEventListener(CLOUD_HYDRATED_EVENT, reloadRegistries);
    };
  }, [period]);

  // This owner's tills (normalized numbers)
  const ownTills = useMemo(() => {
    const searchOwners = ownersList.length > 0 ? ownersList : [localOwner];
    const set = new Set<string>();
    for (const t of tillsList || []) {
      if (!t?.assignedOwner) continue;
      const match = resolveOwnerMatch(t.assignedOwner, searchOwners, 'Transaction History');
      if (match.matchedOwner?.id !== localOwner.id) continue;
      const key = normalizeMsisdn(t.transactionTill || t.id);
      if (key) set.add(key);
    }
    return set;
  }, [tillsList, localOwner, ownersList]);

  // Every transfer touching those tills: sent from them or received into them,
  // with the other party named from the registries.
  const myTransactions = useMemo(() => {
    const lookup = buildCounterpartyLookup(
      { tills: tillsList || [], owners: ownersList.length > 0 ? ownersList : [localOwner], ...registries },
      ownTills,
    );
    return ownerTransactions(allRows, ownTills, lookup);
  }, [allRows, tillsList, registries, ownTills, ownersList, localOwner]);

  // Sort by Servicing Timestamp descending (most recent first)
  const sortedTransactions = useMemo(() => {
    const time = (r: any) => {
      const ts = r['Servicing Timestamp'] || r['servicing_timestamp'] || r['timestamp'] || r['Servicing Date'] || '';
      return ts ? new Date(ts).getTime() || 0 : 0;
    };
    return [...myTransactions].sort((a, b) => time(b.row) - time(a.row));
  }, [myTransactions]);

  // Apply search and date-range filters
  const filteredTxns = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sortedTransactions.filter(({ row, counterparty }) => {
      // 1. Transaction ID, recipient/sender name or number
      if (q) {
        const haystack = [
          row['Transaction ID'] || row['transactionId'] || '',
          counterparty.name || '',
          counterparty.msisdn,
          counterparty.detail,
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) {
          return false;
        }
      }

      // 2. Date Range match (inclusive)
      const servicingDateStr = row['Servicing Date'] || row['date'] || '';
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
    const newest = sortedTransactions[0].row;
    const oldest = sortedTransactions[sortedTransactions.length - 1].row;

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

  const hasMultipleTills = ownTills.size > 1;

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

  // Compute live totals based on filtered transaction set (own-till moves cancel out)
  const totals = useMemo(() => {
    let received = 0;
    let sent = 0;
    filteredTxns.forEach(({ direction, amount }) => {
      if (direction === 'received') received += amount;
      else if (direction === 'sent') sent += amount;
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
              <span className="font-sans text-xs font-semibold text-brand-text-variant">· {formatPeriodDisplay(period)}</span>
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
                  placeholder="Search by Transaction ID, name or number..."
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
                  <th className="px-6 py-4">Direction</th>
                  <th className="px-6 py-4">Sent To / Received From</th>
                  <th className="px-6 py-4">Transaction ID</th>
                  <th className="px-6 py-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-gray-border">
                {filteredTxns.length === 0 ? (
                  <tr>
                    <td colSpan={hasMultipleTills ? 6 : 5} className="px-6 py-12 text-center font-sans text-xs text-brand-text-variant font-semibold">
                      {sortedTransactions.length === 0 
                        ? "No transactions recorded for this owner yet" 
                        : "No transactions matching the filter criteria found"}
                    </td>
                  </tr>
                ) : (
                  paginatedTxns.map(({ row, direction, amount, tillMsisdn, counterparty }, index) => {
                    const txId = row['Transaction ID'] || row['transactionId'] || '—';
                    const ts = row['Servicing Timestamp'] || '';
                    const sDate = row['Servicing Date'] || '';
                    const style = DIRECTION_STYLE[direction];
                    const Icon = DIRECTION_ICON[direction];

                    return (
                      <tr key={`${txId}-${index}`} className="hover:bg-brand-gray-hover/30 transition-colors">
                        <td className="px-6 py-4.5 font-sans text-xs text-brand-text-variant whitespace-nowrap">
                          {formatDateTime(ts, sDate)}
                        </td>
                        {hasMultipleTills && (
                          <td className="px-6 py-4.5 font-mono text-xs font-semibold text-brand-text">
                            {tillMsisdn}
                          </td>
                        )}
                        <td className="px-6 py-4.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold font-sans whitespace-nowrap ${style.badge}`}>
                            <Icon className="h-3 w-3" />
                            {style.label}
                          </span>
                        </td>
                        <td className="px-6 py-4.5">
                          <div className={`font-sans text-xs font-bold ${counterparty.name ? 'text-brand-text' : 'text-brand-text-variant italic'}`}>
                            {counterparty.name || 'Name not registered'}
                          </div>
                          <div className="font-sans text-[10px] text-brand-text-variant mt-0.5">
                            <span className="font-mono">{counterparty.msisdn || '—'}</span> · {counterparty.detail}
                          </div>
                        </td>
                        <td className="px-6 py-4.5 font-mono text-xs font-bold text-brand-primary">
                          {txId}
                        </td>
                        <td className={`px-6 py-4.5 font-mono text-xs font-bold text-right whitespace-nowrap ${style.amount}`}>
                          {style.sign}TZS {amount.toLocaleString()}
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
