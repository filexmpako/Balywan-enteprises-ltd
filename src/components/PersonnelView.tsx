import React, { useState, useMemo, useEffect } from 'react';
import { ViewType, Personnel } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import { 
  Users, 
  Search, 
  MapPin, 
  Activity, 
  UserPlus, 
  Filter, 
  Eye, 
  CheckCircle, 
  AlertTriangle,
  X,
  Layers,
  Calendar,
  Briefcase,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { assignTillsToPerson, recalculateAllPerformances } from '../utils/mappingEngine';

interface PersonnelViewProps {
  onNavigate: (view: ViewType) => void;
}

export default function PersonnelView({ onNavigate }: PersonnelViewProps) {
  const [personnel, setPersonnel] = useState<Personnel[]>(() => {
    const saved = localStorage.getItem('personnelList');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('personnelList', JSON.stringify(personnel));
  }, [personnel]);

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPersonId, setExpandedPersonId] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [selectedTitle, setSelectedTitle] = useState('All');
  
  // Add Personnel Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPerson, setNewPerson] = useState({
    name: '',
    title: 'Branch Manager',
    location: 'Dar es Salaam',
    status: 'Active' as Personnel['status']
  });

  const locations = ['All', 'Dar es Salaam', 'Arusha', 'Mwanza', 'Dodoma'];
  const statuses = ['All', 'Active', 'Pending', 'Suspended'];
  
  const nonMfsPersonnel = useMemo(() => {
    return personnel.filter(p => !p.title || p.title.trim().toUpperCase() !== 'MFS');
  }, [personnel]);

  const titles = useMemo(() => {
    const uniqueTitles = new Set<string>();
    nonMfsPersonnel.forEach(p => {
      if (p.title) uniqueTitles.add(p.title.trim());
    });
    return ['All', ...Array.from(uniqueTitles)];
  }, [nonMfsPersonnel]);

  const filteredPersonnel = useMemo(() => {
    return nonMfsPersonnel.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            p.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesLocation = selectedLocation === 'All' || p.location === selectedLocation;
      const matchesStatus = selectedStatus === 'All' || p.status === selectedStatus;
      const matchesTitle = selectedTitle === 'All' || p.title === selectedTitle;
      return matchesSearch && matchesLocation && matchesStatus && matchesTitle;
    });
  }, [nonMfsPersonnel, searchQuery, selectedLocation, selectedStatus, selectedTitle]);

  const handleAddPersonnelSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPerson.name) return;

    const addedPerson: Personnel = {
      id: `personnel-${Date.now()}`,
      name: newPerson.name,
      title: newPerson.title,
      location: newPerson.location,
      status: newPerson.status,
      memberSince: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
      lastSyncDate: new Date().toLocaleDateString('en-US') + ", " + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    };

    const updatedPersonnel = [addedPerson, ...personnel];
    setPersonnel(updatedPersonnel);
    localStorage.setItem('personnelList', JSON.stringify(updatedPersonnel));

    setShowAddModal(false);
    setNewPerson({
      name: '',
      title: 'Branch Manager',
      location: 'Dar es Salaam',
      status: 'Active'
    });
  };

  const getStatusBadgeClass = (status: Personnel['status']) => {
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

  // Compute stat counters
  const totalCount = nonMfsPersonnel.length;
  const activeCount = nonMfsPersonnel.filter(p => p.status === 'Active').length;
  const uniqueTillsCount = useMemo(() => {
    const tills = new Set<string>();
    nonMfsPersonnel.forEach(p => {
      if (p.assignedTill) {
        p.assignedTill.split(',').forEach(t => {
          if (t.trim()) tills.add(t.trim());
        });
      }
    });
    return tills.size;
  }, [nonMfsPersonnel]);
  const uniqueLocationsCount = new Set(nonMfsPersonnel.map(p => p.location)).size;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8"
    >
      {/* Header section with page title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-sans text-2xl sm:text-3xl font-extrabold tracking-tight text-brand-text">Personnel Management</h2>
          <p className="font-sans text-sm text-brand-text-variant mt-1">Audit, assign, and track operations personnel profiles across administrative channels.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 font-sans text-sm font-semibold text-white shadow-ambient hover:bg-brand-primary-light transition-all cursor-pointer self-start sm:self-auto"
          id="add-personnel-modal-btn"
        >
          <UserPlus className="h-4.5 w-4.5" />
          Add Personnel
        </button>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient">
          <div className="flex justify-between items-start">
            <div>
              <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Total Personnel</span>
              <span className="block font-sans text-2xl font-black text-brand-text mt-1">{totalCount}</span>
            </div>
            <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <span className="inline-block mt-3 font-sans text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
            Non-MFS Roles Ingested
          </span>
        </div>

        {/* Metric 2 */}
        <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient">
          <div className="flex justify-between items-start">
            <div>
              <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Active Status</span>
              <span className="block font-sans text-2xl font-black text-brand-primary mt-1">{activeCount}</span>
            </div>
            <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
              <CheckCircle className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex gap-2 font-sans text-[11px] text-brand-text-variant">
            <span className="font-bold text-emerald-600">
              {totalCount > 0 ? `${((activeCount / totalCount) * 100).toFixed(0)}%` : '0%'} Active Rate
            </span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient">
          <div className="flex justify-between items-start">
            <div>
              <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Associated Tills</span>
              <span className="block font-sans text-2xl font-black text-brand-text mt-1">{uniqueTillsCount}</span>
            </div>
            <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
              <Layers className="h-5 w-5" />
            </div>
          </div>
          <span className="inline-block mt-3 font-sans text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
            Direct Till Remappings
          </span>
        </div>

        {/* Metric 4 */}
        <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient">
          <div className="flex justify-between items-start">
            <div>
              <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Active Locations</span>
              <span className="block font-sans text-2xl font-black text-teal-600 mt-1">{uniqueLocationsCount}</span>
            </div>
            <div className="rounded-xl bg-teal-50 p-2.5 text-teal-600">
              <MapPin className="h-5 w-5" />
            </div>
          </div>
          <span className="inline-block mt-3 font-sans text-[11px] font-bold text-brand-text-variant">
            Regional distribution zones
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
              placeholder="Search by personnel name, title, or till number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl bg-brand-bg pl-10 pr-4 py-3 font-sans text-sm font-medium text-brand-text border-2 border-transparent focus:border-brand-primary focus:bg-white outline-none transition-all placeholder-brand-text-variant/70"
              id="personnel-search-input"
            />
          </div>

          {/* Filters dropdowns */}
          <div className="flex flex-wrap sm:flex-nowrap gap-3">
            <div className="flex items-center gap-1.5 rounded-xl bg-brand-bg px-3 py-1 border border-brand-gray-border">
              <MapPin className="h-4 w-4 text-brand-text-variant" />
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="bg-transparent font-sans text-xs font-semibold text-brand-text outline-none cursor-pointer"
                id="personnel-location-filter"
              >
                {locations.map(l => (
                  <option key={l} value={l}>{l === 'All' ? 'All Locations' : l}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 rounded-xl bg-brand-bg px-3 py-1 border border-brand-gray-border">
              <Briefcase className="h-4 w-4 text-brand-text-variant" />
              <select
                value={selectedTitle}
                onChange={(e) => setSelectedTitle(e.target.value)}
                className="bg-transparent font-sans text-xs font-semibold text-brand-text outline-none cursor-pointer max-w-[160px]"
                id="personnel-title-filter"
              >
                {titles.map(t => (
                  <option key={t} value={t}>{t === 'All' ? 'All Titles' : t}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 rounded-xl bg-brand-bg px-3 py-1 border border-brand-gray-border">
              <Activity className="h-4 w-4 text-brand-text-variant" />
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-transparent font-sans text-xs font-semibold text-brand-text outline-none cursor-pointer"
                id="personnel-status-filter"
              >
                {statuses.map(s => (
                  <option key={s} value={s}>{s === 'All' ? 'Status: All' : `Status: ${s}`}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Personnel Data Table */}
      <div className="rounded-2xl border border-brand-gray-border bg-brand-card overflow-hidden shadow-ambient">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-brand-gray-border bg-brand-gray-hover/50 font-sans text-[11px] font-bold text-brand-text-variant uppercase tracking-wider">
                <th className="px-6 py-4.5">Personnel</th>
                <th className="px-6 py-4.5">Title</th>
                <th className="px-6 py-4.5">Location</th>
                <th className="px-6 py-4.5">Registered Since</th>
                <th className="px-6 py-4.5">Status</th>
                <th className="px-6 py-4.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-gray-border/70">
              {filteredPersonnel.length > 0 ? (
                filteredPersonnel.map((person) => {
                  const isExpanded = expandedPersonId === person.id;
                  return (
                    <React.Fragment key={person.id}>
                      <tr 
                        className="hover:bg-brand-gray-hover/35 transition-colors group cursor-pointer"
                        onClick={() => setExpandedPersonId(isExpanded ? null : person.id)}
                      >
                        {/* Personnel Identity */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <img 
                              src={getAvatarUrl(person.name)} 
                              alt={person.name} 
                              className="h-10 w-10 rounded-xl object-cover ring-2 ring-teal-50 shrink-0" 
                            />
                            <div>
                              <h4 className="font-sans text-sm font-bold text-brand-text">
                                {person.name}
                              </h4>
                              <span className="font-sans text-[10px] font-medium text-brand-text-variant block mt-0.5">
                                ID: {person.id.split('-')[2] || 'New'}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Title */}
                        <td className="px-6 py-4">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs font-bold border border-slate-200">
                            <Briefcase className="h-3 w-3 text-slate-500" />
                            {person.title}
                          </div>
                        </td>

                        {/* Location */}
                        <td className="px-6 py-4 font-sans text-xs font-semibold text-brand-text">
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 text-brand-text-variant shrink-0" />
                            {person.location}
                          </div>
                        </td>

                        {/* Member Since */}
                        <td className="px-6 py-4 font-sans text-xs text-brand-text-variant">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            {person.memberSince || 'Jul 2026'}
                          </div>
                        </td>

                        {/* Status badge */}
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-sans text-[10px] font-bold tracking-wider ${getStatusBadgeClass(person.status)}`}>
                            {person.status}
                          </span>
                        </td>

                        {/* Expansion Chevron */}
                        <td className="px-6 py-4 text-right">
                          <div className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-slate-50 group-hover:bg-slate-100 transition-colors border border-slate-200/50">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-brand-primary" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-brand-text-variant" />
                            )}
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-50/50">
                          <td colSpan={6} className="px-8 py-6 border-b border-brand-gray-border">
                            <div className="space-y-4 font-sans max-w-4xl">
                              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-brand-gray-border/60 pb-3">
                                <div>
                                  <h4 className="text-xs font-black uppercase text-brand-primary tracking-wider font-mono">
                                    Personnel Staff Record
                                  </h4>
                                  <p className="text-[11px] text-brand-text-variant mt-0.5">
                                    Internal administrative profile details.
                                  </p>
                                </div>
                                <span className="text-[10px] font-mono font-black text-brand-text-variant bg-white border border-brand-gray-border px-2.5 py-1 rounded">
                                  LAST SYNC: {person.lastSyncDate || "Jul 8, 2026"}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="rounded-xl border border-brand-gray-border/80 bg-white p-4 shadow-sm">
                                  <span className="block text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Role Title</span>
                                  <span className="text-xs font-bold text-slate-800 block mt-1">{person.title}</span>
                                </div>
                                <div className="rounded-xl border border-brand-gray-border/80 bg-white p-4 shadow-sm">
                                  <span className="block text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Location</span>
                                  <span className="text-xs font-bold text-slate-800 block mt-1">{person.location}</span>
                                </div>
                                <div className="rounded-xl border border-brand-gray-border/80 bg-white p-4 shadow-sm">
                                  <span className="block text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Member Since</span>
                                  <span className="text-xs font-bold text-slate-800 block mt-1">{person.memberSince || 'Jul 2026'}</span>
                                </div>
                                <div className="rounded-xl border border-brand-gray-border/80 bg-white p-4 shadow-sm">
                                  <span className="block text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Account Status</span>
                                  <span className="text-xs font-bold text-slate-800 block mt-1">{person.status}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Users className="h-8 w-8 text-slate-300" />
                      {personnel.length === 0 ? (
                        <>
                          <p className="font-sans text-sm font-semibold text-brand-text-variant">No Operations Personnel Registered Yet.</p>
                          <p className="font-sans text-xs text-brand-text-variant/80 max-w-md mx-auto">
                            Upload and sync your authoritative Till Master Registry workbook containing non-MFS titles (like Managers, Agents, Assistants) to populate this ledger automatically, or add records manually above.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="font-sans text-sm font-semibold text-brand-text-variant">No personnel match your filter queries.</p>
                          <button 
                            onClick={() => {
                              setSearchQuery('');
                              setSelectedLocation('All');
                              setSelectedStatus('All');
                              setSelectedTitle('All');
                            }}
                            className="font-sans text-xs font-bold text-brand-primary underline"
                          >
                            Clear filters
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginated Footer Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-brand-gray-border bg-brand-gray-hover/20 px-6 py-4">
          <span className="font-sans text-xs text-brand-text-variant">
            Showing 1 to {filteredPersonnel.length} of {totalCount} profiles
          </span>
          <div className="flex items-center gap-1.5">
            <button className="rounded-lg border border-brand-gray-border bg-white p-2 font-sans text-xs font-bold text-brand-text-variant hover:bg-brand-gray-hover disabled:opacity-50" disabled>
              Prev
            </button>
            <button className="rounded-lg bg-brand-primary px-3 py-1.5 font-sans text-xs font-bold text-white">
              1
            </button>
            <button className="rounded-lg border border-brand-gray-border bg-white p-2 font-sans text-xs font-bold text-brand-text-variant hover:bg-brand-gray-hover disabled:opacity-50" disabled>
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Add New Personnel Modal */}
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
                  <h3 className="text-lg font-bold text-brand-text">Add Operations Personnel</h3>
                </div>
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg p-1 hover:bg-brand-gray-hover text-brand-text-variant"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleAddPersonnelSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Fatma Hassan"
                    value={newPerson.name}
                    onChange={(e) => setNewPerson({...newPerson, name: e.target.value})}
                    className="w-full rounded-xl bg-slate-50 border-2 border-transparent px-4 py-2.5 text-sm text-brand-text outline-none focus:border-brand-primary focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1">Title Designation</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Branch Manager"
                    value={newPerson.title}
                    onChange={(e) => setNewPerson({...newPerson, title: e.target.value})}
                    className="w-full rounded-xl bg-slate-50 border-2 border-transparent px-4 py-2.5 text-sm text-brand-text outline-none focus:border-brand-primary focus:bg-white transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1">Location / Zone</label>
                    <select
                      value={newPerson.location}
                      onChange={(e) => setNewPerson({...newPerson, location: e.target.value})}
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
                      value={newPerson.status}
                      onChange={(e) => setNewPerson({...newPerson, status: e.target.value as Personnel['status']})}
                      className="w-full rounded-xl bg-slate-50 border-2 border-transparent px-4 py-2.5 text-sm text-brand-text outline-none focus:border-brand-primary focus:bg-white transition-all cursor-pointer"
                    >
                      <option value="Active">Active</option>
                      <option value="Pending">Pending</option>
                      <option value="Suspended">Suspended</option>
                    </select>
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
                    Register Profile
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
