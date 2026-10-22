import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const expect = (a: unknown) => ({ toBe: (b: unknown) => assert.equal(a, b) });
import { scoreOwnerKpis } from './ownerKpiScore';

const sample = scoreOwnerKpis({
  servedValue: 1_107_921_554, monthlyTarget: 2_790_160_168,
  normalBase: 239, normalServed: 145, priorityBase: 29, priorityServed: 5,
  activeBase: 268, active: 178,
});

describe('owner KPI sheet scoring', () => {
  it('KPI 1 is served value over monthly target (40%)', () => expect(Math.round(sample.kpi1)).toBe(40));
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
