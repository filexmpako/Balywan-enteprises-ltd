import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCounterpartyLookup, ownerTransactions } from './ownerTransactions';

const own = new Set(['255656136184', '255656136185']);
const lookup = buildCounterpartyLookup(
  {
    tills: [
      { transactionTill: '255656136184', tillName: 'BALWYN INVESTMENT MGT 4', assignedOwner: 'MWALE' },
      { transactionTill: '255656136185', tillName: 'BALWYN INVESTMENT MGT 4B', assignedOwner: 'MWALE' },
      { transactionTill: '255716857098', tillName: 'BALWYN INVESTMENT COMPANY LTD', assignedOwner: 'ASIA' },
      { transactionTill: '255656136154', tillName: 'BALWYN INVESTMENT MGT 5', assignedOwner: 'MOHAMED' },
    ],
    saTills: [{ tillMsisdn: '255716857098', ownerName: 'SA Owner' }],
    baseWakalas: [
      { msisdn: '255675208239', fullName: 'EMMANUEL KABAZA MARCO', ownerName: 'MWALE' },
      { msisdn: '255651685850', fullName: 'MWARABU JUMA MAWAZO', altMsisdn: '0716000001', ownerName: 'MOHAMED' },
    ],
    owners: [
      { id: 'o1', name: 'MWALE' },
      { id: 'o2', name: 'MOHAMED' },
    ] as any,
  },
  own,
);
const row = (from: string, to: string, amount: number, id = 'T') => ({
  Branch_msisdn: from, Dest_MSISDN: to, 'Volume (TZS)': amount, 'Transaction ID': id,
  'Wakala Name': 'BALWYN INVESTMENT MGT 4',
});

describe('owner transaction history', () => {
  const txs = ownerTransactions(
    [
      row('255656136184', '255675208239', 500_000, 'base'),
      row('255656136184', '0716000001', 200_000, 'alt'),
      row('255656136184', '255779769846', 300_000, 'iop'),
      row('255716857098', '255656136184', 9_000_000, 'topup'),
      row('255656136154', '255656136184', 1_000_000, 'peer'),
      row('255656136184', '255656136185', 50_000, 'own'),
      row('255656136154', '255675208239', 70_000, 'other-owner'),
    ],
    own,
    lookup,
  );
  const by = Object.fromEntries(txs.map(t => [t.row['Transaction ID'], t]));

  it('keeps only transfers touching the owner’s tills', () => assert.equal(txs.length, 6));
  it('a send from the owner’s till is Sent, named from the Base Wakala Index', () => {
    assert.equal(by.base.direction, 'sent');
    assert.equal(by.base.counterparty.name, 'EMMANUEL KABAZA MARCO');
    assert.equal(by.base.counterparty.detail, 'Base wakala · MWALE');
  });
  it('matches a wakala by its alternate number', () => {
    assert.equal(by.alt.counterparty.name, 'MWARABU JUMA MAWAZO');
    assert.equal(by.alt.counterparty.msisdn, '255716000001');
  });
  it('an unknown destination is IOP with no name', () => {
    assert.equal(by.iop.counterparty.kind, 'iop');
    assert.equal(by.iop.counterparty.name, null);
  });
  it('money into the owner’s till is Received, named after the sender; a till held by a non-owner is a company till', () => {
    assert.equal(by.topup.direction, 'received');
    assert.equal(by.topup.tillMsisdn, '255656136184');
    assert.equal(by.topup.counterparty.name, 'BALWYN INVESTMENT COMPANY LTD');
    assert.equal(by.topup.counterparty.detail, 'Company till');
    assert.equal(by.peer.counterparty.detail, 'Owner till · MOHAMED');
  });
  it('a transfer between the owner’s own tills is Own', () => {
    assert.equal(by.own.direction, 'own');
    assert.equal(by.own.counterparty.kind, 'own_till');
  });
});
