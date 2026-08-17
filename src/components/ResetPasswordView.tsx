import React, { useState } from 'react';
import { Lock, ArrowLeft, ArrowRight, CheckCircle2, AlertTriangle, KeyRound, Eye, EyeOff } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from './AuthContext';
import { useCompany } from './CompanyContext';

interface ResetPasswordViewProps {
  onBackToLogin: () => void;
}

export default function ResetPasswordView({ onBackToLogin }: ResetPasswordViewProps) {
  const { resetPassword } = useAuth();
  const { companyName } = useCompany();
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newPassword || !confirmPassword) {
      setErrorMsg('All credential fields are strictly required.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('The new password and password confirmation parameters do not align.');
      return;
    }

    if (newPassword.length < 8) {
      setErrorMsg('Security guidelines require passwords to be at least 8 characters in length.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    const result = await resetPassword(token.trim(), newPassword);
    setIsLoading(false);

    if (result.success) {
      setSuccessMsg('Your security credentials have been modified successfully. You may now authenticate.');
      setToken('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setErrorMsg(result.error || 'Credential modification failed. Please check your verification code.');
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
            <Lock className="h-6 w-6 text-brand-accent" />
          </div>
          <h2 className="text-2xl font-black text-brand-primary tracking-tight">SET NEW PASSWORD</h2>
          <p className="text-xs text-brand-text-variant font-medium mt-0.5">
            {companyName} Security Gateway
          </p>
        </div>

        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="rounded-3xl border border-brand-gray-border bg-white p-8 shadow-ambient"
        >
          {successMsg ? (
            <div className="space-y-6">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-3" />
                <h3 className="text-sm font-bold text-emerald-800 uppercase tracking-wide font-sans">Reset Completed</h3>
                <p className="text-xs text-brand-text-variant leading-relaxed mt-2">
                  {successMsg}
                </p>
              </div>

              <button
                onClick={onBackToLogin}
                className="w-full rounded-xl bg-brand-primary py-3.5 font-sans text-sm font-bold text-white shadow-ambient hover:bg-brand-primary-light transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                Proceed to Login Console
                <ArrowRight className="h-4.5 w-4.5" />
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-xs text-brand-text-variant leading-relaxed">
                Enter the verification token sent to your email address and supply your new secure password credential mapping below.
              </p>

              {errorMsg && (
                <div className="bg-rose-50 text-rose-800 p-3.5 rounded-xl border border-rose-200 text-xs font-semibold leading-relaxed flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Verification Token */}
              <div>
                <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1.5">Verification Token</label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-3.5 text-brand-text-variant h-4.5 w-4.5" />
                  <input
                    type="text"
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="e.g. RST-123456"
                    className="w-full rounded-xl bg-[#f0f2f5] pl-11 pr-4 py-3.5 text-sm text-brand-text border-2 border-transparent outline-none focus:border-brand-primary focus:bg-white focus:shadow-sm transition-all font-mono"
                  />
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1.5">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 text-brand-text-variant h-4.5 w-4.5" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl bg-[#f0f2f5] pl-11 pr-11 py-3.5 text-sm text-brand-text border-2 border-transparent outline-none focus:border-brand-primary focus:bg-white focus:shadow-sm transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3.5 text-brand-text-variant hover:text-brand-text rounded p-0.5 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1.5">Confirm New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 text-brand-text-variant h-4.5 w-4.5" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl bg-[#f0f2f5] pl-11 pr-11 py-3.5 text-sm text-brand-text border-2 border-transparent outline-none focus:border-brand-primary focus:bg-white focus:shadow-sm transition-all"
                  />
                </div>
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={isLoading}
                className="mt-2 w-full rounded-xl bg-brand-primary py-3.5 font-sans text-sm font-bold text-white shadow-ambient hover:bg-brand-primary-light disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <div className="h-4.5 w-4.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Updating Master Database...
                  </>
                ) : (
                  <>
                    Confirm Credential Reset
                    <ArrowRight className="h-4.5 w-4.5" />
                  </>
                )}
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
