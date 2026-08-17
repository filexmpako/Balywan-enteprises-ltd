import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Circle, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { 
  MapPin, 
  Navigation, 
  Trash2, 
  Camera, 
  Loader2, 
  Save, 
  Map as MapIcon, 
  Image as ImageIcon,
  CheckCircle,
  AlertCircle,
  Search,
  X,
  RefreshCw
} from 'lucide-react';
import { Owner, WakalaEntry } from '../types';
import { savePhoto, getPhotosByOwner, deletePhoto, WorkPhoto } from '../utils/db';

interface WorkLocationSectionProps {
  localOwner: Owner;
  onUpdateOwner: (updatedOwner: Owner) => void;
  onUpdateWakalas?: (base: WakalaEntry[], iop: WakalaEntry[]) => void;
  isEditable: boolean;
}

// Leaflet custom colored pins using standard CDN marker icons
const ownerMarkerIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const baseWakalaMarkerIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const iopWakalaMarkerIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Component to handle map clicks for manual pin placement
function MapEventsHandler({ onMapClick, enabled }: { onMapClick: (lat: number, lng: number) => void; enabled: boolean }) {
  useMapEvents({
    click(e) {
      if (enabled) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

// Component to handle dynamic map recentering and panning
function MapRecenter({ center, zoom }: { center: [number, number]; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom || map.getZoom(), { animate: true });
  }, [center, zoom, map]);
  return null;
}

export default function WorkLocationSection({ 
  localOwner, 
  onUpdateOwner,
  onUpdateWakalas,
  isEditable 
}: WorkLocationSectionProps) {
  // Default to Dar es Salaam coordinates
  const defaultLat = -6.7924;
  const defaultLng = 39.2083;

  const hasSavedLocation = !!localOwner.workLocation;
  const savedLat = localOwner.workLocation?.lat ?? defaultLat;
  const savedLng = localOwner.workLocation?.lng ?? defaultLng;

  const [markerPos, setMarkerPos] = useState<{ lat: number; lng: number } | null>(
    localOwner.workLocation ? { lat: localOwner.workLocation.lat, lng: localOwner.workLocation.lng } : null
  );
  const [mapCenter, setMapCenter] = useState<[number, number]>([savedLat, savedLng]);
  const [mapZoom, setMapZoom] = useState<number>(hasSavedLocation ? 14 : 12);
  const [address, setAddress] = useState(localOwner.workLocation?.address ?? '');
  
  // UI States
  const [isLocating, setIsLocating] = useState(false);
  const [locatingError, setLocatingError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [detectedAccuracy, setDetectedAccuracy] = useState<number | null>(null);
  const [isDetectedState, setIsDetectedState] = useState(false);

  // Map Search state
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Photos & Live Camera State
  const [photos, setPhotos] = useState<WorkPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);

  type CameraState = 'idle' | 'initializing' | 'active' | 'no-camera' | 'permission-denied' | 'captured';
  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedFrame, setCapturedFrame] = useState<string | null>(null);
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Load photos from IndexedDB
  const loadPhotos = async () => {
    try {
      const ownerKey = localOwner?.id || localOwner?.name;
      if (!ownerKey) return;
      const loadedPhotos = await getPhotosByOwner(ownerKey);
      setPhotos(loadedPhotos);
    } catch (err) {
      console.error('Failed to load photos from IndexedDB:', err);
    }
  };

  useEffect(() => {
    loadPhotos();
  }, [localOwner?.id, localOwner?.name]);

  // Compute Wakala Pins
  const baseWakalas = localOwner?.baseWakalas || [];
  const iopWakalas = localOwner?.iopWakalas || [];

  const getWakalaCoordinates = (w: WakalaEntry, index: number): { lat: number; lng: number; isCaptured: boolean } => {
    if (w.location && typeof w.location.lat === 'number' && typeof w.location.lng === 'number') {
      return { lat: w.location.lat, lng: w.location.lng, isCaptured: true };
    }
    // Deterministic offset based on MSISDN string hash if GPS hasn't been captured yet
    let hash = 0;
    const str = w.msisdn || w.id || `${index}`;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const latOffset = (((Math.abs(hash) % 80) - 40) * 0.004);
    const lngOffset = (((Math.abs(hash >> 3) % 80) - 40) * 0.004);
    return {
      lat: savedLat + latOffset,
      lng: savedLng + lngOffset,
      isCaptured: false
    };
  };

  // Build searchable pins list
  const mappedPins = [
    {
      id: `owner-${localOwner.id || localOwner.name}`,
      name: `${localOwner.name} (Primary Base)`,
      code: localOwner.masterAgentId || 'MASTER-AGENT',
      msisdn: localOwner.name,
      district: localOwner.region,
      type: 'owner' as const,
      lat: savedLat,
      lng: savedLng,
      isCaptured: !!localOwner.workLocation,
      wakala: null
    },
    ...baseWakalas.map((w, idx) => {
      const coords = getWakalaCoordinates(w, idx);
      return {
        id: w.id,
        name: w.name,
        code: w.code || '',
        msisdn: w.msisdn,
        district: w.district || w.region,
        type: 'base' as const,
        lat: coords.lat,
        lng: coords.lng,
        isCaptured: coords.isCaptured,
        wakala: w
      };
    }),
    ...iopWakalas.map((w, idx) => {
      const coords = getWakalaCoordinates(w, idx + 100);
      return {
        id: w.id,
        name: w.name,
        code: '',
        msisdn: w.msisdn,
        district: w.region,
        type: 'iop' as const,
        lat: coords.lat,
        lng: coords.lng,
        isCaptured: coords.isCaptured,
        wakala: w
      };
    })
  ];

  const filteredMapPins = mappedPins.filter(pin => {
    if (!mapSearchQuery.trim()) return true;
    const q = mapSearchQuery.toLowerCase();
    return (
      pin.name.toLowerCase().includes(q) ||
      pin.code.toLowerCase().includes(q) ||
      pin.msisdn.includes(q) ||
      pin.district.toLowerCase().includes(q)
    );
  });

  const handleSelectMapPin = (pin: typeof mappedPins[0]) => {
    setMapCenter([pin.lat, pin.lng]);
    setMapZoom(16);
    setIsSearchOpen(false);
  };

  // Handle click on map to manually position pin
  const handleMapClick = (lat: number, lng: number) => {
    setMarkerPos({ lat, lng });
    setDetectedAccuracy(null);
    setIsDetectedState(false);
  };

  // Locate the user's browser location
  const handleLocateMe = () => {
    setIsLocating(true);
    setLocatingError(null);
    setIsDetectedState(false);
    setDetectedAccuracy(null);

    if (!navigator.geolocation) {
      setLocatingError('GPS location services are not supported by this browser.');
      setIsLocating(false);
      return;
    }

    // Try with high accuracy first
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setMarkerPos({ lat: latitude, lng: longitude });
        setMapCenter([latitude, longitude]);
        setDetectedAccuracy(accuracy);
        setIsDetectedState(true);
        setIsLocating(false);
      },
      (firstError) => {
        console.warn('High accuracy geolocation failed, attempting standard accuracy fallback...', firstError);
        
        // If permission was denied, do not retry
        if (firstError.code === firstError.PERMISSION_DENIED) {
          setLocatingError('Location access was denied. Please enable location permissions for this page in your browser settings, or zoom and click on the map to place your pin manually.');
          setIsLocating(false);
          return;
        }

        // Try standard/coarse location detection as fallback
        navigator.geolocation.getCurrentPosition(
          (fallbackPosition) => {
            const { latitude, longitude, accuracy } = fallbackPosition.coords;
            setMarkerPos({ lat: latitude, lng: longitude });
            setMapCenter([latitude, longitude]);
            setDetectedAccuracy(accuracy);
            setIsDetectedState(true);
            setIsLocating(false);
          },
          (error) => {
            console.error('All geolocation attempts failed:', error);
            let message = 'Failed to fetch GPS coordinates. Please zoom and click on the map to place the pin manually.';
            
            if (error.code === error.PERMISSION_DENIED) {
              message = 'Location permission was denied. Please check your browser\'s location settings, or manually click on the map to place the pin.';
            } else if (error.code === error.POSITION_UNAVAILABLE) {
              message = 'Your device location is unavailable (Code 2). Please zoom and click on the map to place your pin manually.';
            } else if (error.code === error.TIMEOUT) {
              message = 'The location request timed out (Code 3). Please try again, or click on the map to place your pin manually.';
            } else if (error.code === 0) {
              message = `A local location error occurred (Code 0: ${error.message || 'Unknown network error'}). Please click on the map to place your pin manually.`;
            } else {
              message = `Geolocation error (${error.code}: ${error.message || 'Unknown issue'}). Please place the pin manually.`;
            }
            
            setLocatingError(message);
            setIsLocating(false);
          },
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  // Stop active video stream tracks
  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  // Start live camera feed using getUserMedia
  const startCamera = async () => {
    stopCameraStream();
    setCameraError(null);
    setCapturedFrame(null);
    setCameraState('initializing');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraState('no-camera');
      setCameraError('Camera-equipped device required. Live camera hardware is not available or supported in this browser environment.');
      return;
    }

    try {
      let stream: MediaStream;
      try {
        // Request rear/environment camera first for proof of work location
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } }
        });
      } catch (envErr) {
        // Fallback to any available video stream if environment constraint fails
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      streamRef.current = stream;
      setCameraState('active');
    } catch (err: any) {
      console.error('Camera access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraState('permission-denied');
        setCameraError('Camera permission was denied. Please enable camera permissions in your browser or device settings to capture real-time workplace photo evidence.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraState('no-camera');
        setCameraError('Camera-equipped device required. No camera hardware was detected on this device.');
      } else {
        setCameraState('no-camera');
        setCameraError(`Camera unavailable: ${err.message || 'Unable to access camera device.'}`);
      }
    }
  };

  // Close live camera stream panel
  const closeCamera = () => {
    stopCameraStream();
    setCapturedFrame(null);
    setCameraState('idle');
    setCameraError(null);
  };

  // Capture current video frame onto offscreen canvas and export as base64
  const captureFrame = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);
    const base64Data = canvas.toDataURL('image/jpeg', 0.85);

    setCapturedFrame(base64Data);
    setCameraState('captured');
    stopCameraStream();
  };

  // Confirm captured frame and write to IndexedDB WorkPhoto store
  const handleConfirmCapturedPhoto = async () => {
    if (!capturedFrame) return;

    setIsSavingPhoto(true);
    setPhotoError(null);

    try {
      const ownerKey = localOwner?.id || localOwner?.name;
      if (!ownerKey) return;
      // Save base64 string directly into existing WorkPhoto storage
      const photoId = await savePhoto(ownerKey, capturedFrame);

      const currentPhotoIds = localOwner?.workPhotoIds ?? [];
      const updatedPhotoIds = [...currentPhotoIds, photoId];

      const updatedOwner: Owner = {
        ...localOwner,
        workPhotoIds: updatedPhotoIds
      };

      onUpdateOwner(updatedOwner);
      await loadPhotos();
      closeCamera();
    } catch (err: any) {
      setPhotoError(err.message ?? 'An error occurred during photo saving.');
    } finally {
      setIsSavingPhoto(false);
    }
  };

  // Attach stream to video element when camera active
  useEffect(() => {
    if (cameraState === 'active' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(err => {
        console.warn('Error playing live camera stream:', err);
      });
    }
  }, [cameraState]);

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  // Handle photo deletion
  const handleDeletePhoto = async (photoId: string) => {
    if (!window.confirm('Are you sure you want to delete this photo?')) return;
    try {
      await deletePhoto(photoId);
      const updatedPhotoIds = (localOwner.workPhotoIds ?? []).filter(id => id !== photoId);
      const updatedOwner: Owner = {
        ...localOwner,
        workPhotoIds: updatedPhotoIds
      };
      onUpdateOwner(updatedOwner);
      await loadPhotos();
    } catch (err) {
      console.error('Failed to delete photo:', err);
    }
  };

  // Save work location metadata
  const handleSaveLocation = () => {
    if (!markerPos) {
      setSaveStatus({ type: 'error', message: 'Please drop a pin on the map before saving.' });
      return;
    }

    const updatedOwner: Owner = {
      ...localOwner,
      workLocation: {
        lat: markerPos.lat,
        lng: markerPos.lng,
        address: address.trim() || undefined,
        capturedAt: new Date().toISOString()
      }
    };

    try {
      onUpdateOwner(updatedOwner);
      setSaveStatus({ type: 'success', message: 'Work location saved successfully!' });
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      setSaveStatus({ type: 'error', message: 'Failed to persist location data.' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Alert Notices */}
      {saveStatus && (
        <div className={`p-4 rounded-xl border text-xs font-bold font-sans flex items-center gap-2 ${
          saveStatus.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          {saveStatus.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {saveStatus.message}
        </div>
      )}

      {locatingError && (
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/85 text-amber-950 text-xs font-medium font-sans space-y-2 shadow-sm">
          <div className="flex items-center gap-2 font-bold text-amber-850">
            <AlertCircle className="h-4.5 w-4.5 text-amber-600 shrink-0" />
            <span>Could Not Auto-Detect Location</span>
          </div>
          <p>{locatingError}</p>
          <div className="bg-white p-3 rounded-lg border border-amber-200/50 text-brand-text flex items-start gap-2 mt-1">
            <span className="text-brand-primary font-bold text-sm">💡</span>
            <div>
              <span className="font-bold block text-xs">Alternative: Manual Placement</span>
              <span className="text-brand-text-variant text-[11px]">
                You can easily zoom and drag the map, then <strong>click anywhere on the map grid</strong> to drop your pin manually.
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Map view wrapper */}
        <div className="lg:col-span-8 space-y-2">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-sans text-sm font-bold text-brand-text flex items-center gap-2">
                <MapIcon className="h-4.5 w-4.5 text-brand-primary" />
                Work Map & Wakala Pins Network
              </h3>
              {/* Map Legend */}
              <div className="flex items-center gap-3 mt-1 text-[10px] font-sans font-medium text-slate-600">
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-purple-600 inline-block"></span>
                  Owner Primary Base
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-600 inline-block"></span>
                  Base Wakala ({baseWakalas.length})
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-600 inline-block"></span>
                  IOP Wakala ({iopWakalas.length})
                </span>
              </div>
            </div>

            {isEditable && (
              <button
                type="button"
                onClick={handleLocateMe}
                disabled={isLocating}
                className="flex items-center gap-1.5 rounded-lg border border-brand-primary/20 bg-brand-primary-container/20 px-3 py-1.5 font-sans text-xs font-bold text-brand-primary hover:bg-brand-primary-container/40 transition-all cursor-pointer disabled:opacity-50 shrink-0"
              >
                {isLocating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Navigation className="h-3.5 w-3.5 fill-current" />
                )}
                Drop pin at my location
              </button>
            )}
          </div>

          <div className="relative h-[420px] w-full rounded-2xl overflow-hidden border border-brand-gray-border shadow-ambient bg-brand-gray-hover z-10">
            {/* Map Search Overlay */}
            <div className="absolute top-3 left-3 right-3 sm:right-auto sm:w-80 z-[1000] font-sans">
              <div className="relative shadow-lg rounded-xl bg-white/95 backdrop-blur border border-slate-200 p-1.5 flex items-center gap-2">
                <Search className="h-4 w-4 text-slate-400 ml-2 shrink-0" />
                <input
                  type="text"
                  placeholder="Search map pins (Name, Code, MSISDN)..."
                  value={mapSearchQuery}
                  onFocus={() => setIsSearchOpen(true)}
                  onChange={(e) => {
                    setMapSearchQuery(e.target.value);
                    setIsSearchOpen(true);
                  }}
                  className="w-full bg-transparent text-xs text-brand-text focus:outline-none p-1 font-sans"
                />
                {mapSearchQuery && (
                  <button 
                    onClick={() => {
                      setMapSearchQuery('');
                      setIsSearchOpen(false);
                    }} 
                    className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Search Results Dropdown */}
              {isSearchOpen && mapSearchQuery.trim().length > 0 && (
                <div className="mt-1.5 max-h-56 overflow-y-auto rounded-xl bg-white shadow-2xl border border-slate-200 divide-y divide-slate-100 text-xs">
                  {filteredMapPins.length === 0 ? (
                    <div className="p-3 text-center text-slate-400 font-sans text-xs">No matching Wakalas or pins found</div>
                  ) : (
                    filteredMapPins.map(pin => (
                      <button
                        key={pin.id}
                        type="button"
                        onClick={() => handleSelectMapPin(pin)}
                        className="w-full text-left p-2.5 hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer"
                      >
                        <div>
                          <span className="font-bold text-slate-800 block">{pin.name}</span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {pin.code ? `Code: ${pin.code} • ` : ''}{pin.msisdn}
                          </span>
                        </div>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase shrink-0 ${
                          pin.type === 'owner' ? 'bg-purple-100 text-purple-800' :
                          pin.type === 'base' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {pin.type === 'owner' ? 'Owner' : pin.type === 'base' ? 'Base' : 'IOP'}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <MapContainer 
              center={mapCenter} 
              zoom={mapZoom} 
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              
              {/* Owner Pin */}
              {markerPos && (
                <Marker position={[markerPos.lat, markerPos.lng]} icon={ownerMarkerIcon}>
                  <Popup>
                    <div className="p-1 font-sans text-xs space-y-1">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-800 uppercase">
                        Master Owner Base
                      </span>
                      <h4 className="font-bold text-slate-900">{localOwner.name}</h4>
                      <p className="text-[11px] text-slate-600 font-mono">ID: {localOwner.masterAgentId || 'MASTER-AGENT'}</p>
                      <p className="text-[10px] text-slate-500">{localOwner.region}</p>
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Wakala Pins Network */}
              {mappedPins.filter(p => p.type !== 'owner').map(pin => (
                <Marker 
                  key={pin.id} 
                  position={[pin.lat, pin.lng]} 
                  icon={pin.type === 'base' ? baseWakalaMarkerIcon : iopWakalaMarkerIcon}
                >
                  <Popup>
                    <div className="p-1 font-sans text-xs space-y-1 min-w-[160px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                          pin.type === 'base' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {pin.type === 'base' ? 'Base Wakala' : 'IOP Wakala'}
                        </span>
                        <span className={`text-[8px] px-1 py-0.2 rounded font-bold ${
                          pin.isCaptured ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {pin.isCaptured ? 'GPS Verified' : 'Regional Pin'}
                        </span>
                      </div>
                      <h4 className="font-bold text-slate-900 text-sm leading-tight mt-1">{pin.name}</h4>
                      <p className="text-[11px] font-mono text-slate-600">MSISDN: {pin.msisdn}</p>
                      {pin.code && <p className="text-[10px] font-mono text-slate-500">Agent Code: {pin.code}</p>}
                      {pin.district && <p className="text-[10px] text-slate-500">District: {pin.district}</p>}
                    </div>
                  </Popup>
                </Marker>
              ))}

              {markerPos && detectedAccuracy !== null && isDetectedState && (
                <Circle
                  center={[markerPos.lat, markerPos.lng]}
                  radius={detectedAccuracy}
                  pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.15, weight: 1 }}
                />
              )}
              <MapEventsHandler onMapClick={handleMapClick} enabled={isEditable} />
              <MapRecenter center={mapCenter} zoom={mapZoom} />
            </MapContainer>
          </div>
          {isEditable && (
            <p className="font-sans text-[10px] text-brand-text-variant italic">
              * Click any pin to inspect details. Use the floating search bar to search across all mapped Wakalas.
            </p>
          )}
        </div>

        {/* Location Details & Metadata Form */}
        <div className="lg:col-span-4 flex flex-col justify-between space-y-4">
          <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient h-full flex flex-col justify-between">
            <div className="space-y-4">
              <h3 className="font-sans text-sm font-bold text-brand-text border-b border-brand-gray-border pb-2.5">
                Location Parameters
              </h3>

              <div className="grid grid-cols-2 gap-3 font-mono text-[11px] text-brand-text-variant">
                <div className="rounded-lg bg-brand-gray-hover p-2 border border-brand-gray-border/60">
                  <span className="block text-[9px] uppercase font-bold text-brand-text-variant/70 font-sans">Latitude</span>
                  <span className="font-semibold text-brand-text">{markerPos ? markerPos.lat.toFixed(6) : 'Not set'}</span>
                </div>
                <div className="rounded-lg bg-brand-gray-hover p-2 border border-brand-gray-border/60">
                  <span className="block text-[9px] uppercase font-bold text-brand-text-variant/70 font-sans">Longitude</span>
                  <span className="font-semibold text-brand-text">{markerPos ? markerPos.lng.toFixed(6) : 'Not set'}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase">
                  Address / Landmark description
                </label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  disabled={!isEditable}
                  placeholder="e.g. Kariakoo Market, opposite NMB Bank, Block 4C, Dar es Salaam."
                  rows={4}
                  className="w-full rounded-xl border border-brand-gray-border bg-white p-3 text-xs text-brand-text placeholder-brand-text-variant/40 focus:outline-none focus:border-brand-primary font-sans resize-none disabled:bg-brand-gray-hover disabled:text-brand-text-variant"
                />
              </div>

              {localOwner.workLocation?.capturedAt && (
                <div className="font-sans text-[10px] text-brand-text-variant bg-slate-50 border border-slate-100 p-2.5 rounded-lg">
                  <span className="font-bold block uppercase text-[8px] text-brand-text-variant/80">Last Updated</span>
                  {new Date(localOwner.workLocation.capturedAt).toLocaleString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              )}
            </div>

            {isEditable && (
              isDetectedState ? (
                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3 shadow-xs">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4.5 w-4.5 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-xs text-blue-900 block">Confirm Detected Location</span>
                      <span className="text-[11px] text-blue-700/90 block mt-0.5">
                        Detected within <strong className="text-blue-950">~{Math.round(detectedAccuracy ?? 0)}m</strong> accuracy. Does this look right?
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsDetectedState(false)}
                      className="w-full flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-2 font-sans text-[11px] font-bold text-white shadow-sm hover:bg-emerald-700 transition-all cursor-pointer"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Yes, correct
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDetectedAccuracy(null);
                        setIsDetectedState(false);
                      }}
                      className="w-full flex items-center justify-center gap-1 rounded-lg border border-brand-gray-border bg-white px-2.5 py-2 font-sans text-[11px] font-bold text-brand-text-variant hover:bg-brand-gray-hover transition-all cursor-pointer"
                    >
                      Adjust manually
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleSaveLocation}
                  disabled={!markerPos}
                  className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-3 font-sans text-xs font-bold text-white shadow-ambient hover:bg-brand-primary-light transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="h-4 w-4" />
                  Save Work Location
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* Image / Work Area Photos Section */}
      <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-6 shadow-ambient">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-brand-gray-border pb-4 mb-4 gap-3">
          <div>
            <h3 className="font-sans text-sm font-bold text-brand-text flex items-center gap-2">
              <ImageIcon className="h-4.5 w-4.5 text-brand-primary" />
              Workplace Photo Gallery
            </h3>
            <p className="font-sans text-xs text-brand-text-variant mt-0.5">
              Securely stored images referencing the work area
            </p>
          </div>

          {isEditable && (
            <button
              type="button"
              onClick={startCamera}
              className="flex items-center gap-2 rounded-lg border border-brand-primary/20 bg-brand-primary-container/20 px-4 py-2 font-sans text-xs font-bold text-brand-primary hover:bg-brand-primary-container/40 transition-all cursor-pointer shrink-0"
            >
              <Camera className="h-4 w-4" />
              Take Live Workplace Photo
            </button>
          )}
        </div>

        {/* Live Camera Interface Panel */}
        {cameraState !== 'idle' && (
          <div className="mb-6 p-4 sm:p-6 rounded-2xl border-2 border-brand-primary/30 bg-slate-900 text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
              <div className="flex items-center gap-2">
                <Camera className="h-5 w-5 text-brand-primary-light" />
                <h4 className="font-sans text-sm font-bold text-white">
                  Live Workplace Proof Capture
                </h4>
              </div>
              <button
                type="button"
                onClick={closeCamera}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close Camera"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* State 1: Initializing */}
            {cameraState === 'initializing' && (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                <Loader2 className="h-8 w-8 text-brand-primary animate-spin" />
                <p className="font-sans text-xs text-slate-300 font-medium">
                  Initializing live camera stream...
                </p>
              </div>
            )}

            {/* State 2: No Camera Available */}
            {cameraState === 'no-camera' && (
              <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-800/80 space-y-3">
                <div className="flex items-center gap-2.5 text-rose-300 font-bold text-sm">
                  <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
                  <span>Camera-Equipped Device Required</span>
                </div>
                <p className="font-sans text-xs text-rose-200 leading-relaxed">
                  {cameraError || 'No live camera detected. A camera-equipped device is strictly required to capture real-time workplace photo evidence.'}
                </p>
                <div className="p-2.5 rounded-lg bg-rose-900/40 border border-rose-800/50 text-[11px] text-rose-300 font-mono">
                  ⚠️ Pre-existing file uploads and gallery submissions are disabled to guarantee authentic proof-of-presence.
                </div>
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={closeCamera}
                    className="px-4 py-2 rounded-lg bg-slate-800 text-slate-200 text-xs font-bold hover:bg-slate-700 transition-all cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {/* State 3: Permission Denied */}
            {cameraState === 'permission-denied' && (
              <div className="p-4 rounded-xl bg-amber-950/60 border border-amber-800/80 space-y-3">
                <div className="flex items-center gap-2.5 text-amber-300 font-bold text-sm">
                  <AlertCircle className="h-5 w-5 shrink-0 text-amber-400" />
                  <span>Camera Access Permission Denied</span>
                </div>
                <p className="font-sans text-xs text-amber-200 leading-relaxed">
                  {cameraError || 'Camera access was denied by your browser settings. Please grant camera permission to proceed.'}
                </p>
                <div className="pt-2 flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={startCamera}
                    className="px-4 py-2 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-500 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry Camera Access
                  </button>
                  <button
                    type="button"
                    onClick={closeCamera}
                    className="px-4 py-2 rounded-lg bg-slate-800 text-slate-200 text-xs font-bold hover:bg-slate-700 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* State 4: Active Live Stream Feed */}
            {cameraState === 'active' && (
              <div className="space-y-4">
                <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black border border-slate-800 flex items-center justify-center">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-white/20 rounded-xl m-4 flex items-center justify-center">
                    <div className="text-[10px] text-white/50 font-mono bg-black/40 px-2.5 py-1 rounded backdrop-blur">
                      LIVE CAMERA FEED
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <span className="text-[11px] text-slate-400 font-sans">
                    Point camera at the Wakala work location and click capture.
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={closeCamera}
                      className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700 transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={captureFrame}
                      className="px-5 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-bold hover:bg-brand-primary-light transition-all cursor-pointer flex items-center gap-2 shadow-lg"
                    >
                      <Camera className="h-4 w-4" />
                      Capture Frame
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* State 5: Successful Capture Preview & Confirmation */}
            {cameraState === 'captured' && capturedFrame && (
              <div className="space-y-4">
                <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black border border-emerald-500/50 shadow-inner">
                  <img
                    src={capturedFrame}
                    alt="Captured workplace preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-3 left-3 bg-emerald-600 text-white font-sans text-[10px] font-bold px-2.5 py-1 rounded-full shadow flex items-center gap-1.5">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Captured Frame Preview
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <span className="text-[11px] text-slate-300 font-sans">
                    Please confirm the captured frame before submitting to owner records.
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={startCamera}
                      disabled={isSavingPhoto}
                      className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold hover:bg-slate-700 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Retake
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmCapturedPhoto}
                      disabled={isSavingPhoto}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 transition-all cursor-pointer flex items-center gap-2 shadow-lg disabled:opacity-50"
                    >
                      {isSavingPhoto ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle className="h-4 w-4" />
                      )}
                      {isSavingPhoto ? 'Saving Photo...' : 'Confirm & Submit Photo'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {photoError && (
          <div className="p-3 mb-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs font-bold font-sans flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {photoError}
          </div>
        )}

        {/* Photos Grid */}
        {photos.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-brand-gray-border rounded-xl">
            <ImageIcon className="h-8 w-8 text-brand-text-variant/30 mx-auto mb-2" />
            <p className="font-sans text-xs text-brand-text-variant">
              No workplace photos captured yet.
            </p>
            {isEditable && (
              <p className="font-sans text-[10px] text-brand-text-variant/70 mt-1">
                Click "Take Live Workplace Photo" above to capture live camera proof of your work area.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {photos.map((photo) => (
              <div 
                key={photo.id} 
                className="group relative aspect-square rounded-xl overflow-hidden border border-brand-gray-border bg-brand-gray-hover shadow-sm"
              >
                <img 
                  src={photo.imageData} 
                  alt="Work area" 
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  referrerPolicy="no-referrer"
                />
                
                {isEditable && (
                  <button
                    type="button"
                    onClick={() => handleDeletePhoto(photo.id)}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-rose-600 transition-all opacity-0 group-hover:opacity-100 cursor-pointer shadow-md"
                    title="Delete photo"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}

                <div className="absolute bottom-0 inset-x-0 bg-black/40 p-1.5 text-center">
                  <span className="font-mono text-[8px] text-white/90">
                    {new Date(photo.uploadedAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short'
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
