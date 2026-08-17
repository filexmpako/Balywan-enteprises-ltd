import { Owner, Personnel, AgentTarget } from '../types';
import { getClassifiedRowsCached } from './classificationCache';
import { getDailyServicingRows, saveDailyServicingData, getServicingRows } from './indexedDB';
import { normalizeMsisdn } from './msisdn';
import { resolveOwnerMatch } from './ownerMatch';

export interface Till {
  id: string;
  transactionTill: string; // the Branch MSISDN
  tillName: string;
  assignedOwner: string; // Owner or Personnel name
  location: string;
  status: string;
}

/**
 * Note: Transaction ID alone is NOT a standalone primary key for servicing rows.
 * The primary key / uniqueness constraint is defined as a COMPOSITE key of (Transaction ID, Branch_msisdn)
 * to support multi-legged internal P2P transfers.
 */
export interface ServicingRow {
  _id: string;
  "Transaction ID": string;
  "Branch_msisdn": string;
  "Dest_MSISDN": string;
  "Wakala Name": string;
  "Agent ID": string;
  "Wakala Owner": string;
  "Zone": string;
  "Volume (TZS)": number;
  "Status": string;
  "Servicing Date": string;
  "Servicing Timestamp": string;
  "source_balance_before": number;
  "source_balance_after": number;
}

export interface MappedTransaction {
  id: string;
  transactionId: string;
  branchMsisdn: string;
  destMsisdn: string;
  tillName: string;
  ownerName: string;
  personType: 'Owner' | 'Personnel' | null;
  location: string;
  volume: number; // Represents the money movement (positive or negative)
  sourceBalanceBefore: number;
  sourceBalanceAfter: number;
  status: string;
  date: string;
  timestamp: string;
  isMapped: boolean;
  isDuplicate: boolean;
  validationErrors: string[];
  [key: string]: any; // Allow original extra CSV properties
}

export interface DailySummaryStats {
  totalTxns: number;
  mappedCount: number;
  unmappedCount: number;
  totalVolume: number; // Sum of served amounts (absolute value of negative entries)
  ownersUpdated: number;
  personnelUpdated: number;
  validationErrorsCount: number;
  readyForImport: number;
}

export interface PersonDailyPerformance {
  id: string;
  name: string;
  assignedTills: string[];
  transactionsCount: number;
  totalValue: number; // Sum of absolute value of negative amounts (Served Amount)
  avgValue: number;
  highestTx: number;
  lowestTx: number;
  successfulTxns: number;
  failedTxns: number;
  contributionPercent: number;
  status: 'Active' | 'Inactive';
  title?: string; // Optional for personnel
  openingFloat: number;
  remainingFloat: number;
  servedAmount: number;
}

/**
 * Clean and format any date/timestamp into YYYY-MM-DD
 */
export function formatToISODate(dateStr: string): string {
  if (!dateStr || typeof dateStr !== 'string') {
    return new Date().toISOString().split('T')[0];
  }
  const trimmed = dateStr.trim();
  if (!trimmed) {
    return new Date().toISOString().split('T')[0];
  }

  // Handle YYYY-MM-DD format directly
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.substring(0, 10);
  }

  // Handle DD-MMM-YYYY HH:MM:SS (e.g. "04-Jul-2026 10:50:42")
  const parts = trimmed.split(/[\s-]/);
  if (parts.length >= 3) {
    const dayStr = parts[0];
    const monthName = parts[1];
    const yearStr = parts[2];
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthIdx = months.findIndex(m => m.toLowerCase() === monthName.toLowerCase());
    if (monthIdx !== -1 && /^\d+$/.test(dayStr) && /^\d+$/.test(yearStr)) {
      const year = yearStr.length === 2 ? `20${yearStr}` : yearStr;
      const month = String(monthIdx + 1).padStart(2, '0');
      const day = String(parseInt(dayStr)).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }

  // Try standard Date parsing
  try {
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  } catch (e) {}

  return new Date().toISOString().split('T')[0];
}

/**
 * Parses full timestamp (including time of day) into epoch millisecond number for sorting
 */
export function getTimestampEpoch(timestampStr: string): number {
  if (!timestampStr) return 0;
  const trimmed = timestampStr.trim();
  if (!trimmed) return 0;

  // Handle DD-MMM-YYYY HH:MM:SS (e.g. "04-Jul-2026 10:50:42")
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    const datePart = parts[0];
    const timePart = parts[1];
    
    const dateParts = datePart.split('-');
    if (dateParts.length === 3) {
      const dayStr = dateParts[0];
      const monthName = dateParts[1];
      const yearStr = dateParts[2];
      
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthIdx = months.findIndex(m => m.toLowerCase() === monthName.toLowerCase());
      if (monthIdx !== -1 && /^\d+$/.test(dayStr) && /^\d+$/.test(yearStr)) {
        const year = parseInt(yearStr.length === 2 ? `20${yearStr}` : yearStr);
        const month = monthIdx;
        const day = parseInt(dayStr);
        
        const timeParts = timePart.split(':');
        const hour = timeParts[0] ? parseInt(timeParts[0]) : 0;
        const minute = timeParts[1] ? parseInt(timeParts[1]) : 0;
        const second = timeParts[2] ? parseInt(timeParts[2]) : 0;
        
        return new Date(year, month, day, hour, minute, second).getTime();
      }
    }
  }

  const parsed = Date.parse(trimmed);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Clean and parse float values that may contain commas or currency symbols
 */
export function getFloatVal(val: any): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const cleaned = String(val).replace(/,/g, '').replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Robustly extracts the transaction ID or external reference as a pure string (text),
 * preventing precision loss from scientific notation or floating-point conversions.
 * It ignores autogenerated client-side unique IDs like "mgt-txn-parsed..." or "txn-".
 */
export function getTransactionReferenceId(tx: any): string {
  if (!tx) return '';

  const candidateKeys = [
    'transactionId',
    'Transaction ID',
    'transaction_id',
    'transactionid',
    'TransactionID',
    'tx_id',
    'txid',
    'transactio',
    'external_reference',
    'External Reference',
    'externalReference',
    'externalreference',
    'ref',
    'reference',
    'receipt',
    'receipt_no',
    'Receipt No',
    'receiptno',
    'ReceiptNo'
  ];

  for (const key of candidateKeys) {
    if (tx[key] !== undefined && tx[key] !== null && String(tx[key]).trim() !== '') {
      return String(tx[key]).trim();
    }
  }

  // Fallback to ID keys only if they do not look like generated IDs
  const fallbackKeys = ['id', '_id', 'ID', 'Id'];
  for (const key of fallbackKeys) {
    const val = tx[key];
    if (val !== undefined && val !== null) {
      const valStr = String(val).trim();
      if (
        valStr !== '' &&
        !valStr.startsWith('mgt-txn-parsed') &&
        !valStr.startsWith('txn-') &&
        !valStr.startsWith('servicing-') &&
        !valStr.startsWith('s-') &&
        !valStr.startsWith('kpi-')
      ) {
        return valStr;
      }
    }
  }

  return '';
}

/**
 * Parses and maps raw transactions to their corresponding registered Tills and Persons
 */
export function mapTransactions(
  rawTransactions: any[],
  tillsList: Till[],
  currentOwners: Owner[],
  currentPersonnel: Personnel[],
  existingTransactions: any[] = []
): MappedTransaction[] {
  // Create a set of previously imported transaction composite keys (Transaction ID + Branch_msisdn)
  // for accurate duplicate detection. This satisfies Rule 4 and Rule 3 (no comparisons inside current file).
  const existingTxCompositeKeys = new Set(
    existingTransactions.map((tx) => {
      const id = getTransactionReferenceId(tx);
      const msisdn = (tx.Branch_msisdn || tx.branch_msisdn || tx.msisdn || tx.BranchMsisdn || '').trim();
      return id && msisdn ? `${id.toLowerCase()}_${msisdn}` : '';
    }).filter(Boolean)
  );

  return rawTransactions.map((tx, idx) => {
    const branchMsisdn = (tx.branchMsisdn || tx.branch_msisdn || tx.msisdn || tx.Branch_msisdn || '').trim();
    const destMsisdn = (tx.destMsisdn || tx.dest_msisdn || tx.Dest_MSISDN || tx.dest_MSISDN || '').trim();
    
    // Treat transaction IDs/references strictly as text (Rule 5)
    const rawRef = getTransactionReferenceId(tx);
    const hasMissingRef = !rawRef;
    const transactionId = rawRef || tx.transactionId || `TXN-TEMP-${idx}-${Date.now()}`;
    
    // Parse money movement amounts (negative is allowed and valid)
    const volume = getFloatVal(tx.Amount || tx.amount || tx.volume || tx.value || '0');
    const sourceBalanceBefore = getFloatVal(tx.source_balance_before || tx.sourcebalancebefore || tx.balance_before || tx.OpeningFloat || '0');
    const sourceBalanceAfter = getFloatVal(tx.source_balance_after || tx.sourcebalanceafter || tx.balance_after || tx.RemainingFloat || '0');

    const status = (tx.status || 'Completed').trim();
    const rawTimestamp = tx.tranferdate || tx.TranferDate || tx.transferdate || tx.TransferDate || tx.tranferda || tx.transfer_da || tx.transfer_date || tx.timestamp || tx.date || tx.transaction_date || tx['Servicing Timestamp'] || tx['servicing timestamp'] || '';
    const finalTimestamp = rawTimestamp && String(rawTimestamp).trim() ? String(rawTimestamp).trim() : new Date().toISOString();
    const date = formatToISODate(finalTimestamp);

    // Find registered Till using Branch MSISDN
    const matchedTill = tillsList.find(
      (t) => t.transactionTill?.trim() === branchMsisdn
    );

    let assignedPersonName = 'N/A';
    let assignedPersonId = 'MA-UNKNOWN';
    let isMapped = false;
    let personType: 'Owner' | 'Personnel' | null = null;
    let tillName = 'Unregistered Till';
    let location = 'N/A';

    if (matchedTill) {
      assignedPersonName = matchedTill.assignedOwner;
      tillName = matchedTill.tillName;
      location = matchedTill.location;
      isMapped = true;

      // Classify whether the assigned person is an Owner or a Personnel
      const matchedOwner = currentOwners.find(
        (o) => o && o.name && o.name.toLowerCase() === assignedPersonName.toLowerCase()
      );
      const matchedPersonnel = currentPersonnel.find(
        (p) => p && p.name && p.name.toLowerCase() === assignedPersonName.toLowerCase()
      );

      if (matchedOwner) {
        personType = 'Owner';
        assignedPersonId = matchedOwner.masterAgentId || matchedOwner.id || 'MA-UNKNOWN';
      } else if (matchedPersonnel) {
        personType = 'Personnel';
        assignedPersonId = matchedPersonnel.id || 'MA-UNKNOWN';
      }
    }

    const compositeKey = `${transactionId.toLowerCase()}_${branchMsisdn}`;

    // Determine duplication status strictly against already imported records (Rule 4, 6) using the composite key
    // Avoid marking as duplicate if it was a missing reference that we backfilled temporarily.
    const isDuplicate = !hasMissingRef && existingTxCompositeKeys.has(compositeKey);

    // Build the structural checklist of validation anomalies
    const validationErrors: string[] = [];
    if (!branchMsisdn) {
      validationErrors.push('Missing Branch MSISDN');
    } else if (!matchedTill) {
      validationErrors.push('Unknown Till');
    } else if (!personType) {
      validationErrors.push('Unknown Owner');
    }
    
    if (hasMissingRef && !tx.transactionId) {
      validationErrors.push('Missing Transaction Reference');
    }
    if (isDuplicate) {
      validationErrors.push('Duplicate Transaction');
    }
    if (isNaN(volume)) {
      validationErrors.push('Corrupted Records');
    }
    if (!date || isNaN(Date.parse(date))) {
      validationErrors.push('Invalid Date Format');
    }

    const stableId = rawRef && branchMsisdn
      ? `mgt-${rawRef.toLowerCase()}_${branchMsisdn}`
      : rawRef
      ? `mgt-${rawRef.toLowerCase()}`
      : `txn-${idx}`;

    return {
      ...tx,
      id: tx.id || stableId,
      transactionId,
      branchMsisdn,
      destMsisdn,
      tillName,
      ownerName: assignedPersonName,
      ownerId: assignedPersonId,
      personType,
      location,
      volume,
      sourceBalanceBefore,
      sourceBalanceAfter,
      status,
      date,
      timestamp: finalTimestamp,
      isMapped,
      isDuplicate,
      validationErrors,
    };
  });
}

/**
 * Calculates aggregate KPIs and system counters for the parsed dataset
 */
export function calculateCompanyStats(mappedTransactions: MappedTransaction[]): DailySummaryStats {
  const totalTxns = mappedTransactions.length;
  const mappedTxns = mappedTransactions.filter((t) => t.isMapped);
  const unmappedTxns = mappedTransactions.filter((t) => !t.isMapped);

  // Sum of absolute values of all Amount entries (Served Amount)
  const totalVolume = mappedTxns
    .reduce((acc, t) => acc + Math.abs(t.volume), 0);

  const unmappedCount = unmappedTxns.length;
  const validationErrorsCount = mappedTransactions.reduce(
    (acc, t) => acc + t.validationErrors.length,
    0
  );

  const ownersUpdatedSet = new Set<string>();
  const personnelUpdatedSet = new Set<string>();

  mappedTxns.forEach((t) => {
    if (t.personType === 'Owner') {
      ownersUpdatedSet.add(t.ownerName);
    } else if (t.personType === 'Personnel') {
      personnelUpdatedSet.add(t.ownerName);
    }
  });

  return {
    totalTxns,
    mappedCount: mappedTxns.length,
    unmappedCount,
    totalVolume,
    ownersUpdated: ownersUpdatedSet.size,
    personnelUpdated: personnelUpdatedSet.size,
    validationErrorsCount,
    readyForImport: mappedTxns.filter((t) => t.validationErrors.length === 0).length,
  };
}

/**
 * Generates Daily Performance Summaries for all owners
 */
export function generateOwnerSummaries(
  mappedTransactions: MappedTransaction[],
  currentOwners: Owner[],
  tillsList: Till[],
  totalVolume: number
): PersonDailyPerformance[] {
  return currentOwners
    .map((owner) => {
      const assignedTills = tillsList
        .filter((t) => t.assignedOwner.toLowerCase() === owner.name.toLowerCase())
        .map((t) => t.transactionTill);

      const ownerTxns = mappedTransactions.filter(
        (t) => t.isMapped && t.ownerName.toLowerCase() === owner.name.toLowerCase()
      );

      // Group by till to compute opening/remaining floats
      const tillGroups: { [msisdn: string]: MappedTransaction[] } = {};
      ownerTxns.forEach((t) => {
        if (!tillGroups[t.branchMsisdn]) {
          tillGroups[t.branchMsisdn] = [];
        }
        tillGroups[t.branchMsisdn].push(t);
      });

      let openingFloat = 0;
      let remainingFloat = 0;

      Object.keys(tillGroups).forEach((msisdn) => {
        const txs = tillGroups[msisdn];
        // Sort chronologically to find start/end of day
        const sorted = [...txs].sort((a, b) => {
          const tsA = getTimestampEpoch(a.timestamp || a.date || '');
          const tsB = getTimestampEpoch(b.timestamp || b.date || '');
          if (tsA !== tsB) return tsA - tsB;
          const idA = (a?._id || a?.id || a?.['Receipt No'] || a?.['Receipt_No'] || '').toString();
          const idB = (b?._id || b?.id || b?.['Receipt No'] || b?.['Receipt_No'] || '').toString();
          return idA.localeCompare(idB);
        });

        const earliest = sorted[0];
        const latest = sorted[sorted.length - 1];

        openingFloat += earliest ? earliest.sourceBalanceBefore : 0;
        remainingFloat += latest ? latest.sourceBalanceAfter : 0;
      });

      // Served Amount = Sum of the absolute values of all Amount entries
      const servedAmount = ownerTxns.reduce((acc, t) => acc + Math.abs(t.volume), 0);
      const floatReceived = 0;
      const floatServed = servedAmount;

      const successfulTxns = ownerTxns.filter(
        (t) => t.status.toLowerCase() === 'completed' || t.status.toLowerCase() === 'success'
      ).length;

      const failedTxns = ownerTxns.length - successfulTxns;
      
      // Largest & Smallest transaction by absolute value
      const highestTx = ownerTxns.length > 0 ? Math.max(...ownerTxns.map((t) => Math.abs(t.volume))) : 0;
      const lowestTx = ownerTxns.length > 0 ? Math.min(...ownerTxns.map((t) => Math.abs(t.volume))) : 0;
      const avgValue = ownerTxns.length > 0 ? servedAmount / ownerTxns.length : 0;

      const contributionPercent = totalVolume > 0 ? (servedAmount / totalVolume) * 100 : 0;

      return {
        id: owner.id,
        name: owner.name,
        assignedTills,
        transactionsCount: ownerTxns.length,
        totalValue: servedAmount,
        avgValue,
        highestTx,
        lowestTx,
        successfulTxns,
        failedTxns,
        contributionPercent,
        status: ownerTxns.length > 0 ? ('Active' as const) : ('Inactive' as const),
        openingFloat,
        remainingFloat,
        closingFloat: remainingFloat,
        servedAmount,
        floatReceived,
        floatServed,
      };
    })
    .sort((a, b) => b.totalValue - a.totalValue);
}

/**
 * Generates Daily Performance Summaries for all personnel
 */
export function generatePersonnelSummaries(
  mappedTransactions: MappedTransaction[],
  currentPersonnel: Personnel[],
  tillsList: Till[],
  totalVolume: number
): PersonDailyPerformance[] {
  return currentPersonnel
    .map((person) => {
      const assignedTills = tillsList
        .filter((t) => t.assignedOwner.toLowerCase() === person.name.toLowerCase())
        .map((t) => t.transactionTill);

      const personTxns = mappedTransactions.filter(
        (t) => t.isMapped && t.ownerName.toLowerCase() === person.name.toLowerCase()
      );

      // Group by till to compute opening/remaining floats
      const tillGroups: { [msisdn: string]: MappedTransaction[] } = {};
      personTxns.forEach((t) => {
        if (!tillGroups[t.branchMsisdn]) {
          tillGroups[t.branchMsisdn] = [];
        }
        tillGroups[t.branchMsisdn].push(t);
      });

      let openingFloat = 0;
      let remainingFloat = 0;

      Object.keys(tillGroups).forEach((msisdn) => {
        const txs = tillGroups[msisdn];
        // Sort chronologically to find start/end of day
        const sorted = [...txs].sort((a, b) => {
          const tsA = getTimestampEpoch(a.timestamp || a.date || '');
          const tsB = getTimestampEpoch(b.timestamp || b.date || '');
          if (tsA !== tsB) return tsA - tsB;
          const idA = (a?._id || a?.id || a?.['Receipt No'] || a?.['Receipt_No'] || '').toString();
          const idB = (b?._id || b?.id || b?.['Receipt No'] || b?.['Receipt_No'] || '').toString();
          return idA.localeCompare(idB);
        });

        const earliest = sorted[0];
        const latest = sorted[sorted.length - 1];

        openingFloat += earliest ? earliest.sourceBalanceBefore : 0;
        remainingFloat += latest ? latest.sourceBalanceAfter : 0;
      });

      // Served Amount = Sum of the absolute values of all Amount entries
      const servedAmount = personTxns.reduce((acc, t) => acc + Math.abs(t.volume), 0);
      const floatReceived = 0;
      const floatServed = servedAmount;

      const successfulTxns = personTxns.filter(
        (t) => t.status.toLowerCase() === 'completed' || t.status.toLowerCase() === 'success'
      ).length;

      const failedTxns = personTxns.length - successfulTxns;
      
      // Largest & Smallest transaction by absolute value
      const highestTx = personTxns.length > 0 ? Math.max(...personTxns.map((t) => Math.abs(t.volume))) : 0;
      const lowestTx = personTxns.length > 0 ? Math.min(...personTxns.map((t) => Math.abs(t.volume))) : 0;
      const avgValue = personTxns.length > 0 ? servedAmount / personTxns.length : 0;

      const contributionPercent = totalVolume > 0 ? (servedAmount / totalVolume) * 100 : 0;

      return {
        id: person.id,
        name: person.name,
        title: person.title,
        assignedTills,
        transactionsCount: personTxns.length,
        totalValue: servedAmount,
        avgValue,
        highestTx,
        lowestTx,
        successfulTxns,
        failedTxns,
        contributionPercent,
        status: personTxns.length > 0 ? ('Active' as const) : ('Inactive' as const),
        openingFloat,
        remainingFloat,
        closingFloat: remainingFloat,
        servedAmount,
        floatReceived,
        floatServed,
      };
    })
    .sort((a, b) => b.totalValue - a.totalValue);
}

/**
 * Utility to group transactions by assigned person name
 */
export function groupTransactionsByPerson(mappedTransactions: MappedTransaction[]): {
  [personName: string]: MappedTransaction[];
} {
  const groups: { [personName: string]: MappedTransaction[] } = {};
  mappedTransactions.forEach((tx) => {
    if (tx.isMapped) {
      const name = tx.ownerName;
      if (!groups[name]) {
        groups[name] = [];
      }
      groups[name].push(tx);
    }
  });
  return groups;
}

export function assignTillsToPerson(tillsStr: string, personName: string, title: string, location: string = 'N/A'): void {
  const savedTills = localStorage.getItem('tillsList');
  let currentTills: any[] = [];
  if (savedTills) {
    try { currentTills = JSON.parse(savedTills); } catch (e) {}
  }

  const assignedTills = tillsStr.split(',').map(t => t.trim()).filter(Boolean);
  if (assignedTills.length === 0) return;

  // 1. Overwrite or add these tills with the new owner/personName, removing them from other owners
  assignedTills.forEach(tillMsisdn => {
    // Remove from any other people first
    currentTills = currentTills.map(t => {
      if (t.transactionTill === tillMsisdn && t.assignedOwner?.toLowerCase() !== personName.toLowerCase()) {
        return {
          ...t,
          assignedOwner: personName,
          title: title,
          location: location
        };
      }
      return t;
    });

    const existingIdx = currentTills.findIndex(t => t.transactionTill === tillMsisdn);
    if (existingIdx !== -1) {
      currentTills[existingIdx] = {
        ...currentTills[existingIdx],
        assignedOwner: personName,
        title: title,
        location: location
      };
    } else {
      currentTills.push({
        transactionTill: tillMsisdn,
        tillName: `Wakala Till ${tillMsisdn.slice(-4)}`,
        location: location,
        assignedOwner: personName,
        title: title,
        status: 'Active'
      });
    }
  });

  // 2. Clean up any historical duplicate entries in currentTills for the same till
  const cleanTills: any[] = [];
  currentTills.forEach(t => {
    const key = (t.transactionTill || '').trim();
    if (key) {
      const idx = cleanTills.findIndex(ct => ct.transactionTill === key);
      if (idx !== -1) {
        cleanTills[idx] = t;
      } else {
        cleanTills.push(t);
      }
    }
  });

  localStorage.setItem('tillsList', JSON.stringify(cleanTills));
}

/**
 * Automatically recalculates performance for all owners and personnel based on the latest date in servicingDataRows.
 * Performance (%) = (Person Total Served Amount ÷ Company Total Served Amount) * 100
 */
export async function recalculateAllPerformances(providedRows?: any[]): Promise<void> {
  let realRows: any[] = [];
  if (providedRows && Array.isArray(providedRows) && providedRows.length > 0) {
    realRows = providedRows;
  } else {
    try {
      realRows = await getDailyServicingRows();
    } catch (e) {
      return;
    }
  }
  if (!Array.isArray(realRows) || realRows.length === 0) return;

  // 1. Deduplicate by composite key (Transaction ID + Branch_msisdn) to preserve data integrity
  const uniqueRows: any[] = [];
  const seenKeys = new Set<string>();
  realRows.forEach((row) => {
    const txId = getTransactionReferenceId(row);
    const msisdn = (row['Branch_msisdn'] || row['branch_msisdn'] || row['msisdn'] || row['BranchMsisdn'] || '').trim();
    if (txId && msisdn) {
      const key = `${txId.toLowerCase()}_${msisdn}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueRows.push(row);
      }
    } else {
      uniqueRows.push(row);
    }
  });

  // Persist the deduplicated ledger back to maintain clean state
  try {
    await saveDailyServicingData(uniqueRows);
  } catch (e) {}

  const getAmountVal = (row: any) => {
    const val = row['Volume (TZS)'] || row['Volume'] || row['Amount'] || row['value'] || row['volume'] || 0;
    if (typeof val === 'number') return val;
    const cleaned = String(val).replace(/,/g, '').replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  const getBeforeVal = (row: any) => {
    const val = row['source_balance_before'] || row['sourcebalancebefore'] || row['balance_before'] || row['OpeningFloat'] || row['Opening Float'] || 0;
    if (typeof val === 'number') return val;
    const cleaned = String(val).replace(/,/g, '').replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  const getAfterVal = (row: any) => {
    const val = row['source_balance_after'] || row['sourcebalanceafter'] || row['balance_after'] || row['RemainingFloat'] || row['ClosingFloat'] || row['Closing Float'] || 0;
    if (typeof val === 'number') return val;
    const cleaned = String(val).replace(/,/g, '').replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Load reference tables needed for classification
  const savedSaTillRegistry = localStorage.getItem('saTillRegistry');
  const savedBaseWakalaIndex = localStorage.getItem('baseWakalaIndex');
  let saTillRegistry: any[] = [];
  let baseWakalaIndex: any[] = [];
  try { saTillRegistry = savedSaTillRegistry ? JSON.parse(savedSaTillRegistry) : []; } catch (e) {}
  try { baseWakalaIndex = savedBaseWakalaIndex ? JSON.parse(savedBaseWakalaIndex) : []; } catch (e) {}

  // Classify every row so SA-internal (till-to-till) transfers can be
  // excluded from all volume totals below
  const savedTillsForClassification = localStorage.getItem('tillsList');
  const savedOwnersForClassification = localStorage.getItem('ownersList');
  let tillsForClassification: any[] = [];
  let ownersForClassification: any[] = [];
  try { tillsForClassification = savedTillsForClassification ? JSON.parse(savedTillsForClassification) : []; } catch (e) {}
  try { ownersForClassification = savedOwnersForClassification ? JSON.parse(savedOwnersForClassification) : []; } catch (e) {}

  const classifiedRows = getClassifiedRowsCached(
    uniqueRows as any,
    saTillRegistry,
    baseWakalaIndex,
    tillsForClassification,
    ownersForClassification
  );
  const saInternalRowIds = new Set(
    classifiedRows
      .filter(c => c.bucket === 'SA_INTERNAL')
      .map(c => c.row._id)
  );
  const billableRows = uniqueRows.filter(row => !saInternalRowIds.has(row._id));

  if (billableRows.length === 0) return;

  // Find the most recent date among billable transactions
  const dates = billableRows.map(row => row['Servicing Date'] || row['date'] || '').filter(Boolean);
  const uniqueDates = Array.from(new Set(dates));
  if (uniqueDates.length === 0) return;

  uniqueDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  const selectedDay = uniqueDates[0];

  // Company Total Served Amount for the selected day — unsigned volume,
  // excluding SA-internal transfers
  const dayRows = billableRows.filter(row => (row['Servicing Date'] || row['date'] || '') === selectedDay);
  const companyTotalServed = dayRows.reduce((acc, row) => acc + Math.abs(getAmountVal(row)), 0);
  const companyTotalServedAdj = companyTotalServed || 1;

  // Load database lists
  const savedOwners = localStorage.getItem('ownersList');
  const savedPersonnel = localStorage.getItem('personnelList');
  const savedTills = localStorage.getItem('tillsList');

  let tillsList: any[] = [];
  if (savedTills) {
    try { tillsList = JSON.parse(savedTills); } catch (e) {}
  }

  let ownersList: any[] = [];
  if (savedOwners) {
    try { ownersList = JSON.parse(savedOwners); } catch (e) {}
  }

  let personnelList: any[] = [];
  if (savedPersonnel) {
    try { personnelList = JSON.parse(savedPersonnel); } catch (e) {}
  }

  // --- DATA INTEGRITY SCAN & DEDUPLICATION (Fix 1 & Fix 2) ---
  const tillAppearances: { [till: string]: any[] } = {};
  tillsList.forEach(t => {
    const tillKey = (t.transactionTill || '').trim();
    if (tillKey) {
      if (!tillAppearances[tillKey]) {
        tillAppearances[tillKey] = [];
      }
      tillAppearances[tillKey].push(t);
    }
  });

  const duplicates = Object.entries(tillAppearances).filter(([_, list]) => list.length > 1);
  if (duplicates.length > 0) {
    duplicates.forEach(([tillKey, list]) => {
      const owners = list.map(t => t.assignedOwner || t.ownerName || 'Unknown Owner');
      console.error(`[Data Integrity Violation] Duplicate transactionTill "${tillKey}" detected. Claimed owners: ${owners.join(', ')}`);
    });
  }

  // Strict deduplication: build a clean tills list where each transactionTill occurs exactly once
  const seenTills = new Map<string, any>();
  tillsList.forEach(t => {
    const tillKey = (t.transactionTill || '').trim();
    if (tillKey) {
      seenTills.set(tillKey, t);
    }
  });
  const deduplicatedTillsList = Array.from(seenTills.values());

  const validationWarnings: any[] = [];

  // --- DUPLICATE TILL SCANNER (PART 2) ---
  const tillToPeopleMap: { [till: string]: { name: string, type: 'Owner' | 'Personnel', id: string }[] } = {};

  ownersList.forEach((o: any) => {
    if (!o || !o.name) return;
    const tills = o.assignedTills || [];
    tills.forEach((t: string) => {
      const cleaned = String(t).trim();
      if (cleaned) {
        if (!tillToPeopleMap[cleaned]) {
          tillToPeopleMap[cleaned] = [];
        }
        if (!tillToPeopleMap[cleaned].some(p => p.name && p.name.toLowerCase() === o.name.toLowerCase())) {
          tillToPeopleMap[cleaned].push({ name: o.name, type: 'Owner', id: o.id || '' });
        }
      }
    });
  });

  const duplicateTillsList: any[] = [];
  Object.entries(tillToPeopleMap).forEach(([tillNo, people]) => {
    if (people.length > 1) {
      const message = `Till ${tillNo} is currently assigned to BOTH ${people[0].type} ${people[0].name} and ${people[1].type} ${people[1].name} — this is causing their served amounts to overlap. Remove the incorrect assignment in People Management to fix this.`;
      
      validationWarnings.push({
        type: 'Duplicate Till Assignment',
        tillNumber: tillNo,
        people: people,
        message: message,
        timestamp: new Date().toISOString()
      });
      
      duplicateTillsList.push({
        tillNumber: tillNo,
        people: people,
        message: message
      });
    }
  });

  localStorage.setItem('duplicateTillAssignments', JSON.stringify(duplicateTillsList));

  // Load Monthly Servicing Rows for Penalty calculation
  let monthlyServicingRows: any[] = [];
  try {
    monthlyServicingRows = await getServicingRows();
  } catch (e) {
    console.error("Failed loading monthly servicing rows in recalculateAllPerformances:", e);
  }

  // Build Base Wakala MSISDN lookup map
  const baseWakalaByMsisdn = new Map<string, any>();
  if (Array.isArray(baseWakalaIndex)) {
    baseWakalaIndex.forEach(w => {
      const msisdnKey = normalizeMsisdn(w.msisdn);
      if (msisdnKey) baseWakalaByMsisdn.set(msisdnKey, w);
      const altKey = normalizeMsisdn((w as any).altMsisdn || (w as any).alternateNumber);
      if (altKey) baseWakalaByMsisdn.set(altKey, w);
    });
  }

  // Compute penalty per owner
  const penaltyByOwnerMap: Record<string, number> = {};
  const penaltyKeys = ['CP_Servicing_Val', 'CP Servicing Val', 'cp_servicing_val', 'CP_Servicing_Value', 'cp_servicing_value', 'penalty', 'Penalty'];
  monthlyServicingRows.forEach(row => {
    let penaltyVal = 0;
    for (const k of penaltyKeys) {
      if (row[k] !== undefined && row[k] !== null && row[k] !== '') {
        const v = typeof row[k] === 'number' ? row[k] : parseFloat(String(row[k]).replace(/,/g, '').replace(/[^0-9.-]/g, ''));
        if (!isNaN(v)) { penaltyVal = v; break; }
      }
    }
    if (penaltyVal !== 0) {
      const rawMsisdn = String(row.MSISDN || row.msisdn || row.phone || row.Branch_msisdn || '');
      const normMsisdn = normalizeMsisdn(rawMsisdn);
      const baseMatch = normMsisdn ? baseWakalaByMsisdn.get(normMsisdn) : undefined;
      if (baseMatch && baseMatch.ownerName) {
        const matchResult = resolveOwnerMatch(baseMatch.ownerName, ownersList, 'Penalty Calculation');
        if (matchResult.matchedOwner) {
          const ownerId = matchResult.matchedOwner.id;
          const ownerNameLower = matchResult.matchedOwner.name.toLowerCase();
          penaltyByOwnerMap[ownerId] = (penaltyByOwnerMap[ownerId] || 0) + penaltyVal;
          penaltyByOwnerMap[ownerNameLower] = (penaltyByOwnerMap[ownerNameLower] || 0) + penaltyVal;
        }
      }
    }
  });

  // 2. FIRST, reset openingFloat, floatReceived, floatServed, and closingFloat to 0 for all Owners
  const resetOwners = ownersList.map((owner: any) => ({
    ...owner,
    openingFloat: 0,
    floatReceived: 0,
    floatServed: 0,
    closingFloat: 0,
    remainingFloat: 0,
    servedAmount: 0,
    transactionsToday: 0,
    avgValue: 0,
    highestTx: 0,
    lowestTx: 0,
    performance: 0,
    penalty: 0,
    iopVolume: 0,
  }));

  const resetPersonnel = personnelList;

  // 3. Recompute metrics pure from the deduplicated day's transactions
  const updatedOwners = resetOwners.map((owner: any) => {
    if (!owner) return owner;
    const ownerId = owner.id || '';
    const ownerNameLower = (owner.name || '').toLowerCase();

    // 1. Resolve Penalty from monthly servicing rows
    const penalty = (ownerId && penaltyByOwnerMap[ownerId]) || (ownerNameLower && penaltyByOwnerMap[ownerNameLower]) || 0;

    // 2. Calculate IOP Volume (wakala not registered to anyone in the company)
    const iopRows = classifiedRows.filter(c => 
      c.bucket === 'IOP' && 
      ((ownerId && c.attributedOwnerId === ownerId) || (ownerNameLower && c.attributedOwnerName?.toLowerCase() === ownerNameLower))
    );
    const iopVolume = iopRows.reduce((acc, c) => acc + Math.abs(getAmountVal(c.row)), 0);

    const assignedTills = Array.isArray(deduplicatedTillsList)
      ? deduplicatedTillsList
          .filter(t => t.assignedOwner && ownerNameLower && t.assignedOwner.toLowerCase() === ownerNameLower)
          .map(t => t.transactionTill || t.id)
      : [];

    const personDayRows = dayRows.filter(row => {
      const rowName = row['Wakala Owner'] || row['Wakala Name'] || row['Name'] || row['ownerName'] || '';
      const rowTill = row['Branch_msisdn'] || row['transactionTill'] || row['Agent ID'] || row['AgentID'] || '';
      return (
        (ownerNameLower && rowName.toLowerCase() === ownerNameLower) ||
        assignedTills.includes(rowTill)
      );
    });

    if (personDayRows.length === 0) {
      return {
        ...owner,
        penalty,
        iopVolume,
      };
    }

    const floatServed = personDayRows.reduce((acc, row) => acc + Math.abs(getAmountVal(row)), 0);
    const floatReceived = 0; // No sign-based direction in this model — see design note above

    // Group by till to compute opening/remaining floats
    const tillGroups: { [msisdn: string]: any[] } = {};
    personDayRows.forEach(row => {
      const till = row['Branch_msisdn'] || row['transactionTill'] || row['Agent ID'] || '';
      if (till) {
        if (!tillGroups[till]) tillGroups[till] = [];
        tillGroups[till].push(row);
      }
    });

    let openingFloat = 0;
    let closingFloat = 0;

    Object.keys(tillGroups).forEach(till => {
      const txs = tillGroups[till];
      // Sort chronologically using the full timestamp
      const sorted = [...txs].sort((a, b) => {
        const tsA = getTimestampEpoch(a['Servicing Timestamp'] || a.timestamp || '');
        const tsB = getTimestampEpoch(b['Servicing Timestamp'] || b.timestamp || '');
        if (tsA !== tsB) return tsA - tsB;
        const idA = a._id || a.id || '';
        const idB = b._id || b.id || '';
        return idA.localeCompare(idB);
      });
      openingFloat += getBeforeVal(sorted[0]);
      closingFloat += getAfterVal(sorted[sorted.length - 1]);
    });

    const performancePercent = (floatServed / companyTotalServedAdj) * 100;
    const txCount = personDayRows.length;
    const highestTx = Math.max(...personDayRows.map(r => Math.abs(getAmountVal(r))));
    const lowestTx = Math.min(...personDayRows.map(r => Math.abs(getAmountVal(r))));
    const avgValue = txCount > 0 ? floatServed / txCount : 0;

    return {
      ...owner,
      performance: Math.round(performancePercent),
      servedAmount: floatServed,
      floatReceived,
      floatServed,
      openingFloat,
      closingFloat,
      remainingFloat: closingFloat,
      transactionsToday: txCount,
      highestTx,
      lowestTx,
      avgValue,
      penalty,
      iopVolume,
      lastSyncDate: new Date().toLocaleDateString('en-US') + ", " + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      status: 'Active'
    };
  });

  const updatedPersonnel = resetPersonnel;

  // Company-wide Sanity Check (Fix 3)
  const sumOwnersServed = updatedOwners.reduce((acc, o) => acc + (o.floatServed || 0), 0);
  if (sumOwnersServed > companyTotalServed + 0.01) {
    const overlapAmount = sumOwnersServed - companyTotalServed;
    const overservedOwners = updatedOwners.filter(o => (o.floatServed || 0) > 0).map(o => `${o.name} (TZS ${o.floatServed.toLocaleString()})`);
    console.warn(
      `[Company-wide Sanity Check Failed] Sum of individual owners' served amounts (TZS ${sumOwnersServed.toLocaleString()}) exceeds companyTotalServed (TZS ${companyTotalServed.toLocaleString()}) by TZS ${overlapAmount.toLocaleString()}. This indicates a till is being double-counted.`
    );
    validationWarnings.push({
      type: 'Double Counted Till',
      message: `Sum of individual owners' served amounts (TZS ${sumOwnersServed.toLocaleString()}) exceeds company total served (TZS ${companyTotalServed.toLocaleString()}) by TZS ${overlapAmount.toLocaleString()}. This indicates that one or more tills are double-counted across owners: ${overservedOwners.join(', ')}.`,
      timestamp: new Date().toISOString()
    });
  }

  localStorage.setItem('ownersList', JSON.stringify(updatedOwners));
  localStorage.setItem('personnelList', JSON.stringify(updatedPersonnel));
  localStorage.setItem('kpiValidationWarnings', JSON.stringify(validationWarnings));
}

export interface CompanyKPIsResult {
  openingFloat: number;
  floatReceived: number;
  floatServed: number;
  closingFloat: number;
  mtdOpeningFloat: number;
  mtdFloatReceived: number;
  mtdFloatServed: number;
  mtdClosingFloat: number;
  totalPenalty: number;
  unattributedPenalty: number;
  penaltyByOwner: Record<string, number>;
  totalIopVolume: number;
  iopVolumeByOwner: Record<string, number>;
  reportingMonth: string;
  lastUpload: string;
  latestDay: string;
  earliestDay: string;
}

export async function calculateCompanyKPIs(realRows: any[]): Promise<CompanyKPIsResult> {
  const getAmountVal = (row: any) => {
    const val = row['Volume (TZS)'] || row['Volume'] || row['Amount'] || row['value'] || row['volume'] || 0;
    if (typeof val === 'number') return val;
    const cleaned = String(val).replace(/,/g, '').replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  const getBeforeVal = (row: any) => {
    const val = row['source_balance_before'] || row['sourcebalancebefore'] || row['balance_before'] || row['OpeningFloat'] || row['Opening Float'] || 0;
    if (typeof val === 'number') return val;
    const cleaned = String(val).replace(/,/g, '').replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  const getAfterVal = (row: any) => {
    const val = row['source_balance_after'] || row['sourcebalanceafter'] || row['balance_after'] || row['RemainingFloat'] || row['ClosingFloat'] || row['Closing Float'] || 0;
    if (typeof val === 'number') return val;
    const cleaned = String(val).replace(/,/g, '').replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  const getNumVal = (row: any, keys: string[]) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== null && row[k] !== '') {
        const v = row[k];
        if (typeof v === 'number') return v;
        const cleaned = String(v).replace(/,/g, '').replace(/[^0-9.-]/g, '');
        const parsed = parseFloat(cleaned);
        if (!isNaN(parsed)) return parsed;
      }
    }
    return 0;
  };

  const defaultResult: CompanyKPIsResult = {
    openingFloat: 0,
    floatReceived: 0,
    floatServed: 0,
    closingFloat: 0,
    mtdOpeningFloat: 0,
    mtdFloatReceived: 0,
    mtdFloatServed: 0,
    mtdClosingFloat: 0,
    totalPenalty: 0,
    unattributedPenalty: 0,
    penaltyByOwner: {},
    totalIopVolume: 0,
    iopVolumeByOwner: {},
    reportingMonth: '—',
    lastUpload: '—',
    latestDay: '',
    earliestDay: ''
  };

  // If empty or invalid, return default metrics
  if (!Array.isArray(realRows) || realRows.length === 0) {
    return defaultResult;
  }

  // Load reference tables needed for classification
  const savedSaTillRegistry = localStorage.getItem('saTillRegistry');
  const savedBaseWakalaIndex = localStorage.getItem('baseWakalaIndex');
  const savedTillsForClassification = localStorage.getItem('tillsList');
  const savedOwnersForClassification = localStorage.getItem('ownersList');
  let saTillRegistry: any[] = [];
  let baseWakalaIndex: any[] = [];
  let tillsForClassification: any[] = [];
  let ownersForClassification: any[] = [];
  try { saTillRegistry = savedSaTillRegistry ? JSON.parse(savedSaTillRegistry) : []; } catch (e) {}
  try { baseWakalaIndex = savedBaseWakalaIndex ? JSON.parse(savedBaseWakalaIndex) : []; } catch (e) {}
  try { tillsForClassification = savedTillsForClassification ? JSON.parse(savedTillsForClassification) : []; } catch (e) {}
  try { ownersForClassification = savedOwnersForClassification ? JSON.parse(savedOwnersForClassification) : []; } catch (e) {}

  const classifiedAll = getClassifiedRowsCached(
    realRows as any,
    saTillRegistry,
    baseWakalaIndex,
    tillsForClassification,
    ownersForClassification
  );
  const saInternalIds = new Set(
    classifiedAll.filter(c => c.bucket === 'SA_INTERNAL').map(c => c.row._id)
  );
  const billableRealRows = realRows.filter(row => !saInternalIds.has(row._id));

  // Get unique dates
  const uniqueDates = Array.from(new Set(realRows.map(r => r['Servicing Date'] || r['date'] || '').filter(Boolean)));
  if (uniqueDates.length === 0) {
    return defaultResult;
  }

  // Sort dates chronologically
  uniqueDates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  
  const todayDateStr = uniqueDates[uniqueDates.length - 1];
  const earliestDay = uniqueDates[0];

  const getDayOpeningFloat = (dayStr: string) => {
    const dayRows = realRows.filter(r => (r['Servicing Date'] || r['date'] || '') === dayStr);
    const tillGroups: { [key: string]: any[] } = {};
    dayRows.forEach(row => {
      const till = row['Branch_msisdn'] || row['transactionTill'] || row['Agent ID'] || '';
      if (till) {
        if (!tillGroups[till]) tillGroups[till] = [];
        tillGroups[till].push(row);
      }
    });
    let total = 0;
    Object.keys(tillGroups).forEach(till => {
      const txs = tillGroups[till];
      const sorted = [...txs].sort((a, b) => {
        const tsA = getTimestampEpoch(a['Servicing Timestamp'] || a.timestamp || '');
        const tsB = getTimestampEpoch(b['Servicing Timestamp'] || b.timestamp || '');
        if (tsA !== tsB) return tsA - tsB;
        const idA = a._id || a.id || '';
        const idB = b._id || b.id || '';
        return idA.localeCompare(idB);
      });
      total += getBeforeVal(sorted[0]);
    });
    return total;
  };

  const getDayClosingFloat = (dayStr: string) => {
    const dayRows = realRows.filter(r => (r['Servicing Date'] || r['date'] || '') === dayStr);
    const tillGroups: { [key: string]: any[] } = {};
    dayRows.forEach(row => {
      const till = row['Branch_msisdn'] || row['transactionTill'] || row['Agent ID'] || '';
      if (till) {
        if (!tillGroups[till]) tillGroups[till] = [];
        tillGroups[till].push(row);
      }
    });
    let total = 0;
    Object.keys(tillGroups).forEach(till => {
      const txs = tillGroups[till];
      const sorted = [...txs].sort((a, b) => {
        const tsA = getTimestampEpoch(a['Servicing Timestamp'] || a.timestamp || '');
        const tsB = getTimestampEpoch(b['Servicing Timestamp'] || b.timestamp || '');
        if (tsA !== tsB) return tsA - tsB;
        const idA = a._id || a.id || '';
        const idB = b._id || b.id || '';
        return idA.localeCompare(idB);
      });
      total += getAfterVal(sorted[sorted.length - 1]);
    });
    return total;
  };

  // 1. TODAY'S METRICS:
  let openingFloat = 0;
  if (uniqueDates.length > 1) {
    const prevDayStr = uniqueDates[uniqueDates.length - 2];
    openingFloat = getDayClosingFloat(prevDayStr);
  } else {
    openingFloat = getDayOpeningFloat(todayDateStr);
  }

  const todayRows = billableRealRows.filter(r => (r['Servicing Date'] || r['date'] || '') === todayDateStr);
  const floatReceived = 0;
  const floatServed = todayRows.reduce((acc, row) => acc + Math.abs(getAmountVal(row)), 0);
  const closingFloat = getDayClosingFloat(todayDateStr);

  // 2. MONTH TO DATE (MTD) METRICS:
  const latestDateObj = new Date(todayDateStr);
  const targetYear = latestDateObj.getFullYear();
  const targetMonth = latestDateObj.getMonth(); // 0-indexed

  const currentMonthBillableRows = billableRealRows.filter(r => {
    const dStr = r['Servicing Date'] || r['date'] || '';
    if (!dStr) return false;
    const d = new Date(dStr);
    return !isNaN(d.getTime()) && d.getFullYear() === targetYear && d.getMonth() === targetMonth;
  });

  const currentMonthAllRows = realRows.filter(r => {
    const dStr = r['Servicing Date'] || r['date'] || '';
    if (!dStr) return false;
    const d = new Date(dStr);
    return !isNaN(d.getTime()) && d.getFullYear() === targetYear && d.getMonth() === targetMonth;
  });

  const monthUniqueDates = Array.from(new Set(currentMonthAllRows.map(r => r['Servicing Date'] || r['date'] || '').filter(Boolean)));
  monthUniqueDates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  const firstDayOfMonthStr = monthUniqueDates[0] || todayDateStr;
  const mtdOpeningFloat = getDayOpeningFloat(firstDayOfMonthStr);

  const mtdFloatReceived = 0;

  const mtdFloatServed = currentMonthBillableRows.reduce((acc, row) => {
    return acc + Math.abs(getAmountVal(row));
  }, 0);

  const mtdClosingFloat = getDayClosingFloat(todayDateStr);

  // Format Reporting Month (MMM YYYY)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const reportingMonth = `${months[latestDateObj.getMonth()]} ${latestDateObj.getFullYear()}`;

  // Format Last Upload DD/MM/YY
  const day = String(latestDateObj.getDate()).padStart(2, '0');
  const monthNum = String(latestDateObj.getMonth() + 1).padStart(2, '0');
  const yearTwoDigit = String(latestDateObj.getFullYear()).slice(-2);
  const lastUpload = `${day}/${monthNum}/${yearTwoDigit}`;

  // 3. PHASE 4 DERIVED METRICS (Penalty & IOP Ledger)

  // PART A — Compute Penalty correctly
  let monthlyServicingRows: any[] = [];
  try {
    monthlyServicingRows = await getServicingRows(reportingMonth);
    if (!monthlyServicingRows || monthlyServicingRows.length === 0) {
      monthlyServicingRows = await getServicingRows();
    }
  } catch (e) {
    console.error("Failed loading monthly servicing rows in calculateCompanyKPIs:", e);
  }

  const baseWakalaByMsisdn = new Map<string, any>();
  if (Array.isArray(baseWakalaIndex)) {
    baseWakalaIndex.forEach(w => {
      const msisdnKey = normalizeMsisdn(w.msisdn);
      if (msisdnKey) baseWakalaByMsisdn.set(msisdnKey, w);
      const altKey = normalizeMsisdn((w as any).altMsisdn || (w as any).alternateNumber);
      if (altKey) baseWakalaByMsisdn.set(altKey, w);
    });
  }

  let totalPenalty = 0;
  let unattributedPenalty = 0;
  const penaltyByOwner: Record<string, number> = {};

  const penaltyKeys = ['CP_Servicing_Val', 'CP Servicing Val', 'cp_servicing_val', 'CP_Servicing_Value', 'cp_servicing_value', 'penalty', 'Penalty'];

  monthlyServicingRows.forEach(row => {
    const penaltyVal = getNumVal(row, penaltyKeys);
    if (penaltyVal !== 0) {
      totalPenalty += penaltyVal;

      const rawMsisdn = String(row.MSISDN || row.msisdn || row.phone || row.Phone || row.Branch_msisdn || '');
      const normMsisdn = normalizeMsisdn(rawMsisdn);
      const baseMatch = normMsisdn ? baseWakalaByMsisdn.get(normMsisdn) : undefined;

      if (baseMatch && baseMatch.ownerName) {
        const matchResult = resolveOwnerMatch(baseMatch.ownerName, ownersForClassification, 'Penalty Calculation');
        const owner = matchResult.matchedOwner;
        if (owner) {
          penaltyByOwner[owner.id] = (penaltyByOwner[owner.id] || 0) + penaltyVal;
          penaltyByOwner[owner.name.toLowerCase()] = (penaltyByOwner[owner.name.toLowerCase()] || 0) + penaltyVal;
        } else {
          unattributedPenalty += penaltyVal;
        }
      } else {
        unattributedPenalty += penaltyVal;
      }
    }
  });

  // PART B — IOP Volume (wakala not registered to anyone in the company)
  const iopVolumeRows = classifiedAll.filter(c => c.bucket === 'IOP');
  const totalIopVolume = iopVolumeRows.reduce((acc, c) => acc + Math.abs(getAmountVal(c.row)), 0);

  const iopVolumeByOwner: Record<string, number> = {};
  iopVolumeRows.forEach(c => {
    const amt = Math.abs(getAmountVal(c.row));
    if (c.attributedOwnerId) {
      iopVolumeByOwner[c.attributedOwnerId] = (iopVolumeByOwner[c.attributedOwnerId] || 0) + amt;
    }
    if (c.attributedOwnerName) {
      iopVolumeByOwner[c.attributedOwnerName.toLowerCase()] = (iopVolumeByOwner[c.attributedOwnerName.toLowerCase()] || 0) + amt;
    }
  });

  return {
    openingFloat,
    floatReceived,
    floatServed,
    closingFloat,
    mtdOpeningFloat,
    mtdFloatReceived,
    mtdFloatServed,
    mtdClosingFloat,
    totalPenalty,
    unattributedPenalty,
    penaltyByOwner,
    totalIopVolume,
    iopVolumeByOwner,
    reportingMonth,
    lastUpload,
    latestDay: todayDateStr,
    earliestDay
  };
}

