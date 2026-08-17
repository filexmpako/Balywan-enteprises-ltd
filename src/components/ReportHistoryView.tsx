import React, { useState, useEffect, useMemo } from 'react';
import { ViewType, AuditReport } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import { 
  FileText, 
  Search, 
  DownloadCloud, 
  Plus, 
  RefreshCw, 
  Calendar,
  FileSpreadsheet,
  FileArchive,
  Activity,
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import PageHeaderBanner from './PageHeaderBanner';
import { getCompanyName } from '../utils/company';

interface ReportHistoryViewProps {
  onNavigate: (view: ViewType) => void;
  reports: AuditReport[];
  onAddAuditReport: (report: AuditReport) => void;
}

export default function ReportHistoryView({
  onNavigate,
  reports,
  onAddAuditReport
}: ReportHistoryViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const reportTypes = ['All', 'KPI Report', 'Transactions', 'Owners List', 'System Audit'];
  const statuses = ['All', 'Success', 'Processing', 'Failed', 'Success (Partial)'];

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedType, selectedStatus]);

  // Filter logic
  const filteredReports = useMemo(() => {
    return reports.filter(rep => {
      const matchesSearch = rep.fileName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            rep.uploadedBy.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            rep.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = selectedType === 'All' || rep.type === selectedType;
      const matchesStatus = selectedStatus === 'All' || rep.status === selectedStatus;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [reports, searchQuery, selectedType, selectedStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredReports.length / itemsPerPage));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const paginatedReports = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredReports.slice(start, start + itemsPerPage);
  }, [filteredReports, currentPage, itemsPerPage]);

  const startItem = filteredReports.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, filteredReports.length);

  const getStatusBadge = (status: AuditReport['status']) => {
    switch (status) {
      case 'Success':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Processing':
        return 'bg-blue-50 text-brand-primary border-blue-200 animate-pulse';
      case 'Failed':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'Success (Partial)':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') {
      return <FileText className="h-5.5 w-5.5 text-red-500" />;
    } else if (ext === 'xlsx' || ext === 'csv') {
      return <FileSpreadsheet className="h-5.5 w-5.5 text-emerald-600" />;
    } else if (ext === 'zip' || ext === 'rar') {
      return <FileArchive className="h-5.5 w-5.5 text-amber-600" />;
    }
    return <FileText className="h-5.5 w-5.5 text-brand-primary" />;
  };

  const handleExportCSV = () => {
    if (filteredReports.length === 0) return;
    const headers = ['ID', 'File Name', 'Type', 'Uploaded By', 'Date', 'Size', 'Status'];
    const rows = filteredReports.map(rep => [
      rep.id, rep.fileName, rep.type, rep.uploadedBy, rep.date, rep.size, rep.status
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
    link.setAttribute('download', `${companySlug}_Audit_Logs_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8 font-sans"
    >
      {/* Title block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeaderBanner
          icon={History}
          title="Report History"
          subtitle={`${reports.length} audit log${reports.length === 1 ? '' : 's'} generated this month • Last updated: Just now`}
        />
        <div className="flex gap-2.5 shrink-0">
          <button 
            onClick={handleExportCSV}
            disabled={filteredReports.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-brand-gray-border bg-white px-4 py-2.5 text-xs font-bold text-brand-primary hover:bg-brand-gray-hover transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <DownloadCloud className="h-4.5 w-4.5" />
            Export Audit Log
          </button>
          <button 
            onClick={() => onNavigate(ViewType.UPLOAD_REPORTS)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-4 py-2.5 text-xs font-bold text-white shadow-ambient hover:bg-brand-primary-light transition-all cursor-pointer"
          >
            <Plus className="h-4.5 w-4.5" />
            New Report
          </button>
        </div>
      </div>

      {/* Filter Options block (Image 3 design) */}
      <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-4 shadow-ambient">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-brand-text-variant" />
            <input
              type="text"
              placeholder="Search by file name, uploader name, or code ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl bg-brand-bg pl-10 pr-4 py-3 text-sm font-medium text-brand-text border-2 border-transparent focus:border-brand-primary focus:bg-white outline-none transition-all placeholder-brand-text-variant/70"
            />
          </div>

          <div className="flex flex-wrap sm:flex-nowrap gap-3">
            {/* Type selector */}
            <div className="flex items-center gap-1.5 rounded-xl bg-brand-bg px-3 py-1 border border-brand-gray-border">
              <FileText className="h-4 w-4 text-brand-text-variant" />
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="bg-transparent text-xs font-semibold text-brand-text outline-none cursor-pointer"
              >
                {reportTypes.map(t => (
                  <option key={t} value={t}>{t === 'All' ? 'Report Type: All' : t}</option>
                ))}
              </select>
            </div>

            {/* Status selector */}
            <div className="flex items-center gap-1.5 rounded-xl bg-brand-bg px-3 py-1 border border-brand-gray-border">
              <Activity className="h-4 w-4 text-brand-text-variant" />
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-transparent text-xs font-semibold text-brand-text outline-none cursor-pointer"
              >
                {statuses.map(s => (
                  <option key={s} value={s}>{s === 'All' ? 'Status: All' : `Status: ${s}`}</option>
                ))}
              </select>
            </div>

            {/* Date filter simulation */}
            <div className="flex items-center gap-2 rounded-xl bg-brand-bg px-3 py-2 border border-brand-gray-border font-sans text-xs font-semibold text-brand-text">
              <Calendar className="h-4 w-4 text-brand-text-variant" />
              <span>Oct 1, 2023 - Oct 31, 2023</span>
            </div>

            <button 
              onClick={() => {
                if (isRefreshing) return;
                setIsRefreshing(true);
                setTimeout(() => {
                  setSearchQuery('');
                  setSelectedType('All');
                  setSelectedStatus('All');
                  setIsRefreshing(false);
                }, 900);
              }}
              disabled={isRefreshing}
              className={`rounded-xl p-3 text-brand-text-variant transition-all relative flex items-center justify-center border border-brand-gray-border/40 ${
                isRefreshing 
                  ? 'bg-brand-primary/10 text-brand-primary cursor-not-allowed opacity-75' 
                  : 'bg-brand-gray-hover hover:bg-brand-primary-container hover:text-brand-primary cursor-pointer'
              }`}
              title="Refresh Data & Reset Filters"
              id="report-history-refresh-btn"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : 'transition-transform duration-300'}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Table Layout */}
      <div className="rounded-2xl border border-brand-gray-border bg-brand-card overflow-hidden shadow-ambient relative">
          {/* Subtle loading overlay */}
          <AnimatePresence>
            {isRefreshing && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex items-center justify-center z-10"
              >
                <div className="flex flex-col items-center gap-2 bg-white/90 border border-brand-gray-border px-6 py-4.5 rounded-2xl shadow-lg">
                  <RefreshCw className="h-7 w-7 text-brand-primary animate-spin" />
                  <span className="text-xs font-bold text-slate-700 tracking-tight">Updating from data source...</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-brand-gray-border bg-brand-gray-hover/50 text-[11px] font-bold text-brand-text-variant uppercase tracking-wider">
                  <th className="px-6 py-4.5">File Name</th>
                  <th className="px-6 py-4.5">Type</th>
                  <th className="px-6 py-4.5">Uploaded By</th>
                  <th className="px-6 py-4.5">Date & Time</th>
                  <th className="px-6 py-4.5 text-right">Size</th>
                  <th className="px-6 py-4.5">Status</th>
                </tr>
              </thead>
              <tbody className={`divide-y divide-brand-gray-border transition-all duration-300 ${isRefreshing ? 'opacity-35 pointer-events-none' : 'opacity-100'}`}>
                {paginatedReports.length > 0 ? (
                  paginatedReports.map((rep) => (
                    <tr key={rep.id} className="hover:bg-brand-gray-hover/30 transition-colors">
                      {/* File details with icons */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 border border-slate-100 shrink-0 shadow-sm">
                            {getFileIcon(rep.fileName)}
                          </div>
                          <div className="overflow-hidden">
                            <h4 className="text-xs font-bold text-brand-text hover:text-brand-primary hover:underline cursor-pointer truncate max-w-xs sm:max-w-md">
                              {rep.fileName}
                            </h4>
                            <span className="font-mono text-[9px] text-slate-400 block mt-0.5">ID: {rep.id}</span>
                          </div>
                        </div>
                      </td>

                      {/* Document Type */}
                      <td className="px-6 py-4 font-sans text-xs font-semibold text-brand-text">
                        {rep.type}
                      </td>

                      {/* Uploader Person with circular avatar representation */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <img src={getAvatarUrl(rep.uploadedBy)} alt={rep.uploadedBy} className="h-7 w-7 rounded-full object-cover shrink-0 border border-slate-100" />
                          <span className="font-sans text-xs font-bold text-brand-text whitespace-nowrap">{rep.uploadedBy}</span>
                        </div>
                      </td>

                      {/* Upload Timestamp */}
                      <td className="px-6 py-4 font-sans text-xs font-medium text-brand-text-variant whitespace-nowrap">
                        {rep.date}
                      </td>

                      {/* Spreadsheet file size */}
                      <td className="px-6 py-4 text-right font-mono text-xs font-bold text-brand-text">
                        {rep.size}
                      </td>

                      {/* Schema status badges */}
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wider ${getStatusBadge(rep.status)}`}>
                          {rep.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <FileText className="h-8 w-8 text-slate-300" />
                        <p className="font-sans text-sm font-semibold text-brand-text-variant">No audit logs found matching your filters.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Table pagination controls */}
          <div className="bg-brand-gray-hover/20 border-t border-brand-gray-border px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 font-sans text-xs">
            <span className="text-brand-text-variant">
              Showing <strong className="text-brand-text">{startItem}</strong> to <strong className="text-brand-text">{endItem}</strong> of <strong className="text-brand-text">{filteredReports.length}</strong> report{filteredReports.length === 1 ? '' : 's'}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-brand-gray-border bg-white px-2.5 py-1.5 font-bold hover:bg-brand-gray-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                Prev
              </button>
              
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`rounded-lg px-3 py-1.5 font-bold transition-all cursor-pointer ${
                    currentPage === page
                      ? 'bg-brand-primary text-white shadow-xs'
                      : 'text-brand-text-variant hover:bg-brand-gray-hover'
                  }`}
                >
                  {page}
                </button>
              ))}

              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages || filteredReports.length === 0}
                className="rounded-lg border border-brand-gray-border bg-white px-2.5 py-1.5 font-bold hover:bg-brand-gray-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        </div>
    </motion.div>
  );
}
