import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IOP_UNASSIGNED, iopAgentsForOwner, iopCicoByAgent, parseIopReportRows, summarizeIopReport } from './iopReport';

const sheet = [
  { 'TRANSACTION TILL': '255656136184', 'RETAIL AGENT MSISDN': '255711000001', SERV_STATUS: 'REWARD', MGT_TILL_Name: 'MGT 4', ' CICO VALUE ': '6,000,000', ' CICO RATIO ': '3', ' REVISED AMOUNT ': '2,000,000' },
  { 'TRANSACTION TILL': '255656136184', 'RETAIL AGENT MSISDN': '255711000001', SERV_STATUS: 'REWARD', MGT_TILL_Name: 'MGT 4', ' CICO VALUE ': '6,000,000', ' CICO RATIO ': '3', ' REVISED AMOUNT ': '2,000,000' },
  { 'TRANSACTION TILL': '255716857098', 'RETAIL AGENT MSISDN': '255711000002', SERV_STATUS: 'REWARD', MGT_TILL_Name: 'COMPANY', ' CICO VALUE ': '1', ' CICO RATIO ': '1', ' REVISED AMOUNT ': '500,000' },
  { 'TRANSACTION TILL': '255779000000', 'RETAIL AGENT MSISDN': '255675208239', SERV_STATUS: 'CLAWBACK', MGT_TILL_Name: 'OTHER CO', ' CICO VALUE ': '1', ' CICO RATIO ': '1', ' REVISED AMOUNT ': '700,000' },
  { 'TRANSACTION TILL': '255779000000', 'RETAIL AGENT MSISDN': '255675208240', SERV_STATUS: 'CLAWBACK', MGT_TILL_Name: 'OTHER CO', ' CICO VALUE ': '1', ' CICO RATIO ': '1', ' REVISED AMOUNT ': '300,000' },
  { 'TRANSACTION TILL': '255779000000', 'RETAIL AGENT MSISDN': '255675208240', SERV_STATUS: 'OTHER', MGT_TILL_Name: '', ' CICO VALUE ': '', ' CICO RATIO ': '', ' REVISED AMOUNT ': '9' },
];
const registries = {
  owners: [{ id: 'mw', name: 'MWALE', iopWakalas: [{ msisdn: '0711000001', name: 'JUMA SHOP' }] }] as any,
  tills: [
    { transactionTill: '255656136184', assignedOwner: 'MWALE' },
    { transactionTill: '255716857098', assignedOwner: 'ASIA' },
  ],
  baseWakalas: [
    { msisdn: '255675208239', ownerName: 'MWALE', fullName: 'NEEMA AGENCY' },
    { msisdn: '255675208240', ownerName: null },
  ] as any,
};

describe('IOP report', () => {
  const rows = parseIopReportRows(sheet);
  const s = summarizeIopReport(rows, registries);
  const mw = s.byOwner.find(o => o.ownerId === 'mw')!;
  const un = s.byOwner.find(o => o.ownerId === IOP_UNASSIGNED)!;

  it('reads REWARD / CLAWBACK rows, padded headers and comma numbers', () => {
    assert.equal(rows.length, 5);
    assert.equal(rows[0].revisedAmount, 2_000_000);
    assert.equal(rows[0].cicoValue, 6_000_000);
  });
  it('rewards go to the transaction till owner; identical rows each count', () => {
    assert.equal(mw.reward, 4_000_000);
    assert.equal(mw.rewardRows, 2);
  });
  it('a company till reward counts only in the company total', () => {
    assert.equal(s.companyReward, 500_000);
    assert.equal(un.reward, 500_000);
  });
  it("clawbacks go to the wakala's owner, unassigned when it has none", () => {
    assert.equal(mw.clawback, 700_000);
    assert.equal(s.unassignedClawback, 300_000);
    assert.deepEqual([s.reward, s.clawback], [4_500_000, 1_000_000]);
  });
  it('a missing required column is reported', () => {
    assert.throws(() => parseIopReportRows([{ SERV_STATUS: 'REWARD' }]), /TRANSACTION TILL/);
  });
  it("lists an owner's reward and clawback agents, one line per agent", () => {
    const a = iopAgentsForOwner(rows, registries, 'mw');
    assert.deepEqual(a.reward, [
      { agent: '255711000001', name: 'JUMA SHOP', tills: ['MGT 4'], servicings: 2, revised: 4_000_000, cicoValue: 6_000_000 },
    ]);
    assert.deepEqual(a.clawback, [
      { agent: '255675208239', name: 'NEEMA AGENCY', tills: ['OTHER CO'], servicings: 1, revised: 700_000, cicoValue: 1 },
    ]);
    assert.deepEqual(iopAgentsForOwner(rows, registries, 'nobody'), { reward: [], clawback: [] });
  });
  it("reads each agent's CICO VALUE", () => {
    assert.equal(iopCicoByAgent(rows).get('255711000001'), 6_000_000);
  });
});
