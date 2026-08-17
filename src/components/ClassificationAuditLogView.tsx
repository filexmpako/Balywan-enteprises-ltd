import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  ShieldCheck, 
  Search, 
  Filter, 
  Download, 
  RefreshCw, 
  Layers, 
  ArrowUpRight, 
  CheckCircle2, 
  AlertCircle, 
  HelpCircle, 
  Building2, 
  Phone, 
  Tag, 
  Clock, 
  FileText
} from 'lucide-react';
import { ClassificationAuditRecord, ClassificationBucket } from '../types/classificationAudit';
import PageHeaderBanner from './PageHeaderBanner';
import { useCompany } from './CompanyContext';
import { useReportingPeriod } from './ReportingPeriodContext';
import { getClassificationAuditLogs, clearClassificationAuditLogs, saveClassificationAuditRecords } from '../utils/indexedDB';

const PAGE_SIZE = 25;

export default function ClassificationAuditLogView() {
  const { companyName } = useCompany();
  const { displayPeriod } = useReportingPeriod();

  // Load audit records from IndexedDB
  const [auditLogs, setAuditLogs] = useState<ClassificationAuditRecord[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);

  const loadAuditLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const logs = await getClassificationAuditLogs();
      setAuditLogs(logs);
    } catch (e) {
      console.error('Failed to load classification audit logs:', e);
      setAuditLogs([]);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    loadAuditLogs();
  }, []);

  // Filters & State
  const [searchQuery, setSearchQuery] = useState('');
  const [bucketFilter, setBucketFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);

  // Sync / Refresh
  const handleRefresh = () => {
    loadAuditLogs();
  };

  // Clear logs
  const handleClearLogs = async () => {
    if (confirm('Clear stored classification audit log history?')) {
      await clearClassificationAuditLogs();
      setAuditLogs([]);
    }
  };

  // Seed sample logs if empty
  const handleSeedSample = async () => {
    const sample = getMockAuditLogs();
    await saveClassificationAuditRecords(sample);
    setAuditLogs(sample);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (auditLogs.length === 0) return;

    const headers = ['ID', 'Transaction ID', 'Timestamp', 'Raw MSISDN', 'Normalized MSISDN', 'Serviced Value (TZS)', 'Owner ID', 'Matched Entity Type', 'Matched Entity ID', 'Bucket', 'Rule Triggered'];
    const csvRows = auditLogs.map(log => [
      log.id,
      log.transactionId,
      log.timestamp,
      log.rawMsisdn,
      log.normalizedMsisdn,
      log.amount,
      log.ownerId,
      log.matchedEntityType || 'NONE',
      log.matchedEntityId || 'N/A',
      log.classificationBucket,
      `"${log.ruleTriggered.replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...csvRows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Classification_Audit_Log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Summary Metrics
  const metrics = useMemo(() => {
    const stats = {
      totalCount: auditLogs.length,
      totalVolume: 0,
      SA_INTERNAL: { count: 0, volume: 0 },
      BASE: { count: 0, volume: 0 },
      IOP: { count: 0, volume: 0 }
    };

    auditLogs.forEach(log => {
      const amt = Number(log.amount) || 0;
      stats.totalVolume += amt;
      if (stats[log.classificationBucket]) {
        stats[log.classificationBucket].count += 1;
        stats[log.classificationBucket].volume += amt;
      }
    });

    return stats;
  }, [auditLogs]);

  // Filtered dataset
  const filteredLogs = useMemo(() => {
    return auditLogs.filter(log => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hit =
          log.transactionId.toLowerCase().includes(q) ||
          log.rawMsisdn.includes(q) ||
          log.normalizedMsisdn.includes(q) ||
          log.ownerId.toLowerCase().includes(q) ||
          log.ruleTriggered.toLowerCase().includes(q) ||
          (log.matchedEntityId && log.matchedEntityId.toLowerCase().includes(q));
        if (!hit) return false;
      }

      if (bucketFilter !== 'ALL' && log.classificationBucket !== bucketFilter) {
        return false;
      }

      if (typeFilter !== 'ALL' && (log.matchedEntityType || 'NONE') !== typeFilter) {
        return false;
      }

      return true;
    });
  }, [auditLogs, searchQuery, bucketFilter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = filteredLogs.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8 font-sans">
      
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <PageHeaderBanner
          icon={ShieldCheck}
          title="Classification Audit Log"
          subtitle={`Immutable 3-tier lookup chain audit trail & serviced value validation for ${companyName} • Period: ${displayPeriod}.`}
        />

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-xs cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Sync Audit Logs</span>
          </button>

          <button
            onClick={handleExportCSV}
            disabled={auditLogs.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-brand-primary hover:bg-brand-primary-light disabled:opacity-40 rounded-xl shadow-xs cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV Audit Report</span>
          </button>
        </div>
      </div>

      {/* CONTENT WITH LOADING STATE */}
      {isLoadingLogs ? (
        <div className="text-center py-12 text-sm font-bold text-slate-400">Loading audit logs…</div>
      ) : (
        <>
          {/* METRICS DASHBOARD */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Audit Logs */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Total Audited Txns</span>
            <FileText className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-slate-900">{metrics.totalCount.toLocaleString()}</span>
            <span className="block text-[11px] text-slate-500 font-medium mt-0.5">
              TZS {metrics.totalVolume.toLocaleString()}
            </span>
          </div>
        </div>

        {/* SA INTERNAL */}
        <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-800">
            <span className="text-xs font-bold uppercase tracking-wider">SA Internal</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-200 text-emerald-900">
              Tier 1
            </span>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-emerald-950">{metrics.SA_INTERNAL.count.toLocaleString()}</span>
            <span className="block text-[11px] text-emerald-800 font-semibold mt-0.5">
              TZS {metrics.SA_INTERNAL.volume.toLocaleString()}
            </span>
          </div>
        </div>

        {/* BASE */}
        <div className="bg-blue-50/70 p-3.5 rounded-2xl border border-blue-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-blue-800">
            <span className="text-xs font-bold uppercase tracking-wider">Base Wakala</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-200 text-blue-900">
              Tier 2
            </span>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-blue-950">{metrics.BASE.count.toLocaleString()}</span>
            <span className="block text-[11px] text-blue-800 font-semibold mt-0.5">
              TZS {metrics.BASE.volume.toLocaleString()}
            </span>
          </div>
        </div>

        {/* IOP */}
        <div className="bg-purple-50/70 p-3.5 rounded-2xl border border-purple-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-purple-800">
            <span className="text-xs font-bold uppercase tracking-wider">IOP (Unmatched)</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-200 text-purple-900">
              Fallback
            </span>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-purple-950">{metrics.IOP.count.toLocaleString()}</span>
            <span className="block text-[11px] text-purple-800 font-semibold mt-0.5">
              TZS {metrics.IOP.volume.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* SEARCH & FILTER BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap gap-3 items-center justify-between">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            placeholder="Search Tx ID, MSISDN, Owner ID, Rule..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-brand-primary transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Classification Bucket Filter */}
          <select
            value={bucketFilter}
            onChange={(e) => { setBucketFilter(e.target.value); setPage(1); }}
            className="text-xs rounded-xl border border-slate-200 px-3 py-2 bg-slate-50 font-medium focus:outline-none focus:border-brand-primary"
          >
            <option value="ALL">All Classification Buckets</option>
            <option value="SA_INTERNAL">SA_INTERNAL</option>
            <option value="BASE">BASE</option>
            <option value="IOP">IOP</option>
          </select>

          {/* Matched Entity Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="text-xs rounded-xl border border-slate-200 px-3 py-2 bg-slate-50 font-medium focus:outline-none focus:border-brand-primary"
          >
            <option value="ALL">All Entity Types</option>
            <option value="SA_TILL">SA_TILL</option>
            <option value="BASE_WAKALA">BASE_WAKALA</option>
            <option value="NONE">NONE (Unmatched)</option>
          </select>
        </div>
      </div>

      {/* AUDIT LOG TABLE */}
      {pageItems.length > 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Timestamp / Tx ID</th>
                  <th className="px-4 py-3">Dest MSISDN</th>
                  <th className="px-4 py-3">Raw Serviced Value</th>
                  <th className="px-4 py-3">Owner Attributed</th>
                  <th className="px-4 py-3">Matched Entity</th>
                  <th className="px-4 py-3">Classification Bucket</th>
                  <th className="px-4 py-3">Rule Triggered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageItems.map((log, index) => {
                  const bucketBadgeStyle = 
                    log.classificationBucket === 'SA_INTERNAL'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : log.classificationBucket === 'BASE'
                      ? 'bg-blue-100 text-blue-800 border-blue-300'
                      : 'bg-purple-100 text-purple-800 border-purple-300';

                  return (
                    <motion.tr 
                      key={log.id} 
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, delay: Math.min(index * 0.015, 0.2) }}
                      className="hover:bg-slate-100/80 cursor-pointer transition-colors duration-150"
                    >
                      <td className="px-4 py-3">
                        <div className="font-mono font-bold text-slate-900">{log.transactionId}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {log.timestamp}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-mono font-bold text-slate-800">{log.normalizedMsisdn || log.rawMsisdn}</div>
                        {log.rawMsisdn !== log.normalizedMsisdn && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            Raw: {log.rawMsisdn}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span className="font-mono font-extrabold text-slate-900">
                          TZS {Number(log.amount).toLocaleString()}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-700">
                          {log.ownerId || 'UNASSIGNED'}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        {log.matchedEntityType === 'SA_TILL' && (
                          <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px]">
                            <Building2 className="h-3 w-3" /> SA Till {log.matchedEntityId ? `(${log.matchedEntityId})` : ''}
                          </span>
                        )}
                        {log.matchedEntityType === 'BASE_WAKALA' && (
                          <span className="inline-flex items-center gap-1 font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-[10px]">
                            <Tag className="h-3 w-3" /> Base Wakala {log.matchedEntityId ? `(${log.matchedEntityId})` : ''}
                          </span>
                        )}
                        {(!log.matchedEntityType || log.matchedEntityType === 'NONE') && (
                          <span className="inline-flex items-center gap-1 font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-[10px]">
                            None (IOP)
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${bucketBadgeStyle}`}>
                          {log.classificationBucket}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-slate-600 font-medium text-[11px]">
                        {log.ruleTriggered}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* PAGINATION FOOTER */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <span className="text-xs text-slate-500">
              Showing {(pageSafe - 1) * PAGE_SIZE + 1}–{Math.min(pageSafe * PAGE_SIZE, filteredLogs.length)} of {filteredLogs.length} audit logs
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={pageSafe <= 1}
                className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40 cursor-pointer"
              >
                Previous
              </button>
              <span className="text-xs font-bold text-slate-700">
                Page {pageSafe} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={pageSafe >= totalPages}
                className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200 space-y-3">
          <ShieldCheck className="h-8 w-8 text-slate-300 mx-auto" />
          <p className="text-sm font-bold text-slate-600">No Classification Audit Logs Found</p>
          <p className="text-xs text-slate-400">
            Classification audit records will be automatically logged when daily MGT reports are processed.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={handleSeedSample}
              className="px-4 py-2 text-xs font-bold text-brand-primary bg-brand-primary/10 hover:bg-brand-primary/20 rounded-xl cursor-pointer"
            >
              Generate Demo Audit Trail
            </button>
          </div>
        </div>
      )}

      {/* FOOTER CONTROL */}
      {auditLogs.length > 0 && (
        <div className="flex justify-end pt-2">
          <button
            onClick={handleClearLogs}
            className="text-xs font-bold text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-3 py-1.5 rounded-lg cursor-pointer transition-all"
          >
            Clear Audit Trail History
          </button>
        </div>
      )}
        </>
      )}
    </div>
  );
}

// Generate realistic mock audit records for demo / initial state
function getMockAuditLogs(): ClassificationAuditRecord[] {
  return [
    {
      id: 'audit-tx-1001',
      transactionId: 'TXN-884912',
      timestamp: '2026-08-04 09:15:22',
      rawMsisdn: '0755123456',
      normalizedMsisdn: '255755123456',
      amount: 1500000,
      ownerId: 'OWNER-BALWYN',
      matchedEntityId: '255755123456',
      matchedEntityType: 'SA_TILL',
      classificationBucket: 'SA_INTERNAL',
      ruleTriggered: 'Matched SA Till (Owner Match)'
    },
    {
      id: 'audit-tx-1002',
      transactionId: 'TXN-884913',
      timestamp: '2026-08-04 09:18:45',
      rawMsisdn: '0754987654',
      normalizedMsisdn: '255754987654',
      amount: 450000,
      ownerId: 'OWNER-BALWYN',
      matchedEntityId: 'TERM-104523',
      matchedEntityType: 'BASE_WAKALA',
      classificationBucket: 'BASE',
      ruleTriggered: 'Matched Base Wakala (Owner Match)'
    },
    {
      id: 'audit-tx-1003',
      transactionId: 'TXN-884914',
      timestamp: '2026-08-04 09:22:10',
      rawMsisdn: '0755333222',
      normalizedMsisdn: '255755333222',
      amount: 800000,
      ownerId: 'OWNER-BALWYN',
      matchedEntityId: 'TERM-994821',
      matchedEntityType: 'BASE_WAKALA',
      classificationBucket: 'BASE',
      ruleTriggered: 'Matched Base Wakala (Serviced By Different Owner — Credited To Servicer)'
    },
    {
      id: 'audit-tx-1004',
      transactionId: 'TXN-884915',
      timestamp: '2026-08-04 09:30:00',
      rawMsisdn: '0767111000',
      normalizedMsisdn: '255767111000',
      amount: 250000,
      ownerId: 'OWNER-BALWYN',
      matchedEntityType: 'NONE',
      classificationBucket: 'IOP',
      ruleTriggered: 'Unmatched Destination MSISDN (IOP Fallback)'
    }
  ];
}
