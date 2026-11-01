import { ArrowDownLeft, ArrowUpRight, Scale } from 'lucide-react';
import MetricCard from './MetricCard';
import type { IopReportView } from '../utils/iopReportClient';
import { IOP_UNASSIGNED } from '../utils/iopReport';

const tzs = (n: number) => `TZS ${Math.round(Math.abs(n)).toLocaleString()}`;
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${tzs(n)}`;
const tone = (n: number) => (n > 0 ? 'text-emerald-700' : n < 0 ? 'text-rose-700' : 'text-brand-text');

function Header({ periodLabel, report }: { periodLabel: string; report: IopReportView | null | undefined }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="font-mono font-sans text-xs font-black uppercase tracking-wider text-brand-primary">
        IOP Report · {periodLabel}
      </h3>
      {report && <span className="font-sans text-[10px] text-brand-text-variant">{report.fileName}</span>}
    </div>
  );
}

function Pending({ periodLabel, report }: { periodLabel: string; report: IopReportView | null | undefined }) {
  return (
    <p className="rounded-xl border border-dashed border-brand-gray-border bg-brand-card px-4 py-3 font-sans text-xs text-brand-text-variant">
      {report === undefined ? 'Loading the IOP report…' : `No IOP report uploaded for ${periodLabel} yet.`}
    </p>
  );
}

function Cards({ reward, clawback, rewardNote, clawbackNote }: { reward: number; clawback: number; rewardNote: string; clawbackNote: string }) {
  const net = reward - clawback;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <MetricCard title="Reward" value={<span className="text-emerald-700">{tzs(reward)}</span>} subValue={rewardNote} icon={ArrowUpRight} variant="green" />
      <MetricCard title="Clawback" value={<span className="text-rose-700">{tzs(clawback)}</span>} subValue={clawbackNote} icon={ArrowDownLeft} variant="red" />
      <MetricCard title="Net (Reward − Clawback)" value={<span className={tone(net)}>{signed(net)}</span>} subValue="REVISED AMOUNT" icon={Scale} variant={net >= 0 ? 'green' : 'red'} />
    </div>
  );
}

/** One owner's month-end IOP report: REWARD on their tills, CLAWBACK on their base wakalas. */
export function IopReportCard({ report, ownerId, periodLabel }: { report: IopReportView | null | undefined; ownerId: string; periodLabel: string }) {
  const own = report?.summary.byOwner.find(o => o.ownerId === ownerId);
  return (
    <div className="space-y-2">
      <Header periodLabel={periodLabel} report={report} />
      {!report ? (
        <Pending periodLabel={periodLabel} report={report} />
      ) : (
        <Cards
          reward={own?.reward ?? 0}
          clawback={own?.clawback ?? 0}
          rewardNote={`${own?.rewardRows ?? 0} rows · your tills served wakalas outside the base`}
          clawbackNote={`${own?.clawbackRows ?? 0} rows · other companies served your base wakalas`}
        />
      )}
    </div>
  );
}

/** Company month-end IOP report with each owner's line (staff dashboard). */
export function IopReportSummary({ report, periodLabel }: { report: IopReportView | null | undefined; periodLabel: string }) {
  const s = report?.summary;
  return (
    <div className="space-y-3">
      <Header periodLabel={periodLabel} report={report} />
      {!report || !s ? (
        <Pending periodLabel={periodLabel} report={report} />
      ) : (
        <>
          <Cards
            reward={s.reward}
            clawback={s.clawback}
            rewardNote={`Company tills: ${tzs(s.companyReward)}`}
            clawbackNote={`Base wakala with no owner: ${tzs(s.unassignedClawback)}`}
          />
          <div className="overflow-x-auto rounded-2xl border border-brand-gray-border bg-brand-card">
            <table className="w-full min-w-[520px] text-left font-sans">
              <thead>
                <tr className="border-b border-brand-gray-border bg-brand-gray-hover/40">
                  {['Owner', 'Reward', 'Clawback', 'Net'].map(h => (
                    <th key={h} className={`px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-brand-text-variant ${h === 'Owner' ? '' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.byOwner.map(o => {
                  const net = o.reward - o.clawback;
                  const unassigned = o.ownerId === IOP_UNASSIGNED;
                  return (
                    <tr key={o.ownerId} className="border-b border-brand-gray-border/50">
                      <td className="px-4 py-2 text-xs font-bold text-brand-text">
                        {unassigned ? <span className="text-brand-text-variant">Company tills / no-owner wakala</span> : o.ownerName}
                      </td>
                      <td className="px-4 py-2 text-right text-xs tabular-nums text-emerald-700">{tzs(o.reward)}</td>
                      <td className="px-4 py-2 text-right text-xs tabular-nums text-rose-700">{tzs(o.clawback)}</td>
                      <td className={`px-4 py-2 text-right text-xs font-bold tabular-nums ${tone(net)}`}>{signed(net)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
