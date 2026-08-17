import React, { useState, useMemo, useEffect } from 'react';
import { ViewType, Owner } from '../types';
import { ownersList as initialOwners } from '../data';
import OwnerAvatar from './OwnerAvatar';
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
  Award
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useCompany } from './CompanyContext';

interface OwnersViewProps {
  onNavigate: (view: ViewType) => void;
  onSelectOwner: (name: string) => void;
}

export default function OwnersView({ onNavigate, onSelectOwner }: OwnersViewProps) {
  const { companyName } = useCompany();
  const [owners, setOwners] = useState<Owner[]>(() => {
    const saved = localStorage.getItem('ownersList');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return initialOwners;
  });

  useEffect(() => {
    localStorage.setItem('ownersList', JSON.stringify(owners));
  }, [owners]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [selectedPerformance, setSelectedPerformance] = useState('All');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Add Owner Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newOwner, setNewOwner] = useState({
    name: '',
    region: 'Dar es Salaam',
    wakalas: 10,
    portfolioSize: 'TZS 5.0M',
    portfolioGrowth: 'Not yet tracked',
    performance: 85,
    status: 'Active' as Owner['status']
  });

  const regions = ['All', 'Dar es Salaam', 'Arusha', 'Mwanza', 'Dodoma'];
  const statuses = ['All', 'Active', 'Pending', 'Suspended'];
  const performanceTiers = ['All', 'Top 20%', 'Below 70%'];

  const mfsOwners = useMemo(() => {
    return owners.filter(owner => !owner.title || owner.title.trim().toUpperCase() === 'MFS');
  }, [owners]);

  const filteredOwners = useMemo(() => {
    return mfsOwners.filter(owner => {
      const matchesSearch = owner.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            owner.masterAgentId.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRegion = selectedRegion === 'All' || owner.region === selectedRegion;
      const matchesStatus = selectedStatus === 'All' || owner.status === selectedStatus;
      const matchesPerf = selectedPerformance === 'All' || 
                          (selectedPerformance === 'Top 20%' && owner.performance >= 90) ||
                          (selectedPerformance === 'Below 70%' && owner.performance < 70);
      return matchesSearch && matchesRegion && matchesStatus && matchesPerf;
    });
  }, [mfsOwners, searchQuery, selectedRegion, selectedStatus, selectedPerformance]);

  const handleAddOwnerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOwner.name) return;

    const randomId = `MA-${Math.floor(10000 + Math.random() * 90000)}`;
    const addedOwner: Owner = {
      id: `owner-${Date.now()}`,
      name: newOwner.name,
      masterAgentId: randomId,
      region: newOwner.region,
      memberSince: 'Jul 2026',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      wakalas: Number(newOwner.wakalas),
      portfolioSize: newOwner.portfolioSize,
      portfolioGrowth: newOwner.portfolioGrowth,
      performance: Number(newOwner.performance),
      status: newOwner.status,
      title: 'MFS'
    };

    setOwners([addedOwner, ...owners]);
    setShowAddModal(false);
    setNewOwner({
      name: '',
      region: 'Dar es Salaam',
      wakalas: 10,
      portfolioSize: 'TZS 5.0M',
      portfolioGrowth: 'Not yet tracked',
      performance: 85,
      status: 'Active'
    });
  };

  const getStatusBadgeClass = (status: Owner['status']) => {
    switch (status) {
      case 'Active':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Pending':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Suspended':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  // Dynamic stats calculation
  const stats = useMemo(() => {
    const totalCount = mfsOwners.length;
    const activeCount = mfsOwners.filter(o => o.status === 'Active').length;
    const pendingCount = mfsOwners.filter(o => o.status === 'Pending').length;
    const activeRate = totalCount > 0 ? ((activeCount / totalCount) * 100).toFixed(1) : '0.0';

    // Total Tills / Wakalas
    const totalWakalas = mfsOwners.reduce((sum, o) => sum + (o.wakalas || 0), 0);

    // Portfolio Growth average
    const growths = mfsOwners.map(o => {
      const val = parseFloat(o.portfolioGrowth?.replace(/[+%]/g, '') || '');
      return isNaN(val) ? 0 : val;
    }).filter(v => v !== 0);
    const avgGrowth = growths.length > 0 ? (growths.reduce((sum, v) => sum + v, 0) / growths.length).toFixed(1) : '0.0';

    // High performers: performance >= 90%
    const highPerformers = mfsOwners.filter(o => o.performance >= 90).length;
    const highPerformersRate = totalCount > 0 ? ((highPerformers / totalCount) * 100).toFixed(0) : '0';

    // Growth subtext new this month (memberSince has current or latest month/year, e.g., 'Jul 2026')
    const newThisMonth = mfsOwners.filter(o => o.memberSince?.includes('Jul 2026') || o.memberSince?.includes('2026')).length;
    // Just a realistic percentage growth
    const growthPercentStr = totalCount > 0 ? `+${((newThisMonth / totalCount) * 100).toFixed(1)}%` : '+0.0%';

    return {
      totalCount,
      activeCount,
      pendingCount,
      activeRate,
      totalWakalas,
      avgGrowth,
      highPerformers,
      highPerformersRate,
      newThisMonth,
      growthPercentStr
    };
  }, [mfsOwners]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8"
    >
      {/* Header section with page title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-sans text-2xl sm:text-3xl font-extrabold tracking-tight text-brand-text">Owners Management</h2>
          <p className="font-sans text-sm text-brand-text-variant mt-1">Audit, monitor, and configure credentials across all {companyName} administrative regions.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 font-sans text-sm font-semibold text-white shadow-ambient hover:bg-brand-primary-light transition-all cursor-pointer self-start sm:self-auto"
          id="add-owner-modal-btn"
        >
          <UserPlus className="h-4.5 w-4.5" />
          Add New Owner
        </button>
      </div>

      {/* Stats Cards Row (Image 7 details) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient">
          <div className="flex justify-between items-start">
            <div>
              <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Total Owners</span>
              <span className="block font-sans text-2xl font-black text-brand-text mt-1">
                {stats.totalCount.toLocaleString()}
              </span>
            </div>
            <div className="rounded-xl bg-blue-50 p-2.5 text-brand-primary">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <span className="inline-block mt-3 font-sans text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
            {stats.growthPercentStr} (+{stats.newThisMonth} new this month)
          </span>
        </div>

        {/* Metric 2 */}
        <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient">
          <div className="flex justify-between items-start">
            <div>
              <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Active Master Agents</span>
              <span className="block font-sans text-2xl font-black text-brand-primary mt-1">
                {stats.activeCount.toLocaleString()}
              </span>
            </div>
            <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
              <CheckCircle className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex gap-2 font-sans text-[11px] text-brand-text-variant">
            <span className="font-bold text-emerald-600">{stats.activeRate}% Rate</span>
            <span>•</span>
            <span>{stats.pendingCount} Pending verification</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient">
          <div className="flex justify-between items-start">
            <div>
              <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Portfolio Growth</span>
              <span className="block font-sans text-2xl font-black text-brand-text mt-1">
                {parseFloat(stats.avgGrowth) > 0 ? `+${stats.avgGrowth}%` : `${stats.avgGrowth}%`}
              </span>
            </div>
            <div className="rounded-xl bg-amber-50 p-2.5 text-amber-600">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <span className="inline-block mt-3 font-sans text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
            Across {stats.totalWakalas} Registered Tills
          </span>
        </div>

        {/* Metric 4 */}
        <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient">
          <div className="flex justify-between items-start">
            <div>
              <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">High Performers</span>
              <span className="block font-sans text-2xl font-black text-emerald-600 mt-1">
                {stats.highPerformers.toLocaleString()}
              </span>
            </div>
            <div className="rounded-xl bg-amber-50 p-2.5 text-brand-accent-hover">
              <Award className="h-5 w-5" />
            </div>
          </div>
          <span className="inline-block mt-3 font-sans text-[11px] font-bold text-brand-text-variant">
            {stats.highPerformersRate}% of owners ({`>90%`} target)
          </span>
        </div>
      </div>

      {/* Filter and Search Bar Panel */}
      <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-4 shadow-ambient">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Search Field */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-brand-text-variant" />
            <input
              type="text"
              placeholder="Search by owner name, ID, or zone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl bg-brand-bg pl-10 pr-4 py-3 font-sans text-sm font-medium text-brand-text border-2 border-transparent focus:border-brand-primary focus:bg-white outline-none transition-all placeholder-brand-text-variant/70"
              id="owner-search-input"
            />
          </div>

          {/* Region Dropdown */}
          <div className="flex flex-wrap sm:flex-nowrap gap-3">
            <div className="flex items-center gap-1.5 rounded-xl bg-brand-bg px-3 py-1 border border-brand-gray-border">
              <MapPin className="h-4 w-4 text-brand-text-variant" />
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="bg-transparent font-sans text-xs font-semibold text-brand-text outline-none cursor-pointer"
                id="region-filter"
              >
                {regions.map(r => (
                  <option key={r} value={r}>{r === 'All' ? 'All Regions' : r}</option>
                ))}
              </select>
            </div>

            {/* Status Dropdown */}
            <div className="flex items-center gap-1.5 rounded-xl bg-brand-bg px-3 py-1 border border-brand-gray-border">
              <Activity className="h-4 w-4 text-brand-text-variant" />
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-transparent font-sans text-xs font-semibold text-brand-text outline-none cursor-pointer"
                id="status-filter"
              >
                {statuses.map(s => (
                  <option key={s} value={s}>{s === 'All' ? 'Status: All' : `Status: ${s}`}</option>
                ))}
              </select>
            </div>

            {/* Performance Dropdown */}
            <div className="flex items-center gap-1.5 rounded-xl bg-brand-bg px-3 py-1 border border-brand-gray-border">
              <Filter className="h-4 w-4 text-brand-text-variant" />
              <select
                value={selectedPerformance}
                onChange={(e) => setSelectedPerformance(e.target.value)}
                className="bg-transparent font-sans text-xs font-semibold text-brand-text outline-none cursor-pointer"
                id="performance-filter"
              >
                {performanceTiers.map(p => (
                  <option key={p} value={p}>{p === 'All' ? 'All Performance' : p}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Owners Data Table */}
      <div className="rounded-2xl border border-brand-gray-border bg-brand-card overflow-hidden shadow-ambient">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-brand-gray-border bg-brand-gray-hover/50 font-sans text-[11px] font-bold text-brand-text-variant uppercase tracking-wider">
                <th className="px-6 py-4.5">Owner</th>
                <th className="px-6 py-4.5">Master Agent ID</th>
                <th className="px-6 py-4.5">Portfolio Size</th>
                <th className="px-6 py-4.5">MTD Achievement</th>
                <th className="px-6 py-4.5">Performance %</th>
                <th className="px-6 py-4.5">Status</th>
                <th className="px-6 py-4.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-gray-border/70">
              {filteredOwners.length > 0 ? (
                filteredOwners.map((owner) => (
                  <tr 
                    key={owner.id}
                    className="hover:bg-brand-gray-hover/35 transition-colors group cursor-pointer"
                    onClick={() => {
                      onSelectOwner(owner.name);
                      onNavigate(ViewType.OWNER_DETAILS);
                    }}
                  >
                    {/* Owner Identity */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <OwnerAvatar 
                          ownerName={owner.name} 
                          avatarPhotoId={owner.avatarPhotoId} 
                          className="h-10 w-10 rounded-xl object-cover ring-2 ring-brand-primary/5 shrink-0" 
                        />
                        <div>
                          <h4 className="font-sans text-sm font-bold text-brand-text group-hover:text-brand-primary group-hover:underline transition-all">
                            {owner.name}
                          </h4>
                          <span className="font-sans text-[10px] font-medium text-brand-text-variant block mt-0.5">
                            {owner.workLocation?.address ? `Location: ${owner.workLocation.address}` : `Region: ${owner.region}`}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Master Agent ID */}
                    <td className="px-6 py-4 font-mono text-xs font-bold text-brand-text">
                      {owner.masterAgentId}
                    </td>

                    {/* Portfolio Size */}
                    <td className="px-6 py-4 font-sans text-xs font-semibold text-brand-text">
                      {owner.wakalas} Wakalas
                    </td>

                    {/* MTD Achievement */}
                    <td className="px-6 py-4">
                      <span className="font-sans text-xs font-bold text-brand-text block">{owner.portfolioSize}</span>
                      <span className={`font-mono text-[9px] font-semibold ${owner.portfolioGrowth?.startsWith('+') ? 'text-emerald-600' : owner.portfolioGrowth?.startsWith('-') ? 'text-rose-600' : 'text-slate-500'}`}>
                        {owner.portfolioGrowth}
                      </span>
                    </td>

                    {/* Performance Progress Gauge */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5 max-w-[140px]">
                        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${owner.performance >= 90 ? 'bg-emerald-500' : owner.performance >= 60 ? 'bg-brand-primary' : 'bg-rose-500'}`} 
                            style={{ width: `${owner.performance}%` }}
                          />
                        </div>
                        <span className="font-mono text-[11px] font-bold text-brand-text-variant w-8 text-right">
                          {owner.performance}%
                        </span>
                      </div>
                    </td>

                    {/* Status badge */}
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-sans text-[10px] font-bold tracking-wider ${getStatusBadgeClass(owner.status)}`}>
                        {owner.status}
                      </span>
                    </td>

                    {/* Action trigger */}
                    <td className="px-6 py-4 text-center">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectOwner(owner.name);
                          onNavigate(ViewType.OWNER_DETAILS);
                        }}
                        className="rounded-lg p-1.5 text-brand-text-variant hover:bg-brand-primary-container hover:text-brand-primary transition-all cursor-pointer"
                        title="View Details"
                      >
                        <Eye className="h-4.5 w-4.5" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Users className="h-8 w-8 text-slate-300" />
                      <p className="font-sans text-sm font-semibold text-brand-text-variant">No owners match your filter queries.</p>
                      <button 
                        onClick={() => {
                          setSearchQuery('');
                          setSelectedRegion('All');
                          setSelectedStatus('All');
                          setSelectedPerformance('All');
                        }}
                        className="font-sans text-xs font-bold text-brand-primary underline"
                      >
                        Clear filters
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginated Footer Controls (Image 7 details) */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-brand-gray-border bg-brand-gray-hover/20 px-6 py-4">
          <span className="font-sans text-xs text-brand-text-variant">
            Showing {filteredOwners.length > 0 ? 1 : 0} to {filteredOwners.length} of {owners.length} owners
          </span>
          <div className="flex items-center gap-1.5">
            <button className="rounded-lg border border-brand-gray-border bg-white p-2 font-sans text-xs font-bold text-brand-text-variant hover:bg-brand-gray-hover disabled:opacity-50" disabled>
              Prev
            </button>
            <button className="rounded-lg bg-brand-primary px-3 py-1.5 font-sans text-xs font-bold text-white">
              1
            </button>
            <button className="rounded-lg border border-transparent px-3 py-1.5 font-sans text-xs font-bold text-brand-text-variant hover:bg-brand-gray-hover">
              2
            </button>
            <button className="rounded-lg border border-transparent px-3 py-1.5 font-sans text-xs font-bold text-brand-text-variant hover:bg-brand-gray-hover">
              3
            </button>
            <span className="font-sans text-xs text-brand-text-variant px-1">...</span>
            <button className="rounded-lg border border-transparent px-3 py-1.5 font-sans text-xs font-bold text-brand-text-variant hover:bg-brand-gray-hover">
              128
            </button>
            <button className="rounded-lg border border-brand-gray-border bg-white p-2 font-sans text-xs font-bold text-brand-text-variant hover:bg-brand-gray-hover">
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Add New Owner Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-xs"
            />
            <motion.div 
              initial={{ scale: 0.95, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 20, opacity: 0 }}
              className="relative w-full max-w-lg rounded-2xl border border-brand-gray-border bg-white p-6 shadow-ambient-hover z-10 font-sans"
            >
              <div className="flex items-center justify-between border-b border-brand-gray-border pb-4">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-5.5 w-5.5 text-brand-primary" />
                  <h3 className="text-lg font-bold text-brand-text">Add New Master Agent Owner</h3>
                </div>
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg p-1 hover:bg-brand-gray-hover text-brand-text-variant"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleAddOwnerSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1">Full Owner Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Salim Rashid"
                    value={newOwner.name}
                    onChange={(e) => setNewOwner({...newOwner, name: e.target.value})}
                    className="w-full rounded-xl bg-slate-50 border-2 border-transparent px-4 py-2.5 text-sm text-brand-text outline-none focus:border-brand-primary focus:bg-white transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1">Region</label>
                    <select
                      value={newOwner.region}
                      onChange={(e) => setNewOwner({...newOwner, region: e.target.value})}
                      className="w-full rounded-xl bg-slate-50 border-2 border-transparent px-4 py-2.5 text-sm text-brand-text outline-none focus:border-brand-primary focus:bg-white transition-all cursor-pointer"
                    >
                      <option value="Dar es Salaam">Dar es Salaam</option>
                      <option value="Arusha">Arusha</option>
                      <option value="Mwanza">Mwanza</option>
                      <option value="Dodoma">Dodoma</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1">Status</label>
                    <select
                      value={newOwner.status}
                      onChange={(e) => setNewOwner({...newOwner, status: e.target.value as Owner['status']})}
                      className="w-full rounded-xl bg-slate-50 border-2 border-transparent px-4 py-2.5 text-sm text-brand-text outline-none focus:border-brand-primary focus:bg-white transition-all cursor-pointer"
                    >
                      <option value="Active">Active</option>
                      <option value="Pending">Pending</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1">Total Wakalas Served</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={newOwner.wakalas}
                      onChange={(e) => setNewOwner({...newOwner, wakalas: Number(e.target.value)})}
                      className="w-full rounded-xl bg-slate-50 border-2 border-transparent px-4 py-2.5 text-sm text-brand-text outline-none focus:border-brand-primary focus:bg-white transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1">Performance %</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      required
                      value={newOwner.performance}
                      onChange={(e) => setNewOwner({...newOwner, performance: Number(e.target.value)})}
                      className="w-full rounded-xl bg-slate-50 border-2 border-transparent px-4 py-2.5 text-sm text-brand-text outline-none focus:border-brand-primary focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1">Portfolio Size</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. TZS 15.0M"
                      value={newOwner.portfolioSize}
                      onChange={(e) => setNewOwner({...newOwner, portfolioSize: e.target.value})}
                      className="w-full rounded-xl bg-slate-50 border-2 border-transparent px-4 py-2.5 text-sm text-brand-text outline-none focus:border-brand-primary focus:bg-white transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1">MoM Growth</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. +5.4%"
                      value={newOwner.portfolioGrowth}
                      onChange={(e) => setNewOwner({...newOwner, portfolioGrowth: e.target.value})}
                      className="w-full rounded-xl bg-slate-50 border-2 border-transparent px-4 py-2.5 text-sm text-brand-text outline-none focus:border-brand-primary focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3 border-t border-brand-gray-border pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="rounded-xl border border-brand-gray-border px-4 py-2.5 font-sans text-sm font-semibold text-brand-text-variant hover:bg-brand-gray-hover"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-brand-primary px-5 py-2.5 font-sans text-sm font-semibold text-white hover:bg-brand-primary-light shadow-ambient"
                  >
                    Register Owner
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
