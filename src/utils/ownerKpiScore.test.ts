import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const expect = (a: unknown) => ({ toBe: (b: unknown) => assert.equal(a, b) });
import { scoreOwnerKpis, weightedKpi1 } from './ownerKpiScore';

const sample = scoreOwnerKpis({
  baseServed: 996_064_067, baseTarget: 2_490_160_168,
  iopServed: 120_000_000, iopTarget: 300_000_000,
  normalBase: 239, normalServed: 145, priorityBase: 29, priorityServed: 5,
  activeBase: 268, active: 178,
});

describe('owner KPI sheet scoring', () => {
  it('KPI 1 weights Base 70 / IOP 30 (28% + 12% = 40%)', () => {
    expect(Math.round(sample.baseShare)).toBe(28);
    expect(Math.round(sample.iopShare)).toBe(12);
    expect(Math.round(sample.kpi1)).toBe(40);
  });
  it('KPI 1 with only one target set uses that type alone', () => {
    expect(weightedKpi1(50, 100, 999, 0)).toBe(50);
    expect(weightedKpi1(0, 0, 30, 60)).toBe(50);
    expect(weightedKpi1(10, 0, 10, 0)).toBe(0);
  });
  it('KPI 1 is uncapped above target', () => expect(Math.round(weightedKpi1(300, 100, 30, 100))).toBe(219));
  it('targets are 80% served and 90% active of base', () => {
    expect(sample.normalTarget).toBe(191);
    expect(sample.priorityTarget).toBe(23);
    expect(sample.activeTarget).toBe(241);
  });
  it('KPI 2 splits normal 70 / priority 30 (53% + 6% = 60%)', () => {
    expect(Math.round(sample.normalShare)).toBe(53);
    expect(Math.floor(sample.priorityShare)).toBe(6);
    expect(Math.round(sample.kpi2)).toBe(60);
  });
  it('KPI 3 is active over active target (74%)', () => expect(Math.round(sample.kpi3)).toBe(74));
  it('overall uses weights 40/50/10 (53%)', () => expect(Math.round(sample.overall)).toBe(53));
});
