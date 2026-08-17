import React, { useState } from 'react';
import { Mail, ArrowLeft, ArrowRight, Building, CheckCircle2, AlertTriangle, KeyRound } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from './AuthContext';
import { useCompany } from './CompanyContext';

interface ForgotPasswordViewProps {
  onBackToLogin: () => void;
  onNavigateToReset: () => void;
}

export default function ForgotPasswordView({ onBackToLogin, onNavigateToReset }: ForgotPasswordViewProps) {
  const { forgotPassword } = useAuth();
  const { companyName } = useCompany();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setErrorMsg('Please enter your registered email address.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    setGeneratedToken(null);

    const result = await forgotPassword(email);
    setIsLoading(false);

    if (result.success) {
      setGeneratedToken(result.token || '');
    } else {
      setErrorMsg(result.error || 'Password recovery failed. Please verify your email.');
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col justify-between p-6 font-sans selection:bg-brand-primary selection:text-white">
      {/* Upper header back button */}
      <div className="max-w-md w-full mx-auto">
        <button 
          onClick={onBackToLogin}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-primary hover:text-brand-primary-light transition-all group cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to Login
        </button>
      </div>

      {/* Main card panel */}
      <div className="max-w-md w-full mx-auto my-8">
        <div className="text-center mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-primary text-white shadow-md mb-3.5">
            <KeyRound className="h-6 w-6 text-brand-accent" />
          </div>
          <h2 className="text-2xl font-black text-brand-primary tracking-tight">RECOVER PASSWORD</h2>
          <p className="text-xs text-brand-text-variant font-medium mt-0.5">
            {companyName} Security Gateway
          </p>
        </div>

        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="rounded-3xl border border-brand-gray-border bg-white p-8 shadow-ambient"
        >
          {generatedToken ? (
            <div className="space-y-6">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-3" />
                <h3 className="text-sm font-bold text-emerald-800 uppercase tracking-wide">Reset Link Dispatched</h3>
                <p className="text-xs text-brand-text-variant leading-relaxed mt-2">
                  A verification token was registered successfully. In production, this generates a secure, one-time link sent via email.
                </p>
              </div>

              {/* Developer Bypass Sandbox Indicator */}
              <div className="bg-brand-primary-container/40 border border-brand-primary/20 rounded-2xl p-5 space-y-3">
                <p className="font-mono text-[10px] text-brand-primary font-bold tracking-widest uppercase text-center">
                  🛠️ Local Development Bypass Token
                </p>
                <div className="text-center">
                  <span className="font-mono text-xl font-extrabold tracking-widest bg-white border border-brand-primary-light/20 px-4 py-2 rounded-xl text-brand-primary inline-block">
                    {generatedToken}
                  </span>
                </div>
                <p className="text-[11px] text-brand-text-variant text-center font-medium">
                  Copy the code above and navigate to the Reset Portal to update your credentials immediately.
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={onNavigateToReset}
                  className="w-full rounded-xl bg-brand-primary py-3.5 font-sans text-sm font-bold text-white shadow-ambient hover:bg-brand-primary-light transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  Proceed to Reset Portal
                  <ArrowRight className="h-4.5 w-4.5" />
                </button>
                <button
                  onClick={() => {
                    setGeneratedToken(null);
                    setEmail('');
                  }}
                  className="w-full rounded-xl border border-brand-gray-border bg-white hover:bg-brand-gray-hover py-3 font-sans text-xs font-bold text-brand-primary transition-all cursor-pointer"
                >
                  Request Another Code
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-xs text-brand-text-variant leading-relaxed">
                Provide your registered email account below. The system will inspect compliance records and dispatch a secure 6-digit credential modification token.
              </p>

              {errorMsg && (
                <div className="bg-rose-50 text-rose-800 p-3.5 rounded-xl border border-rose-200 text-xs font-semibold leading-relaxed flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Email field */}
              <div>
                <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3.5 text-brand-text-variant h-4.5 w-4.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={`name@${companyName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'company'}.com`}
                    className="w-full rounded-xl bg-[#f0f2f5] pl-11 pr-4 py-3.5 text-sm text-brand-text border-2 border-transparent outline-none focus:border-brand-primary focus:bg-white focus:shadow-sm transition-all"
                  />
                </div>
              </div>

              {/* Recovery button */}
              <button
                type="submit"
                disabled={isLoading}
                className="mt-2 w-full rounded-xl bg-brand-primary py-3.5 font-sans text-sm font-bold text-white shadow-ambient hover:bg-brand-primary-light disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <div className="h-4.5 w-4.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Querying Security Server...
                  </>
                ) : (
                  <>
                    Transmit Recovery Link
                    <ArrowRight className="h-4.5 w-4.5" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onNavigateToReset}
                className="w-full text-center text-xs font-bold text-brand-primary hover:underline pt-2 cursor-pointer"
              >
                Already have a verification code? Click here
              </button>
            </form>
          )}
        </motion.div>
      </div>

      {/* Footer copyright */}
      <div className="text-center font-sans space-y-3.5">
        <p className="text-xs text-brand-text-variant/75 font-medium">
          © 2026 {companyName.toUpperCase()}. All rights reserved.
        </p>
      </div>
    </div>
  );
}
