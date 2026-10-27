import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { changedCollectionItems, mergeCollectionItems } from './collections';

const owners = [
  { id: 'o1', name: 'MWALE' },
  { id: 'o2', name: 'PETRO' },
];

describe('list saves send only changed rows', () => {
  it('an edited row is the only one sent', () => {
    const next = [owners[0], { id: 'o2', name: 'PETRO', region: 'Mtwara' }];
    assert.deepEqual(changedCollectionItems('ownersList', owners, next), [next[1]]);
  });
  it('a new row is sent; an unchanged list sends nothing', () => {
    const added = { id: 'o3', name: 'ASIA' };
    assert.deepEqual(changedCollectionItems('ownersList', owners, [...owners, added]), [added]);
    assert.deepEqual(changedCollectionItems('ownersList', owners, [...owners].reverse()), []);
  });
  it('the first save of a list sends every row', () => {
    assert.deepEqual(changedCollectionItems('ownersList', null, owners), owners);
  });
  it('a list whose ids come from row position is sent whole', () => {
    assert.equal(changedCollectionItems('ownersList', [], [{ name: 'NO ID' }]), null);
  });
  it('Base Wakala rows are keyed by number', () => {
    const before = [{ msisdn: '255700000001', ownerName: 'MWALE' }, { msisdn: '255700000002', ownerName: 'MWALE' }];
    const after = [before[0], { msisdn: '255700000002', ownerName: 'PETRO' }];
    assert.deepEqual(changedCollectionItems('baseWakalaIndex', before, after), [after[1]]);
  });
  it('merging two partial saves keeps the newer copy of a row', () => {
    const merged = mergeCollectionItems('ownersList', [{ id: 'o1', name: 'A' }, { id: 'o2', name: 'B' }], [{ id: 'o1', name: 'C' }]);
    assert.deepEqual(merged, [{ id: 'o1', name: 'C' }, { id: 'o2', name: 'B' }]);
  });
});
