import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, CheckCircle2, XCircle } from 'lucide-react';
import { fetchWakalaStatusHistory } from '../lib/wakalaStatus.functions';
import { normalizeMsisdn } from '../utils/msisdn';
import { buildWakalaNameMap } from '../utils/wakalaName';
import { formatNumberWithAbbreviation } from '../utils/numberFormat';

interface WakalaStatusRow {
  msisdn: string;
  owner_name: string | null;
  is_active: boolean;
  is_served: boolean | null;
  total_txns: number;
  total_value: number;
}

export interface WakalaStatusDetailModalProps {
  isOpen: boolean;
  reportingWeek: string | null;
  status: 'served' | 'unserved';
  onClose: () => void;
}

/**
 * Company-wide drill-down for the admin dashboard's Served / Unserved
 * Wakalas cards — lists exactly which wakalas make up that week's count.
 */
export default function WakalaStatusDetailModal({ isOpen, reportingWeek, status, onClose }: WakalaStatusDetailModalProps) {
  const [rows, setRows] = useState<WakalaStatusRow[] | 'loading' | 'error'>('loading');
  const [search, setSearch] = useState('');
  const nameMap = useMemo(buildWakalaNameMap, [isOpen]);

  useEffect(() => {
    if (!isOpen || !reportingWeek) return;
    setSearch('');
    setRows('loading');
    fetchWakalaStatusHistory({ data: { reportingWeek } })
      .then(res => {
        const wanted = status === 'served';
        const filtered = (res.rows || []).filter((r: any) => !!r.is_served === wanted && r.is_served !== null);
        setRows(filtered as WakalaStatusRow[]);
      })
      .catch(err => {
        console.error('Wakala status detail load failed:', err);
        setRows('error');
      });
  }, [isOpen, reportingWeek, status]);

  const filteredRows = useMemo(() => {
    if (!Array.isArray(rows)) return [];
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      const norm = normalizeMsisdn(r.msisdn) || r.msisdn;
      const name = (nameMap.get(norm) || '').toLowerCase();
      return r.msisdn.toLowerCase().includes(q) || name.includes(q) || (r.owner_name || '').toLowerCase().includes(q);
    });
  }, [rows, search, nameMap]);

  if (!isOpen) return null;

  const isServed = status === 'served';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-2xl max-h-[80vh] rounded-2xl bg-brand-card border border-brand-gray-border shadow-xl overflow-hidden flex flex-col"
        >
          <div className="flex items-center justify-between gap-3 border-b border-brand-gray-border p-5 shrink-0">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isServed ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                {isServed ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
              </div>
              <div>
                <h3 className="font-sans text-base font-bold text-brand-text">
                  {isServed ? 'Served' : 'Unserved'} Wakalas
                </h3>
                <p className="font-sans text-xs text-brand-text-variant">{reportingWeek}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-brand-text-variant hover:bg-brand-gray-hover hover:text-brand-text transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {Array.isArray(rows) && rows.length > 0 && (
            <div className="px-5 pt-4 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search wakala, MSISDN, or owner..."
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-brand-primary transition-all"
                />
              </div>
            </div>
          )}

          <div className="p-5 overflow-y-auto flex-1">
            {rows === 'loading' && (
              <p className="py-8 text-center font-sans text-xs text-brand-text-variant">Loading wakalas…</p>
            )}
            {rows === 'error' && (
              <p className="py-8 text-center font-sans text-xs text-brand-error">Could not load wakala detail for this week.</p>
            )}
            {Array.isArray(rows) && rows.length === 0 && (
              <p className="py-8 text-center font-sans text-xs text-brand-text-variant">
                No {isServed ? 'served' : 'unserved'} wakalas recorded for this week.
              </p>
            )}
            {Array.isArray(rows) && rows.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs font-sans">
                  <thead className="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="px-3 py-2.5">Wakala</th>
                      <th className="px-3 py-2.5">MSISDN</th>
                      <th className="px-3 py-2.5">Owner</th>
                      <th className="px-3 py-2.5">Txns</th>
                      <th className="px-3 py-2.5">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map(w => {
                      const norm = normalizeMsisdn(w.msisdn) || w.msisdn;
                      const name = nameMap.get(norm) || w.msisdn;
                      return (
                        <tr key={w.msisdn} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-semibold text-brand-text">{name}</td>
                          <td className="px-3 py-2 font-mono text-[11px] text-brand-text-variant">{w.msisdn}</td>
                          <td className="px-3 py-2 text-brand-text-variant">{w.owner_name || 'Unassigned'}</td>
                          <td className="px-3 py-2 text-brand-text">{w.total_txns}</td>
                          <td className="px-3 py-2 text-brand-text">{formatNumberWithAbbreviation(w.total_value)}</td>
                        </tr>
                      );
                    })}
                    {filteredRows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-brand-text-variant">No matches for "{search}".</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
