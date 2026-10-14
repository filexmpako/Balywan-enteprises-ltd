import { AlertTriangle, TrendingUp } from 'lucide-react';
import MetricCard from './MetricCard';
import type { IopSource } from './IopLabel';
import { calculateIopSettlement, getActivityRules } from '../utils/activityRules';

const money = (n: number) => `TZS ${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${money(n)}`;
const tone = (n: number) => (n > 0 ? 'text-emerald-700' : n < 0 ? 'text-rose-700' : 'text-brand-text');

/**
 * IOP gain or penalty: (Daily MGT IOP − the report's IOP) × penalty rate.
 * A gain turns the card green, a penalty red. The footer nets it against the
 * bank penalty.
 */
export default function IopSettlementCard({
  dailyIop,
  reportIop,
  reportKind,
  bankPenalty,
}: {
  dailyIop: number;
  reportIop: number;
  reportKind: IopSource | null;
  bankPenalty: number;
}) {
  const iop = reportKind ? calculateIopSettlement(dailyIop, reportIop) : 0;
  const net = Math.round((iop - bankPenalty) * 100) / 100;
  const gain = iop > 0;
  return (
    <MetricCard
      title={gain ? 'IOP Gain' : 'IOP Penalty'}
      value={<span className={tone(iop)}>{signed(iop)}</span>}
      subValue={`(Daily − ${reportKind === 'monthly' ? 'Monthly' : 'Weekly'}) × ${getActivityRules().penaltyRate}%`}
      icon={gain ? TrendingUp : AlertTriangle}
      variant={gain ? 'green' : iop < 0 ? 'red' : 'slate'}
      className={gain ? 'bg-emerald-50!' : iop < 0 ? 'bg-rose-50/60!' : ''}
    >
      <div className="flex justify-between gap-3 border-t border-slate-200/70 pt-2 font-sans text-xs">
        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-text-variant">Net (IOP − Bank)</span>
        <span className={`font-black ${tone(net)}`}>{signed(net)}</span>
      </div>
    </MetricCard>
  );
}
