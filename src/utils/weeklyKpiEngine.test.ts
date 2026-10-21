import { describe, expect, test } from 'bun:test';
import { ownerWeeklySeries, type WeeklyStatsEntry } from './weeklyKpiEngine';

const entry = (month: string, week: number, value: number): WeeklyStatsEntry => ({
  reportingMonth: `${month} 2026`,
  reportingWeek: `Week ${week} (${month} ${week === 2 ? 8 : 15} - ${month} ${week === 2 ? 14 : 21}, 2026)`,
  uploadedAt: '', total: 1, active: 1, inactive: 0, served: 1, notServed: 0, noStatus: 0,
  servedPercent: '100', notServedPercent: '0', totalValue: value, totalTxns: 1,
  baseValue: value, iopValue: 0, cashInTxns: 1, cashOutTxns: 0, cpValue: 0, penalty: 0,
  byOwner: [{ ownerId: 'petro', ownerName: 'PETRO', total: 1, active: 1, inactive: 0,
    served: 1, notServed: 0, noStatus: 0, value, txns: 1, iopValue: 0, penalty: 0, cpValue: 0 }],
});

describe('owner weekly reporting', () => {
  test('October profiles exclude September and order October weeks chronologically', () => {
    const series = ownerWeeklySeries([
      entry('October', 3, 300), entry('September', 3, 900), entry('October', 2, 200),
    ], 'petro', '2026-10');
    expect(series.map(s => s.cumulativeValue)).toEqual([200, 300]);
  });
  test('an owner never receives another owner’s weekly totals', () => {
    const series = ownerWeeklySeries([entry('October', 2, 200)], 'another-owner', '2026-10');
    expect(series[0]?.breakdown).toBeNull();
    expect(series[0]?.cumulativeValue).toBe(0);
  });
});