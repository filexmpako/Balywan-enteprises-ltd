import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchesFilter, newlyServed, reportNumber, totalsOf, type WeeklyReportRow } from './weeklyReport';

const row = (msisdn: string, over: Partial<WeeklyReportRow> = {}): WeeklyReportRow => ({
  msisdn, aliasCode: '', fullName: '', ciTxns: 0, coTxns: 0, saServicingVal: 0, saServicingTxns: 0,
  iop: 0, cpServicingVal: 0, served: null, servedFromReport: false, active: false, activeFromReport: false,
  ownerId: null, ownerName: null, ...over,
});
const ctx = { newWakalaSet: new Set<string>(), districtOf: new Map([['255700000001', 'Masasi']]), selectedDistrict: '' };

describe('weekly report drill-down', () => {
  it('filters by the readings the figures count', () => {
    const served = row('255700000001', { served: true, active: true, cpServicingVal: 5, iop: 0 });
    const none = row('255700000002', { served: null, iop: 10 });
    assert.equal(matchesFilter(served, 'served', ctx), true);
    assert.equal(matchesFilter(none, 'nostatus', ctx), true);
    assert.equal(matchesFilter(none, 'unserved', ctx), false);
    assert.equal(matchesFilter(served, 'wakalaBank', ctx), true);
    assert.equal(matchesFilter(none, 'iopWakala', ctx), true);
    assert.equal(matchesFilter(served, 'location', { ...ctx, selectedDistrict: 'Masasi' }), true);
    assert.equal(matchesFilter(none, 'location', { ...ctx, selectedDistrict: 'Masasi' }), false);
  });
  it('a wakala is new when served now and in none of the prior weeks', () => {
    const now = [row('255700000001', { served: true }), row('255700000002', { served: true })];
    const before = [[row('255700000002', { served: true })], [row('255700000001', { served: false })]];
    assert.deepEqual([...newlyServed(now, before)], ['255700000001']);
  });
  it('totals add up the report columns and count served / active', () => {
    const t = totalsOf([
      row('1', { saServicingVal: 100, iop: 7, cpServicingVal: 3, served: true, active: true }),
      row('2', { saServicingVal: 50, iop: 1, served: false, active: true }),
    ]);
    assert.deepEqual([t.wakala, t.saServicingVal, t.iop, t.cpServicingVal, t.served, t.active], [2, 150, 8, 3, 1, 2]);
  });
  it('numbers read like the report', () => {
    assert.equal(reportNumber(7315000), '7,315,000');
    assert.equal(reportNumber(0), '-');
  });
});
