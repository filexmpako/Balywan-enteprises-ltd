import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { ViewType, AuditReport, Owner, KPIMetric, SATill, BaseWakala, PriorityWakala } from '../types';
import { normalizeMsisdn } from '../utils/msisdn';
import { resolveOwnerMatch, normalizeOwnerName, addNameAlias } from '../utils/ownerMatch';
import { resolveOwnerFromTillMsisdn } from '../utils/tillOwnerResolution';
import UnresolvedNamesReview, { UnresolvedNameItem } from './UnresolvedNamesReview';
import { ownersList as initialOwners } from '../data';
import { getAvatarUrl } from '../utils/avatar';
import OwnerSyncDashboard from './OwnerSyncDashboard';
import DailyMgtMappingEngine from './DailyMgtMappingEngine';
import { 
  UploadCloud, 
  FileText, 
  X, 
  CheckCircle, 
  AlertTriangle, 
  Sparkles,
  RefreshCw,
  Clock,
  ArrowRight,
  Search,
  Database,
  Target,
  FileSpreadsheet,
  AlertCircle,
  Calendar,
  User,
  Check,
  RotateCw,
  Eye,
  FileCheck2,
  Trash2,
  ChevronRight,
  Info,
  Layers,
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Minus,
  Download,
  LayoutDashboard,
  History,
  Diff,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Building2,
  MapPin,
  Users,
  Flag
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { recalculateAllPerformances, mapTransactions, formatToISODate } from '../utils/mappingEngine';
import { classifyServicingRows, summarizeClassification } from '../utils/classification';
import { ingestClassified } from '../lib/ingest';
import { invalidateClassificationCache } from '../utils/classificationCache';
import { saveMonthlyServicingData, clearMonthlyServicingData, getServicingRows, getServicingColumns, saveWeeklyServicingData, clearWeeklyServicingData, getWeeklyServicingRows, getWeeklyServicingColumns, saveDailyServicingData, getDailyServicingRows, clearDailyServicingData } from '../utils/indexedDB';
import { persistWeeklyServicing } from '../utils/weeklyStore';
import { persistMonthlyServicing } from '../utils/monthlyStore';
import { useReportingMetadata } from '../hooks/useReportingMetadata';

// Executive KPI Analysis Engine Modular Subcomponents
import KPIExecutiveSummary from './kpi-engine/KPIExecutiveSummary';
import KPIServicingDashboard from './kpi-engine/KPIServicingDashboard';
import KPIBusinessInsights from './kpi-engine/KPIBusinessInsights';
import KPIInteractiveCharts from './kpi-engine/KPIInteractiveCharts';
import KPIHistoryArchive from './kpi-engine/KPIHistoryArchive';
import KPIComparisonStudio from './kpi-engine/KPIComparisonStudio';

export interface ReportTypeConfig {
  id: 'till_sync' | 'mgt' | 'kpi' | 'weekly_kpi' | 'sa_till_registry' | 'base_wakala_list' | 'priority_wakala';
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const REPORT_TYPES: ReportTypeConfig[] = [
  {
    id: 'till_sync',
    title: 'Till Name Sync (Authoritative)',
    description: 'Upload the authoritative Till Name workbook to synchronize owners and tills, register new entities, and establish exact dashboard mappings.',
    icon: Database,
  },
  {
    id: 'mgt',
    title: 'Daily MGT Master Import',
    description: 'Extract unique Agent IDs and owners from the Daily operational sheet, reconcile differences with the operational database, and sync records.',
    icon: FileSpreadsheet,
  },
  {
    id: 'kpi',
    title: 'Monthly KPI Ingestion',
    description: 'Read KPI Summary (KPI, targets, achieved, status) & Servicing Data worksheets to preview and update performance dashboard metrics.',
    icon: Target,
  },
  {
    id: 'weekly_kpi',
    title: 'Weekly KPI Checkpoint',
    description: 'Upload weekly performance files to track progress toward Monthly Targets. Stored separately to preserve monthly data integrity.',
    icon: BarChart3,
  },
  {
    id: 'sa_till_registry',
    title: 'SA Till Registry',
    description: 'Upload Master Super Agent (SA) Till MSISDN registry to identify parent account transfers and prevent misclassification.',
    icon: Building2,
  },
  {
    id: 'base_wakala_list',
    title: 'Base Wakala List',
    description: 'Upload the company master Base Wakala roster (MSISDN, site, district, assigned owner) to build the base-network lookup used for Base vs IOP classification.',
    icon: MapPin,
  },
  {
    id: 'priority_wakala',
    title: 'Priority Wakala List',
    description: 'Upload the monthly list of priority wakala (least-served in the prior month) used to weight KPI 2\'s Normal/Priority target split.',
    icon: Flag,
  },
];

interface UploadReportsViewProps {
  onNavigate: (view: ViewType) => void;
  onAddAuditReport: (report: AuditReport) => void;
}

interface StagingOwner {
  id: string;
  masterAgentId: string;
  name: string;
  phone: string;
  email: string;
  businessName: string;
  region: string;
  district: string;
  ward: string;
  classification: 'Existing' | 'New' | 'Updated' | 'Duplicate' | 'Invalid';
  status: 'Active' | 'Pending' | 'Suspended';
  resolutionStatus: 'Pending' | 'Approved' | 'Rejected' | 'Auto-Skipped';
  changedFields?: {
    field: string;
    oldValue: string;
    newValue: string;
  }[];
  errorMessage?: string;
  originalRecord?: Owner;
}

export default function UploadReportsView({ onNavigate, onAddAuditReport }: UploadReportsViewProps) {
  const validationWarnings = useMemo(() => {
    const saved = localStorage.getItem('kpiValidationWarnings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [];
  }, []);

  // Report selection state
  const [reportType, setReportType] = useState<'kpi' | 'weekly_kpi' | 'mgt' | 'till_sync' | 'sa_till_registry' | 'base_wakala_list' | 'priority_wakala' | null>(null);
  const [uploadMonth, setUploadMonth] = useState('July 2026');
  const [uploadWeek, setUploadWeek] = useState('Week 2 (July 8 - July 14, 2026)');

  // Priority Wakala List persistence & state
  const [priorityWakalas, setPriorityWakalas] = useState<PriorityWakala[]>(() => {
    const stored = localStorage.getItem('priorityWakalaList');
    if (stored) { try { return JSON.parse(stored); } catch (e) {} }
    return [];
  });
  const [priorityWakalaLastUpdated, setPriorityWakalaLastUpdated] = useState<string | null>(() => {
    return localStorage.getItem('priorityWakalaList_lastUpdated') || null;
  });
  const [stagedPriorityWakalas, setStagedPriorityWakalas] = useState<PriorityWakala[] | null>(null);
  const [priorityWakalaPeriod, setPriorityWakalaPeriod] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // SA Till Registry persistence
  const [saTills, setSaTills] = useState<SATill[]>(() => {
    try {
      const stored = localStorage.getItem('saTillRegistry');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [saTillLastUpdated, setSaTillLastUpdated] = useState<string | null>(() => {
    return localStorage.getItem('saTillRegistry_lastUpdated') || null;
  });

  const [stagedSaTills, setStagedSaTills] = useState<{ tillMsisdn: string; ownerName?: string; registeredAt: string; isUpdate?: boolean }[] | null>(null);
  const [saTillSearchQuery, setSaTillSearchQuery] = useState('');

  // Base Wakala Index persistence & state
  const [baseWakalas, setBaseWakalas] = useState<BaseWakala[]>(() => {
    try {
      const stored = localStorage.getItem('baseWakalaIndex');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [baseWakalaLastUpdated, setBaseWakalaLastUpdated] = useState<string | null>(() => {
    return localStorage.getItem('baseWakalaIndex_lastUpdated') || null;
  });

  const [stagedBaseWakalas, setStagedBaseWakalas] = useState<{
    record: BaseWakala;
    isUpdate: boolean;
    ownerStatus: 'Matched' | 'Unmatched' | 'Unassigned';
    matchedOwnerName?: string;
  }[] | null>(null);

  const [baseWakalaSuccess, setBaseWakalaSuccess] = useState<{ count: number; timestamp: string } | null>(null);

  const [showUnresolvedReview, setShowUnresolvedReview] = useState(false);

  const [lastClassificationSummary, setLastClassificationSummary] = useState<{
    SA_INTERNAL: { count: number; volume: number };
    BASE: { count: number; volume: number };
    IOP: { count: number; volume: number };
  } | null>(() => {
    try {
      const saved = localStorage.getItem('lastClassificationSummary');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const parseSaTillFile = (data: any) => {
    try {
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet);

      if (!rows || rows.length === 0) {
        alert("No data rows found in the uploaded file.");
        return;
      }

      const msisdnKeys = ['sa till', 'satill', 'till msisdn', 'tillmsisdn', 'msisdn', 'sa_till_msisdn', 'till', 'phone', 'mobile', 'sa_till', 'branch_msisdn', 'sa msisdn'];
      const ownerKeys = ['owner', 'owner name', 'ownername', 'name', 'account name', 'registered owner', 'sa owner', 'sa_owner'];

      const existingMsisdnSet = new Set(saTills.map(t => normalizeMsisdn(t.tillMsisdn)));

      const parsed: { tillMsisdn: string; ownerName?: string; registeredAt: string; isUpdate?: boolean }[] = [];
      const seenMsisdnInFile = new Set<string>();

      const currentDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      for (const row of rows) {
        let rawMsisdn = '';
        let rawOwner = '';

        for (const k of Object.keys(row)) {
          const cleanK = k.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          if (!rawMsisdn) {
            for (const target of msisdnKeys) {
              if (cleanK === target.replace(/[^a-z0-9]/g, '') || cleanK.includes('msisdn') || cleanK.includes('satill')) {
                rawMsisdn = String(row[k] || '').trim();
                break;
              }
            }
          }
          if (!rawOwner) {
            for (const target of ownerKeys) {
              if (cleanK === target.replace(/[^a-z0-9]/g, '')) {
                rawOwner = String(row[k] || '').trim();
                break;
              }
            }
          }
        }

        if (!rawMsisdn) {
          for (const k of Object.keys(row)) {
            if (/till|msisdn|phone|mobile|account/i.test(k)) {
              rawMsisdn = String(row[k] || '').trim();
              break;
            }
          }
        }

        const normalized = normalizeMsisdn(rawMsisdn);
        if (normalized && !seenMsisdnInFile.has(normalized)) {
          seenMsisdnInFile.add(normalized);
          parsed.push({
            tillMsisdn: normalized,
            ownerName: rawOwner || 'SA Owner',
            registeredAt: currentDate,
            isUpdate: existingMsisdnSet.has(normalized)
          });
        }
      }

      if (parsed.length === 0) {
        alert("No valid SA Till MSISDN numbers could be extracted from the file. Please check column headers (e.g. 'SA Till', 'Till MSISDN', 'Owner Name').");
        return;
      }

      setStagedSaTills(parsed);
    } catch (err) {
      console.error("Error parsing SA Till Registry file:", err);
      alert("Could not parse file. Please provide a valid CSV or Excel file.");
    }
  };

  const handleConfirmSaTillCommit = () => {
    if (!stagedSaTills) return;

    const registryMap = new Map<string, SATill>();
    for (const item of saTills) {
      registryMap.set(normalizeMsisdn(item.tillMsisdn), item);
    }

    for (const item of stagedSaTills) {
      registryMap.set(normalizeMsisdn(item.tillMsisdn), {
        tillMsisdn: item.tillMsisdn,
        ownerName: item.ownerName,
        registeredAt: item.registeredAt
      });
    }

    const updatedArray = Array.from(registryMap.values());
    const nowStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    localStorage.setItem('saTillRegistry', JSON.stringify(updatedArray));
    localStorage.setItem('saTillRegistry_lastUpdated', nowStr);
    invalidateClassificationCache();

    setSaTills(updatedArray);
    setSaTillLastUpdated(nowStr);
    setStagedSaTills(null);
    setSelectedFile(null);

    if (onAddAuditReport) {
      onAddAuditReport({
        id: `sa_till_${Date.now()}`,
        fileName: 'SA_Till_Registry.xlsx',
        type: 'SA Till Registry',
        uploadedBy: 'System Admin',
        date: nowStr,
        size: `${stagedSaTills.length} records`,
        status: 'Success',
      });
    }
  };

  const handleDeleteSaTill = (msisdnToDelete: string) => {
    const normDelete = normalizeMsisdn(msisdnToDelete);
    const filtered = saTills.filter(t => normalizeMsisdn(t.tillMsisdn) !== normDelete);
    const nowStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    localStorage.setItem('saTillRegistry', JSON.stringify(filtered));
    localStorage.setItem('saTillRegistry_lastUpdated', nowStr);
    setSaTills(filtered);
    setSaTillLastUpdated(nowStr);
  };

  // Base Wakala File Parsing Engine
  const parseBaseWakalaFile = (data: any) => {
    try {
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet);

      if (!rows || rows.length === 0) {
        alert("No data rows found in the uploaded file.");
        return;
      }

      // Column keys mapping
      const msisdnKeys = ['msisdn', 'phone', 'mobile', 'till msisdn', 'tillmsisdn', 'agent id', 'agentid', 'phone number', 'branch_msisdn', 'wakala msisdn'];
      const codeKeys = ['code', 'agent code', 'agentcode', 'wakala code', 'terminal code'];
      const fullNameKeys = ['full_name', 'fullname', 'full name', 'name', 'agent name', 'wakala name'];
      const siteIdKeys = ['siteid', 'site id', 'site', 'location id', 'site code'];
      const siteWardKeys = ['siteward', 'site ward', 'ward', 'location ward'];
      const districtKeys = ['district', 'location district', 'region/district'];
      const creationDateKeys = ['creation_date', 'creation date', 'created at', 'date created', 'date'];
      const altNoKeys = ['altern no', 'alternate no', 'alternate phone', 'alt msisdn', 'alternate number', 'altern_no', 'alt phone', 'alternno'];
      const ownerKeys = ['owner', 'owner name', 'ownername', 'master agent name', 'master agent', 'owner_name', 'sa owner', 'sa_owner', 'agent owner', 'owner code', 'ownerid', 'owner id'];

      const masterOwners = getMasterOwners();
      const existingMsisdnSet = new Set(baseWakalas.map(b => normalizeMsisdn(b.msisdn)));

      const parsed: {
        record: BaseWakala;
        isUpdate: boolean;
        ownerStatus: 'Matched' | 'Unmatched' | 'Unassigned';
        matchedOwnerName?: string;
      }[] = [];

      const seenInFile = new Set<string>();

      for (const row of rows) {
        let rawMsisdn = '';
        let rawCode = '';
        let rawFullName = '';
        let rawSiteId = '';
        let rawSiteWard = '';
        let rawDistrict = '';
        let rawCreationDate = '';
        let rawAltNo = '';
        let rawOwner = '';

        for (const k of Object.keys(row)) {
          const cleanK = k.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          const val = String(row[k] || '').trim();

          if (!rawMsisdn) {
            for (const keyPattern of msisdnKeys) {
              if (cleanK === keyPattern.replace(/[^a-z0-9]/g, '')) {
                rawMsisdn = val;
                break;
              }
            }
          }
          if (!rawCode) {
            for (const keyPattern of codeKeys) {
              if (cleanK === keyPattern.replace(/[^a-z0-9]/g, '')) {
                rawCode = val;
                break;
              }
            }
          }
          if (!rawFullName) {
            for (const keyPattern of fullNameKeys) {
              if (cleanK === keyPattern.replace(/[^a-z0-9]/g, '')) {
                rawFullName = val;
                break;
              }
            }
          }
          if (!rawSiteId) {
            for (const keyPattern of siteIdKeys) {
              if (cleanK === keyPattern.replace(/[^a-z0-9]/g, '')) {
                rawSiteId = val;
                break;
              }
            }
          }
          if (!rawSiteWard) {
            for (const keyPattern of siteWardKeys) {
              if (cleanK === keyPattern.replace(/[^a-z0-9]/g, '')) {
                rawSiteWard = val;
                break;
              }
            }
          }
          if (!rawDistrict) {
            for (const keyPattern of districtKeys) {
              if (cleanK === keyPattern.replace(/[^a-z0-9]/g, '')) {
                rawDistrict = val;
                break;
              }
            }
          }
          if (!rawCreationDate) {
            for (const keyPattern of creationDateKeys) {
              if (cleanK === keyPattern.replace(/[^a-z0-9]/g, '')) {
                rawCreationDate = val;
                break;
              }
            }
          }
          if (!rawAltNo) {
            for (const keyPattern of altNoKeys) {
              if (cleanK === keyPattern.replace(/[^a-z0-9]/g, '')) {
                rawAltNo = val;
                break;
              }
            }
          }
          if (!rawOwner) {
            for (const keyPattern of ownerKeys) {
              if (cleanK === keyPattern.replace(/[^a-z0-9]/g, '')) {
                rawOwner = val;
                break;
              }
            }
          }
        }

        // Fallback for msisdn if not captured
        if (!rawMsisdn) {
          for (const k of Object.keys(row)) {
            if (/msisdn|phone|mobile/i.test(k)) {
              rawMsisdn = String(row[k] || '').trim();
              break;
            }
          }
        }

        const normMsisdn = normalizeMsisdn(rawMsisdn);
        if (!normMsisdn || seenInFile.has(normMsisdn)) continue;
        seenInFile.add(normMsisdn);

        const normAltNo = normalizeMsisdn(rawAltNo);

        const ownerName = normalizeOwnerName(rawOwner);
        const ownerMatch = resolveOwnerMatch(rawOwner, masterOwners, 'Base Wakala List Upload');
        const ownerStatus = ownerMatch.status;
        const matchedOwnerName = ownerMatch.matchedOwner?.name;

        parsed.push({
          record: {
            msisdn: normMsisdn,
            code: rawCode || undefined,
            fullName: rawFullName || undefined,
            siteId: rawSiteId || undefined,
            siteWard: rawSiteWard || undefined,
            district: rawDistrict || undefined,
            alternateNumber: normAltNo || undefined,
            ownerName: ownerName,
            creationDate: rawCreationDate || undefined
          },
          isUpdate: existingMsisdnSet.has(normMsisdn),
          ownerStatus,
          matchedOwnerName
        });
      }

      if (parsed.length === 0) {
        alert("No valid Base Wakala MSISDN numbers could be extracted. Please check column headers (e.g., 'MSISDN', 'Full_Name', 'OWNER', 'district').");
        return;
      }

      setStagedBaseWakalas(parsed);
    } catch (err) {
      console.error("Error parsing Base Wakala List file:", err);
      alert("Could not parse file. Please provide a valid CSV or Excel file.");
    }
  };

  const handleConfirmBaseWakalaCommit = () => {
    if (!stagedBaseWakalas) return;

    const wakalaMap = new Map<string, BaseWakala>();
    for (const item of baseWakalas) {
      wakalaMap.set(normalizeMsisdn(item.msisdn), item);
    }

    for (const item of stagedBaseWakalas) {
      wakalaMap.set(normalizeMsisdn(item.record.msisdn), item.record);
    }

    const updatedArray = Array.from(wakalaMap.values());
    const nowStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    localStorage.setItem('baseWakalaIndex', JSON.stringify(updatedArray));
    localStorage.setItem('baseWakalaIndex_lastUpdated', nowStr);
    invalidateClassificationCache();

    setBaseWakalas(updatedArray);
    setBaseWakalaLastUpdated(nowStr);
    setBaseWakalaSuccess({
      count: stagedBaseWakalas.length,
      timestamp: nowStr,
    });
    setStagedBaseWakalas(null);
    setSelectedFile(null);

    if (onAddAuditReport) {
      onAddAuditReport({
        id: `base_wakala_${Date.now()}`,
        fileName: 'Base_Wakala_List.xlsx',
        type: 'Base Wakala List',
        uploadedBy: 'System Admin',
        date: nowStr,
        size: `${stagedBaseWakalas.length} records`,
        status: 'Success',
      });
    }
  };

  const parsePriorityWakalaFile = (data: any) => {
    try {
      const workbook = XLSX.read(data, { type: 'array' });
      
      const targetSheetCandidates = [
        'unserviced_wakala',
        'unserviced wakala',
        'priority_wakala',
        'priority wakala',
        'priority wakala list',
        'priority_wakala_list'
      ];

      let selectedSheetName = workbook.SheetNames[0];
      for (const name of workbook.SheetNames) {
        const normName = name.trim().toLowerCase();
        if (targetSheetCandidates.includes(normName)) {
          selectedSheetName = name;
          break;
        }
      }

      const worksheet = workbook.Sheets[selectedSheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet);

      if (!rows || rows.length === 0) {
        alert(`No data rows found in sheet '${selectedSheetName}' of the uploaded file.`);
        return;
      }

      // Build Base Wakala Lookups (code map & msisdn map)
      const currentBaseWakalas: BaseWakala[] = baseWakalas && baseWakalas.length > 0 ? baseWakalas : (() => {
        try {
          const saved = localStorage.getItem('baseWakalaIndex');
          return saved ? JSON.parse(saved) : [];
        } catch (e) {
          return [];
        }
      })();

      const codeMap = new Map<string, BaseWakala>();
      const msisdnMap = new Map<string, BaseWakala>();

      for (const bw of currentBaseWakalas) {
        const code = bw.wakalaCode || (bw as any).code;
        if (code && typeof code === 'string') {
          codeMap.set(code.trim().toLowerCase(), bw);
        }
        if (bw.msisdn) {
          const norm = normalizeMsisdn(bw.msisdn);
          if (norm) msisdnMap.set(norm, bw);
        }
        const altNo = bw.alternateNumber || (bw as any).altMsisdn;
        if (altNo) {
          const normAlt = normalizeMsisdn(altNo);
          if (normAlt) msisdnMap.set(normAlt, bw);
        }
      }

      // Exact header match candidate arrays
      const codeHeaderCandidates = ['wakala code', 'wakala_code', 'code', 'agent code', 'agent_code', 'terminal code', 'terminal_code'];
      const msisdnHeaderCandidates = ['msisdn', 'wakala msisdn', 'wakala_msisdn', 'phone', 'mobile', 'site msisdn', 'site_msisdn', 'till msisdn', 'till_msisdn', 'phone number', 'phone_number', 'alternate number', 'alt msisdn'];

      let codeColKey: string | null = null;
      let msisdnColKey: string | null = null;

      if (rows.length > 0) {
        const sampleKeys = Object.keys(rows[0]);
        for (const k of sampleKeys) {
          const cleanK = k.trim().toLowerCase();
          if (!codeColKey && codeHeaderCandidates.includes(cleanK)) {
            codeColKey = k;
          }
          if (!msisdnColKey && msisdnHeaderCandidates.includes(cleanK)) {
            msisdnColKey = k;
          }
        }
      }

      const currentDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const parsed: PriorityWakala[] = [];
      const seenKeys = new Set<string>();
      let rejectedCount = 0;

      for (const row of rows) {
        const rawCode = codeColKey ? String(row[codeColKey] ?? '').trim() : '';
        const rawMsisdn = msisdnColKey ? String(row[msisdnColKey] ?? '').trim() : '';

        let matchedBase: BaseWakala | undefined = undefined;

        // Priority (a): Exact code match against BaseWakala.wakalaCode
        if (rawCode) {
          matchedBase = codeMap.get(rawCode.toLowerCase());
        }

        // Priority (b): Exact msisdn/altMsisdn normalized match
        if (!matchedBase && rawMsisdn) {
          const normMsisdn = normalizeMsisdn(rawMsisdn);
          if (normMsisdn) {
            matchedBase = msisdnMap.get(normMsisdn);
          }
        }

        if (matchedBase) {
          const normMsisdn = normalizeMsisdn(matchedBase.msisdn || rawMsisdn);
          const key = normMsisdn || matchedBase.wakalaCode || rawCode;
          if (key && !seenKeys.has(key)) {
            seenKeys.add(key);
            parsed.push({
              msisdn: normMsisdn,
              wakalaCode: matchedBase.wakalaCode || (matchedBase as any).code || rawCode || undefined,
              ownerId: matchedBase.ownerId || undefined,
              ownerName: matchedBase.ownerName || undefined,
              period: priorityWakalaPeriod,
              importedAt: currentDate
            });
          }
        } else {
          rejectedCount++;
        }
      }

      if (parsed.length === 0) {
        if (workbook.SheetNames.length > 1) {
          alert(`No Priority Wakala rows could be matched in sheet '${selectedSheetName}'. This file has multiple sheets (${workbook.SheetNames.join(', ')}) — if your per-Wakala list is on a different sheet, rename it to 'Unserviced_Wakala' or ensure it contains a Phone Number/MSISDN column.`);
        } else {
          alert(`No Priority Wakala rows could be matched to the Base Wakala Index in sheet '${selectedSheetName}' (${rejectedCount} rows rejected). Please ensure columns match exact headers like 'Wakala Code' or 'MSISDN', and records exist in the Base Wakala Index.`);
        }
        return;
      }

      alert(`Parsed ${parsed.length} Priority Wakalas successfully.${rejectedCount > 0 ? ` ${rejectedCount} rows were rejected because they could not be matched to an existing Base Wakala record.` : ''}`);
      setStagedPriorityWakalas(parsed);
    } catch (err) {
      console.error("Error parsing Priority Wakala file:", err);
      alert("Could not parse file. Please provide a valid CSV or Excel file.");
    }
  };

  const handleConfirmPriorityWakalaCommit = () => {
    if (!stagedPriorityWakalas) return;

    // Keep every existing record NOT in the period being uploaded, then
    // add the newly staged records for this period — this replaces the
    // period's list rather than merging into one endless registry.
    const otherPeriods = priorityWakalas.filter(p => p.period !== priorityWakalaPeriod);
    const updatedArray = [...otherPeriods, ...stagedPriorityWakalas];

    const nowStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    localStorage.setItem('priorityWakalaList', JSON.stringify(updatedArray));
    localStorage.setItem('priorityWakalaList_lastUpdated', nowStr);

    setPriorityWakalas(updatedArray);
    setPriorityWakalaLastUpdated(nowStr);
    setStagedPriorityWakalas(null);
    setSelectedFile(null);

    if (onAddAuditReport) {
      onAddAuditReport({
        id: `priority_wakala_${Date.now()}`,
        fileName: 'Priority_Wakala_List.xlsx',
        type: 'Priority Wakala List',
        uploadedBy: 'System Admin',
        date: nowStr,
        size: `${stagedPriorityWakalas.length} records (${priorityWakalaPeriod})`,
        status: 'Success',
      });
    }
  };

  const selectedReportConfig = useMemo(() => {
    return REPORT_TYPES.find((r) => r.id === reportType);
  }, [reportType]);
  
  // Drag-and-drop & File state
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ name: string; size: number } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Applet workflow states: 'selection' -> 'reconciliation' -> 'importing' -> 'completed'
  const [importState, setImportState] = useState<'selection' | 'reconciliation' | 'importing' | 'completed'>('selection');

  // KPI-specific state
  const [kpiValidation, setKpiValidation] = useState<{
    isValidExcel: boolean | null;
    sheet1Exists: boolean | null;
    sheet2Exists: boolean | null;
    sheet1ColumnsValid: boolean | null;
    sheet2HeaderValid: boolean | null;
    errors: string[];
  }>({
    isValidExcel: null,
    sheet1Exists: null,
    sheet2Exists: null,
    sheet1ColumnsValid: null,
    sheet2HeaderValid: null,
    errors: []
  });

  const [parsedKpis, setParsedKpis] = useState<any[]>([]); // KPI Summary rows from Sheet 1
  const [parsedServicing, setParsedServicing] = useState<any[]>([]); // Servicing rows from Sheet 2
  const [servicingColumns, setServicingColumns] = useState<string[]>([]); // All auto-detected columns

  // Servicing Table Interaction States
  const [servicingSearch, setServicingSearch] = useState('');
  const [servicingSortCol, setServicingSortCol] = useState<string | null>(null);
  const [servicingSortAsc, setServicingSortAsc] = useState(true);
  const [servicingPage, setServicingPage] = useState(0);
  const [servicingRowsPerPage, setServicingRowsPerPage] = useState(10);
  const [servicingFilterCol, setServicingFilterCol] = useState<string>('all');
  const [servicingFilterVal, setServicingFilterVal] = useState<string>('all');

  // KPI Workbook Preview & Table Interaction States
  const [activeKpiTab, setActiveKpiTab] = useState<string>('executive');
  const [viewMode, setViewMode] = useState<'active_analysis' | 'history_archive' | 'comparison_center'>('active_analysis');
  const [compareMonthA, setCompareMonthA] = useState<string>('');
  const [compareMonthB, setCompareMonthB] = useState<string>('');
  const [isKpiLoading, setIsKpiLoading] = useState(false);
  const [kpiSearchQuery, setKpiSearchQuery] = useState('');
  const [kpiCurrentPage, setKpiCurrentPage] = useState(1);
  const [kpiRowsPerPage, setKpiRowsPerPage] = useState(10);
  const [kpiSortColumn, setKpiSortColumn] = useState<string | null>(null);
  const [kpiSortDirection, setKpiSortDirection] = useState<'asc' | 'desc'>('asc');
  const [workbookStats, setWorkbookStats] = useState<{
    fileName: string;
    numSheets: number;
    sheetNames: string[];
    sheet1Rows: number;
    sheet1Cols: number;
    sheet2Rows: number;
    sheet2Cols: number;
    processingTimeMs: number;
  } | null>(null);

  // Confirmation dialog
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  
  // Staging list and filter states
  const [stagingRecords, setStagingRecords] = useState<StagingOwner[]>([]);
  const [parsedMgtTransactions, setParsedMgtTransactions] = useState<any[]>([]);
  const [mgtReconciliationFilter, setMgtReconciliationFilter] = useState<'all' | 'Mapped' | 'Unmapped'>('all');
  const [selectedStagingIds, setSelectedStagingIds] = useState<Set<string>>(new Set());
  const [reconciliationFilter, setReconciliationFilter] = useState<'all' | 'Existing' | 'New' | 'Updated' | 'Duplicate' | 'Invalid'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Stepper state
  const [activeStep, setActiveStep] = useState(0);
  const [importProgress, setImportProgress] = useState(0);



  // Stats for the final completed screen
  const [syncStats, setSyncStats] = useState({
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Metadata details via shared hook
  const { reportingMonth, lastUpload, activeUserName } = useReportingMetadata();
  const currentReportingMonth = reportingMonth;
  const lastUploadDate = lastUpload;
  const lastUploadedBy = activeUserName;

  const handleLoadActiveReport = async (report: any) => {
    setIsKpiLoading(true);
    try {
      const rows = await getServicingRows(report.reportingMonth);
      const cols = await getServicingColumns(report.reportingMonth);
      setParsedKpis(report.kpis);
      setParsedServicing(rows);
      setServicingColumns(cols.length > 0 ? cols : [
        "Transaction ID",
        "Wakala Name",
        "Zone",
        "Servicing Date",
        "Volume (TZS)",
        "Commission TZS",
        "Agent ID",
        "Status",
        "Network",
        "Liquidity Ratio"
      ]);
      setViewMode('active_analysis');
      setActiveKpiTab('executive');
    } catch (err: any) {
      console.error("Error loading historical report:", err);
      alert(`Error loading historical report data: ${err.message || err}`);
    } finally {
      setIsKpiLoading(false);
    }
  };

  // Shared master owners list fetched from localStorage or fallback
  const getMasterOwners = (): Owner[] => {
    const saved = localStorage.getItem('ownersList');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return initialOwners;
  };

  // Shared tills list fetched from localStorage or fallback
  const getTillsList = () => {
    const saved = localStorage.getItem('tillsList');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  };

  // Preset MGT Demonstration Dataset
  const handleLoadDemoMgtDataset = () => {
    setReportType('mgt');
    setSelectedFile({ name: "Daily_MGT_Report_Sync_Demo.csv", size: 45210 });
    setIsUploading(true);
    setUploadProgress(0);

    let progress = 0;
    const interval = setInterval(() => {
      progress += 15;
      setUploadProgress(Math.min(progress, 100));

      if (progress >= 100) {
        clearInterval(interval);
        setIsUploading(false);
        
        const demoTxns = [
          {
            id: "mgt-txn-1",
            transactionId: "TXN-88201",
            branchMsisdn: "255711223344",
            tillName: "Kariakoo Retail",
            ownerName: "Abubakar Khalid",
            ownerId: "MA-88421",
            location: "Dar es Salaam",
            volume: 3850000,
            status: "Completed",
            isMapped: true
          },
          {
            id: "mgt-txn-2",
            transactionId: "TXN-88202",
            branchMsisdn: "255722334455",
            tillName: "Nyamagana Shop",
            ownerName: "Mwita Chacha",
            ownerId: "MA-77312",
            location: "Mwanza",
            volume: 1200000,
            status: "Completed",
            isMapped: true
          },
          {
            id: "mgt-txn-3",
            transactionId: "TXN-88203",
            branchMsisdn: "255733445566",
            tillName: "Sekei Enterprises",
            ownerName: "Fatma Hassan",
            ownerId: "MA-92105",
            location: "Arusha",
            volume: 2400000,
            status: "Completed",
            isMapped: true
          },
          {
            id: "mgt-txn-4",
            transactionId: "TXN-88204",
            branchMsisdn: "255744556677",
            tillName: "Tambukareli Boutique",
            ownerName: "Grace Mushi",
            ownerId: "MA-44122",
            location: "Dodoma",
            volume: 950000,
            status: "Completed",
            isMapped: true
          },
          {
            id: "mgt-txn-5",
            transactionId: "TXN-88205",
            branchMsisdn: "255799999999",
            tillName: "N/A",
            ownerName: "N/A",
            ownerId: "N/A",
            location: "N/A",
            volume: 450000,
            status: "Completed",
            isMapped: false
          }
        ];

        setParsedMgtTransactions(demoTxns);
        setImportState('reconciliation');
      }
    }, 80);
  };



  const parseKPIExcelFileShared = (data: any, periodType: 'monthly' | 'weekly') => {
    const startTime = performance.now();
    const errorsList: string[] = [];
    let isValidExcel = false;
    let sheet1Exists = false;
    let sheet2Exists = false;
    let sheet1ColumnsValid = false;
    let sheet2HeaderValid = false;

    let workbook: XLSX.WorkBook | null = null;
    try {
      workbook = XLSX.read(data, { type: 'array' });
      isValidExcel = true;
    } catch (e) {
      errorsList.push("Uploaded file is not a valid Excel workbook.");
    }

    if (!workbook) {
      setKpiValidation({
        isValidExcel,
        sheet1Exists: false,
        sheet2Exists: false,
        sheet1ColumnsValid: false,
        sheet2HeaderValid: false,
        errors: errorsList
      });
      setImportState('reconciliation');
      return;
    }

    const sheetNames = workbook.SheetNames;
    
    // Find Sheet 1 (Executive KPI Summary)
    let sheet1Name = sheetNames[0];
    const kpiSheetIdx = sheetNames.findIndex(name => 
      name.toLowerCase().replace(/\s+/g, '').includes('kpisummary') || 
      name.toLowerCase().includes('kpi')
    );
    if (kpiSheetIdx !== -1) {
      sheet1Name = sheetNames[kpiSheetIdx];
      sheet1Exists = true;
    } else if (sheetNames.length >= 1) {
      sheet1Name = sheetNames[0];
      sheet1Exists = true;
    }

    // Find Sheet 2 (Servicing Data)
    let sheet2Name = sheetNames[1];
    const servicingSheetIdx = sheetNames.findIndex((name, idx) => 
      idx !== kpiSheetIdx && (
        name.toLowerCase().replace(/\s+/g, '').includes('servicingdata') || 
        name.toLowerCase().includes('servicing') || 
        name.toLowerCase().includes('data')
      )
    );
    if (servicingSheetIdx !== -1) {
      sheet2Name = sheetNames[servicingSheetIdx];
      sheet2Exists = true;
    } else if (sheetNames.length >= 2) {
      const availableIndices = Array.from({ length: sheetNames.length }, (_, i) => i).filter(i => i !== kpiSheetIdx);
      if (availableIndices.length >= 1) {
        sheet2Name = sheetNames[availableIndices[0]];
        sheet2Exists = true;
      }
    }

    if (!sheet1Exists) {
      errorsList.push(periodType === 'weekly' ? "Weekly KPI Summary worksheet not found." : "Executive KPI Summary worksheet not found.");
    }
    if (!sheet2Exists) {
      errorsList.push("Servicing Data worksheet not found.");
    }

    let sheet1Data: any[][] = [];
    let sheet1HeaderIdx = -1;
    let sheet1Headers: string[] = [];

    if (sheet1Exists && sheet1Name) {
      const sheet1 = workbook.Sheets[sheet1Name];
      sheet1Data = XLSX.utils.sheet_to_json(sheet1, { header: 1 });
      
      const findSheet1HeaderRow = () => {
        for (let r = 0; r < Math.min(sheet1Data.length, 15); r++) {
          const row = sheet1Data[r];
          if (!row || !Array.isArray(row)) continue;
          const rowStrings = row.map(cell => String(cell || '').trim().toLowerCase());
          
          const hasKpi = rowStrings.some(s => s === 'kpi' || s === 'kpi name' || s.startsWith('kpi'));
          const hasTarget = rowStrings.some(s => s === 'monthly target' || s === 'target');
          const hasAchieved = rowStrings.some(s => s === 'mtd achieved' || s === 'achieved');
          const hasPerformance = rowStrings.some(s => s.includes('performance'));
          const hasStatus = rowStrings.some(s => s === 'status');

          if (hasKpi && hasTarget && hasAchieved && hasPerformance && hasStatus) {
            sheet1HeaderIdx = r;
            sheet1Headers = row.map(cell => String(cell || '').trim());
            return true;
          }
        }
        return false;
      };

      const hasSheet1Headers = findSheet1HeaderRow();
      if (hasSheet1Headers && sheet1HeaderIdx !== -1) {
        sheet1ColumnsValid = true;
      } else {
        errorsList.push(periodType === 'weekly'
          ? "KPI Summary sheet does not contain the required columns: KPI, Target, Achieved, Performance (%), Status"
          : "KPI Summary sheet does not contain the required columns: KPI, Monthly Target, MTD Achieved, Performance (%), Status");
      }
    }

    let sheet2Data: any[][] = [];
    let sheet2HeaderIdx = -1;
    let sheet2Headers: string[] = [];

    if (sheet2Exists && sheet2Name) {
      const sheet2 = workbook.Sheets[sheet2Name];
      // defval keeps short/sparse rows aligned with the header positions, so
      // trailing blank cells no longer shift values into the wrong columns.
      sheet2Data = XLSX.utils.sheet_to_json(sheet2, { header: 1, defval: '', blankrows: false });

      // A title/banner row above the real header used to be taken as the
      // header, which silently mislabelled every column. Score candidate rows
      // and pick the one that actually looks like a header.
      const scoreHeaderRow = (row: any[]): number => {
        if (!row || !Array.isArray(row)) return -1;
        const cells = row.map(c => String(c ?? '').trim()).filter(v => v !== '');
        if (cells.length < 2) return -1;
        const textCells = cells.filter(v => isNaN(Number(v.replace(/,/g, ''))));
        if (textCells.length < Math.max(2, Math.ceil(cells.length * 0.6))) return -1;
        let score = cells.length;
        const norm = cells.map(v => v.toLowerCase().replace(/[\s_-]+/g, ''));
        if (norm.some(v => v.includes('msisdn') || v.includes('phone'))) score += 100;
        if (norm.some(v => v.includes('status'))) score += 20;
        if (norm.some(v => v.includes('servicing') || v.includes('txn') || v.includes('val'))) score += 20;
        return score;
      };

      const findSheet2HeaderRow = () => {
        let bestIdx = -1;
        let bestScore = 0;
        for (let r = 0; r < Math.min(sheet2Data.length, 15); r++) {
          const score = scoreHeaderRow(sheet2Data[r]);
          if (score > bestScore) {
            bestScore = score;
            bestIdx = r;
          }
        }
        if (bestIdx === -1) {
          // Fallback: first non-empty row (previous behaviour).
          for (let r = 0; r < Math.min(sheet2Data.length, 10); r++) {
            const row = sheet2Data[r];
            if (row && Array.isArray(row) && row.some(cell => String(cell ?? '').trim() !== '')) {
              bestIdx = r;
              break;
            }
          }
        }
        if (bestIdx === -1) return false;
        sheet2HeaderIdx = bestIdx;
        sheet2Headers = (sheet2Data[bestIdx] as any[]).map(cell => String(cell ?? '').trim());
        return true;
      };

      const hasSheet2Headers = findSheet2HeaderRow();
      if (hasSheet2Headers && sheet2HeaderIdx !== -1 && sheet2Headers.length > 0) {
        sheet2HeaderValid = true;
      } else {
        errorsList.push("Sheet 2 (Servicing Data) does not contain a valid header row.");
      }
    }

    // Parse Sheet 1 KPI Data
    const finalKpiRows: any[] = [];
    if (sheet1Exists && sheet1ColumnsValid) {
      const s1HeadersLower = sheet1Headers.map(h => h.toLowerCase());
      const kpiColIdx = s1HeadersLower.findIndex(s => s === 'kpi' || s === 'kpi name' || s.startsWith('kpi'));
      const targetColIdx = s1HeadersLower.findIndex(s => s === 'monthly target' || s === 'target');
      const achievedColIdx = s1HeadersLower.findIndex(s => s === 'mtd achieved' || s === 'achieved');
      const performanceColIdx = s1HeadersLower.findIndex(s => s.includes('performance'));
      const statusColIdx = s1HeadersLower.findIndex(s => s === 'status');

      for (let r = sheet1HeaderIdx + 1; r < sheet1Data.length; r++) {
        const row = sheet1Data[r];
        if (!row || !Array.isArray(row) || row.length === 0) continue;
        
        const kpiName = String(row[kpiColIdx] || '').trim();
        if (!kpiName) continue;

        const monthlyTarget = String(row[targetColIdx] !== undefined ? row[targetColIdx] : '').trim();
        const mtdAchieved = String(row[achievedColIdx] !== undefined ? row[achievedColIdx] : '').trim();
        const performanceVal = String(row[performanceColIdx] !== undefined ? row[performanceColIdx] : '').trim();
        const statusVal = String(row[statusColIdx] || '').trim();

        let perfPct = 0;
        if (performanceVal) {
          const cleanPerf = performanceVal.replace('%', '').trim();
          const parsedNum = parseFloat(cleanPerf);
          if (!isNaN(parsedNum)) {
            if (parsedNum < 1.0 && performanceVal.indexOf('%') === -1) {
              perfPct = Math.round(parsedNum * 100);
            } else {
              perfPct = Math.round(parsedNum);
            }
          }
        }

        const cleanNum = (str: string) => {
          const num = parseFloat(str.replace(/[^0-9.-]/g, ''));
          return isNaN(num) ? 0 : num;
        };

        finalKpiRows.push({
          id: `kpi-parsed-${r}-${Date.now()}`,
          name: kpiName,
          target: monthlyTarget,
          targetVal: cleanNum(monthlyTarget),
          achieved: mtdAchieved,
          achievedVal: cleanNum(mtdAchieved),
          performance: perfPct,
          status: statusVal.toUpperCase()
        });
      }
    }
    setParsedKpis(finalKpiRows);

    // Parse Sheet 2 Servicing Data
    const finalServicingRows: any[] = [];
    let uniqueSheet2Headers: string[] = [];
    if (sheet2Exists && sheet2HeaderValid) {
      // Repeated header labels used to overwrite each other, losing a column's
      // values entirely — suffix duplicates instead.
      const seenHeaders = new Map<string, number>();
      uniqueSheet2Headers = sheet2Headers.map((header, idx) => {
        const base = header.trim() !== '' ? header.trim() : `Column_${idx + 1}`;
        const seen = seenHeaders.get(base) || 0;
        seenHeaders.set(base, seen + 1);
        return seen === 0 ? base : `${base}_${seen + 1}`;
      });
      setServicingColumns(uniqueSheet2Headers);

      for (let r = sheet2HeaderIdx + 1; r < sheet2Data.length; r++) {
        const row = sheet2Data[r];
        if (!row || !Array.isArray(row) || row.length === 0) continue;
        if (row.every(cell => cell === undefined || cell === null || String(cell).trim() === '')) continue;

        const rowObj: Record<string, any> = {};

        uniqueSheet2Headers.forEach((header, idx) => {
          const value = row[idx];
          rowObj[header] = value !== undefined && value !== null ? String(value).trim() : '';
        });

        // TASK A1: Derive deterministic _id from row content fields rather than Date.now()
        const rowMsisdn = (
          rowObj.MSISDN || rowObj.msisdn || rowObj.MSISDN_NO || rowObj['MSISDN NO'] ||
          rowObj.Phone || rowObj.phone || rowObj['Phone Number'] || rowObj['Branch_msisdn'] || ''
        ).trim();

        const rowSiteId = (
          rowObj.siteid || rowObj.site_id || rowObj.SiteID || rowObj.SITEID ||
          rowObj['Site ID'] || rowObj['SITE ID'] || rowObj['Site_ID'] || ''
        ).trim();

        const rowCode = (
          rowObj.Agent_Code || rowObj.agent_code || rowObj['Agent Code'] || rowObj.code || rowObj.Code || ''
        ).trim();

        const rowOwner = (
          rowObj.Owner_Name || rowObj.owner_name || rowObj['Wakala Name'] || rowObj.owner || rowObj.Owner || ''
        ).trim();

        const rowTxId = (
          rowObj['Transaction ID'] || rowObj['transactionId'] || rowObj['TxID'] || rowObj.id || ''
        ).trim();

        let stableId = '';
        if (rowTxId && rowMsisdn) {
          stableId = `servicing-${rowTxId}-${rowMsisdn}`;
        } else if (rowTxId) {
          stableId = `servicing-tx-${rowTxId}`;
        } else if (rowMsisdn && rowSiteId) {
          stableId = `servicing-${rowMsisdn}-${rowSiteId}`;
        } else if (rowMsisdn && rowCode) {
          stableId = `servicing-${rowMsisdn}-${rowCode}`;
        } else if (rowMsisdn && rowOwner) {
          stableId = `servicing-${rowMsisdn}-${rowOwner}`;
        } else if (rowMsisdn) {
          stableId = `servicing-${rowMsisdn}-${r}`;
        } else if (rowSiteId && rowCode) {
          stableId = `servicing-${rowSiteId}-${rowCode}`;
        } else if (rowSiteId) {
          stableId = `servicing-${rowSiteId}-${r}`;
        } else {
          stableId = `servicing-row-${r}`;
        }

        rowObj._id = stableId;
        finalServicingRows.push(rowObj);
      }
    } else {
      setServicingColumns([]);
    }
    setParsedServicing(finalServicingRows);

    // If Sheet 2 exists but contains 0 data rows, push warning
    if (sheet2Exists && sheet2HeaderValid && finalServicingRows.length === 0) {
      errorsList.push("No servicing records found.");
    }

    setKpiValidation({
      isValidExcel,
      sheet1Exists,
      sheet2Exists,
      sheet1ColumnsValid,
      sheet2HeaderValid,
      errors: errorsList
    });

    const endTime = performance.now();
    const processingTimeMs = Math.round(endTime - startTime);

    setWorkbookStats({
      fileName: selectedFile?.name || (periodType === 'weekly' ? "Weekly_KPI_Workbook.xlsx" : "KPI_Workbook_Upload.xlsx"),
      numSheets: sheetNames.length,
      sheetNames,
      sheet1Rows: sheet1Data.length,
      sheet1Cols: sheet1Headers.length,
      sheet2Rows: sheet2Data.length,
      sheet2Cols: uniqueSheet2Headers.length,
      processingTimeMs
    });

    setImportState('reconciliation');
  };

  const parseKPIExcelFile = (data: any) => {
    parseKPIExcelFileShared(data, 'monthly');
  };

  const parseWeeklyKPIExcelFile = (data: any) => {
    parseKPIExcelFileShared(data, 'weekly');
  };

  // Native CSV parser
  const parseCSVFile = async (text: string) => {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return;

    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
    const parsedRows: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Simple CSV quote-aware splitter
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index]?.replace(/^["']|["']$/g, '') || '';
      });
      parsedRows.push(row);
    }

    if (parsedRows.length === 0) {
      alert("The uploaded CSV is empty or has invalid formatting.");
      setIsUploading(false);
      setSelectedFile(null);
      return;
    }

    if (reportType === 'mgt') {
      const tillsList = getTillsList();
      const currentOwners = getMasterOwners();
      const currentPersonnel = (() => {
        const saved = localStorage.getItem('personnelList');
        return saved ? JSON.parse(saved) : [];
      })();
      let existingTransactions: any[] = [];
      try {
        existingTransactions = await getDailyServicingRows();
      } catch (e) {
        console.error("Failed loading existing transactions for MGT mapping:", e);
      }

      const txns = mapTransactions(parsedRows, tillsList, currentOwners, currentPersonnel, existingTransactions);

      setParsedMgtTransactions(txns);
      setImportState('reconciliation');
      return;
    }

    // Process extracted lines against master owners list
    const dbOwners = getMasterOwners();
    const stagingList: StagingOwner[] = [];
    const idCountMap: Record<string, number> = {};

    // Count occurrences for Duplicate detection
    parsedRows.forEach(row => {
      const agentId = (row.agent_id || row.wakala_id || row.owner_code || row.id || '').trim();
      if (agentId) {
        idCountMap[agentId] = (idCountMap[agentId] || 0) + 1;
      }
    });

    parsedRows.forEach((row, idx) => {
      const agentId = (row.agent_id || row.wakala_id || row.owner_code || row.id || `UNKNOWN-${idx}`).trim();
      const name = (row.owner_name || row.name || '').trim();
      const phone = (row.phone || row.contact || row.telephone || '').trim();
      const email = (row.email || '').trim();
      const businessName = (row.business_name || row.business || '').trim();
      const region = (row.region || 'Dar es Salaam').trim();
      const district = (row.district || '').trim();
      const ward = (row.ward || '').trim();
      const status = (row.status || 'Active') as Owner['status'];

      const stagingId = `staging-${idx}-${Date.now()}`;

      // Validation
      let errorMessage = '';
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!agentId || agentId.startsWith('UNKNOWN-') || agentId.length < 3) {
        errorMessage = 'Invalid or missing Agent ID (must be at least 3 characters)';
      } else if (!name) {
        errorMessage = 'Blank owner name is not allowed';
      } else if (email && !emailRegex.test(email)) {
        errorMessage = 'Invalid email address signature';
      }

      if (errorMessage) {
        stagingList.push({
          id: stagingId,
          masterAgentId: agentId,
          name: name || "Unknown Owner",
          phone,
          email,
          businessName,
          region,
          district,
          ward,
          classification: 'Invalid',
          status: 'Pending',
          resolutionStatus: 'Rejected',
          errorMessage
        });
        return;
      }

      // Duplicate check inside the file
      if (idCountMap[agentId] > 1) {
        stagingList.push({
          id: stagingId,
          masterAgentId: agentId,
          name,
          phone,
          email,
          businessName,
          region,
          district,
          ward,
          classification: 'Duplicate',
          status,
          resolutionStatus: 'Pending',
          errorMessage: 'Conflicting record declared for the same Agent ID in upload sheet.'
        });
        return;
      }

      // Match against master database
      const dbMatch = dbOwners.find(o => o.masterAgentId === agentId);
      if (!dbMatch) {
        stagingList.push({
          id: stagingId,
          masterAgentId: agentId,
          name,
          phone,
          email,
          businessName,
          region,
          district,
          ward,
          classification: 'New',
          status,
          resolutionStatus: 'Pending'
        });
      } else {
        // Compare values
        const diffs: { field: string; oldValue: string; newValue: string }[] = [];
        if (dbMatch.name.toLowerCase() !== name.toLowerCase()) {
          diffs.push({ field: "Owner Name", oldValue: dbMatch.name, newValue: name });
        }
        if (dbMatch.region.toLowerCase() !== region.toLowerCase()) {
          diffs.push({ field: "Region", oldValue: dbMatch.region, newValue: region });
        }
        if (status && dbMatch.status !== status) {
          diffs.push({ field: "Status", oldValue: dbMatch.status, newValue: status });
        }

        if (diffs.length > 0) {
          stagingList.push({
            id: stagingId,
            masterAgentId: agentId,
            name,
            phone,
            email,
            businessName,
            region,
            district,
            ward,
            classification: 'Updated',
            status: dbMatch.status,
            resolutionStatus: 'Pending',
            changedFields: diffs,
            originalRecord: dbMatch
          });
        } else {
          stagingList.push({
            id: stagingId,
            masterAgentId: agentId,
            name,
            phone,
            email,
            businessName,
            region,
            district,
            ward,
            classification: 'Existing',
            status: dbMatch.status,
            resolutionStatus: 'Auto-Skipped'
          });
        }
      }
    });

    setStagingRecords(stagingList);

    // Default select New and Updated records
    const defaultSelected = new Set<string>();
    stagingList.forEach(r => {
      if (r.classification === 'New' || r.classification === 'Updated') {
        defaultSelected.add(r.id);
      }
    });
    setSelectedStagingIds(defaultSelected);
    setImportState('reconciliation');
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const processSelectedFile = (file: File) => {
    if (!reportType) {
      alert("Please select a report type first.");
      return;
    }
    
    setSelectedFile({ name: file.name, size: file.size });
    setIsUploading(true);
    setUploadProgress(0);

    if (reportType === 'mgt') {
      const isExcel = /\.(xlsx|xls|xlx)$/i.test(file.name);
      if (isExcel) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const data = e.target?.result;
          let progress = 0;
          const interval = setInterval(() => {
            progress += 20;
            setUploadProgress(progress);
            if (progress >= 100) {
              clearInterval(interval);
              setIsUploading(false);
              try {
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const csvText = XLSX.utils.sheet_to_csv(firstSheet);
                parseCSVFile(csvText);
              } catch (err) {
                console.error("Failed to parse Excel file for MGT:", err);
                alert("Failed to parse spreadsheet file. Please ensure it is a valid CSV or Excel file.");
              }
            }
          }, 100);
        };
        reader.readAsArrayBuffer(file);
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          let progress = 0;
          const interval = setInterval(() => {
            progress += 20;
            setUploadProgress(progress);
            if (progress >= 100) {
              clearInterval(interval);
              setIsUploading(false);
              parseCSVFile(text);
            }
          }, 100);
        };
        reader.readAsText(file);
      }
    } else if (reportType === 'kpi' || reportType === 'weekly_kpi') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target?.result;
        
        let progress = 0;
        const interval = setInterval(() => {
          progress += 20;
          setUploadProgress(progress);
          if (progress >= 100) {
            clearInterval(interval);
            setIsUploading(false);
            if (reportType === 'weekly_kpi') {
              parseWeeklyKPIExcelFile(data);
            } else {
              parseKPIExcelFile(data);
            }
          }
        }, 100);
      };
      reader.readAsArrayBuffer(file);
    } else if (reportType === 'sa_till_registry') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target?.result;
        let progress = 0;
        const interval = setInterval(() => {
          progress += 25;
          setUploadProgress(progress);
          if (progress >= 100) {
            clearInterval(interval);
            setIsUploading(false);
            parseSaTillFile(data);
          }
        }, 80);
      };
      reader.readAsArrayBuffer(file);
    } else if (reportType === 'base_wakala_list') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target?.result;
        let progress = 0;
        const interval = setInterval(() => {
          progress += 25;
          setUploadProgress(progress);
          if (progress >= 100) {
            clearInterval(interval);
            setIsUploading(false);
            parseBaseWakalaFile(data);
          }
        }, 80);
      };
      reader.readAsArrayBuffer(file);
    } else if (reportType === 'priority_wakala') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target?.result;
        let progress = 0;
        const interval = setInterval(() => {
          progress += 25;
          setUploadProgress(progress);
          if (progress >= 100) {
            clearInterval(interval);
            setIsUploading(false);
            parsePriorityWakalaFile(data);
          }
        }, 80);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const triggerBrowse = () => {
    fileInputRef.current?.click();
  };

  // Toggle selection for a staging ID
  const handleToggleRowSelection = (id: string) => {
    const record = stagingRecords.find(r => r.id === id);
    if (record?.classification === 'Invalid') return; // Cannot select invalid rows

    const next = new Set(selectedStagingIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedStagingIds(next);
  };

  // Header Bulk Actions
  const handleSelectAllFiltered = (filteredList: StagingOwner[]) => {
    const next = new Set(selectedStagingIds);
    filteredList.forEach(r => {
      if (r.classification !== 'Invalid') {
        next.add(r.id);
      }
    });
    setSelectedStagingIds(next);
  };

  const handleDeselectAllFiltered = (filteredList: StagingOwner[]) => {
    const next = new Set(selectedStagingIds);
    filteredList.forEach(r => {
      next.delete(r.id);
    });
    setSelectedStagingIds(next);
  };

  const handleApproveRow = (id: string) => {
    setStagingRecords(prev => prev.map(r => r.id === id ? { ...r, resolutionStatus: 'Approved' } : r));
    const next = new Set(selectedStagingIds);
    next.add(id);
    setSelectedStagingIds(next);
  };

  const handleRejectRow = (id: string) => {
    setStagingRecords(prev => prev.map(r => r.id === id ? { ...r, resolutionStatus: 'Rejected' } : r));
    const next = new Set(selectedStagingIds);
    next.delete(id);
    setSelectedStagingIds(next);
  };

  // Apply Changes and Save (Trigger db writes & Audit logs)
  const handleApplySynchronize = () => {
    setImportState('importing');
    setActiveStep(0);
    setImportProgress(5);

    if (reportType === 'mgt') {
      const progressSteps = [
        { title: "Verifying Transaction MSISDN Registry", desc: "Checking and matching branch_msisdn inputs against registered authoritative Tills." },
        { title: "Resolving Wakala Owners via Tills", desc: "Identifying terminal owner profiles through authoritative Till associations." },
        { title: "Formatting Ingestion Records", desc: "Constructing standard transaction object schema conforming to DODOMA system specifications." },
        { title: "Writing Transactions to Sovereign Ledger", desc: "Appending verified mapped transaction rows into servicingDataRows database." },
        { title: "Appending Ingestion Event to Audit Trail", desc: "Committing immutable cryptographic audit trail record for this ingestion event." }
      ];

      const mappedTxns = parsedMgtTransactions.filter(t => t.isMapped);
      const unmappedCount = parsedMgtTransactions.filter(t => !t.isMapped).length;

      // Progressive Stepper Simulation
      let currentStep = 0;
      const interval = setInterval(async () => {
        currentStep += 1;
        setActiveStep(currentStep);
        setImportProgress(Math.min(Math.round((currentStep / progressSteps.length) * 100), 100));

        if (currentStep >= progressSteps.length) {
          clearInterval(interval);

          // Write transactions to servicingDataRows with deterministic IDs so reuploads update/overwrite
          const newServicingRows = mappedTxns.map((t, idx) => {
            const dateFromRow = t.date || t['Servicing Date'] || t['servicing_date'] || t['servicing date'] || t.servicing_date || t.timestamp || '';
            const finalDate = formatToISODate(dateFromRow);
            const rawTS = t.timestamp || t['Servicing Timestamp'] || t['tranferdate'] || t['tranferda'] || t['transferdate'] || dateFromRow;
            const finalTimestamp = rawTS && String(rawTS).trim() ? String(rawTS).trim() : new Date().toISOString();
            const txIdStr = t.transactionId || t['Transaction ID'] || '';
            const msisdnStr = t.branchMsisdn || t['Branch_msisdn'] || '';
            const stableId = (txIdStr && msisdnStr)
              ? `mgt-${String(txIdStr).toLowerCase()}_${String(msisdnStr).trim()}`
              : t.id || `mgt-row-${idx}`;

            return {
              _id: stableId,
              "Transaction ID": t.transactionId,
              "Branch_msisdn": t.branchMsisdn,
              "Dest_MSISDN": t.destMsisdn || '',
              "Wakala Name": t.tillName,
              "Agent ID": t.ownerId || 'MA-UNKNOWN',
              "Wakala Owner": t.ownerName,
              "Zone": t.location,
              "Volume (TZS)": t.volume,
              "Status": t.status,
              "Servicing Date": finalDate,
              "Servicing Timestamp": finalTimestamp,
              "source_balance_before": t.sourceBalanceBefore,
              "source_balance_after": t.sourceBalanceAfter
            };
          });

          await saveDailyServicingData(newServicingRows);
          invalidateClassificationCache();

          // Run Transaction Classification Engine (server-authoritative)
          const ingestResult = await ingestClassified(newServicingRows, {
            fileName: selectedFile?.name || 'Daily_MGT_Report.csv',
            reportType: 'Daily MGT',
            fileSize: selectedFile?.size,
            uploadedByName: lastUploadedBy,
          });
          const classSummary = ingestResult.summary;
          localStorage.setItem('lastClassificationSummary', JSON.stringify(classSummary));
          setLastClassificationSummary(classSummary);

          // Recalculate and synchronize all performance metrics based on MGT contribution
          await recalculateAllPerformances();
          window.dispatchEvent(new Event('servicing-rows-updated'));

          // Append Audit Logs to Local Storage
          const newAuditLogs = [{
            audit_id: Date.now() + Math.floor(Math.random() * 1000),
            action_type: 'INGEST_MGT_TRANSACTIONS',
            action_description: `Admin ingested ${newServicingRows.length} MGT transactions via Daily MGT Operational Ingestion.`,
            affected_table: 'servicingDataRows',
            affected_record_id: 'Daily_MGT_Report',
            previous_value: null,
            new_value: `${newServicingRows.length} rows mapped`,
            ip_address: "192.168.1.114",
            logged_at: new Date().toISOString()
          }];
          const existingLogs = JSON.parse(localStorage.getItem('systemAuditLogs') || '[]');
          localStorage.setItem('systemAuditLogs', JSON.stringify([...newAuditLogs, ...existingLogs]));

          setSyncStats({
            processed: parsedMgtTransactions.length,
            created: newServicingRows.length, // successfully mapped transactions
            updated: 0,
            skipped: unmappedCount // unregistered tills skipped
          });

          // Add file report instance to Upload History
          const newReport: AuditReport = {
            id: `REP-${Math.floor(90000 + Math.random() * 9000)}`,
            fileName: selectedFile?.name || "Daily_MGT_Report.csv",
            type: "Daily MGT",
            uploadedBy: lastUploadedBy,
            date: new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) + " " + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
            size: `${((selectedFile?.size || 45210) / 1024).toFixed(1)} KB`,
            status: 'Success',
            uploadId: ingestResult.uploadId ?? null
          };
          onAddAuditReport(newReport);

          setImportState('completed');
        }
      }, 1000);
      return;
    }

    const progressSteps = [
      { title: "Matching and Resolving Staging Rows", desc: "Evaluating Admin decisions and checking matching constraint indexes." },
      { title: "Generating System Audit Trail Deltas", desc: "Writing immutable state delta snapshots in compliance with 3NF." },
      { title: "Writing New Owners to Database", desc: "Registering new master terminal owners into Dodoma ledger." },
      { title: "Updating Existing Owner Master Profiles", desc: "Committing spelling, phone, and zone updates to owners tables." },
      { title: "Archiving Daily MGT Upload History", desc: "Ingesting raw report checksum hash to prevent duplication." }
    ];

    // Read existing database
    const dbOwners = [...getMasterOwners()];
    const approvedRecords = stagingRecords.filter(r => selectedStagingIds.has(r.id) || r.resolutionStatus === 'Approved');

    let newOwnersCount = 0;
    let updatedOwnersCount = 0;
    let skippedOwnersCount = stagingRecords.length - approvedRecords.length;

    // Staging list for audit logs to generate
    const newAuditLogs: any[] = [];
    const clientIP = "192.168.1.114"; // Simulated active admin IP

    approvedRecords.forEach(rec => {
      if (rec.classification === 'New') {
        newOwnersCount++;
        // Create actual database Owner entity
        const newOwnerEntity: Owner = {
          id: `owner-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          name: rec.name,
          masterAgentId: rec.masterAgentId,
          region: rec.region,
          memberSince: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          avatar: getAvatarUrl(rec.name),
          wakalas: 1, // default starting terminal
          portfolioSize: 'TZS 0.0M',
          portfolioGrowth: 'Not yet tracked',
          performance: 100, // starting clean score
          status: rec.status
        };
        dbOwners.push(newOwnerEntity);

        // System Audit log entry
        newAuditLogs.push({
          audit_id: Date.now() + Math.floor(Math.random() * 1000),
          action_type: 'UPDATE_OWNER',
          action_description: `Admin registered new Master Agent Owner ${rec.name} (${rec.masterAgentId}) via MGT synchronization.`,
          affected_table: 'owners',
          affected_record_id: rec.masterAgentId,
          previous_value: null,
          new_value: newOwnerEntity,
          ip_address: clientIP,
          logged_at: new Date().toISOString()
        });
      } 
      else if (rec.classification === 'Updated') {
        updatedOwnersCount++;
        // Mutate existing entity
        const matchIdx = dbOwners.findIndex(o => o.masterAgentId === rec.masterAgentId);
        if (matchIdx !== -1) {
          const oldSnapshot = { ...dbOwners[matchIdx] };
          dbOwners[matchIdx] = {
            ...dbOwners[matchIdx],
            name: rec.name,
            region: rec.region,
            status: rec.status
          };

          // System Audit log entry
          newAuditLogs.push({
            audit_id: Date.now() + Math.floor(Math.random() * 1000),
            action_type: 'UPDATE_OWNER',
            action_description: `Admin updated Master Agent Owner ${rec.masterAgentId} attributes (${rec.changedFields?.map(f => f.field).join(', ')}) via MGT synchronization.`,
            affected_table: 'owners',
            affected_record_id: rec.masterAgentId,
            previous_value: oldSnapshot,
            new_value: dbOwners[matchIdx],
            ip_address: clientIP,
            logged_at: new Date().toISOString()
          });
        }
      }
    });

    // Write back to mock DB in localStorage
    localStorage.setItem('ownersList', JSON.stringify(dbOwners));

    // Append Audit Logs to Local Storage
    const existingLogs = JSON.parse(localStorage.getItem('systemAuditLogs') || '[]');
    localStorage.setItem('systemAuditLogs', JSON.stringify([...newAuditLogs, ...existingLogs]));

    setSyncStats({
      processed: stagingRecords.length,
      created: newOwnersCount,
      updated: updatedOwnersCount,
      skipped: skippedOwnersCount
    });

    // Stepper progressive animation
    let currentStep = 0;
    const interval = setInterval(() => {
      currentStep += 1;
      setActiveStep(currentStep);
      setImportProgress(Math.min(Math.round((currentStep / progressSteps.length) * 100), 100));
      
      if (currentStep >= progressSteps.length) {
        clearInterval(interval);
        
        // Add file report instance to Upload History
        const newReport: AuditReport = {
          id: `REP-${Math.floor(90000 + Math.random() * 9000)}`,
          fileName: selectedFile?.name || "Daily_MGT_Report.csv",
          type: "Owners List",
          uploadedBy: lastUploadedBy,
          date: new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) + " " + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
          size: `${((selectedFile?.size || 45210) / 1024).toFixed(1)} KB`,
          status: 'Success'
        };
        onAddAuditReport(newReport);
        
        setImportState('completed');
      }
    }, 1100);
  };

  const handleConfirmKpiSync = () => {
    setShowConfirmDialog(false);
    setImportState('importing');
    setActiveStep(0);
    setImportProgress(5);

    const isWeekly = reportType === 'weekly_kpi';

    const progressSteps = isWeekly ? [
      { title: "Verifying Ingested Weekly Excel Signatures", desc: "Verifying checksums and schema headers for Weekly KPI Summary & Servicing Data." },
      { title: "Parsing Sheet 1 Weekly KPI Performance", desc: "Extracting KPI metric parameters and performance goals exactly as declared." },
      { title: "Ingesting Sheet 2 Weekly Servicing Transaction Rows", desc: "Auto-detecting and mapping servicing records dynamically." },
      { title: "Writing Weekly KPI Records to IndexedDB Store", desc: "Updating weekly servicing ledger and history archive." },
      { title: "Updating Weekly Performance Trajectory", desc: "Re-linking weekly checkpoints to monthly targets." }
    ] : [
      { title: "Verifying Ingested Excel Signatures", desc: "Verifying checksums and schema headers for KPI Summary & Servicing Data." },
      { title: "Parsing Sheet 1 Monthly KPI Targets", desc: "Extracting KPI metric parameters and performance goals exactly as declared." },
      { title: "Ingesting Sheet 2 Servicing Transaction Rows", desc: "Auto-detecting and mapping servicing records dynamically." },
      { title: "Writing KPI Records to Core Dodoma Ledger", desc: "Updating master executive dashboard state and historical files." },
      { title: "Updating Global Enterprise Dashboard Metrics", desc: "Updating live performance targets, gauges, and historical KPIs." }
    ];

    let currentStep = 0;
    const interval = setInterval(() => {
      currentStep += 1;
      setActiveStep(currentStep);
      setImportProgress(Math.min(Math.round((currentStep / progressSteps.length) * 100), 100));
      
      if (currentStep >= progressSteps.length) {
        clearInterval(interval);

        // Map parsed KPIs to KPIMetric schema format
        const savedKpis: KPIMetric[] = parsedKpis.map((k, idx) => {
          let mappedStatus: 'ON TRACK' | 'ACHIEVED' | 'NEEDS ATTENTION' | 'CRITICAL' = 'ON TRACK';
          const statusStr = k.status.toUpperCase();
          if (statusStr.includes('ACHIEVED') || statusStr.includes('EXCEEDED') || statusStr.includes('MET') || statusStr === 'SUCCESS') {
            mappedStatus = 'ACHIEVED';
          } else if (statusStr.includes('ATTENTION') || statusStr.includes('WARN') || statusStr.includes('RISK') || statusStr.includes('BEHIND')) {
            mappedStatus = 'NEEDS ATTENTION';
          } else if (statusStr.includes('CRITICAL') || statusStr.includes('BELOW') || statusStr.includes('FAIL')) {
            mappedStatus = 'CRITICAL';
          } else {
            mappedStatus = 'ON TRACK';
          }

          return {
            id: `kpi-${isWeekly ? 'weekly' : 'monthly'}-${idx + 1}-${Date.now()}`,
            name: k.name,
            target: k.target,
            targetVal: k.targetVal,
            achieved: k.achieved,
            achievedVal: k.achievedVal,
            performance: k.performance,
            status: mappedStatus
          };
        });

        if (isWeekly) {
          // Postgres is the system of record for weekly data; IndexedDB keeps
          // an offline mirror. Replaces the week so re-uploads stay idempotent.
          clearWeeklyServicingData(uploadWeek)
            .catch(() => undefined)
            .then(() => persistWeeklyServicing(uploadWeek, uploadMonth, parsedServicing, servicingColumns))
            .then((res) => {
              invalidateClassificationCache();
              window.dispatchEvent(new Event('weekly-kpi-updated'));
              console.log(
                `Persisted ${res.saved} weekly servicing records for ${uploadWeek} (${res.cloud ? 'cloud + offline mirror' : 'offline mirror only'})`
              );
            })
            .catch(err => {
              console.error("Critical weekly write failure:", err);
              alert(`Weekly report write failure: ${err.message || err}`);
            });

          // Save history in localStorage (weeklyKpiHistory)
          try {
            const savedHistory = JSON.parse(localStorage.getItem('weeklyKpiHistory') || '[]');
            const duplicateIdx = savedHistory.findIndex((h: any) => h.reportingWeek === uploadWeek);
            const archivePayload: any = {
              reportingWeek: uploadWeek,
              reportingMonth: uploadMonth, // associated target month
              uploadDate: new Date().toLocaleDateString('en-US') + ", " + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              uploadedBy: lastUploadedBy,
              fileName: selectedFile?.name || "Weekly_KPI_Workbook.xlsx",
              status: "Success",
              processingTimeMs: workbookStats?.processingTimeMs || 120,
              recordsImported: parsedServicing.length,
              kpis: savedKpis // contains parsed weekly kpi achieved values
            };

            if (duplicateIdx !== -1) {
              savedHistory[duplicateIdx] = archivePayload;
            } else {
              savedHistory.unshift(archivePayload);
            }

            localStorage.setItem('weeklyKpiHistory', JSON.stringify(savedHistory));
          } catch (e: any) {
            console.error("Error archiving to weeklyKpiHistory:", e);
            alert(`Error updating weekly historical archive registry: ${e.message || e}`);
          }

          const newReport: AuditReport = {
            id: `REP-${Math.floor(90000 + Math.random() * 9000)}`,
            fileName: selectedFile?.name || "Weekly_KPI_Workbook.xlsx",
            type: "Weekly KPI",
            uploadedBy: lastUploadedBy,
            date: new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) + " " + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
            size: selectedFile?.size !== undefined ? `${(selectedFile.size / 1024).toFixed(1)} KB` : "Unknown",
            status: 'Success',
            reportingWeek: uploadWeek,
            reportingMonth: uploadMonth
          };
          onAddAuditReport(newReport);
        } else {
          localStorage.setItem('dashboardKPIs', JSON.stringify(savedKpis));

          const activeMonth = uploadMonth;

          // Replace this month's per-wakala rows in Postgres (authoritative) and
          // in the offline mirror — same shape as the Weekly path.
          persistMonthlyServicing(activeMonth, parsedServicing, servicingColumns)
            .then((res) => {
              invalidateClassificationCache();
              console.log(
                `Persisted ${res.saved} servicing records for ${activeMonth} (cloud: ${res.cloud})`,
              );
              if (!res.cloud) {
                console.warn(`[monthly] ${activeMonth} kept offline only — cloud write failed`);
              }
            })
            .catch(err => {
              console.error("Critical monthly persistence failure:", err);
              alert(`FATAL DATABASE PERSISTENCE FAILURE: Failed to write servicing data rows for ${activeMonth}. No rows have been truncated, but database persistence failed. Error details: ${err.message || err}`);
            });

          // Archive this report in historical workbooks list (lightweight, referencing IndexedDB)
          try {
            const savedHistory = JSON.parse(localStorage.getItem('kpiWorkbookHistory') || '[]');
            const duplicateIdx = savedHistory.findIndex((h: any) => h.reportingMonth === activeMonth);
            const archivePayload: any = {
              reportingMonth: activeMonth,
              uploadDate: new Date().toLocaleDateString('en-US') + ", " + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              uploadedBy: lastUploadedBy,
              fileName: selectedFile?.name || "KPI_Workbook_Upload.xlsx",
              status: "Success",
              processingTimeMs: workbookStats?.processingTimeMs || 120,
              recordsImported: parsedServicing.length,
              kpis: parsedKpis
            };

            if (duplicateIdx !== -1) {
              savedHistory[duplicateIdx] = archivePayload;
            } else {
              savedHistory.unshift(archivePayload);
            }

            localStorage.setItem('kpiWorkbookHistory', JSON.stringify(savedHistory));
          } catch (e: any) {
            console.error("Error archiving to kpiWorkbookHistory:", e);
            alert(`Error updating historical archive registry: ${e.message || e}`);
          }

          const newReport: AuditReport = {
            id: `REP-${Math.floor(90000 + Math.random() * 9000)}`,
            fileName: selectedFile?.name || "KPI_Workbook_Upload.xlsx",
            type: "KPI Report",
            uploadedBy: lastUploadedBy,
            date: new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) + " " + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
            size: selectedFile?.size !== undefined ? `${(selectedFile.size / 1024).toFixed(1)} KB` : "Unknown",
            status: 'Success',
            reportingMonth: activeMonth
          };
          onAddAuditReport(newReport);
        }

        setSyncStats({
          processed: parsedServicing.length + parsedKpis.length,
          created: parsedKpis.length,
          updated: parsedServicing.length,
          skipped: 0
        });

        setImportState('completed');
        window.dispatchEvent(new Event('servicing-rows-updated'));
        window.dispatchEvent(new Event('weekly-kpi-updated'));
      }
    }, 1100);
  };

  const handleCancelSync = () => {
    setSelectedFile(null);
    setStagingRecords([]);
    setSelectedStagingIds(new Set());
    setImportState('selection');
    setReportType(null);
  };

  // Filter staging rows based on tab/filter and search query
  const filteredStagingRows = stagingRecords.filter(row => {
    const matchesFilter = reconciliationFilter === 'all' || row.classification === reconciliationFilter;
    const term = searchQuery.toLowerCase();
    const matchesSearch = row.masterAgentId.toLowerCase().includes(term) ||
                          row.name.toLowerCase().includes(term) ||
                          row.region.toLowerCase().includes(term);
    return matchesFilter && matchesSearch;
  });

  // Calculate counts for badges
  const totalCount = stagingRecords.length;
  const existingCount = stagingRecords.filter(r => r.classification === 'Existing').length;
  const newCount = stagingRecords.filter(r => r.classification === 'New').length;
  const updatedCount = stagingRecords.filter(r => r.classification === 'Updated').length;
  const duplicateCount = stagingRecords.filter(r => r.classification === 'Duplicate').length;
  const invalidCount = stagingRecords.filter(r => r.classification === 'Invalid').length;

  const handleKpiSort = (columnName: string) => {
    if (kpiSortColumn === columnName) {
      setKpiSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setKpiSortColumn(columnName);
      setKpiSortDirection('asc');
    }
    setKpiCurrentPage(1);
  };

  // Filter Sheet 2 Servicing Data based on search query and column-level filter
  const servicingFilterValues = useMemo(() => {
    if (!servicingFilterCol || servicingFilterCol === 'all' || !parsedServicing) return [];
    const vals = parsedServicing.map(row => String(row[servicingFilterCol] || '').trim()).filter(Boolean);
    return Array.from(new Set(vals)).sort();
  }, [servicingFilterCol, parsedServicing]);

  const filteredKpiRows = parsedServicing.filter(row => {
    // Column filter check
    if (servicingFilterCol !== 'all' && servicingFilterVal !== 'all') {
      const cellVal = String(row[servicingFilterCol] || '').trim();
      if (cellVal !== servicingFilterVal) return false;
    }

    if (!kpiSearchQuery.trim()) return true;
    const term = kpiSearchQuery.toLowerCase();
    // Check if any column contains the search term
    return Object.keys(row).some(key => {
      if (key.startsWith('_')) return false; // skip internal IDs
      return String(row[key] || '').toLowerCase().includes(term);
    });
  });

  // Sort filtered rows
  const sortedKpiRows = [...filteredKpiRows].sort((a, b) => {
    if (!kpiSortColumn) return 0;
    
    const valA = a[kpiSortColumn];
    const valB = b[kpiSortColumn];
    
    if (valA === undefined || valA === null) return 1;
    if (valB === undefined || valB === null) return -1;
    
    // Check if they are numbers
    const cleanNum = (str: any) => {
      if (typeof str === 'number') return str;
      const parsed = parseFloat(String(str).replace(/[^0-9.-]/g, ''));
      return isNaN(parsed) ? String(str).toLowerCase() : parsed;
    };
    
    const cleanA = cleanNum(valA);
    const cleanB = cleanNum(valB);
    
    if (typeof cleanA === 'number' && typeof cleanB === 'number') {
      return kpiSortDirection === 'asc' ? cleanA - cleanB : cleanB - cleanA;
    }
    
    const strA = String(valA).toLowerCase();
    const strB = String(valB).toLowerCase();
    
    if (strA < strB) return kpiSortDirection === 'asc' ? -1 : 1;
    if (strA > strB) return kpiSortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Paginate sorted rows
  const kpiTotalPages = Math.ceil(sortedKpiRows.length / kpiRowsPerPage);
  const startIdx = (kpiCurrentPage - 1) * kpiRowsPerPage;
  const endIdx = startIdx + kpiRowsPerPage;
  const pagedKpiRows = sortedKpiRows.slice(startIdx, endIdx);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8 max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8 font-sans dark:text-brand-text"
    >
      {/* PAGE HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-brand-gray-border/80">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-brand-primary-container text-brand-primary dark:text-white text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full">
              Sovereign Master Records Sync
            </span>
          </div>
          <h2 className="text-3xl font-black tracking-tight text-brand-text">Daily MGT Owner Synchronization</h2>
          <div className="flex items-center gap-4 mt-1.5">
            <p className="text-sm text-brand-text-variant max-w-2xl">
              Incorporate Daily MGT master files to auto-align registered Wakala Business Owners. Run validation, resolve changes, and authorize synchronization before database writing.
            </p>
          </div>
          <button
            id="clear-ledger-btn"
            onClick={async () => {
              if (window.confirm("Are you sure you want to clear all ingested transaction data? This cannot be undone and you will need to re-upload your MGT files to restore history.")) {
                await clearDailyServicingData();
                window.location.reload();
              }
            }}
            className="mt-3.5 inline-flex items-center gap-2 px-4 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/30 dark:text-rose-400 dark:hover:bg-rose-950/20 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
          >
            <Trash2 className="h-4 w-4 text-rose-500" />
            Clear Ingested Ledger
          </button>
        </div>
        
        {/* Metadata Widgets */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-brand-card p-4 rounded-2xl border border-brand-gray-border shadow-sm min-w-full lg:min-w-[480px]">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-brand-primary-container/40 text-brand-primary flex items-center justify-center">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Reporting Month</p>
              <p className="text-xs font-black text-brand-text">{currentReportingMonth}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2.5 border-t sm:border-t-0 sm:border-l border-brand-gray-border pt-2 sm:pt-0 sm:pl-3.5">
            <div className="h-9 w-9 rounded-xl bg-amber-50 text-brand-secondary flex items-center justify-center ring-4 ring-brand-accent/20">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Last Sync</p>
              <p className="text-xs font-black text-brand-text">{lastUploadDate}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 border-t sm:border-t-0 sm:border-l border-brand-gray-border pt-2 sm:pt-0 sm:pl-3.5">
            <div className="h-9 w-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <User className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Active User</p>
              <p className="text-xs font-black text-brand-text">{activeUserName}</p>
            </div>
          </div>
        </div>
      </div>



      <AnimatePresence mode="wait">
        {/* 1. SELECTION & UPLOAD STATE */}
        {importState === 'selection' && (
          <motion.div 
            key="upload-selection-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            {/* CHOOSE REPORT TYPE */}
            <div className="space-y-4 rounded-2xl border border-brand-gray-border bg-brand-card p-6 shadow-ambient">
              <div>
                <h3 className="text-lg font-extrabold text-brand-text">1. Choose Report Type</h3>
                <p className="text-xs text-brand-text-variant mt-0.5">Select a report or data sheet type from the dropdown below to proceed.</p>
              </div>

              <div className="max-w-xl space-y-4">
                <div>
                  <label htmlFor="report-type-select" className="block text-xs font-bold text-brand-text-variant uppercase tracking-wider mb-2">
                    Select Report Type
                  </label>
                  <select
                    id="report-type-select"
                    value={reportType || ''}
                    onChange={(e) => {
                      setReportType((e.target.value as any) || null);
                      setBaseWakalaSuccess(null);
                    }}
                    className="w-full rounded-xl border border-slate-300 bg-white text-slate-900 px-4 py-3 text-sm font-bold shadow-xs focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20 cursor-pointer transition-all"
                  >
                    <option value="" disabled className="bg-white text-slate-900 font-medium">-- Select a Report Type --</option>
                    {REPORT_TYPES.map((type) => (
                      <option key={type.id} value={type.id} className="bg-white text-slate-900 font-medium">
                        {type.title}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedReportConfig && (
                  <motion.div
                    key={selectedReportConfig.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-3.5 p-4 rounded-xl bg-brand-primary/5 border border-brand-primary/15 text-brand-text"
                  >
                    <div className="h-10 w-10 rounded-lg bg-brand-primary text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                      <selectedReportConfig.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-brand-text uppercase tracking-wider">
                        {selectedReportConfig.title}
                      </h4>
                      <p className="text-xs text-brand-text-variant mt-1 leading-relaxed">
                        {selectedReportConfig.description}
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>

            {reportType === 'till_sync' ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6"
              >
                <OwnerSyncDashboard 
                  onCancel={() => setReportType(null)} 
                  onAddAuditReport={onAddAuditReport} 
                  onSyncComplete={() => setReportType(null)} 
                />
              </motion.div>
            ) : (
              <>
                {/* FILE UPLOAD DRAG ZONE */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-extrabold text-brand-text">2. File Upload Area</h3>
                    <p className="text-xs text-brand-text-variant mt-0.5">
                      {reportType === 'kpi' 
                        ? 'Drag-and-drop or select an aggregate enterprise KPI Target workbook (.xlsx) to parse.' 
                        : reportType === 'weekly_kpi'
                          ? 'Drag-and-drop or select a Weekly KPI checkpoint workbook (.xlsx) to parse.'
                          : 'Drag-and-drop or select an operational MGT CSV file to parse.'}
                    </p>
                  </div>

                  {/* Reporting Period Selections */}
                  {(reportType === 'kpi' || reportType === 'weekly_kpi') && (
                    <div className="bg-brand-card border border-brand-gray-border rounded-2xl p-5 grid grid-cols-1 md:grid-cols-2 gap-5 mb-4 shadow-xs">
                      <div>
                        <label className="block text-xs font-bold text-brand-text-variant uppercase tracking-wider mb-2">
                          Reporting Month Target Association
                        </label>
                        <select
                          value={uploadMonth}
                          onChange={(e) => setUploadMonth(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white text-slate-900 px-4 py-2.5 text-xs font-bold focus:border-brand-primary focus:outline-none"
                        >
                          <option value="July 2026" className="bg-white text-slate-900">July 2026</option>
                          <option value="June 2026" className="bg-white text-slate-900">June 2026</option>
                          <option value="May 2026" className="bg-white text-slate-900">May 2026</option>
                          <option value="August 2026" className="bg-white text-slate-900">August 2026</option>
                        </select>
                        <p className="text-[10px] text-brand-text-variant mt-1.5 leading-relaxed">
                          This associates the KPI upload with the monthly target framework of the selected month.
                        </p>
                      </div>

                      {reportType === 'weekly_kpi' && (
                        <div>
                          <label className="block text-xs font-bold text-brand-text-variant uppercase tracking-wider mb-2">
                            Reporting Week Checkpoint
                          </label>
                          <select
                            value={uploadWeek}
                            onChange={(e) => setUploadWeek(e.target.value)}
                            className="w-full rounded-xl border border-slate-300 bg-white text-slate-900 px-4 py-2.5 text-xs font-bold focus:border-brand-primary focus:outline-none"
                          >
                            <option value="Week 1 (July 1 - July 7, 2026)" className="bg-white text-slate-900">Week 1 (July 1 - July 7, 2026)</option>
                            <option value="Week 2 (July 8 - July 14, 2026)" className="bg-white text-slate-900">Week 2 (July 8 - July 14, 2026)</option>
                            <option value="Week 3 (July 15 - July 21, 2026)" className="bg-white text-slate-900">Week 3 (July 15 - July 21, 2026)</option>
                            <option value="Week 4 (July 22 - July 28, 2026)" className="bg-white text-slate-900">Week 4 (July 22 - July 28, 2026)</option>
                          </select>
                          <p className="text-[10px] text-brand-text-variant mt-1.5 leading-relaxed">
                            Specify the exact weekly reporting checkpoint for incremental performance analysis.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
       
                  <div 
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    className={`relative rounded-2xl border-2 border-dashed p-10 flex flex-col items-center justify-center text-center transition-all ${
                      !reportType 
                        ? 'border-brand-gray-border bg-slate-50 opacity-60 cursor-not-allowed' 
                        : dragActive 
                          ? 'border-brand-primary bg-brand-primary/5 scale-[0.99]' 
                          : 'border-brand-gray-border bg-brand-card hover:border-brand-primary hover:bg-brand-primary/5 cursor-pointer'
                    }`}
                    onClick={reportType ? triggerBrowse : undefined}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileInput} 
                      accept=".csv, .xlsx, .xls, .xlx" 
                      className="hidden" 
                      disabled={!reportType}
                    />
       
                    <div className={`flex h-14 w-14 items-center justify-center rounded-full mb-4 ${
                      reportType ? 'bg-brand-primary-container/50 text-brand-primary' : 'bg-slate-200 text-slate-400'
                    }`}>
                      <UploadCloud className="h-7 w-7" />
                    </div>
       
                    {!reportType ? (
                      <>
                        <h4 className="text-sm font-bold text-slate-400 font-sans">Please Select Report Type First</h4>
                        <p className="text-xs text-slate-400 mt-1 font-sans">Select a report type from the dropdown above to unlock local file parsing.</p>
                      </>
                    ) : (
                      <>
                        <h4 className="text-base font-black text-brand-text font-sans">
                          {reportType === 'mgt' 
                            ? 'Drag and drop your Daily MGT report file here' 
                            : reportType === 'weekly_kpi'
                              ? 'Drag and drop your Weekly KPI Checkpoint report file here'
                              : reportType === 'sa_till_registry'
                                ? 'Drag and drop your SA Till Registry file here'
                                : reportType === 'base_wakala_list'
                                  ? 'Drag and drop your Base Wakala List file here'
                                  : reportType === 'priority_wakala'
                                    ? 'Drag and drop your Priority Wakala List file here'
                                    : 'Drag and drop your Monthly KPI report file here'}
                        </h4>
                        <p className="text-xs text-brand-text-variant mt-1.5 font-sans">
                          Supported formats: .CSV, .XLSX, .XLS, .XLX (Maximum file size: 50 MB)
                        </p>
                        <div className="flex gap-2.5 mt-4">
                          <button 
                            type="button"
                            className="rounded-xl bg-brand-primary hover:bg-brand-primary-light text-white px-5 py-2.5 text-xs font-bold shadow-ambient transition-all"
                          >
                            Browse System Files
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Uploading progress indicator */}
                  {isUploading && selectedFile && (
                    <div className="bg-brand-card p-5 rounded-2xl border border-brand-gray-border shadow-sm">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-10 w-10 rounded-xl bg-brand-primary-container/40 text-brand-primary flex items-center justify-center shrink-0">
                          <RotateCw className="h-5 w-5 animate-spin" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-brand-text truncate max-w-sm">{selectedFile.name}</p>
                          <p className="text-[10px] text-brand-text-variant font-mono mt-0.5">Uploading and parsing file text...</p>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-brand-primary rounded-full transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SA TILL REGISTRY STAGING PREVIEW CARD */}
                  {stagedSaTills && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-brand-card p-6 rounded-2xl border border-brand-primary/30 shadow-md space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-brand-gray-border pb-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                            <Building2 className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-base font-black text-brand-text">SA Till Registry Staging Preview</h3>
                            <p className="text-xs text-brand-text-variant">
                              Verify parsed Master SA Tills before committing to local database.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                            Total: {stagedSaTills.length}
                          </span>
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                            New: {stagedSaTills.filter(t => !t.isUpdate).length}
                          </span>
                          <span className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                            Updates: {stagedSaTills.filter(t => t.isUpdate).length}
                          </span>
                        </div>
                      </div>

                      {/* Table preview */}
                      <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200">
                        <table className="w-full text-left text-xs font-sans">
                          <thead className="bg-slate-50 text-slate-700 font-extrabold sticky top-0 border-b border-slate-200">
                            <tr>
                              <th className="px-4 py-2.5">Till MSISDN</th>
                              <th className="px-4 py-2.5">Owner / Account Name</th>
                              <th className="px-4 py-2.5">Ingestion Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {stagedSaTills.map((till, idx) => (
                              <tr key={idx} className="hover:bg-slate-50">
                                <td className="px-4 py-2 font-mono font-bold text-brand-text">{till.tillMsisdn}</td>
                                <td className="px-4 py-2 font-semibold text-slate-700">{till.ownerName || '—'}</td>
                                <td className="px-4 py-2">
                                  {till.isUpdate ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                                      Existing Update
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                      New Registration
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex justify-end gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => { setStagedSaTills(null); setSelectedFile(null); }}
                          className="rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 transition-all cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmSaTillCommit}
                          className="inline-flex items-center gap-2 rounded-xl bg-brand-primary hover:bg-brand-primary-light text-white px-5 py-2.5 text-xs font-bold shadow-md transition-all cursor-pointer"
                        >
                          <CheckCircle className="h-4 w-4" />
                          Confirm & Commit to SA Till Registry
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* BASE WAKALA LIST STAGING PREVIEW CARD */}
                  {stagedBaseWakalas && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-brand-card p-6 rounded-2xl border border-brand-primary/30 shadow-md space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-brand-gray-border pb-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                            <MapPin className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-base font-black text-brand-text">Base Wakala List Staging Preview</h3>
                            <p className="text-xs text-brand-text-variant">
                              Verify parsed Base Wakala records and owner reconciliation status before committing to master index.
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                            Total: {stagedBaseWakalas.length}
                          </span>
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                            New: {stagedBaseWakalas.filter(b => !b.isUpdate).length}
                          </span>
                          <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
                            Updates: {stagedBaseWakalas.filter(b => b.isUpdate).length}
                          </span>
                          <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
                            Matched Owners: {stagedBaseWakalas.filter(b => b.ownerStatus === 'Matched').length}
                          </span>
                          {stagedBaseWakalas.filter(b => b.ownerStatus === 'Unmatched').length > 0 && (
                            <button
                              type="button"
                              onClick={() => setShowUnresolvedReview(true)}
                              className="text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-full border border-amber-200 cursor-pointer"
                            >
                              Unmatched Owners: {stagedBaseWakalas.filter(b => b.ownerStatus === 'Unmatched').length} — Resolve
                            </button>
                          )}
                          <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                            Unassigned (#N/A): {stagedBaseWakalas.filter(b => b.ownerStatus === 'Unassigned').length}
                          </span>
                        </div>
                      </div>

                      {/* Table preview */}
                      <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200">
                        <table className="w-full text-left text-xs font-sans">
                          <thead className="bg-slate-50 text-slate-700 font-extrabold sticky top-0 border-b border-slate-200">
                            <tr>
                              <th className="px-4 py-2.5">MSISDN</th>
                              <th className="px-4 py-2.5">Code / Name</th>
                              <th className="px-4 py-2.5">Site / District</th>
                              <th className="px-4 py-2.5">Assigned Owner</th>
                              <th className="px-4 py-2.5">Owner Status</th>
                              <th className="px-4 py-2.5">Ingestion Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {stagedBaseWakalas.map((item, idx) => (
                              <tr key={idx} className="hover:bg-slate-50">
                                <td className="px-4 py-2 font-mono font-bold text-brand-text">{item.record.msisdn}</td>
                                <td className="px-4 py-2">
                                  <div className="font-bold text-slate-800">{item.record.fullName || '—'}</div>
                                  {item.record.code && <div className="text-[10px] text-slate-400 font-mono">Code: {item.record.code}</div>}
                                </td>
                                <td className="px-4 py-2 text-slate-600">
                                  <div>{item.record.district || item.record.siteWard || '—'}</div>
                                  {item.record.siteId && <div className="text-[10px] text-slate-400 font-mono">Site: {item.record.siteId}</div>}
                                </td>
                                <td className="px-4 py-2 font-semibold">
                                  {item.record.ownerName ? (
                                    <span className="text-slate-800">{item.record.ownerName}</span>
                                  ) : (
                                    <span className="text-slate-400 italic font-mono text-[11px]">Unassigned (#N/A)</span>
                                  )}
                                </td>
                                <td className="px-4 py-2">
                                  {item.ownerStatus === 'Matched' ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                      <Check className="h-3 w-3" /> Matched
                                    </span>
                                  ) : item.ownerStatus === 'Unmatched' ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                      <AlertTriangle className="h-3 w-3" /> Unmatched
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                                      Unassigned
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2">
                                  {item.isUpdate ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                                      Existing Update
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                      New Registration
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex justify-end gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => { setStagedBaseWakalas(null); setSelectedFile(null); }}
                          className="rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 transition-all cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmBaseWakalaCommit}
                          className="inline-flex items-center gap-2 rounded-xl bg-brand-primary hover:bg-brand-primary-light text-white px-5 py-2.5 text-xs font-bold shadow-md transition-all cursor-pointer"
                        >
                          <CheckCircle className="h-4 w-4" />
                          Confirm & Commit to Base Wakala Index
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* BASE WAKALA INDEX TRANSIENT UPLOAD CONFIRMATION BANNER */}
                  {reportType === 'base_wakala_list' && baseWakalaSuccess && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="bg-emerald-50/90 border border-emerald-200 rounded-2xl p-5 shadow-xs flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="h-10 w-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                          <CheckCircle className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-emerald-950">
                            Base Wakala Index Report Uploaded
                          </h4>
                          <p className="text-xs text-emerald-700 mt-0.5">
                            Successfully committed {baseWakalaSuccess.count} records to the master index ({baseWakalaSuccess.timestamp}).
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBaseWakalaSuccess(null)}
                        className="p-1.5 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100/60 rounded-lg transition-colors cursor-pointer"
                        title="Dismiss notification"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </motion.div>
                  )}

                  {/* PRIORITY WAKALA LIST STAGING PREVIEW CARD */}
                  {stagedPriorityWakalas && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-brand-card p-6 rounded-2xl border border-brand-primary/30 shadow-md space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-brand-gray-border pb-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                            <Flag className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-base font-black text-brand-text">Priority Wakala List Staging Preview</h3>
                            <p className="text-xs text-brand-text-variant">
                              Verify parsed Priority Wakala records before committing to month-scoped storage.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-bold text-brand-text-variant">Target Period:</label>
                            <input
                              type="month"
                              value={priorityWakalaPeriod}
                              onChange={(e) => setPriorityWakalaPeriod(e.target.value)}
                              className="text-xs font-mono font-bold rounded-xl border border-slate-300 bg-white px-3 py-1.5 focus:outline-none focus:border-brand-primary"
                            />
                          </div>
                          <span className="text-xs font-bold text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                            Total Entries: {stagedPriorityWakalas.length}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-brand-text-variant leading-relaxed">
                        This commit will <strong className="text-brand-text">REPLACE</strong> the existing Priority Wakala list for <strong className="text-brand-text font-mono">{priorityWakalaPeriod}</strong>
                        {priorityWakalas.filter(p => p.period === priorityWakalaPeriod).length > 0
                          ? ` (currently contains ${priorityWakalas.filter(p => p.period === priorityWakalaPeriod).length} entries)`
                          : ' (no existing records for this month)'}. Other historical periods will remain untouched.
                      </p>

                      {/* Table preview */}
                      <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200">
                        <table className="w-full text-left text-xs font-sans">
                          <thead className="bg-slate-50 text-slate-700 font-extrabold sticky top-0 border-b border-slate-200">
                            <tr>
                              <th className="px-4 py-2.5">Index</th>
                              <th className="px-4 py-2.5">Wakala Code</th>
                              <th className="px-4 py-2.5">Wakala MSISDN</th>
                              <th className="px-4 py-2.5">Resolved Owner</th>
                              <th className="px-4 py-2.5">Scope Period</th>
                              <th className="px-4 py-2.5">Import Date</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {stagedPriorityWakalas.map((p, idx) => (
                              <tr key={idx} className="hover:bg-slate-50">
                                <td className="px-4 py-2 font-mono text-slate-400">{idx + 1}</td>
                                <td className="px-4 py-2 font-mono text-slate-700 font-bold">{p.wakalaCode || '—'}</td>
                                <td className="px-4 py-2 font-mono font-bold text-brand-text">{p.msisdn}</td>
                                <td className="px-4 py-2 font-medium text-slate-800">{p.ownerName ? `${p.ownerName}${p.ownerId ? ` (${p.ownerId})` : ''}` : '—'}</td>
                                <td className="px-4 py-2 font-mono text-slate-600">{p.period}</td>
                                <td className="px-4 py-2 text-slate-500 font-mono text-[11px]">{p.importedAt}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex justify-end gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => { setStagedPriorityWakalas(null); setSelectedFile(null); }}
                          className="rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 transition-all cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmPriorityWakalaCommit}
                          className="inline-flex items-center gap-2 rounded-xl bg-brand-primary hover:bg-brand-primary-light text-white px-5 py-2.5 text-xs font-bold shadow-md transition-all cursor-pointer"
                        >
                          <CheckCircle className="h-4 w-4" />
                          Confirm & Replace {priorityWakalaPeriod} List
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* REGISTERED PRIORITY WAKALA LIST MANAGEMENT SECTION */}
                  {(reportType === 'priority_wakala' || priorityWakalas.length > 0) && (
                    <div className="bg-brand-card p-6 rounded-2xl border border-brand-gray-border shadow-xs">
                      <div className="flex items-center gap-3">
                        <Flag className="h-5 w-5 text-amber-600" />
                        <div>
                          <h3 className="text-sm font-black text-brand-text">Priority Wakala Registry Status</h3>
                          {priorityWakalaLastUpdated ? (
                            <p className="text-xs text-brand-text-variant flex items-center gap-1.5 mt-0.5">
                              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                              <span>Priority Wakala List last updated: <strong className="text-brand-text">{priorityWakalaLastUpdated}</strong> ({priorityWakalas.length} total entries across all periods)</span>
                            </p>
                          ) : (
                            <p className="text-xs text-brand-text-variant mt-0.5">
                              No Priority Wakala records uploaded yet. Select "Priority Wakala List" above to parse and register monthly priority lists.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </>
            )}
          </motion.div>
        )}

        {/* REGISTERED SA TILLS MANAGEMENT SECTION — standalone home, outside the upload flow */}
        <motion.div
          key="sa-till-registry-section"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-brand-card p-6 rounded-2xl border border-brand-gray-border shadow-xs space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-brand-gray-border pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-brand-primary" />
                <h3 className="text-base font-black text-brand-text">Registered SA Tills</h3>
                <span className="bg-brand-primary/10 text-brand-primary text-xs font-bold px-2.5 py-0.5 rounded-full">
                  {saTills.length} Accounts
                </span>
              </div>
              {saTillLastUpdated ? (
                <p className="text-xs text-brand-text-variant flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  <span>SA Till Registry last updated: <strong className="text-brand-text">{saTillLastUpdated}</strong></span>
                </p>
              ) : (
                <p className="text-xs text-brand-text-variant">
                  No SA Till Registry records uploaded yet. Upload a registry spreadsheet above to populate parent account mappings.
                </p>
              )}
            </div>

            {saTills.length > 0 && (
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={saTillSearchQuery}
                  onChange={(e) => setSaTillSearchQuery(e.target.value)}
                  placeholder="Search SA MSISDN or Owner..."
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-brand-primary"
                />
              </div>
            )}
          </div>

          {saTills.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs font-sans">
                <thead className="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Till MSISDN</th>
                    <th className="px-4 py-3">Owner / Organization</th>
                    <th className="px-4 py-3">Registered At</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {saTills
                    .filter(t => {
                      if (!saTillSearchQuery.trim()) return true;
                      const q = saTillSearchQuery.toLowerCase();
                      return t.tillMsisdn.includes(q) || (t.ownerName && t.ownerName.toLowerCase().includes(q));
                    })
                    .map((till) => (
                      <tr key={till.tillMsisdn} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5 font-mono font-bold text-slate-900">{till.tillMsisdn}</td>
                        <td className="px-4 py-2.5 font-semibold text-slate-700">{till.ownerName || 'SA Owner'}</td>
                        <td className="px-4 py-2.5 text-slate-500 font-mono text-[11px]">{till.registeredAt}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteSaTill(till.tillMsisdn)}
                            title="Remove SA Till Entry"
                            className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
              <Building2 className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-500">Registry is currently empty</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Select "SA Till Registry" from the dropdown above to upload your MSISDN sheet.</p>
            </div>
          )}
        </motion.div>

        {/* 2. RECONCILIATION PREVIEW SCREEN (THE GOLD STANDARD OF SPRINT 2) */}
        {importState === 'reconciliation' && (
          <motion.div
            key="reconciliation-preview-view"
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.99 }}
            className="space-y-6"
          >
            {/* Header section with back option */}
            <div className="flex items-center justify-between">
              <button 
                onClick={handleCancelSync}
                className="inline-flex items-center gap-1 text-xs font-extrabold text-brand-text-variant hover:text-brand-primary transition-colors cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
                Change Ingested File
              </button>
              
              <div className="text-xs text-brand-text-variant font-medium">
                Active Source: <strong className="text-brand-text font-mono font-bold">{selectedFile?.name}</strong> ({(selectedFile ? selectedFile.size / 1024 : 0).toFixed(1)} KB)
              </div>
            </div>

            {reportType === 'mgt' ? (
              <DailyMgtMappingEngine 
                transactions={parsedMgtTransactions} 
                onCancel={handleCancelSync} 
                onImportCompleted={(importStats, newReport) => {
                  setSyncStats(importStats);
                  onAddAuditReport(newReport);
                  setImportState('completed');
                }}
              />
            ) : (
              <div className="space-y-6 relative">
                {isKpiLoading && (
                  <div className="absolute inset-0 bg-white/75 backdrop-blur-sm flex flex-col items-center justify-center z-50 rounded-2xl min-h-[400px]">
                    <div className="flex flex-col items-center gap-4">
                      <RefreshCw className="h-10 w-10 text-brand-primary animate-spin" />
                      <p className="text-sm font-extrabold text-brand-text">Loading Historical Servicing Rows from IndexedDB...</p>
                    </div>
                  </div>
                )}
                {/* 1. EXECUTIVE ANALYSIS CONTROLS PANEL */}
                <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="p-3 bg-brand-primary-container/10 text-brand-primary rounded-xl">
                      <Layers className="h-5 w-5" />
                    </span>
                    <div>
                      <h4 className="font-extrabold text-brand-text text-base leading-snug">Executive KPI Analysis Engine</h4>
                      <p className="text-xs text-brand-text-variant font-medium">Evaluate ingested metrics and compare performance trends.</p>
                    </div>
                  </div>

                  {/* Mode Selector Buttons */}
                  <div className="flex bg-slate-100 rounded-xl p-1 gap-1 w-full md:w-auto self-stretch md:self-auto">
                    <button
                      onClick={() => setViewMode('active_analysis')}
                      className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        viewMode === 'active_analysis'
                          ? 'bg-white text-brand-primary shadow-sm'
                          : 'text-brand-text-variant hover:text-brand-text'
                      }`}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Active Analysis
                    </button>
                    <button
                      onClick={() => setViewMode('history_archive')}
                      className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        viewMode === 'history_archive'
                          ? 'bg-white text-brand-primary shadow-sm'
                          : 'text-brand-text-variant hover:text-brand-text'
                      }`}
                    >
                      <History className="h-3.5 w-3.5" />
                      History Archive
                    </button>
                    <button
                      onClick={() => setViewMode('comparison_center')}
                      className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        viewMode === 'comparison_center'
                          ? 'bg-white text-brand-primary shadow-sm'
                          : 'text-brand-text-variant hover:text-brand-text'
                      }`}
                    >
                      <Diff className="h-3.5 w-3.5" />
                      Comparison Studio
                    </button>
                  </div>
                </div>

                {/* 2. MODE ROUTING RENDER BLOCK */}
                {viewMode === 'active_analysis' && (
                  <div className="space-y-6">

                {/* TABS SELECTOR */}
                <div className="flex flex-wrap gap-2 border-b border-brand-gray-border">
                  <button
                    onClick={() => setActiveKpiTab('executive')}
                    className={`pb-3 px-4 font-sans text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                      activeKpiTab === 'executive'
                        ? 'border-brand-primary text-brand-primary'
                        : 'border-transparent text-brand-text-variant hover:text-brand-text'
                    }`}
                  >
                    <Target className="h-4 w-4" />
                    Executive KPI Summary ({parsedKpis.length})
                  </button>
                  <button
                    onClick={() => setActiveKpiTab('servicing')}
                    className={`pb-3 px-4 font-sans text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                      activeKpiTab === 'servicing'
                        ? 'border-brand-primary text-brand-primary'
                        : 'border-transparent text-brand-text-variant hover:text-brand-text'
                    }`}
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    Servicing Data ({parsedServicing.length})
                  </button>
                  <button
                    onClick={() => setActiveKpiTab('insights')}
                    className={`pb-3 px-4 font-sans text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                      activeKpiTab === 'insights'
                        ? 'border-brand-primary text-brand-primary'
                        : 'border-transparent text-brand-text-variant hover:text-brand-text'
                    }`}
                  >
                    <Sparkles className="h-4 w-4" />
                    Business Insights
                  </button>
                  <button
                    onClick={() => setActiveKpiTab('charts')}
                    className={`pb-3 px-4 font-sans text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                      activeKpiTab === 'charts'
                        ? 'border-brand-primary text-brand-primary'
                        : 'border-transparent text-brand-text-variant hover:text-brand-text'
                    }`}
                  >
                    <BarChart3 className="h-4 w-4" />
                    Interactive Charts
                  </button>
                  <button
                    onClick={() => setActiveKpiTab('validation')}
                    className={`pb-3 px-4 font-sans text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                      activeKpiTab === 'validation'
                        ? 'border-brand-primary text-brand-primary'
                        : 'border-transparent text-brand-text-variant hover:text-brand-text'
                    }`}
                  >
                    <AlertTriangle className={`h-4 w-4 ${kpiValidation.errors.length > 0 ? 'text-rose-500' : 'text-emerald-500'}`} />
                    Validation Results ({kpiValidation.errors.length})
                  </button>
                  <button
                    onClick={() => setActiveKpiTab('import_summary')}
                    className={`pb-3 px-4 font-sans text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                      activeKpiTab === 'import_summary'
                        ? 'border-brand-primary text-brand-primary'
                        : 'border-transparent text-brand-text-variant hover:text-brand-text'
                    }`}
                  >
                    <Info className="h-4 w-4" />
                    Import Summary
                  </button>
                </div>

                {/* TAB CONTENT: EXECUTIVE KPI SUMMARY */}
                {activeKpiTab === 'executive' && (
                  <KPIExecutiveSummary parsedKpis={parsedKpis} />
                )}

                {/* TAB CONTENT: BUSINESS INSIGHTS */}
                {activeKpiTab === 'insights' && (
                  <KPIBusinessInsights parsedKpis={parsedKpis} />
                )}

                {/* TAB CONTENT: INTERACTIVE CHARTS */}
                {activeKpiTab === 'charts' && (
                  <KPIInteractiveCharts 
                    parsedKpis={parsedKpis} 
                    parsedServicing={parsedServicing} 
                  />
                )}

                {/* TAB CONTENT: SERVICING DATA PREVIEW */}
                {activeKpiTab === 'servicing' && (
                  <KPIServicingDashboard 
                    parsedServicing={parsedServicing} 
                    servicingColumns={servicingColumns} 
                  />
                )}

                {/* TAB CONTENT: VALIDATION RESULTS */}
                {activeKpiTab === 'validation' && (
                  <div className="space-y-6">
                    <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-6 shadow-sm space-y-6">
                      <div className="flex items-center justify-between pb-3 border-b border-brand-gray-border">
                        <h4 className="font-extrabold text-brand-text text-base">Ingestion Validation Ledger Checks</h4>
                        {kpiValidation.errors.length > 0 ? (
                          <span className="bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-extrabold uppercase px-3 py-1 rounded-full flex items-center gap-1">
                            <AlertCircle className="h-3.5 w-3.5" />
                            {kpiValidation.errors.length} Failures Found
                          </span>
                        ) : (
                          <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-extrabold uppercase px-3 py-1 rounded-full flex items-center gap-1">
                            <Check className="h-3.5 w-3.5" />
                            All Verification Checks Passed
                          </span>
                        )}
                      </div>

                      {/* CHECKLIST ITEMS */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* 1. Workbook Validity */}
                        <div className="flex items-center justify-between p-3.5 rounded-xl border border-brand-gray-border bg-slate-50/50">
                          <div className="flex items-center gap-3">
                            {kpiValidation.isValidExcel ? (
                              <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                                <Check className="h-4.5 w-4.5" />
                              </div>
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                                <X className="h-4.5 w-4.5" />
                              </div>
                            )}
                            <div>
                              <p className="text-xs font-bold text-brand-text">Valid Workbook Signature</p>
                              <p className="text-[10px] text-brand-text-variant">Standard Excel File Verification</p>
                            </div>
                          </div>
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${kpiValidation.isValidExcel ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                            {kpiValidation.isValidExcel ? 'Passed' : 'Failed'}
                          </span>
                        </div>

                        {/* 2. Sheet 1 Existence */}
                        <div className="flex items-center justify-between p-3.5 rounded-xl border border-brand-gray-border bg-slate-50/50">
                          <div className="flex items-center gap-3">
                            {kpiValidation.sheet1Exists ? (
                              <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                                <Check className="h-4.5 w-4.5" />
                              </div>
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                                <X className="h-4.5 w-4.5" />
                              </div>
                            )}
                            <div>
                              <p className="text-xs font-bold text-brand-text">Executive KPI Summary Worksheet</p>
                              <p className="text-[10px] text-brand-text-variant">Worksheet 1 Existence Check</p>
                            </div>
                          </div>
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${kpiValidation.sheet1Exists ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                            {kpiValidation.sheet1Exists ? 'Passed' : 'Failed'}
                          </span>
                        </div>

                        {/* 3. Sheet 2 Existence */}
                        <div className="flex items-center justify-between p-3.5 rounded-xl border border-brand-gray-border bg-slate-50/50">
                          <div className="flex items-center gap-3">
                            {kpiValidation.sheet2Exists ? (
                              <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                                <Check className="h-4.5 w-4.5" />
                              </div>
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                                <X className="h-4.5 w-4.5" />
                              </div>
                            )}
                            <div>
                              <p className="text-xs font-bold text-brand-text">Servicing Data Worksheet</p>
                              <p className="text-[10px] text-brand-text-variant">Worksheet 2 Existence Check</p>
                            </div>
                          </div>
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${kpiValidation.sheet2Exists ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                            {kpiValidation.sheet2Exists ? 'Passed' : 'Failed'}
                          </span>
                        </div>

                        {/* 4. Sheet 1 Column validation */}
                        <div className="flex items-center justify-between p-3.5 rounded-xl border border-brand-gray-border bg-slate-50/50">
                          <div className="flex items-center gap-3">
                            {kpiValidation.sheet1ColumnsValid ? (
                              <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                                <Check className="h-4.5 w-4.5" />
                              </div>
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                                <X className="h-4.5 w-4.5" />
                              </div>
                            )}
                            <div>
                              <p className="text-xs font-bold text-brand-text">KPI Columns Structured</p>
                              <p className="text-[10px] text-brand-text-variant">Target Schema Columns Validation</p>
                            </div>
                          </div>
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${kpiValidation.sheet1ColumnsValid ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                            {kpiValidation.sheet1ColumnsValid ? 'Passed' : 'Failed'}
                          </span>
                        </div>

                        {/* 5. Sheet 2 Header validation */}
                        <div className="flex items-center justify-between p-3.5 rounded-xl border border-brand-gray-border bg-slate-50/50 md:col-span-2">
                          <div className="flex items-center gap-3">
                            {kpiValidation.sheet2HeaderValid ? (
                              <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                                <Check className="h-4.5 w-4.5" />
                              </div>
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                                <X className="h-4.5 w-4.5" />
                              </div>
                            )}
                            <div>
                              <p className="text-xs font-bold text-brand-text">Dynamic Servicing Headers Parsed</p>
                              <p className="text-[10px] text-brand-text-variant">Header row and row items schema verification</p>
                            </div>
                          </div>
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${kpiValidation.sheet2HeaderValid ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                            {kpiValidation.sheet2HeaderValid ? 'Passed' : 'Failed'}
                          </span>
                        </div>
                      </div>

                      {/* EXPLICIT ERROR LISTINGS OR GRAND SUCCESS PANEL */}
                      {kpiValidation.errors.length > 0 ? (
                        <div className="bg-red-50/50 border border-red-200 rounded-xl p-5 space-y-3">
                          <div className="text-xs font-extrabold text-rose-800 uppercase tracking-wider flex items-center gap-1.5">
                            <AlertCircle className="h-4.5 w-4.5 text-rose-600" />
                            Validation Failures Details ({kpiValidation.errors.length})
                          </div>
                          <ul className="list-disc pl-5 text-xs text-rose-900/80 space-y-2 font-medium">
                            {kpiValidation.errors.map((err, index) => (
                              <li key={index}>{err}</li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <div className="bg-emerald-50/20 border border-emerald-200 rounded-xl p-6 text-center space-y-2">
                          <ShieldCheck className="h-10 w-10 text-emerald-600 mx-auto" />
                          <h5 className="font-bold text-emerald-800 text-sm">Sovereign Compliance Checks Complete</h5>
                          <p className="text-xs text-emerald-700/80 max-w-md mx-auto">
                            The metrics, worksheets, and relational structures have been thoroughly analyzed and are 100% compliant with Dodoma Ledger Specifications.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB CONTENT: IMPORT SUMMARY (WORKBOOK METADATA SUMMARY) */}
                {activeKpiTab === 'import_summary' && (
                  <div className="space-y-6">
                    <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-6 shadow-sm space-y-6">
                      <div className="flex items-center justify-between pb-3 border-b border-brand-gray-border">
                        <h4 className="font-extrabold text-brand-text text-base">Excel Workbook Ingestion Metadata</h4>
                        <span className="bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full font-mono">
                          Parsed in {workbookStats?.processingTimeMs || 120} ms
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        <div className="p-4 rounded-xl border border-brand-gray-border/80 bg-slate-50/30 space-y-1">
                          <span className="text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Workbook File Name</span>
                          <p className="text-xs font-black text-brand-text font-mono max-w-full truncate">{workbookStats?.fileName || "KPI_Workbook_Upload.xlsx"}</p>
                        </div>

                        <div className="p-4 rounded-xl border border-brand-gray-border/80 bg-slate-50/30 space-y-1">
                          <span className="text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Number of Worksheets</span>
                          <p className="text-sm font-black text-brand-text">{workbookStats?.numSheets || 0} sheets</p>
                        </div>

                        <div className="p-4 rounded-xl border border-brand-gray-border/80 bg-slate-50/30 space-y-1">
                          <span className="text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Detected Sheet Names</span>
                          <p className="text-xs font-black text-brand-primary truncate">{workbookStats?.sheetNames.join(', ') || 'N/A'}</p>
                        </div>

                        {/* Worksheet 1 Details */}
                        <div className="p-4 rounded-xl border border-brand-gray-border/80 bg-slate-50/30 space-y-2">
                          <div className="flex items-center gap-1 text-[10px] font-bold text-brand-text-variant uppercase tracking-wider border-b border-brand-gray-border/40 pb-1">
                            <Target className="h-3.5 w-3.5 text-brand-primary" />
                            Worksheet 1: KPI Summary
                          </div>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-brand-text-variant">Rows in Sheet:</span>
                              <strong className="text-brand-text">{workbookStats?.sheet1Rows || 0}</strong>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-brand-text-variant">Columns Detected:</span>
                              <strong className="text-brand-text">{workbookStats?.sheet1Cols || 0}</strong>
                            </div>
                          </div>
                        </div>

                        {/* Worksheet 2 Details */}
                        <div className="p-4 rounded-xl border border-brand-gray-border/80 bg-slate-50/30 space-y-2">
                          <div className="flex items-center gap-1 text-[10px] font-bold text-brand-text-variant uppercase tracking-wider border-b border-brand-gray-border/40 pb-1">
                            <FileSpreadsheet className="h-3.5 w-3.5 text-brand-secondary" />
                            Worksheet 2: Servicing Data
                          </div>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-brand-text-variant">Rows in Sheet:</span>
                              <strong className="text-brand-text">{workbookStats?.sheet2Rows || 0}</strong>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-brand-text-variant">Columns Detected:</span>
                              <strong className="text-brand-text">{workbookStats?.sheet2Cols || 0}</strong>
                            </div>
                          </div>
                        </div>

                        {/* Extracted Entities */}
                        <div className="p-4 rounded-xl border border-brand-gray-border/80 bg-slate-50/30 space-y-2">
                          <div className="flex items-center gap-1 text-[10px] font-bold text-brand-text-variant uppercase tracking-wider border-b border-brand-gray-border/40 pb-1">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                            Parsed Ingestion Payload
                          </div>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-brand-text-variant">KPI Target Entries:</span>
                              <strong className="text-brand-primary">{parsedKpis.length} goals</strong>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-brand-text-variant">Servicing Records:</span>
                              <strong className="text-brand-secondary">{parsedServicing.length} rows</strong>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ACTION TRIGGER BAR FOR VERIFICATION & SYNCHRONIZATION */}
                <div className="flex items-center justify-between bg-brand-gray-hover/10 p-5 rounded-2xl border border-brand-gray-border gap-4 flex-wrap mt-6">
                  <div>
                    {kpiValidation.errors.length > 0 ? (
                      <div className="flex items-center gap-2 text-rose-600 text-xs font-semibold">
                        <AlertTriangle className="h-4.5 w-4.5 shrink-0 animate-bounce" />
                        <span>Database ingestion disabled. Please resolve validation errors to proceed.</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-emerald-600 text-xs font-semibold">
                        <ShieldCheck className="h-4.5 w-4.5 shrink-0 text-emerald-500" />
                        <span>Workbook verification passed! Ready to update the master executive dashboard.</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-end gap-3.5">
                    <button
                      onClick={handleCancelSync}
                      className="rounded-xl border border-brand-gray-border bg-white px-5 py-3 text-xs font-bold text-brand-text hover:bg-brand-gray-hover transition-colors cursor-pointer"
                    >
                      Cancel Import
                    </button>
                    <button
                      onClick={() => setShowConfirmDialog(true)}
                      disabled={kpiValidation.errors.length > 0}
                      className="rounded-xl bg-brand-primary hover:bg-brand-primary-light text-white px-6 py-3 text-xs font-black uppercase tracking-wider shadow-md transition-all cursor-pointer inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <CheckCircle className="h-4.5 w-4.5" />
                      Confirm & Ingest Targets
                    </button>
                  </div>
                </div>
              </div>
            )}

                {/* HISTORY ARCHIVE VIEW */}
                {viewMode === 'history_archive' && (
                  <KPIHistoryArchive 
                    onLoadActiveReport={handleLoadActiveReport}
                    onSelectForCompare={(month) => {
                      setCompareMonthA(month);
                      setViewMode('comparison_center');
                    }}
                  />
                )}

                {/* COMPARISON CENTER VIEW */}
                {viewMode === 'comparison_center' && (
                  <KPIComparisonStudio 
                    initialMonthA={compareMonthA} 
                  />
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* 3. IMPORTING ANIMATED LOADING STEPPER */}
        {importState === 'importing' && (
          <motion.div 
            key="importing-stepper-view"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="max-w-3xl mx-auto bg-brand-card rounded-2xl border border-brand-gray-border p-8 shadow-ambient-hover space-y-8"
          >
            <div className="text-center space-y-2">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary animate-pulse">
                <RotateCw className="h-6 w-6 animate-spin" />
              </div>
              <h3 className="text-xl font-black text-brand-text">Dodoma Database Ingestion Writing Sync</h3>
              <p className="text-xs text-brand-text-variant max-w-md mx-auto">
                Applying authorized synchronization actions directly to the master tables. Writing immutable state changes in compliance with 3NF.
              </p>
            </div>

            {/* Sync Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono font-bold text-brand-primary">
                <span>Database Sync Progress</span>
                <span>{importProgress}%</span>
              </div>
              <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-brand-primary rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
            </div>

            {/* Progress steps */}
            <div className="space-y-4">
              {(reportType === 'kpi' 
                ? [
                    { title: "Verifying Ingested Excel Signatures", desc: "Verifying checksums and schema headers for KPI Summary & Servicing Data." },
                    { title: "Parsing Sheet 1 Monthly KPI Targets", desc: "Extracting KPI metric parameters and performance goals exactly as declared." },
                    { title: "Ingesting Sheet 2 Servicing Transaction Rows", desc: "Auto-detecting and mapping servicing records dynamically." },
                    { title: "Writing KPI Records to Core Dodoma Ledger", desc: "Updating master executive dashboard state and historical files." },
                    { title: "Updating Global Enterprise Dashboard Metrics", desc: "Updating live performance targets, gauges, and historical KPIs." }
                  ]
                : [
                    { title: "Matching and Resolving Staging Rows", desc: "Evaluating Admin decisions and checking matching constraint indexes." },
                    { title: "Generating System Audit Trail Deltas", desc: "Writing immutable state delta snapshots in compliance with 3NF." },
                    { title: "Writing New Owners to Database", desc: "Registering new master terminal owners into Dodoma ledger." },
                    { title: "Updating Existing Owner Master Profiles", desc: "Committing spelling, phone, and zone updates to owners tables." },
                    { title: "Archiving Daily MGT Upload History", desc: "Ingesting raw report checksum hash to prevent duplication." }
                  ]
              ).map((step, idx) => {
                const isCompleted = idx < activeStep;
                const isCurrent = idx === activeStep;
                
                return (
                  <div 
                    key={idx}
                    className={`flex gap-4 p-3.5 rounded-xl transition-all border ${
                      isCompleted 
                        ? 'bg-emerald-50/10 border-emerald-100/50' 
                        : isCurrent 
                          ? 'bg-brand-primary/5 border-brand-primary/30 scale-[1.01]' 
                          : 'bg-transparent border-transparent opacity-50'
                    }`}
                  >
                    <div className="shrink-0">
                      {isCompleted ? (
                        <div className="h-6 w-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm">
                          <Check className="h-3.5 w-3.5" />
                        </div>
                      ) : isCurrent ? (
                        <div className="h-6 w-6 rounded-full bg-brand-primary text-white flex items-center justify-center shadow-sm animate-spin">
                          <RotateCw className="h-3.5 w-3.5" />
                        </div>
                      ) : (
                        <div className="h-6 w-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-xs font-mono">
                          {idx + 1}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-black ${isCurrent ? 'text-brand-primary' : isCompleted ? 'text-emerald-700' : 'text-brand-text'}`}>
                        {step.title}
                      </p>
                      <p className="text-[11px] text-brand-text-variant mt-0.5 truncate">{step.desc}</p>
                    </div>

                    {isCompleted && (
                      <span className="text-[10px] font-extrabold text-emerald-600 font-mono self-center uppercase">
                        Committed
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* 4. COMPLETED SUCCESS RESULTS STATE */}
        {importState === 'completed' && (
          <motion.div 
            key="success-results-view"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-3xl mx-auto bg-brand-card rounded-2xl border border-brand-gray-border p-8 shadow-ambient-hover space-y-8"
          >
            {/* Success Header */}
            <div className="text-center space-y-3.5">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
                <Check className="h-9 w-9" />
              </div>
              <div className="space-y-1">
                <h3 className="text-2xl font-black text-brand-text">Synchronize Completed Successfully</h3>
                <p className="text-xs text-brand-text-variant">
                  Master database write-back transaction committed successfully and system audit history written.
                </p>
              </div>
            </div>

            {/* Bento Statistics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-y border-brand-gray-border/80 py-6">
              <div className="space-y-3.5 pl-2">
                <h4 className="text-xs font-black uppercase text-brand-primary tracking-wider font-mono">Synchronization Breakdown</h4>
                
                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between border-b border-brand-gray-border/50 pb-2">
                    <span className="text-brand-text-variant">Report Processed:</span>
                    <strong className="text-brand-text font-mono text-[11px]">{selectedFile?.name}</strong>
                  </div>
                  <div className="flex justify-between border-b border-brand-gray-border/50 pb-2">
                    <span className="text-brand-text-variant">Extracted records:</span>
                    <strong className="text-brand-text font-mono">{syncStats.processed} records</strong>
                  </div>
                  <div className="flex justify-between border-b border-brand-gray-border/50 pb-2">
                    <span className="text-brand-text-variant">New Owners Created:</span>
                    <strong className="text-indigo-600 font-black">+{syncStats.created} registered</strong>
                  </div>
                  <div className="flex justify-between border-b border-brand-gray-border/50 pb-2">
                    <span className="text-brand-text-variant">Existing Profiles Updated:</span>
                    <strong className="text-amber-600 font-black">+{syncStats.updated} profiles</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-brand-text-variant">Skipped/Rejected records:</span>
                    <strong className="text-slate-500 font-mono">{syncStats.skipped} skipped</strong>
                  </div>
                </div>
              </div>

              <div className="space-y-3.5 pl-2 border-t sm:border-t-0 sm:border-l border-brand-gray-border/80 pt-4 sm:pt-0 sm:pl-6">
                <h4 className="text-xs font-black uppercase text-brand-primary tracking-wider font-mono">Relational Ledger Auditing Actions</h4>
                
                <div className="space-y-3.5 text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                      <Check className="h-3 w-3" />
                    </div>
                    <span className="text-brand-text-variant">Owner master code unique constraint indexes checked</span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                      <Check className="h-3 w-3" />
                    </div>
                    <span className="text-brand-text-variant">Side-by-side attributes snapshots logged (JSONB Format)</span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                      <Check className="h-3 w-3" />
                    </div>
                    <span className="text-brand-text-variant">System Audit trails generated and persisted in local archive</span>
                  </div>
                </div>
              </div>
            </div>

            {/* TRANSACTION CLASSIFICATION ENGINE SUMMARY */}
            {(() => {
              const summary = lastClassificationSummary || (() => {
                try {
                  const saved = localStorage.getItem('lastClassificationSummary');
                  return saved ? JSON.parse(saved) : null;
                } catch {
                  return null;
                }
              })();

              if (!summary) return null;

              return (
                <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black uppercase text-brand-primary tracking-wider font-mono flex items-center gap-1.5">
                        <Layers className="h-4 w-4 text-brand-primary" />
                        Transaction Classification Summary
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Pre-aggregation pass: Dest_MSISDN lookup against SA Till Registry & Base Wakala Index
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* SA_INTERNAL */}
                    <div className="bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-900/40 rounded-xl p-3.5 space-y-1.5 shadow-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-md border border-rose-100 dark:border-rose-900/50">
                          SA-Internal (Excluded)
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300">{(summary.SA_INTERNAL?.count || 0).toLocaleString()} rows</span>
                      </div>
                      <div>
                        <div className="text-sm font-black text-slate-900 dark:text-white font-mono">
                          TZS {(summary.SA_INTERNAL?.volume || 0).toLocaleString()}
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">Parent transfers excluded</p>
                      </div>
                    </div>

                    {/* BASE */}
                    <div className="bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-900/40 rounded-xl p-3.5 space-y-1.5 shadow-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-100 dark:border-emerald-900/50">
                          Base Wakala
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300">{(summary.BASE?.count || 0).toLocaleString()} rows</span>
                      </div>
                      <div>
                        <div className="text-sm font-black text-slate-900 dark:text-white font-mono">
                          TZS {(summary.BASE?.volume || 0).toLocaleString()}
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">Registered owner match</p>
                      </div>
                    </div>

                    {/* IOP */}
                    <div className="bg-white dark:bg-slate-800 border border-sky-200 dark:border-sky-900/40 rounded-xl p-3.5 space-y-1.5 shadow-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 px-2 py-0.5 rounded-md border border-sky-100 dark:border-sky-900/50">
                          IOP (Independent)
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300">{(summary.IOP?.count || 0).toLocaleString()} rows</span>
                      </div>
                      <div>
                        <div className="text-sm font-black text-slate-900 dark:text-white font-mono">
                          TZS {(summary.IOP?.volume || 0).toLocaleString()}
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">Servicing till attribution</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Action buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button 
                onClick={() => onNavigate(ViewType.REPORT_HISTORY)}
                className="w-full bg-white hover:bg-brand-gray-hover border border-brand-gray-border text-brand-text font-bold text-xs py-3 rounded-xl cursor-pointer transition-colors text-center"
              >
                View Ingested History
              </button>

              <button 
                onClick={() => {
                  // Navigate to owners view hash
                  window.location.hash = '#/admin/owners';
                }}
                className="w-full bg-white hover:bg-brand-gray-hover border border-brand-gray-border text-brand-text font-bold text-xs py-3 rounded-xl cursor-pointer transition-colors text-center"
              >
                Go to Owners Management
              </button>

              <button 
                onClick={() => {
                  setImportState('selection');
                  setReportType(null);
                  setSelectedFile(null);
                  setUploadProgress(0);
                  setStagingRecords([]);
                  setSelectedStagingIds(new Set());
                }}
                className="w-full bg-brand-accent hover:bg-brand-accent-light text-brand-primary font-black text-xs uppercase tracking-wider py-3 rounded-xl shadow-md cursor-pointer transition-all"
              >
                Sync Another MGT Sheet
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CONFIRMATION DIALOG FOR KPI INGESTION */}
      <AnimatePresence>
        {showConfirmDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfirmDialog(false)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-xs"
            />
            <motion.div 
              initial={{ scale: 0.95, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 20, opacity: 0 }}
              className="relative w-full max-w-md rounded-2xl border border-brand-gray-border bg-brand-card p-6 shadow-ambient-hover z-10 font-sans"
            >
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-full bg-blue-50 text-brand-primary flex items-center justify-center shrink-0">
                  <Sparkles className="h-5.5 w-5.5" />
                </div>
                <div className="space-y-1.5 flex-1">
                  <h3 className="text-sm font-black text-brand-text">Confirm Monthly KPI Ingestion?</h3>
                  <p className="text-xs text-brand-text-variant leading-relaxed">
                    You are about to authorize the ingestion of <strong className="text-brand-text">{parsedKpis.length} core KPI Targets</strong> and <strong className="text-brand-text">{parsedServicing.length} Servicing rows</strong> into the sovereign Dodoma ledger.
                  </p>
                  <p className="text-xs text-brand-text-variant leading-relaxed">
                    This action will update the master executive performance gauges and record an auditing delta ledger trace under your active credentials.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3 border-t border-brand-gray-border pt-4">
                <button
                  onClick={() => setShowConfirmDialog(false)}
                  className="rounded-xl border border-brand-gray-border bg-white text-brand-text hover:bg-brand-gray-hover px-4 py-2.5 text-xs font-bold cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmKpiSync}
                  className="rounded-xl bg-brand-primary hover:bg-brand-primary-light px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white cursor-pointer shadow-md transition-all inline-flex items-center gap-1.5"
                >
                  <Check className="h-4 w-4" />
                  Ingest Targets Now
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {showUnresolvedReview && stagedBaseWakalas && (
        <UnresolvedNamesReview
          unresolvedNames={
            Array.from(
              (() => {
                const map = new Map<string, number[]>();
                if (stagedBaseWakalas) {
                  stagedBaseWakalas.forEach((item, idx) => {
                    if (item.ownerStatus === 'Unmatched' && item.record.ownerName) {
                      const arr = map.get(item.record.ownerName) || [];
                      arr.push(idx);
                      map.set(item.record.ownerName, arr);
                    }
                  });
                }
                return map;
              })()
            ).map(([rawName, rowIndices]) => ({ rawName, rowIndices }))
          }
          owners={getMasterOwners()}
          onResolve={(rawName, ownerId) => {
            const owner = getMasterOwners().find(o => o.id === ownerId);
            if (!owner) return;
            if (stagedBaseWakalas) {
              setStagedBaseWakalas(prev =>
                prev
                  ? prev.map(item =>
                      item.record.ownerName === rawName
                        ? { ...item, ownerStatus: 'Matched' as const, matchedOwnerName: owner.name }
                        : item
                    )
                  : prev
              );
            }
          }}
          onCreateNewOwner={(rawName) => {
            const newOwnerId = `owner-${Date.now()}`;
            const saved = localStorage.getItem('ownersList');
            const owners = saved ? JSON.parse(saved) : [];
            const newOwner = {
              id: newOwnerId,
              name: rawName,
              masterAgentId: newOwnerId,
              region: 'Unassigned',
              memberSince: new Date().toISOString(),
              avatar: '',
              wakalas: 0,
              portfolioSize: '0',
              portfolioGrowth: '0%',
              performance: 0,
              status: 'Pending' as const,
              nameAliases: [rawName],
            };
            localStorage.setItem('ownersList', JSON.stringify([...owners, newOwner]));
            if (stagedBaseWakalas) {
              setStagedBaseWakalas(prev =>
                prev
                  ? prev.map(item =>
                      item.record.ownerName === rawName
                        ? { ...item, ownerStatus: 'Matched' as const, matchedOwnerName: rawName }
                        : item
                    )
                  : prev
              );
            }
          }}
          onClose={() => setShowUnresolvedReview(false)}
        />
      )}


    </motion.div>
  );
}
