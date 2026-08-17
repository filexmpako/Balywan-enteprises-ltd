import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import { ViewType } from '../types';
import { useAuth } from './AuthContext';

interface AdminLayoutProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  selectedOwnerName: string;
  userEmail: string;
  adminName?: string;
  adminAvatarPhotoId?: string;
  reportsListLength: number;
  children: React.ReactNode;
}

export default function AdminLayout({
  currentView,
  onNavigate,
  selectedOwnerName,
  userEmail,
  adminName,
  adminAvatarPhotoId,
  children
}: AdminLayoutProps) {
  const { logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-brand-bg flex text-brand-text antialiased selection:bg-brand-primary/10">
      {/* Sidebar Nav */}
      <Sidebar 
        currentView={currentView} 
        onNavigate={(view) => {
          onNavigate(view);
          setSidebarOpen(false); // Auto-close drawer on mobile navigation
        }} 
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onLogout={logout}
        userEmail={userEmail}
        adminName={adminName}
        adminAvatarPhotoId={adminAvatarPhotoId}
      />

      {/* Main container area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Top Persistent Header */}
        <Header 
          currentView={currentView} 
          onNavigate={onNavigate}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          userEmail={userEmail}
          adminName={adminName}
          adminAvatarPhotoId={adminAvatarPhotoId}
          selectedOwnerName={selectedOwnerName}
        />

        {/* Dynamic Content */}
        <main className="flex-1 overflow-y-auto focus:outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
