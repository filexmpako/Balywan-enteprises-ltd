/**
 * One week's report, wakala by wakala, as the weekly figures count it: the
 * uploaded report's own columns that the calculations use, with each
 * wakala's owner and its final Active / Served reading from the same engine
 * that builds the weekly stats.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadWorkspace, workspaceToSnapshot } from './hasidadi/repo.server';
import { runWithSnapshot } from './hasidadi/engine-context.server';
import { loadWeeklyRows } from './weekly.server';
import { buildMsisdnOwnerResolver, computeWeeklyStats } from '../utils/weeklyKpiEngine';
import { getActivityRules } from '../utils/activityRules';
import { getActiveStatusFromColumn, getServicedStatusFromColumn } from '../utils/servicingStatus';
import type { WeeklyReportRow } from '../utils/weeklyReport';

type DB = SupabaseClient<any, any, any>;

const num = (v: unknown): number => {
  const n = parseFloat(String(v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};
const text = (v: unknown): string => String(v ?? '').trim();

export async function loadWeeklyReportRows(
  supabase: DB,
  reportingWeek: string,
  ownerId?: string,
): Promise<{ rows: WeeklyReportRow[]; penaltyRate: number }> {
  const [workspace, weekRows] = await Promise.all([loadWorkspace(supabase), loadWeeklyRows(supabase, reportingWeek)]);
  const c = workspace.collections;
  return runWithSnapshot(workspaceToSnapshot(workspace), () => {
    const rules = getActivityRules();
    const resolver = buildMsisdnOwnerResolver(c['baseWakalaIndex'] ?? [], c['ownersList'] ?? [], c['tillsList'] ?? []);
    const stats = computeWeeklyStats(weekRows, resolver, rules);
    const rawByMsisdn = new Map<string, any>();
    for (const row of weekRows) rawByMsisdn.set(text(row.MSISDN), row);
    const rows = (stats?.evaluations ?? [])
      .filter(e => !ownerId || e.ownerId === ownerId)
      .map((e): WeeklyReportRow => {
        const raw = rawByMsisdn.get(e.msisdn) ?? {};
        return {
          msisdn: e.msisdn,
          aliasCode: text(raw.Alias_Code),
          fullName: text(raw.Full_Name),
          ciTxns: e.cashInTxns,
          coTxns: e.cashOutTxns,
          saServicingVal: e.totalValue,
          saServicingTxns: num(raw.SA_Servicing_Txns),
          iop: e.iopValue,
          cpServicingVal: e.cpValue,
          served: e.isServed,
          servedFromReport: getServicedStatusFromColumn(raw) !== null,
          active: e.isActive,
          activeFromReport: getActiveStatusFromColumn(raw) !== null,
          ownerId: e.ownerId,
          ownerName: e.ownerName,
        };
      })
      .sort((a, b) => b.saServicingVal - a.saServicingVal || a.msisdn.localeCompare(b.msisdn));
    return { rows, penaltyRate: rules.penaltyRate };
  });
}
