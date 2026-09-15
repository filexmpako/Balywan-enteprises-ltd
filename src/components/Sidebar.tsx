import React, { useState, useEffect } from 'react';
import { ViewType } from '../types';
import { getPhoto } from '../utils/db';
import { 
  LayoutDashboard, 
  Users, 
  TrendingUp, 
  UploadCloud, 
  History, 
  Settings, 
  Power, 
  X,
  ShieldCheck,
  MessageSquare,
  Map,
  Building2,
  Target,
  Banknote
  ,ChevronLeft
  ,ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useCompany } from './CompanyContext';

interface SidebarProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  isOpen: boolean;
  onToggle: () => void;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onLogout: () => void;
  userEmail?: string;
  adminName?: string;
  adminAvatarPhotoId?: string;
}

export default function Sidebar({
  currentView,
  onNavigate,
  isOpen,
  onToggle,
  isCollapsed,
  onToggleCollapsed,
  onLogout,
  userEmail = "admin@hasidadi.com",
  adminName: propAdminName,
  adminAvatarPhotoId
}: SidebarProps) {
  const { companyName } = useCompany();
  const nameParts = companyName.toUpperCase().split(' ');
  const mainName = nameParts[0];
  const subName = nameParts.slice(1).join(' ');
  const menuItems = [
    { view: ViewType.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
    { view: ViewType.PEOPLE_MGT, label: 'People Management', icon: Users },
    { view: ViewType.BASE_WAKALA, label: 'Base Wakala', icon: Building2 },
    { view: ViewType.CLASSIFICATION_AUDIT, label: 'Audit Log', icon: ShieldCheck },
    { view: ViewType.WAKALA_ISSUES, label: 'Wakala Issues', icon: MessageSquare },
    { view: ViewType.FIELD_MAP, label: 'Field Map', icon: Map },
    { view: ViewType.KPI_REPORTS, label: 'KPI Reports', icon: TrendingUp },
    { view: ViewType.TARGETS, label: 'Targets', icon: Target },
    { view: ViewType.FLOAT_MANAGEMENT, label: 'Float Management', icon: Banknote },
    { view: ViewType.UPLOAD_REPORTS, label: 'Upload Reports', icon: UploadCloud },
    { view: ViewType.REPORT_HISTORY, label: 'Report History', icon: History },
  ];

  const adminName = propAdminName || userEmail.split('@')[0];
  const formattedAdminName = adminName.charAt(0).toUpperCase() + adminName.slice(1);
  const initials = adminName.slice(0, 2).toUpperCase();

  const [imgSrc, setImgSrc] = useState<string>('');

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

  return (
    <>
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            onClick={onToggle}
            className="fixed inset-0 z-40 bg-brand-bg/60 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-72 flex-col border-r border-brand-gray-border bg-brand-card transition-[width,transform] duration-300 ease-in-out lg:sticky lg:top-0 lg:translate-x-0 ${isCollapsed ? 'lg:w-20' : 'lg:w-72'} ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header Branding */}
        <div className={`flex h-20 items-center border-b border-brand-gray-border shrink-0 ${isCollapsed ? 'lg:justify-center lg:px-3' : 'justify-between px-6'}`}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary text-white">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div className={isCollapsed ? 'lg:hidden' : ''}>
              <h1 className="font-sans text-base font-bold tracking-tight text-brand-primary leading-none">{mainName}</h1>
              {subName ? (
                <p className="font-mono text-[9px] tracking-widest text-brand-text-variant uppercase font-semibold mt-0.5">{subName}</p>
              ) : null}
            </div>
          </div>
          <button 
            onClick={onToggle}
            className="rounded-lg p-1.5 text-brand-text-variant hover:bg-brand-gray-hover lg:hidden"
            id="close-sidebar-btn"
          >
            <X className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="absolute -right-3 top-24 z-10 hidden h-7 w-7 items-center justify-center rounded-full border border-brand-gray-border bg-brand-card text-brand-text-variant shadow-ambient transition-colors hover:text-brand-primary lg:flex"
            aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className={`flex-1 space-y-1.5 py-6 overflow-y-auto ${isCollapsed ? 'lg:px-3' : 'px-4'}`}>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.view || 
                             (item.view === ViewType.PEOPLE_MGT && 
                              (currentView === ViewType.PEOPLE_MGT || 
                               currentView === ViewType.OWNERS || 
                               currentView === ViewType.PERSONNEL || 
                               currentView === ViewType.OWNER_DETAILS));
            return (
              <button
                key={item.view}
                onClick={() => {
                  onNavigate(item.view);
                  if (window.innerWidth < 1024) {
                    onToggle();
                  }
                }}
                className={`group relative flex w-full items-center gap-3.5 rounded-xl px-4 py-3.5 font-sans text-sm font-medium transition-all ${isCollapsed ? 'lg:justify-center lg:px-0' : ''} ${
                  isActive
                    ? 'bg-brand-primary-container/60 text-brand-primary font-semibold'
                    : 'text-brand-text-variant hover:bg-brand-gray-hover hover:text-brand-text'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="absolute left-0 top-1/4 h-1/2 w-1 rounded-r-full bg-brand-primary"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <Icon className={`h-5 w-5 shrink-0 transition-transform group-hover:scale-105 ${isActive ? 'text-brand-primary' : 'text-brand-text-variant'}`} />
                <span className={isCollapsed ? 'lg:hidden' : ''}>{item.label}</span>
                {isCollapsed && <span className="sr-only">{item.label}</span>}
              </button>
            );
          })}

          <div className="my-5 border-t border-brand-gray-border/60" />

          {/* Settings Tab */}
          <button
            onClick={() => {
              onNavigate(ViewType.SETTINGS);
              if (window.innerWidth < 1024) {
                onToggle();
              }
            }}
            className={`group relative flex w-full items-center gap-3.5 rounded-xl px-4 py-3.5 font-sans text-sm font-medium transition-all ${isCollapsed ? 'lg:justify-center lg:px-0' : ''} ${
              currentView === ViewType.SETTINGS
                ? 'bg-brand-primary-container/60 text-brand-primary font-semibold'
                : 'text-brand-text-variant hover:bg-brand-gray-hover hover:text-brand-text'
            }`}
          >
            {currentView === ViewType.SETTINGS && (
              <motion.div
                layoutId="activeIndicator"
                className="absolute left-0 top-1/4 h-1/2 w-1 rounded-r-full bg-brand-primary"
              />
            )}
            <Settings className={`h-5 w-5 shrink-0 group-hover:rotate-45 transition-transform duration-300 ${currentView === ViewType.SETTINGS ? 'text-brand-primary' : 'text-brand-text-variant'}`} />
            <span className={isCollapsed ? 'lg:hidden' : ''}>Settings</span>
            {isCollapsed && <span className="sr-only">Settings</span>}
          </button>
        </nav>

        {/* Pinned Footer (User Card & Logout) */}
        <div className={`shrink-0 bg-brand-card border-t border-brand-gray-border p-4 ${isCollapsed ? 'lg:px-3' : ''}`}>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-brand-gray-hover p-3">
            <div className="flex items-center gap-2.5 overflow-hidden">
              {imgSrc ? (
                <img
                  src={imgSrc}
                  alt={formattedAdminName}
                  className="h-10 w-10 rounded-lg object-cover ring-2 ring-brand-primary/10 shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-accent-light text-brand-secondary font-sans font-bold text-xs shrink-0 ring-2 ring-brand-accent/10">
                  {initials}
                </div>
              )}
              <div className={`overflow-hidden ${isCollapsed ? 'lg:hidden' : ''}`}>
                <p className="font-sans text-xs font-semibold text-brand-text truncate capitalize">{adminName}</p>
                <p className="font-mono text-[9px] text-brand-text-variant truncate">{userEmail}</p>
              </div>
            </div>
            <button
              onClick={onLogout}
              className={`flex h-10 w-10 items-center justify-center rounded-xl bg-status-error-text text-white shadow-md hover:opacity-90 active:scale-95 transition-all shrink-0 cursor-pointer ${isCollapsed ? 'lg:hidden' : ''}`}
              title="Logout"
              id="logout-btn"
            >
              <Power className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
