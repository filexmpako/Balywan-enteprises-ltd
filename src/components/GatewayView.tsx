import React from 'react';
import { ViewType } from '../types';
import { 
  Building, 
  ShieldAlert, 
  UserCheck, 
  Lock, 
  Globe, 
  ShieldCheck, 
  MapPin, 
  Briefcase,
  ChevronRight,
  LogIn,
  Banknote
} from 'lucide-react';
import { motion } from 'motion/react';
import { useCompany } from './CompanyContext';

interface GatewayViewProps {
  onSelectPortal: (portal: 'admin' | 'owner' | 'float-manager') => void;
}

export default function GatewayView({ onSelectPortal }: GatewayViewProps) {
  const { companyName } = useCompany();
  return (
    <div className="min-h-screen bg-brand-bg flex flex-col justify-between p-6 sm:p-12 font-sans selection:bg-brand-primary selection:text-white">
      {/* Top spacer / Header logo */}
      <div className="flex flex-col items-center text-center mt-8 sm:mt-12">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-primary text-brand-accent shadow-lg shadow-brand-primary/15 ring-4 ring-brand-accent/20 mb-4"
        >
          <Building className="h-9 w-9" />
        </motion.div>
        
        <motion.h1 
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-2xl sm:text-3xl font-black text-brand-primary tracking-tight uppercase"
        >
          {companyName}
        </motion.h1>
        <motion.p 
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="font-mono text-[10px] tracking-widest text-brand-text-variant uppercase font-extrabold mt-1"
        >
          {companyName.toUpperCase()} SYSTEM
        </motion.p>
      </div>

      {/* Center Selectors Grid (Image 4) */}
      <div className="max-w-6xl w-full mx-auto my-12 grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
        
        {/* Portal 1: Administrator Portal */}
        <motion.div 
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="rounded-3xl border border-brand-gray-border bg-brand-card p-8 shadow-ambient flex flex-col justify-between hover:border-brand-primary/40 hover:shadow-ambient-hover transition-all duration-300 group relative overflow-hidden"
        >
          {/* Subtle design watermark */}
          <div className="absolute right-0 bottom-0 text-slate-100/50 translate-x-6 translate-y-6 pointer-events-none group-hover:scale-105 transition-transform duration-500">
            <ShieldCheck className="h-44 w-44" />
          </div>

          <div className="relative z-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-brand-primary shadow-sm mb-6 ring-4 ring-brand-primary/5">
              <ShieldCheck className="h-7 w-7" />
            </div>

            <h3 className="text-xl font-bold text-brand-text group-hover:text-brand-primary transition-colors">Administrator Portal</h3>
            <p className="text-sm text-brand-text-variant leading-relaxed mt-3.5">
              Execute high-level oversight, manage global security protocols, and access comprehensive KPI reporting for the {companyName} network.
            </p>
          </div>

          <button 
            onClick={() => onSelectPortal('admin')}
            className="relative z-10 mt-8 w-full rounded-xl bg-brand-primary px-5 py-3.5 font-sans text-sm font-bold text-white shadow-ambient hover:bg-brand-primary-light transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            id="admin-portal-btn"
          >
            Sign In to Console
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
        </motion.div>

        {/* Portal 2: Owner & Agent Portal */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="rounded-3xl border border-brand-gray-border bg-brand-card p-8 shadow-ambient flex flex-col justify-between hover:border-brand-accent/40 hover:shadow-ambient-hover transition-all duration-300 group relative overflow-hidden"
        >
          {/* Subtle design watermark */}
          <div className="absolute right-0 bottom-0 text-slate-100/50 translate-x-6 translate-y-6 pointer-events-none group-hover:scale-105 transition-transform duration-500">
            <Briefcase className="h-44 w-44" />
          </div>

          <div className="relative z-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50/50 text-brand-secondary shadow-sm mb-6 ring-4 ring-brand-accent/30">
              <MapPin className="h-7 w-7" />
            </div>

            <h3 className="text-xl font-bold text-brand-text group-hover:text-brand-primary transition-colors">Owner & Agent Portal</h3>
            <p className="text-sm text-brand-text-variant leading-relaxed mt-3.5">
              Manage regional agency operations, upload performance reports, and monitor daily transaction volumes across the enterprise territory.
            </p>
          </div>

          <button 
            onClick={() => onSelectPortal('owner')}
            className="relative z-10 mt-8 w-full rounded-xl bg-brand-accent text-brand-primary hover:bg-brand-accent-light px-5 py-3.5 font-sans text-sm font-bold border-2 border-brand-accent hover:border-brand-accent-light shadow-ambient transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            id="owner-portal-btn"
          >
            Agent Login
            <LogIn className="h-4 w-4" />
          </button>
        </motion.div>

        {/* Portal 3: Float Manager Portal */}
        <motion.div 
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="rounded-3xl border border-brand-gray-border bg-brand-card p-8 shadow-ambient flex flex-col justify-between hover:border-emerald-500/40 hover:shadow-ambient-hover transition-all duration-300 group relative overflow-hidden"
        >
          {/* Subtle design watermark */}
          <div className="absolute right-0 bottom-0 text-slate-100/50 translate-x-6 translate-y-6 pointer-events-none group-hover:scale-105 transition-transform duration-500">
            <Banknote className="h-44 w-44" />
          </div>

          <div className="relative z-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 shadow-sm mb-6 ring-4 ring-emerald-500/10">
              <Banknote className="h-7 w-7" />
            </div>

            <h3 className="text-xl font-bold text-brand-text group-hover:text-emerald-700 transition-colors">Float Manager Portal</h3>
            <p className="text-sm text-brand-text-variant leading-relaxed mt-3.5">
              Review float requests, confirm disbursements, process returned float deposits, and audit reconciliation statuses across all network owners.
            </p>
          </div>

          <button 
            onClick={() => onSelectPortal('float-manager')}
            className="relative z-10 mt-8 w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-3.5 font-sans text-sm font-bold text-white shadow-ambient transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            id="float-manager-portal-btn"
          >
            Float Console
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
        </motion.div>
      </div>

      {/* Sovereign Footers list (Image 4 details) */}
      <div className="text-center space-y-4">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-semibold text-brand-text-variant/80">
          <span className="flex items-center gap-1.5">
            <Lock className="h-4 w-4 text-brand-primary/60" />
            256-bit AES Encryption
          </span>
          <span className="hidden sm:inline text-slate-300">•</span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Authorized Access Only
          </span>
          <span className="hidden sm:inline text-slate-300">•</span>
          <span className="flex items-center gap-1.5">
            <Globe className="h-4 w-4 text-indigo-600" />
            Enterprise Sovereign Data
          </span>
        </div>
        <p className="font-mono text-[9px] text-brand-text-variant/60 tracking-wider">
          © 2026 {companyName.toUpperCase()}. All rights reserved.
        </p>
      </div>
    </div>
  );
}
