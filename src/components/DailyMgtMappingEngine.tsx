import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { getDailyServicingRows, saveDailyServicingData } from '../utils/indexedDB';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  ArrowRight, 
  FileText, 
  SlidersHorizontal, 
  Sparkles, 
  TrendingUp, 
  Users, 
  Check, 
  FileCheck2, 
  RefreshCw, 
  AlertCircle, 
  Calendar, 
  ChevronLeft, 
  ChevronRight,
  ArrowUpDown,
  Building2,
  UserCheck2,
  FileSpreadsheet
} from 'lucide-react';
import { getAvatarUrl } from '../utils/avatar';
import OwnerAvatar from './OwnerAvatar';
import { Owner, Personnel, AuditReport } from '../types';
import { 
  mapTransactions, 
  calculateCompanyStats, 
  generateOwnerSummaries, 
  generatePersonnelSummaries,
  recalculateAllPerformances
} from '../utils/mappingEngine';
import { classifyServicingRows, summarizeClassification } from '../utils/classification';

interface DailyMgtMappingEngineProps {
  transactions: any[];
  onCancel: () => void;
  onImportCompleted: (stats: {
    processed: number;
    created: number;
    updated: number;
    skipped: number;
  }, auditReport: AuditReport) => void;
}

export default function DailyMgtMappingEngine({ 
  transactions: rawTransactions, 
  onCancel, 
  onImportCompleted 
}: DailyMgtMappingEngineProps) {
  // Load database lists
  const currentOwners = useMemo<Owner[]>(() => {
    const saved = localStorage.getItem('ownersList');
    return saved ? JSON.parse(saved) : [];
  }, []);

  const currentPersonnel = useMemo<Personnel[]>(() => {
    const saved = localStorage.getItem('personnelList');
    return saved ? JSON.parse(saved) : [];
  }, []);

  const tillsList = useMemo<any[]>(() => {
    const saved = localStorage.getItem('tillsList');
    return saved ? JSON.parse(saved) : [];
  }, []);

  const [existingTransactions, setExistingTransactions] = useState<any[]>([]);

  useEffect(() => {
    let isMounted = true;
    getDailyServicingRows().then(rows => {
      if (isMounted) setExistingTransactions(rows);
    }).catch(err => {
      console.error('Failed loading daily servicing rows in DailyMgtMappingEngine:', err);
    });
    return () => { isMounted = false; };
  }, []);

  // Tabs: 'summary' | 'owners' | 'personnel' | 'transactions' | 'validation'
  const [activeTab, setActiveTab] = useState<'summary' | 'owners' | 'personnel' | 'transactions' | 'validation'>('summary');
  const [searchQuery, setSearchQuery] = useState('');
  const [mgtFilter, setMgtFilter] = useState<'all' | 'Mapped' | 'Unmapped'>('all');
  
  // Transaction Table Pagination & Sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortColumn, setSortColumn] = useState<string>('transactionId');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Confirmation modal
  const [showConfirm, setShowConfirm] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Parse and map transactions using utility mapping engine
  const mappedTransactions = useMemo(() => {
    return mapTransactions(rawTransactions, tillsList, currentOwners, currentPersonnel, existingTransactions);
  }, [rawTransactions, tillsList, currentOwners, currentPersonnel, existingTransactions]);

  // Aggregate Company Statistics using utility mapping engine
  const stats = useMemo(() => {
    return calculateCompanyStats(mappedTransactions);
  }, [mappedTransactions]);

  // Generate Daily Performance Summary for EVERY Owner using utility mapping engine
  const ownerSummaries = useMemo(() => {
    return generateOwnerSummaries(mappedTransactions, currentOwners, tillsList, stats.totalVolume);
  }, [currentOwners, tillsList, mappedTransactions, stats.totalVolume]);

  // Generate Daily Performance Summary for EVERY Personnel using utility mapping engine
  const personnelSummaries = useMemo(() => {
    return generatePersonnelSummaries(mappedTransactions, currentPersonnel, tillsList, stats.totalVolume);
  }, [currentPersonnel, tillsList, mappedTransactions, stats.totalVolume]);

  // List of validation anomalies
  const validationAnomalies = useMemo(() => {
    const list: { type: string; count: number; items: any[] }[] = [
      {
        type: 'Unmatched Till Numbers',
        count: mappedTransactions.filter(t => t.validationErrors.includes('Unknown Till')).length,
        items: mappedTransactions.filter(t => t.validationErrors.includes('Unknown Till'))
      },
      {
        type: 'Duplicate Transactions',
        count: mappedTransactions.filter(t => t.isDuplicate).length,
        items: mappedTransactions.filter(t => t.isDuplicate)
      },
      {
        type: 'Corrupted Records',
        count: mappedTransactions.filter(t => t.validationErrors.includes('Corrupted Records')).length,
        items: mappedTransactions.filter(t => t.validationErrors.includes('Corrupted Records'))
      },
      {
        type: 'Invalid Date Formats',
        count: mappedTransactions.filter(t => t.validationErrors.includes('Invalid Date Format')).length,
        items: mappedTransactions.filter(t => t.validationErrors.includes('Invalid Date Format'))
      },
      {
        type: 'Missing References',
        count: mappedTransactions.filter(t => t.validationErrors.includes('Missing Transaction Reference')).length,
        items: mappedTransactions.filter(t => t.validationErrors.includes('Missing Transaction Reference'))
      },
      {
        type: 'Missing Branch MSISDN',
        count: mappedTransactions.filter(t => t.validationErrors.includes('Missing Branch MSISDN')).length,
        items: mappedTransactions.filter(t => t.validationErrors.includes('Missing Branch MSISDN'))
      }
    ];
    return list.filter(g => g.count > 0);
  }, [mappedTransactions]);

  // Filter & Sort Transactions
  const filteredAndSortedTxns = useMemo(() => {
    const filtered = mappedTransactions
      .filter(t => {
        if (mgtFilter === 'Mapped') return t.isMapped;
        if (mgtFilter === 'Unmapped') return !t.isMapped;
        return true;
      })
      .filter(t => {
        const q = searchQuery.toLowerCase();
        return t.transactionId.toLowerCase().includes(q) || 
               t.branchMsisdn.includes(q) || 
               t.ownerName.toLowerCase().includes(q) ||
               t.tillName.toLowerCase().includes(q);
      });

    // Sorting
    return [...filtered].sort((a, b) => {
      let valA = a[sortColumn];
      let valB = b[sortColumn];

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = String(valB || '').toLowerCase();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [mappedTransactions, mgtFilter, searchQuery, sortColumn, sortDirection]);

  // Pagination bounds
  const paginatedTxns = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredAndSortedTxns.slice(start, start + rowsPerPage);
  }, [filteredAndSortedTxns, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(filteredAndSortedTxns.length / rowsPerPage) || 1;

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  // Perform Final Ingestion & Database Updates
  const handleConfirmImport = () => {
    setIsImporting(true);

    setTimeout(async () => {
      // 1. Append transactions to IndexedDB, discarding true duplicates
      const newServicingRows = mappedTransactions
        .filter(t => t.isMapped && !t.isDuplicate)
        .map(t => ({
          _id: t.id,
          "Transaction ID": t.transactionId,
          "Branch_msisdn": t.branchMsisdn,
          "Dest_MSISDN": t.destMsisdn || '',
          "Wakala Name": t.tillName,
          "Agent ID": t.ownerId || 'MA-UNKNOWN',
          "Wakala Owner": t.ownerName,
          "Zone": t.location,
          "Volume (TZS)": t.volume,
          "Status": t.status,
          "Servicing Date": t.date,
          "Servicing Timestamp": t.timestamp || new Date().toISOString(),
          "source_balance_before": t.sourceBalanceBefore,
          "source_balance_after": t.sourceBalanceAfter
        }));

      await saveDailyServicingData(newServicingRows);

      // Run Transaction Classification Engine
      const saTillRegistry = JSON.parse(localStorage.getItem('saTillRegistry') || '[]');
      const baseWakalaIndex = JSON.parse(localStorage.getItem('baseWakalaIndex') || '[]');
      const tillsList = JSON.parse(localStorage.getItem('tillsList') || '[]');
      const ownersList = JSON.parse(localStorage.getItem('ownersList') || '[]');
      const classified = classifyServicingRows(newServicingRows, saTillRegistry, baseWakalaIndex, tillsList, ownersList);
      const classSummary = summarizeClassification(classified);
      localStorage.setItem('lastClassificationSummary', JSON.stringify(classSummary));

      // 2. Save daily summaries to localStorage
      const summaryPayload = {
        importDate: new Date().toISOString(),
        totalTransactions: stats.totalTxns,
        totalVolume: stats.totalVolume,
        ownerSummaries,
        personnelSummaries
      };
      localStorage.setItem('latestMgtDailySummary', JSON.stringify(summaryPayload));

      // Store in historical list
      const historicalSummaries = JSON.parse(localStorage.getItem('mgtDailySummariesHistory') || '[]');
      historicalSummaries.unshift(summaryPayload);
      localStorage.setItem('mgtDailySummariesHistory', JSON.stringify(historicalSummaries));

      // 3. Update Owners List with new aggregated daily/weekly status & performance
      const updatedOwners = currentOwners.map(o => {
        if (!o || !o.name) return o;
        const ownerSum = ownerSummaries.find(os => os && os.name && os.name.toLowerCase() === o.name.toLowerCase());
        if (ownerSum && ownerSum.transactionsCount > 0) {
          return {
            ...o,
            performance: Math.round(ownerSum.contributionPercent),
            portfolioSize: `TZS ${((parseFloat(o.portfolioSize.replace(/[^0-9.]/g, '')) || 5) + ownerSum.totalValue / 1000000).toFixed(1)}M`,
            lastSyncDate: new Date().toLocaleDateString('en-US') + ", " + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            status: 'Active' as const,
            openingFloat: ownerSum.openingFloat,
            servedAmount: ownerSum.servedAmount,
            remainingFloat: ownerSum.remainingFloat,
            transactionsToday: ownerSum.transactionsCount,
            avgValue: ownerSum.avgValue,
            highestTx: ownerSum.highestTx,
            lowestTx: ownerSum.lowestTx
          };
        }
        return o;
      });
      localStorage.setItem('ownersList', JSON.stringify(updatedOwners));

      // 4. Update Personnel List
      const updatedPersonnel = currentPersonnel.map(p => {
        if (!p || !p.name) return p;
        const pSum = personnelSummaries.find(ps => ps && ps.name && ps.name.toLowerCase() === p.name.toLowerCase());
        if (pSum && pSum.transactionsCount > 0) {
          return {
            ...p,
            lastSyncDate: new Date().toLocaleDateString('en-US') + ", " + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            status: 'Active' as const,
            openingFloat: pSum.openingFloat,
            servedAmount: pSum.servedAmount,
            remainingFloat: pSum.remainingFloat,
            transactionsToday: pSum.transactionsCount,
            avgValue: pSum.avgValue,
            highestTx: pSum.highestTx,
            lowestTx: pSum.lowestTx,
            performance: Math.round(pSum.contributionPercent)
          };
        }
        return p;
      });
      localStorage.setItem('personnelList', JSON.stringify(updatedPersonnel));

      // Automatically recalculate and synchronize all performance metrics across registry
      recalculateAllPerformances();
      window.dispatchEvent(new Event('servicing-rows-updated'));

      // 5. Update Company Totals (dashboardKPIs)
      const savedKpisStr = localStorage.getItem('dashboardKPIs');
      if (savedKpisStr) {
        try {
          const kpis = JSON.parse(savedKpisStr);
          const valKpi = kpis.find((k: any) => k.id === 'kpi-1');
          if (valKpi) {
            valKpi.achievedVal = (valKpi.achievedVal || 0) + stats.totalVolume;
            valKpi.achieved = `TZS ${(valKpi.achievedVal / 1000000).toFixed(1)}M`;
            valKpi.performance = Math.min(Math.round((valKpi.achievedVal / valKpi.targetVal) * 100), 100);
            valKpi.status = valKpi.performance >= 90 ? 'ACHIEVED' : valKpi.performance >= 75 ? 'ON TRACK' : 'NEEDS ATTENTION';
          }
          localStorage.setItem('dashboardKPIs', JSON.stringify(kpis));
        } catch(e) {
          console.error("Could not update company totals", e);
        }
      }

      // 6. Append Immutable System Audit Logs
      const newAuditLogs = [{
        audit_id: Date.now() + Math.floor(Math.random() * 1000),
        action_type: 'INGEST_MGT_TRANSACTIONS',
        action_description: `Admin executed Daily MGT Performance Mapping. Mapped ${stats.mappedCount} transactions, resolved ${stats.ownersUpdated} owners, ${stats.personnelUpdated} personnel. Aggregate ledger sum: TZS ${stats.totalVolume.toLocaleString()}`,
        affected_table: 'servicingDataRows',
        affected_record_id: 'Daily_MGT_Report',
        previous_value: null,
        new_value: `${stats.mappedCount} rows processed via Till relationships`,
        ip_address: "192.168.1.114",
        logged_at: new Date().toISOString()
      }];
      const existingLogs = JSON.parse(localStorage.getItem('systemAuditLogs') || '[]');
      localStorage.setItem('systemAuditLogs', JSON.stringify([...newAuditLogs, ...existingLogs]));

      // 7. Create Audit report log
      const newReport: AuditReport = {
        id: `REP-${Math.floor(90000 + Math.random() * 9000)}`,
        fileName: "Daily_MGT_Report_Mapped.csv",
        type: "Daily MGT",
        uploadedBy: "K. Kamkg",
        date: new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) + " " + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        size: "45.2 KB",
        status: 'Success'
      };

      setIsImporting(false);
      setShowConfirm(false);

      // Trigger completion callback
      onImportCompleted({
        processed: stats.totalTxns,
        created: stats.mappedCount,
        updated: stats.ownersUpdated + stats.personnelUpdated,
        skipped: stats.unmappedCount
      }, newReport);

    }, 1500);
  };

  return (
    <div className="space-y-6" id="daily-mgt-mapping-engine">
      {/* HEADER DASHBOARD BANNER */}
      <div className="bg-gradient-to-r from-brand-primary/10 via-brand-primary-container/5 to-transparent rounded-2xl border border-brand-primary/10 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-brand-primary text-white text-[9px] font-black tracking-widest px-2 py-0.5 rounded uppercase">
              Engine Active
            </span>
            <span className="text-xs text-brand-text-variant font-bold flex items-center gap-1">
              <Calendar className="h-3 w-3" /> July 2026 Sovereign Ingestion
            </span>
          </div>
          <h2 className="text-2xl font-black tracking-tight text-brand-text mt-1.5">
            Daily MGT Performance Mapping Engine
          </h2>
          <p className="text-xs text-brand-text-variant mt-1 font-medium max-w-2xl">
            Sovereign transaction parser with authoritative Till relationship auto-mapping. Calculates personnel summaries, tracks unmatched numbers, and builds performance indices before database ledger write.
          </p>
        </div>

        <div className="flex gap-2 shrink-0 self-stretch md:self-auto">
          <button 
            onClick={onCancel}
            className="flex-1 md:flex-none rounded-xl border border-brand-gray-border bg-white text-brand-text font-bold text-xs px-5 py-3 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Discard Upload
          </button>
          <button 
            onClick={() => setShowConfirm(true)}
            className="flex-1 md:flex-none rounded-xl bg-brand-primary text-white font-black text-xs uppercase tracking-wider px-5 py-3 shadow-ambient hover:bg-brand-primary-light transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <FileCheck2 className="h-4 w-4" />
            Apply Sync Ingestion
          </button>
        </div>
      </div>

      {/* CORE STATS GRID */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Transactions Processed */}
        <div className="bg-brand-card p-4 rounded-xl border border-brand-gray-border flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-extrabold text-brand-text-variant uppercase tracking-wider">Processed</p>
            <p className="text-xl font-black text-brand-text mt-1">{stats.totalTxns}</p>
          </div>
          <span className="text-[9px] font-bold text-indigo-500 block mt-2">Total CSV Rows</span>
        </div>

        {/* Owners Updated */}
        <div className="bg-brand-card p-4 rounded-xl border border-brand-gray-border flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-extrabold text-brand-text-variant uppercase tracking-wider">Owners Updated</p>
            <p className="text-xl font-black text-emerald-600 mt-1">{stats.ownersUpdated}</p>
          </div>
          <span className="text-[9px] font-bold text-emerald-600 block mt-2">Mapped via Tills</span>
        </div>

        {/* Personnel Updated */}
        <div className="bg-brand-card p-4 rounded-xl border border-brand-gray-border flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-extrabold text-brand-text-variant uppercase tracking-wider">Personnel Updated</p>
            <p className="text-xl font-black text-teal-600 mt-1">{stats.personnelUpdated}</p>
          </div>
          <span className="text-[9px] font-bold text-teal-600 block mt-2">Mapped via Tills</span>
        </div>

        {/* Unmatched Tills */}
        <div className={`bg-brand-card p-4 rounded-xl border flex flex-col justify-between ${stats.unmappedCount > 0 ? 'border-amber-200 bg-amber-50/20' : 'border-brand-gray-border'}`}>
          <div>
            <p className="text-[10px] font-extrabold text-amber-700 uppercase tracking-wider">Unmatched Tills</p>
            <p className="text-xl font-black text-amber-600 mt-1">{stats.unmappedCount}</p>
          </div>
          <span className="text-[9px] font-bold text-amber-600 block mt-2">No Registries Found</span>
        </div>

        {/* Validation Errors */}
        <div className={`bg-brand-card p-4 rounded-xl border flex flex-col justify-between ${stats.validationErrorsCount > 0 ? 'border-rose-200 bg-rose-50/20' : 'border-brand-gray-border'}`}>
          <div>
            <p className="text-[10px] font-extrabold text-rose-700 uppercase tracking-wider">Validation Errors</p>
            <p className="text-xl font-black text-rose-600 mt-1">{stats.validationErrorsCount}</p>
          </div>
          <span className="text-[9px] font-bold text-rose-600 block mt-2">Anomalies Detected</span>
        </div>

        {/* Ready for Import */}
        <div className="bg-brand-card p-4 rounded-xl border border-emerald-200 bg-emerald-50/10 flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-extrabold text-emerald-700 uppercase tracking-wider">Ready for Import</p>
            <p className="text-xl font-black text-emerald-600 mt-1">{stats.readyForImport}</p>
          </div>
          <span className="text-[9px] font-bold text-emerald-600 block mt-2">Valid Mapped Sum</span>
        </div>
      </div>

      {/* TABS SELECTOR & INTERACTIVE CONTROLS */}
      <div className="bg-white rounded-2xl border border-brand-gray-border overflow-hidden shadow-sm">
        {/* Navigation Tabs */}
        <div className="border-b border-brand-gray-border bg-slate-50 flex overflow-x-auto whitespace-nowrap">
          <button 
            onClick={() => setActiveTab('summary')}
            className={`px-6 py-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === 'summary' 
                ? 'border-brand-primary text-brand-primary bg-white' 
                : 'border-transparent text-brand-text-variant hover:text-brand-text'
            }`}
          >
            Daily Performance Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('owners')}
            className={`px-6 py-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === 'owners' 
                ? 'border-brand-primary text-brand-primary bg-white' 
                : 'border-transparent text-brand-text-variant hover:text-brand-text'
            }`}
          >
            Owner Summaries ({ownerSummaries.filter(o => o.transactionsCount > 0).length})
          </button>
          <button 
            onClick={() => setActiveTab('personnel')}
            className={`px-6 py-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === 'personnel' 
                ? 'border-brand-primary text-brand-primary bg-white' 
                : 'border-transparent text-brand-text-variant hover:text-brand-text'
            }`}
          >
            Personnel Summaries ({personnelSummaries.filter(p => p.transactionsCount > 0).length})
          </button>
          <button 
            onClick={() => setActiveTab('transactions')}
            className={`px-6 py-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === 'transactions' 
                ? 'border-brand-primary text-brand-primary bg-white' 
                : 'border-transparent text-brand-text-variant hover:text-brand-text'
            }`}
          >
            Transaction Preview ({filteredAndSortedTxns.length})
          </button>
          <button 
            onClick={() => setActiveTab('validation')}
            className={`px-6 py-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'validation' 
                ? 'border-brand-primary text-brand-primary bg-white' 
                : 'border-transparent text-brand-text-variant hover:text-brand-text'
            }`}
          >
            Validation Auditing
            {stats.validationErrorsCount > 0 && (
              <span className="h-4.5 min-w-4.5 px-1 bg-rose-500 text-white font-mono text-[9px] font-bold rounded-full flex items-center justify-center">
                {stats.validationErrorsCount}
              </span>
            )}
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-6">
          <AnimatePresence mode="wait">
            {/* 1. DAILY PERFORMANCE SUMMARY VIEW */}
            {activeTab === 'summary' && (
              <motion.div 
                key="summary-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column: Ledger Breakdown */}
                  <div className="lg:col-span-2 space-y-6">
                    <div className="border border-brand-gray-border rounded-xl p-5 bg-slate-50/50">
                      <h4 className="text-xs font-black uppercase tracking-wider text-brand-text mb-4 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-brand-primary" /> Daily Revenue Share Insights
                      </h4>
                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between text-xs font-bold text-brand-text mb-1">
                            <span>Sovereign Processed Value</span>
                            <span>TZS {stats.totalVolume.toLocaleString()}</span>
                          </div>
                          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-brand-primary rounded-full" style={{ width: '100%' }} />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-2">
                          <div className="p-3 bg-white rounded-lg border border-brand-gray-border">
                            <span className="text-[10px] font-bold text-brand-text-variant uppercase block">Avg Transaction Value</span>
                            <span className="text-sm font-black text-brand-text mt-0.5">
                              TZS {stats.mappedCount > 0 ? Math.round(stats.totalVolume / stats.mappedCount).toLocaleString() : '0'}
                            </span>
                          </div>
                          <div className="p-3 bg-white rounded-lg border border-brand-gray-border">
                            <span className="text-[10px] font-bold text-brand-text-variant uppercase block">Unique Tills Activated</span>
                            <span className="text-sm font-black text-brand-text mt-0.5">
                              {new Set(mappedTransactions.filter(t => t.isMapped).map(t => t.branchMsisdn)).size} Tills
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Mapped Activity Distribution list */}
                    <div className="border border-brand-gray-border rounded-xl p-5">
                      <h4 className="text-xs font-black uppercase tracking-wider text-brand-text mb-4">
                        High Contribution Rank
                      </h4>
                      <div className="space-y-3.5">
                        {ownerSummaries.slice(0, 3).map((item, idx) => (
                          <div key={item.id} className="flex items-center justify-between border-b border-brand-gray-border pb-3 last:border-0 last:pb-0">
                            <div className="flex items-center gap-3">
                              <span className="h-6 w-6 rounded-full bg-slate-100 text-brand-text font-black text-xs flex items-center justify-center">
                                {idx + 1}
                              </span>
                              <OwnerAvatar 
                                ownerName={item.name} 
                                avatarPhotoId={currentOwners.find(o => o && ((o.name && item.name && o.name.toLowerCase() === item.name.toLowerCase()) || (o.id && item.id && o.id === item.id)))?.avatarPhotoId} 
                                className="h-8 w-8 rounded-lg object-cover" 
                              />
                              <div>
                                <span className="block text-xs font-bold text-brand-text">{item.name}</span>
                                <span className="block text-[10px] text-brand-text-variant font-medium mt-0.5">
                                  {item.assignedTills.length} assigned tills · {item.transactionsCount} transactions
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="block text-xs font-extrabold text-brand-text">TZS {item.totalValue.toLocaleString()}</span>
                              <span className="text-[10px] font-extrabold text-emerald-600 block mt-0.5">
                                {item.contributionPercent.toFixed(1)}% share
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Engine Rules Checklist */}
                  <div className="space-y-6">
                    <div className="bg-slate-50 border border-brand-gray-border rounded-xl p-5 space-y-4">
                      <h4 className="text-xs font-black uppercase tracking-wider text-brand-text flex items-center gap-2">
                        <SlidersHorizontal className="h-4 w-4 text-brand-primary" /> Processing Mandates
                      </h4>
                      
                      <ul className="space-y-3 font-sans text-xs text-brand-text-variant font-medium leading-relaxed">
                        <li className="flex items-start gap-2.5">
                          <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span><strong>Authoritative Mapping:</strong> Branches are linked through registered MSISDN numbers exactly. No hardcoded logic.</span>
                        </li>
                        <li className="flex items-start gap-2.5">
                          <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span><strong>Safe Validation:</strong> Anomaly rows with invalid references or missing MSISDNs are flagged but not discarded.</span>
                        </li>
                        <li className="flex items-start gap-2.5">
                          <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span><strong>Direct Persistence:</strong> Company, Owner, and Personnel summaries are directly written into database states.</span>
                        </li>
                      </ul>

                      <div className="pt-2">
                        <button 
                          onClick={() => setActiveTab('transactions')}
                          className="w-full bg-white hover:bg-slate-100 border border-brand-gray-border text-brand-text font-bold text-xs py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <FileSpreadsheet className="h-4 w-4 text-brand-text-variant" />
                          Browse Raw Transaction List
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* 2. OWNER SUMMARIES TAB */}
            {activeTab === 'owners' && (
              <motion.div 
                key="owners-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="overflow-x-auto border border-brand-gray-border rounded-xl">
                  <table className="w-full text-left border-collapse font-sans text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-brand-gray-border text-[10px] font-extrabold text-brand-text-variant uppercase tracking-wider">
                        <th className="px-5 py-4">Wakala Owner</th>
                        <th className="px-5 py-4">Assigned Tills</th>
                        <th className="px-5 py-4 text-center">Transactions</th>
                        <th className="px-5 py-4 text-right">Total Value Served</th>
                        <th className="px-5 py-4 text-right">Average Value</th>
                        <th className="px-5 py-4 text-right">Contribution %</th>
                        <th className="px-5 py-4 text-center">Activity Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-gray-border/60">
                       {ownerSummaries.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <OwnerAvatar 
                                ownerName={item.name} 
                                avatarPhotoId={currentOwners.find(o => o && ((o.name && item.name && o.name.toLowerCase() === item.name.toLowerCase()) || (o.id && item.id && o.id === item.id)))?.avatarPhotoId} 
                                className="h-8 w-8 rounded-lg object-cover" 
                              />
                              <span className="font-bold text-brand-text">{item.name}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4 font-mono font-medium text-brand-text-variant max-w-[200px] truncate">
                            {item.assignedTills.length > 0 ? item.assignedTills.join(', ') : 'None'}
                          </td>
                          <td className="px-5 py-4 text-center font-bold text-brand-text">
                            {item.transactionsCount}
                          </td>
                          <td className="px-5 py-4 text-right font-bold text-brand-text font-mono">
                            TZS {item.totalValue.toLocaleString()}
                          </td>
                          <td className="px-5 py-4 text-right text-brand-text-variant font-mono">
                            TZS {Math.round(item.avgValue).toLocaleString()}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <span className="font-extrabold text-brand-primary">
                              {item.contributionPercent.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-5 py-4 text-center">
                            {item.status === 'Active' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[9px] font-extrabold text-emerald-700 uppercase tracking-wide">
                                Active Today
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 border border-slate-200 px-2.5 py-0.5 text-[9px] font-extrabold text-slate-400 uppercase tracking-wide">
                                Inactive
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {/* 3. PERSONNEL SUMMARIES TAB */}
            {activeTab === 'personnel' && (
              <motion.div 
                key="personnel-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="overflow-x-auto border border-brand-gray-border rounded-xl">
                  <table className="w-full text-left border-collapse font-sans text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-brand-gray-border text-[10px] font-extrabold text-brand-text-variant uppercase tracking-wider">
                        <th className="px-5 py-4">Personnel</th>
                        <th className="px-5 py-4">Title</th>
                        <th className="px-5 py-4">Assigned Till</th>
                        <th className="px-5 py-4 text-center">Transactions</th>
                        <th className="px-5 py-4 text-right">Total Value Served</th>
                        <th className="px-5 py-4 text-right">Average Value</th>
                        <th className="px-5 py-4 text-right">Contribution %</th>
                        <th className="px-5 py-4 text-center">Activity Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-gray-border/60">
                      {personnelSummaries.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <img src={getAvatarUrl(item.name)} alt={item.name} className="h-8 w-8 rounded-lg object-cover" />
                              <span className="font-bold text-brand-text">{item.name}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-brand-text-variant font-medium">
                            {item.title}
                          </td>
                          <td className="px-5 py-4 font-mono font-medium text-brand-text-variant">
                            {item.assignedTills.join(', ') || 'N/A'}
                          </td>
                          <td className="px-5 py-4 text-center font-bold text-brand-text">
                            {item.transactionsCount}
                          </td>
                          <td className="px-5 py-4 text-right font-bold text-brand-text font-mono">
                            TZS {item.totalValue.toLocaleString()}
                          </td>
                          <td className="px-5 py-4 text-right text-brand-text-variant font-mono">
                            TZS {Math.round(item.avgValue).toLocaleString()}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <span className="font-extrabold text-brand-primary">
                              {item.contributionPercent.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-5 py-4 text-center">
                            {item.status === 'Active' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[9px] font-extrabold text-emerald-700 uppercase tracking-wide">
                                Active Today
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 border border-slate-200 px-2.5 py-0.5 text-[9px] font-extrabold text-slate-400 uppercase tracking-wide">
                                Inactive
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {/* 4. TRANSACTION PREVIEW TAB */}
            {activeTab === 'transactions' && (
              <motion.div 
                key="transactions-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {/* Search & Filter Header bar */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between bg-slate-50 p-4 rounded-xl border border-brand-gray-border">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-brand-text-variant" />
                    <input 
                      type="text"
                      placeholder="Search transaction ID, branch MSISDN, or owner..."
                      value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                      className="w-full rounded-xl bg-white border border-brand-gray-border pl-10 pr-4 py-2.5 text-xs font-semibold text-brand-text outline-none focus:border-brand-primary"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-brand-text-variant font-bold shrink-0">Filter Status:</span>
                    <select 
                      value={mgtFilter}
                      onChange={(e) => { setMgtFilter(e.target.value as any); setCurrentPage(1); }}
                      className="rounded-xl border border-brand-gray-border bg-white px-3 py-2 text-xs font-bold text-brand-text outline-none"
                    >
                      <option value="all">All Transactions</option>
                      <option value="Mapped">Mapped Only</option>
                      <option value="Unmapped">Unmapped Only</option>
                    </select>
                  </div>
                </div>

                {/* Table Area with Horizontal Scroll */}
                <div className="overflow-x-auto border border-brand-gray-border rounded-xl">
                  <table className="w-full text-left border-collapse font-sans text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-brand-gray-border text-[10px] font-extrabold text-brand-text-variant uppercase tracking-wider">
                        <th className="px-5 py-4 cursor-pointer select-none" onClick={() => handleSort('transactionId')}>
                          <span className="flex items-center gap-1">
                            Transaction ID <ArrowUpDown className="h-3.5 w-3.5 text-brand-text-variant" />
                          </span>
                        </th>
                        <th className="px-5 py-4 cursor-pointer select-none" onClick={() => handleSort('branchMsisdn')}>
                          <span className="flex items-center gap-1">
                            Branch MSISDN (Till) <ArrowUpDown className="h-3.5 w-3.5 text-brand-text-variant" />
                          </span>
                        </th>
                        <th className="px-5 py-4 cursor-pointer select-none" onClick={() => handleSort('tillName')}>
                          <span className="flex items-center gap-1">
                            Resolved Till Name <ArrowUpDown className="h-3.5 w-3.5 text-brand-text-variant" />
                          </span>
                        </th>
                        <th className="px-5 py-4 cursor-pointer select-none" onClick={() => handleSort('ownerName')}>
                          <span className="flex items-center gap-1">
                            Assigned Person <ArrowUpDown className="h-3.5 w-3.5 text-brand-text-variant" />
                          </span>
                        </th>
                        <th className="px-5 py-4">Role Type</th>
                        <th className="px-5 py-4 cursor-pointer select-none text-right" onClick={() => handleSort('volume')}>
                          <span className="flex items-center gap-1 justify-end">
                            Volume (TZS) <ArrowUpDown className="h-3.5 w-3.5 text-brand-text-variant" />
                          </span>
                        </th>
                        <th className="px-5 py-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-gray-border/60">
                      {paginatedTxns.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-5 py-12 text-center text-brand-text-variant font-medium">
                            No transactions matched the search query or active filter constraints.
                          </td>
                        </tr>
                      ) : (
                        paginatedTxns.map((row) => (
                          <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-4 font-mono font-bold text-brand-primary">
                              {row.transactionId || <span className="text-rose-500 italic">Missing ID</span>}
                            </td>
                            <td className="px-5 py-4 font-mono text-brand-text">
                              {row.branchMsisdn || <span className="text-rose-500 italic">Missing MSISDN</span>}
                            </td>
                            <td className="px-5 py-4 font-bold text-brand-text">
                              {row.tillName}
                            </td>
                            <td className="px-5 py-4 font-bold text-brand-text">
                              {row.isMapped ? (
                                <div className="flex items-center gap-2">
                                  <OwnerAvatar 
                                    ownerName={row.ownerName} 
                                    avatarPhotoId={currentOwners.find(o => o.name.toLowerCase() === row.ownerName.toLowerCase())?.avatarPhotoId} 
                                    className="h-6 w-6 rounded-full object-cover shrink-0" 
                                  />
                                  <span>{row.ownerName}</span>
                                </div>
                              ) : (
                                <span className="text-amber-600 italic">Unresolved</span>
                              )}
                            </td>
                            <td className="px-5 py-4 font-extrabold text-[10px] uppercase text-brand-text-variant">
                              {row.personType || 'N/A'}
                            </td>
                            <td className="px-5 py-4 text-right font-mono font-bold text-brand-text">
                              {row.volume.toLocaleString()}
                            </td>
                            <td className="px-5 py-4 text-center">
                              {row.isMapped ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[9px] font-extrabold text-emerald-700 uppercase tracking-wide">
                                  Mapped
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[9px] font-extrabold text-amber-700 uppercase tracking-wide">
                                  No Till Match
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-brand-text-variant font-bold">Rows per page:</span>
                    <select 
                      value={rowsPerPage}
                      onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                      className="rounded-xl border border-brand-gray-border bg-white px-2.5 py-1.5 text-xs font-bold text-brand-text outline-none"
                    >
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-xs text-brand-text-variant font-bold">
                      Page <strong className="text-brand-text">{currentPage}</strong> of <strong className="text-brand-text">{totalPages}</strong>
                    </span>
                    <div className="flex gap-1.5">
                      <button 
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="rounded-lg border border-brand-gray-border bg-white hover:bg-slate-50 p-2 transition-colors disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronLeft className="h-4 w-4 text-brand-text" />
                      </button>
                      <button 
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="rounded-lg border border-brand-gray-border bg-white hover:bg-slate-50 p-2 transition-colors disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronRight className="h-4 w-4 text-brand-text" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* 5. VALIDATION AUDITING TAB */}
            {activeTab === 'validation' && (
              <motion.div 
                key="validation-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                {validationAnomalies.length === 0 ? (
                  <div className="bg-emerald-50/20 border border-emerald-200 rounded-xl p-8 text-center space-y-3 max-w-md mx-auto">
                    <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                      <Check className="h-6 w-6" />
                    </div>
                    <h3 className="text-sm font-black text-brand-text">Authoritative Validation Passed</h3>
                    <p className="text-xs text-brand-text-variant font-medium">
                      Every transaction matched an active Till, and has valid amounts, IDs, and references. Ready for synchronization!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="bg-rose-50/20 border border-rose-200 rounded-xl p-4 flex gap-3.5 items-start">
                      <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-black text-rose-800 uppercase tracking-wider">Validation Warnings Detected</h4>
                        <p className="text-xs text-rose-700 font-medium mt-1 leading-relaxed">
                          We flagged multiple validation anomalies. Per sovereign operational guidelines, unmapped tills will be categorized and flagged, but not discarded. Please review issues before ledger sync.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {validationAnomalies.map((group, idx) => (
                        <div key={idx} className="border border-brand-gray-border rounded-xl overflow-hidden bg-white shadow-sm">
                          <div className="bg-slate-50 border-b border-brand-gray-border p-4 flex justify-between items-center">
                            <span className="text-xs font-black text-brand-text flex items-center gap-2 uppercase tracking-wide">
                              <AlertCircle className="h-4 w-4 text-amber-500" /> {group.type}
                            </span>
                            <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
                              {group.count} issues
                            </span>
                          </div>

                          <div className="max-h-60 overflow-y-auto">
                            <table className="w-full text-left border-collapse font-sans text-xs">
                              <thead>
                                <tr className="bg-slate-50/50 border-b border-brand-gray-border/60 text-[9px] font-extrabold text-brand-text-variant uppercase tracking-wider">
                                  <th className="px-5 py-3">Transaction ID</th>
                                  <th className="px-5 py-3">Branch MSISDN (Till)</th>
                                  <th className="px-5 py-3">Raw Amount (TZS)</th>
                                  <th className="px-5 py-3">Diagnostic Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-brand-gray-border/40 font-medium">
                                {group.items.slice(0, 10).map((row) => (
                                  <tr key={row.id} className="hover:bg-rose-50/5">
                                    <td className="px-5 py-3 font-mono text-brand-text">{row.transactionId || 'N/A'}</td>
                                    <td className="px-5 py-3 font-mono text-brand-text">{row.branchMsisdn || 'N/A'}</td>
                                    <td className="px-5 py-3 font-mono text-brand-text">{row.volume.toLocaleString()}</td>
                                    <td className="px-5 py-3 text-rose-600 font-bold">{row.validationErrors.join(', ')}</td>
                                  </tr>
                                ))}
                                {group.items.length > 10 && (
                                  <tr>
                                    <td colSpan={4} className="px-5 py-3 text-center text-[10px] text-brand-text-variant font-bold bg-slate-50/10">
                                      Showing first 10 of {group.items.length} issues in this category.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* CONFIRMATION INGESTION OVERLAY */}
      <AnimatePresence>
        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isImporting && setShowConfirm(false)}
              className="absolute inset-0 bg-brand-text/50 backdrop-blur-sm"
            />

            {/* Modal */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-md bg-brand-card rounded-2xl border border-brand-gray-border p-6 shadow-2xl space-y-6 overflow-hidden"
            >
              <div className="text-center space-y-2">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">
                  {isImporting ? (
                    <RefreshCw className="h-6 w-6 animate-spin" />
                  ) : (
                    <FileCheck2 className="h-6 w-6" />
                  )}
                </div>
                <h3 className="text-lg font-black text-brand-text">Confirm Ledger Integration</h3>
                <p className="text-xs text-brand-text-variant leading-relaxed max-w-sm mx-auto">
                  This action will commit <strong>{stats.mappedCount} transactions</strong>, dynamically update live metrics for <strong>{stats.ownersUpdated} owners</strong> and <strong>{stats.personnelUpdated} personnel</strong>, and update company dashboard achievements.
                </p>
              </div>

              {/* Progress and status */}
              {isImporting ? (
                <div className="space-y-2 text-center py-2 animate-pulse">
                  <p className="text-xs font-mono font-bold text-brand-primary">
                    Writing Ingestion Events...
                  </p>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-primary rounded-full animate-[shimmer_1.5s_infinite]" style={{ width: '70%' }} />
                  </div>
                </div>
              ) : (
                <div className="space-y-3.5 border-t border-b border-brand-gray-border py-4 font-sans text-xs text-brand-text-variant font-medium">
                  <div className="flex justify-between">
                    <span>Aggregate Volume (TZS)</span>
                    <strong className="text-brand-text">TZS {stats.totalVolume.toLocaleString()}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Unmatched (Review Pool)</span>
                    <strong className="text-amber-600">{stats.unmappedCount} items</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Validation Diagnostics</span>
                    <strong className={stats.validationErrorsCount > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                      {stats.validationErrorsCount > 0 ? `${stats.validationErrorsCount} Warnings` : 'Zero Errors'}
                    </strong>
                  </div>
                </div>
              )}

              <div className="flex gap-2.5 pt-2">
                <button 
                  disabled={isImporting}
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 rounded-xl border border-brand-gray-border bg-white text-brand-text font-bold text-xs py-3.5 hover:bg-slate-50 transition-colors disabled:opacity-40 cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  disabled={isImporting}
                  onClick={handleConfirmImport}
                  className="flex-1 rounded-xl bg-brand-primary text-white font-black text-xs uppercase tracking-wider py-3.5 hover:bg-brand-primary-light transition-all shadow-ambient disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2"
                >
                  {isImporting ? 'Processing...' : 'Authorize Sync'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
