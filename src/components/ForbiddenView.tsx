import React from 'react';
import { ShieldAlert, ArrowLeft, Home, Building } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from './AuthContext';
import { useCompany } from './CompanyContext';

interface ForbiddenViewProps {
  onBackToSafeRoute?: () => void;
}

export default function ForbiddenView({ onBackToSafeRoute }: ForbiddenViewProps) {
  const { user, logout } = useAuth();
  const { companyName } = useCompany();

  const handleReturn = () => {
    if (onBackToSafeRoute) {
      onBackToSafeRoute();
    } else {
      // Default fallback
      window.location.hash = user?.role === 'Admin' ? '#/admin/dashboard' : '#/owner/dashboard';
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col justify-between p-6 sm:p-12 font-sans text-brand-text antialiased">
      {/* Spacer */}
      <div className="h-4" />

      {/* Centered Error Container */}
      <div className="max-w-xl w-full mx-auto text-center">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          className="bg-white border border-brand-gray-border rounded-3xl p-8 sm:p-12 shadow-ambient relative overflow-hidden"
        >
          {/* Top Yellow Warning Backdrop Flag */}
          <div className="absolute top-0 inset-x-0 h-2 bg-brand-accent" />

          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-brand-secondary shadow-sm mb-6 ring-4 ring-brand-accent/20">
            <ShieldAlert className="h-8 w-8 text-brand-secondary" />
          </div>

          <h1 className="text-4xl font-black tracking-tight text-brand-primary uppercase">
            Access Restricted
          </h1>
          <p className="font-mono text-[10px] tracking-widest text-brand-secondary font-extrabold uppercase mt-1">
            Error Code: 403 Forbidden
          </p>

          <p className="text-sm text-brand-text-variant leading-relaxed mt-6">
            Your authorized account scope <strong className="text-brand-text">({user?.role || 'Guest'})</strong> does not permit entry into this secure administrative directory. All security transitions are monitored for corporate compliance.
          </p>

          {user && (
            <div className="bg-brand-gray-hover/60 border border-brand-gray-border rounded-2xl p-4 my-6 text-left flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-brand-primary text-white flex items-center justify-center font-bold text-xs">
                {user.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-brand-text truncate">{user.name}</p>
                <p className="font-mono text-[9px] text-brand-text-variant truncate">{user.email} • {user.role}</p>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 items-stretch justify-center mt-8">
            <button
              onClick={handleReturn}
              className="rounded-xl bg-brand-primary text-white hover:bg-brand-primary-light px-6 py-3.5 font-sans text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-ambient"
            >
              <Home className="h-4.5 w-4.5 text-brand-accent" />
              Return to Safe Hub
            </button>
            <button
              onClick={logout}
              className="rounded-xl border border-brand-gray-border bg-white hover:bg-brand-gray-hover px-6 py-3.5 font-sans text-sm font-bold text-brand-primary transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              Log Out Security Session
            </button>
          </div>
        </motion.div>
      </div>

      {/* Footer copyright */}
      <div className="text-center font-sans space-y-2">
        <p className="font-mono text-[9px] text-brand-text-variant/60 tracking-wider">
          © 2026 {companyName.toUpperCase()} • SECURITY SHIELD ACTIVE
        </p>
      </div>
    </div>
  );
}
