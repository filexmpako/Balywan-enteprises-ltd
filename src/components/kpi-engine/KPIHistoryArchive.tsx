import React, { useMemo } from 'react';
import { History, Eye, Diff, Download, Calendar, User, Clock, CheckCircle } from 'lucide-react';
import { getCompanyName } from '../../utils/company';

interface ArchivedReport {
  reportingMonth: string;
  uploadDate: string;
  uploadedBy: string;
  fileName: string;
  status: string;
  processingTimeMs: number;
  recordsImported: number;
  kpis: any[];
  servicingRows?: any[];
  servicingCols?: string[];
}

interface KPIHistoryArchiveProps {
  onLoadActiveReport: (report: ArchivedReport) => void;
  onSelectForCompare: (month: string) => void;
}

export default function KPIHistoryArchive({ 
  onLoadActiveReport, 
  onSelectForCompare 
}: KPIHistoryArchiveProps) {
  
  // Load history from localStorage or fallback
  const historyList = useMemo((): ArchivedReport[] => {
    const saved = localStorage.getItem('kpiWorkbookHistory');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Error loading KPI history archive:", e);
      }
    }
    return [];
  }, []);

  const downloadReportCSV = (report: ArchivedReport) => {
    const headers = ['KPI Metric', 'Target', 'Achieved', 'Performance %', 'Status'];
    const rows = (report.kpis || []).map(kpi => [
      kpi.name, kpi.target, kpi.achieved, kpi.performance, kpi.status
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(val => {
        const stringVal = String(val === undefined || val === null ? '' : val);
        if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n')) {
          return `"${stringVal.replace(/"/g, '""')}"`;
        }
        return stringVal;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const companySlug = getCompanyName().replace(/[^a-zA-Z0-9]/g, '_');
    link.setAttribute('download', `${companySlug}_KPI_Archive_${report.reportingMonth.replace(/\s+/g, '_')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* 1. TITLE BLOCK */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2.5 border-b border-brand-gray-border font-sans">
        <div>
          <h4 className="font-extrabold text-brand-text text-sm uppercase tracking-wider flex items-center gap-1.5">
            <History className="h-4.5 w-4.5 text-brand-primary" />
            Dodoma Bank KPI Ingestion Archival History Ledger
          </h4>
          <p className="text-xs text-brand-text-variant mt-0.5">
            Archived workbook targets and transaction histories. All active entries are backed up securely in core browser storage.
          </p>
        </div>
      </div>

      {/* 2. HISTORY TABLE REGISTRY */}
      <div className="bg-brand-card rounded-2xl border border-brand-gray-border shadow-sm overflow-hidden">
        {historyList.length === 0 ? (
          <div className="p-12 text-center text-brand-text-variant font-medium text-xs">
            No historical KPI workbooks uploaded yet. Ingest your first sheet to begin building the archive registry.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead>
                <tr className="bg-slate-50 border-b border-brand-gray-border text-[10px] font-bold uppercase text-brand-text-variant tracking-wider">
                  <th className="px-5 py-3">Reporting Month</th>
                  <th className="px-5 py-3">Uploaded Date</th>
                  <th className="px-5 py-3">Uploaded By</th>
                  <th className="px-5 py-3">Workbook File Name</th>
                  <th className="px-5 py-3 text-center">Payload Size</th>
                  <th className="px-5 py-3 text-center">Ingestion Duration</th>
                  <th className="px-5 py-3 text-center">Status Flag</th>
                  <th className="px-5 py-3 text-center w-56">Actions Registry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-gray-border/50">
                {historyList.map((report, rIdx) => {
                  return (
                    <tr key={rIdx} className="hover:bg-slate-50/40 font-medium text-brand-text">
                      {/* Reporting Month */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-brand-primary shrink-0" />
                          <span className="font-black text-brand-text text-[13px]">{report.reportingMonth}</span>
                        </div>
                      </td>

                      {/* Upload Date */}
                      <td className="px-5 py-4 font-bold text-brand-text-variant">{report.uploadDate}</td>

                      {/* Uploaded By */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-brand-text">
                          <User className="h-3.5 w-3.5 text-brand-text-variant" />
                          {report.uploadedBy}
                        </div>
                      </td>

                      {/* Workbook Name */}
                      <td className="px-5 py-4 font-mono text-[11px] text-brand-primary max-w-[180px] truncate" title={report.fileName}>
                        {report.fileName}
                      </td>

                      {/* Records Imported */}
                      <td className="px-5 py-4 text-center">
                        <span className="font-black text-brand-text text-xs">{report.recordsImported || report.kpis.length} entries</span>
                      </td>

                      {/* Ingestion Time */}
                      <td className="px-5 py-4 text-center">
                        <span className="font-mono text-[11px] text-brand-text-variant flex items-center justify-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-brand-text-variant/60" />
                          {report.processingTimeMs || 120} ms
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4 text-center">
                        <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-100 text-emerald-700">
                          <CheckCircle className="h-3 w-3" />
                          {report.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* View active */}
                          <button
                            onClick={() => onLoadActiveReport(report)}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-primary hover:text-brand-primary-light border border-brand-gray-border bg-white px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                            title="Restore as Active Engine Workbook for full analysis"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </button>

                          {/* Compare */}
                          <button
                            onClick={() => onSelectForCompare(report.reportingMonth)}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-secondary hover:text-amber-700 border border-brand-gray-border bg-white px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                            title="Select this month in Multi-Month Comparison Studio"
                          >
                            <Diff className="h-3.5 w-3.5" />
                            Compare
                          </button>

                          {/* Download Excel Mock */}
                          <button
                            onClick={() => downloadReportCSV(report)}
                            className="h-7 w-7 text-brand-text-variant hover:text-brand-text hover:bg-slate-100 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                            title="Download Workbook Source File"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
