import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerFloatBlock, floatViewStatus } from './floatBlock';
import type { FloatRequest } from '../types';

const req = (o: Partial<FloatRequest>): FloatRequest => ({ id: 'r', ownerId: 'A', requestedAmount: 100, requestedAt: '2026-11-01', status: 'Confirmed', ...o });

test('owner with unreturned float cannot request', () => {
  assert.equal(ownerFloatBlock([req({})], 'A').canRequest, false);
});
test('one-time exception lets the owner request', () => {
  assert.equal(ownerFloatBlock([req({ requestException: { byId: 'm', byName: 'M', at: 'x' } })], 'A').canRequest, true);
});
test('completed, rejected or loan-converted floats do not block', () => {
  assert.equal(ownerFloatBlock([req({ status: 'Completed' }), req({ status: 'Rejected' }), req({ status: 'Returned', loanId: 'L' })], 'A').canRequest, true);
});
test('confirmed float shows as Not returned; loan wins over status', () => {
  assert.equal(floatViewStatus(req({})), 'Not returned');
  assert.equal(floatViewStatus(req({ status: 'Returned', loanId: 'L' })), 'Loan');
});
