import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { fetchWeeklyReport } from '../lib/weekly.functions';
import { buildWakalaNameMap } from '../utils/wakalaName';
import { normalizeMsisdn } from '../utils/msisdn';
import type { BaseWakala } from '../types';
import { CLOUD_HYDRATED_EVENT, REGISTRIES_CHANGED_EVENT } from '../lib/cloudSyncEvents';
import {
  FILTER_LABELS,
  matchesFilter,
  newlyServed,
  reportNumber,
  rowKey,
  totalsOf,
  type DetailFilter,
  type WeeklyReportRow,
} from '../utils/weeklyReport';

type Loaded = { rows: WeeklyReportRow[]; penaltyRate: number };

// One download per week and scope, shared by every table on the page.
const cache = new Map<string, Promise<Loaded>>();
if (typeof window !== 'undefined') {
  const clear = () => cache.clear();
  ['weekly-kpi-updated', CLOUD_HYDRATED_EVENT, REGISTRIES_CHANGED_EVENT].forEach(e => window.addEventListener(e, clear));
}

function loadWeek(reportingWeek: string, ownerId?: string): Promise<Loaded> {
  const key = `${reportingWeek}|${ownerId || 'all'}`;
  let promise = cache.get(key);
  if (!promise) {
    promise = fetchWeeklyReport({ data: { reportingWeek, ownerId } }) as Promise<Loaded>;
    cache.set(key, promise);
    promise.catch(() => cache.delete(key));
  }
  return promise;
}

const FILTERS: DetailFilter[] = ['all', 'active', 'inactive', 'served', 'unserved', 'nostatus', 'wakalaBank', 'iopWakala', 'newWakala', 'location'];
const PAGE = 50;

/** How many prior weeks with no "served" reading make a served wakala "new". */
const NEW_WAKALA_LOOKBACK_WEEKS = 4;

interface Props {
  reportingWeek: string;
  /** One owner's wakalas; omitted = every wakala in the report (staff). */
  ownerId?: string;
  filter: DetailFilter;
  onFilterChange: (filter: DetailFilter) => void;
  /** Earlier weeks of the month, oldest first (for the New Wakala filter). */
  priorWeeks?: string[];
}

const th = 'whitespace-nowrap border-b border-r border-slate-200 bg-slate-100 px-2 py-1.5 font-mono text-[10px] font-bold text-slate-700';
const td = 'whitespace-nowrap border-b border-r border-slate-100 px-2 py-1 text-[11px]';
const num = `${td} text-right tabular-nums`;

/** A 1/0 status cell; a reading filled in by the rule (the report had none) is marked. */
function StatusCell({ value, fromReport, ruleNote }: { value: boolean | null; fromReport: boolean; ruleNote: string }) {
  if (value === null) return <td className={`${td} text-center text-slate-400`} title="No reading">–</td>;
  return (
    <td
      className={`${td} text-center font-bold ${value ? 'text-emerald-700' : 'text-rose-700'}`}
      title={fromReport ? 'From the report' : ruleNote}
    >
      <span className={fromReport ? '' : 'underline decoration-dotted underline-offset-2'}>{value ? 1 : 0}</span>
    </td>
  );
}

/**
 * A week's wakalas laid out like the uploaded weekly report, limited to the
 * report columns the figures are built from, with each wakala's owner and
 * the Active / Served reading the figures counted.
 */
export default function WeeklyReportTable({ reportingWeek, ownerId, filter, onFilterChange, priorWeeks = [] }: Props) {
  const [data, setData] = useState<Loaded | 'loading' | 'error'>('loading');
  const [prior, setPrior] = useState<WeeklyReportRow[][] | null>(null);
  const [search, setSearch] = useState('');
  const [owner, setOwner] = useState('');
  const [district, setDistrict] = useState('');
  const [page, setPage] = useState(0);
  const nameMap = useMemo(buildWakalaNameMap, [reportingWeek]);
  const districtOf = useMemo(() => {
    const map = new Map<string, string>();
    try {
      (JSON.parse(localStorage.getItem('baseWakalaIndex') || '[]') as BaseWakala[]).forEach(w => {
        const key = normalizeMsisdn(w.msisdn);
        if (key && w.district) map.set(key, w.district);
      });
    } catch { /* location filter degrades to unavailable, never breaks the table */ }
    return map;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setData('loading');
    loadWeek(reportingWeek, ownerId)
      .then(d => { if (!cancelled) setData(d); })
      .catch(err => {
        console.error('Weekly report load failed:', err);
        if (!cancelled) setData('error');
      });
    return () => { cancelled = true; };
  }, [reportingWeek, ownerId]);

  const lookback = priorWeeks.slice(-NEW_WAKALA_LOOKBACK_WEEKS).join('\n');
  useEffect(() => {
    if (filter !== 'newWakala') return;
    let cancelled = false;
    const weeks = lookback ? lookback.split('\n') : [];
    Promise.all(weeks.map(w => loadWeek(w, ownerId).then(d => d.rows).catch(() => [] as WeeklyReportRow[])))
      .then(rows => { if (!cancelled) setPrior(rows); });
    return () => { cancelled = true; };
  }, [filter, lookback, ownerId]);

  useEffect(() => setPage(0), [filter, search, owner, district, reportingWeek]);

  const rows = Array.isArray((data as Loaded)?.rows) ? (data as Loaded).rows : [];
  const penaltyRate = typeof data === 'object' ? data.penaltyRate : 0;
  const nameOf = (r: WeeklyReportRow) => r.fullName || nameMap.get(rowKey(r.msisdn)) || '';

  const filtered = useMemo(() => {
    const ctx = {
      newWakalaSet: filter === 'newWakala' && prior && prior.length ? newlyServed(rows, prior) : new Set<string>(),
      districtOf,
      selectedDistrict: district,
    };
    const q = search.trim().toLowerCase();
    return rows.filter(r =>
      matchesFilter(r, filter, ctx) &&
      (!owner || (r.ownerName || 'Unassigned') === owner) &&
      (!q || r.msisdn.includes(q) || r.aliasCode.toLowerCase().includes(q) || nameOf(r).toLowerCase().includes(q)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filter, prior, districtOf, district, search, owner]);

  if (data === 'loading') return <p className="py-3 text-center font-sans text-xs text-brand-text-variant">Loading the week's report…</p>;
  if (data === 'error') return <p className="py-3 text-center font-sans text-xs text-brand-error">Could not load this week's report.</p>;
  if (!rows.length) return <p className="py-3 text-center font-sans text-xs text-brand-text-variant">No wakala rows in this week's report.</p>;

  const totals = totalsOf(filtered);
  const owners = Array.from(new Set(rows.map(r => r.ownerName || 'Unassigned'))).sort();
  const districts = Array.from(new Set(rows.map(r => districtOf.get(rowKey(r.msisdn))).filter((d): d is string => !!d))).sort();
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const select = 'cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-brand-text focus:border-brand-primary focus:outline-none';
  const ruleNote = (what: string) => `No ${what} in the report: set by the activity rule`;

  return (
    // On a phone the drop-down stays screen-wide (only the columns scroll), even
    // inside the week table's own sideways scroll.
    <div onClick={e => e.stopPropagation()} className="sticky left-0 max-w-[calc(100vw-5rem)] sm:max-w-none">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select value={filter} onChange={e => onFilterChange(e.target.value as DetailFilter)} className={select}>
          {FILTERS.map(f => <option key={f} value={f}>{FILTER_LABELS[f]}</option>)}
        </select>
        {filter === 'location' && (
          <select value={district} onChange={e => setDistrict(e.target.value)} className={select}>
            <option value="">All Districts</option>
            {districts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        {!ownerId && (
          <select value={owner} onChange={e => setOwner(e.target.value)} className={select}>
            <option value="">All Owners</option>
            {owners.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        <div className="relative min-w-[180px] flex-1 sm:flex-none">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="MSISDN, alias or name"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs focus:border-brand-primary focus:bg-white focus:outline-none"
          />
        </div>
        <span className="font-sans text-[10px] text-brand-text-variant">
          {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} wakala
        </span>
      </div>

      <div className="max-h-[520px] overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-max min-w-full border-separate border-spacing-0 text-left font-sans">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={`${th} sticky left-0 z-20`}>MSISDN</th>
              <th className={th}>Alias_Code</th>
              <th className={th}>Full_Name</th>
              <th className={`${th} text-right`}>CI_Txns</th>
              <th className={`${th} text-right`}>CO_Txns</th>
              <th className={`${th} text-right`}>SA_Servicing_Val</th>
              <th className={`${th} text-right`}>SA_Servicing_Txns</th>
              <th className={`${th} text-right`}>IOP</th>
              <th className={`${th} text-right`}>CP_Servicing_Val</th>
              <th className={`${th} text-center`}>servicing_status</th>
              <th className={`${th} text-center`}>wakala_status</th>
              <th className={th}>OWNER</th>
              <th className={`${th} text-right`} title={`CP_Servicing_Val × ${penaltyRate}%`}>Bank Penalty</th>
            </tr>
          </thead>
          <tbody className="text-brand-text">
            {shown.map(r => (
              <tr key={r.msisdn} className="hover:bg-blue-50/40">
                <td className={`${td} sticky left-0 bg-white font-mono`}>{r.msisdn}</td>
                <td className={`${td} font-mono text-slate-500`}>{r.aliasCode || '-'}</td>
                <td className={`${td} max-w-[220px] truncate font-semibold`} title={nameOf(r)}>{nameOf(r) || '-'}</td>
                <td className={num}>{reportNumber(r.ciTxns)}</td>
                <td className={num}>{reportNumber(r.coTxns)}</td>
                <td className={`${num} font-semibold`}>{reportNumber(r.saServicingVal)}</td>
                <td className={num}>{reportNumber(r.saServicingTxns)}</td>
                <td className={`${num} text-violet-700`}>{reportNumber(r.iop)}</td>
                <td className={`${num} text-amber-700`}>{reportNumber(r.cpServicingVal)}</td>
                <StatusCell value={r.served} fromReport={r.servedFromReport} ruleNote={ruleNote('servicing_status')} />
                <StatusCell value={r.active} fromReport={r.activeFromReport} ruleNote={ruleNote('wakala_status')} />
                <td className={`${td} font-bold`}>{r.ownerName || <span className="font-normal text-slate-400">Unassigned</span>}</td>
                <td className={`${num} text-rose-700`}>{reportNumber((r.cpServicingVal * penaltyRate) / 100)}</td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={13} className="py-4 text-center font-sans text-xs text-brand-text-variant">No wakalas match.</td>
              </tr>
            )}
          </tbody>
          <tfoot className="sticky bottom-0 text-brand-text">
            <tr className="bg-slate-100 font-bold">
              <td className={`${td} sticky left-0 bg-slate-100 font-bold`}>Total</td>
              <td className={`${td} bg-slate-100`} />
              <td className={`${td} bg-slate-100 font-bold`}>{totals.wakala.toLocaleString()} wakala</td>
              <td className={`${num} bg-slate-100 font-bold`}>{reportNumber(totals.ciTxns)}</td>
              <td className={`${num} bg-slate-100 font-bold`}>{reportNumber(totals.coTxns)}</td>
              <td className={`${num} bg-slate-100 font-bold`}>{reportNumber(totals.saServicingVal)}</td>
              <td className={`${num} bg-slate-100 font-bold`}>{reportNumber(totals.saServicingTxns)}</td>
              <td className={`${num} bg-slate-100 font-bold text-violet-700`}>{reportNumber(totals.iop)}</td>
              <td className={`${num} bg-slate-100 font-bold text-amber-700`}>{reportNumber(totals.cpServicingVal)}</td>
              <td className={`${td} bg-slate-100 text-center font-bold text-emerald-700`} title="Served">{totals.served.toLocaleString()}</td>
              <td className={`${td} bg-slate-100 text-center font-bold text-emerald-700`} title="Active">{totals.active.toLocaleString()}</td>
              <td className={`${td} bg-slate-100`} />
              <td className={`${num} bg-slate-100 font-bold text-rose-700`}>{reportNumber((totals.cpServicingVal * penaltyRate) / 100)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-sans text-[10px] text-brand-text-variant">
        <span>
          Status columns: 1 = yes, 0 = no; <span className="underline decoration-dotted">dotted</span> = not in the report, set by the activity rule.
        </span>
        {pages > 1 && (
          <span className="flex items-center gap-2">
            <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1 font-bold disabled:opacity-40">Prev</button>
            Page {page + 1} of {pages}
            <button type="button" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)} className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1 font-bold disabled:opacity-40">Next</button>
          </span>
        )}
      </div>
    </div>
  );
}
