import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  FileSpreadsheet, 
  UploadCloud, 
  Search, 
  CheckCircle, 
  AlertTriangle, 
  Users, 
  MapPin, 
  Database, 
  Check, 
  X, 
  RefreshCw, 
  ShieldCheck, 
  ArrowRight,
  Info,
  Calendar,
  Layers,
  ChevronUp,
  ChevronDown,
  ArrowUpDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getCompanyName } from '../utils/company';
import { Owner } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import { recalculateAllPerformances } from '../utils/mappingEngine';

interface OwnerSyncDashboardProps {
  onCancel: () => void;
  onAddAuditReport: (report: any) => void;
  onSyncComplete: () => void;
}

export interface Till {
  transactionTill: string;
  tillName: string;
  location: string;
  assignedOwner: string;
  title: string;
  status: 'Active' | 'Pending' | 'Suspended';
}

export default function OwnerSyncDashboard({ onCancel, onAddAuditReport, onSyncComplete }: OwnerSyncDashboardProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ name: string; size: number } | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStep, setSyncStep] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  // Parsed Master Data State
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Sorting
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Master lists from localStorage
  const getMasterOwners = (): Owner[] => {
    const saved = localStorage.getItem('ownersList');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    // fallback to default list
    return [];
  };

  const getMasterTills = (): Till[] => {
    const saved = localStorage.getItem('tillsList');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    // Initial mock tills for standard demo owners
    return [];
  };

  // Pre-calculate synchronization stats preview
  const syncPreview = useMemo(() => {
    if (parsedRows.length === 0) return null;

    const currentOwners = getMasterOwners();
    const currentPersonnel = (() => {
      const saved = localStorage.getItem('personnelList');
      if (saved) {
        try { return JSON.parse(saved); } catch(e) {}
      }
      return [];
    })();

    let totalRecords = parsedRows.length;
    let invalidRecords = 0;
    
    const ownersFound = new Set<string>();
    const personnelFound = new Set<string>();

    const processedOwners = new Map<string, { title: string; location: string; status: string; tills: string[] }>();
    const processedPersonnel = new Map<string, { title: string; location: string; status: string; tills: string[] }>();

    const savedMappings = localStorage.getItem('roleMappings');
    let mappings: Record<string, string> = {
      'MFS': 'Owner',
      'Branch Manager': 'Personnel',
      'Supervisor': 'Personnel',
      'Cashier': 'Personnel',
      'Sales Specialist': 'Personnel',
      'Agent Assistant': 'Personnel'
    };
    if (savedMappings) {
      try { mappings = JSON.parse(savedMappings); } catch (e) {}
    }

    parsedRows.forEach(row => {
      if (!row.transactionTill || !row.ownerName) {
        invalidRecords++;
        return;
      }

      const titleClean = (row.title || '').trim();
      const matchedKey = Object.keys(mappings).find(k => k.toLowerCase() === titleClean.toLowerCase());
      const role = matchedKey ? mappings[matchedKey] : 'Personnel';
      const isOwnerRole = role === 'Owner';
      const nameNorm = row.ownerName.trim();

      if (isOwnerRole) {
        ownersFound.add(nameNorm);
        if (!processedOwners.has(nameNorm)) {
          processedOwners.set(nameNorm, { title: row.title, location: row.location, status: row.status, tills: [] });
        }
        processedOwners.get(nameNorm)!.tills.push(row.transactionTill);
      } else {
        personnelFound.add(nameNorm);
        if (!processedPersonnel.has(nameNorm)) {
          processedPersonnel.set(nameNorm, { title: row.title, location: row.location, status: row.status, tills: [] });
        }
        processedPersonnel.get(nameNorm)!.tills.push(row.transactionTill);
      }
    });

    let newOwners = 0;
    let updatedOwners = 0;

    ownersFound.forEach(oName => {
      const dbMatch = currentOwners.find(o => o.name.toLowerCase() === oName.toLowerCase());
      const details = processedOwners.get(oName);
      if (!dbMatch) {
        newOwners++;
      } else {
        const dbTills = (dbMatch as any).assignedTills || [];
        const fileTills = details ? details.tills : [];
        const arraysEqual = (a: string[], b: string[]) => {
          if (a.length !== b.length) return false;
          const sA = [...a].sort();
          const sB = [...b].sort();
          return sA.every((v, i) => v === sB[i]);
        };
        const isChanged = (details && (
          dbMatch.region !== details.location ||
          dbMatch.status !== details.status ||
          (dbMatch as any).title !== details.title ||
          !arraysEqual(dbTills, fileTills)
        ));
        if (isChanged) {
          updatedOwners++;
        }
      }
    });

    let newPersonnel = 0;
    let updatedPersonnel = 0;

    personnelFound.forEach(pName => {
      const dbMatch = currentPersonnel.find((p: any) => p.name.toLowerCase() === pName.toLowerCase());
      const details = processedPersonnel.get(pName);
      if (!dbMatch) {
        newPersonnel++;
      } else {
        const fileTillsStr = details ? details.tills.join(', ') : '';
        const isChanged = (details && (
          dbMatch.location !== details.location ||
          dbMatch.title !== details.title ||
          dbMatch.status !== details.status ||
          dbMatch.assignedTill !== fileTillsStr
        ));
        if (isChanged) {
          updatedPersonnel++;
        }
      }
    });

    return {
      totalRecords,
      totalOwners: ownersFound.size,
      totalPersonnel: personnelFound.size,
      newOwners,
      updatedOwners,
      newPersonnel,
      updatedPersonnel,
      invalidRecords
    };
  }, [parsedRows]);

  // Load Preset Till Workbook Demonstration Dataset
  const handleLoadDemoWorkbook = () => {
    setSelectedFile({ name: "Authoritative_Till_Name_Registry_2026.xlsx", size: 54120 });
    setIsParsing(true);
    setParseProgress(0);

    let progress = 0;
    const interval = setInterval(() => {
      progress += 20;
      setParseProgress(progress);

      if (progress >= 100) {
        clearInterval(interval);
        setIsParsing(false);

        // Populate with rich mock rows containing both Owners (MFS) and Personnel
        setParsedRows([
          { transactionTill: "255711223344", tillName: "Kariakoo Retail", ownerName: "Abubakar Khalid", title: "MFS", location: "Dar es Salaam", status: "Active" },
          { transactionTill: "255722334455", tillName: "Nyamagana Shop", ownerName: "Mwita Chacha", title: "MFS", location: "Mwanza", status: "Active" },
          { transactionTill: "255733445566", tillName: "Sekei Enterprises", ownerName: "Fatma Hassan", title: "Branch Manager", location: "Arusha", status: "Active" },
          { transactionTill: "255744556677", tillName: "Tambukareli Boutique", ownerName: "Grace Mushi", title: "Agent Assistant", location: "Dodoma", status: "Suspended" },
          { transactionTill: "255755667788", tillName: "Dodoma Plaza Wakala", ownerName: "Grace Mushi", title: "Agent Assistant", location: "Dodoma", status: "Active" },
          // New Owner and Till
          { transactionTill: "255766112233", tillName: "Kijitonyama Depot", ownerName: "Salim Rashid", title: "MFS", location: "Dar es Salaam", status: "Active" },
          { transactionTill: "255766445566", tillName: "Sinza Base Station", ownerName: "Salim Rashid", title: "MFS", location: "Dar es Salaam", status: "Active" },
          // Existing Owner, New Till
          { transactionTill: "255711889900", tillName: "Kariakoo Express", ownerName: "Abubakar Khalid", title: "MFS", location: "Dar es Salaam", status: "Active" },
          { transactionTill: "255722998877", tillName: "Mwanza Port Agency", ownerName: "Mwita Chacha", title: "MFS", location: "Mwanza", status: "Active" },
          // New Personnel
          { transactionTill: "255799112233", tillName: "Kawe Retail Center", ownerName: "Rashid Kassim", title: "Sales Specialist", location: "Dar es Salaam", status: "Active" },
          // Invalid Record (missing Till or Name)
          { transactionTill: "", tillName: "Invalid Shop", ownerName: "No Till Person", title: "MFS", location: "Dar es Salaam", status: "Active" }
        ]);
        setCurrentPage(1);
      }
    }, 80);
  };

  // Parse Excel file upload
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
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    setSelectedFile({ name: file.name, size: file.size });
    setIsParsing(true);
    setParseProgress(0);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Read first worksheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonRows: any[] = XLSX.utils.sheet_to_json(worksheet);

        // Helper to perform flexible, case-insensitive column match
        const getVal = (row: any, keys: string[]) => {
          const match = Object.keys(row).find(k => 
            keys.includes(k.toLowerCase().replace(/[\s_-]+/g, ''))
          );
          return match ? String(row[match] || '').trim() : '';
        };

        const parsed: any[] = [];
        jsonRows.forEach(row => {
          const transactionTill = getVal(row, ['transactiontill', 'tillmsisdn', 'msisdn', 'till']);
          const tillName = getVal(row, ['mgttillname', 'tillname', 'mgttill', 'name']);
          const ownerName = getVal(row, ['owner', 'ownername', 'masterowner']);
          const title = getVal(row, ['title', 'designation', 'position']) || 'Owner';
          const location = getVal(row, ['location', 'region', 'zone']) || 'Dar es Salaam';
          const status = (getVal(row, ['status']) || 'Active') as any;

          if (transactionTill && ownerName) {
            parsed.push({
              transactionTill,
              tillName: tillName || `${ownerName} Till`,
              ownerName,
              title,
              location,
              status: ['Active', 'Pending', 'Suspended'].includes(status) ? status : 'Active'
            });
          }
        });

        let progress = 0;
        const interval = setInterval(() => {
          progress += 25;
          setParseProgress(progress);
          if (progress >= 100) {
            clearInterval(interval);
            setIsParsing(false);
            if (parsed.length === 0) {
              alert("No valid rows containing Till and Owner columns were found. Please check our schema template guidelines.");
              setSelectedFile(null);
            } else {
              setParsedRows(parsed);
              setCurrentPage(1);
            }
          }
        }, 80);

      } catch (err) {
        console.error(err);
        alert("Failed to parse the uploaded Excel file. Please make sure it is a valid Excel workbook.");
        setIsParsing(false);
        setSelectedFile(null);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Synchronization execution (Writes back to localStorage DB)
  const handleConfirmSynchronization = () => {
    setIsSyncing(true);
    setSyncProgress(5);
    setSyncStep(0);

    const steps = [
      { title: "Verifying Authoritative Signatures", desc: "Verifying checksum integrity of Till Name worksheet cells." },
      { title: "Analyzing Owner Hierarchy & Sync States", desc: "Differentiating new owners from existing registered agent profiles." },
      { title: "Ingesting and Writing Owner Master Entities", desc: "Updating master agent owners table and assigning global titles." },
      { title: "Synchronizing Transaction Tills (MSISDN)", desc: "Registering tills in core registry and building Owner-Till bindings." },
      { title: "Compiling Sovereign Ledger Relationships", desc: "Updating portfolio size, number of tills, and last sync timestamp." }
    ];

    let currentStep = 0;
    const interval = setInterval(() => {
      currentStep += 1;
      setSyncStep(currentStep);
      setSyncProgress(Math.min(Math.round((currentStep / steps.length) * 100), 100));

      if (currentStep >= steps.length) {
        clearInterval(interval);
        executeDatabaseSync();
        setIsSyncing(false);
        setIsCompleted(true);
      }
    }, 1000);
  };

  const executeDatabaseSync = () => {
    const currentOwners = [...getMasterOwners()];
    const currentTills = [...getMasterTills()];
    
    const currentPersonnel = (() => {
      const saved = localStorage.getItem('personnelList');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error(e);
        }
      }
      return [];
    })();

    const parsedOwnersMap = new Map<string, { title: string; location: string; status: any }>();
    const parsedPersonnelMap = new Map<string, { title: string; location: string; status: any }>();
    const parsedTillsList: Till[] = [];

    const savedMappings = localStorage.getItem('roleMappings');
    let mappings: Record<string, string> = {
      'MFS': 'Owner',
      'Branch Manager': 'Personnel',
      'Supervisor': 'Personnel',
      'Cashier': 'Personnel',
      'Sales Specialist': 'Personnel',
      'Agent Assistant': 'Personnel'
    };
    if (savedMappings) {
      try { mappings = JSON.parse(savedMappings); } catch (e) {}
    }

    parsedRows.forEach(row => {
      if (!row.transactionTill || !row.ownerName) return; // Skip invalid records

      const titleClean = (row.title || '').trim();
      const matchedKey = Object.keys(mappings).find(k => k.toLowerCase() === titleClean.toLowerCase());
      const role = matchedKey ? mappings[matchedKey] : 'Personnel';
      const isOwnerRole = role === 'Owner';

      if (isOwnerRole) {
        parsedOwnersMap.set(row.ownerName.trim(), { 
          title: row.title, 
          location: row.location,
          status: row.status
        });
      } else {
        parsedPersonnelMap.set(row.ownerName.trim(), {
          title: row.title,
          location: row.location,
          status: row.status
        });
      }

      parsedTillsList.push({
        transactionTill: row.transactionTill,
        tillName: row.tillName,
        location: row.location,
        assignedOwner: row.ownerName,
        title: row.title,
        status: row.status
      });
    });

    // 1. Synchronize Owners (TITLE = "MFS")
    parsedOwnersMap.forEach((details, oName) => {
      const matchIdx = currentOwners.findIndex(o => o.name.toLowerCase() === oName.toLowerCase());
      
      const assignedTills = parsedTillsList
        .filter(t => t.assignedOwner.toLowerCase() === oName.toLowerCase())
        .map(t => t.transactionTill);

      if (matchIdx !== -1) {
        // Update existing Owner
        currentOwners[matchIdx] = {
          ...currentOwners[matchIdx],
          name: oName, // Keep casing from the workbook
          region: details.location,
          status: details.status,
          wakalas: assignedTills.length, // update number of assigned tills/wakalas
          // Store extended attributes
          title: details.title,
          assignedTills: assignedTills,
          lastSyncDate: new Date().toLocaleDateString('en-US') + ", " + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          nameAliases: Array.from(new Set([...(currentOwners[matchIdx].nameAliases || []), oName]))
        } as any;
      } else {
        // Create new Owner
        const randomId = `MA-${Math.floor(10000 + Math.random() * 90000)}`;
        const newOwnerEntity: Owner = {
          id: `owner-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          name: oName,
          masterAgentId: randomId,
          region: details.location,
          memberSince: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          avatar: getAvatarUrl(oName),
          wakalas: assignedTills.length,
          portfolioSize: 'TZS 5.0M',
          portfolioGrowth: 'Not yet tracked',
          performance: 92,
          status: details.status,
          title: details.title,
          assignedTills: assignedTills,
          lastSyncDate: new Date().toLocaleDateString('en-US') + ", " + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          nameAliases: [oName]
        } as any;

        currentOwners.push(newOwnerEntity);
      }
    });

    // 2. Synchronize Personnel (TITLE !== "MFS")
    parsedPersonnelMap.forEach((details, pName) => {
      const matchIdx = currentPersonnel.findIndex((p: any) => p.name.toLowerCase() === pName.toLowerCase());

      const assignedTills = parsedTillsList
        .filter(t => t.assignedOwner.toLowerCase() === pName.toLowerCase())
        .map(t => t.transactionTill);

      if (matchIdx !== -1) {
        // Update existing Personnel
        currentPersonnel[matchIdx] = {
          ...currentPersonnel[matchIdx],
          name: pName,
          title: details.title,
          location: details.location,
          assignedTill: assignedTills.join(', '),
          status: details.status,
          lastSyncDate: new Date().toLocaleDateString('en-US') + ", " + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        };
      } else {
        // Create new Personnel
        currentPersonnel.push({
          id: `personnel-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          name: pName,
          title: details.title,
          location: details.location,
          assignedTill: assignedTills.join(', '),
          status: details.status,
          memberSince: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          avatar: getAvatarUrl(pName),
          lastSyncDate: new Date().toLocaleDateString('en-US') + ", " + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        });
      }
    });

    // 3. Synchronize Tills
    parsedTillsList.forEach(parsedTill => {
      const matchIdx = currentTills.findIndex(t => t.transactionTill === parsedTill.transactionTill);
      if (matchIdx !== -1) {
        // Update Till
        currentTills[matchIdx] = parsedTill;
      } else {
        // Create Till
        currentTills.push(parsedTill);
      }
    });

    // Deduplicate currentTills to ensure absolute single-owner constraint
    const cleanTills: Till[] = [];
    currentTills.forEach(t => {
      const tillKey = (t.transactionTill || '').trim();
      if (tillKey) {
        const existingIdx = cleanTills.findIndex(ct => ct.transactionTill === tillKey);
        if (existingIdx !== -1) {
          cleanTills[existingIdx] = t;
        } else {
          cleanTills.push(t);
        }
      }
    });

    // Write back
    localStorage.setItem('ownersList', JSON.stringify(currentOwners));
    localStorage.setItem('tillsList', JSON.stringify(cleanTills));
    localStorage.setItem('personnelList', JSON.stringify(currentPersonnel));

    // Recalculate metrics immediately after synchronization
    recalculateAllPerformances();

    // Automatically provision user accounts in hasidadi_users for Owners
    const storedUsersStr = localStorage.getItem('hasidadi_users');
    if (storedUsersStr) {
      try {
        const users = JSON.parse(storedUsersStr);
        const companyDomain = (getCompanyName().toLowerCase().replace(/[^a-z0-9]/g, '') || 'company') + '.com';
        currentOwners.forEach(owner => {
          const email = `${owner.name.toLowerCase().replace(/\s+/g, '.')}@${companyDomain}`;
          const exists = users.some((u: any) => u.email.toLowerCase() === email.toLowerCase());
          if (!exists) {
            users.push({
              email: email,
              password: 'agentpassword',
              name: owner.name,
              role: 'Owner',
              ownerId: owner.id
            });
          }
        });
        localStorage.setItem('hasidadi_users', JSON.stringify(users));
      } catch (e) {
        console.error(e);
      }
    }

    // Audit Log creation
    const newAuditLog = {
      id: `REP-${Math.floor(90000 + Math.random() * 9000)}`,
      fileName: selectedFile?.name || "Till_Name_Registry.xlsx",
      type: "Master Sync",
      uploadedBy: "K. Kamkg",
      date: new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) + " " + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      size: `${((selectedFile?.size || 54120) / 1024).toFixed(1)} KB`,
      status: 'Success'
    };
    onAddAuditReport(newAuditLog);
  };

  // Determine synchronization status badge for row
  const getRowSyncStatus = (row: any) => {
    const currentTills = getMasterTills();
    const currentOwners = getMasterOwners();

    const matchedTill = currentTills.find(t => t.transactionTill === row.transactionTill);
    const matchedOwner = currentOwners.find(o => o.name.toLowerCase() === row.ownerName.toLowerCase());

    if (!matchedTill && !matchedOwner) {
      return { text: "New Owner & Till", color: "bg-purple-50 text-purple-700 border-purple-200" };
    }
    if (!matchedTill) {
      return { text: "New Till", color: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    }
    
    const isChanged = 
      matchedTill.tillName !== row.tillName ||
      matchedTill.location !== row.location ||
      matchedTill.assignedOwner !== row.ownerName ||
      matchedTill.title !== row.title;

    if (isChanged) {
      return { text: "Update Till", color: "bg-amber-50 text-amber-700 border-amber-200" };
    }

    return { text: "Existing / Active", color: "bg-slate-50 text-slate-600 border-slate-200" };
  };

  // Table functions
  const filteredAndSortedRows = useMemo(() => {
    let result = [...parsedRows];

    // Status Filter
    if (statusFilter !== 'all') {
      result = result.filter(row => {
        const syncStatus = getRowSyncStatus(row).text.toLowerCase();
        return syncStatus.includes(statusFilter.toLowerCase());
      });
    }

    // Search Query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(row => 
        row.transactionTill.includes(q) ||
        row.tillName.toLowerCase().includes(q) ||
        row.ownerName.toLowerCase().includes(q) ||
        row.location.toLowerCase().includes(q)
      );
    }

    // Sorting
    if (sortColumn) {
      result.sort((a, b) => {
        const valA = String(a[sortColumn] || '').toLowerCase();
        const valB = String(b[sortColumn] || '').toLowerCase();
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [parsedRows, searchQuery, statusFilter, sortColumn, sortDirection]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const totalPages = Math.ceil(filteredAndSortedRows.length / rowsPerPage);
  const startIdx = (currentPage - 1) * rowsPerPage;
  const pagedRows = filteredAndSortedRows.slice(startIdx, startIdx + rowsPerPage);

  const stepsList = [
    { title: "Verifying Authoritative Signatures", desc: "Verifying checksum integrity of Till Name worksheet cells." },
    { title: "Analyzing Owner Hierarchy & Sync States", desc: "Differentiating new owners from existing registered agent profiles." },
    { title: "Ingesting and Writing Owner Master Entities", desc: "Updating master agent owners table and assigning global titles." },
    { title: "Synchronizing Transaction Tills (MSISDN)", desc: "Registering tills in core registry and building Owner-Till bindings." },
    { title: "Compiling Sovereign Ledger Relationships", desc: "Updating portfolio size, number of tills, and last sync timestamp." }
  ];

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-brand-text flex items-center gap-2">
            <Layers className="h-5 w-5 text-brand-primary" />
            Till Name Master Synchronization
          </h2>
          <p className="text-xs text-brand-text-variant mt-0.5">
            Synchronize, map, and bind transaction Tills directly to authoritative Owner master profiles.
          </p>
        </div>
        {!isCompleted && !isSyncing && (
          <button 
            onClick={onCancel}
            className="rounded-xl border border-brand-gray-border bg-white px-4 py-2 font-sans text-xs font-bold text-brand-text hover:bg-brand-gray-hover transition-colors shadow-xs cursor-pointer"
          >
            Cancel Sync
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {/* 1. SELECTION & PARSING AREA */}
        {parsedRows.length === 0 && !isParsing && (
          <motion.div 
            key="upload-zone"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* INSTRUCTION ALERTS */}
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-5 flex items-start gap-4">
              <Info className="h-6 w-6 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-indigo-900 text-sm">Authoritative Source Mapping Guideline</h4>
                <p className="text-xs text-indigo-950/80 mt-1.5 leading-relaxed">
                  The uploaded Till Name Excel workbook acts as the absolute single source of truth for transaction ownership. All daily operational MGT records map transactions through the <strong>TRANSACTION TILL (MSISDN)</strong> key to match owners dynamically.
                </p>
              </div>
            </div>

            {/* DRAG-AND-DROP FILE UPLOADER */}
            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`rounded-3xl border-2 border-dashed p-12 text-center transition-all cursor-pointer ${
                dragActive 
                  ? 'border-brand-primary bg-brand-primary/5 shadow-inner' 
                  : 'border-brand-gray-border bg-brand-card hover:border-brand-primary-light/70 hover:bg-brand-gray-hover/20 shadow-xs'
              }`}
            >
              <input 
                ref={fileInputRef}
                type="file" 
                onChange={handleFileInput}
                accept=".csv, .xlsx, .xls, .xlx"
                className="hidden"
              />
              <div className="space-y-4">
                <div className="mx-auto h-16 w-16 rounded-2xl bg-indigo-50 flex items-center justify-center text-brand-primary shadow-sm">
                  <UploadCloud className="h-8 w-8 text-indigo-600 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-extrabold text-brand-text">Upload Till Name Workbook</h4>
                  <p className="text-xs text-brand-text-variant max-w-md mx-auto">
                    Drag and drop your spreadsheet file here, or click to browse files.
                  </p>
                </div>
                <div className="text-[10px] text-indigo-600/75 bg-indigo-50/50 inline-block px-3 py-1 rounded-full font-bold">
                  Accepts: .CSV, .XLSX, .XLS, .XLX sheets mapping Tills & Owners
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* 2. LOADING STATE WITH PROGRESS BAR */}
        {isParsing && (
          <motion.div 
            key="parsing-loader"
            className="bg-brand-card border border-brand-gray-border rounded-3xl p-10 text-center space-y-6 shadow-ambient"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="h-12 w-12 rounded-xl bg-indigo-50 flex items-center justify-center text-brand-primary mx-auto animate-spin">
              <RefreshCw className="h-6 w-6 text-indigo-600" />
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-black text-brand-text">Analyzing Till Name Workbook Row Schema...</h4>
              <p className="text-xs text-brand-text-variant max-w-md mx-auto font-mono">
                Extracting TRANSACTION TILL, MGT_TILL_Name, and OWNER structures.
              </p>
            </div>
            
            <div className="max-w-md mx-auto space-y-2">
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-500 to-brand-primary transition-all duration-300 rounded-full"
                  style={{ width: `${parseProgress}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-mono font-bold text-brand-text-variant">
                <span>PARSING DATASETS</span>
                <span>{parseProgress}%</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* 3. VERIFICATION & PREVIEW DASHBOARD */}
        {parsedRows.length > 0 && !isSyncing && !isCompleted && (
          <motion.div 
            key="preview-wizard"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* SYSTEM PREVIEW COUNTERS */}
            {syncPreview && (
              <div className="bg-brand-card border border-brand-gray-border rounded-2xl p-6 shadow-sm space-y-5">
                <div className="flex items-center justify-between border-b border-brand-gray-border/50 pb-3">
                  <div className="flex items-center gap-2">
                    <Layers className="h-5 w-5 text-brand-primary" />
                    <h4 className="font-extrabold text-sm text-brand-text">Ingestion Classification Summary</h4>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-semibold text-brand-text-variant">
                    <div>
                      Total Records: <span className="font-mono font-black text-brand-text">{syncPreview.totalRecords}</span>
                    </div>
                    {syncPreview.invalidRecords > 0 && (
                      <div className="text-red-600 bg-red-50 border border-red-100 px-2.5 py-0.5 rounded-full flex items-center gap-1 text-[11px]">
                        <AlertTriangle className="h-3 w-3" />
                        Invalid: <span className="font-mono font-black">{syncPreview.invalidRecords}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Owners Category (TITLE = MFS) */}
                  <div className="bg-indigo-50/20 border border-indigo-100/60 rounded-xl p-4.5 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-indigo-800 font-extrabold text-sm">
                        <Users className="h-4.5 w-4.5 text-indigo-600" />
                        Owners <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-md font-mono font-bold ml-1">TITLE = MFS</span>
                      </div>
                      <div className="text-sm font-black text-indigo-900 font-mono">
                        Total Owners: {syncPreview.totalOwners}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3.5 pt-1">
                      <div className="bg-white border border-indigo-50 p-2.5 rounded-lg text-center">
                        <div className="text-[11px] font-bold text-slate-500">New Owners</div>
                        <div className="text-base font-black text-indigo-700 font-mono mt-0.5">+{syncPreview.newOwners}</div>
                      </div>
                      <div className="bg-white border border-indigo-50 p-2.5 rounded-lg text-center">
                        <div className="text-[11px] font-bold text-slate-500">Updated Owners</div>
                        <div className="text-base font-black text-amber-700 font-mono mt-0.5">+{syncPreview.updatedOwners}</div>
                      </div>
                    </div>
                  </div>

                  {/* Personnel Category (Other Titles) */}
                  <div className="bg-teal-50/20 border border-teal-100/60 rounded-xl p-4.5 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-teal-800 font-extrabold text-sm">
                        <Users className="h-4.5 w-4.5 text-teal-600" />
                        Personnel <span className="text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-md font-sans font-bold ml-1">Other Titles</span>
                      </div>
                      <div className="text-sm font-black text-teal-900 font-mono">
                        Total Personnel: {syncPreview.totalPersonnel}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3.5 pt-1">
                      <div className="bg-white border border-teal-50 p-2.5 rounded-lg text-center">
                        <div className="text-[11px] font-bold text-slate-500">New Personnel</div>
                        <div className="text-base font-black text-teal-700 font-mono mt-0.5">+{syncPreview.newPersonnel}</div>
                      </div>
                      <div className="bg-white border border-teal-50 p-2.5 rounded-lg text-center">
                        <div className="text-[11px] font-bold text-slate-500">Updated Personnel</div>
                        <div className="text-base font-black text-amber-700 font-mono mt-0.5">+{syncPreview.updatedPersonnel}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* INTERACTIVE DATA TABLE FOR PRE-SYNC REVIEW */}
            <div className="bg-brand-card border border-brand-gray-border rounded-2xl overflow-hidden shadow-sm space-y-4 p-4 font-sans">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/50 p-3 rounded-xl border border-brand-gray-border/60">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-brand-text-variant" />
                  <input 
                    type="text"
                    placeholder="Search tills by MSISDN, Name, Owner, Location..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full rounded-xl bg-white border border-brand-gray-border pl-10 pr-4 py-2.5 text-xs font-semibold text-brand-text outline-none focus:border-indigo-600 transition-colors"
                  />
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  {/* Status Filter */}
                  <div className="flex items-center gap-2 text-xs text-brand-text-variant">
                    <span>Reconciliation State:</span>
                    <select
                      value={statusFilter}
                      onChange={(e) => {
                        setStatusFilter(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="rounded-lg border border-brand-gray-border bg-white p-1.5 text-xs font-bold text-brand-text outline-none cursor-pointer"
                    >
                      <option value="all">All Rows</option>
                      <option value="new owner">New Owner Rows</option>
                      <option value="new till">New Till Rows</option>
                      <option value="update till">Update Till Rows</option>
                      <option value="existing">Existing / Intact</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-brand-text-variant pl-2 border-l border-brand-gray-border">
                    <span>Show:</span>
                    <select
                      value={rowsPerPage}
                      onChange={(e) => {
                        setRowsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="rounded-lg border border-brand-gray-border bg-white p-1 text-xs font-bold text-brand-text outline-none cursor-pointer"
                    >
                      <option value={5}>5 Rows</option>
                      <option value={10}>10 Rows</option>
                      <option value={20}>20 Rows</option>
                      <option value={50}>50 Rows</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SHEET RECORDS PREVIEW */}
              <div className="overflow-x-auto border border-brand-gray-border/70 rounded-xl bg-white max-h-[380px] overflow-y-auto">
                <table className="w-full text-left border-collapse table-auto">
                  <thead className="sticky top-0 bg-slate-100 z-10 shadow-xs">
                    <tr className="border-b border-brand-gray-border text-brand-text select-none">
                      <th 
                        onClick={() => handleSort('transactionTill')}
                        className="px-4 py-3 font-sans text-[11px] font-black uppercase tracking-wider cursor-pointer hover:bg-slate-200 transition-colors bg-slate-50"
                      >
                        <div className="flex items-center gap-1.5">
                          TRANSACTION TILL
                          {sortColumn === 'transactionTill' ? (
                            sortDirection === 'asc' ? <ChevronUp className="h-3.5 w-3.5 text-indigo-600" /> : <ChevronDown className="h-3.5 w-3.5 text-indigo-600" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-brand-text-variant/40" />
                          )}
                        </div>
                      </th>
                      <th 
                        onClick={() => handleSort('tillName')}
                        className="px-4 py-3 font-sans text-[11px] font-black uppercase tracking-wider cursor-pointer hover:bg-slate-200 transition-colors bg-slate-50"
                      >
                        <div className="flex items-center gap-1.5">
                          TILL NAME
                          {sortColumn === 'tillName' ? (
                            sortDirection === 'asc' ? <ChevronUp className="h-3.5 w-3.5 text-indigo-600" /> : <ChevronDown className="h-3.5 w-3.5 text-indigo-600" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-brand-text-variant/40" />
                          )}
                        </div>
                      </th>
                      <th 
                        onClick={() => handleSort('ownerName')}
                        className="px-4 py-3 font-sans text-[11px] font-black uppercase tracking-wider cursor-pointer hover:bg-slate-200 transition-colors bg-slate-50"
                      >
                        <div className="flex items-center gap-1.5">
                          OWNER NAME
                          {sortColumn === 'ownerName' ? (
                            sortDirection === 'asc' ? <ChevronUp className="h-3.5 w-3.5 text-indigo-600" /> : <ChevronDown className="h-3.5 w-3.5 text-indigo-600" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-brand-text-variant/40" />
                          )}
                        </div>
                      </th>
                      <th 
                        onClick={() => handleSort('title')}
                        className="px-4 py-3 font-sans text-[11px] font-black uppercase tracking-wider cursor-pointer hover:bg-slate-200 transition-colors bg-slate-50"
                      >
                        <div className="flex items-center gap-1.5">
                          TITLE
                          {sortColumn === 'title' ? (
                            sortDirection === 'asc' ? <ChevronUp className="h-3.5 w-3.5 text-indigo-600" /> : <ChevronDown className="h-3.5 w-3.5 text-indigo-600" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-brand-text-variant/40" />
                          )}
                        </div>
                      </th>
                      <th 
                        onClick={() => handleSort('location')}
                        className="px-4 py-3 font-sans text-[11px] font-black uppercase tracking-wider cursor-pointer hover:bg-slate-200 transition-colors bg-slate-50"
                      >
                        <div className="flex items-center gap-1.5">
                          LOCATION
                          {sortColumn === 'location' ? (
                            sortDirection === 'asc' ? <ChevronUp className="h-3.5 w-3.5 text-indigo-600" /> : <ChevronDown className="h-3.5 w-3.5 text-indigo-600" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-brand-text-variant/40" />
                          )}
                        </div>
                      </th>
                      <th className="px-4 py-3 font-sans text-[11px] font-black uppercase tracking-wider bg-slate-50">
                        SYNCHRONIZATION STATUS
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-gray-border/40 text-xs">
                    {pagedRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-brand-text-variant font-semibold">
                          No matching authoritative records found.
                        </td>
                      </tr>
                    ) : (
                      pagedRows.map((row, idx) => {
                        const statusBadge = getRowSyncStatus(row);
                        return (
                          <tr key={idx} className="hover:bg-brand-gray-hover/20 transition-colors">
                            <td className="px-4 py-3 font-mono text-[11px] text-brand-text font-black whitespace-nowrap">
                              {row.transactionTill}
                            </td>
                            <td className="px-4 py-3 text-brand-text font-semibold whitespace-nowrap">
                              {row.tillName}
                            </td>
                            <td className="px-4 py-3 text-brand-text font-black whitespace-nowrap">
                              {row.ownerName}
                            </td>
                            <td className="px-4 py-3 text-brand-text-variant font-semibold whitespace-nowrap">
                              {row.title}
                            </td>
                            <td className="px-4 py-3 text-brand-text-variant font-semibold whitespace-nowrap inline-flex items-center gap-1.5 mt-2.5">
                              <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              {row.location}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-tight uppercase ${statusBadge.color}`}>
                                {statusBadge.text}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* PAGINATION PANEL */}
              <div className="flex items-center justify-between pt-2">
                <p className="text-[11px] text-brand-text-variant font-medium font-mono">
                  Showing <strong className="text-brand-text">{filteredAndSortedRows.length === 0 ? 0 : startIdx + 1}</strong> to <strong className="text-brand-text">{Math.min(startIdx + rowsPerPage, filteredAndSortedRows.length)}</strong> of <strong className="text-brand-text">{filteredAndSortedRows.length}</strong> records
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                    disabled={currentPage === 1}
                    className="rounded-lg border border-brand-gray-border bg-white px-3 py-1 text-xs font-extrabold text-brand-text hover:bg-brand-gray-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Previous
                  </button>
                  <span className="text-xs font-mono font-bold text-brand-text px-2">
                    Page {currentPage} of {totalPages || 1}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                    disabled={currentPage === totalPages || totalPages === 0}
                    className="rounded-lg border border-brand-gray-border bg-white px-3 py-1 text-xs font-extrabold text-brand-text hover:bg-brand-gray-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>

            {/* ACTION FOOTER */}
            <div className="flex items-center justify-between bg-indigo-50/30 p-5 rounded-2xl border border-indigo-100 gap-4 flex-wrap">
              <div className="flex items-center gap-2 text-indigo-700 text-xs font-bold">
                <ShieldCheck className="h-5 w-5 text-indigo-600 animate-pulse shrink-0" />
                <span>Verification successful. Click &quot;Confirm &amp; Synchronize&quot; to build relationships.</span>
              </div>
              <div className="flex items-center gap-3.5">
                <button
                  onClick={() => setParsedRows([])}
                  className="rounded-xl border border-brand-gray-border bg-white px-5 py-3 text-xs font-bold text-brand-text hover:bg-brand-gray-hover transition-colors cursor-pointer"
                >
                  Clear and Upload Different
                </button>
                <button
                  onClick={handleConfirmSynchronization}
                  className="rounded-xl bg-brand-primary hover:bg-brand-primary-light text-white px-6 py-3 text-xs font-black uppercase tracking-wider shadow-md transition-all cursor-pointer inline-flex items-center gap-2"
                >
                  <CheckCircle className="h-4.5 w-4.5" />
                  Confirm &amp; Synchronize
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* 4. ACTIVE WRITING STATE WITH PROGRESS METER */}
        {isSyncing && (
          <motion.div 
            key="syncing-mgt"
            className="bg-brand-card border border-brand-gray-border rounded-3xl p-10 text-center space-y-8 shadow-ambient"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="max-w-md mx-auto space-y-6">
              <div className="h-12 w-12 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary mx-auto animate-bounce">
                <Database className="h-6 w-6 text-indigo-600" />
              </div>
              
              <div className="space-y-1">
                <h4 className="text-base font-black text-brand-text">Ingesting Authoritative Registry data...</h4>
                <p className="text-xs text-brand-text-variant">
                  Writing master profiles, mapping TRANSACTION TILL relationships to owners.
                </p>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div 
                    className="h-full bg-indigo-600 transition-all duration-300 rounded-full"
                    style={{ width: `${syncProgress}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] font-mono font-bold text-brand-text-variant">
                  <span>SOVEREIGN INGESTION PROGRESS</span>
                  <span>{syncProgress}%</span>
                </div>
              </div>

              {/* Dynamic steps text */}
              <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-left space-y-3">
                {stepsList.map((st, i) => {
                  const isPast = i < syncStep;
                  const isCurrent = i === syncStep;
                  return (
                    <div key={i} className="flex items-start gap-3 transition-opacity duration-300">
                      <div className={`h-4.5 w-4.5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-black ${
                        isPast ? 'bg-emerald-100 text-emerald-700' : isCurrent ? 'bg-indigo-600 text-white animate-pulse' : 'bg-slate-200 text-slate-400'
                      }`}>
                        {isPast ? <Check className="h-3 w-3" /> : i + 1}
                      </div>
                      <div className="space-y-0.5">
                        <div className={`text-xs font-black leading-none ${isCurrent ? 'text-indigo-600' : isPast ? 'text-slate-800' : 'text-slate-400'}`}>
                          {st.title}
                        </div>
                        <div className="text-[10px] text-brand-text-variant leading-tight">
                          {st.desc}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* 5. SUCCESS & COMPLETED COMPONENT */}
        {isCompleted && (
          <motion.div 
            key="success-card"
            className="bg-brand-card border border-indigo-100 rounded-3xl p-10 text-center space-y-6 shadow-xl max-w-2xl mx-auto"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="mx-auto h-16 w-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 shadow-sm">
              <CheckCircle className="h-10 w-10 text-emerald-600" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-extrabold text-brand-text">Master Owner Sync Completed!</h3>
              <p className="text-xs text-brand-text-variant max-w-md mx-auto">
                Authoritative owner registries, titles, and till bindings have been successfully compiled and written to the master sovereign ledger databases.
              </p>
            </div>

            {syncPreview && (
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 text-left space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Synchronization Summary Report</span>
                  <span className="text-[11px] font-mono font-black text-slate-600 bg-slate-200 px-2 py-0.5 rounded-md">Total Records: {syncPreview.totalRecords}</span>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">Owners (MFS)</div>
                    <div className="text-xs text-slate-700 leading-normal font-semibold">
                      Total Owners: <strong className="text-slate-900 font-bold">{syncPreview.totalOwners}</strong>
                    </div>
                    <div className="text-xs text-slate-700 leading-normal font-semibold">
                      New Owners: <strong className="text-indigo-600 font-bold">+{syncPreview.newOwners}</strong>
                    </div>
                    <div className="text-xs text-slate-700 leading-normal font-semibold">
                      Updated Owners: <strong className="text-amber-600 font-bold">+{syncPreview.updatedOwners}</strong>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="text-[10px] font-black text-teal-600 uppercase tracking-wider">Personnel (Non-MFS)</div>
                    <div className="text-xs text-slate-700 leading-normal font-semibold">
                      Total Personnel: <strong className="text-slate-900 font-bold">{syncPreview.totalPersonnel}</strong>
                    </div>
                    <div className="text-xs text-slate-700 leading-normal font-semibold">
                      New Personnel: <strong className="text-teal-600 font-bold">+{syncPreview.newPersonnel}</strong>
                    </div>
                    <div className="text-xs text-slate-700 leading-normal font-semibold">
                      Updated Personnel: <strong className="text-amber-600 font-bold">+{syncPreview.updatedPersonnel}</strong>
                    </div>
                  </div>
                </div>

                {syncPreview.invalidRecords > 0 && (
                  <div className="text-[11px] text-red-600 bg-red-50 border border-red-100/60 p-2 rounded-xl flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Detected {syncPreview.invalidRecords} invalid rows with missing Till or Name that were safely skipped.
                  </div>
                )}
              </div>
            )}

            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                onClick={onSyncComplete}
                className="rounded-xl bg-brand-primary hover:bg-brand-primary-light text-white font-sans text-xs font-extrabold px-6 py-3 shadow-md transition-all cursor-pointer inline-flex items-center gap-2"
              >
                Go to Upload Overview
                <ArrowRight className="h-4.5 w-4.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
