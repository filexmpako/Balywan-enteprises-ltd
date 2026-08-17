import React, { useState, useEffect } from 'react';
import { ViewType, AuditReport } from './types';
import { auditHistoryReports as initialReports } from './data';
import GatewayView from './components/GatewayView';
import LoginView from './components/LoginView';
import ForgotPasswordView from './components/ForgotPasswordView';
import ResetPasswordView from './components/ResetPasswordView';
import ForbiddenView from './components/ForbiddenView';
import NotFoundView from './components/NotFoundView';
import AdminLayout from './components/AdminLayout';
import OwnerLayout from './components/OwnerLayout';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider, useAuth } from './components/AuthContext';
import { CompanyProvider, useCompany } from './components/CompanyContext';
import { ReportingPeriodProvider } from './components/ReportingPeriodContext';

// Existing sub views
import DashboardView from './components/DashboardView';
import OwnersView from './components/OwnersView';
import OwnerDetailsView from './components/OwnerDetailsView';
import UploadReportsView from './components/UploadReportsView';
import KPIReportsView from './components/KPIReportsView';
import ReportHistoryView from './components/ReportHistoryView';
import SettingsView from './components/SettingsView';
import PersonnelView from './components/PersonnelView';
import PeopleManagementView from './components/PeopleManagementView';
import AdminFieldMapView from './components/AdminFieldMapView';
import BaseWakalaView from './components/BaseWakalaView';
import ClassificationAuditLogView from './components/ClassificationAuditLogView';
import TargetsView from './components/TargetsView';
import FloatManagerView from './components/FloatManagerView';

function AppContent() {
  // Theme state
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'dark') return 'dark';
      if (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    }
    return 'light';
  });

  // Apply theme class to document
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const { user, portalType, setPortalType, logout, isLoading } = useAuth();
  
  // Hash Routing
  const [hash, setHash] = useState(() => typeof window !== 'undefined' ? window.location.hash || '#/' : '#/');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const schemaVersion = localStorage.getItem('hasidadi_schema_version');
      if (schemaVersion !== 'v2') {
        localStorage.removeItem('ownersList');
        localStorage.removeItem('tillsList');
        localStorage.setItem('hasidadi_schema_version', 'v2');
      }
    }
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      setHash(window.location.hash || '#/');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Shared state variables
  const [selectedOwnerName, setSelectedOwnerName] = useState<string>('');
  const [reportsList, setReportsList] = useState<AuditReport[]>(() => {
    const saved = localStorage.getItem('auditHistoryReports');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return initialReports;
  });

  const handleAddAuditReport = (newReport: AuditReport) => {
    setReportsList(prev => {
      const updated = [newReport, ...prev];
      localStorage.setItem('auditHistoryReports', JSON.stringify(updated));
      return updated;
    });
  };

  const { companyName } = useCompany();

  // If loading, show a loading status matching layout
  if (isLoading) {
    return (
      <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-primary border-t-transparent" />
        <p className="mt-4 font-mono text-xs font-semibold tracking-widest text-brand-primary uppercase">
          Initializing {companyName} Secure Gateway...
        </p>
      </div>
    );
  }

  // --- UNAUTHENTICATED ROUTING ---
  if (!user) {
    if (hash === '#/forgot-password') {
      return (
        <ForgotPasswordView 
          onBackToLogin={() => { window.location.hash = '#/login'; }} 
          onNavigateToReset={() => { window.location.hash = '#/reset-password'; }}
        />
      );
    }
    if (hash === '#/reset-password') {
      return (
        <ResetPasswordView 
          onBackToLogin={() => { window.location.hash = '#/login'; }} 
        />
      );
    }
    if (hash === '#/login') {
      if (!portalType) {
        window.location.hash = '#/';
        return null;
      }
      return (
        <LoginView 
          portalType={portalType} 
          onBackToGateway={() => {
            setPortalType(null);
            window.location.hash = '#/';
          }} 
        />
      );
    }
    // Default to gateway selection
    return (
      <GatewayView 
        onSelectPortal={(type) => {
          setPortalType(type);
          window.location.hash = '#/login';
        }} 
      />
    );
  }

  // --- AUTHENTICATED ROUTING ---
  
  // ROLE: OWNER
  if (user.role === 'Owner') {
    // If attempting to access admin or float manager views
    if (hash.startsWith('#/admin/') || hash.startsWith('#/float-manager/')) {
      return <ForbiddenView onBackToSafeRoute={() => { window.location.hash = '#/owner/dashboard'; }} />;
    }

    // Owner allowed views
    if (hash === '#/owner/dashboard' || hash === '#/owner/profile' || hash === '#/' || hash === '#/login') {
      return (
        <ProtectedRoute allowedRoles={['Owner']}>
          <OwnerLayout ownerName={user.name}>
            <OwnerDetailsView 
              onNavigate={(view) => {
                // If they try navigating inside the details view (not fully supported for owners yet)
              }}
              selectedOwnerName={user.name}
              isStandaloneAgent={true}
              onLogout={logout}
            />
          </OwnerLayout>
        </ProtectedRoute>
      );
    }

    // Default Owner 404
    return <NotFoundView onBackToSafeRoute={() => { window.location.hash = '#/owner/dashboard'; }} />;
  }

  // ROLE: FLOAT MANAGER
  if (user.role === 'FloatManager') {
    // If attempting to access admin or owner views
    if (hash.startsWith('#/admin/') || hash.startsWith('#/owner/')) {
      return <ForbiddenView onBackToSafeRoute={() => { window.location.hash = '#/float-manager/dashboard'; }} />;
    }

    if (hash === '#/float-manager/dashboard' || hash === '#/' || hash === '#/login') {
      return (
        <ProtectedRoute allowedRoles={['FloatManager']}>
          <FloatManagerView onLogout={logout} />
        </ProtectedRoute>
      );
    }

    // Default Float Manager 404
    return <NotFoundView onBackToSafeRoute={() => { window.location.hash = '#/float-manager/dashboard'; }} />;
  }

  // ROLE: ADMIN
  if (user.role === 'Admin') {
    // If attempting to access owner or float manager views
    if (hash.startsWith('#/owner/') || hash.startsWith('#/float-manager/')) {
      return <ForbiddenView onBackToSafeRoute={() => { window.location.hash = '#/admin/dashboard'; }} />;
    }

    // Map Hash Views to ViewType for Sidebar and sub-components compatibility
    let currentView: ViewType = ViewType.DASHBOARD;
    let contentNode: React.ReactNode = null;

    if (hash === '#/admin/dashboard' || hash === '#/' || hash === '#/login') {
      currentView = ViewType.DASHBOARD;
      contentNode = (
        <DashboardView 
          onNavigate={(view) => {
            if (view === ViewType.OWNERS || view === ViewType.PEOPLE_MGT) window.location.hash = '#/admin/owners';
            else if (view === ViewType.BASE_WAKALA) window.location.hash = '#/admin/base';
            else if (view === ViewType.OWNER_DETAILS) window.location.hash = '#/admin/owner-details';
            else if (view === ViewType.UPLOAD_REPORTS) window.location.hash = '#/admin/upload';
            else if (view === ViewType.SETTINGS) window.location.hash = '#/admin/settings';
            else if (view === ViewType.TARGETS) window.location.hash = '#/admin/targets';
            else if (view === ViewType.FLOAT_MANAGEMENT) window.location.hash = '#/admin/float';
            else if (view === ViewType.KPI_REPORTS) window.location.hash = '#/admin/kpi-reports';
            else if (view === ViewType.FIELD_MAP) window.location.hash = '#/admin/map';
            else if (view === ViewType.REPORT_HISTORY) window.location.hash = '#/admin/history';
            else if (view === ViewType.CLASSIFICATION_AUDIT) window.location.hash = '#/admin/audit';
          }}
          onSelectOwner={(name) => {
            setSelectedOwnerName(name);
            window.location.hash = '#/admin/owner-details';
          }}
        />
      );
    } else if (hash === '#/admin/owners' || hash === '#/admin/people') {
      currentView = ViewType.PEOPLE_MGT;
      contentNode = (
        <PeopleManagementView 
          onNavigate={(view) => {
            if (view === ViewType.DASHBOARD) window.location.hash = '#/admin/dashboard';
            else if (view === ViewType.SETTINGS) window.location.hash = '#/admin/settings';
            else if (view === ViewType.KPI_REPORTS) window.location.hash = '#/admin/kpi-reports';
            else if (view === ViewType.OWNER_DETAILS) window.location.hash = '#/admin/owner-details';
            else if (view === ViewType.TARGETS) window.location.hash = '#/admin/targets';
            else if (view === ViewType.FLOAT_MANAGEMENT) window.location.hash = '#/admin/float';
          }}
          onSelectOwner={(name) => {
            setSelectedOwnerName(name);
            window.location.hash = '#/admin/owner-details';
          }}
          defaultSubmodule="owners"
        />
      );
    } else if (hash === '#/admin/owner-details') {
      if (!selectedOwnerName) {
        window.location.hash = '#/admin/owners';
        return null;
      }
      currentView = ViewType.OWNER_DETAILS;
      contentNode = (
        <OwnerDetailsView 
          onNavigate={(view) => {
            if (view === ViewType.PEOPLE_MGT || view === ViewType.OWNERS) window.location.hash = '#/admin/owners';
            else if (view === ViewType.TARGETS) window.location.hash = '#/admin/targets';
            else if (view === ViewType.FLOAT_MANAGEMENT) window.location.hash = '#/admin/float';
          }}
          selectedOwnerName={selectedOwnerName}
        />
      );
    } else if (hash === '#/admin/kpi-reports') {
      currentView = ViewType.KPI_REPORTS;
      contentNode = (
        <KPIReportsView 
          onNavigate={(view) => {
            if (view === ViewType.DASHBOARD) window.location.hash = '#/admin/dashboard';
            else if (view === ViewType.TARGETS) window.location.hash = '#/admin/targets';
            else if (view === ViewType.FLOAT_MANAGEMENT) window.location.hash = '#/admin/float';
            else if (view === ViewType.UPLOAD_REPORTS) window.location.hash = '#/admin/upload';
          }}
        />
      );
    } else if (hash === '#/admin/upload') {
      currentView = ViewType.UPLOAD_REPORTS;
      contentNode = (
        <UploadReportsView 
          onNavigate={(view) => {
            if (view === ViewType.DASHBOARD) window.location.hash = '#/admin/dashboard';
            else if (view === ViewType.BASE_WAKALA) window.location.hash = '#/admin/base';
            else if (view === ViewType.REPORT_HISTORY) window.location.hash = '#/admin/history';
            else if (view === ViewType.TARGETS) window.location.hash = '#/admin/targets';
            else if (view === ViewType.FLOAT_MANAGEMENT) window.location.hash = '#/admin/float';
          }}
          onAddAuditReport={handleAddAuditReport}
        />
      );
    } else if (hash === '#/admin/history') {
      currentView = ViewType.REPORT_HISTORY;
      contentNode = (
        <ReportHistoryView 
          onNavigate={(view) => {
            if (view === ViewType.DASHBOARD) window.location.hash = '#/admin/dashboard';
            else if (view === ViewType.TARGETS) window.location.hash = '#/admin/targets';
            else if (view === ViewType.FLOAT_MANAGEMENT) window.location.hash = '#/admin/float';
          }}
          reports={reportsList}
          onAddAuditReport={handleAddAuditReport}
        />
      );
    } else if (hash === '#/admin/settings') {
      currentView = ViewType.SETTINGS;
      contentNode = (
        <SettingsView 
          userEmail={user.email}
          theme={theme}
          onThemeChange={setTheme}
          onNavigate={(view) => {
            if (view === ViewType.PEOPLE_MGT || view === ViewType.OWNERS) window.location.hash = '#/admin/owners';
            else if (view === ViewType.TARGETS) window.location.hash = '#/admin/targets';
            else if (view === ViewType.FLOAT_MANAGEMENT) window.location.hash = '#/admin/float';
          }}
          onSelectOwner={(name) => {
            setSelectedOwnerName(name);
            window.location.hash = '#/admin/owner-details';
          }}
        />
      );
    } else if (hash === '#/admin/personnel') {
      currentView = ViewType.PEOPLE_MGT;
      contentNode = (
        <PeopleManagementView 
          onNavigate={(view) => {
            if (view === ViewType.DASHBOARD) window.location.hash = '#/admin/dashboard';
            else if (view === ViewType.SETTINGS) window.location.hash = '#/admin/settings';
            else if (view === ViewType.KPI_REPORTS) window.location.hash = '#/admin/kpi-reports';
            else if (view === ViewType.OWNER_DETAILS) window.location.hash = '#/admin/owner-details';
            else if (view === ViewType.TARGETS) window.location.hash = '#/admin/targets';
            else if (view === ViewType.FLOAT_MANAGEMENT) window.location.hash = '#/admin/float';
          }}
          onSelectOwner={(name) => {
            setSelectedOwnerName(name);
            window.location.hash = '#/admin/owner-details';
          }}
          defaultSubmodule="personnel"
        />
      );
    } else if (hash === '#/admin/map') {
      currentView = ViewType.FIELD_MAP;
      contentNode = (
        <AdminFieldMapView 
          onSelectOwner={(name) => {
            setSelectedOwnerName(name);
            window.location.hash = '#/admin/owner-details';
          }}
          onNavigate={(view) => {
            if (view === ViewType.DASHBOARD) window.location.hash = '#/admin/dashboard';
            else if (view === ViewType.BASE_WAKALA) window.location.hash = '#/admin/base';
            else if (view === ViewType.TARGETS) window.location.hash = '#/admin/targets';
            else if (view === ViewType.FLOAT_MANAGEMENT) window.location.hash = '#/admin/float';
          }}
        />
      );
    } else if (hash === '#/admin/base') {
      currentView = ViewType.BASE_WAKALA;
      contentNode = <BaseWakalaView />;
    } else if (hash === '#/admin/audit') {
      currentView = ViewType.CLASSIFICATION_AUDIT;
      contentNode = <ClassificationAuditLogView />;
    } else if (hash === '#/admin/targets') {
      currentView = ViewType.TARGETS;
      contentNode = <TargetsView />;
    } else if (hash === '#/admin/float') {
      currentView = ViewType.FLOAT_MANAGEMENT;
      contentNode = <FloatManagerView readOnly={true} />;
    } else {
      // Admin invalid route
      return <NotFoundView onBackToSafeRoute={() => { window.location.hash = '#/admin/dashboard'; }} />;
    }

    return (
      <ProtectedRoute allowedRoles={['Admin']}>
        <AdminLayout
          currentView={currentView}
          onNavigate={(view) => {
            if (view === ViewType.DASHBOARD) window.location.hash = '#/admin/dashboard';
            else if (view === ViewType.OWNERS || view === ViewType.PEOPLE_MGT) window.location.hash = '#/admin/owners';
            else if (view === ViewType.BASE_WAKALA) window.location.hash = '#/admin/base';
            else if (view === ViewType.CLASSIFICATION_AUDIT) window.location.hash = '#/admin/audit';
            else if (view === ViewType.TARGETS) window.location.hash = '#/admin/targets';
            else if (view === ViewType.FLOAT_MANAGEMENT) window.location.hash = '#/admin/float';
            else if (view === ViewType.FIELD_MAP) window.location.hash = '#/admin/map';
            else if (view === ViewType.KPI_REPORTS) window.location.hash = '#/admin/kpi-reports';
            else if (view === ViewType.UPLOAD_REPORTS) window.location.hash = '#/admin/upload';
            else if (view === ViewType.REPORT_HISTORY) window.location.hash = '#/admin/history';
            else if (view === ViewType.SETTINGS) window.location.hash = '#/admin/settings';
            else if (view === ViewType.OWNER_DETAILS) window.location.hash = '#/admin/owner-details';
            else if (view === ViewType.PERSONNEL) window.location.hash = '#/admin/personnel';
          }}
          selectedOwnerName={selectedOwnerName}
          userEmail={user.email}
          adminName={user.name}
          adminAvatarPhotoId={user.avatarPhotoId}
          reportsListLength={reportsList.length}
        >
          {contentNode}
        </AdminLayout>
      </ProtectedRoute>
    );
  }

  return <NotFoundView />;
}

export default function App() {
  return (
    <CompanyProvider>
      <ReportingPeriodProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ReportingPeriodProvider>
    </CompanyProvider>
  );
}
