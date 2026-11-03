import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyWakalaEntryEdits, buildOwnerWakalaMap } from './wakalaMapping';
import { toIsoDay } from './dateFormat';

const record = { msisdn: '255675208239', fullName: 'NEEMA AGENCY', code: 'WK1', ownerId: 'mw', ownerName: 'MWALE', altMsisdn: '255755000001', creationDate: '45200' } as any;
const entry = () => buildOwnerWakalaMap([record], [{ id: 'mw', name: 'MWALE' } as any]).byOwnerId.get('mw')![0];

describe('Base Wakala Index edits from the owner page', () => {
  it('shows the alt number carried in alt_msisdn', () => {
    assert.equal(entry().alternateNumber, '255755000001');
  });
  it('an untouched entry changes nothing', () => {
    assert.equal(applyWakalaEntryEdits(record, entry()), null);
  });
  it('writes the alternate number (normalized) and created date to the record', () => {
    const next = applyWakalaEntryEdits(record, { ...entry(), alternateNumber: '0711 222 333', dateAdded: '2026-10-05' }) as any;
    assert.equal(next.alternateNumber, '255711222333');
    assert.equal(next.altMsisdn, '255711222333');
    assert.equal(next.creationDate, '2026-10-05');
    assert.equal(next.fullName, 'NEEMA AGENCY');
    assert.equal(next.ownerId, 'mw');
  });
  it('clearing the alternate number removes it', () => {
    const next = applyWakalaEntryEdits(record, { ...entry(), alternateNumber: '' }) as any;
    assert.equal(next.altMsisdn, undefined);
  });
});

describe('toIsoDay', () => {
  it('reads Excel serials, ISO and display dates', () => {
    assert.equal(toIsoDay('45200'), '2023-10-01');
    assert.equal(toIsoDay(45200), '2023-10-01');
    assert.equal(toIsoDay('2026-10-05T10:00:00Z'), '2026-10-05');
    assert.equal(toIsoDay('16 Sep 2026'), '2026-09-16');
    assert.equal(toIsoDay(''), '');
    assert.equal(toIsoDay('not a date'), '');
  });
});
