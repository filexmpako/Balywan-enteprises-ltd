import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import { 
  MapPin, 
  User, 
  ExternalLink, 
  Image as ImageIcon, 
  Map, 
  Loader2,
  Search,
  Filter,
  X,
  Store
} from 'lucide-react';
import PageHeaderBanner from './PageHeaderBanner';
import { Owner, WakalaEntry } from '../types';
import { formatDate } from '../utils/dateFormat';
import { getPhotosByOwner, WorkPhoto } from '../utils/db';

interface AdminFieldMapViewProps {
  onSelectOwner: (name: string) => void;
  onNavigate: (view: any) => void;
}

export interface MapEntity {
  id: string;
  type: 'OWNER' | 'WAKALA';
  wakalaType?: 'base' | 'iop';
  name: string;
  lat: number;
  lng: number;
  ownerName: string;
  district?: string;
  siteId?: string;
  code?: string;
  msisdn?: string;
  address?: string;
  avatar?: string;
  photoId?: string;
  capturedAt?: string;
  isCaptured: boolean;
  locationTier?: 'captured' | 'owner_approx' | 'default_anchor';
  wakala?: WakalaEntry;
  owner?: Owner;
}

// Leaflet custom marker icons by entity type and tier
const getEntityMarkerIcon = (
  type: 'OWNER' | 'WAKALA', 
  wakalaType?: 'base' | 'iop', 
  locationTier: 'captured' | 'owner_approx' | 'default_anchor' = 'captured'
) => {
  if (type === 'OWNER') {
    return new L.Icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
      className: locationTier === 'owner_approx' ? 'leaflet-marker-approx-owner' : locationTier === 'default_anchor' ? 'leaflet-marker-default-anchor' : ''
    });
  }

  if (locationTier === 'default_anchor') {
    return new L.Icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
      className: 'leaflet-marker-default-anchor'
    });
  }

  const iconUrl = wakalaType === 'base'
    ? 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png'
    : 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png';

  return new L.Icon({
    iconUrl,
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
    className: locationTier === 'owner_approx' ? 'leaflet-marker-approx-owner' : ''
  });
};

// Component to dynamically fit map bounds to visible pins
function MapBoundsUpdater({ entities }: { entities: MapEntity[] }) {
  const map = useMap();

  useEffect(() => {
    if (entities.length === 0) return;
    if (entities.length === 1) {
      map.setView([entities[0].lat, entities[0].lng], 14, { animate: true });
      return;
    }
    const bounds = L.latLngBounds(entities.map(e => [e.lat, e.lng]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true });
  }, [entities, map]);

  return null;
}

export default function AdminFieldMapView({ onSelectOwner, onNavigate }: AdminFieldMapViewProps) {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [entities, setEntities] = useState<MapEntity[]>([]);
  const [photosMap, setPhotosMap] = useState<Record<string, WorkPhoto[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOwner, setSelectedOwner] = useState('ALL');
  const [selectedDistrict, setSelectedDistrict] = useState('ALL');
  const [selectedSiteId, setSelectedSiteId] = useState('ALL');
  const [entityTypeFilter, setEntityTypeFilter] = useState<'ALL' | 'IOP' | 'WAKALA'>('ALL');
  const [capturedOnlyFilter, setCapturedOnlyFilter] = useState(false);

  useEffect(() => {
    // Load all owners from localStorage
    const saved = localStorage.getItem('ownersList');
    let loadedOwners: Owner[] = [];
    if (saved) {
      try {
        loadedOwners = JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse owners list:', e);
      }
    }

    setOwners(loadedOwners);

    // Extract Map Entities (Owners + Wakalas)
    const defaultLat = -6.7924; // Dar es Salaam
    const defaultLng = 39.2083;

    const extractedEntities: MapEntity[] = [];

    loadedOwners.forEach((owner) => {
      const ownerId = owner.id || owner.name;
      const hasOwnerLocation = !!owner.workLocation && typeof owner.workLocation.lat === 'number' && typeof owner.workLocation.lng === 'number';
      const ownerBaseLat = owner.workLocation?.lat ?? defaultLat;
      const ownerBaseLng = owner.workLocation?.lng ?? defaultLng;

      // 1. Owner Entity (only if owner has its own workLocation)
      if (hasOwnerLocation && owner.workLocation) {
        extractedEntities.push({
          id: `owner-${ownerId}`,
          type: 'OWNER',
          name: owner.name,
          lat: owner.workLocation.lat,
          lng: owner.workLocation.lng,
          ownerName: owner.name,
          district: owner.region,
          address: owner.workLocation.address,
          avatar: owner.avatar,
          capturedAt: owner.workLocation.capturedAt,
          isCaptured: true,
          locationTier: 'captured',
          owner
        });
      }

      // 2. Base Wakalas
      (owner.baseWakalas || []).forEach((w, idx) => {
        let lat = 0;
        let lng = 0;
        let locationTier: 'captured' | 'owner_approx' | 'default_anchor' = 'captured';

        if (w.location && typeof w.location.lat === 'number' && typeof w.location.lng === 'number') {
          lat = w.location.lat;
          lng = w.location.lng;
          locationTier = 'captured';
        } else {
          let hash = 0;
          const str = w.msisdn || w.id || `${idx}`;
          for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
          }
          const latOffset = (((Math.abs(hash) % 80) - 40) * 0.0035);
          const lngOffset = (((Math.abs(hash >> 3) % 80) - 40) * 0.0035);

          if (hasOwnerLocation) {
            lat = ownerBaseLat + latOffset;
            lng = ownerBaseLng + lngOffset;
            locationTier = 'owner_approx';
          } else {
            lat = defaultLat + latOffset;
            lng = defaultLng + lngOffset;
            locationTier = 'default_anchor';
          }
        }

        extractedEntities.push({
          id: `wakala-base-${w.id}`,
          type: 'WAKALA',
          wakalaType: 'base',
          name: w.name,
          lat,
          lng,
          ownerName: owner.name,
          district: w.district || w.region || owner.region,
          siteId: w.siteId,
          code: w.code,
          msisdn: w.msisdn,
          capturedAt: w.location?.capturedAt,
          isCaptured: locationTier === 'captured',
          locationTier,
          wakala: w,
          owner
        });
      });

      // 3. IOP Wakalas
      (owner.iopWakalas || []).forEach((w, idx) => {
        let lat = 0;
        let lng = 0;
        let locationTier: 'captured' | 'owner_approx' | 'default_anchor' = 'captured';

        if (w.location && typeof w.location.lat === 'number' && typeof w.location.lng === 'number') {
          lat = w.location.lat;
          lng = w.location.lng;
          locationTier = 'captured';
        } else {
          let hash = 0;
          const str = w.msisdn || w.id || `${idx + 500}`;
          for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
          }
          const latOffset = (((Math.abs(hash) % 80) - 40) * 0.0035);
          const lngOffset = (((Math.abs(hash >> 3) % 80) - 40) * 0.0035);

          if (hasOwnerLocation) {
            lat = ownerBaseLat + latOffset;
            lng = ownerBaseLng + lngOffset;
            locationTier = 'owner_approx';
          } else {
            lat = defaultLat + latOffset;
            lng = defaultLng + lngOffset;
            locationTier = 'default_anchor';
          }
        }

        extractedEntities.push({
          id: `wakala-iop-${w.id}`,
          type: 'WAKALA',
          wakalaType: 'iop',
          name: w.name,
          lat,
          lng,
          ownerName: owner.name,
          district: w.region || owner.region,
          msisdn: w.msisdn,
          capturedAt: w.location?.capturedAt,
          isCaptured: locationTier === 'captured',
          locationTier,
          wakala: w,
          owner
        });
      });
    });

    setEntities(extractedEntities);

    // Load photos for each owner with a location
    const loadAllPhotos = async () => {
      const activeOwners = loadedOwners.filter(o => !!o.workLocation);
      const tempPhotosMap: Record<string, WorkPhoto[]> = {};
      
      try {
        for (const owner of activeOwners) {
          const ownerId = owner.id || owner.name;
          const photos = await getPhotosByOwner(ownerId);
          tempPhotosMap[ownerId] = photos;
        }
        setPhotosMap(tempPhotosMap);
      } catch (err) {
        console.error('Failed to pre-fetch owner workplace photos:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadAllPhotos();
  }, []);

  // Filter options lists
  const uniqueOwnersList = Array.from(new Set(entities.map(e => e.ownerName))).sort();
  const uniqueDistrictsList = Array.from(
    new Set(entities.map(e => e.district).filter((d): d is string => !!d))
  ).sort();
  const uniqueSiteIdsList = Array.from(
    new Set(entities.map(e => e.siteId).filter((s): s is string => !!s))
  ).sort();

  // Filtered Map Entities
  const filteredEntities = entities.filter(entity => {
    // Search Term Filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchName = entity.name.toLowerCase().includes(q);
      const matchOwner = entity.ownerName.toLowerCase().includes(q);
      const matchCode = entity.code?.toLowerCase().includes(q) ?? false;
      const matchSiteId = entity.siteId?.toLowerCase().includes(q) ?? false;
      const matchMsisdn = entity.msisdn?.includes(q) ?? false;
      const matchDistrict = entity.district?.toLowerCase().includes(q) ?? false;

      if (!matchName && !matchOwner && !matchCode && !matchSiteId && !matchMsisdn && !matchDistrict) {
        return false;
      }
    }

    // Captured-Only Filter
    if (capturedOnlyFilter && entity.locationTier !== 'captured') {
      return false;
    }

    // Entity Type Filter
    if (entityTypeFilter === 'IOP' && entity.wakalaType !== 'iop') {
      return false;
    }
    if (entityTypeFilter === 'WAKALA' && entity.type !== 'WAKALA') {
      return false;
    }

    // Owner Filter
    if (selectedOwner !== 'ALL' && entity.ownerName !== selectedOwner) {
      return false;
    }

    // District Filter
    if (selectedDistrict !== 'ALL' && entity.district !== selectedDistrict) {
      return false;
    }

    // Site ID Filter
    if (selectedSiteId !== 'ALL' && entity.siteId !== selectedSiteId) {
      return false;
    }

    return true;
  });

  // Default Map center
  const defaultLat = -6.7924;
  const defaultLng = 39.2083;

  const mapCenter: [number, number] = (() => {
    if (filteredEntities.length === 0) return [defaultLat, defaultLng];
    const avgLat = filteredEntities.reduce((sum, e) => sum + e.lat, 0) / filteredEntities.length;
    const avgLng = filteredEntities.reduce((sum, e) => sum + e.lng, 0) / filteredEntities.length;
    return [avgLat, avgLng];
  })();

  const handleViewProfile = (name: string) => {
    onSelectOwner(name);
  };

  const ownerPinsCount = filteredEntities.filter(e => e.type === 'OWNER').length;
  const wakalaPinsCount = filteredEntities.filter(e => e.type === 'WAKALA').length;

  const capturedCount = filteredEntities.filter(e => e.locationTier === 'captured').length;

  if (isLoading) {
    return (
      <div className="flex h-[500px] flex-col items-center justify-center p-6 text-center font-sans">
        <Loader2 className="h-10 w-10 animate-spin text-brand-primary" />
        <p className="mt-4 font-sans text-xs font-semibold text-brand-text-variant uppercase tracking-widest">
          Loading field map entities and geographical coordinates...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <style>{`
        .leaflet-marker-approx-owner {
          opacity: 0.65 !important;
          filter: drop-shadow(0 0 3px rgba(245, 158, 11, 0.6));
        }
        .leaflet-marker-default-anchor {
          opacity: 0.45 !important;
          filter: grayscale(100%);
        }
      `}</style>

      {/* Page Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <PageHeaderBanner
          icon={Map}
          title="Field Map"
          subtitle="Geographical site verification and Wakala distribution network across Tanzania"
        />

        {/* Coverage Stat Badges */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 shrink-0">
          <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 px-3 py-2 rounded-xl text-purple-900 shadow-xs shrink-0">
            <User className="h-4 w-4 text-purple-600" />
            <div className="font-sans text-xs font-bold leading-none">
              <span>{ownerPinsCount}</span>
              <span className="text-[10px] text-purple-600 font-normal ml-1">Owner Bases</span>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-2 rounded-xl text-blue-900 shadow-xs shrink-0">
            <Store className="h-4 w-4 text-blue-600" />
            <div className="font-sans text-xs font-bold leading-none">
              <span>{wakalaPinsCount}</span>
              <span className="text-[10px] text-blue-600 font-normal ml-1">Wakala</span>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-brand-card px-3.5 py-2 rounded-xl border border-brand-gray-border shadow-xs shrink-0 font-sans text-xs font-bold text-brand-text">
            <span>{filteredEntities.length} Total</span>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() => setCapturedOnlyFilter(prev => !prev)}
              className={`font-semibold cursor-pointer transition-colors ${
                capturedOnlyFilter ? 'text-white bg-emerald-600 px-1.5 py-0.5 rounded' : 'text-emerald-700 hover:text-emerald-800'
              }`}
            >
              {capturedCount} Captured
            </button>
          </div>
        </div>
      </div>

      {/* Filter Control Bar */}
      <div className="bg-brand-card p-4 rounded-2xl border border-brand-gray-border shadow-ambient space-y-3 font-sans">
        <div className="flex items-center justify-between border-b border-brand-gray-border pb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-brand-text uppercase tracking-wider">
            <Filter className="h-4 w-4 text-brand-primary" />
            Field Network Filters
          </div>

          {(searchTerm || selectedOwner !== 'ALL' || selectedDistrict !== 'ALL' || selectedSiteId !== 'ALL' || entityTypeFilter !== 'ALL' || capturedOnlyFilter) && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedOwner('ALL');
                setSelectedDistrict('ALL');
                setSelectedSiteId('ALL');
                setEntityTypeFilter('ALL');
                setCapturedOnlyFilter(false);
              }}
              className="flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-700 transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
              Reset Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* Search Term Input */}
          <div className="relative">
            <label className="block text-[10px] font-bold text-brand-text-variant uppercase mb-1">Search Agent / Code</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Name, Code, MSISDN, Site ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-brand-gray-border bg-brand-gray-hover/20 p-2 pl-8 text-xs text-brand-text focus:outline-none focus:border-brand-primary"
              />
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            </div>
          </div>

          {/* Owner Filter */}
          <div>
            <label className="block text-[10px] font-bold text-brand-text-variant uppercase mb-1">Filter by Owner</label>
            <select
              value={selectedOwner}
              onChange={(e) => setSelectedOwner(e.target.value)}
              className="w-full rounded-xl border border-brand-gray-border bg-white p-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary cursor-pointer"
            >
              <option value="ALL">All Owners ({uniqueOwnersList.length})</option>
              {uniqueOwnersList.map(ownerName => (
                <option key={ownerName} value={ownerName}>{ownerName}</option>
              ))}
            </select>
          </div>

          {/* District Filter */}
          <div>
            <label className="block text-[10px] font-bold text-brand-text-variant uppercase mb-1">Filter by District / Region</label>
            <select
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              className="w-full rounded-xl border border-brand-gray-border bg-white p-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary cursor-pointer"
            >
              <option value="ALL">All Districts / Regions ({uniqueDistrictsList.length})</option>
              {uniqueDistrictsList.map(dist => (
                <option key={dist} value={dist}>{dist}</option>
              ))}
            </select>
          </div>

          {/* Site ID Filter */}
          <div>
            <label className="block text-[10px] font-bold text-brand-text-variant uppercase mb-1">Filter by Site ID</label>
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="w-full rounded-xl border border-brand-gray-border bg-white p-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary cursor-pointer"
            >
              <option value="ALL">All Sites ({uniqueSiteIdsList.length})</option>
              {uniqueSiteIdsList.map(siteId => (
                <option key={siteId} value={siteId}>{siteId}</option>
              ))}
            </select>
          </div>

          {/* Entity Type Filter */}
          <div>
            <label className="block text-[10px] font-bold text-brand-text-variant uppercase mb-1">Entity Type</label>
            <select
              value={entityTypeFilter}
              onChange={(e) => setEntityTypeFilter(e.target.value as 'ALL' | 'IOP' | 'WAKALA')}
              className="w-full rounded-xl border border-brand-gray-border bg-white p-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary cursor-pointer"
            >
              <option value="ALL">All</option>
              <option value="IOP">IOP</option>
              <option value="WAKALA">Wakalas</option>
            </select>
          </div>
        </div>
      </div>

      {/* Empty State vs Map */}
      {filteredEntities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-brand-card rounded-2xl border border-brand-gray-border shadow-ambient text-center px-4 font-sans">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 text-brand-text-variant/40 border border-brand-gray-border mb-4">
            <MapPin className="h-8 w-8" />
          </div>
          <h3 className="font-sans text-base font-bold text-brand-text">No network pins match your criteria</h3>
          <p className="font-sans text-xs text-brand-text-variant max-w-sm mt-1">
            Try resetting your search query, owner filter, or district filter to view pins on the map.
          </p>
          <button
            onClick={() => {
              setSearchTerm('');
              setSelectedOwner('ALL');
              setSelectedDistrict('ALL');
              setSelectedSiteId('ALL');
              setEntityTypeFilter('ALL');
              setCapturedOnlyFilter(false);
            }}
            className="mt-4 rounded-xl bg-brand-primary px-4 py-2 text-xs font-bold text-white shadow-ambient hover:bg-brand-primary-light transition-all cursor-pointer"
          >
            Clear All Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          <div className="relative h-[650px] w-full rounded-2xl overflow-hidden border border-brand-gray-border shadow-ambient bg-brand-gray-hover z-10">
            <MapContainer 
              center={mapCenter} 
              zoom={filteredEntities.length === 1 ? 14 : 10} 
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <MapBoundsUpdater entities={filteredEntities} />
              
              <MarkerClusterGroup>
                {filteredEntities.map((entity) => {
                const markerIcon = getEntityMarkerIcon(entity.type, entity.wakalaType, entity.locationTier);

                return (
                  <Marker 
                    key={entity.id} 
                    position={[entity.lat, entity.lng]} 
                    icon={markerIcon}
                  >
                    <Popup maxWidth={300}>
                      {entity.type === 'OWNER' ? (
                        /* OWNER POPUP CARD */
                        <div className="font-sans p-1.5 space-y-3 min-w-[240px]">
                          <div className="flex items-center gap-2.5 border-b border-brand-gray-border pb-2">
                            <img 
                              src={entity.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80'} 
                              alt={entity.name} 
                              className="h-9 w-9 rounded-lg object-cover ring-2 ring-purple-500/20"
                              referrerPolicy="no-referrer"
                            />
                            <div>
                              <h4 className="font-sans text-xs font-black text-brand-text leading-tight">{entity.name}</h4>
                            </div>
                          </div>

                          {entity.address && (
                            <div className="space-y-1 bg-brand-gray-hover/50 border border-brand-gray-border/40 p-2 rounded-lg">
                              <span className="block font-sans text-[8px] font-bold text-brand-text-variant uppercase tracking-wider">
                                Landmark / Address
                              </span>
                              <p className="font-sans text-[10.5px] text-brand-text-variant leading-relaxed">
                                {entity.address}
                              </p>
                            </div>
                          )}

                          <div className="flex items-center justify-between text-[10px] text-brand-text-variant bg-slate-50 p-2 rounded-lg">
                            <span>Region: <strong className="text-slate-800">{entity.district}</strong></span>
                            {entity.capturedAt && (
                              <span className="font-mono text-[9px]">
                                {formatDate(entity.capturedAt)}
                              </span>
                            )}
                          </div>

                          {/* Owner Photos Thumbnail */}
                          {photosMap[entity.owner?.id || entity.name]?.length > 0 && (
                            <div className="space-y-1">
                              <span className="block font-sans text-[8px] font-bold text-brand-text-variant uppercase tracking-wider flex items-center gap-1">
                                <ImageIcon className="h-3 w-3" />
                                Site Photos ({photosMap[entity.owner?.id || entity.name].length})
                              </span>
                              <div className="flex gap-1.5 overflow-x-auto pb-1 max-w-[260px]">
                                {photosMap[entity.owner?.id || entity.name].slice(0, 4).map((photo) => (
                                  <img 
                                    key={photo.id}
                                    src={photo.imageData} 
                                    alt="Worksite thumbnail" 
                                    className="h-9 w-9 object-cover rounded-md border border-brand-gray-border shadow-xs shrink-0"
                                    referrerPolicy="no-referrer"
                                  />
                                ))}
                              </div>
                            </div>
                          )}

                          <button
                            onClick={() => handleViewProfile(entity.name)}
                            className="w-full flex items-center justify-center gap-1 rounded-lg bg-brand-primary px-3 py-2 font-sans text-[10.5px] font-bold text-white shadow-xs hover:bg-brand-primary-light transition-all cursor-pointer"
                          >
                            View Full Owner Profile
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        /* WAKALA POPUP CARD */
                        <div className="font-sans p-1.5 space-y-2.5 min-w-[240px]">
                          <div className="flex items-center justify-between border-b border-brand-gray-border pb-2">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                              entity.wakalaType === 'base' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {entity.wakalaType === 'base' ? 'Base Wakala Outlet' : 'IOP Wakala Outlet'}
                            </span>

                            {entity.locationTier === 'captured' && (
                              <span className="text-[8px] px-1.5 py-0.5 rounded font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                GPS Verified
                              </span>
                            )}
                            {entity.locationTier === 'owner_approx' && (
                              <span className="text-[8px] px-1.5 py-0.5 rounded font-bold bg-amber-50 text-amber-700 border border-amber-200" title="Approximate — near owner's location">
                                Approx (Owner Base)
                              </span>
                            )}
                            {entity.locationTier === 'default_anchor' && (
                              <span className="text-[8px] px-1.5 py-0.5 rounded font-bold bg-slate-100 text-slate-700 border border-slate-300" title="Location pending — approximate company-area placement">
                                Location Pending
                              </span>
                            )}
                          </div>

                          <div>
                            <h4 className="font-sans text-sm font-black text-brand-text leading-tight">{entity.name}</h4>
                            <p className="font-mono text-xs font-semibold text-brand-text-variant mt-0.5">
                              MSISDN: {entity.msisdn}
                            </p>
                          </div>

                          {entity.locationTier === 'owner_approx' && (
                            <p className="text-[9.5px] font-semibold text-amber-800 bg-amber-50/80 p-1.5 rounded-lg border border-amber-200/80">
                              Approximate — near owner's location
                            </p>
                          )}
                          {entity.locationTier === 'default_anchor' && (
                            <p className="text-[9.5px] font-semibold text-slate-600 bg-slate-100 p-1.5 rounded-lg border border-slate-200">
                              Location pending — approximate company-area placement, not this wakala's actual position
                            </p>
                          )}

                          <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 space-y-1 text-[10.5px]">
                            {entity.code && (
                              <div className="flex justify-between">
                                <span className="text-slate-500 font-bold uppercase text-[9px]">Agent Code:</span>
                                <span className="font-mono font-bold text-slate-800">{entity.code}</span>
                              </div>
                            )}
                            {entity.siteId && (
                              <div className="flex justify-between">
                                <span className="text-slate-500 font-bold uppercase text-[9px]">Site ID:</span>
                                <span className="font-mono font-bold text-slate-800">{entity.siteId}</span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-slate-500 font-bold uppercase text-[9px]">District / Region:</span>
                              <span className="font-bold text-slate-800">{entity.district}</span>
                            </div>
                            <div className="flex justify-between border-t border-slate-200/60 pt-1 mt-1">
                              <span className="text-slate-500 font-bold uppercase text-[9px]">Attributed Owner:</span>
                              <span className="font-bold text-purple-700">{entity.ownerName}</span>
                            </div>
                          </div>

                          <button
                            onClick={() => handleViewProfile(entity.ownerName)}
                            className="w-full flex items-center justify-center gap-1 rounded-lg bg-brand-primary px-3 py-1.5 font-sans text-[10.5px] font-bold text-white shadow-xs hover:bg-brand-primary-light transition-all cursor-pointer"
                          >
                            View Attributed Owner
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </Popup>
                  </Marker>
                );
              })}
              </MarkerClusterGroup>
            </MapContainer>
          </div>
        </div>
      )}
    </div>
  );
}

