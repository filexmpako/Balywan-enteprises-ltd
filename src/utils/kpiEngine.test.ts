import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateOwnerMtdVolume } from './kpiEngine';
import type { ClassifiedRow } from './classification';
import type { WeeklyStatsEntry } from './weeklyKpiEngine';

const row = (bucket: 'BASE' | 'IOP', amount: number) =>
  ({ row: { 'Servicing Date': '2026-10-05' }, bucket, auditRecord: { ownerId: 'petro', amount } }) as unknown as ClassifiedRow;

const weekly = {
  reportingMonth: 'October 2026', reportingWeek: 'Week 2 (October 8 - October 14, 2026)',
  byOwner: [{ ownerId: 'petro', value: 50, iopValue: 500 }],
} as unknown as WeeklyStatsEntry;

describe('KPI 1 IOP', () => {
  test('uses only Daily MGT off-base servicing, never the weekly IOP column', () => {
    const v = calculateOwnerMtdVolume([row('BASE', 1000), row('IOP', 100)], 'petro', [weekly], '2026-10');
    assert.equal(v.iopVolume, 100);
    assert.equal(v.iopSource, 'daily');
    assert.equal(v.baseVolume, 1000);
  });
});
