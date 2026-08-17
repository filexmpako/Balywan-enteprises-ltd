import React, { useState, useEffect } from 'react';
import { ViewType } from '../types';
import { 
  Bell, 
  Menu, 
  ChevronRight, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  Search,
  BookOpen,
  Camera,
  X,
  ChevronDown,
  Sparkles,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useReportingPeriod } from './ReportingPeriodContext';
import PeriodSelector from './PeriodSelector';
import { formatPeriodDisplay } from '../utils/periodUtils';
import { getPhoto, savePhoto, deletePhoto } from '../utils/db';
import { useAuth } from './AuthContext';

interface SystemNotification {
  id: string;
  title: string;
  desc: string;
  type: 'error' | 'success' | 'info';
  time: string;
  dateObject: Date;
}

function getRelativeTime(dateInput: string | Date): string {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return typeof dateInput === 'string' ? dateInput : 'Recent';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 0) return 'Just now';
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface HeaderProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  onToggleSidebar: () => void;
  userEmail?: string;
  selectedOwnerName?: string;
  adminName?: string;
  adminAvatarPhotoId?: string;
}

export default function Header({
  currentView,
  onNavigate,
  onToggleSidebar,
  userEmail = "admin@hasidadi.com",
  selectedOwnerName = "",
  adminName: propAdminName,
  adminAvatarPhotoId
}: HeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  
  const { user, updateUser } = useAuth();
  const isAdmin = !user || user.role === 'Admin';

  const {
    currentPeriod,
    displayPeriod,
    setCurrentPeriod,
    isManuallySet,
    resetToAutoDetect,
    availablePeriods,
    autoDetectedPeriod
  } = useReportingPeriod();
  const [imgSrc, setImgSrc] = useState<string>('');
  const adminName = propAdminName || userEmail.split('@')[0];
  const initials = adminName.slice(0, 2).toUpperCase();

  let displayOwnerName = selectedOwnerName;
  if (!displayOwnerName) {
    try {
      const saved = localStorage.getItem('ownersList');
      if (saved) {
        const list = JSON.parse(saved);
        if (Array.isArray(list) && list.length > 0) {
          displayOwnerName = list[0].name;
        }
      }
    } catch (e) {}
  }
  if (!displayOwnerName) {
    displayOwnerName = "Owner";
  }

  useEffect(() => {
    let active = true;
    if (adminAvatarPhotoId) {
      getPhoto(adminAvatarPhotoId)
        .then((photo) => {
          if (active) {
            if (photo && photo.imageData) {
              setImgSrc(photo.imageData);
            } else {
              setImgSrc('');
            }
          }
        })
        .catch(() => {
          if (active) setImgSrc('');
        });
    } else {
      setImgSrc('');
    }
    return () => {
      active = false;
    };
  }, [adminAvatarPhotoId]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Unsupported format. Please upload valid image files only.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('File size exceeds the 5MB limit.');
      return;
    }

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = err => reject(err);
      });

      if (adminAvatarPhotoId) {
        try { await deletePhoto(adminAvatarPhotoId); } catch (e) {}
      }

      const newPhotoId = await savePhoto(userEmail, base64, undefined, 'avatar');

      if (updateUser) {
        await updateUser(adminName, userEmail, newPhotoId);
      }
    } catch (err) {
      console.error('Failed to save or update photo:', err);
    }
  };

  // --- REAL SYSTEM NOTIFICATIONS STATE ---
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('dismissedNotificationIds') || '[]');
    } catch (e) {
      return [];
    }
  });

  const loadNotifications = () => {
    const list: SystemNotification[] = [];

    // 1. Read kpiValidationWarnings
    try {
      const warningsRaw = localStorage.getItem('kpiValidationWarnings');
      if (warningsRaw) {
        const warnings = JSON.parse(warningsRaw);
        if (Array.isArray(warnings)) {
          warnings.forEach((w: any) => {
            const id = `warning-${w.type}-${w.entityName || ''}-${w.message.slice(0, 30)}`;
            const dateObj = w.timestamp ? new Date(w.timestamp) : new Date();
            list.push({
              id,
              title: w.type || 'Validation Error',
              desc: w.message,
              type: 'error',
              time: w.timestamp ? getRelativeTime(w.timestamp) : 'Live Scan',
              dateObject: dateObj
            });
          });
        }
      }
    } catch (e) {
      console.error("Error loading validation warnings for notifications:", e);
    }

    // 2. Read auditHistoryReports
    try {
      const reportsRaw = localStorage.getItem('auditHistoryReports');
      if (reportsRaw) {
        const reports = JSON.parse(reportsRaw);
        if (Array.isArray(reports)) {
          reports.forEach((r: any) => {
            if (r.status === 'Success' || r.status === 'Success (Partial)') {
              const id = `report-${r.id}`;
              const dateObj = new Date(r.date);
              list.push({
                id,
                title: 'Report Processed',
                desc: `${r.fileName} processed successfully by ${r.uploadedBy || 'admin'}.`,
                type: 'success',
                time: getRelativeTime(r.date),
                dateObject: isNaN(dateObj.getTime()) ? new Date() : dateObj
              });
            }
          });
        }
      }
    } catch (e) {
      console.error("Error loading audit reports for notifications:", e);
    }

    // Sort chronologically, latest first
    list.sort((a, b) => b.dateObject.getTime() - a.dateObject.getTime());

    // Filter out dismissed
    const activeList = list.filter(n => !dismissedIds.includes(n.id));
    setNotifications(activeList);
  };

  useEffect(() => {
    loadNotifications();
  }, [dismissedIds]);

  useEffect(() => {
    const handleReload = () => {
      loadNotifications();
    };
    window.addEventListener('servicing-rows-updated', handleReload);
    window.addEventListener('people-reclassified', handleReload);
    window.addEventListener('storage', handleReload);
    return () => {
      window.removeEventListener('servicing-rows-updated', handleReload);
      window.removeEventListener('people-reclassified', handleReload);
      window.removeEventListener('storage', handleReload);
    };
  }, [dismissedIds]);

  const dismissNotification = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = [...dismissedIds, id];
    setDismissedIds(updated);
    localStorage.setItem('dismissedNotificationIds', JSON.stringify(updated));
  };

  const clearAllNotifications = (e: React.MouseEvent) => {
    e.stopPropagation();
    const allIds = notifications.map(n => n.id);
    const updated = [...dismissedIds, ...allIds];
    setDismissedIds(updated);
    localStorage.setItem('dismissedNotificationIds', JSON.stringify(updated));
  };

  const getBreadcrumbs = () => {
    switch (currentView) {
      case ViewType.DASHBOARD:
        return [
          { label: 'Executive Portal', view: ViewType.DASHBOARD },
          { label: 'Admin Dashboard', active: true }
        ];
      case ViewType.PEOPLE_MGT:
        return [
          { label: 'Executive Portal', view: ViewType.DASHBOARD },
          { label: 'People Management', active: true }
        ];
      case ViewType.OWNERS:
        return [
          { label: 'Executive Portal', view: ViewType.DASHBOARD },
          { label: 'Owners Management', active: true }
        ];
      case ViewType.OWNER_DETAILS:
        return [
          { label: 'People Management', view: ViewType.PEOPLE_MGT },
          { label: `Owner Details: ${displayOwnerName}`, active: true }
        ];
      case ViewType.UPLOAD_REPORTS:
        return [
          { label: 'Executive Portal', view: ViewType.DASHBOARD },
          { label: 'Upload Reports', active: true }
        ];
      case ViewType.KPI_REPORTS:
        return [
          { label: 'Executive Portal', view: ViewType.DASHBOARD },
          { label: 'KPI Performance Reports', active: true }
        ];
      case ViewType.REPORT_HISTORY:
        return [
          { label: 'Executive Portal', view: ViewType.DASHBOARD },
          { label: 'Report History', active: true }
        ];
      case ViewType.SETTINGS:
        return [
          { label: 'Executive Portal', view: ViewType.DASHBOARD },
          { label: 'Settings', active: true }
        ];
      case ViewType.PERSONNEL:
        return [
          { label: 'Executive Portal', view: ViewType.DASHBOARD },
          { label: 'Personnel Management', active: true }
        ];
      default:
        return [{ label: 'Executive Portal', active: true }];
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-brand-gray-border bg-brand-card px-6 shadow-sm">
      {/* Breadcrumbs / Left Title */}
      <div className="flex items-center gap-3.5">
        <button
          onClick={onToggleSidebar}
          className="rounded-lg p-2 text-brand-text-variant hover:bg-brand-gray-hover lg:hidden"
          aria-label="Toggle Sidebar"
          id="menu-toggle-btn"
        >
          <Menu className="h-5.5 w-5.5" />
        </button>

        <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-brand-text-variant font-sans">
          {getBreadcrumbs().map((crumb, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <ChevronRight className="h-3.5 w-3.5 text-brand-text-variant/60 shrink-0" />}
              {crumb.view && !crumb.active ? (
                <button
                  onClick={() => onNavigate(crumb.view as ViewType)}
                  className="hover:text-brand-primary hover:underline transition-colors cursor-pointer"
                >
                  {crumb.label}
                </button>
              ) : (
                <span className={crumb.active ? 'text-brand-primary font-bold text-sm tracking-tight' : ''}>
                  {crumb.label}
                </span>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Mobile Minimal Title */}
        <div className="sm:hidden font-sans text-base font-bold text-brand-primary">
          {currentView === ViewType.OWNER_DETAILS ? 'Owner Profile' : currentView === ViewType.PERSONNEL ? 'Personnel' : currentView === ViewType.PEOPLE_MGT ? 'People Management' : currentView}
        </div>
      </div>

      {/* Right Stats & Profile Panel */}
      <div className="flex items-center gap-6">
        {/* Reporting Metadata Block */}
        <div className="hidden md:flex items-center gap-5 border-r border-brand-gray-border pr-5 font-sans relative">
          {isAdmin ? (
            <PeriodSelector
              currentPeriod={currentPeriod}
              availablePeriods={availablePeriods}
              autoDetectedPeriod={autoDetectedPeriod}
              isManuallySet={isManuallySet}
              onSelectPeriod={setCurrentPeriod}
              onAutoDetect={resetToAutoDetect}
              label="Reporting Month"
              align="right"
              showManualBadge={true}
              dropdownTitle="Select Global Period"
              dropdownSubtitle="Applies across Dashboard, KPI Reports & Audit Logs."
              id="header-period-selector"
            />
          ) : (
            /* Read-only for Non-Admin */
            <div className="text-right">
              <span className="block text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">
                Reporting Month
              </span>
              <span className="font-sans text-sm font-bold text-brand-primary">
                {displayPeriod}
              </span>
            </div>
          )}
        </div>

        {/* Notifications Bell */}
        <div className="relative">
          <button
            onClick={() => {
              if (!showNotifications) {
                loadNotifications();
              }
              setShowNotifications(!showNotifications);
            }}
            className="relative rounded-full p-2.5 text-brand-text-variant hover:bg-brand-gray-hover transition-colors cursor-pointer"
            id="notification-bell"
          >
            {notifications.length > 0 && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand-primary ring-2 ring-brand-card animate-pulse" />
            )}
            <Bell className="h-5 w-5" />
          </button>

          {/* Notifications Dropdown Panel */}
          <AnimatePresence>
            {showNotifications && (
              <>
                <div 
                  className="fixed inset-0 z-30" 
                  onClick={() => setShowNotifications(false)} 
                />
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 15 }}
                  className="fixed sm:absolute top-20 sm:top-full left-4 right-4 sm:left-auto sm:right-0 mt-2.5 w-auto sm:w-96 max-h-[calc(100vh-7rem)] sm:max-h-[500px] overflow-hidden flex flex-col rounded-2xl border border-brand-gray-border bg-brand-card p-4 shadow-ambient-hover z-40"
                >
                  <div className="flex items-center justify-between border-b border-brand-gray-border pb-3 shrink-0">
                    <h3 className="font-sans text-sm font-bold text-brand-text">Notifications</h3>
                    <div className="flex items-center gap-2">
                      {notifications.length > 0 && (
                        <button 
                          onClick={clearAllNotifications}
                          className="text-[11px] font-semibold text-brand-primary hover:underline cursor-pointer font-sans"
                        >
                          Clear All
                        </button>
                      )}
                      <span className="rounded-full bg-brand-primary-container px-2 py-0.5 font-sans text-xs font-semibold text-brand-primary">
                        {notifications.length} Active
                      </span>
                    </div>
                  </div>

                  {notifications.length === 0 ? (
                    <div className="py-12 text-center font-sans text-xs text-brand-text-variant shrink-0">
                      <p className="font-bold">No recent activity</p>
                      <p className="text-[11px] mt-1 opacity-70">Everything is up-to-date.</p>
                    </div>
                  ) : (
                    <div className="mt-3 divide-y divide-brand-gray-border overflow-y-auto pr-1 flex-1 max-h-[280px] sm:max-h-[340px]">
                      {notifications.map((n) => (
                        <div key={n.id} className="group relative flex gap-3 py-3 hover:bg-brand-gray-hover/40 px-2 rounded-lg transition-colors text-left">
                          {n.type === 'error' ? (
                            <AlertTriangle className="h-5 w-5 text-status-error-text shrink-0 mt-0.5" />
                          ) : n.type === 'success' ? (
                            <CheckCircle className="h-5 w-5 text-status-success-text shrink-0 mt-0.5" />
                          ) : (
                            <Clock className="h-5 w-5 text-brand-primary shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1.5">
                              <p className="font-sans text-xs font-bold text-brand-text truncate">{n.title}</p>
                              <span className="font-mono text-[9px] text-brand-text-variant whitespace-nowrap">{n.time}</span>
                            </div>
                            <p className="mt-0.5 font-sans text-xs text-brand-text-variant leading-relaxed">
                              {n.desc}
                            </p>
                          </div>
                          {/* Dismiss button */}
                          <button 
                            onClick={(e) => dismissNotification(n.id, e)}
                            className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 hover:bg-brand-gray-hover rounded text-brand-text-variant transition-opacity cursor-pointer shrink-0 align-self-start"
                            title="Dismiss"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button 
                    onClick={() => {
                      setShowNotifications(false);
                      onNavigate(ViewType.REPORT_HISTORY);
                    }}
                    className="mt-4 w-full rounded-xl bg-brand-gray-hover py-2.5 font-sans text-xs font-semibold text-brand-primary hover:bg-brand-primary-container/40 transition-all text-center block cursor-pointer shrink-0"
                  >
                    View All Activity History
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* User Badge Profile Pill with camera upload overlay & online indicator */}
        <div className="flex items-center gap-3">
          <div className="relative group/avatar cursor-pointer h-10 w-10 shrink-0">
            {imgSrc ? (
              <img 
                src={imgSrc} 
                alt={adminName} 
                className="h-full w-full rounded-full object-cover shadow-sm ring-2 ring-brand-accent/20"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-full bg-brand-accent-light text-brand-secondary font-sans font-bold text-sm tracking-wider shadow-sm ring-2 ring-brand-accent/20">
                {initials}
              </div>
            )}

            {/* Hover Camera Overlay for upload */}
            <label className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover/avatar:opacity-100 transition-opacity cursor-pointer">
              <Camera className="h-4.5 w-4.5 text-white" />
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={handlePhotoUpload} 
              />
            </label>

            {/* Online presence status indicator (green dot with white ring) */}
            <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-brand-card" />
          </div>
          <div className="hidden lg:block text-left font-sans">
            <p className="text-xs font-bold text-brand-text tracking-tight capitalize">{adminName}</p>
            <p className="text-[10px] font-bold text-brand-text-variant uppercase tracking-widest leading-none mt-0.5">Executive Admin</p>
          </div>
        </div>
      </div>
    </header>
  );
}
