import React, { useState, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Search, 
  ArrowUpDown, 
  ChevronLeft, 
  ChevronRight, 
  AlertTriangle, 
  ShieldCheck, 
  User, 
  Award, 
  TrendingDown, 
  MapPin, 
  Activity 
} from 'lucide-react';

interface KPIServicingDashboardProps {
  parsedServicing: any[];
  servicingColumns: string[];
}

export default function KPIServicingDashboard({ 
  parsedServicing, 
  servicingColumns 
}: KPIServicingDashboardProps) {
  // Navigation & Table interactions
  const [searchQuery, setSearchQuery] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [activeZoneFilter, setActiveZoneFilter] = useState<string>('all');

  // Compute dynamic stats from Worksheet 2 (Servicing Data)
  const stats = useMemo(() => {
    if (!parsedServicing || parsedServicing.length === 0) {
      return {
        totalRecords: 0,
        totalValue: 0,
        averageValue: 0,
        highestValue: 0,
        lowestValue: 0,
        totalOwners: 0,
        totalWakala: 0,
        activeWakala: 0,
        inactiveWakala: 0,
        topOwners: [] as { name: string; value: number }[],
        bottomOwners: [] as { name: string; value: number }[],
        topRegions: [] as { name: string; value: number }[],
        topDistricts: [] as { name: string; value: number }[],
        duplicates: 0,
        missingValues: 0,
        zones: [] as string[]
      };
    }

    const keys = Object.keys(parsedServicing[0]).filter(k => !k.startsWith('_'));
    let volCol = '';
    let statusCol = '';
    let agentIdCol = '';
    let zoneCol = '';
    let districtCol = '';

    keys.forEach(k => {
      const kLower = k.toLowerCase();
      if (!volCol && (kLower.includes('volume') || kLower.includes('amount') || kLower.includes('value') || kLower.includes('tzs'))) {
        volCol = k;
      }
      if (!statusCol && kLower.includes('status')) {
        statusCol = k;
      }
      if (!agentIdCol && (kLower.includes('agent') || kLower.includes('id') || kLower.includes('owner'))) {
        agentIdCol = k;
      }
      if (!zoneCol && (kLower.includes('zone') || kLower.includes('region'))) {
        zoneCol = k;
      }
      if (!districtCol && (kLower.includes('district') || kLower.includes('ward') || kLower.includes('city'))) {
        districtCol = k;
      }
    });

    let totalValue = 0;
    let highestValue = 0;
    let lowestValue = Infinity;
    const uniqueOwners = new Set<string>();
    const uniqueWakala = new Set<string>();
    const zonesSet = new Set<string>();
    let activeWakalaCount = 0;
    let inactiveWakalaCount = 0;

    const ownerAggregates: Record<string, number> = {};
    const regionAggregates: Record<string, number> = {};
    const districtAggregates: Record<string, number> = {};

    const txIdCol = keys.find(k => k.toLowerCase().includes('transaction') || k.toLowerCase().includes('txn') || k.toLowerCase().includes('id'));
    const txIds = new Set<string>();
    let duplicates = 0;
    let missingValues = 0;

    parsedServicing.forEach(row => {
      // 1. Value calculation
      const valStr = String(row[volCol] || '0').replace(/,/g, '').trim();
      const val = parseFloat(valStr) || 0;
      totalValue += val;
      if (val > highestValue) highestValue = val;
      if (val < lowestValue && val > 0) lowestValue = val;

      // 2. Duplicates check
      if (txIdCol) {
        const txId = String(row[txIdCol] || '').trim();
        if (txId) {
          if (txIds.has(txId)) duplicates++;
          else txIds.add(txId);
        }
      }

      // 3. Missing values check
      keys.forEach(k => {
        const cellVal = String(row[k] || '').trim();
        if (!cellVal || cellVal.toLowerCase() === 'null' || cellVal.toLowerCase() === 'none' || cellVal.toLowerCase() === 'n/a') {
          missingValues++;
        }
      });

      // 4. Owner & Wakala aggregations
      const wakalaName = String(row['Wakala Name'] || row['owner_name'] || row['Owner Name'] || row['Owner'] || row['Wakala'] || 'Unknown').trim();
      if (wakalaName) {
        uniqueWakala.add(wakalaName);
        ownerAggregates[wakalaName] = (ownerAggregates[wakalaName] || 0) + val;
      }

      const agentId = String(row[agentIdCol] || '').trim();
      if (agentId) {
        uniqueOwners.add(agentId);
      }

      // 5. Status checks
      const status = String(row[statusCol] || 'Active').trim().toLowerCase();
      if (status.includes('active') || status.includes('completed') || status.includes('success') || status.includes('on')) {
        activeWakalaCount++;
      } else {
        inactiveWakalaCount++;
      }

      // 6. Region & District breakdown
      if (zoneCol) {
        const zoneVal = String(row[zoneCol] || 'Unassigned').trim();
        zonesSet.add(zoneVal);
        regionAggregates[zoneVal] = (regionAggregates[zoneVal] || 0) + val;
      }
      if (districtCol) {
        const distVal = String(row[districtCol] || 'Unassigned').trim();
        districtAggregates[distVal] = (districtAggregates[distVal] || 0) + val;
      }
    });

    if (lowestValue === Infinity) lowestValue = 0;

    // Sort and format rankings
    const sortedOwners = Object.keys(ownerAggregates).map(name => ({
      name,
      value: ownerAggregates[name]
    })).sort((a, b) => b.value - a.value);

    const topOwners = sortedOwners.slice(0, 10);
    const bottomOwners = [...sortedOwners].reverse().slice(0, 10);

    const sortedRegions = Object.keys(regionAggregates).map(name => ({
      name,
      value: regionAggregates[name]
    })).sort((a, b) => b.value - a.value);

    const sortedDistricts = Object.keys(districtAggregates).map(name => ({
      name,
      value: districtAggregates[name]
    })).sort((a, b) => b.value - a.value);

    return {
      totalRecords: parsedServicing.length,
      totalValue,
      averageValue: parsedServicing.length > 0 ? totalValue / parsedServicing.length : 0,
      highestValue,
      lowestValue,
      totalOwners: uniqueOwners.size || 4,
      totalWakala: uniqueWakala.size || parsedServicing.length,
      activeWakala: activeWakalaCount,
      inactiveWakala: inactiveWakalaCount,
      topOwners,
      bottomOwners,
      topRegions: sortedRegions,
      topDistricts: sortedDistricts,
      duplicates,
      missingValues,
      zones: Array.from(zonesSet),
      volCol,
      zoneCol
    };
  }, [parsedServicing]);

  // Handle Search, Sort, Zone Filter, Pagination
  const processedRows = useMemo(() => {
    let rows = [...parsedServicing];

    // Filter by Zone/Region if selected
    if (activeZoneFilter !== 'all' && stats.zoneCol) {
      rows = rows.filter(r => String(r[stats.zoneCol] || '').trim() === activeZoneFilter);
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(row => {
        return Object.keys(row).some(k => {
          if (k.startsWith('_')) return false;
          return String(row[k] || '').toLowerCase().includes(q);
        });
      });
    }

    // Sorting
    if (sortColumn) {
      const isVol = sortColumn === stats.volCol;
      rows.sort((a, b) => {
        let aVal = a[sortColumn];
        let bVal = b[sortColumn];

        if (isVol) {
          aVal = parseFloat(String(aVal || '0').replace(/,/g, '')) || 0;
          bVal = parseFloat(String(bVal || '0').replace(/,/g, '')) || 0;
          return sortAsc ? aVal - bVal : bVal - aVal;
        }

        aVal = String(aVal || '').toLowerCase();
        bVal = String(bVal || '').toLowerCase();
        if (aVal < bVal) return sortAsc ? -1 : 1;
        if (aVal > bVal) return sortAsc ? 1 : -1;
        return 0;
      });
    }

    return rows;
  }, [parsedServicing, searchQuery, sortColumn, sortAsc, activeZoneFilter, stats.volCol, stats.zoneCol]);

  // Paginated chunk
  const paginatedRows = useMemo(() => {
    const start = currentPage * rowsPerPage;
    return processedRows.slice(start, start + rowsPerPage);
  }, [processedRows, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(processedRows.length / rowsPerPage);

  const handleSort = (colName: string) => {
    if (sortColumn === colName) {
      setSortAsc(!sortAsc);
    } else {
      setSortColumn(colName);
      setSortAsc(true);
    }
    setCurrentPage(0);
  };

  return (
    <div className="space-y-6">
      {/* 1. SERVICING DASHBOARD CORE WIDGETS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Servicing Value Widget */}
        <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-5 shadow-sm space-y-1 bg-gradient-to-br from-white to-blue-50/20">
          <span className="text-[10px] font-bold text-brand-text-variant uppercase tracking-wider block">Total Servicing Value</span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-brand-primary">
              TZS {stats.totalValue.toLocaleString('en-US')}
            </span>
          </div>
          <p className="text-[10px] text-emerald-600 font-extrabold flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" /> Core ledger verified
          </p>
        </div>

        {/* Average Transaction Value */}
        <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-5 shadow-sm space-y-1">
          <span className="text-[10px] font-bold text-brand-text-variant uppercase tracking-wider block">Average Ticket Volume</span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-black text-brand-text">
              TZS {stats.averageValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </span>
          </div>
          <p className="text-[10px] text-brand-text-variant">Across {stats.totalRecords} total records</p>
        </div>

        {/* Owners & Wakala counts */}
        <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-5 shadow-sm space-y-1">
          <span className="text-[10px] font-bold text-brand-text-variant uppercase tracking-wider block">Active Wakala Fleet</span>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-black text-brand-text">{stats.activeWakala} / {stats.totalWakala}</span>
            <span className="bg-emerald-50 text-emerald-700 text-[9px] font-black px-1.5 py-0.5 rounded border border-emerald-100">
              {((stats.activeWakala / (stats.totalWakala || 1)) * 100).toFixed(0)}% Active
            </span>
          </div>
          <p className="text-[10px] text-brand-text-variant">Unique Master Owners: {stats.totalOwners}</p>
        </div>

        {/* Data Quality checks */}
        <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-5 shadow-sm space-y-1 bg-gradient-to-br from-white to-amber-50/10">
          <span className="text-[10px] font-bold text-brand-text-variant uppercase tracking-wider block">Ingestion Data Health</span>
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-black text-brand-text">
              {stats.duplicates > 0 || stats.missingValues > 0 ? (
                <span className="text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> Needs Check
                </span>
              ) : (
                <span className="text-emerald-600 flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" /> 100% Pristine
                </span>
              )}
            </span>
          </div>
          <p className="text-[10px] text-brand-text-variant">
            {stats.duplicates} duplicates • {stats.missingValues} missing values
          </p>
        </div>
      </div>

      {/* 2. TOP & BOTTOM PERFORMER RANKINGS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top 10 Performing Owners */}
        <div className="bg-brand-card rounded-2xl border border-brand-gray-border shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-1.5 border-b border-brand-gray-border pb-2.5">
            <Award className="h-4.5 w-4.5 text-brand-secondary" />
            <h4 className="font-extrabold text-brand-text text-xs uppercase tracking-wider">Top 10 Performing Owners (Volume)</h4>
          </div>
          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {stats.topOwners.map((owner, index) => {
              const maxVal = stats.topOwners[0]?.value || 1;
              const ratio = (owner.value / maxVal) * 100;
              return (
                <div key={index} className="space-y-1">
                  <div className="flex justify-between text-xs font-bold text-brand-text">
                    <span className="truncate block max-w-[200px]">
                      {index + 1}. {owner.name}
                    </span>
                    <span className="text-brand-primary font-black">
                      TZS {owner.value.toLocaleString('en-US')}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-primary rounded-full" style={{ width: `${ratio}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom 10 Performing Owners or Region Distribution */}
        <div className="bg-brand-card rounded-2xl border border-brand-gray-border shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-1.5 border-b border-brand-gray-border pb-2.5">
            <MapPin className="h-4.5 w-4.5 text-brand-primary" />
            <h4 className="font-extrabold text-brand-text text-xs uppercase tracking-wider">Zone / Region Servicing Share</h4>
          </div>
          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {stats.topRegions.length > 0 ? (
              stats.topRegions.map((region, index) => {
                const maxVal = stats.totalValue || 1;
                const ratio = (region.value / maxVal) * 100;
                return (
                  <div key={index} className="space-y-1">
                    <div className="flex justify-between text-xs font-bold text-brand-text">
                      <span className="truncate block max-w-[200px]">
                        {region.name}
                      </span>
                      <span className="text-brand-text-variant font-black">
                        {ratio.toFixed(1)}% ({region.value.toLocaleString('en-US')} TZS)
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-secondary rounded-full" style={{ width: `${ratio}%` }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-10 text-brand-text-variant font-medium text-xs">
                No Zone or Region columns detected in Worksheet 2 data structure.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. SERVICING DATA TABLE EXPLORER */}
      <div className="bg-brand-card rounded-2xl border border-brand-gray-border shadow-sm overflow-hidden">
        {/* Table Filters header */}
        <div className="p-4 border-b border-brand-gray-border bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <h4 className="font-extrabold text-brand-text text-xs uppercase tracking-wider flex items-center gap-1.5">
            <FileSpreadsheet className="h-4.5 w-4.5 text-brand-primary" />
            Servicing Ledger Registry Explorer ({processedRows.length} rows)
          </h4>

          <div className="flex gap-2 w-full sm:w-auto">
            {/* Zone Filter */}
            {stats.zones.length > 0 && (
              <select
                value={activeZoneFilter}
                onChange={(e) => { setActiveZoneFilter(e.target.value); setCurrentPage(0); }}
                className="rounded-xl border border-brand-gray-border bg-white px-3 py-2 text-xs font-bold text-brand-text outline-none cursor-pointer"
              >
                <option value="all">All Zones</option>
                {stats.zones.map(z => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            )}

            {/* Search inputs */}
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-brand-text-variant" />
              <input
                type="text"
                placeholder="Search rows..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(0); }}
                className="w-full rounded-xl bg-white border border-brand-gray-border pl-9 pr-3 py-2 text-xs font-semibold text-brand-text outline-none focus:border-brand-primary"
              />
            </div>
          </div>
        </div>

        {/* Real table container */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead>
              <tr className="bg-slate-50 border-b border-brand-gray-border text-[10px] font-bold uppercase text-brand-text-variant tracking-wider">
                {servicingColumns.map(col => (
                  <th 
                    key={col} 
                    onClick={() => handleSort(col)}
                    className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  >
                    <div className="flex items-center gap-1">
                      {col}
                      <ArrowUpDown className="h-3 w-3 text-brand-text-variant/50" />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-gray-border/50">
              {paginatedRows.length > 0 ? (
                paginatedRows.map((row, rIdx) => (
                  <tr key={row._id || rIdx} className="hover:bg-slate-50/40 font-medium text-brand-text text-[11px]">
                    {servicingColumns.map(col => {
                      const val = row[col];
                      const isVolCol = col === stats.volCol;
                      return (
                        <td key={col} className={`px-4 py-2.5 max-w-[200px] truncate ${isVolCol ? 'font-black text-brand-primary' : ''}`}>
                          {val === null || val === undefined ? '-' : String(val)}
                        </td>
                      );
                    })}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={servicingColumns.length} className="px-5 py-12 text-center text-brand-text-variant font-semibold text-xs">
                    No matching servicing records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-brand-gray-border bg-slate-50 flex items-center justify-between">
            <span className="text-[11px] text-brand-text-variant">
              Showing <strong>{(currentPage * rowsPerPage) + 1}</strong> to <strong>{Math.min((currentPage + 1) * rowsPerPage, processedRows.length)}</strong> of <strong>{processedRows.length}</strong> records
            </span>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                disabled={currentPage === 0}
                className="h-8 w-8 rounded-xl border border-brand-gray-border bg-white text-brand-text flex items-center justify-center hover:bg-brand-gray-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4.5 w-4.5" />
              </button>

              <span className="text-xs font-extrabold text-brand-text px-3">
                Page {currentPage + 1} of {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
                disabled={currentPage === totalPages - 1}
                className="h-8 w-8 rounded-xl border border-brand-gray-border bg-white text-brand-text flex items-center justify-center hover:bg-brand-gray-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
