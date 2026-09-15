import React, { useState } from 'react';
import { 
  Building, 
  User, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  ShieldCheck,
  ArrowLeft
} from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from './AuthContext';
import { useCompany } from './CompanyContext';

interface LoginViewProps {
  onBackToGateway: () => void;
  portalType?: 'admin' | 'owner' | 'float-manager';
}

export default function LoginView({ 
  onBackToGateway,
  portalType = 'admin'
}: LoginViewProps) {
  const { login } = useAuth();
  const { companyName } = useCompany();
  const isFloatManager = portalType === 'float-manager';
  const isOwner = portalType === 'owner';

  const portalHeading = isFloatManager
    ? 'Float Manager Portal'
    : isOwner
    ? 'Agent Access Portal'
    : 'Executive Access Portal';

  const targetHash = isFloatManager
    ? '#/float-manager/dashboard'
    : isOwner
    ? '#/owner/dashboard'
    : '#/admin/dashboard';

  // Credentials are never pre-filled for any portal.
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepLogged, setKeepLogged] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setErrorMsg('Please enter both your username and password.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      const result = await login(username, portalType, password);
      setIsLoading(false);
      
      if (result.success) {
        // Redirection will happen automatically in App.tsx based on updated auth state
        window.location.hash = targetHash;
      } else {
        setErrorMsg(result.error || 'Authentication handshake failed.');
      }
    } catch {
      setIsLoading(false);
      setErrorMsg('A security timeout occurred while contacting the authentication node.');
    }
  };

  const handleForgotPasswordClick = (e: React.MouseEvent) => {
    e.preventDefault();
    window.location.hash = '#/forgot-password';
  };

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col justify-between p-6 font-sans selection:bg-brand-primary selection:text-white">
      {/* Upper header back button */}
      <div className="max-w-md w-full mx-auto">
        <button 
          onClick={onBackToGateway}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-primary hover:text-brand-primary-light transition-all group cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to Gateway Selection
        </button>
      </div>

      {/* Main card panel */}
      <div className="max-w-md w-full mx-auto my-8">
        <div className="text-center mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-primary text-white shadow-md mb-3.5">
            <Building className="h-7 w-7 text-brand-accent" />
          </div>
          <h2 className="text-2xl font-black text-brand-primary tracking-tight">{companyName.toUpperCase()}</h2>
          <p className="text-xs text-brand-text-variant font-medium mt-0.5">
            {portalHeading}
          </p>
        </div>

        {/* Card containing inputs */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="rounded-3xl border border-brand-gray-border bg-white p-8 shadow-ambient"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div className="bg-rose-50 text-rose-800 p-3 rounded-xl border border-rose-200 text-xs font-semibold leading-relaxed">
                {errorMsg}
              </div>
            )}

            {/* Username field */}
            <div>
              <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1.5">Username</label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 text-brand-text-variant h-4.5 w-4.5" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. admin or agent username"
                  className="w-full rounded-xl bg-[#f0f2f5] pl-11 pr-4 py-3 text-sm text-brand-text border-2 border-transparent outline-none focus:border-brand-primary focus:bg-white focus:shadow-sm transition-all"
                />
              </div>
            </div>

            {/* Password field */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-bold text-brand-text uppercase tracking-wider">Password</label>
                <a 
                  href="#/forgot-password" 
                  onClick={handleForgotPasswordClick} 
                  className="text-[11px] font-bold text-brand-primary hover:underline cursor-pointer"
                >
                  Forgot Password?
                </a>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 text-brand-text-variant h-4.5 w-4.5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl bg-[#f0f2f5] pl-11 pr-11 py-3 text-sm text-brand-text border-2 border-transparent outline-none focus:border-brand-primary focus:bg-white focus:shadow-sm transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3 text-brand-text-variant hover:text-brand-text rounded p-0.5 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                </button>
              </div>
            </div>

            {/* Stay signed in checkbox */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="keep-logged-check"
                checked={keepLogged}
                onChange={() => setKeepLogged(!keepLogged)}
                className="rounded text-brand-primary focus:ring-brand-primary h-4 w-4 border-slate-300"
              />
              <label htmlFor="keep-logged-check" className="font-sans text-xs font-medium text-brand-text-variant select-none cursor-pointer">
                Keep me logged in for 30 days
              </label>
            </div>

            {/* Sign in button trigger */}
            <button
              type="submit"
              disabled={isLoading}
              className="mt-4 w-full rounded-xl bg-brand-primary py-3.5 font-sans text-sm font-bold text-white shadow-ambient hover:bg-brand-primary-light disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              id="login-submit-btn"
            >
              {isLoading ? (
                <>
                  <div className="h-4.5 w-4.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Securing Connection...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="h-4.5 w-4.5" />
                </>
              )}
            </button>
          </form>

          {/* SSO divider */}
          <div className="relative my-6 flex items-center justify-center">
            <div className="absolute inset-x-0 border-t border-brand-gray-border" />
            <span className="relative z-10 bg-white px-3 font-mono text-[9px] font-bold text-slate-400 uppercase tracking-widest">
              Single Sign-On
            </span>
          </div>

          {/* Single sign-on is not enabled on this deployment. */}
          <div className="rounded-xl border border-dashed border-brand-gray-border bg-brand-gray-hover/40 px-4 py-3 text-center">
            <div className="flex items-center justify-center gap-2 text-xs font-bold text-brand-text">
              <ShieldCheck className="h-4 w-4 text-brand-primary shrink-0" />
              Single sign-on is not enabled
            </div>
            <p className="mt-1 text-[11px] font-medium text-brand-text-variant">
              Sign in with the username and password issued to you by your administrator.
            </p>
          </div>
        </motion.div>
      </div>

      {/* Footer copyright block */}
      <div className="text-center font-sans space-y-3.5">
        <p className="text-xs text-brand-text-variant/75 font-medium">
          © 2026 {companyName.toUpperCase()}. All rights reserved.
        </p>
        <div className="flex justify-center gap-4 text-[10px] font-bold text-brand-primary uppercase tracking-wider">
          <a href="#privacy" className="hover:underline">Privacy Policy</a>
          <span className="text-slate-300">•</span>
          <a href="#security" className="hover:underline">Security Standards</a>
          <span className="text-slate-300">•</span>
          <a href="#support" className="hover:underline">Contact Support</a>
        </div>
      </div>
    </div>
  );
}
