import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useCompany } from './CompanyContext';
import { FloatRequest, Owner, Personnel, LoanRecord } from '../types';
import { formatDate } from '../utils/dateFormat';
import { 
  getFloatRequests, 
  confirmFloatRequest, 
  completeFloatRequest, 
  rejectFloatReturn,
  approveLoanForShortfall,
  getLoanRecords,
  markLoanPaid,
  getPendingDays,
  getResolutionDays,
  getStatusBadgeInfo,
  getTotalReturned
} from '../utils/floatManagement';
import { getPhoto } from '../utils/db';
import { ownersList } from '../data';
import { 
  Banknote, 
  Search, 
  Filter, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  Power, 
  User, 
  Building,
  RefreshCw,
  Image as ImageIcon,
  Check,
  X,
  XCircle,
  FileText,
  Users,
  Layers,
  Calendar,
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface FloatManagerViewProps {
  onLogout?: () => void;
  readOnly?: boolean;
}

export default function FloatManagerView({ onLogout, readOnly = false }: FloatManagerViewProps) {
  const { user } = useAuth();
  const { companyName } = useCompany();

  const [activeTab, setActiveTab] = useState<'ledger' | 'loans'>('ledger');
  const [requests, setRequests] = useState<FloatRequest[]>([]);
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [personnelList, setPersonnelList] = useState<Personnel[]>([]);
  const [selectedManagerId, setSelectedManagerId] = useState<string>('');

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Confirmed' | 'Returned' | 'Completed'>('All');
  
  // Date filter state (YYYY-MM-DD)
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Image modal state
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  // Reject confirmation modal state
  const [confirmRejectTarget, setConfirmRejectTarget] = useState<FloatRequest | null>(null);

  // Load data
  const loadData = () => {
    const allRequests = getFloatRequests();
    setRequests(allRequests);

    const allLoans = getLoanRecords();
    setLoans(allLoans);

    // Owners
    try {
      const savedOwners = localStorage.getItem('ownersList');
      if (savedOwners) {
        setOwners(JSON.parse(savedOwners));
      } else {
        setOwners(ownersList);
      }
    } catch {
      setOwners(ownersList);
    }

    // Personnel
    try {
      const savedPersonnel = localStorage.getItem('personnelList');
      if (savedPersonnel) {
        setPersonnelList(JSON.parse(savedPersonnel));
      }
    } catch {
      setPersonnelList([]);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Quick date presets
  const getTodayStr = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const getYesterdayStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const getStartOfMonthStr = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}-01`;
  };

  const handlePresetDate = (preset: 'all' | 'today' | 'yesterday' | 'month') => {
    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'today') {
      const t = getTodayStr();
      setStartDate(t);
      setEndDate(t);
    } else if (preset === 'yesterday') {
      const y = getYesterdayStr();
      setStartDate(y);
      setEndDate(y);
    } else if (preset === 'month') {
      setStartDate(getStartOfMonthStr());
      setEndDate(getTodayStr());
    }
  };

  const clearDateFilter = () => {
    setStartDate('');
    setEndDate('');
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-TZ', {
      style: 'currency',
      currency: 'TZS',
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Resolve owner name
  const getOwnerName = (ownerId: string) => {
    const owner = owners.find(o => o.id === ownerId);
    return owner ? owner.name : `Owner ${ownerId}`;
  };

  // Date range filter check: evaluates primary distribution timestamp (confirmedAt), fallback to requestedAt
  const isWithinDateRange = (r: FloatRequest) => {
    if (!startDate && !endDate) return true;
    const rawDate = r.confirmedAt || r.requestedAt;
    if (!rawDate) return false;
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) return false;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const itemDateStr = `${yyyy}-${mm}-${dd}`;

    if (startDate && itemDateStr < startDate) return false;
    if (endDate && itemDateStr > endDate) return false;
    return true;
  };

  // Requests filtered by active date filter
  const dateFilteredRequests = requests.filter(isWithinDateRange);

  // Filter requests by search and status
  const filteredRequests = dateFilteredRequests.filter(r => {
    const ownerName = getOwnerName(r.ownerId).toLowerCase();
    const matchesSearch = ownerName.includes(searchTerm.toLowerCase()) || r.ownerId.toLowerCase().includes(searchTerm.toLowerCase());

    let matchesStatus: boolean;
    if (statusFilter === 'All') {
      matchesStatus = true;
    } else if (statusFilter === 'Returned') {
      matchesStatus = !!(r.returnEntries && r.returnEntries.length > 0);
    } else {
      matchesStatus = r.status === statusFilter;
    }

    return matchesSearch && matchesStatus;
  });

  // Filter loans
  const filteredLoans = loans.filter(l => {
    const ownerName = getOwnerName(l.ownerId).toLowerCase();
    return ownerName.includes(searchTerm.toLowerCase()) || l.ownerId.toLowerCase().includes(searchTerm.toLowerCase()) || l.reason.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // Action handlers
  const handleConfirm = (r: FloatRequest) => {
    const manager = personnelList.find(p => p.id === selectedManagerId);
    const mId = manager ? manager.id : (user?.email || 'float_manager');
    const mName = manager ? manager.name : (user?.name || 'Float Manager');

    confirmFloatRequest(r.id, mId, mName);
    loadData();
  };

  const handleComplete = (r: FloatRequest) => {
    if (getTotalReturned(r) !== r.requestedAmount) {
      alert(`Cannot complete float request: Returned amount (${formatCurrency(getTotalReturned(r))}) does not match requested amount (${formatCurrency(r.requestedAmount)}).`);
      return;
    }

    const manager = personnelList.find(p => p.id === selectedManagerId);
    const mId = manager ? manager.id : (user?.email || 'float_manager');
    const mName = manager ? manager.name : (user?.name || 'Float Manager');

    completeFloatRequest(r.id, mId, mName);
    loadData();
  };

  const handleReject = (r: FloatRequest) => {
    setConfirmRejectTarget(r);
  };

  const handleApproveLoan = (r: FloatRequest) => {
    const manager = personnelList.find(p => p.id === selectedManagerId);
    const mId = manager ? manager.id : (user?.email || 'float_manager');
    const mName = manager ? manager.name : (user?.name || 'Float Manager');

    approveLoanForShortfall(r.id, mId, mName);
    loadData();
  };

  const handleMarkLoanPaid = (loan: LoanRecord) => {
    const manager = personnelList.find(p => p.id === selectedManagerId);
    const mId = manager ? manager.id : (user?.email || 'float_manager');
    const mName = manager ? manager.name : (user?.name || 'Float Manager');

    markLoanPaid(loan.id, mId, mName);
    loadData();
  };

  // View receipt photo
  const handleViewReceipt = async (receiptPhotoId: string) => {
    try {
      const photo = await getPhoto(receiptPhotoId);
      if (photo && photo.imageData) {
        setPreviewPhoto(photo.imageData);
      } else {
        alert('Receipt image not found in local storage.');
      }
    } catch {
      alert('Failed to load receipt photo.');
    }
  };

  // Stats calculation for Ledger tab (respects date filtering)
  const totalCount = dateFilteredRequests.length;
  const pendingCount = dateFilteredRequests.filter(r => r.status === 'Pending').length;
  const distributedCount = dateFilteredRequests.filter(r => r.status === 'Confirmed').length;
  const completedCount = dateFilteredRequests.filter(r => r.status === 'Completed').length;

  // Financial summary metrics across date-filtered float requests
  const totalRequestedFinancial = dateFilteredRequests.reduce((sum, r) => sum + (r.requestedAmount || 0), 0);
  const totalReturnedFinancial = dateFilteredRequests.reduce((sum, r) => {
    if (r.returnEntries && r.returnEntries.length > 0) {
      return sum + getTotalReturned(r);
    }
    return sum;
  }, 0);

  // Loans tab financial metrics (all-time)
  const totalOutstandingFinancial = requests
    .filter(r => r.status === 'Pending' || r.status === 'Confirmed')
    .reduce((sum, r) => sum + (r.requestedAmount || 0), 0);
  const totalLoansOutstandingFinancial = loans
    .filter(l => l.status !== 'Paid')
    .reduce((sum, l) => sum + (l.amount || 0), 0);

  const totalOutstandingLoanAmount = loans
    .filter(l => l.status !== 'Paid')
    .reduce((sum, l) => sum + l.amount, 0);
  const uniqueLoanOwnersCount = new Set(loans.filter(l => l.status !== 'Paid').map(l => l.ownerId)).size;

  // Grouped loans by owner (only unpaid loans)
  const loanTotalsByOwner = loans
    .filter(l => l.status !== 'Paid')
    .reduce<Record<string, number>>((acc, l) => {
      acc[l.ownerId] = (acc[l.ownerId] || 0) + l.amount;
      return acc;
    }, {});

  const ownerLoanSummary = Object.keys(loanTotalsByOwner).map(ownerId => {
    const ownerLoans = loans.filter(l => l.ownerId === ownerId && l.status !== 'Paid');
    return {
      ownerId,
      total: loanTotalsByOwner[ownerId],
      count: ownerLoans.length,
      latestDate: ownerLoans.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.createdAt
    };
  }).sort((a, b) => b.total - a.total);

  const isDateFilterActive = !!(startDate || endDate);

  return (
    <div className="min-h-screen bg-brand-bg font-sans selection:bg-brand-primary selection:text-white">
      {/* Navigation Header */}
      <header className="sticky top-0 z-40 border-b border-brand-gray-border bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <Banknote className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-brand-primary uppercase tracking-tight text-sm">{companyName}</span>
                <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  Float Manager Portal
                </span>
              </div>
              <p className="text-[11px] text-brand-text-variant">Float Request & Disbursement Governance</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <User className="h-4 w-4 text-slate-500" />
              <span className="font-semibold text-brand-text">{user?.name || 'Float Manager'}</span>
            </div>
            {onLogout && (
              <button
                onClick={onLogout}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-status-error-text text-white shadow-md hover:opacity-90 active:scale-95 transition-all shrink-0 cursor-pointer"
                title="Logout"
                id="float-manager-logout-btn"
              >
                <Power className="h-5 w-5" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('ledger')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'ledger'
                ? 'bg-brand-primary text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-brand-gray-border'
            }`}
          >
            <Banknote className="h-4 w-4" />
            Float Ledger
          </button>
          <button
            onClick={() => setActiveTab('loans')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'loans'
                ? 'bg-brand-primary text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-brand-gray-border'
            }`}
          >
            <FileText className="h-4 w-4" />
            Loans ({loans.length})
          </button>
        </div>

        {activeTab === 'ledger' ? (
          <>
            {/* Top Summary Stats (6 Cards) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <div className="rounded-2xl border border-brand-gray-border bg-white p-5 shadow-ambient flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-brand-text-variant uppercase tracking-wider">Total Requests</p>
                  <p className="text-2xl font-black text-brand-primary mt-1">{totalCount}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-blue-50 text-brand-primary flex items-center justify-center">
                  <FileText className="h-6 w-6" />
                </div>
              </div>

              <div className="rounded-2xl border border-brand-gray-border bg-white p-5 shadow-ambient flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-brand-text-variant uppercase tracking-wider">Pending Action</p>
                  <p className="text-2xl font-black text-amber-600 mt-1">{pendingCount}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Clock className="h-6 w-6" />
                </div>
              </div>

              <div className="rounded-2xl border border-brand-gray-border bg-white p-5 shadow-ambient flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-brand-text-variant uppercase tracking-wider">Float Distributed</p>
                  <p className="text-2xl font-black text-indigo-600 mt-1">{distributedCount}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Banknote className="h-6 w-6" />
                </div>
              </div>

              <div className="rounded-2xl border border-brand-gray-border bg-white p-5 shadow-ambient flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-brand-text-variant uppercase tracking-wider">Completed</p>
                  <p className="text-2xl font-black text-emerald-600 mt-1">{completedCount}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle className="h-6 w-6" />
                </div>
              </div>

              <div className="rounded-2xl border border-brand-gray-border bg-white p-5 shadow-ambient flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-brand-text-variant uppercase tracking-wider">Total Requested (TZS)</p>
                  <p className="text-lg font-black text-brand-primary mt-1">TZS {totalRequestedFinancial.toLocaleString()}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-blue-50 text-brand-primary flex items-center justify-center">
                  <Banknote className="h-6 w-6" />
                </div>
              </div>

              <div className="rounded-2xl border border-brand-gray-border bg-white p-5 shadow-ambient flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-brand-text-variant uppercase tracking-wider">Total Returned (TZS)</p>
                  <p className="text-lg font-black text-emerald-600 mt-1">TZS {totalReturnedFinancial.toLocaleString()}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle className="h-6 w-6" />
                </div>
              </div>
            </div>

            {/* Toolbar: Filters, Manager Attribution, Date Filter */}
            <div className="rounded-2xl border border-brand-gray-border bg-white p-4 shadow-ambient space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex-1 flex flex-col sm:flex-row gap-3">
                  {/* Search */}
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-brand-text-variant" />
                    <input
                      type="text"
                      placeholder="Search owner name or ID..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full rounded-xl bg-[#f0f2f5] pl-9 pr-4 py-2 text-xs text-brand-text border border-transparent outline-none focus:border-brand-primary focus:bg-white transition-all"
                    />
                  </div>

                  {/* Status Filter */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                    {(['All', 'Pending', 'Confirmed', 'Returned', 'Completed'] as const).map((st) => (
                      <button
                        key={st}
                        onClick={() => setStatusFilter(st)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                          statusFilter === st
                            ? 'bg-brand-primary text-white shadow-sm'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Personnel Manager Attribution Dropdown */}
                {!readOnly && personnelList.length > 0 && (
                  <div className="flex items-center gap-2 border-t lg:border-t-0 pt-3 lg:pt-0 border-brand-gray-border shrink-0">
                    <label className="text-xs font-bold text-brand-text-variant shrink-0">Attributed Manager:</label>
                    <select
                      value={selectedManagerId}
                      onChange={(e) => setSelectedManagerId(e.target.value)}
                      className="rounded-xl border border-brand-gray-border bg-white px-3 py-1.5 text-xs font-semibold text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary"
                    >
                      <option value="">{user?.name || 'Float Manager (Logged in)'}</option>
                      {personnelList
                        .filter(p => p.title?.toLowerCase().includes('manager'))
                        .map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.title})</option>
                        ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Date Filter Toolbar Row */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-brand-gray-border text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 text-brand-text font-bold">
                    <Calendar className="h-4 w-4 text-brand-primary" />
                    <span>Date Filter:</span>
                  </div>

                  {/* Preset Buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handlePresetDate('all')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                        !startDate && !endDate
                          ? 'bg-brand-primary text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      All Time
                    </button>
                    <button
                      onClick={() => handlePresetDate('today')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                        startDate === getTodayStr() && endDate === getTodayStr()
                          ? 'bg-brand-primary text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Today
                    </button>
                    <button
                      onClick={() => handlePresetDate('yesterday')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                        startDate === getYesterdayStr() && endDate === getYesterdayStr()
                          ? 'bg-brand-primary text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Yesterday
                    </button>
                    <button
                      onClick={() => handlePresetDate('month')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                        startDate === getStartOfMonthStr() && endDate === getTodayStr()
                          ? 'bg-brand-primary text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      This Month
                    </button>
                  </div>

                  {/* Custom From & To Inputs */}
                  <div className="flex items-center gap-1.5 ml-1">
                    <span className="text-slate-400 font-medium">From:</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="rounded-lg border border-brand-gray-border bg-white px-2 py-1 text-xs text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-primary"
                    />
                    <span className="text-slate-400 font-medium">To:</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="rounded-lg border border-brand-gray-border bg-white px-2 py-1 text-xs text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-primary"
                    />
                  </div>
                </div>

                {/* Active Filter Scope Indicator & Reset */}
                <div className="flex items-center gap-2">
                  {isDateFilterActive ? (
                    <div className="inline-flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-bold text-brand-primary">
                      <span>
                        Showing: {startDate && endDate && startDate === endDate
                          ? startDate
                          : `${startDate || 'Beginning'} → ${endDate || 'Present'}`}
                      </span>
                      <button
                        onClick={clearDateFilter}
                        className="p-0.5 rounded-full hover:bg-blue-200 text-brand-primary transition-colors cursor-pointer"
                        title="Clear date filter"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      <span>Showing: All Time</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Requests List Cards */}
            <div className="space-y-3">
              <div className="rounded-2xl border border-brand-gray-border bg-white px-6 py-4 shadow-ambient flex items-center justify-between">
                <h3 className="font-bold text-sm text-brand-text">Float Request Management Ledger</h3>
                <span className="text-xs font-semibold text-brand-text-variant">{filteredRequests.length} record(s)</span>
              </div>

              {filteredRequests.length === 0 ? (
                <div className="rounded-2xl border border-brand-gray-border bg-white p-12 text-center text-brand-text-variant shadow-ambient">
                  <Banknote className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                  <p className="font-bold text-sm text-brand-text">No float requests found</p>
                  <p className="text-xs mt-1">There are no float requests matching your current filters.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredRequests.map((r) => {
                    const badge = getStatusBadgeInfo(r);
                    const pendingDays = getPendingDays(r);
                    const resolutionDays = getResolutionDays(r);
                    const isMismatch = r.status === 'Returned' && getTotalReturned(r) !== r.requestedAmount;
                    const isShortfall = r.status === 'Returned' && getTotalReturned(r) < r.requestedAmount;

                    return (
                      <div
                        key={r.id}
                        className="rounded-2xl border border-brand-gray-border bg-white p-5 shadow-sm hover:shadow-md transition-shadow space-y-4"
                      >
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                          {/* Left column, top to bottom: */}
                          <div className="space-y-1.5 flex-1 min-w-0">
                            {/* 1. Owner name (bold) + status badge */}
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="font-bold text-base text-brand-text">{getOwnerName(r.ownerId)}</span>
                              <span className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-bold border ${badge.badgeClass}`}>
                                {badge.label}
                              </span>
                            </div>

                            {/* 2. Owner ID */}
                            <div className="text-xs text-brand-text-variant">
                              <span>Owner ID: <code className="font-mono text-slate-700 font-semibold">{r.ownerId}</code></span>
                            </div>

                            {/* 3. Two dates on one line: Requested & Returned (+ pending age / resolution duration) */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-brand-text-variant">
                              <span>Requested: <strong className="text-brand-text">{formatDate(r.requestedAt)}</strong></span>
                              <span>•</span>
                              {r.returnedAt ? (
                                <span>Returned: <strong className="text-brand-text">{formatDate(r.returnedAt)}</strong></span>
                              ) : (
                                <span className="text-amber-600 font-medium">Returned: Not yet returned</span>
                              )}
                              {((r.status === 'Pending' || r.status === 'Confirmed') && !r.loanId) ? (
                                <>
                                  <span>•</span>
                                  <span>Age: <strong className="text-brand-text">{pendingDays} day(s) pending</strong></span>
                                </>
                              ) : (
                                resolutionDays !== null ? (
                                  <>
                                    <span>•</span>
                                    <span>Age: <strong className="text-brand-text">Resolved in {resolutionDays} day(s)</strong></span>
                                  </>
                                ) : null
                              )}
                            </div>
                          </div>

                          {/* Right column (right-aligned): */}
                          <div className="flex flex-col items-start md:items-end gap-2.5 shrink-0">
                            {/* Amounts */}
                            <div className="flex items-center gap-4">
                              <div className="text-left md:text-right">
                                <p className="text-[11px] font-bold text-brand-text-variant uppercase tracking-wider">Requested</p>
                                <p className="text-lg font-black text-brand-primary">{formatCurrency(r.requestedAmount)}</p>
                              </div>

                              {r.returnedAt && (
                                <div className="text-left md:text-right pl-4 border-l border-brand-gray-border">
                                  <p className="text-[11px] font-bold text-brand-text-variant uppercase tracking-wider">Returned</p>
                                  <p className={`text-lg font-black ${isMismatch ? 'text-rose-600' : 'text-emerald-700'}`}>
                                    {formatCurrency(getTotalReturned(r))}
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* Receipt buttons as a compact wrapped row */}
                            {r.returnEntries && r.returnEntries.some(e => e.receiptPhotoId) && (
                              <div className="flex flex-wrap items-center justify-start md:justify-end gap-1.5">
                                {r.returnEntries.map(e => e.receiptPhotoId ? (
                                  <button
                                    key={e.id}
                                    onClick={() => handleViewReceipt(e.receiptPhotoId!)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-[11px] transition-colors cursor-pointer shadow-2xs"
                                  >
                                    <ImageIcon className="h-3.5 w-3.5 text-brand-primary" />
                                    Receipt ({e.channel === 'Other' ? (e.channelOther || 'Other') : e.channel})
                                  </button>
                                ) : null)}
                              </div>
                            )}

                            {/* Action Buttons & Loan Created tag */}
                            <div className="flex flex-wrap items-center justify-start md:justify-end gap-2 mt-0.5">
                              {!readOnly && r.status === 'Pending' && (
                                <button
                                  onClick={() => handleConfirm(r)}
                                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
                                >
                                  <Check className="h-4 w-4" />
                                  Confirm Request
                                </button>
                              )}

                              {r.status === 'Returned' && !r.loanId && (
                                <>
                                  {!readOnly && !isMismatch && (
                                    <button
                                      onClick={() => handleComplete(r)}
                                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs bg-brand-primary hover:bg-brand-primary-light text-white shadow-sm transition-colors cursor-pointer"
                                    >
                                      <CheckCircle className="h-4 w-4" />
                                      Complete Request
                                    </button>
                                  )}
                                  {!readOnly && isShortfall && r.shortfallReason && (
                                    <button
                                      onClick={() => handleApproveLoan(r)}
                                      title="Agree to owner's reason and convert shortfall into a loan"
                                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors cursor-pointer"
                                    >
                                      <Check className="h-4 w-4" />
                                      Agree — Create Loan
                                    </button>
                                  )}
                                  {!readOnly && isMismatch && (
                                    <button
                                      onClick={() => handleReject(r)}
                                      title="Reject return and request owner to resubmit correct amount"
                                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 transition-colors cursor-pointer shadow-xs"
                                    >
                                      <XCircle className="h-4 w-4 text-rose-600" />
                                      Reject & Request Resubmission
                                    </button>
                                  )}
                                </>
                              )}

                              {r.loanId && (
                                <span className="inline-flex items-center gap-1 text-xs font-extrabold text-indigo-700 bg-indigo-100 px-3 py-1.5 rounded-full border border-indigo-200">
                                  Loan Created
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Secondary Alert Rows: Shortfall Reason Banner */}
                        {r.status === 'Returned' && isShortfall && r.shortfallReason && !r.loanId && (
                          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs">
                            <p className="font-bold text-indigo-900 mb-0.5">Owner's Reason for Shortfall:</p>
                            <p className="text-indigo-800 italic">"{r.shortfallReason}"</p>
                          </div>
                        )}

                        {/* Secondary Alert Rows: Loan Resolution Tag */}
                        {r.loanId && (
                          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200">
                            Shortfall Resolved: Loan created against owner
                          </div>
                        )}

                        {/* Secondary Alert Rows: Rejection History Audit Note */}
                        {r.rejectedAt && (
                          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                            Previous return rejected on {formatDate(r.rejectedAt)}{r.rejectedByManagerName ? ` by ${r.rejectedByManagerName}` : ''}
                          </div>
                        )}

                        {/* Secondary Alert Rows: Mismatch Reconciliation Gate Alert */}
                        {isMismatch && !r.loanId && (
                          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            Amount Mismatch: Returned ({formatCurrency(getTotalReturned(r))}) does not match requested ({formatCurrency(r.requestedAmount)}).
                          </div>
                        )}

                        {/* Bottom border section for Attributed Manager & Deposit Channels */}
                        <div className="pt-3 mt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-brand-text-variant gap-2">
                          <div>
                            <span>Attributed Manager: <strong className="text-brand-text">{r.confirmedByManagerName || '—'}</strong></span>
                          </div>
                          {r.returnEntries && r.returnEntries.length > 0 && (
                            <div>
                              <span>
                                Deposit Channels: <strong className="text-brand-text">
                                  {r.returnEntries.map(e => e.channel === 'Other' ? (e.channelOther || 'Other') : e.channel).join(', ')}
                                </strong>
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Loans View */
          <div className="space-y-6">
            {/* Top Financial Summary Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-brand-gray-border bg-white p-5 shadow-ambient flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-brand-text-variant uppercase tracking-wider">Total Outstanding</p>
                  <p className="text-2xl font-black text-amber-600 mt-1">TZS {totalOutstandingFinancial.toLocaleString()}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Clock className="h-6 w-6" />
                </div>
              </div>

              <div className="rounded-2xl border border-brand-gray-border bg-white p-5 shadow-ambient flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-brand-text-variant uppercase tracking-wider">Total Loans Outstanding</p>
                  <p className="text-2xl font-black text-indigo-700 mt-1">TZS {totalLoansOutstandingFinancial.toLocaleString()}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Banknote className="h-6 w-6" />
                </div>
              </div>
            </div>

            {/* Owner Aggregated Summary Cards */}
            {ownerLoanSummary.length > 0 && (
              <div className="rounded-2xl border border-brand-gray-border bg-white shadow-ambient p-6 space-y-4">
                <h3 className="font-bold text-sm text-brand-text">Accumulated Loan Balance by Owner</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {ownerLoanSummary.map(item => (
                    <div key={item.ownerId} className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-sm text-brand-text">{getOwnerName(item.ownerId)}</p>
                        <p className="text-[11px] text-slate-500 font-mono">ID: {item.ownerId} • {item.count} loan(s)</p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-sm text-indigo-700">{formatCurrency(item.total)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Toolbar for Loans */}
            <div className="rounded-2xl border border-brand-gray-border bg-white p-4 shadow-ambient">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-brand-text-variant" />
                <input
                  type="text"
                  placeholder="Search loans by owner name, ID, or shortfall reason..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-xl bg-[#f0f2f5] pl-9 pr-4 py-2 text-xs text-brand-text border border-transparent outline-none focus:border-brand-primary focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Loan Records Table */}
            <div className="rounded-2xl border border-brand-gray-border bg-white shadow-ambient overflow-hidden">
              <div className="px-6 py-4 border-b border-brand-gray-border flex items-center justify-between bg-slate-50">
                <h3 className="font-bold text-sm text-brand-text">Loan Records Ledger</h3>
                <span className="text-xs font-semibold text-brand-text-variant">{filteredLoans.length} record(s)</span>
              </div>

              {filteredLoans.length === 0 ? (
                <div className="p-12 text-center text-brand-text-variant">
                  <FileText className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                  <p className="font-bold text-sm text-brand-text">No loan records found</p>
                  <p className="text-xs mt-1">There are no loans matching your search.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-3.5">Date Created</th>
                        <th className="px-6 py-3.5">Owner</th>
                        <th className="px-6 py-3.5">Loan Amount</th>
                        <th className="px-6 py-3.5">Stated Reason</th>
                        <th className="px-6 py-3.5">Status</th>
                        <th className="px-6 py-3.5">Approved By</th>
                        <th className="px-6 py-3.5">Original Float Request</th>
                        <th className="px-6 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {filteredLoans.map(loan => {
                        const originalReq = requests.find(r => r.id === loan.floatRequestId);
                        const status = loan.status || 'Outstanding';
                        return (
                          <tr key={loan.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap text-slate-600">
                              {formatDate(loan.createdAt)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <p className="font-bold text-brand-text">{getOwnerName(loan.ownerId)}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{loan.ownerId}</p>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap font-black text-indigo-700">
                              {formatCurrency(loan.amount)}
                            </td>
                            <td className="px-6 py-4 max-w-xs italic text-slate-600">
                              "{loan.reason || 'No explanation provided'}"
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {status === 'Paid' ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                                  <CheckCircle className="h-3 w-3" /> Paid
                                </span>
                              ) : status === 'Repayment Submitted' ? (
                                <div className="space-y-1">
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                                    <Clock className="h-3 w-3 text-amber-600" /> Repayment Submitted
                                  </span>
                                  {loan.repaidAmount !== undefined && (
                                    <p className="text-[10px] text-slate-600">
                                      Submitted: <strong className="text-slate-800">{formatCurrency(loan.repaidAmount)}</strong>
                                    </p>
                                  )}
                                  {loan.repaymentDescription && (
                                    <p className="text-[10px] text-slate-500 italic max-w-xs">
                                      "{loan.repaymentDescription}"
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200">
                                  <Clock className="h-3 w-3 text-rose-500" /> Outstanding
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-slate-800 font-semibold">
                              {loan.approvedByManagerName || 'System Admin'}
                              {loan.markedPaidByManagerName && (
                                <p className="text-[10px] text-slate-400 font-normal">
                                  Paid verified: {loan.markedPaidByManagerName}
                                </p>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-[11px] text-slate-500">
                              {originalReq ? (
                                <div>
                                  <span className="font-mono text-slate-700">Req: {formatCurrency(originalReq.requestedAmount)}</span>
                                  <span className="mx-1.5">•</span>
                                  <span className="font-mono text-emerald-700">Ret: {formatCurrency(getTotalReturned(originalReq))}</span>
                                </div>
                              ) : (
                                <span className="font-mono">{loan.floatRequestId}</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              {!readOnly && status === 'Repayment Submitted' && (
                                <button
                                  onClick={() => handleMarkLoanPaid(loan)}
                                  title="Confirm submitted repayment and mark loan as settled"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  Confirm Repayment & Mark Paid
                                </button>
                              )}
                              {!readOnly && status === 'Outstanding' && (
                                <span className="text-[11px] text-slate-400 font-medium">
                                  Awaiting owner repayment
                                </span>
                              )}
                              {status === 'Paid' && (
                                <span className="text-[11px] text-slate-400 font-medium">
                                  Settled {loan.paidAt ? formatDate(loan.paidAt) : ''}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Receipt Photo Modal */}
      <AnimatePresence>
        {previewPhoto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-brand-gray-border">
                <h3 className="font-bold text-base text-brand-text">Deposit Receipt Image</h3>
                <button
                  onClick={() => setPreviewPhoto(null)}
                  className="rounded-full p-1 hover:bg-slate-100 text-slate-500 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex justify-center bg-slate-100 rounded-2xl p-2 overflow-hidden border border-slate-200">
                <img
                  src={previewPhoto}
                  alt="Deposit Receipt"
                  className="max-h-96 object-contain rounded-xl"
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setPreviewPhoto(null)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 font-bold text-xs rounded-xl text-slate-700 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Reject Confirmation Modal */}
        {confirmRejectTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl"
            >
              <h3 className="font-bold text-base text-brand-text">Reject This Return?</h3>
              <p className="text-sm text-brand-text-variant">
                This will clear the submitted return of {formatCurrency(getTotalReturned(confirmRejectTarget))} and ask {getOwnerName(confirmRejectTarget.ownerId)} to resubmit the correct amount. This cannot be undone.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setConfirmRejectTarget(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-xs text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const manager = personnelList.find(p => p.id === selectedManagerId);
                    const mId = manager ? manager.id : (user?.email || 'float_manager');
                    const mName = manager ? manager.name : (user?.name || 'Float Manager');
                    rejectFloatReturn(confirmRejectTarget.id, mId, mName);
                    setConfirmRejectTarget(null);
                    loadData();
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 font-bold text-xs text-white cursor-pointer"
                >
                  Confirm Rejection
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

