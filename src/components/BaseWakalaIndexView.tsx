import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { 
  BaseWakalaEntity, 
  DeltaConflictType, 
  BaseWakalaReconciliationStage 
} from '../types/baseWakala';
import { Owner } from '../types';
import { normalizeMsisdn, isValidTanzanianMsisdn } from '../utils/msisdn';
import { resolveOwnerMatch, addNameAlias } from '../utils/ownerMatch';
import { useCompany } from './CompanyContext';
import { getActivityRules } from '../utils/activityRules';
import { fetchWakalaStatusHistory } from '../lib/wakalaStatus.functions';
import PageHeaderBanner from './PageHeaderBanner';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Building2, 
  Plus, 
  Trash2, 
  Edit3, 
  Link2, 
  ChevronDown, 
  ChevronRight, 
  X, 
  ShieldCheck, 
  Filter, 
  Check, 
  Slash,
  MapPin,
  UserCheck,
  Loader2,
  Navigation,
  AlertCircle
} from 'lucide-react';

const PAGE_SIZE = 25;

export default function BaseWakalaIndexView() {
  const { companyName } = useCompany();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Active State from LocalStorage ---
  const [entities, setEntities] = useState<BaseWakalaEntity[]>(() => {
    const saved = localStorage.getItem('baseWakalaIndex');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      // Normalize legacy BaseWakala items into BaseWakalaEntity
      return parsed.map((item: any, idx: number) => normalizeToEntity(item, idx));
    } catch (e) {
      console.error('Failed to parse baseWakalaIndex:', e);
      return [];
    }
  });

  const [lastUpdated, setLastUpdated] = useState<string | null>(
    () => localStorage.getItem('baseWakalaIndex_lastUpdated') || null
  );

  const owners: Owner[] = useMemo(() => {
    const saved = localStorage.getItem('ownersList');
    if (!saved) return [];
    try { return JSON.parse(saved); } catch (e) { return []; }
  }, []);

  // --- Live Active/Inactive status, recorded weekly by the system rule ---
  const [statusRows, setStatusRows] = useState<any[]>([]);
  const [rules, setRules] = useState(() => getActivityRules());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetchWakalaStatusHistory({ data: {} });
        if (!cancelled) setStatusRows(res.rows || []);
      } catch (err) {
        console.warn('[base wakala] status history unavailable', err);
      }
    };
    load();
    const onRules = () => { setRules(getActivityRules()); load(); };
    window.addEventListener('activity-rules-updated', onRules);
    window.addEventListener('weekly-kpi-updated', load);
    return () => {
      cancelled = true;
      window.removeEventListener('activity-rules-updated', onRules);
      window.removeEventListener('weekly-kpi-updated', load);
    };
  }, []);

  /**
   * Latest recorded week per wakala + a per-month roll-up, so the list can
   * show the real status now and what it was in earlier months.
   */
  const statusIndex = useMemo(() => {
    const latest = new Map<string, any>();
    const byMonth = new Map<string, Map<string, boolean>>();
    const months = new Set<string>();

    const weekRank = (label: string) => {
      const row = String(label || '');
      const year = Number(row.match(/(20\d{2})/)?.[1] || 0);
      const week = Number(row.match(/(\d+)/)?.[1] || 0);
      return year * 100 + week;
    };

    (statusRows || []).forEach(r => {
      const key = normalizeMsisdn(r.msisdn) || String(r.msisdn || '');
      if (!key) return;
      const prev = latest.get(key);
      if (!prev || weekRank(r.reporting_week) >= weekRank(prev.reporting_week)) latest.set(key, r);
      if (r.reporting_month) {
        months.add(r.reporting_month);
        let m = byMonth.get(r.reporting_month);
        if (!m) { m = new Map(); byMonth.set(r.reporting_month, m); }
        // A wakala counts as active for the month if it was active in any
        // recorded week of that month.
        m.set(key, (m.get(key) || false) || !!r.is_active);
      }
    });

    return {
      latest,
      byMonth,
      recentMonths: Array.from(months).sort().reverse().slice(0, 3),
    };
  }, [statusRows]);

  // --- Search & Filters ---
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE' | 'NO_DATA'>('ALL');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [districtFilter, setDistrictFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // --- Staging & Reconciliation Modal ---
  const [stagedItems, setStagedItems] = useState<BaseWakalaReconciliationStage[] | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // --- Manual Edit / Add Modal ---
  const [editingEntity, setEditingEntity] = useState<Partial<BaseWakalaEntity> | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const [isCapturingModalGps, setIsCapturingModalGps] = useState(false);
  const [modalGpsError, setModalGpsError] = useState<string | null>(null);

  const handleCaptureModalGps = () => {
    setIsCapturingModalGps(true);
    setModalGpsError(null);
    if (!navigator.geolocation) {
      const msg = 'Geolocation is not supported by your browser.';
      setModalGpsError(msg);
      setIsCapturingModalGps(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        const capturedAt = new Date().toISOString();
        const loc = { lat, lng, accuracy, capturedAt, address: editingEntity?.district || editingEntity?.region };
        setEditingEntity(prev => prev ? { ...prev, location: loc } : null);
        setIsCapturingModalGps(false);
      },
      (err) => {
        setIsCapturingModalGps(false);
        setModalGpsError(`GPS capture failed: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  useEffect(() => {
    if (isAddModalOpen && editingEntity && !editingEntity.location && !isCapturingModalGps) {
      handleCaptureModalGps();
    }
  }, [isAddModalOpen]);

  // --- Unmatched Owner Resolution ---
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveSelection, setResolveSelection] = useState<string>('');

  // Persist entities back to localStorage whenever updated
  const saveEntities = (updatedList: BaseWakalaEntity[]) => {
    const nowStr = new Date().toLocaleDateString('en-US', { 
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' 
    });
    localStorage.setItem('baseWakalaIndex', JSON.stringify(updatedList));
    localStorage.setItem('baseWakalaIndex_lastUpdated', nowStr);
    setEntities(updatedList);
    setLastUpdated(nowStr);
  };

  // Extract unique districts for filtering
  const districts = useMemo(() => {
    const set = new Set<string>();
    entities.forEach(e => { if (e.district) set.add(e.district); });
    return Array.from(set).sort();
  }, [entities]);

  // Enrich entities with owner match status and the real, weekly-measured
  // Active/Inactive status from the recorded status history.
  const enrichedEntities = useMemo(() => {
    return entities.map(e => {
      const match = resolveOwnerMatch(e.ownerName, owners, 'Base Wakala Index');
      const key = normalizeMsisdn(e.msisdn) || e.msisdn;
      const altKey = e.altMsisdn ? normalizeMsisdn(e.altMsisdn) : '';
      const record = statusIndex.latest.get(key) || (altKey ? statusIndex.latest.get(altKey) : undefined);
      const liveStatus: 'ACTIVE' | 'INACTIVE' | 'NO_DATA' = record
        ? (record.is_active ? 'ACTIVE' : 'INACTIVE')
        : 'NO_DATA';
      const monthHistory = statusIndex.recentMonths.map(month => {
        const m = statusIndex.byMonth.get(month);
        const val = m ? (m.get(key) ?? (altKey ? m.get(altKey) : undefined)) : undefined;
        return { month, status: val === undefined ? 'NO_DATA' : val ? 'ACTIVE' : 'INACTIVE' };
      });
      return {
        entity: e,
        ownerStatus: match.status, // 'Matched' | 'Unmatched' | 'Unassigned'
        matchedOwner: match.matchedOwner,
        liveStatus,
        statusRecord: record,
        monthHistory,
      };
    });
  }, [entities, owners, statusIndex]);

  // Filtered dataset
  const filteredItems = useMemo(() => {
    return enrichedEntities.filter(({ entity, ownerStatus, matchedOwner, liveStatus }) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hit =
          entity.wakalaCode.toLowerCase().includes(q) ||
          entity.msisdn.includes(q) ||
          entity.wakalaName.toLowerCase().includes(q) ||
          (entity.ownerName && entity.ownerName.toLowerCase().includes(q)) ||
          (entity.district && entity.district.toLowerCase().includes(q)) ||
          (entity.region && entity.region.toLowerCase().includes(q)) ||
          (entity.siteWard && entity.siteWard.toLowerCase().includes(q)) ||
          (entity.altMsisdn && entity.altMsisdn.includes(q));
        if (!hit) return false;
      }

      if (statusFilter !== 'ALL' && liveStatus !== statusFilter) return false;

      if (ownerFilter === '__unassigned__' && ownerStatus !== 'Unassigned') return false;
      if (ownerFilter === '__unmatched__' && ownerStatus !== 'Unmatched') return false;
      if (ownerFilter !== 'all' && ownerFilter !== '__unassigned__' && ownerFilter !== '__unmatched__') {
        if (entity.ownerId !== ownerFilter && (!matchedOwner || matchedOwner.id !== ownerFilter)) {
          return false;
        }
      }

      if (districtFilter !== 'all' && entity.district !== districtFilter) return false;

      return true;
    });
  }, [enrichedEntities, searchQuery, statusFilter, ownerFilter, districtFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = filteredItems.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  // --- CSV / Excel Parsing & Delta Logic ---
  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const jsonRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (!jsonRows || jsonRows.length === 0) {
        alert('Uploaded file is empty or could not be read.');
        setIsUploading(false);
        return;
      }

      const stages: BaseWakalaReconciliationStage[] = [];
      const existingCodeMap = new Map<string, BaseWakalaEntity>();
      const existingMsisdnMap = new Map<string, BaseWakalaEntity>();

      entities.forEach(e => {
        if (e.wakalaCode) existingCodeMap.set(e.wakalaCode.trim().toUpperCase(), e);
        if (e.msisdn) existingMsisdnMap.set(e.msisdn, e);
      });

      const seenInBatch = new Set<string>();

      // Header lookup is normalized (case/spacing/punctuation-insensitive) so
      // files with headers like "OWNER", "owner_name" or "Master Agent Name"
      // still resolve to their owner instead of landing as "Unassigned".
      const pick = (row: any, aliases: string[]): string => {
        const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        const wanted = aliases.map(norm);
        for (const k of Object.keys(row)) {
          if (wanted.includes(norm(k))) {
            const val = String(row[k] ?? '').trim();
            if (val) return val;
          }
        }
        return '';
      };

      jsonRows.forEach((row, idx) => {
        const rawCode = pick(row, ['Wakala Code', 'WakalaCode', 'CODE', 'Terminal Code', 'TerminalCode', 'Agent Code']);

        const rawName = pick(row, ['Wakala Name', 'WakalaName', 'Full_Name', 'Full Name', 'NAME', 'Agent Name']);

        const rawMsisdn = pick(row, ['MSISDN', 'Phone', 'Mobile', 'Phone Number', 'Till', 'Till MSISDN']);

        const rawOwnerId = pick(row, ['Owner ID', 'OwnerID', 'Owner Code', 'Master Agent ID', 'MA ID']);

        const rawOwnerName = pick(row, ['Owner Name', 'Owner', 'OWNER', 'Master Agent Name', 'Master Agent', 'SA Owner', 'Owner_Name']);

        const rawWard = pick(row, ['Ward', 'Site Ward', 'siteWard', 'Seward']);

        const rawDistrict = pick(row, ['District']);

        const rawRegion = pick(row, ['Region']);

        const rawAltMsisdn = pick(row, ['Alt MSISDN', 'AltMSISDN', 'Alternate Number', 'ALTERN NO', 'Alt Phone']);


        const normalizedMsisdn = normalizeMsisdn(rawMsisdn);
        if (!normalizedMsisdn && !rawCode) return; // Skip invalid rows lacking both code & msisdn

        const batchKey = rawCode ? rawCode.toUpperCase() : normalizedMsisdn;
        if (seenInBatch.has(batchKey)) return; // Deduplicate within current upload file
        seenInBatch.add(batchKey);

        const normalizedAltMsisdn = normalizeMsisdn(rawAltMsisdn);

        // Find existing match
        const existingByCode = rawCode ? existingCodeMap.get(rawCode.toUpperCase()) : undefined;
        const existingByMsisdn = normalizedMsisdn ? existingMsisdnMap.get(normalizedMsisdn) : undefined;
        const existing = existingByCode || existingByMsisdn;

        const ownerMatch = resolveOwnerMatch(rawOwnerName, owners, 'Base Wakala Import Staging');
        const finalOwnerName = ownerMatch.matchedOwner ? ownerMatch.matchedOwner.name : (rawOwnerName || 'Unassigned');
        const finalOwnerId = rawOwnerId || (ownerMatch.matchedOwner ? ownerMatch.matchedOwner.id : '');

        const rawRecord: Partial<BaseWakalaEntity> = {
          id: existing ? existing.id : `bw-${Date.now()}-${idx}`,
          wakalaName: rawName || (existing ? existing.wakalaName : 'Unnamed Terminal'),
          wakalaCode: rawCode || (existing ? existing.wakalaCode : `TERM-${idx + 1}`),
          msisdn: normalizedMsisdn || (existing ? existing.msisdn : ''),
          ownerId: finalOwnerId,
          ownerName: finalOwnerName,
          siteWard: rawWard || undefined,
          district: rawDistrict || undefined,
          region: rawRegion || undefined,
          altMsisdn: normalizedAltMsisdn || undefined,
          status: 'ACTIVE',
          createdAt: existing ? existing.createdAt : new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        let conflictType: DeltaConflictType = 'NEW_TERMINAL';
        let selectedAction: 'ACCEPT' | 'OVERWRITE' | 'IGNORE' = 'ACCEPT';

        if (existing) {
          const ownerChanged = existing.ownerName?.trim().toLowerCase() !== finalOwnerName.trim().toLowerCase();
          const metaChanged =
            (rawWard && rawWard !== existing.siteWard) ||
            (rawDistrict && rawDistrict !== existing.district) ||
            (rawRegion && rawRegion !== existing.region) ||
            (rawName && rawName !== existing.wakalaName);

          if (ownerChanged) {
            conflictType = 'DELTA_OWNER_REASSIGN';
            selectedAction = 'OVERWRITE';
          } else if (metaChanged) {
            conflictType = 'DATA_UPDATED';
            selectedAction = 'ACCEPT';
          } else {
            conflictType = 'EXACT_MATCH';
            selectedAction = 'IGNORE';
          }
        }

        stages.push({
          id: `stage-${idx}-${Date.now()}`,
          rawRecord,
          conflictType,
          existingRecord: existing,
          selectedAction
        });
      });

      if (stages.length === 0) {
        alert('No valid Base Wakala records found in file. Please verify column headers (Wakala Code, MSISDN, Owner Name).');
      } else {
        setStagedItems(stages);
      }
    } catch (err) {
      console.error('Error reading upload file:', err);
      alert('Could not parse file. Please upload a valid CSV or XLSX spreadsheet.');
    } finally {
      setIsUploading(false);
    }
  };

  // Confirm Staged Import
  const handleCommitImport = () => {
    if (!stagedItems) return;

    const currentMap = new Map<string, BaseWakalaEntity>();
    entities.forEach(e => currentMap.set(e.id, e));

    stagedItems.forEach(stage => {
      if (stage.selectedAction === 'IGNORE') return;

      const record = stage.rawRecord;
      const entityId = record.id || `bw-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

      const finalEntity: BaseWakalaEntity = {
        id: entityId,
        wakalaName: record.wakalaName || 'Unnamed Terminal',
        wakalaCode: record.wakalaCode || '',
        msisdn: record.msisdn || '',
        ownerId: record.ownerId || '',
        ownerName: record.ownerName || 'Unassigned',
        siteWard: record.siteWard || '',
        district: record.district || '',
        region: record.region || '',
        altMsisdn: record.altMsisdn || '',
        status: record.status || 'ACTIVE',
        createdAt: record.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // Legacy support properties
        code: record.wakalaCode,
        fullName: record.wakalaName,
        alternateNumber: record.altMsisdn
      };

      currentMap.set(entityId, finalEntity);
    });

    const newList = Array.from(currentMap.values());
    saveEntities(newList);
    setStagedItems(null);
  };

  // Individual Actions
  const toggleEntityStatus = (id: string) => {
    const updated = entities.map(e => {
      if (e.id === id) {
        const nextStatus: 'ACTIVE' | 'INACTIVE' = e.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
        return { ...e, status: nextStatus, updatedAt: new Date().toISOString() };
      }
      return e;
    });
    saveEntities(updated);
  };

  const handleDeleteEntity = (id: string) => {
    if (confirm('Are you sure you want to delete this Wakala terminal record from the Base Index?')) {
      const updated = entities.filter(e => e.id !== id);
      saveEntities(updated);
    }
  };

  const handleResolveOwner = (rawName: string) => {
    if (!resolveSelection) return;
    addNameAlias(resolveSelection, rawName);
    setResolvingId(null);
    setResolveSelection('');
    // Refresh enriched status
    setEntities([...entities]);
  };

  const handleSaveManualEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntity) return;

    const normMsisdn = normalizeMsisdn(editingEntity.msisdn);
    if (!normMsisdn) {
      alert('Please provide a valid MSISDN.');
      return;
    }

    const normAlt = normalizeMsisdn(editingEntity.altMsisdn);

    let updatedList: BaseWakalaEntity[];
    if (editingEntity.id) {
      // Edit existing
      updatedList = entities.map(item => {
        if (item.id === editingEntity.id) {
          return {
            ...item,
            wakalaName: editingEntity.wakalaName || 'Unnamed Terminal',
            wakalaCode: editingEntity.wakalaCode || '',
            msisdn: normMsisdn,
            ownerName: editingEntity.ownerName || 'Unassigned',
            siteWard: editingEntity.siteWard || '',
            district: editingEntity.district || '',
            region: editingEntity.region || '',
            altMsisdn: normAlt || '',
            status: editingEntity.status || 'ACTIVE',
            updatedAt: new Date().toISOString(),
            code: editingEntity.wakalaCode,
            fullName: editingEntity.wakalaName,
            alternateNumber: normAlt
          };
        }
        return item;
      });
    } else {
      // Add new
      const newEntity: BaseWakalaEntity = {
        id: `bw-${Date.now()}`,
        wakalaName: editingEntity.wakalaName || 'Unnamed Terminal',
        wakalaCode: editingEntity.wakalaCode || `TERM-${entities.length + 1}`,
        msisdn: normMsisdn,
        ownerId: editingEntity.ownerId || '',
        ownerName: editingEntity.ownerName || 'Unassigned',
        siteWard: editingEntity.siteWard || '',
        district: editingEntity.district || '',
        region: editingEntity.region || '',
        altMsisdn: normAlt || '',
        status: editingEntity.status || 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        code: editingEntity.wakalaCode,
        fullName: editingEntity.wakalaName,
        alternateNumber: normAlt
      };
      updatedList = [newEntity, ...entities];
    }

    saveEntities(updatedList);
    setEditingEntity(null);
    setIsAddModalOpen(false);
  };

  const toggleRowExpanded = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Conflict Stats for Modal
  const conflictStats = useMemo(() => {
    if (!stagedItems) return { newCount: 0, reassignCount: 0, updateCount: 0, exactCount: 0 };
    return {
      newCount: stagedItems.filter(s => s.conflictType === 'NEW_TERMINAL').length,
      reassignCount: stagedItems.filter(s => s.conflictType === 'DELTA_OWNER_REASSIGN').length,
      updateCount: stagedItems.filter(s => s.conflictType === 'DATA_UPDATED').length,
      exactCount: stagedItems.filter(s => s.conflictType === 'EXACT_MATCH').length,
    };
  }, [stagedItems]);

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8 font-sans">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <PageHeaderBanner
          icon={Building2}
          title="Base Wakala"
          subtitle={`Master terminal directory, ownership assignments, and regional indexing for ${companyName}.`}
        />

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="bg-slate-100 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>{entities.length.toLocaleString()} Terminals Indexed</span>
          </div>

          {lastUpdated && (
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>Last Sync: <strong>{lastUpdated}</strong></span>
            </div>
          )}

          <button
            onClick={() => {
              setEditingEntity({
                status: 'ACTIVE',
                wakalaName: '',
                wakalaCode: '',
                msisdn: '',
                ownerName: '',
                district: '',
                region: '',
                siteWard: ''
              });
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-1.5 bg-brand-primary hover:bg-brand-primary-light text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Add Terminal</span>
          </button>
        </div>
      </div>

      {/* UPLOAD DROPZONE */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileUpload(e.dataTransfer.files[0]);
          }
        }}
        className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
          isDragOver 
            ? 'border-brand-primary bg-blue-50/50 scale-[1.005]' 
            : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          accept=".csv,.xlsx,.xls"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFileUpload(e.target.files[0]);
            }
          }}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center gap-2">
          <div className="w-12 h-12 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center">
            {isUploading ? <RefreshCw className="h-6 w-6 animate-spin" /> : <UploadCloud className="h-6 w-6" />}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">
              Bulk Upload & Reconcile Base Wakala CSV / Excel
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Drag and drop your spreadsheet here, or{' '}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-brand-primary font-bold hover:underline cursor-pointer"
              >
                browse files
              </button>
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1">
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            <span>Supported Columns: Wakala Code, MSISDN, Owner Name, Ward, District, Region, Alt MSISDN</span>
          </div>
        </div>
      </div>

      {/* SEARCH & FILTERS BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap gap-3 items-center justify-between">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            placeholder="Search by Code, MSISDN, Terminal Name, Owner, Ward, District..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-brand-primary transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); }}
            className="text-xs rounded-xl border border-slate-200 px-3 py-2 bg-slate-50 font-medium focus:outline-none focus:border-brand-primary"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
            <option value="NO_DATA">NO DATA</option>
          </select>

          {/* Owner Filter */}
          <select
            value={ownerFilter}
            onChange={(e) => { setOwnerFilter(e.target.value); setPage(1); }}
            className="text-xs rounded-xl border border-slate-200 px-3 py-2 bg-slate-50 font-medium focus:outline-none focus:border-brand-primary"
          >
            <option value="all">All Owners</option>
            <option value="__unassigned__">Unassigned (No Owner)</option>
            <option value="__unmatched__">Unmatched Owner Name</option>
            {owners.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>

          {/* District Filter */}
          <select
            value={districtFilter}
            onChange={(e) => { setDistrictFilter(e.target.value); setPage(1); }}
            className="text-xs rounded-xl border border-slate-200 px-3 py-2 bg-slate-50 font-medium focus:outline-none focus:border-brand-primary"
          >
            <option value="all">All Districts</option>
            {districts.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      {/* DATA TABLE */}
      {pageItems.length > 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 w-8"></th>
                  <th className="px-4 py-3">Wakala Terminal</th>
                  <th className="px-4 py-3">Code / ID</th>
                  <th className="px-4 py-3">MSISDN</th>
                  <th className="px-4 py-3">Owner Assignment</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageItems.map(({ entity, ownerStatus, matchedOwner }) => {
                  const isExpanded = expandedRows.has(entity.id);
                  const isResolving = resolvingId === entity.id;

                  return (
                    <React.Fragment key={entity.id}>
                      <tr className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleRowExpanded(entity.id)}
                            className="text-slate-400 hover:text-slate-700 cursor-pointer"
                          >
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </td>

                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900">{entity.wakalaName || '—'}</div>
                        </td>

                        <td className="px-4 py-3 font-mono text-slate-600 font-semibold">
                          {entity.wakalaCode || '—'}
                        </td>

                        <td className="px-4 py-3 font-mono font-bold text-slate-800">
                          {entity.msisdn}
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-800">
                              {matchedOwner ? matchedOwner.name : (entity.ownerName || 'Unassigned')}
                            </span>
                            {ownerStatus === 'Matched' && (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                Matched
                              </span>
                            )}
                            {ownerStatus === 'Unmatched' && (
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                                Unmatched
                              </span>
                            )}
                            {ownerStatus === 'Unassigned' && (
                              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                                Unassigned
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-slate-600">
                          {entity.district || entity.region ? (
                            <span>{[entity.district, entity.region].filter(Boolean).join(', ')}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span
                              title={
                                statusRecord
                                  ? `${statusRecord.reporting_week}: ${statusRecord.cash_in_txns} cash-in + ${statusRecord.cash_out_txns} cash-out (threshold ${statusRecord.threshold_used})`
                                  : 'No weekly report covers this wakala yet'
                              }
                              className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border w-fit ${
                                liveStatus === 'ACTIVE'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : liveStatus === 'INACTIVE'
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : 'bg-slate-100 text-slate-500 border-slate-300'
                              }`}
                            >
                              {liveStatus === 'NO_DATA' ? 'NO DATA' : liveStatus}
                            </span>
                            {statusRecord && (
                              <span className="text-[9px] font-semibold text-slate-400">
                                {statusRecord.reporting_week}
                              </span>
                            )}
                            {monthHistory.length > 0 && (
                              <div className="flex items-center gap-1">
                                {monthHistory.map(h => (
                                  <span
                                    key={h.month}
                                    title={`${h.month}: ${h.status === 'NO_DATA' ? 'no data' : h.status.toLowerCase()}`}
                                    className={`h-1.5 w-4 rounded-full ${
                                      h.status === 'ACTIVE'
                                        ? 'bg-emerald-400'
                                        : h.status === 'INACTIVE'
                                          ? 'bg-rose-400'
                                          : 'bg-slate-200'
                                    }`}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {ownerStatus === 'Unmatched' && (
                              <button
                                onClick={() => {
                                  setResolvingId(entity.id);
                                  setResolveSelection('');
                                }}
                                title="Resolve owner alias link"
                                className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-lg cursor-pointer"
                              >
                                <Link2 className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setEditingEntity({ ...entity });
                                setIsAddModalOpen(true);
                              }}
                              title="Edit record"
                              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteEntity(entity.id)}
                              title="Delete record"
                              className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* EXPANDED DETAILS */}
                      {isExpanded && (
                        <tr className="bg-slate-50/80 border-b border-slate-100">
                          <td></td>
                          <td colSpan={7} className="px-4 py-3 text-[11px] text-slate-600">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-2 bg-white rounded-xl border border-slate-200">
                              <div>
                                <span className="font-bold text-slate-500 block text-[10px] uppercase">Site / Ward</span>
                                <span className="text-slate-800 font-medium">{entity.siteWard || '—'}</span>
                              </div>
                              <div>
                                <span className="font-bold text-slate-500 block text-[10px] uppercase">Alternate MSISDN</span>
                                <span className="text-slate-800 font-mono font-medium">{entity.altMsisdn || '—'}</span>
                              </div>
                              <div>
                                <span className="font-bold text-slate-500 block text-[10px] uppercase">Created At</span>
                                <span className="text-slate-800 font-medium">
                                  {entity.createdAt ? new Date(entity.createdAt).toLocaleDateString() : '—'}
                                </span>
                              </div>
                              <div>
                                <span className="font-bold text-slate-500 block text-[10px] uppercase">Last Updated</span>
                                <span className="text-slate-800 font-medium">
                                  {entity.updatedAt ? new Date(entity.updatedAt).toLocaleDateString() : '—'}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* RESOLVE ALIAS ROW */}
                      {isResolving && (
                        <tr className="bg-amber-50/80 border-b border-amber-200">
                          <td></td>
                          <td colSpan={7} className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-bold text-slate-700">
                                Link raw owner name "{entity.ownerName}" to master owner:
                              </span>
                              <select
                                value={resolveSelection}
                                onChange={(e) => setResolveSelection(e.target.value)}
                                className="text-xs rounded-lg border border-slate-300 px-2 py-1.5 bg-white"
                              >
                                <option value="">Select master owner...</option>
                                {owners.map(o => (
                                  <option key={o.id} value={o.id}>{o.name}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => handleResolveOwner(entity.ownerName)}
                                disabled={!resolveSelection}
                                className="text-xs font-bold text-white bg-brand-primary hover:bg-brand-primary-light disabled:opacity-40 px-3 py-1.5 rounded-lg cursor-pointer"
                              >
                                Save Alias Link
                              </button>
                              <button
                                onClick={() => setResolvingId(null)}
                                className="text-xs font-bold text-slate-600 px-3 py-1.5 cursor-pointer hover:bg-slate-200 rounded-lg"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* PAGINATION FOOTER */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <span className="text-xs text-slate-500">
              Showing {(pageSafe - 1) * PAGE_SIZE + 1}–{Math.min(pageSafe * PAGE_SIZE, filteredItems.length)} of {filteredItems.length} records
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={pageSafe <= 1}
                className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40 cursor-pointer"
              >
                Previous
              </button>
              <span className="text-xs font-bold text-slate-700">
                Page {pageSafe} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={pageSafe >= totalPages}
                className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
          <MapPin className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-600">No Base Wakala terminals match the current filters</p>
          <p className="text-xs text-slate-400 mt-1">Try clearing search query or adjusting filter dropdowns above.</p>
        </div>
      )}

      {/* RECONCILIATION PREVIEW MODAL */}
      {stagedItems && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-brand-primary" />
                  Pre-Import Base Wakala Delta Reconciliation
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Review delta analysis against current Base Index before committing updates.
                </p>
              </div>
              <button
                onClick={() => setStagedItems(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Conflict Stats Summary Bar */}
            <div className="p-4 bg-slate-100 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-center">
                <span className="block text-emerald-800 font-extrabold text-base">{conflictStats.newCount}</span>
                <span className="text-emerald-700 font-bold uppercase text-[10px]">New Terminals</span>
              </div>
              <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xl text-center">
                <span className="block text-amber-800 font-extrabold text-base">{conflictStats.reassignCount}</span>
                <span className="text-amber-700 font-bold uppercase text-[10px]">Owner Reassignments</span>
              </div>
              <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-xl text-center">
                <span className="block text-blue-800 font-extrabold text-base">{conflictStats.updateCount}</span>
                <span className="text-blue-700 font-bold uppercase text-[10px]">Metadata Updates</span>
              </div>
              <div className="bg-slate-200 border border-slate-300 p-2.5 rounded-xl text-center">
                <span className="block text-slate-700 font-extrabold text-base">{conflictStats.exactCount}</span>
                <span className="text-slate-600 font-bold uppercase text-[10px]">Exact Matches</span>
              </div>
            </div>

            {/* Bulk Actions Header */}
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-slate-700">
                {stagedItems.length} records staged for import
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    setStagedItems(prev =>
                      prev ? prev.map(s => ({ ...s, selectedAction: 'ACCEPT' })) : prev
                    );
                  }}
                  className="px-2.5 py-1 text-[11px] font-bold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 rounded-lg cursor-pointer"
                >
                  Accept All
                </button>
                <button
                  onClick={() => {
                    setStagedItems(prev =>
                      prev ? prev.map(s => ({ ...s, selectedAction: 'IGNORE' })) : prev
                    );
                  }}
                  className="px-2.5 py-1 text-[11px] font-bold bg-slate-200 text-slate-700 hover:bg-slate-300 rounded-lg cursor-pointer"
                >
                  Ignore All
                </button>
              </div>
            </div>

            {/* Staging Rows List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {stagedItems.map((stage, idx) => {
                const rec = stage.rawRecord;
                const existing = stage.existingRecord;

                return (
                  <div
                    key={stage.id}
                    className={`p-3.5 rounded-xl border transition-all text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                      stage.conflictType === 'DELTA_OWNER_REASSIGN'
                        ? 'bg-amber-50/80 border-amber-300'
                        : stage.conflictType === 'NEW_TERMINAL'
                        ? 'bg-emerald-50/80 border-emerald-300'
                        : stage.conflictType === 'DATA_UPDATED'
                        ? 'bg-blue-50/80 border-blue-300'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{rec.wakalaName}</span>
                        <span className="font-mono text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                          {rec.wakalaCode}
                        </span>
                        <span className="font-mono font-bold text-slate-800">{rec.msisdn}</span>

                        {/* Conflict Badge */}
                        {stage.conflictType === 'NEW_TERMINAL' && (
                          <span className="text-[10px] font-extrabold bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                            NEW
                          </span>
                        )}
                        {stage.conflictType === 'DELTA_OWNER_REASSIGN' && (
                          <span className="text-[10px] font-extrabold bg-amber-600 text-white px-2 py-0.5 rounded-full">
                            OWNER REASSIGNMENT
                          </span>
                        )}
                        {stage.conflictType === 'DATA_UPDATED' && (
                          <span className="text-[10px] font-extrabold bg-blue-600 text-white px-2 py-0.5 rounded-full">
                            METADATA UPDATE
                          </span>
                        )}
                        {stage.conflictType === 'EXACT_MATCH' && (
                          <span className="text-[10px] font-extrabold bg-slate-400 text-white px-2 py-0.5 rounded-full">
                            EXACT MATCH
                          </span>
                        )}
                      </div>

                      {/* Details comparison */}
                      <div className="text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                        <span><strong>Owner:</strong> {rec.ownerName || 'Unassigned'}</span>
                        {existing && stage.conflictType === 'DELTA_OWNER_REASSIGN' && (
                          <span className="text-amber-800 bg-amber-100/80 px-1.5 py-0.5 rounded font-semibold">
                            (Previous Owner: {existing.ownerName || 'None'})
                          </span>
                        )}
                        {rec.district && <span><strong>District:</strong> {rec.district}</span>}
                        {rec.siteWard && <span><strong>Ward:</strong> {rec.siteWard}</span>}
                      </div>
                    </div>

                    {/* Action Selection for Row */}
                    <div className="flex items-center gap-2 self-end md:self-center">
                      <button
                        onClick={() => {
                          setStagedItems(prev =>
                            prev
                              ? prev.map(s =>
                                  s.id === stage.id ? { ...s, selectedAction: 'ACCEPT' } : s
                                )
                              : prev
                          );
                        }}
                        className={`px-3 py-1.5 rounded-lg font-bold text-xs cursor-pointer transition-all ${
                          stage.selectedAction === 'ACCEPT' || stage.selectedAction === 'OVERWRITE'
                            ? 'bg-brand-primary text-white shadow-xs'
                            : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {stage.conflictType === 'DELTA_OWNER_REASSIGN' ? 'Overwrite' : 'Accept'}
                      </button>
                      <button
                        onClick={() => {
                          setStagedItems(prev =>
                            prev
                              ? prev.map(s =>
                                  s.id === stage.id ? { ...s, selectedAction: 'IGNORE' } : s
                                )
                              : prev
                          );
                        }}
                        className={`px-3 py-1.5 rounded-lg font-bold text-xs cursor-pointer transition-all ${
                          stage.selectedAction === 'IGNORE'
                            ? 'bg-slate-700 text-white shadow-xs'
                            : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        Ignore
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                onClick={() => setStagedItems(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCommitImport}
                className="px-6 py-2.5 text-xs font-bold text-white bg-brand-primary hover:bg-brand-primary-light rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Commit Safe Import</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT MANUAL TERMINAL MODAL */}
      {isAddModalOpen && editingEntity && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-base font-bold text-slate-900">
                {editingEntity.id ? 'Edit Wakala Terminal' : 'Add New Base Wakala Terminal'}
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveManualEdit} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Wakala Terminal Name *</label>
                <input
                  type="text"
                  required
                  value={editingEntity.wakalaName || ''}
                  onChange={(e) => setEditingEntity({ ...editingEntity, wakalaName: e.target.value })}
                  placeholder="e.g. BALWYN ENTERPRISES TILL 1"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Terminal Code *</label>
                  <input
                    type="text"
                    required
                    value={editingEntity.wakalaCode || ''}
                    onChange={(e) => setEditingEntity({ ...editingEntity, wakalaCode: e.target.value })}
                    placeholder="e.g. 104523"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-brand-primary font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">MSISDN *</label>
                  <input
                    type="text"
                    required
                    value={editingEntity.msisdn || ''}
                    onChange={(e) => setEditingEntity({ ...editingEntity, msisdn: e.target.value })}
                    placeholder="e.g. 0712345678"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-brand-primary font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Assigned Owner Name</label>
                <select
                  value={editingEntity.ownerName || ''}
                  onChange={(e) => {
                    const name = e.target.value;
                    const matched = owners.find(o => o.name === name);
                    setEditingEntity({
                      ...editingEntity,
                      ownerName: name,
                      ownerId: matched ? matched.id : ''
                    });
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-brand-primary bg-white"
                >
                  <option value="">Unassigned</option>
                  {owners.map(o => (
                    <option key={o.id} value={o.name}>{o.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">District</label>
                  <input
                    type="text"
                    value={editingEntity.district || ''}
                    onChange={(e) => setEditingEntity({ ...editingEntity, district: e.target.value })}
                    placeholder="e.g. Kinondoni"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-brand-primary"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Region</label>
                  <input
                    type="text"
                    value={editingEntity.region || ''}
                    onChange={(e) => setEditingEntity({ ...editingEntity, region: e.target.value })}
                    placeholder="e.g. Dar es Salaam"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-brand-primary"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Site / Ward</label>
                  <input
                    type="text"
                    value={editingEntity.siteWard || ''}
                    onChange={(e) => setEditingEntity({ ...editingEntity, siteWard: e.target.value })}
                    placeholder="e.g. Makumbusho"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Alt MSISDN (Optional)</label>
                <input
                  type="text"
                  value={editingEntity.altMsisdn || ''}
                  onChange={(e) => setEditingEntity({ ...editingEntity, altMsisdn: e.target.value })}
                  placeholder="e.g. 0687654321"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-brand-primary font-mono"
                />
              </div>

              {/* GPS Location Indicator & Button */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-brand-primary" />
                  <span className="font-bold text-slate-700">GPS Location:</span>
                  {isCapturingModalGps ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Capturing location...
                    </span>
                  ) : editingEntity?.location ? (
                    editingEntity.location.accuracy && editingEntity.location.accuracy > 100 ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                        Low Accuracy ⚠️ ({Math.round(editingEntity.location.accuracy)}m &gt; 100m limit) — Lat: {editingEntity.location.lat.toFixed(4)}, Lng: {editingEntity.location.lng.toFixed(4)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        Location captured ✓ (Lat: {editingEntity.location.lat.toFixed(4)}, Lng: {editingEntity.location.lng.toFixed(4)}{editingEntity.location.accuracy ? `, ±${Math.round(editingEntity.location.accuracy)}m` : ''})
                      </span>
                    )
                  ) : modalGpsError ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                      <AlertCircle className="h-3.5 w-3.5 text-rose-600" />
                      {modalGpsError}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                      Location required
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleCaptureModalGps}
                  disabled={isCapturingModalGps}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-brand-primary bg-brand-primary/10 hover:bg-brand-primary/20 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Navigation className="h-3.5 w-3.5" />
                  {editingEntity?.location ? 'Re-capture GPS' : 'Capture Location'}
                </button>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-brand-primary hover:bg-brand-primary-light rounded-xl shadow-sm cursor-pointer"
                >
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper: Normalize legacy BaseWakala object into BaseWakalaEntity
function normalizeToEntity(item: any, idx: number): BaseWakalaEntity {
  const normMsisdn = normalizeMsisdn(item.msisdn);
  const code = item.wakalaCode || item.code || `TERM-${idx + 1}`;
  const name = item.wakalaName || item.fullName || 'Unnamed Terminal';
  const ownerName = item.ownerName || 'Unassigned';
  const altNo = normalizeMsisdn(item.altMsisdn || item.alternateNumber);

  return {
    id: item.id || `bw-${idx}-${normMsisdn || code}`,
    wakalaName: name,
    wakalaCode: code,
    msisdn: normMsisdn,
    ownerId: item.ownerId || '',
    ownerName,
    siteWard: item.siteWard || '',
    district: item.district || '',
    region: item.region || '',
    altMsisdn: altNo || '',
    status: item.status || 'ACTIVE',
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString(),
    // Legacy support fields
    code,
    fullName: name,
    alternateNumber: altNo
  };
}
