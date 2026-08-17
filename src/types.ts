export enum ViewType {
  GATEWAY = 'GATEWAY',
  LOGIN = 'LOGIN',
  DASHBOARD = 'DASHBOARD',
  OWNERS = 'OWNERS',
  OWNER_DETAILS = 'OWNER_DETAILS',
  UPLOAD_REPORTS = 'UPLOAD_REPORTS',
  KPI_REPORTS = 'KPI_REPORTS',
  REPORT_HISTORY = 'REPORT_HISTORY',
  SETTINGS = 'SETTINGS',
  PERSONNEL = 'PERSONNEL',
  PEOPLE_MGT = 'PEOPLE_MGT',
  FIELD_MAP = 'FIELD_MAP',
  BASE_WAKALA = 'BASE_WAKALA',
  CLASSIFICATION_AUDIT = 'CLASSIFICATION_AUDIT',
  TARGETS = 'TARGETS',
  FLOAT_MANAGEMENT = 'FLOAT_MANAGEMENT',
}

export interface KPIMetric {
  id: string;
  name: string;
  target: string;
  targetVal: number;
  achieved: string;
  achievedVal: number;
  performance: number;
  status: 'ON TRACK' | 'ACHIEVED' | 'NEEDS ATTENTION' | 'CRITICAL';
}

export interface TopOwner {
  rank: number;
  name: string;
  zone: string;
  percentage: number;
  amount: string;
}

export interface RecentReport {
  name: string;
  time: string;
  zone: string;
  status: 'success' | 'warning' | 'error';
}

export interface WakalaEntry {
  id: string;
  name: string;
  msisdn: string;
  region: string;
  dateAdded: string;
  // Present when sourced from the bulk-uploaded Base Wakala Index
  source?: 'manual' | 'bulk-import';
  code?: string;
  siteId?: string;
  siteWard?: string;
  district?: string;
  alternateNumber?: string;
  ownerMatchStatus?: 'Matched' | 'Unmatched' | 'Unassigned';
  location?: { lat: number; lng: number; capturedAt: string; accuracy?: number; address?: string };
  photoId?: string;
  photoUrl?: string;
}

export interface SATill {
  id?: string;
  tillMsisdn: string;
  ownerId?: string;
  ownerName?: string;
  registeredAt?: string;
}

export interface BaseWakala {
  id?: string;
  msisdn: string;            // normalized, 255-prefixed
  code?: string;              // from CODE column
  wakalaCode?: string;
  fullName?: string;          // from Full_Name column
  wakalaName?: string;
  siteId?: string;            // from siteid column
  siteWard?: string;          // from siteward column
  district?: string;          // from district column
  alternateNumber?: string;   // from ALTERN NO column, normalized if present
  altMsisdn?: string;
  ownerId?: string;
  ownerName: string | null;   // null when source value is "#N/A" or blank — explicit unassigned state
  creationDate?: string;      // from creation_date column
}

export interface PriorityWakala {
  msisdn: string;       // normalized, matches Base Wakala Index format
  period: string;       // "YYYY-MM", the month this wakala is flagged priority for
  importedAt: string;
  wakalaCode?: string;
  ownerId?: string;
  ownerName?: string;
}

export interface ManualOwnerTarget {
  ownerId: string;
  period: string;
  kpi1BaseTarget?: number;
  kpi1IopTarget?: number;
  kpi2NormalPercent?: number;    // % of owner's own normal wakala to serve this period
  kpi2PriorityPercent?: number;  // % of owner's own priority wakala to serve this period
  setBy: string;
  setAt: string;
}

export interface AgentTarget {
  ownerName: string;          // raw name as it appeared in the source file
  location?: string;          // e.g. "KITANGARI", "NDANDA" — the block's location label
  monthlyTarget: number;      // "TOTAL MONTHLY TARGET" value
  achievedValue: number;      // "TOTAL ACTUAL" value
  achievementPercentage: number; // pre-capped percentage from the source (0-1 range)
  period: string;             // e.g. "2026-07", derived from the report's stated date range
  importedAt: string;
  ownerId?: string;
  rawMsisdn?: string;
  matchedTillMsisdn?: string;
}

export interface MonthlyTargetUpload {
  msisdn: string;         // normalized till MSISDN
  ownerId: string;
  ownerName: string;
  displayName?: string;   // optional "Name" column from file — display only, never used for matching
  monthlyTarget: number;
  period: string;
  importedAt: string;
}

export interface FloatReturnEntry {
  id: string;
  channel: 'CRDB' | 'YAS' | 'NBC' | 'Other';
  channelOther?: string;
  amount: number;
  receiptPhotoId?: string;
}

export interface FloatRequest {
  id: string;
  ownerId: string;
  requestedAmount: number;
  requestedAt: string;
  status: 'Pending' | 'Confirmed' | 'Returned' | 'Completed';
  confirmedByManagerId?: string;
  confirmedByManagerName?: string;
  returnEntries?: FloatReturnEntry[];
  returnedAt?: string;
  rejectedAt?: string;
  rejectedByManagerId?: string;
  rejectedByManagerName?: string;
  shortfallReason?: string;   // owner-provided reason, required when returned < requested
  loanId?: string;            // set once a Float Manager approves a loan for this shortfall
  confirmedAt?: string;       // authoritative ISO timestamp when status changed to Confirmed
}

export interface LoanRecord {
  id: string;
  ownerId: string;
  floatRequestId: string;
  amount: number;
  reason: string;
  createdAt: string;
  approvedByManagerId: string;
  approvedByManagerName: string;
  status: 'Outstanding' | 'Repayment Submitted' | 'Paid';
  repaidAmount?: number;
  repaymentDescription?: string;
  repaymentSubmittedAt?: string;
  paidAt?: string;
  markedPaidByManagerId?: string;
  markedPaidByManagerName?: string;
}

export interface Owner {
  id: string;
  name: string;
  masterAgentId: string;
  region: string;
  memberSince: string;
  avatar: string;
  wakalas: number;
  portfolioSize: string;
  portfolioGrowth: string;
  performance: number;
  status: 'Active' | 'Pending' | 'Suspended';
  title?: string;
  lastSyncDate?: string;
  baseWakalas?: WakalaEntry[];
  iopWakalas?: WakalaEntry[];
  workLocation?: { lat: number; lng: number; address?: string; capturedAt: string };
  workPhotoIds?: string[];
  avatarPhotoId?: string;
  // Daily MGT Metrics
  openingFloat?: number;
  servedAmount?: number;
  remainingFloat?: number;
  transactionsToday?: number;
  avgValue?: number;
  highestTx?: number;
  lowestTx?: number;
  penalty?: number;            // Total penalty for the period
  iopVolume?: number;          // Current MTD IOP volume
  nameAliases?: string[];
}

export interface ReportSubmission {
  id: string;
  type: string;
  amount: string;
  timestamp: string;
  status: 'Verified' | 'Pending Audit' | 'Failed';
}

export interface AuditReport {
  id: string;
  fileName: string;
  type: string;
  uploadedBy: string;
  avatar?: string;
  date: string;
  size: string;
  status: 'Success' | 'Processing' | 'Failed' | 'Success (Partial)';
}

export interface Personnel {
  id: string;
  name: string;
  title: string;
  location: string;
  status: 'Active' | 'Pending' | 'Suspended';
  memberSince?: string;
  avatar?: string;
  lastSyncDate?: string;
}

export type { ServicingRow } from './utils/mappingEngine';
