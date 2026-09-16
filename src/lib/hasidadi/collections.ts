/**
 * Collection registry: the single source of truth for how each legacy
 * browser-storage collection maps onto its Postgres table.
 *
 * Rich/loosely typed legacy fields that have no dedicated column are kept
 * verbatim in the table's `extras` jsonb column, so nothing is lost on the
 * round trip cache <-> database.
 */

export interface CollectionMapper {
  /** legacy storage key, also the client cache key */
  key: string;
  table: string;
  /** primary key column used for upserts */
  pk: string;
  /** owner scoping column, when the table is owner-isolated */
  ownerColumn?: string;
  /** appObjectField -> dbColumn */
  columns: Record<string, string>;
  extrasColumn?: string;
  /** derive the pk value when the object has no natural id */
  makeId?: (obj: any, index: number) => string;
  /** last chance to fill NOT NULL columns / normalise blanks before upsert */
  finalizeRow?: (row: Record<string, any>, obj: any) => void;
}

const define = (m: CollectionMapper) => m;

/**
 * Tables whose primary key column is a uuid still need a stable, content
 * derived id so re-uploads upsert instead of duplicating. Hash the natural
 * business key into a deterministic uuid.
 */
export function deterministicUuid(input: string): string {
  const hex = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  };
  const raw = hex(0x811c9dc5) + hex(0x1b873593) + hex(0x85ebca6b) + hex(0xc2b2ae35);
  return [
    raw.slice(0, 8),
    raw.slice(8, 12),
    '5' + raw.slice(13, 16),
    ((parseInt(raw[16]!, 16) & 0x3) | 0x8).toString(16) + raw.slice(17, 20),
    raw.slice(20, 32),
  ].join('-');
}

export const COLLECTIONS: CollectionMapper[] = [
  define({
    key: 'ownersList',
    table: 'owners',
    pk: 'owner_id',
    ownerColumn: 'owner_id',
    extrasColumn: 'extras',
    columns: {
      id: 'owner_id',
      name: 'name',
      masterAgentId: 'master_agent_id',
      region: 'region',
      title: 'title',
      memberSince: 'member_since',
      avatar: 'avatar',
      status: 'status',
      nameAliases: 'name_aliases',
      avatarPhotoId: 'avatar_photo_id',
    },
    makeId: (o, i) => o.id || `owner-${i + 1}`,
  }),
  define({
    key: 'personnelList',
    table: 'personnel',
    pk: 'personnel_id',
    extrasColumn: 'extras',
    columns: {
      id: 'personnel_id',
      name: 'name',
      title: 'title',
      location: 'location',
      status: 'status',
      memberSince: 'member_since',
      avatar: 'avatar',
      assignedTill: 'assigned_till',
    },
    makeId: (p, i) => p.id || `personnel-${i + 1}`,
  }),
  define({
    key: 'tillsList',
    table: 'wakalas',
    pk: 'wakala_id',
    ownerColumn: 'owner_id',
    extrasColumn: 'extras',
    columns: {
      transactionTill: 'msisdn',
      tillName: 'name',
      location: 'region',
      ownerId: 'owner_id',
    },
    makeId: (t, i) => `till-${String(t.transactionTill || i).trim()}`,
    finalizeRow: (row, t) => {
      const blank = (v: any) => v === undefined || v === null || String(v).trim() === '';
      if (blank(row.owner_id)) row.owner_id = null;
      if (blank(row.msisdn)) row.msisdn = String(t.transactionTill ?? row.wakala_id ?? '').trim();
      if (blank(row.name)) row.name = t.tillName || t.name || row.msisdn || 'Unassigned Till';
      if (blank(row.region)) row.region = t.location || t.region || 'Unknown';
      // The wakalas table only accepts 'base' or 'iop'.
      const kind = String(row.kind ?? t.kind ?? '').trim().toLowerCase();
      row.kind = kind === 'iop' ? 'iop' : 'base';
    },
  }),
  define({
    key: 'saTillRegistry',
    table: 'sa_tills',
    pk: 'till_msisdn',
    ownerColumn: 'owner_id',
    extrasColumn: 'extras',
    columns: {
      tillMsisdn: 'till_msisdn',
      ownerId: 'owner_id',
      ownerName: 'owner_name',
      registeredAt: 'registered_at',
    },
    makeId: (t) => String(t.tillMsisdn || '').trim(),
  }),
  define({
    key: 'baseWakalaIndex',
    table: 'base_wakala_index',
    pk: 'msisdn',
    ownerColumn: 'owner_id',
    extrasColumn: 'extras',
    columns: {
      msisdn: 'msisdn',
      code: 'code',
      wakalaCode: 'wakala_code',
      fullName: 'full_name',
      wakalaName: 'wakala_name',
      siteId: 'site_id',
      siteWard: 'site_ward',
      district: 'district',
      altMsisdn: 'alt_msisdn',
      ownerId: 'owner_id',
      ownerName: 'owner_name',
      creationDate: 'creation_date',
    },
    makeId: (b) => String(b.msisdn || '').trim(),
    finalizeRow: (row) => {
      if (row.owner_id === undefined || row.owner_id === null || String(row.owner_id).trim() === '') {
        row.owner_id = null;
      }
    },
  }),
  define({
    key: 'priorityWakalaList',
    table: 'priority_wakalas',
    pk: 'id',
    ownerColumn: 'owner_id',
    extrasColumn: 'extras',
    columns: {
      msisdn: 'msisdn',
      period: 'period',
      ownerId: 'owner_id',
      ownerName: 'owner_name',
      wakalaCode: 'wakala_code',
      importedAt: 'imported_at',
    },
    makeId: (p) => `${String(p.msisdn || '').trim()}|${p.period || ''}`,
  }),
  define({
    key: 'agentTargets',
    table: 'agent_targets',
    pk: 'id',
    ownerColumn: 'owner_id',
    extrasColumn: 'extras',
    columns: {
      ownerId: 'owner_id',
      ownerName: 'owner_name',
      location: 'location',
      period: 'period',
      monthlyTarget: 'monthly_target',
      achievedValue: 'achieved_value',
      achievementPercentage: 'achievement_percentage',
      rawMsisdn: 'raw_msisdn',
      matchedTillMsisdn: 'matched_till_msisdn',
      importedAt: 'imported_at',
    },
    makeId: (t) => `${(t.ownerId || t.ownerName || '').toString().toLowerCase()}|${t.period || ''}`,
  }),
  define({
    key: 'manualOwnerTargets',
    table: 'manual_owner_targets',
    pk: 'id',
    ownerColumn: 'owner_id',
    extrasColumn: 'extras',
    columns: {
      ownerId: 'owner_id',
      period: 'period',
      kpi1BaseTarget: 'kpi1_base_target',
      kpi1IopTarget: 'kpi1_iop_target',
      kpi2NormalPercent: 'kpi2_normal_percent',
      kpi2PriorityPercent: 'kpi2_priority_percent',
      setBy: 'set_by',
      setAt: 'set_at',
    },
    makeId: (t) => `${t.ownerId || ''}|${t.period || ''}`,
  }),
  define({
    key: 'floatRequests',
    table: 'float_requests',
    pk: 'id',
    ownerColumn: 'owner_id',
    extrasColumn: 'extras',
    columns: {
      id: 'id',
      ownerId: 'owner_id',
      requestedAmount: 'requested_amount',
      requestedAt: 'requested_at',
      status: 'status',
      confirmedByManagerId: 'confirmed_by_manager_id',
      confirmedByManagerName: 'confirmed_by_manager_name',
      confirmedAt: 'confirmed_at',
      returnedAt: 'returned_at',
      rejectedAt: 'rejected_at',
      rejectedByManagerId: 'rejected_by_manager_id',
      rejectedByManagerName: 'rejected_by_manager_name',
      shortfallReason: 'shortfall_reason',
      loanId: 'loan_id',
    },
  }),
  define({
    key: 'loanRecords',
    table: 'loan_records',
    pk: 'id',
    ownerColumn: 'owner_id',
    extrasColumn: 'extras',
    columns: {
      id: 'id',
      ownerId: 'owner_id',
      floatRequestId: 'float_request_id',
      amount: 'amount',
      reason: 'reason',
      status: 'status',
      repaidAmount: 'repaid_amount',
      repaymentDescription: 'repayment_description',
      repaymentSubmittedAt: 'repayment_submitted_at',
      paidAt: 'paid_at',
      approvedByManagerId: 'approved_by_manager_id',
      approvedByManagerName: 'approved_by_manager_name',
      markedPaidByManagerId: 'marked_paid_by_manager_id',
      markedPaidByManagerName: 'marked_paid_by_manager_name',
      createdAt: 'created_at',
    },
  }),
];

export const COLLECTION_KEYS = COLLECTIONS.map((c) => c.key);

/**
 * Derived caches, histories and UI state that have no relational shape.
 * They live in the `app_settings` jsonb store (still server-authoritative,
 * still RLS protected) rather than in dedicated tables.
 */
export const DOCUMENT_KEYS = [
  'dashboardKPIs',
  'lastClassificationSummary',
  'kpiValidationWarnings',
  'kpiWorkbookHistory',
  'weeklyKpiHistory',
  'weeklyWakalaStatsHistory',
  'mgtDailySummariesHistory',
  'latestMgtDailySummary',
  'monthlyTargetUploads',
  'manualPriorityWakalas',
  'duplicateTillAssignments',
  'roleMappings',
  'auditHistoryReports',
  'dismissedNotificationIds',
  'activityRules',
] as const;

export type DocumentKey = (typeof DOCUMENT_KEYS)[number];

/** All keys the client cache hydrates from the server. */
export const SYNCED_KEYS: string[] = [...COLLECTION_KEYS, ...DOCUMENT_KEYS];

export function getMapper(key: string): CollectionMapper | undefined {
  return COLLECTIONS.find((c) => c.key === key);
}

const isPlainValue = (v: any) => v === null || typeof v !== 'object';

export function toRow(mapper: CollectionMapper, obj: any, index: number): Record<string, any> {
  const row: Record<string, any> = {};
  const consumed = new Set<string>();

  for (const [field, column] of Object.entries(mapper.columns)) {
    if (obj[field] !== undefined) {
      row[column] = obj[field];
      consumed.add(field);
    }
  }

  if (mapper.makeId) row[mapper.pk] = mapper.makeId(obj, index);
  if (row[mapper.pk] === undefined && obj.id !== undefined) row[mapper.pk] = obj.id;

  if (mapper.extrasColumn) {
    const extras: Record<string, any> = {};
    for (const [field, value] of Object.entries(obj)) {
      if (consumed.has(field)) continue;
      if (value === undefined) continue;
      extras[field] = value;
    }
    row[mapper.extrasColumn] = extras;
  }

  // Keep the queryable owner column populated when the object nests it.
  if (mapper.ownerColumn && row[mapper.ownerColumn] === undefined && obj.ownerId) {
    row[mapper.ownerColumn] = obj.ownerId;
  }

  mapper.finalizeRow?.(row, obj);

  return row;
}

export function fromRow(mapper: CollectionMapper, row: Record<string, any>): any {
  const obj: Record<string, any> = {};
  if (mapper.extrasColumn && row[mapper.extrasColumn] && typeof row[mapper.extrasColumn] === 'object') {
    Object.assign(obj, row[mapper.extrasColumn]);
  }
  for (const [field, column] of Object.entries(mapper.columns)) {
    const value = row[column];
    if (value === null || value === undefined) continue;
    if (isPlainValue(value) || Array.isArray(value)) obj[field] = value;
    else obj[field] = value;
  }
  return obj;
}
