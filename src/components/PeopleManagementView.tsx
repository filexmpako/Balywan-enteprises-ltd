import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { ViewType, Owner, Personnel, BaseWakala, SATill, AuditReport } from '../types';
import { buildOwnerWakalaMap } from '../utils/wakalaMapping';
import { formatDate, formatDateTime, formatMonthYear } from '../utils/dateFormat';
import { invalidateClassificationCache } from '../utils/classificationCache';
import {
  listUserAccounts,
  createUserAccount,
  resetUserPassword,
  deleteUserAccount,
} from '../lib/accounts.functions';
import { ownersList as initialOwners } from '../data';
import { useAuth } from './AuthContext';
import { useCompany } from './CompanyContext';
import { getAvatarUrl } from '../utils/avatar';
import OwnerAvatar from './OwnerAvatar';
import { getDailyServicingRows } from '../utils/indexedDB';
import { 
  Users, 
  Search, 
  MapPin, 
  Activity, 
  UserPlus, 
  Filter, 
  Eye, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  X,
  Plus,
  TrendingUp,
  Award,
  Settings as SettingsIcon,
  ShieldAlert,
  Sliders,
  History,
  FileText,
  UserCheck,
  ChevronRight,
  TrendingDown,
  Layers,
  ArrowRight,
  UserMinus,
  CheckCircle2,
  Trash2,
  Lock,
  LockOpen,
  Copy,
  Check,
  Key,
  User,
  Building2,
  UploadCloud,
  ShieldCheck,
  RotateCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import PageHeaderBanner from './PageHeaderBanner';
import { assignTillsToPerson, recalculateAllPerformances } from '../utils/mappingEngine';
import { normalizeMsisdn } from '../utils/msisdn';
import OwnerDetailsView from './OwnerDetailsView';
import DeleteOwnerModal from './DeleteOwnerModal';

// Default Role Mappings for Title classification
const DEFAULT_ROLE_MAPPINGS = {
  'MFS': 'Owner',
  'Branch Manager': 'Personnel',
  'Supervisor': 'Personnel',
  'Cashier': 'Personnel',
  'Sales Specialist': 'Personnel',
  'Agent Assistant': 'Personnel'
};

interface PeopleManagementViewProps {
  onNavigate: (view: ViewType) => void;
  onSelectOwner: (name: string) => void;
  defaultSubmodule?: 'owners' | 'personnel';
  onAddAuditReport?: (report: AuditReport) => void;
}

export default function PeopleManagementView({
  onNavigate,
  onSelectOwner,
  defaultSubmodule = 'owners',
  onAddAuditReport
}: PeopleManagementViewProps) {
  const { companyName } = useCompany();
  // --- SUBMODULE STATE ---
  const [activeTab, setActiveTab] = useState<'owners' | 'personnel' | 'users' | 'satills'>((defaultSubmodule as string) === 'users' ? 'users' : (defaultSubmodule as any || 'owners'));

  // --- SA TILL REGISTRY STATE (parent-account MSISDN mappings used to keep internal float
  // movements out of served volume — see src/utils/classification.ts) ---
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
  const [saTillDragActive, setSaTillDragActive] = useState(false);
  const [saTillSelectedFile, setSaTillSelectedFile] = useState<{ name: string; size: number } | null>(null);
  const [saTillUploading, setSaTillUploading] = useState(false);
  const [saTillUploadProgress, setSaTillUploadProgress] = useState(0);
  const saTillFileInputRef = useRef<HTMLInputElement>(null);

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

      const currentDate = formatDate(new Date());

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
    const nowStr = formatDateTime(new Date());

    localStorage.setItem('saTillRegistry', JSON.stringify(updatedArray));
    localStorage.setItem('saTillRegistry_lastUpdated', nowStr);
    invalidateClassificationCache();

    setSaTills(updatedArray);
    setSaTillLastUpdated(nowStr);
    setStagedSaTills(null);
    setSaTillSelectedFile(null);

    if (onAddAuditReport) {
      onAddAuditReport({
        id: `sa_till_${Date.now()}`,
        fileName: 'SA_Till_Registry.xlsx',
        type: 'SA Till Registry',
        uploadedBy: currentUser?.name || 'System Admin',
        date: nowStr,
        size: `${stagedSaTills.length} records`,
        status: 'Success',
      });
    }
  };

  const handleDeleteSaTill = (msisdnToDelete: string) => {
    const normDelete = normalizeMsisdn(msisdnToDelete);
    const filtered = saTills.filter(t => normalizeMsisdn(t.tillMsisdn) !== normDelete);
    const nowStr = formatDateTime(new Date());

    localStorage.setItem('saTillRegistry', JSON.stringify(filtered));
    localStorage.setItem('saTillRegistry_lastUpdated', nowStr);
    invalidateClassificationCache();
    setSaTills(filtered);
    setSaTillLastUpdated(nowStr);
  };

  const processSaTillFile = (file: File) => {
    setSaTillSelectedFile({ name: file.name, size: file.size });
    setSaTillUploading(true);
    setSaTillUploadProgress(0);

    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      let progress = 0;
      const interval = setInterval(() => {
        progress += 25;
        setSaTillUploadProgress(progress);
        if (progress >= 100) {
          clearInterval(interval);
          setSaTillUploading(false);
          parseSaTillFile(data);
        }
      }, 80);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSaTillDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setSaTillDragActive(true);
    } else if (e.type === "dragleave") {
      setSaTillDragActive(false);
    }
  };

  const handleSaTillDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSaTillDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSaTillFile(e.dataTransfer.files[0]);
    }
  };

  const handleSaTillFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processSaTillFile(e.target.files[0]);
    }
  };

  // --- USER ACCESS MANAGEMENT STATE ---
  const { user: currentUser } = useAuth();
  const isAdmin = !currentUser || currentUser.role === 'Admin';

  const [deleteOwnerTarget, setDeleteOwnerTarget] = useState<{ id: string; name: string } | null>(null);
  const [deletionToast, setDeletionToast] = useState<string | null>(null);

  const handleDeleteOwnerSuccess = (toastMsg: string) => {
    if (deleteOwnerTarget) {
      setOwners(prev => prev.filter(o => o.id !== deleteOwnerTarget.id));
      setUsersList(prev => prev.filter(u => u.ownerId !== deleteOwnerTarget.id));
    }
    setDeletionToast(toastMsg);
    if (selectedProfile && selectedProfile.record?.id === deleteOwnerTarget?.id) {
      setSelectedProfile(null);
    }
    window.dispatchEvent(new Event('people-reclassified'));
    setTimeout(() => setDeletionToast(null), 5000);
  };
  // Real accounts, read from Supabase Auth through admin-only server functions.
  const [usersList, setUsersList] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userActionBusy, setUserActionBusy] = useState(false);

  const reloadUsers = React.useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const res = await listUserAccounts();
      setUsersList(
        (res?.users ?? []).map((u) => ({
          id: u.userId,
          userId: u.userId,
          username: u.username,
          email: u.email,
          name: u.name,
          role: u.role,
          ownerId: u.ownerId ?? undefined,
          personnelId: u.personnelId ?? undefined,
          lastSignInAt: u.lastSignInAt,
        })),
      );
    } catch (e: any) {
      setUsersError(e?.message || 'Could not load accounts.');
      setUsersList([]);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // Modal / Form States
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState<any | null>(null);
  const [showDeleteUserConfirmModal, setShowDeleteUserConfirmModal] = useState<any | null>(null);

  const [createUserForm, setCreateUserForm] = useState({
    selectedRole: 'Owner' as 'Owner' | 'FloatManager',
    selectedEntityId: '',
    selectedEntityType: 'Owner' as 'Owner' | 'Personnel',
    username: '',
    email: '',
    password: ''
  });

  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetSuccessData, setResetSuccessData] = useState<{ user: any; password: string } | null>(null);
  const [copiedResetPassword, setCopiedResetPassword] = useState(false);

  useEffect(() => {
    if (activeTab === 'users') void reloadUsers();
  }, [activeTab, reloadUsers]);

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { selectedRole, selectedEntityId, username, email, password } = createUserForm;
    if (!username.trim() || !email.trim()) return;
    if (selectedRole === 'Owner' && !selectedEntityId) return; // Owner accounts must link to a real Owner

    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    if (usersList.some(u => u.username && u.username.toLowerCase().trim() === cleanUsername)) {
      alert("A user with this username already exists. Please choose a unique username.");
      return;
    }

    if (usersList.some(u => u.email && u.email.toLowerCase().trim() === cleanEmail)) {
      alert("A user with this email address already exists.");
      return;
    }

    let linkedName = 'System Account';
    let ownerId: string | undefined;
    let personnelId: string | undefined;

    if (selectedRole === 'Owner') {
      const entity = entityOptions.find(opt => opt.id === selectedEntityId && opt.type === 'Owner');
      if (!entity) return;
      linkedName = entity.name;
      ownerId = selectedEntityId;
    } else if (selectedEntityId) {
      const entity = entityOptions.find(opt => opt.id === selectedEntityId && opt.type === 'Personnel');
      if (entity) {
        linkedName = entity.name;
        personnelId = selectedEntityId;
      }
    }

    const displayName =
      selectedRole === 'Owner' ? linkedName : (linkedName !== 'System Account' ? linkedName : cleanUsername);

    setUserActionBusy(true);
    try {
      const created = await createUserAccount({
        data: {
          email: cleanEmail,
          username: cleanUsername,
          name: displayName,
          role: selectedRole,
          password: password.trim() || undefined,
          ownerId: ownerId ?? null,
          personnelId: personnelId ?? null,
        },
      });

      addAuditLog('User Created', currentUser?.name || 'Admin', 'N/A', selectedRole, linkedName, `Provisioned ${selectedRole} login credentials (Username: ${cleanUsername})`);

      setShowCreateUserModal(false);
      setCreateUserForm({ selectedRole: 'Owner', selectedEntityId: '', selectedEntityType: 'Owner', username: '', email: '', password: '' });
      await reloadUsers();

      // Show the password exactly once so the admin can hand it over.
      const createdRow = {
        userId: created.userId,
        name: displayName,
        username: cleanUsername,
        email: cleanEmail,
        role: selectedRole,
      };
      setShowResetPasswordModal(createdRow);
      setResetSuccessData({ user: createdRow, password: created.password });
      setCopiedResetPassword(false);
    } catch (err: any) {
      alert(`Could not create the account: ${err?.message || err}`);
    } finally {
      setUserActionBusy(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showResetPasswordModal) return;

    const targetUser = showResetPasswordModal;
    setUserActionBusy(true);
    try {
      const res = await resetUserPassword({
        data: { userId: targetUser.userId, password: resetPasswordValue.trim() || undefined },
      });

      addAuditLog('Password Reset', currentUser?.name || 'Admin', 'N/A', targetUser.role, targetUser.name, `Administrative password reset executed for username ${targetUser.username || targetUser.email}`);

      setResetSuccessData({ user: targetUser, password: res.password });
      setCopiedResetPassword(false);
    } catch (err: any) {
      alert(`Could not reset the password: ${err?.message || err}`);
    } finally {
      setUserActionBusy(false);
    }
  };

  const handleDeleteUserConfirm = async () => {
    if (!showDeleteUserConfirmModal) return;

    if (currentUser && showDeleteUserConfirmModal.email?.toLowerCase() === currentUser.email.toLowerCase()) {
      alert("Accidental lockout prevention: You cannot delete your own active administrator account.");
      return;
    }

    setUserActionBusy(true);
    try {
      await deleteUserAccount({ data: { userId: showDeleteUserConfirmModal.userId } });
      addAuditLog('User Deleted', currentUser?.name || 'Admin', 'N/A', showDeleteUserConfirmModal.role, showDeleteUserConfirmModal.name, `De-provisioned login credentials`);
      setShowDeleteUserConfirmModal(null);
      await reloadUsers();
    } catch (err: any) {
      alert(`Could not delete the account: ${err?.message || err}`);
    } finally {
      setUserActionBusy(false);
    }
  };


  // --- EDIT MODAL STATES ---
  const [showEditOwnerModal, setShowEditOwnerModal] = useState(false);
  const [editingOwner, setEditingOwner] = useState<Owner | null>(null);
  const [editOwnerForm, setEditOwnerForm] = useState({
    name: '',
    region: 'Dar es Salaam',
    wakalas: 3,
    portfolioSize: 'TZS 5.0M',
    portfolioGrowth: 'Not yet tracked',
    performance: 0, // derived live from KPI1 achievement; no seeded score
    status: 'Active' as Owner['status'],
    title: 'MFS',
    assignedTillsStr: ''
  });

  const [showEditPersonnelModal, setShowEditPersonnelModal] = useState(false);
  const [editingPersonnel, setEditingPersonnel] = useState<Personnel | null>(null);
  const [editPersonnelForm, setEditPersonnelForm] = useState({
    name: '',
    title: 'Branch Manager',
    location: 'Dar es Salaam',
    status: 'Active' as Personnel['status']
  });

  const startEditOwner = (owner: Owner) => {
    setEditingOwner(owner);
    setEditOwnerForm({
      name: owner.name,
      region: owner.region,
      wakalas: owner.wakalas || 0,
      portfolioSize: owner.portfolioSize || 'TZS 5.0M',
      portfolioGrowth: owner.portfolioGrowth || 'Not yet tracked',
      performance: owner.performance || 88,
      status: owner.status,
      title: owner.title || 'MFS',
      assignedTillsStr: (owner as any).assignedTills ? (owner as any).assignedTills.join(', ') : ''
    });
    setShowEditOwnerModal(true);
  };

  const startEditPersonnel = (person: Personnel) => {
    setEditingPersonnel(person);
    setEditPersonnelForm({
      name: person.name,
      title: person.title,
      location: person.location,
      status: person.status
    });
    setShowEditPersonnelModal(true);
  };

  const handleEditOwnerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOwner) return;

    const tillsArr = editOwnerForm.assignedTillsStr
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    const updated = owners.map(o => {
      if (o.id === editingOwner.id) {
        return {
          ...o,
          name: editOwnerForm.name,
          region: editOwnerForm.region,
          title: editOwnerForm.title,
          status: editOwnerForm.status,
          wakalas: tillsArr.length || Number(editOwnerForm.wakalas),
          portfolioGrowth: editOwnerForm.portfolioGrowth,
          performance: Number(editOwnerForm.performance),
          assignedTills: tillsArr,
          lastSyncDate: formatDateTime(new Date())
        } as any;
      }
      return o;
    });

    setOwners(updated);
    localStorage.setItem('ownersList', JSON.stringify(updated));

    // Map the new tills in tillsList
    if (editOwnerForm.assignedTillsStr) {
      assignTillsToPerson(editOwnerForm.assignedTillsStr, editOwnerForm.name, editOwnerForm.title, editOwnerForm.region);
    }

    recalculateAllPerformances();

    setShowEditOwnerModal(false);
    setEditingOwner(null);

    addAuditLog('Registry Update', (currentUser?.name || 'System Admin'), 'Owner', 'Owner', editOwnerForm.name, 'Manual Administrator Registry Edit');

    // Trigger update of duplicates and KPIs across tabs
    window.dispatchEvent(new Event('people-reclassified'));
  };

  const handleEditPersonnelSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPersonnel) return;

    const updated = personnel.map(p => {
      if (p.id === editingPersonnel.id) {
        return {
          ...p,
          name: editPersonnelForm.name,
          title: editPersonnelForm.title,
          location: editPersonnelForm.location,
          status: editPersonnelForm.status,
          lastSyncDate: formatDateTime(new Date())
        };
      }
      return p;
    });

    setPersonnel(updated);
    localStorage.setItem('personnelList', JSON.stringify(updated));

    setShowEditPersonnelModal(false);
    setEditingPersonnel(null);

    addAuditLog('Registry Update', (currentUser?.name || 'System Admin'), 'Personnel', 'Personnel', editPersonnelForm.name, 'Manual Administrator Registry Edit');

    // Trigger update of duplicates and KPIs across tabs
    window.dispatchEvent(new Event('people-reclassified'));
  };

  // --- COMPILATION OF RAW DATA ---
  const [owners, setOwners] = useState<Owner[]>(() => {
    const saved = localStorage.getItem('ownersList');
    if (saved) {
      try { return JSON.parse(saved); } catch(e) {}
    }
    return initialOwners;
  });

  const [personnel, setPersonnel] = useState<Personnel[]>(() => {
    const saved = localStorage.getItem('personnelList');
    if (saved) {
      try { return JSON.parse(saved); } catch(e) {}
    }
    return [];
  });

  // Keep lists synced back to localStorage on change
  useEffect(() => {
    localStorage.setItem('ownersList', JSON.stringify(owners));
  }, [owners]);

  useEffect(() => {
    localStorage.setItem('personnelList', JSON.stringify(personnel));
  }, [personnel]);

  // Create dropdown options
  const entityOptions = useMemo(() => {
    const opts: { id: string; name: string; type: 'Owner' | 'Personnel' }[] = [];
    owners.forEach(o => {
      opts.push({ id: o.id, name: o.name, type: 'Owner' });
    });
    personnel.forEach(p => {
      opts.push({ id: p.id || p._id || '', name: p.name, type: 'Personnel' });
    });
    return opts;
  }, [owners, personnel]);

  // --- ROLE CLASSIFICATION STATE ---
  const [roleMappings, setRoleMappings] = useState<Record<string, 'Owner' | 'Personnel'>>(() => {
    const saved = localStorage.getItem('roleMappings');
    if (saved) {
      try { return JSON.parse(saved); } catch(e) {}
    }
    return DEFAULT_ROLE_MAPPINGS;
  });

  const [editedMappings, setEditedMappings] = useState<Record<string, 'Owner' | 'Personnel'>>({ ...roleMappings });

  // Update edited mappings when roleMappings updates
  useEffect(() => {
    setEditedMappings({ ...roleMappings });
  }, [roleMappings]);

  // Check if classification has unapplied changes
  const hasUnappliedMappings = useMemo(() => {
    return JSON.stringify(roleMappings) !== JSON.stringify(editedMappings);
  }, [roleMappings, editedMappings]);

  // --- AUDIT HISTORY LOGS STATE ---
  const [auditLogs, setAuditLogs] = useState<any[]>(() => {
    const saved = localStorage.getItem('roleAuditLogs');
    if (saved) {
      try { return JSON.parse(saved); } catch(e) {}
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('roleAuditLogs', JSON.stringify(auditLogs));
  }, [auditLogs]);

  // Add an audit log helper
  const addAuditLog = (eventType: string, administrator: string, oldRole: string, newRole: string, affectedUser: string, sourceFile: string) => {
    const newLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      eventType,
      date: formatDateTime(new Date()),
      administrator,
      oldRole,
      newRole,
      affectedUser,
      sourceFile
    };
    setAuditLogs(prev => [newLog, ...prev]);
  };

  // --- RECLASSIFICATION / UPDATE CLASSIFICATION PREVIEW STATE ---
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [affectedPersonnelPreview, setAffectedPersonnelPreview] = useState<any[]>([]);

  // Calculate affected users if we apply the edited mappings
  const calculateAffectedPersonnel = () => {
    // Collect all people presently in owners and personnel lists
    const allPeople: { name: string; title: string; currentRole: 'Owner' | 'Personnel'; originalObj: any }[] = [];
    
    owners.forEach(o => {
      allPeople.push({
        name: o.name,
        title: o.title || 'MFS',
        currentRole: 'Owner',
        originalObj: o
      });
    });

    personnel.forEach(p => {
      allPeople.push({
        name: p.name,
        title: p.title || 'Branch Manager',
        currentRole: 'Personnel',
        originalObj: p
      });
    });

    // Find who will change roles based on editedMappings
    const changed: any[] = [];
    allPeople.forEach(person => {
      const titleClean = person.title.trim();
      // Match key case-insensitively
      const matchedKey = Object.keys(editedMappings).find(k => k.toLowerCase() === titleClean.toLowerCase());
      const targetRole = matchedKey ? editedMappings[matchedKey] : 'Personnel'; // default fallback is Personnel
      
      if (person.currentRole !== targetRole) {
        changed.push({
          name: person.name,
          title: person.title,
          currentRole: person.currentRole,
          targetRole: targetRole,
          originalObj: person.originalObj
        });
      }
    });

    setAffectedPersonnelPreview(changed);
    setShowPreviewModal(true);
  };

  // Commit the reclassification changes
  const applyReclassification = () => {
    let currentOwners = [...owners];
    let currentPersonnel = [...personnel];

    affectedPersonnelPreview.forEach(item => {
      if (item.currentRole === 'Owner' && item.targetRole === 'Personnel') {
        // Move from Owner to Personnel
        currentOwners = currentOwners.filter(o => o.name.toLowerCase() !== item.name.toLowerCase());
        
        // Check if already exists in Personnel list
        const exists = currentPersonnel.some(p => p.name.toLowerCase() === item.name.toLowerCase());
        if (!exists) {
          const tArr = item.originalObj.assignedTills || [];
          currentPersonnel.push({
            id: `personnel-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
            name: item.name,
            title: item.title,
            location: item.originalObj.region || 'Dar es Salaam',
            assignedTill: Array.isArray(tArr) ? tArr.join(', ') : String(tArr),
            status: item.originalObj.status || 'Active',
            memberSince: item.originalObj.memberSince || formatMonthYear(new Date()),
            avatar: item.originalObj.avatar,
            lastSyncDate: formatDateTime(new Date())
          });
        }

        // Add audit history log
        addAuditLog(
          'Role Change',
          (currentUser?.name || 'System Admin'),
          'Owner',
          'Personnel',
          item.name,
          'Sovereign Reclassification Engine'
        );
      } else if (item.currentRole === 'Personnel' && item.targetRole === 'Owner') {
        // Move from Personnel to Owner
        currentPersonnel = currentPersonnel.filter(p => p.name.toLowerCase() !== item.name.toLowerCase());

        // Check if already exists in Owner list
        const exists = currentOwners.some(o => o.name.toLowerCase() === item.name.toLowerCase());
        if (!exists) {
          const randomId = `MA-${Math.floor(10000 + Math.random() * 90000)}`;
          const tillStr = item.originalObj.assignedTill || '';
          const tillsArr = tillStr.split(',').map((t: string) => t.trim()).filter(Boolean);

          currentOwners.push({
            id: `owner-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
            name: item.name,
            masterAgentId: randomId,
            region: item.originalObj.location || 'Dar es Salaam',
            memberSince: item.originalObj.memberSince || formatMonthYear(new Date()),
            avatar: item.originalObj.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
            wakalas: tillsArr.length,
            portfolioSize: 'TZS 5.0M',
            portfolioGrowth: 'Not yet tracked',
            performance: 0, // derived live from KPI1 achievement; no seeded score
            status: item.originalObj.status || 'Active',
            title: item.title,
            assignedTills: tillsArr,
            lastSyncDate: formatDateTime(new Date())
          } as any);
        }

        // Add audit history log
        addAuditLog(
          'Role Change',
          (currentUser?.name || 'System Admin'),
          'Personnel',
          'Owner',
          item.name,
          'Sovereign Reclassification Engine'
        );
      }
    });

    // Save final lists and mappings
    setOwners(currentOwners);
    setPersonnel(currentPersonnel);
    localStorage.setItem('ownersList', JSON.stringify(currentOwners));
    localStorage.setItem('personnelList', JSON.stringify(currentPersonnel));
    setRoleMappings({ ...editedMappings });
    localStorage.setItem('roleMappings', JSON.stringify(editedMappings));

    affectedPersonnelPreview.forEach(item => {
      if (item.currentRole === 'Owner' && item.targetRole === 'Personnel') {
        const tArr = item.originalObj.assignedTills || [];
        const tillStr = Array.isArray(tArr) ? tArr.join(', ') : String(tArr);
        assignTillsToPerson(tillStr, item.name, item.title, item.originalObj.region || 'Dar es Salaam');
      } else if (item.currentRole === 'Personnel' && item.targetRole === 'Owner') {
        const tillStr = item.originalObj.assignedTill || '';
        assignTillsToPerson(tillStr, item.name, item.title, item.originalObj.location || 'Dar es Salaam');
      }
    });

    recalculateAllPerformances();

    setShowPreviewModal(false);
    
    // Dispatch custom event to notify other components (KPI engines, etc.) to refresh
    window.dispatchEvent(new Event('people-reclassified'));
  };

  // --- FILTERS & LIST QUERY STATES ---
  // Owners lists filters
  const [ownerSearch, setOwnerSearch] = useState('');
  const [ownerRegion, setOwnerRegion] = useState('All');
  const [ownerStatus, setOwnerStatus] = useState('All');
  const [ownerPerf, setOwnerPerf] = useState('All');

  // Personnel lists filters
  const [personSearch, setPersonSearch] = useState('');
  const [personLocation, setPersonLocation] = useState('All');
  const [personStatus, setPersonStatus] = useState('All');
  const [personTitle, setPersonTitle] = useState('All');

  // Dynamic values derived from roleMappings
  const mappedOwners = useMemo(() => {
    return owners.filter(o => {
      const titleClean = (o.title || '').trim();
      const matchedKey = Object.keys(roleMappings).find(k => k.toLowerCase() === titleClean.toLowerCase());
      const role = matchedKey ? roleMappings[matchedKey] : 'Personnel';
      return role === 'Owner';
    });
  }, [owners, roleMappings]);

  const mappedPersonnel = useMemo(() => {
    return personnel.filter(p => {
      const titleClean = (p.title || '').trim();
      const matchedKey = Object.keys(roleMappings).find(k => k.toLowerCase() === titleClean.toLowerCase());
      const role = matchedKey ? roleMappings[matchedKey] : 'Personnel';
      return role === 'Personnel';
    });
  }, [personnel, roleMappings]);

  const baseWakalaIndex: BaseWakala[] = useMemo(() => {
    const saved = localStorage.getItem('baseWakalaIndex');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Failed to parse baseWakalaIndex in PeopleManagementView:', e);
      return [];
    }
  }, []);

  const ownerWakalaMapping = useMemo(
    () => buildOwnerWakalaMap(baseWakalaIndex, mappedOwners),
    [baseWakalaIndex, mappedOwners]
  );

  // Unified list views
  const filteredOwners = useMemo(() => {
    return mappedOwners.filter(o => {
      const matchesSearch = o.name.toLowerCase().includes(ownerSearch.toLowerCase()) || 
                            o.masterAgentId.toLowerCase().includes(ownerSearch.toLowerCase());
      const matchesRegion = ownerRegion === 'All' || o.region === ownerRegion;
      const matchesStatus = ownerStatus === 'All' || o.status === ownerStatus;
      const matchesPerf = ownerPerf === 'All' || 
                          (ownerPerf === 'Top 20%' && o.performance >= 90) ||
                          (ownerPerf === 'Below 70%' && o.performance < 70);
      return matchesSearch && matchesRegion && matchesStatus && matchesPerf;
    });
  }, [mappedOwners, ownerSearch, ownerRegion, ownerStatus, ownerPerf]);

  const filteredPersonnel = useMemo(() => {
    return mappedPersonnel.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(personSearch.toLowerCase()) || 
                            p.title.toLowerCase().includes(personSearch.toLowerCase());
      const matchesLocation = personLocation === 'All' || p.location === personLocation;
      const matchesStatus = personStatus === 'All' || p.status === personStatus;
      const matchesTitle = personTitle === 'All' || p.title === personTitle;
      return matchesSearch && matchesLocation && matchesStatus && matchesTitle;
    });
  }, [mappedPersonnel, personSearch, personLocation, personStatus, personTitle]);

  const personnelTitlesList = useMemo(() => {
    const titles = new Set<string>();
    mappedPersonnel.forEach(p => { if (p.title) titles.add(p.title); });
    return ['All', ...Array.from(titles)];
  }, [mappedPersonnel]);

  // --- STATS COUNTERS ---
  const ownerStats = useMemo(() => {
    const totalCount = mappedOwners.length;
    const activeCount = mappedOwners.filter(o => o.status === 'Active').length;
    const totalWakalas = mappedOwners.reduce(
      (sum, o) => sum + (ownerWakalaMapping.byOwnerId.get(o.id)?.length || 0),
      0
    );
    const avgPerf = totalCount > 0 
      ? (mappedOwners.reduce((sum, o) => sum + (o.performance || 0), 0) / totalCount).toFixed(0) 
      : '0';
    return { totalCount, activeCount, totalWakalas, avgPerf };
  }, [mappedOwners, ownerWakalaMapping]);

  const personnelStats = useMemo(() => {
    const totalCount = mappedPersonnel.length;
    const activeCount = mappedPersonnel.filter(p => p.status === 'Active').length;
    const pendingCount = mappedPersonnel.filter(p => p.status === 'Pending').length;
    const locations = new Set(mappedPersonnel.map(p => p.location)).size;

    return { totalCount, activeCount, pendingCount, locations };
  }, [mappedPersonnel]);

  // --- MAPPING MANAGEMENT ACTIONS ---
  const [newTitleName, setNewTitleName] = useState('');
  const [newTitleRole, setNewTitleRole] = useState<'Owner' | 'Personnel'>('Personnel');

  const handleAddMapping = () => {
    if (!newTitleName.trim()) return;
    setEditedMappings(prev => ({
      ...prev,
      [newTitleName.trim()]: newTitleRole
    }));
    setNewTitleName('');
  };

  const handleDeleteMapping = (titleKey: string) => {
    const updated = { ...editedMappings };
    delete updated[titleKey];
    setEditedMappings(updated);
  };

  const handleRoleChange = (titleKey: string, role: 'Owner' | 'Personnel') => {
    setEditedMappings(prev => ({
      ...prev,
      [titleKey]: role
    }));
  };

  // Reset edited mappings back to saved mappings
  const handleResetMappings = () => {
    setEditedMappings({ ...roleMappings });
  };

  // --- ADD MODEL HANDLERS (OWNER & PERSONNEL) ---
  const [showAddOwnerModal, setShowAddOwnerModal] = useState(false);
  const [addOwnerForm, setAddOwnerForm] = useState({
    name: '',
    region: 'Dar es Salaam',
    wakalas: 3,
    portfolioSize: 'TZS 5.0M',
    portfolioGrowth: 'Not yet tracked',
    performance: 0, // derived live from KPI1 achievement; no seeded score
    status: 'Active' as Owner['status'],
    title: 'MFS',
    assignedTillsStr: ''
  });

  const handleAddOwnerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addOwnerForm.name) return;

    const tillsArr = addOwnerForm.assignedTillsStr
      .split(/[,\n;]/)
      .map(t => normalizeMsisdn(t.trim()))
      .filter(Boolean);

    const randomId = `MA-${Math.floor(10000 + Math.random() * 90000)}`;
    const newO: Owner = {
      id: `owner-${Date.now()}`,
      name: addOwnerForm.name,
      masterAgentId: randomId,
      region: addOwnerForm.region,
      memberSince: formatMonthYear(new Date()),
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      wakalas: Number(addOwnerForm.wakalas),
      portfolioSize: addOwnerForm.portfolioSize,
      portfolioGrowth: addOwnerForm.portfolioGrowth,
      performance: Number(addOwnerForm.performance),
      status: addOwnerForm.status,
      title: addOwnerForm.title,
      assignedTills: tillsArr,
      lastSyncDate: formatDateTime(new Date())
    } as any;

    setOwners([newO, ...owners]);

    if (tillsArr.length) {
      assignTillsToPerson(tillsArr.join(', '), newO.name, addOwnerForm.title, addOwnerForm.region);
      recalculateAllPerformances();
      window.dispatchEvent(new Event('people-reclassified'));
    }

    setShowAddOwnerModal(false);
    setAddOwnerForm({
      name: '',
      region: 'Dar es Salaam',
      wakalas: 3,
      portfolioSize: 'TZS 5.0M',
      portfolioGrowth: 'Not yet tracked',
      performance: 0, // derived live from KPI1 achievement; no seeded score
      status: 'Active',
      title: 'MFS',
      assignedTillsStr: ''
    });

    addAuditLog('Synchronization Event', (currentUser?.name || 'System Admin'), 'N/A', 'Owner', newO.name, 'Manual Administrator Registry');
  };

  const [showAddPersonnelModal, setShowAddPersonnelModal] = useState(false);
  const [addPersonnelForm, setAddPersonnelForm] = useState({
    name: '',
    title: 'Branch Manager',
    location: 'Dar es Salaam',
    status: 'Active' as Personnel['status'],
    assignedTill: ''
  });

  const handleAddPersonnelSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addPersonnelForm.name) return;

    const tillMsisdn = normalizeMsisdn(addPersonnelForm.assignedTill.trim());

    const newP: Personnel = {
      id: `personnel-${Date.now()}`,
      assignedTill: tillMsisdn,
      name: addPersonnelForm.name,
      title: addPersonnelForm.title,
      location: addPersonnelForm.location,
      status: addPersonnelForm.status,
      memberSince: formatMonthYear(new Date()),
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
      lastSyncDate: formatDateTime(new Date())
    };

    const updatedPersonnel = [newP, ...personnel];
    setPersonnel(updatedPersonnel);
    localStorage.setItem('personnelList', JSON.stringify(updatedPersonnel));

    if (tillMsisdn) {
      assignTillsToPerson(tillMsisdn, newP.name, newP.title, newP.location);
      recalculateAllPerformances();
      window.dispatchEvent(new Event('people-reclassified'));
    }

    setShowAddPersonnelModal(false);
    setAddPersonnelForm({
      name: '',
      title: 'Branch Manager',
      location: 'Dar es Salaam',
      status: 'Active',
      assignedTill: ''
    });

    addAuditLog('Synchronization Event', (currentUser?.name || 'System Admin'), 'N/A', 'Personnel', newP.name, 'Manual Administrator Registry');
  };

  // --- INDIVIDUAL COMPREHENSIVE PROFILE VIEWER STATE ---
  const [selectedProfile, setSelectedProfile] = useState<{
    type: 'Owner' | 'Personnel';
    record: any;
    metrics: any;
  } | null>(null);

  // Dynamic high-fidelity performance metrics generator
  const getPerformanceMetrics = (name: string, isOwner: boolean, tillsStr: string, realRows: any[] = []) => {
    const tillsList = tillsStr.split(',').map(t => t.trim()).filter(Boolean);

    // Helper to get served amount of a row (absolute value of negative transactions)
    const getServedAmountOfRow = (row: any) => {
      const val = row['Volume (TZS)'] || row['Volume'] || row['Amount'] || row['value'] || row['volume'] || 0;
      let amt = 0;
      if (typeof val === 'number') {
        amt = val;
      } else {
        const cleaned = String(val).replace(/,/g, '').replace(/[^0-9.-]/g, '');
        const parsed = parseFloat(cleaned);
        amt = isNaN(parsed) ? 0 : parsed;
      }
      return amt < 0 ? Math.abs(amt) : 0;
    };

    // Filter real rows for matching names or tills
    const belongsToPerson = (row: any) => {
      const rowName = row['Wakala Owner'] || row['Wakala Name'] || row['Name'] || row['ownerName'] || '';
      const rowTill = row['Branch_msisdn'] || row['transactionTill'] || row['Agent ID'] || row['AgentID'] || '';
      return (
        (rowName && rowName.toLowerCase() === name.toLowerCase()) ||
        (rowTill && tillsList.includes(rowTill))
      );
    };

    const userRows = realRows.filter(belongsToPerson);

    // Find latest day in servicingDataRows where served transactions happened
    const negativeRows = realRows.filter(row => getServedAmountOfRow(row) > 0);
    let selectedDay = '';
    if (negativeRows.length > 0) {
      const dates = negativeRows.map(row => row['Servicing Date'] || row['date'] || '').filter(Boolean);
      const uniqueDates = Array.from(new Set(dates));
      if (uniqueDates.length > 0) {
        uniqueDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        selectedDay = uniqueDates[0];
      }
    }

    let todayTxCount = 0;
    const totalValue = userRows.reduce((acc, r) => acc + getServedAmountOfRow(r), 0);
    let contributionKPI = 0;
    let recentTxList: any[] = [];

    if (selectedDay) {
      const dayRows = realRows.filter(row => (row['Servicing Date'] || row['date'] || '') === selectedDay);
      const companyTotalServed = dayRows.reduce((acc, r) => acc + getServedAmountOfRow(r), 0);

      const personDayRows = dayRows.filter(belongsToPerson);
      const personTotalServed = personDayRows.reduce((acc, r) => acc + getServedAmountOfRow(r), 0);

      todayTxCount = personDayRows.length;

      if (companyTotalServed > 0) {
        contributionKPI = parseFloat(((personTotalServed / companyTotalServed) * 100).toFixed(1));
      }

      const rowsForList = personDayRows.length > 0 ? personDayRows : userRows;
      recentTxList = rowsForList.slice(0, 5).map((row, idx) => {
        const amt = parseFloat(String(row['Volume (TZS)'] || row['Volume'] || row['Amount'] || row['value'] || row['volume'] || 0).replace(/,/g, ''));
        return {
          id: row['Transaction ID'] || row['TransactionID'] || `TX-${row['Index'] || idx + 1}`,
          date: row['Servicing Date'] || row['date'] || selectedDay,
          type: amt < 0 ? 'Cash Out Ingestion (Served)' : 'Float Ingestion',
          amount: Math.abs(amt),
          status: row['Status'] || 'Verified'
        };
      });
    } else if (userRows.length > 0) {
      recentTxList = userRows.slice(0, 5).map((row, idx) => {
        const amt = parseFloat(String(row['Volume (TZS)'] || row['Volume'] || row['Amount'] || row['value'] || row['volume'] || 0).replace(/,/g, ''));
        return {
          id: row['Transaction ID'] || row['TransactionID'] || `TX-${row['Index'] || idx + 1}`,
          date: row['Servicing Date'] || row['date'] || 'N/A',
          type: amt < 0 ? 'Cash Out Ingestion (Served)' : 'Float Ingestion',
          amount: Math.abs(amt),
          status: row['Status'] || 'Verified'
        };
      });
    }

    const monthlyTxCount = userRows.length;
    const avgDailyValue = userRows.length > 0 ? totalValue / 28 : 0;

    // Real rank calculation
    let rankNum = 0;
    if (totalValue > 0 && realRows.length > 0) {
      const ownerVolumes = new Map<string, number>();
      for (const row of realRows) {
        const ownerName = row['Wakala Owner'] || row['Wakala Name'] || row['Name'] || row['ownerName'] || '';
        if (!ownerName) continue;
        const key = ownerName.toLowerCase();
        const vol = getServedAmountOfRow(row);
        ownerVolumes.set(key, (ownerVolumes.get(key) || 0) + vol);
      }
      const sortedVolumes = Array.from(ownerVolumes.values()).sort((a, b) => b - a);
      const myVol = totalValue;
      const foundIdx = sortedVolumes.findIndex(v => v <= myVol);
      if (foundIdx !== -1) {
        rankNum = foundIdx + 1;
      }
    }

    // Real weekly activity timeline
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const daysMap: Record<string, { count: number; value: number }> = {
      Mon: { count: 0, value: 0 },
      Tue: { count: 0, value: 0 },
      Wed: { count: 0, value: 0 },
      Thu: { count: 0, value: 0 },
      Fri: { count: 0, value: 0 },
      Sat: { count: 0, value: 0 },
      Sun: { count: 0, value: 0 },
    };

    let hasWeeklyData = false;
    for (const r of userRows) {
      const dateStr = r['Servicing Date'] || r['date'];
      if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          const dayIndex = (d.getDay() + 6) % 7; // Mon=0 .. Sun=6
          const dayName = days[dayIndex];
          const val = getServedAmountOfRow(r);
          daysMap[dayName].count += 1;
          daysMap[dayName].value += val;
          hasWeeklyData = true;
        }
      }
    }

    const activityTimeline = hasWeeklyData
      ? days.map(d => ({ date: d, count: daysMap[d].count, value: daysMap[d].value }))
      : [];

    // Real monthly performance trend
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyVolumes: Record<string, number> = {};
    for (const r of userRows) {
      const dateStr = r['Servicing Date'] || r['date'];
      if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          const mKey = monthNames[d.getMonth()];
          monthlyVolumes[mKey] = (monthlyVolumes[mKey] || 0) + getServedAmountOfRow(r);
        }
      }
    }

    const presentMonths = Object.keys(monthlyVolumes);
    const maxMonthlyVol = Math.max(...Object.values(monthlyVolumes), 0);

    const performanceTrend = presentMonths.length > 0
      ? presentMonths.map(m => ({
          date: m,
          rate: maxMonthlyVol > 0 ? Math.round((monthlyVolumes[m] / maxMonthlyVol) * 100) : 0
        }))
      : [];

    return {
      todayTransactions: todayTxCount,
      monthlyTransactions: monthlyTxCount,
      totalTransactionValue: totalValue,
      averageDailyValue: Math.round(avgDailyValue),
      contributionToKPIs: contributionKPI,
      activityTimeline,
      performanceTrend,
      ranking: rankNum,
      recentTransactions: recentTxList
    };
  };

  const handleOpenProfile = async (type: 'Owner' | 'Personnel', record: any) => {
    if (type === 'Personnel') {
      setSelectedProfile({ type: 'Personnel', record, metrics: null as any });
      return;
    }
    const tillsStr = record.assignedTills ? record.assignedTills.join(', ') : '';

    let rows: any[] = [];
    try {
      rows = await getDailyServicingRows();
    } catch (e) {
      console.error('Failed to load daily servicing rows in handleOpenProfile:', e);
    }

    const metrics = getPerformanceMetrics(record.name, true, tillsStr, rows);
    setSelectedProfile({ type: 'Owner', record, metrics });
  };

  // Find assigned personnel for an owner
  const getAssignedPersonnelForOwner = (ownerRecord: any) => {
    return mappedPersonnel.filter(p => p.location.toLowerCase() === ownerRecord.region.toLowerCase());
  };

  // --- SVG CHART RENDERERS (CUSTOM TO PREVENT CONFLICTS IN REACT 19) ---
  const renderAreaChart = (data: { date: string; value: number }[]) => {
    if (!data || data.length === 0 || data.every(d => d.value === 0)) {
      return (
        <div className="py-6 text-center text-[11px] font-bold text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
          No activity recorded this week
        </div>
      );
    }
    const maxVal = Math.max(...data.map(d => d.value)) || 1;
    const width = 500;
    const height = 140;
    const padding = 20;

    const getX = (idx: number) => {
      if (data.length <= 1) return width / 2;
      return padding + (idx * (width - padding * 2)) / (data.length - 1);
    };

    const points = data.map((d, idx) => {
      const x = getX(idx);
      const y = height - padding - (d.value * (height - padding * 2)) / maxVal;
      return `${x},${y}`;
    }).join(' ');

    const fillPoints = `${points} ${width - padding},${height - padding} ${padding},${height - padding}`;

    return (
      <svg className="w-full h-[140px]" viewBox={`0 0 ${width} ${height}`}>
        {/* Grid lines */}
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#e2e8f0" strokeWidth="1" />
        <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="#f1f5f9" strokeWidth="1" />
        
        {/* Gradient fill */}
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0.00" />
          </linearGradient>
        </defs>
        <polygon points={fillPoints} fill="url(#areaGradient)" />
        
        {/* Line */}
        <polyline points={points} fill="none" stroke="#1e3a8a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        
        {/* Tooltip circles */}
        {data.map((d, idx) => {
          const x = getX(idx);
          const y = height - padding - (d.value * (height - padding * 2)) / maxVal;
          return (
            <g key={idx} className="group/dot">
              <circle cx={x} cy={y} r="4" className="fill-brand-primary stroke-white stroke-2 hover:r-5 transition-all cursor-pointer" />
              <text x={x} y={y - 10} className="text-[9px] font-bold font-mono fill-brand-secondary text-center opacity-0 group-hover/dot:opacity-100 transition-opacity" textAnchor="middle">
                {(d.value / 1000).toFixed(0)}k
              </text>
            </g>
          );
        })}

        {/* Labels */}
        {data.map((d, idx) => {
          const x = getX(idx);
          return (
            <text key={idx} x={x} y={height - 4} className="text-[9px] font-bold font-sans fill-slate-400" textAnchor="middle">
              {d.date}
            </text>
          );
        })}
      </svg>
    );
  };

  const renderTrendLine = (data: { date: string; rate: number }[]) => {
    if (!data || data.length === 0 || data.every(d => d.rate === 0)) {
      return (
        <div className="py-6 text-center text-[11px] font-bold text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
          No performance trend recorded
        </div>
      );
    }
    const maxVal = 100;
    const minVal = 0;
    const width = 500;
    const height = 120;
    const padding = 20;

    const getX = (idx: number) => {
      if (data.length <= 1) return width / 2;
      return padding + (idx * (width - padding * 2)) / (data.length - 1);
    };

    const points = data.map((d, idx) => {
      const x = getX(idx);
      const y = height - padding - ((d.rate - minVal) * (height - padding * 2)) / (maxVal - minVal);
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg className="w-full h-[120px]" viewBox={`0 0 ${width} ${height}`}>
        {/* Horizontal grid lines */}
        {[0, 50, 100].map((v, i) => {
          const y = height - padding - ((v - minVal) * (height - padding * 2)) / (maxVal - minVal);
          return (
            <g key={i}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3,3" />
              <text x={padding - 5} y={y + 3} className="text-[8px] font-mono font-bold fill-slate-400" textAnchor="end">{v}%</text>
            </g>
          );
        })}

        {/* Line */}
        <polyline points={points} fill="none" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" />

        {/* Dots */}
        {data.map((d, idx) => {
          const x = getX(idx);
          const y = height - padding - ((d.rate - minVal) * (height - padding * 2)) / (maxVal - minVal);
          return (
            <circle key={idx} cx={x} cy={y} r="3.5" className="fill-sky-500 stroke-white stroke-2" />
          );
        })}

        {/* X Axis Labels */}
        {data.map((d, idx) => {
          const x = getX(idx);
          return (
            <text key={idx} x={x} y={height - 2} className="text-[9px] font-bold font-sans fill-slate-400" textAnchor="middle">
              {d.date}
            </text>
          );
        })}
      </svg>
    );
  };

  if (selectedProfile && selectedProfile.type === 'Owner') {
    return (
      <OwnerDetailsView 
        onNavigate={(view) => {
          setSelectedProfile(null);
        }}
        selectedOwnerName={selectedProfile.record.name}
      />
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8 font-sans"
    >
      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <PageHeaderBanner
          icon={Users}
          title="People Management"
          subtitle={`Dynamic role mapping, administrator audits, and individual performance profiles for the ${companyName} master agent network.`}
        />
        
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* SUBMODULE SWITCHER BUTTONS */}
          <div className="flex flex-wrap gap-1.5 bg-brand-gray-hover/80 p-1.5 rounded-2xl border border-brand-gray-border">
          <button 
            onClick={() => { setActiveTab('owners'); setSelectedProfile(null); }}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'owners' 
                ? 'bg-brand-primary text-white shadow-ambient' 
                : 'text-brand-text-variant hover:text-brand-text hover:bg-white/50'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Owners
          </button>
          <button 
            onClick={() => { setActiveTab('personnel'); setSelectedProfile(null); }}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'personnel' 
                ? 'bg-brand-primary text-white shadow-ambient' 
                : 'text-brand-text-variant hover:text-brand-text hover:bg-white/50'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Personnel
          </button>
          <button 
            onClick={() => { setActiveTab('users'); setSelectedProfile(null); }}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'users' 
                ? 'bg-brand-primary text-white shadow-ambient' 
                : 'text-brand-text-variant hover:text-brand-text hover:bg-white/50'
            }`}
          >
            <Lock className="h-3.5 w-3.5" />
            User Access
          </button>
          <button
            onClick={() => { setActiveTab('satills'); setSelectedProfile(null); }}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'satills'
                ? 'bg-brand-primary text-white shadow-ambient'
                : 'text-brand-text-variant hover:text-brand-text hover:bg-white/50'
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            SA Tills
          </button>
        </div>
        </div>
      </div>

      {/* MULTI-PANEL ROOT LAYOUT */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT COMPONENT: MASTER TAB / MODULE CONTENT (col-span-8 or 12 depending on selected profiles) */}
        <div className={`space-y-6 ${selectedProfile && selectedProfile.type === 'Personnel' ? 'xl:col-span-7' : 'xl:col-span-12'}`}>
          
          {/* ========================================================= */}
          {/* SUBMODULE: OWNERS LIST */}
          {/* ========================================================= */}
          {activeTab === 'owners' && (
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Registered Owners</span>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-2xl font-black text-brand-text">{ownerStats.totalCount}</span>
                    <span className="text-[10px] bg-brand-primary/10 text-brand-primary px-1.5 py-0.5 rounded-md font-mono font-bold">Owners</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Partners</span>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-2xl font-black text-emerald-600">{ownerStats.activeCount}</span>
                    <span className="text-[10px] font-bold text-emerald-600">
                      {ownerStats.totalCount > 0 ? ((ownerStats.activeCount / ownerStats.totalCount) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tills Under Management</span>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-2xl font-black text-brand-primary">{ownerStats.totalWakalas}</span>
                    <span className="text-[10px] text-slate-500 font-bold">Wakala Tills</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Average Performance Index</span>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-2xl font-black text-blue-600">{ownerStats.avgPerf}%</span>
                    <span className="text-[10px] text-blue-600 font-bold">ON TRACK</span>
                  </div>
                </div>
              </div>

              {/* Filtering bar */}
              <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-4 shadow-ambient space-y-3">
                <div className="flex flex-col sm:flex-row gap-3 items-center">
                  <div className="relative flex-1 w-full">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search owner name, master agent ID..."
                      value={ownerSearch}
                      onChange={(e) => setOwnerSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-brand-gray-border outline-none focus:border-brand-primary bg-brand-bg/50 text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <select
                      value={ownerRegion}
                      onChange={(e) => setOwnerRegion(e.target.value)}
                      className="px-3 py-2.5 rounded-xl border border-brand-gray-border outline-none text-xs bg-white font-semibold text-slate-700 cursor-pointer"
                    >
                      <option value="All">All Regions</option>
                      <option value="Dar es Salaam">Dar es Salaam</option>
                      <option value="Arusha">Arusha</option>
                      <option value="Mwanza">Mwanza</option>
                      <option value="Dodoma">Dodoma</option>
                    </select>
                    <select
                      value={ownerStatus}
                      onChange={(e) => setOwnerStatus(e.target.value)}
                      className="px-3 py-2.5 rounded-xl border border-brand-gray-border outline-none text-xs bg-white font-semibold text-slate-700 cursor-pointer"
                    >
                      <option value="All">All Statuses</option>
                      <option value="Active">Active</option>
                      <option value="Pending">Pending</option>
                      <option value="Suspended">Suspended</option>
                    </select>
                    <select
                      value={ownerPerf}
                      onChange={(e) => setOwnerPerf(e.target.value)}
                      className="px-3 py-2.5 rounded-xl border border-brand-gray-border outline-none text-xs bg-white font-semibold text-slate-700 cursor-pointer"
                    >
                      <option value="All">All Performance</option>
                      <option value="Top 20%">Top Performers (&gt;=90%)</option>
                      <option value="Below 70%">Action Needed (&lt;70%)</option>
                    </select>
                    <button 
                      onClick={() => setShowAddOwnerModal(true)}
                      className="px-4 py-2.5 bg-brand-primary text-white rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-brand-primary-light transition-all cursor-pointer shadow-sm ml-auto"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Add Owner
                    </button>
                  </div>
                </div>
              </div>

              {/* Table / Cards List */}
              <div className="bg-brand-card rounded-2xl border border-brand-gray-border overflow-hidden shadow-ambient">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse font-sans text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-brand-gray-border text-[10px]">
                        <th className="px-5 py-4">Wakala Owner Name</th>
                        <th className="px-5 py-4">Master ID</th>
                        <th className="px-5 py-4">Region</th>
                        <th className="px-5 py-4">Associated Tills</th>
                        <th className="px-5 py-4">Performance</th>
                        <th className="px-5 py-4 text-center">Status</th>
                        <th className="px-5 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-gray-border/50 text-brand-text font-medium">
                      {filteredOwners.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-10 text-brand-text-variant font-bold">
                            No owners matched your filters.
                          </td>
                        </tr>
                      ) : (
                        filteredOwners.map(owner => (
                          <tr key={owner.id} className="hover:bg-brand-bg/40 transition-colors">
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <OwnerAvatar ownerName={owner.name} avatarPhotoId={owner.avatarPhotoId} className="h-9 w-9 rounded-lg object-cover ring-2 ring-brand-primary/5" />
                                <div>
                                  <span className="block font-bold text-brand-text">{owner.name}</span>
                                  <span className="block text-[10px] text-brand-text-variant mt-0.5">{owner.title || 'MFS'}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4 font-mono text-[11px] font-bold">{owner.masterAgentId}</td>
                            <td className="px-5 py-4">
                              {owner.workLocation?.address ? (
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-bold text-brand-primary uppercase tracking-wider">Location</span>
                                  <span className="text-xs text-brand-text font-semibold max-w-[150px] truncate" title={owner.workLocation.address}>
                                    {owner.workLocation.address}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-bold text-brand-text-variant uppercase tracking-wider">Region</span>
                                  <span className="text-xs text-brand-text-variant">{owner.region}</span>
                                </div>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              <span className="bg-brand-primary-container/70 text-brand-primary px-2.5 py-1 rounded-md font-bold text-[10px]">
                                {ownerWakalaMapping.byOwnerId.get(owner.id)?.length || 0} Tills
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full ${owner.performance >= 90 ? 'bg-emerald-500' : owner.performance >= 70 ? 'bg-blue-500' : 'bg-amber-500'}`}
                                    style={{ width: `${owner.performance}%` }}
                                  />
                                </div>
                                <span className="font-bold text-[11px]">{owner.performance}%</span>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-center">
                              <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                owner.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                owner.status === 'Pending' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}>
                                {owner.status}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right flex items-center justify-end gap-1.5">
                              <button 
                                onClick={() => handleOpenProfile('Owner', owner)}
                                className="inline-flex items-center gap-1 bg-brand-primary/5 hover:bg-brand-primary text-brand-primary hover:text-white px-3 py-1.5 rounded-lg transition-all font-bold text-[11px] cursor-pointer border border-brand-primary/10"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Profile View
                              </button>
                              <button 
                                onClick={() => startEditOwner(owner)}
                                className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg transition-all font-bold text-[11px] cursor-pointer border border-slate-200"
                              >
                                <Sliders className="h-3.5 w-3.5" />
                                Edit
                              </button>
                              {isAdmin && (
                                <button 
                                  onClick={() => setDeleteOwnerTarget({ id: owner.id, name: owner.name })}
                                  className="inline-flex items-center gap-1 bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white px-2.5 py-1.5 rounded-lg transition-all font-bold text-[11px] cursor-pointer border border-rose-200"
                                  title="Delete Owner"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Delete
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* SUBMODULE: PERSONNEL LIST */}
          {/* ========================================================= */}
          {activeTab === 'personnel' && (
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Personnel Staff</span>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-2xl font-black text-brand-text">{personnelStats.totalCount}</span>
                    <span className="text-[10px] bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded-md font-mono font-bold">Personnel</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Staff Count</span>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-2xl font-black text-teal-600">{personnelStats.activeCount}</span>
                    <span className="text-[10px] font-bold text-teal-600">
                      {personnelStats.totalCount > 0 ? ((personnelStats.activeCount / personnelStats.totalCount) * 100).toFixed(0) : 0}% Active
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pending Approvals</span>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-2xl font-black text-amber-600">{personnelStats.pendingCount}</span>
                    <span className="text-[10px] text-amber-600 font-bold">Staff Onboarding</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Operational Locations</span>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-2xl font-black text-indigo-600">{personnelStats.locations}</span>
                    <span className="text-[10px] text-indigo-600 font-bold">Zones</span>
                  </div>
                </div>
              </div>

              {/* Filtering bar */}
              <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-4 shadow-ambient space-y-3">
                <div className="flex flex-col sm:flex-row gap-3 items-center">
                  <div className="relative flex-1 w-full">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search staff name, title, assigned tills..."
                      value={personSearch}
                      onChange={(e) => setPersonSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-brand-gray-border outline-none focus:border-brand-primary bg-brand-bg/50 text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <select
                      value={personLocation}
                      onChange={(e) => setPersonLocation(e.target.value)}
                      className="px-3 py-2.5 rounded-xl border border-brand-gray-border outline-none text-xs bg-white font-semibold text-slate-700 cursor-pointer"
                    >
                      <option value="All">All Locations</option>
                      <option value="Dar es Salaam">Dar es Salaam</option>
                      <option value="Arusha">Arusha</option>
                      <option value="Mwanza">Mwanza</option>
                      <option value="Dodoma">Dodoma</option>
                    </select>
                    <select
                      value={personStatus}
                      onChange={(e) => setPersonStatus(e.target.value)}
                      className="px-3 py-2.5 rounded-xl border border-brand-gray-border outline-none text-xs bg-white font-semibold text-slate-700 cursor-pointer"
                    >
                      <option value="All">All Statuses</option>
                      <option value="Active">Active</option>
                      <option value="Pending">Pending</option>
                      <option value="Suspended">Suspended</option>
                    </select>
                    <select
                      value={personTitle}
                      onChange={(e) => setPersonTitle(e.target.value)}
                      className="px-3 py-2.5 rounded-xl border border-brand-gray-border outline-none text-xs bg-white font-semibold text-slate-700 cursor-pointer"
                    >
                      {personnelTitlesList.map(title => (
                        <option key={title} value={title}>{title === 'All' ? 'All Titles' : title}</option>
                      ))}
                    </select>
                    <button 
                      onClick={() => setShowAddPersonnelModal(true)}
                      className="px-4 py-2.5 bg-brand-primary text-white rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-brand-primary-light transition-all cursor-pointer shadow-sm ml-auto"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Add Personnel
                    </button>
                  </div>
                </div>
              </div>

              {/* Table / Cards List */}
              <div className="bg-brand-card rounded-2xl border border-brand-gray-border overflow-hidden shadow-ambient">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse font-sans text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-brand-gray-border text-[10px]">
                        <th className="px-5 py-4">Personnel Staff Name</th>
                        <th className="px-5 py-4">Title</th>
                        <th className="px-5 py-4">Location</th>
                        <th className="px-5 py-4">Last Sync Date</th>
                        <th className="px-5 py-4 text-center">Status</th>
                        <th className="px-5 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-gray-border/50 text-brand-text font-medium">
                      {filteredPersonnel.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-10 text-brand-text-variant font-bold">
                            No personnel staff matched your filters.
                          </td>
                        </tr>
                      ) : (
                        filteredPersonnel.map(person => (
                          <tr key={person.id} className="hover:bg-brand-bg/40 transition-colors">
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <img src={getAvatarUrl(person.name)} alt={person.name} className="h-9 w-9 rounded-lg object-cover ring-2 ring-brand-primary/5" />
                                <div>
                                  <span className="block font-bold text-brand-text">{person.name}</span>
                                  <span className="block text-[10px] text-slate-400 mt-0.5">Joined {person.memberSince || '—'}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold">
                                {person.title}
                              </span>
                            </td>
                            <td className="px-5 py-4">{person.location}</td>
                            <td className="px-5 py-4 text-slate-400 font-bold">{person.lastSyncDate || '—'}</td>
                            <td className="px-5 py-4 text-center">
                              <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                person.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                person.status === 'Pending' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}>
                                {person.status}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right flex items-center justify-end gap-1.5">
                              <button 
                                onClick={() => handleOpenProfile('Personnel', person)}
                                className="inline-flex items-center gap-1 bg-brand-primary/5 hover:bg-brand-primary text-brand-primary hover:text-white px-3 py-1.5 rounded-lg transition-all font-bold text-[11px] cursor-pointer border border-brand-primary/10"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Profile View
                              </button>
                              <button 
                                onClick={() => startEditPersonnel(person)}
                                className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg transition-all font-bold text-[11px] cursor-pointer border border-slate-200"
                              >
                                <Sliders className="h-3.5 w-3.5" />
                                Edit
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}





          {/* ========================================================= */}
          {/* SUBMODULE: USER ACCESS MANAGEMENT */}
          {/* ========================================================= */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              {/* Header card with action */}
              <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-6 shadow-ambient flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h3 className="text-base font-bold text-brand-text flex items-center gap-1.5">
                    <Lock className="h-4.5 w-4.5 text-brand-primary" />
                    User Access & Identity Management
                  </h3>
                  <p className="text-xs text-brand-text-variant mt-0.5">
                    Configure login credentials, assign system-access privileges, reset passwords, or de-provision user sessions.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateUserModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-4.5 py-2.5 font-sans text-xs font-bold text-white shadow-ambient hover:bg-brand-primary-light transition-all cursor-pointer"
                >
                  <UserPlus className="h-4 w-4" />
                  Provision User Credentials
                </button>
              </div>

              {/* Users list table */}
              <div className="bg-brand-card rounded-2xl border border-brand-gray-border shadow-ambient overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-brand-gray-border bg-slate-50 text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">
                        <th className="py-3 px-5">Name / Account</th>
                        <th className="py-3 px-5">Login Username</th>
                        <th className="py-3 px-5">Contact Email</th>
                        <th className="py-3 px-5">Role Privileges</th>
                        <th className="py-3 px-5">Linked Business Profile</th>
                        <th className="py-3 px-5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-gray-border text-xs font-medium text-brand-text">
                      {usersLoading ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-brand-text-variant font-sans">
                            Loading accounts…
                          </td>
                        </tr>
                      ) : usersError ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-rose-700 font-sans font-semibold">
                            {usersError}
                          </td>
                        </tr>
                      ) : usersList.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-brand-text-variant font-sans">
                            No login accounts exist yet. Use “Provision User Credentials” to create one.
                          </td>
                        </tr>
                      ) : (
                        usersList.map((userRow) => {
                          const isSelf = currentUser && ((currentUser.username && userRow.username && currentUser.username.toLowerCase() === userRow.username.toLowerCase()) || (currentUser.email && userRow.email && currentUser.email.toLowerCase() === userRow.email.toLowerCase()));
                          // Determine link
                          let linkedProfile = "None (System Account)";
                          if (userRow.ownerId) {
                            const foundOwner = owners.find(o => o.id === userRow.ownerId);
                            linkedProfile = foundOwner ? `Owner: ${foundOwner.name}` : `Owner (ID: ${userRow.ownerId})`;
                          } else if (userRow.personnelId) {
                            const foundPers = personnel.find(p => p.id === userRow.personnelId || p._id === userRow.personnelId);
                            linkedProfile = foundPers ? `Personnel: ${foundPers.name}` : `Personnel (ID: ${userRow.personnelId})`;
                          }

                          return (
                            <tr key={userRow.id || userRow.username || userRow.email} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-4.5 px-5">
                                <div className="flex items-center gap-3">
                                  <img
                                    src={getAvatarUrl(userRow.name)}
                                    alt={userRow.name}
                                    className="h-8 w-8 rounded-lg object-cover ring-2 ring-brand-primary/10"
                                  />
                                  <div>
                                    <span className="font-bold block text-slate-800">{userRow.name}</span>
                                    {isSelf && (
                                      <span className="inline-block mt-0.5 rounded bg-emerald-100 px-1.5 py-0.2 text-[9px] font-black text-emerald-800 uppercase tracking-wide">
                                        Your Active Session
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="py-4.5 px-5 font-mono text-[11px] font-bold text-brand-primary">
                                <span className="bg-brand-primary/5 border border-brand-primary/15 px-2 py-0.5 rounded-md">
                                  {userRow.username || userRow.email.split('@')[0]}
                                </span>
                              </td>
                              <td className="py-4.5 px-5 font-mono text-[11px] text-slate-600">
                                {userRow.email}
                              </td>
                              <td className="py-4.5 px-5">
                                <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                  userRow.role === 'Admin'
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                    : userRow.role === 'Owner'
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                      : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                }`}>
                                  {userRow.role}
                                </span>
                              </td>
                              <td className="py-4.5 px-5 text-brand-text-variant font-semibold">
                                {linkedProfile}
                              </td>
                              <td className="py-4.5 px-5 text-right space-x-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowResetPasswordModal(userRow);
                                    setResetPasswordValue('');
                                    setResetSuccessData(null);
                                    setCopiedResetPassword(false);
                                  }}
                                  className="inline-flex items-center gap-1 bg-white hover:bg-slate-100 text-brand-primary font-bold text-[10px] py-1.5 px-2.5 rounded-lg border border-brand-gray-border transition-colors cursor-pointer"
                                >
                                  <LockOpen className="h-3 w-3" />
                                  Reset Pass
                                </button>
                                <button
                                  type="button"
                                  disabled={isSelf}
                                  onClick={() => setShowDeleteUserConfirmModal(userRow)}
                                  className={`inline-flex items-center gap-1 font-bold text-[10px] py-1.5 px-2.5 rounded-lg border transition-all cursor-pointer ${
                                    isSelf
                                      ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                                      : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-100 hover:border-rose-200'
                                  }`}
                                  title={isSelf ? "Accidental lockout prevention: Cannot delete your own currently logged-in account" : ""}
                                >
                                  <Trash2 className="h-3 w-3" />
                                  Delete
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* SUBMODULE: SA TILL REGISTRY */}
          {/* ========================================================= */}
          {activeTab === 'satills' && (
            <div className="space-y-6">
              {/* Upload card */}
              <div className="bg-brand-card p-6 rounded-2xl border border-brand-gray-border shadow-ambient space-y-4">
                <div>
                  <h3 className="text-base font-bold text-brand-text flex items-center gap-1.5">
                    <Building2 className="h-4.5 w-4.5 text-brand-primary" />
                    SA Till Registry
                  </h3>
                  <p className="text-xs text-brand-text-variant mt-0.5">
                    Master Super Agent (SA) Till MSISDN registry — identifies parent-account transfers between the company's own tills so they are excluded from served volume instead of misclassified.
                  </p>
                </div>

                <div
                  onDragEnter={handleSaTillDrag}
                  onDragOver={handleSaTillDrag}
                  onDragLeave={handleSaTillDrag}
                  onDrop={handleSaTillDrop}
                  onClick={() => saTillFileInputRef.current?.click()}
                  className={`relative rounded-2xl border-2 border-dashed p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                    saTillDragActive
                      ? 'border-brand-primary bg-brand-primary/5 scale-[0.99]'
                      : 'border-brand-gray-border bg-brand-bg hover:border-brand-primary hover:bg-brand-primary/5'
                  }`}
                >
                  <input
                    type="file"
                    ref={saTillFileInputRef}
                    onChange={handleSaTillFileInput}
                    accept=".csv, .xlsx, .xls, .xlx"
                    className="hidden"
                  />
                  <div className="flex h-12 w-12 items-center justify-center rounded-full mb-3 bg-brand-primary-container/50 text-brand-primary">
                    <UploadCloud className="h-6 w-6" />
                  </div>
                  <h4 className="text-sm font-black text-brand-text">Drag and drop your SA Till Registry file here</h4>
                  <p className="text-xs text-brand-text-variant mt-1">Supported formats: .CSV, .XLSX, .XLS, .XLX</p>
                  <button
                    type="button"
                    className="mt-3 rounded-xl bg-brand-primary hover:bg-brand-primary-light text-white px-5 py-2.5 text-xs font-bold shadow-ambient transition-all"
                  >
                    Browse System Files
                  </button>
                </div>

                {saTillUploading && saTillSelectedFile && (
                  <div className="bg-brand-bg p-4 rounded-2xl border border-brand-gray-border">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-9 w-9 rounded-xl bg-brand-primary-container/40 text-brand-primary flex items-center justify-center shrink-0">
                        <RotateCw className="h-4.5 w-4.5 animate-spin" />
                      </div>
                      <div>
                        <p className="text-xs font-black text-brand-text truncate max-w-sm">{saTillSelectedFile.name}</p>
                        <p className="text-[10px] text-brand-text-variant font-mono mt-0.5">Uploading and parsing file...</p>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-primary rounded-full transition-all duration-300"
                        style={{ width: `${saTillUploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {stagedSaTills && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-brand-bg p-5 rounded-2xl border border-brand-primary/30 space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-brand-gray-border pb-4">
                      <div>
                        <h3 className="text-sm font-black text-brand-text">SA Till Registry Staging Preview</h3>
                        <p className="text-xs text-brand-text-variant">Verify parsed Master SA Tills before committing.</p>
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
                        onClick={() => { setStagedSaTills(null); setSaTillSelectedFile(null); }}
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
              </div>

              {/* Registered SA Tills list */}
              <div className="bg-brand-card p-6 rounded-2xl border border-brand-gray-border shadow-ambient space-y-4">
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
                    <p className="text-[11px] text-slate-400 mt-0.5">Drag and drop a registry spreadsheet above to get started.</p>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* RIGHT COMPONENT: DETAILED INDIVIDUAL PROFILE (col-span-5) */}
        {selectedProfile && selectedProfile.type === 'Personnel' && (
          <div className="xl:col-span-5 space-y-6">
            <motion.div 
              initial={{ x: 25, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              className="bg-brand-card rounded-2xl border-2 border-brand-primary-light/20 shadow-xl overflow-hidden font-sans text-xs sticky top-6"
            >
              {/* Profile Header banner */}
              <div className="bg-brand-primary px-5 py-6 text-white relative">
                <button 
                  onClick={() => setSelectedProfile(null)}
                  className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                  title="Close Profile"
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="flex items-center gap-4">
                  <OwnerAvatar 
                    ownerName={selectedProfile.record.name} 
                    className="h-16 w-16 rounded-2xl object-cover border-2 border-white/20 shadow-md"
                  />
                  <div>
                    <h3 className="text-base sm:text-lg font-black tracking-tight leading-none">{selectedProfile.record.name}</h3>
                    <p className="text-[10px] text-white/85 font-extrabold uppercase mt-1 flex items-center gap-1 font-mono">
                      <span className="px-1.5 py-0.5 bg-white/25 rounded">{selectedProfile.record.title || 'Personnel'}</span>
                      <span className="px-1.5 py-0.5 bg-sky-400 text-sky-950 rounded">Personnel Staff</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Personnel Profile Summary */}
              <div className="p-5 space-y-4 font-semibold text-slate-700">
                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Staff Profile Details</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-3.5 border border-slate-200/80 rounded-xl">
                    <span className="block text-[9px] text-slate-400 uppercase font-extrabold">TITLE / ROLE</span>
                    <span className="text-xs text-slate-900 font-bold block mt-1">
                      {selectedProfile.record.title || 'Personnel Staff'}
                    </span>
                  </div>

                  <div className="bg-slate-50 p-3.5 border border-slate-200/80 rounded-xl">
                    <span className="block text-[9px] text-slate-400 uppercase font-extrabold">ASSIGNED LOCATION</span>
                    <span className="text-xs text-slate-900 font-bold flex items-center gap-1 mt-1">
                      <MapPin className="h-3.5 w-3.5 text-brand-primary shrink-0" />
                      {selectedProfile.record.location}
                    </span>
                  </div>

                  <div className="bg-slate-50 p-3.5 border border-slate-200/80 rounded-xl">
                    <span className="block text-[9px] text-slate-400 uppercase font-extrabold">STATUS</span>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold mt-1 ${
                      selectedProfile.record.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      selectedProfile.record.status === 'Pending' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                      'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}>
                      {selectedProfile.record.status}
                    </span>
                  </div>

                  <div className="bg-slate-50 p-3.5 border border-slate-200/80 rounded-xl">
                    <span className="block text-[9px] text-slate-400 uppercase font-extrabold">MEMBER SINCE</span>
                    <span className="text-xs text-slate-800 font-bold block mt-1">
                      {selectedProfile.record.memberSince || '—'}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-50 p-3.5 border border-slate-200/80 rounded-xl">
                  <span className="block text-[9px] text-slate-400 uppercase font-extrabold">LAST SYNCHRONIZATION</span>
                  <span className="text-xs text-slate-600 font-medium block mt-1">
                    {selectedProfile.record.lastSyncDate || '—'}
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* UPDATE CLASSIFICATION PREVIEW MODAL */}
      {/* ========================================================= */}
      <AnimatePresence>
        {showPreviewModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 font-sans">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl border border-slate-100 max-w-2xl w-full p-6 shadow-2xl space-y-5"
            >
              <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-lg font-black text-brand-secondary flex items-center gap-1.5">
                    <ShieldAlert className="h-5 w-5 text-amber-500 animate-pulse" />
                    Sovereign Reclassification Preview
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Please review the affected staff members before writing updates to the sovereign ledger databases.
                  </p>
                </div>
                <button 
                  onClick={() => setShowPreviewModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Affect preview count */}
              <div className="bg-amber-50 border border-amber-200/60 p-4 rounded-xl flex gap-3 items-start text-xs text-amber-800 font-semibold leading-relaxed">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-amber-950 font-black">Warning: Database Synchronization Required</strong>
                  Your title-to-role adjustments will migrate <strong className="text-amber-950">{affectedPersonnelPreview.length} registered users</strong>.
                  Upon authorization, matching records are moved dynamically between Owners and Personnel directories, and their permissions/credentials will align.
                </div>
              </div>

              {/* affected list preview table */}
              <div className="border border-slate-150 rounded-xl overflow-hidden max-h-[220px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-150">
                      <th className="px-4 py-2.5">Staff Name</th>
                      <th className="px-4 py-2.5">Workbook Title</th>
                      <th className="px-4 py-2.5 text-center">Previous Role</th>
                      <th className="px-4 py-2.5 text-right">Target Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                    {affectedPersonnelPreview.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-6 text-slate-400">
                          No registered staff are affected by these adjustments.
                        </td>
                      </tr>
                    ) : (
                      affectedPersonnelPreview.map((item, index) => (
                        <tr key={index} className="hover:bg-slate-50/50 transition-all">
                          <td className="px-4 py-3 text-slate-900">{item.name}</td>
                          <td className="px-4 py-3 font-semibold">
                            <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px]">
                              {item.title}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded text-[9px] border border-amber-100 uppercase">
                              {item.currentRole}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[9px] border border-indigo-100 uppercase">
                              {item.targetRole}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Action confirm buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button 
                  onClick={() => setShowPreviewModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all cursor-pointer"
                >
                  Cancel Ingestion
                </button>
                <button 
                  onClick={applyReclassification}
                  disabled={affectedPersonnelPreview.length === 0}
                  className={`px-5 py-2.5 rounded-xl text-xs font-extrabold text-white shadow-ambient flex items-center gap-1.5 transition-all cursor-pointer ${
                    affectedPersonnelPreview.length === 0 ? 'bg-slate-300 cursor-not-allowed' : 'bg-brand-primary hover:bg-brand-primary-light'
                  }`}
                >
                  <CheckCircle className="h-4 w-4" />
                  Authorize Reclassification
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================= */}
      {/* ADD OWNER MODAL */}
      {/* ========================================================= */}
      <AnimatePresence>
        {showAddOwnerModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 font-sans">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl border border-slate-100 max-w-md w-full p-6 shadow-2xl space-y-4"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                  <UserPlus className="h-4.5 w-4.5 text-brand-primary" />
                  Add New Wakala Owner
                </h3>
                <button 
                  onClick={() => setShowAddOwnerModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              <form onSubmit={handleAddOwnerSubmit} className="space-y-4 text-xs font-semibold text-slate-700">
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Full Business Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Coastal Traders Ltd"
                    value={addOwnerForm.name}
                    onChange={(e) => setAddOwnerForm({ ...addOwnerForm, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:bg-white focus:border-brand-primary"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Till No / MSISDN <span className="text-brand-primary">(primary identifier)</span></label>
                  <input
                    type="text"
                    required
                    inputMode="numeric"
                    placeholder="e.g., 0712345678, 0765432100"
                    value={addOwnerForm.assignedTillsStr}
                    onChange={(e) => setAddOwnerForm({ ...addOwnerForm, assignedTillsStr: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:bg-white focus:border-brand-primary font-mono"
                  />
                  <p className="text-[10px] text-slate-400 font-medium mt-1">Separate multiple tills with a comma. Numbers are normalized to 255XXXXXXXXX.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Operational Region</label>
                    <select
                      value={addOwnerForm.region}
                      onChange={(e) => setAddOwnerForm({ ...addOwnerForm, region: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none cursor-pointer"
                    >
                      <option value="Dar es Salaam">Dar es Salaam</option>
                      <option value="Arusha">Arusha</option>
                      <option value="Mwanza">Mwanza</option>
                      <option value="Dodoma">Dodoma</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Raw workbook Title</label>
                    <select
                      value={addOwnerForm.title}
                      onChange={(e) => setAddOwnerForm({ ...addOwnerForm, title: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none cursor-pointer"
                    >
                      {Object.keys(editedMappings).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-0.5">Tills Owned</label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={addOwnerForm.wakalas}
                      onChange={(e) => setAddOwnerForm({ ...addOwnerForm, wakalas: Number(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:border-brand-primary font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-0.5">Portfolio Growth</label>
                    <input
                      type="text"
                      required
                      value={addOwnerForm.portfolioGrowth}
                      onChange={(e) => setAddOwnerForm({ ...addOwnerForm, portfolioGrowth: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:border-brand-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-0.5">Perf index %</label>
                    <input
                      type="number"
                      required
                      min={10}
                      max={100}
                      value={addOwnerForm.performance}
                      onChange={(e) => setAddOwnerForm({ ...addOwnerForm, performance: Number(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:border-brand-primary font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Operational Status</label>
                  <select
                    value={addOwnerForm.status}
                    onChange={(e) => setAddOwnerForm({ ...addOwnerForm, status: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none cursor-pointer font-bold text-slate-700"
                  >
                    <option value="Active">Active</option>
                    <option value="Pending">Pending</option>
                    <option value="Suspended">Suspended</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                  <button 
                    type="button"
                    onClick={() => setShowAddOwnerModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold cursor-pointer transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-5 py-2 bg-brand-primary hover:bg-brand-primary-light text-white font-extrabold rounded-xl shadow-ambient cursor-pointer transition-all"
                  >
                    Add Owner Partner
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================= */}
      {/* ADD PERSONNEL MODAL */}
      {/* ========================================================= */}
      <AnimatePresence>
        {showAddPersonnelModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 font-sans">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl border border-slate-100 max-w-md w-full p-6 shadow-2xl space-y-4"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                  <UserPlus className="h-4.5 w-4.5 text-brand-primary" />
                  Add New Personnel Staff
                </h3>
                <button 
                  onClick={() => setShowAddPersonnelModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              <form onSubmit={handleAddPersonnelSubmit} className="space-y-4 text-xs font-semibold text-slate-700">
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Full Staff Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Christopher Mndeme"
                    value={addPersonnelForm.name}
                    onChange={(e) => setAddPersonnelForm({ ...addPersonnelForm, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:bg-white focus:border-brand-primary"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Till No / MSISDN <span className="text-brand-primary">(primary identifier)</span></label>
                  <input
                    type="text"
                    required
                    inputMode="numeric"
                    placeholder="e.g., 0712345678"
                    value={addPersonnelForm.assignedTill}
                    onChange={(e) => setAddPersonnelForm({ ...addPersonnelForm, assignedTill: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:bg-white focus:border-brand-primary font-mono"
                  />
                  <p className="text-[10px] text-slate-400 font-medium mt-1">Assigned transaction till. Normalized to 255XXXXXXXXX.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Location Zone</label>
                    <select
                      value={addPersonnelForm.location}
                      onChange={(e) => setAddPersonnelForm({ ...addPersonnelForm, location: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none cursor-pointer"
                    >
                      <option value="Dar es Salaam">Dar es Salaam</option>
                      <option value="Arusha">Arusha</option>
                      <option value="Mwanza">Mwanza</option>
                      <option value="Dodoma">Dodoma</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Workbook Title</label>
                    <select
                      value={addPersonnelForm.title}
                      onChange={(e) => setAddPersonnelForm({ ...addPersonnelForm, title: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none cursor-pointer"
                    >
                      {Object.keys(editedMappings).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Personnel Status</label>
                  <select
                    value={addPersonnelForm.status}
                    onChange={(e) => setAddPersonnelForm({ ...addPersonnelForm, status: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none cursor-pointer font-bold text-slate-700"
                  >
                    <option value="Active">Active</option>
                    <option value="Pending">Pending</option>
                    <option value="Suspended">Suspended</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                  <button 
                    type="button"
                    onClick={() => setShowAddPersonnelModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold cursor-pointer transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-5 py-2 bg-brand-primary hover:bg-brand-primary-light text-white font-extrabold rounded-xl shadow-ambient cursor-pointer transition-all"
                  >
                    Add Personnel Staff
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================= */}
      {/* EDIT OWNER MODAL */}
      {/* ========================================================= */}
      <AnimatePresence>
        {showEditOwnerModal && editingOwner && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 font-sans">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl border border-slate-100 max-w-md w-full p-6 shadow-2xl space-y-4 text-slate-800"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                  <Sliders className="h-4.5 w-4.5 text-brand-primary" />
                  Edit Wakala Owner: {editingOwner.name}
                </h3>
                <button 
                  onClick={() => { setShowEditOwnerModal(false); setEditingOwner(null); }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              <form onSubmit={handleEditOwnerSubmit} className="space-y-4 text-xs font-semibold text-slate-700">
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Full Business Name</label>
                  <input
                    type="text"
                    required
                    value={editOwnerForm.name}
                    onChange={(e) => setEditOwnerForm({ ...editOwnerForm, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:bg-white focus:border-brand-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Operational Region</label>
                    <select
                      value={editOwnerForm.region}
                      onChange={(e) => setEditOwnerForm({ ...editOwnerForm, region: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none cursor-pointer"
                    >
                      <option value="Dar es Salaam">Dar es Salaam</option>
                      <option value="Arusha">Arusha</option>
                      <option value="Mwanza">Mwanza</option>
                      <option value="Dodoma">Dodoma</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Raw workbook Title</label>
                    <select
                      value={editOwnerForm.title}
                      onChange={(e) => setEditOwnerForm({ ...editOwnerForm, title: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none cursor-pointer"
                    >
                      {Object.keys(editedMappings).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Assigned Till Number(s) (Comma Separated)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 255656136144, 255711223344"
                    value={editOwnerForm.assignedTillsStr}
                    onChange={(e) => setEditOwnerForm({ ...editOwnerForm, assignedTillsStr: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:bg-white focus:border-brand-primary font-mono text-xs"
                  />
                  <p className="text-[9px] text-slate-400 mt-1">Changing these values directly updates till registry mapping assignments.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-0.5">Portfolio Growth</label>
                    <input
                      type="text"
                      required
                      value={editOwnerForm.portfolioGrowth}
                      onChange={(e) => setEditOwnerForm({ ...editOwnerForm, portfolioGrowth: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:border-brand-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-0.5">Perf index %</label>
                    <input
                      type="number"
                      required
                      min={10}
                      max={100}
                      value={editOwnerForm.performance}
                      onChange={(e) => setEditOwnerForm({ ...editOwnerForm, performance: Number(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:border-brand-primary font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Operational Status</label>
                  <select
                    value={editOwnerForm.status}
                    onChange={(e) => setEditOwnerForm({ ...editOwnerForm, status: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none cursor-pointer font-bold text-slate-700"
                  >
                    <option value="Active">Active</option>
                    <option value="Pending">Pending</option>
                    <option value="Suspended">Suspended</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                  <button 
                    type="button"
                    onClick={() => { setShowEditOwnerModal(false); setEditingOwner(null); }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold cursor-pointer transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-5 py-2 bg-brand-primary hover:bg-brand-primary-light text-white font-extrabold rounded-xl shadow-ambient cursor-pointer transition-all"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================= */}
      {/* EDIT PERSONNEL MODAL */}
      {/* ========================================================= */}
      <AnimatePresence>
        {showEditPersonnelModal && editingPersonnel && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 font-sans">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl border border-slate-100 max-w-md w-full p-6 shadow-2xl space-y-4 text-slate-800"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                  <Sliders className="h-4.5 w-4.5 text-brand-primary" />
                  Edit Personnel Staff: {editingPersonnel.name}
                </h3>
                <button 
                  onClick={() => { setShowEditPersonnelModal(false); setEditingPersonnel(null); }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              <form onSubmit={handleEditPersonnelSubmit} className="space-y-4 text-xs font-semibold text-slate-700">
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Full Staff Name</label>
                  <input
                    type="text"
                    required
                    value={editPersonnelForm.name}
                    onChange={(e) => setEditPersonnelForm({ ...editPersonnelForm, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:bg-white focus:border-brand-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Location Zone</label>
                    <select
                      value={editPersonnelForm.location}
                      onChange={(e) => setEditPersonnelForm({ ...editPersonnelForm, location: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none cursor-pointer"
                    >
                      <option value="Dar es Salaam">Dar es Salaam</option>
                      <option value="Arusha">Arusha</option>
                      <option value="Mwanza">Mwanza</option>
                      <option value="Dodoma">Dodoma</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Workbook Title</label>
                    <select
                      value={editPersonnelForm.title}
                      onChange={(e) => setEditPersonnelForm({ ...editPersonnelForm, title: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none cursor-pointer"
                    >
                      {Object.keys(editedMappings).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Personnel Status</label>
                  <select
                    value={editPersonnelForm.status}
                    onChange={(e) => setEditPersonnelForm({ ...editPersonnelForm, status: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none cursor-pointer font-bold text-slate-700"
                  >
                    <option value="Active">Active</option>
                    <option value="Pending">Pending</option>
                    <option value="Suspended">Suspended</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                  <button 
                    type="button"
                    onClick={() => { setShowEditPersonnelModal(false); setEditingPersonnel(null); }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold cursor-pointer transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-5 py-2 bg-brand-primary hover:bg-brand-primary-light text-white font-extrabold rounded-xl shadow-ambient cursor-pointer transition-all"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {/* PROVISION USER CREDENTIALS MODAL */}
        {showCreateUserModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 font-sans">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl border border-slate-100 max-w-md w-full p-6 shadow-2xl space-y-4 text-slate-800"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-brand-primary" />
                  Provision User Credentials
                </h3>
                <button 
                  onClick={() => setShowCreateUserModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              <form onSubmit={handleCreateUserSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">Account Role</label>
                  <select
                    required
                    value={createUserForm.selectedRole}
                    onChange={(e) => {
                      const role = e.target.value as 'Owner' | 'FloatManager';
                      setCreateUserForm(prev => ({
                        ...prev,
                        selectedRole: role,
                        selectedEntityId: '',
                        selectedEntityType: role === 'Owner' ? 'Owner' : 'Personnel',
                        username: '',
                        email: ''
                      }));
                    }}
                    className="w-full rounded-xl bg-slate-50 border border-slate-200/85 px-3.5 py-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:border-brand-primary focus:bg-white cursor-pointer"
                  >
                    <option value="Owner">Owner</option>
                    <option value="FloatManager">Float Manager</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">Select Business Profile</label>
                  <select
                    required={createUserForm.selectedRole === 'Owner'}
                    value={createUserForm.selectedEntityId ? `${createUserForm.selectedEntityType}:${createUserForm.selectedEntityId}` : ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        setCreateUserForm(prev => ({ ...prev, selectedEntityId: '', username: '', email: '' }));
                        return;
                      }
                      const [type, id] = val.split(':');
                      const selectedEntity = entityOptions.find(opt => opt.id === id && opt.type === type);
                      const emailPrefix = selectedEntity ? selectedEntity.name.toLowerCase().replace(/\s+/g, '.') : '';
                      const autoUser = selectedEntity ? selectedEntity.name.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
                      setCreateUserForm(prev => ({
                        ...prev,
                        selectedEntityType: type as any,
                        selectedEntityId: id,
                        username: autoUser,
                        email: emailPrefix ? `${emailPrefix}@${companyName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'company'}.com` : ''
                      }));
                    }}
                    className="w-full rounded-xl bg-slate-50 border border-slate-200/85 px-3.5 py-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:border-brand-primary focus:bg-white cursor-pointer"
                  >
                    {createUserForm.selectedRole === 'Owner' ? (
                      <option value="">-- Choose an Owner --</option>
                    ) : (
                      <option value="">-- No linked profile (system account) --</option>
                    )}
                    {entityOptions
                      .filter(opt => createUserForm.selectedRole === 'Owner' ? opt.type === 'Owner' : opt.type === 'Personnel')
                      .map((opt) => (
                        <option key={`${opt.type}:${opt.id}`} value={`${opt.type}:${opt.id}`}>
                          [{opt.type}] {opt.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">Login Username</label>
                    <span className="text-[10px] text-brand-primary font-semibold">Used to sign in</span>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="e.g. abubakar or wakala_dar"
                    value={createUserForm.username}
                    onChange={(e) => setCreateUserForm(prev => ({ ...prev, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') }))}
                    className="w-full rounded-xl bg-slate-50 border border-slate-200/85 px-3.5 py-2.5 text-xs font-mono font-medium text-slate-800 focus:outline-none focus:border-brand-primary focus:bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">Contact Email</label>
                    <span className="text-[10px] text-slate-400 font-semibold">Notifications & recovery</span>
                  </div>
                  <input
                    type="email"
                    required
                    placeholder={`name@${companyName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'company'}.com`}
                    value={createUserForm.email}
                    onChange={(e) => setCreateUserForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full rounded-xl bg-slate-50 border border-slate-200/85 px-3.5 py-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:border-brand-primary focus:bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">Initial Password</label>
                  <input
                    type="password"
                    minLength={8}
                    placeholder="Leave blank to generate a strong password"
                    value={createUserForm.password}
                    onChange={(e) => setCreateUserForm(prev => ({ ...prev, password: e.target.value }))}
                    className="w-full rounded-xl bg-slate-50 border border-slate-200/85 px-3.5 py-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:border-brand-primary focus:bg-white"
                  />
                </div>

                <div className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                  * Users log in using their <strong>Username</strong>. Contact email is retained for verification and system communications.
                  The password is displayed once after the account is created — copy it then.
                </div>

                <div className="border-t border-slate-100 pt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateUserModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl transition-all cursor-pointer text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={userActionBusy}
                    className="px-5 py-2 bg-brand-primary hover:bg-brand-primary-light text-white font-extrabold rounded-xl transition-all cursor-pointer text-xs shadow-ambient disabled:opacity-60"
                  >
                    {userActionBusy ? 'Creating…' : 'Provision Account'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* ADMINISTRATIVE PASSWORD RESET */}
        {showResetPasswordModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 font-sans">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl border border-slate-100 max-w-md w-full p-6 shadow-2xl space-y-4 text-slate-800"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <LockOpen className="h-5 w-5 text-brand-primary" />
                  Administrative Password Reset
                </h3>
                <button 
                  onClick={() => {
                    setShowResetPasswordModal(null);
                    setResetSuccessData(null);
                    setResetPasswordValue('');
                    setCopiedResetPassword(false);
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              {resetSuccessData ? (
                /* TRANSIENT PASSWORD DISPLAY UPON SUCCESSFUL RESET */
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 mb-2">
                      <Check className="h-5 w-5" />
                    </div>
                    <h4 className="text-sm font-bold text-emerald-900">Password Successfully Updated</h4>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      New credentials generated for <strong className="text-slate-800">{resetSuccessData.user.name}</strong> (Username: <span className="font-mono font-bold text-brand-primary">{resetSuccessData.user.username || resetSuccessData.user.email}</span>).
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">New Password (Plaintext)</span>
                      <span className="text-[10px] text-amber-600 font-bold">Transient Display</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5">
                      <span className="font-mono text-sm font-black text-slate-900 select-all tracking-wider">
                        {resetSuccessData.password}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(resetSuccessData.password);
                          setCopiedResetPassword(true);
                          setTimeout(() => setCopiedResetPassword(false), 3000);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-primary/10 hover:bg-brand-primary text-brand-primary hover:text-white text-xs font-bold transition-all cursor-pointer"
                      >
                        {copiedResetPassword ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                      ⚠️ <strong>Security Notice:</strong> Passwords are cryptographically salted & hashed in storage. This plaintext value exists only right now and will not be displayed again after closing this window.
                    </p>
                  </div>

                  <div className="border-t border-slate-100 pt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setShowResetPasswordModal(null);
                        setResetSuccessData(null);
                        setResetPasswordValue('');
                        setCopiedResetPassword(false);
                      }}
                      className="px-5 py-2.5 bg-brand-primary hover:bg-brand-primary-light text-white font-extrabold rounded-xl transition-all cursor-pointer text-xs shadow-ambient w-full text-center"
                    >
                      Done & Close
                    </button>
                  </div>
                </div>
              ) : (
                /* PASSWORD INPUT FORM */
                <>
                  <div className="text-xs text-slate-500 font-semibold">
                    Resetting credentials for <strong className="text-slate-800">{showResetPasswordModal.name}</strong> (Username: <span className="font-mono font-bold text-brand-primary">{showResetPasswordModal.username || showResetPasswordModal.email}</span>).
                  </div>

                  <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">New Secure Password</label>
                      <input
                        type="password"
                        minLength={8}
                        placeholder="Leave blank to generate a strong password"
                        value={resetPasswordValue}
                        onChange={(e) => setResetPasswordValue(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200/85 px-3.5 py-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:border-brand-primary focus:bg-white"
                      />
                      <p className="text-[10px] font-semibold text-slate-400">
                        Minimum 8 characters. The password is shown once after saving.
                      </p>
                    </div>


                    <div className="border-t border-slate-100 pt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowResetPasswordModal(null);
                          setResetSuccessData(null);
                          setResetPasswordValue('');
                        }}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl transition-all cursor-pointer text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 bg-brand-primary hover:bg-brand-primary-light text-white font-extrabold rounded-xl transition-all cursor-pointer text-xs shadow-ambient"
                      >
                        Set Password
                      </button>
                    </div>
                  </form>
                </>
              )}
            </motion.div>
          </div>
        )}

        {/* CONFIRM DE-PROVISION USER CREDENTIALS */}
        {showDeleteUserConfirmModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 font-sans">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl border border-slate-100 max-w-md w-full p-6 shadow-2xl space-y-4 text-slate-800"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Trash2 className="h-5 w-5 text-rose-600" />
                  De-provision Credentials
                </h3>
                <button 
                  onClick={() => setShowDeleteUserConfirmModal(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              <div className="space-y-2 text-xs text-slate-600 font-semibold leading-relaxed">
                <p>
                  Are you absolutely sure you want to remove system login credentials for <strong className="text-slate-900">{showDeleteUserConfirmModal.name}</strong> (<span className="font-mono text-slate-700">{showDeleteUserConfirmModal.email}</span>)?
                </p>
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3.5 font-bold leading-relaxed">
                  ⚠️ Note: This is non-destructive for business records. This only revokes their login capability. Their Owner/Personnel registry entry will remain completely intact.
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteUserConfirmModal(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl transition-all cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteUserConfirm}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl transition-all cursor-pointer text-xs shadow-ambient"
                >
                  De-provision Account
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Owner Modal */}
      <DeleteOwnerModal
        isOpen={!!deleteOwnerTarget}
        ownerId={deleteOwnerTarget?.id || null}
        ownerName={deleteOwnerTarget?.name || null}
        onClose={() => setDeleteOwnerTarget(null)}
        onSuccess={handleDeleteOwnerSuccess}
      />

      {/* Deletion Toast */}
      {deletionToast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 bg-slate-900 text-white font-sans text-xs font-bold rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-3 animate-bounce max-w-md">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <span>{deletionToast}</span>
        </div>
      )}

    </motion.div>
  );
}
