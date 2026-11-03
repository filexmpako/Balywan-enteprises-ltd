import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyCashierVolume, cleanLines, sumLines, summarizeCashierMonth, type CashierReport } from './cashier';

const report = (reportDate: string, total: number, status: CashierReport['status'] = 'submitted'): CashierReport =>
  ({ reportId: reportDate, reportDate, lines: [], total, notes: null, status, submittedAt: '', reviewedAt: null, reviewNote: null });

describe('cashier', () => {
  it('reads the lines the cashier wrote', () => {
    const lines = cleanLines([{ label: 'Yas', amount: '38,144,826' }, { label: 'Nmb', amount: 20007035 }, { label: ' ', amount: 5 }, { label: 'Crdb', amount: 'x' }]);
    assert.deepEqual(lines, [{ label: 'Yas', amount: 38144826 }, { label: 'Nmb', amount: 20007035 }]);
    assert.equal(sumLines(lines), 58151861);
  });

  it('splits till sends into base, IOP and internal', () => {
    const v = classifyCashierVolume(
      [
        { dest: '0675208239', amount: 1_000_000 },
        { dest: '255711000001', amount: 500_000 },
        { dest: '255716857098', amount: 2_000_000 },
        { dest: '255675208239', amount: -300_000 },
      ],
      { baseNumbers: new Set(['255675208239']), ownTills: new Set(['255716857098']) },
    );
    assert.deepEqual(v, { base: 1_300_000, iop: 500_000, internal: 2_000_000, txns: { base: 2, iop: 1, internal: 1 } });
  });

  it('profit = latest cash held + expenses − capital; returned items do not count', () => {
    const s = summarizeCashierMonth(
      { capital: 70_000_000, volumeTarget: 4_000_000, returnedAmount: null, returnedAt: null, notes: null },
      [report('2026-10-20', 69_622_161, 'approved'), report('2026-10-23', 99_000_000, 'returned'), report('2026-10-22', 70_100_000)],
      [
        { expenseId: 'a', expenseDate: '2026-10-20', description: 'CCM rent', amount: 200_000, status: 'approved' },
        { expenseId: 'b', expenseDate: '2026-10-21', description: 'x', amount: 9_000, status: 'returned' },
      ],
      { base: 1_300_000, iop: 500_000, internal: 2_000_000, txns: { base: 2, iop: 1, internal: 1 } },
    );
    assert.equal(s.held, 70_100_000);
    assert.equal(s.heldDate, '2026-10-22');
    assert.equal(s.expenses, 200_000);
    assert.equal(s.profit, 300_000);
    assert.equal(s.served, 1_800_000);
    assert.equal(s.progress, 0.45);
    assert.equal(s.pendingReports, 1);
  });
});
