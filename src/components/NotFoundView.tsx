import React from 'react';
import { HelpCircle, ArrowLeft, Home, FileQuestion } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from './AuthContext';
import { useCompany } from './CompanyContext';

interface NotFoundViewProps {
  onBackToSafeRoute?: () => void;
}

export default function NotFoundView({ onBackToSafeRoute }: NotFoundViewProps) {
  const { user } = useAuth();
  const { companyName } = useCompany();

  const handleReturn = () => {
    if (onBackToSafeRoute) {
      onBackToSafeRoute();
    } else {
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
          {/* Top Blue Backdrop Flag */}
          <div className="absolute top-0 inset-x-0 h-2 bg-brand-primary" />

          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-brand-primary shadow-sm mb-6 ring-4 ring-brand-primary/10">
            <FileQuestion className="h-8 w-8 text-brand-primary" />
          </div>

          <h1 className="text-4xl font-black tracking-tight text-brand-primary uppercase">
            Route Unmapped
          </h1>
          <p className="font-mono text-[10px] tracking-widest text-slate-400 font-extrabold uppercase mt-1">
            Error Code: 404 Not Found
          </p>

          <p className="text-sm text-brand-text-variant leading-relaxed mt-6">
            The target URL directory path or query parameter was not discovered on this node. Please verify your resource address request.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 items-stretch justify-center mt-8">
            <button
              onClick={handleReturn}
              className="rounded-xl bg-brand-primary text-white hover:bg-brand-primary-light px-6 py-3.5 font-sans text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-ambient"
            >
              <Home className="h-4.5 w-4.5 text-brand-accent" />
              Return to Safe Hub
            </button>
            <button
              onClick={() => { window.location.hash = '#/'; }}
              className="rounded-xl border border-brand-gray-border bg-white hover:bg-brand-gray-hover px-6 py-3.5 font-sans text-sm font-bold text-brand-primary transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              Go to System Gateway
            </button>
          </div>
        </motion.div>
      </div>

      {/* Footer copyright */}
      <div className="text-center font-sans space-y-2">
        <p className="font-mono text-[9px] text-brand-text-variant/60 tracking-wider">
          © 2026 {companyName.toUpperCase()} • SOVEREIGN TRIMS INTEGRATION
        </p>
      </div>
    </div>
  );
}
