import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOwnerMatch } from './ownerMatch';

const owners = [
  { id: 'o1', name: 'MOHAMED ALLY' },
  { id: 'o2', name: 'MOHAMED' },
  { id: 'o3', name: 'HAJI', nameAliases: ['HAJI JUMA'] },
  { id: 'o4', name: 'HAJIRA' },
] as any;
const owner = (raw: string) => resolveOwnerMatch(raw, owners, 'test').matchedOwner?.id ?? null;

describe('owner name matching', () => {
  it('an exact name wins over an earlier partial match', () => assert.equal(owner('mohamed'), 'o2'));
  it('an alias is an exact match', () => assert.equal(owner('Haji Juma'), 'o3'));
  it('a partial match pointing at one owner still resolves', () => assert.equal(owner('ALLY'), 'o1'));
  it('a partial match pointing at several owners stays unmatched', () => {
    assert.equal(owner('HAJ'), null);
    assert.equal(owner('MOHAMED ALLY SAIDI'), null);
  });
});
