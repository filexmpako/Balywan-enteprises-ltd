import { test } from 'node:test';
import assert from 'node:assert/strict';
import { floatViewStatus, loanBalance, outstandingByOwner } from './floatOutstanding';
import type { FloatRequest, LoanRecord } from '../types';

const req = (o: Partial<FloatRequest>): FloatRequest => ({ id: 'r', ownerId: 'A', requestedAmount: 100, requestedAt: '2026-11-01', status: 'Confirmed', ...o });
const loan = (o: Partial<LoanRecord>): LoanRecord => ({
  id: 'L', ownerId: 'A', floatRequestId: 'x', amount: 30, reason: '', createdAt: '2026-10-01', approvedByManagerId: 'm', approvedByManagerName: 'M', status: 'Outstanding', ...o,
});

test('outstanding = float not returned + short return + unpaid loans, per owner', () => {
  const list = outstandingByOwner(
    [
      req({ id: 'sent', sentAmount: 80, confirmedAt: '2026-11-02' }),
      req({ id: 'short', status: 'Returned', returnedAt: '2026-11-03', returnEntries: [{ id: 'e', channel: 'M-Pesa', amount: 60 }], reminder: { byName: 'ASIA', at: '2026-11-04' } }),
      req({ id: 'full', status: 'Returned', returnEntries: [{ id: 'e', channel: 'M-Pesa', amount: 100 }] }),
      req({ id: 'pending', status: 'Pending' }),
      req({ id: 'done', status: 'Completed' }),
      req({ id: 'other', ownerId: 'B', requestedAt: '2026-11-05' }),
    ],
    [loan({}), loan({ id: 'paid', status: 'Paid' }), loan({ id: 'sub', status: 'Repayment Submitted', amount: 5, createdAt: '2026-10-10' })],
  );
  assert.deepEqual(list.map(o => [o.ownerId, o.total, o.items.map(i => i.id)]), [
    ['A', 30 + 5 + 80 + 40, ['L', 'sub', 'sent', 'short']],
    ['B', 100, ['other']],
  ]);
  assert.equal(list[0].since, '2026-10-01');
  assert.deepEqual(list[0].lastReminder, { byName: 'ASIA', at: '2026-11-04' });
  assert.equal(list[0].items[1].repaymentSubmitted, true);
  assert.deepEqual([list[0].given, list[0].paid], [30 + 5 + 80 + 100, 60]);
});
test('confirmed loan repayments reduce what is still owed', () => {
  const l = loan({ amount: 100, payments: [{ amount: 40, at: '2026-11-01', byName: 'ASIA' }] });
  assert.equal(loanBalance(l), 60);
  const [o] = outstandingByOwner([], [l, loan({ id: 'done', amount: 50, payments: [{ amount: 50, at: 'x', byName: 'M' }] })]);
  assert.deepEqual([o.given, o.paid, o.total, o.items.length], [100, 40, 60, 1]);
});
test('confirmed float shows as Not returned; loan wins over status', () => {
  assert.equal(floatViewStatus(req({})), 'Not returned');
  assert.equal(floatViewStatus(req({ status: 'Returned', loanId: 'L' })), 'Loan');
});
