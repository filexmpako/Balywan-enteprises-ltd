import React, { useState, useEffect } from 'react';
import { ViewType } from '../types';
import { 
  User, 
  Bell, 
  Save, 
  CheckCircle, 
  Sun,
  Moon,
  Settings,
  SlidersHorizontal
} from 'lucide-react';
import { getActivityRules, saveActivityRules } from '../utils/activityRules';
import { refreshWeeklyStatsHistory } from '../utils/weeklyHistory';
import { motion } from 'motion/react';
import PageHeaderBanner from './PageHeaderBanner';
import { useAuth } from './AuthContext';
import { useCompany } from './CompanyContext';

interface SettingsViewProps {
  userEmail: string;
  theme?: 'light' | 'dark';
  onThemeChange?: (theme: 'light' | 'dark') => void;
  onNavigate?: (view: ViewType) => void;
  onSelectOwner?: (name: string) => void;
}

export default function SettingsView({ 
  userEmail,
  theme = 'light',
  onThemeChange,
  onNavigate
}: SettingsViewProps) {
  const { user, updateUser } = useAuth();
  const { companyName, updateCompanyName } = useCompany();
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [companyNameInput, setCompanyNameInput] = useState(companyName);
  const [showSaved, setShowSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Sync state with loaded user and company
  useEffect(() => {
    if (user) {
      setAdminName(user.name);
      setEmail(user.email);
    }
    setCompanyNameInput(companyName);
  }, [user?.name, user?.email, companyName]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!companyNameInput.trim()) {
      setErrorMessage('Company / Organization Name cannot be empty.');
      return;
    }
    if (!adminName.trim()) {
      setErrorMessage('Administrator Display Name cannot be empty.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Please enter a valid Primary Contact Email.');
      return;
    }

    try {
      updateCompanyName(companyNameInput.trim());
      const result = await updateUser(adminName.trim(), email.trim());

      if (!result.success) {
        setErrorMessage(result.error || 'Failed to save administrator profile. Please try again.');
        return;
      }

      setShowSaved(true);
      setTimeout(() => {
        setShowSaved(false);
      }, 3500);
    } catch (err) {
      console.error('Error saving settings:', err);
      setErrorMessage('Failed to save settings. Please try again.');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8 font-sans"
    >
      {/* Title */}
      <PageHeaderBanner
        icon={Settings}
        title="Settings"
        subtitle="Configure administrator profile, theme, and notification preferences."
      />

      <div className="max-w-4xl">
        {/* Main Settings Form */}
        <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-6 shadow-ambient">
          <form onSubmit={handleSave} className="space-y-6">
            
            {/* Sec 1: Profile */}
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-brand-primary border-b border-brand-gray-border pb-2.5 mb-4 flex items-center gap-1.5">
                <User className="h-4.5 w-4.5" />
                Administrator Profile & Organization
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1.5">Company / Organization Name</label>
                  <input
                    type="text"
                    required
                    value={companyNameInput}
                    onChange={(e) => setCompanyNameInput(e.target.value)}
                    placeholder="e.g. Hasidadi Enterprises"
                    className="w-full rounded-xl bg-brand-bg border-2 border-transparent px-4 py-2.5 text-sm text-brand-text outline-none focus:border-brand-primary focus:bg-white transition-all font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1.5">Administrator Display Name</label>
                  <input
                    type="text"
                    required
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    className="w-full rounded-xl bg-brand-bg border-2 border-transparent px-4 py-2.5 text-sm text-brand-text outline-none focus:border-brand-primary focus:bg-white transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1.5">Primary Contact Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl bg-brand-bg border-2 border-transparent px-4 py-2.5 text-sm text-brand-text outline-none focus:border-brand-primary focus:bg-white transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Sec 2: Theme & Appearance */}
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-brand-primary border-b border-brand-gray-border pb-2.5 mb-4 flex items-center gap-1.5">
                <Sun className="h-4.5 w-4.5" />
                Theme & Appearance
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => onThemeChange?.('light')}
                  className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all cursor-pointer text-left ${
                    theme === 'light'
                      ? 'border-brand-primary bg-brand-primary/5 dark:bg-brand-primary/10 shadow-sm'
                      : 'border-brand-gray-border bg-brand-card hover:border-brand-primary-light/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${theme === 'light' ? 'bg-amber-100 text-amber-600' : 'bg-brand-gray-hover text-brand-text-variant'}`}>
                      <Sun className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-brand-text">Light Theme</p>
                      <p className="text-xs text-brand-text-variant mt-0.5">Classic {companyName} gold & blue</p>
                    </div>
                  </div>
                  {theme === 'light' && (
                    <div className="h-5 w-5 rounded-full bg-brand-primary flex items-center justify-center text-white">
                      <CheckCircle className="h-4 w-4" />
                    </div>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onThemeChange?.('dark')}
                  className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all cursor-pointer text-left ${
                    theme === 'dark'
                      ? 'border-brand-primary bg-brand-primary/10 shadow-sm'
                      : 'border-brand-gray-border bg-brand-card hover:border-brand-primary-light/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${theme === 'dark' ? 'bg-blue-950 text-blue-400' : 'bg-brand-gray-hover text-brand-text-variant'}`}>
                      <Moon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-brand-text">Dark Theme</p>
                      <p className="text-xs text-brand-text-variant mt-0.5">Eye-safe slate layout</p>
                    </div>
                  </div>
                  {theme === 'dark' && (
                    <div className="h-5 w-5 rounded-full bg-brand-primary flex items-center justify-center text-white">
                      <CheckCircle className="h-4 w-4" />
                    </div>
                  )}
                </button>
              </div>
            </div>

            {/* Sec 3: Alerts */}
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-brand-primary border-b border-brand-gray-border pb-2.5 mb-4 flex items-center gap-1.5">
                <Bell className="h-4.5 w-4.5" />
                Notification Handshakes
              </h3>
              
              <div className="space-y-3 font-sans text-xs font-semibold text-brand-text">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded text-brand-primary focus:ring-brand-primary h-4.5 w-4.5 border-slate-300" />
                  <span>Send slack alert upon failed schema uploads on MGT files</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded text-brand-primary focus:ring-brand-primary h-4.5 w-4.5 border-slate-300" />
                  <span>Transmit weekly transaction reports to {companyName} audits</span>
                </label>
              </div>
            </div>

            {/* Save trigger button */}
            <div className="flex flex-col gap-3 border-t border-brand-gray-border pt-5">
              {errorMessage && (
                <div className="text-xs font-bold text-rose-600 flex items-center gap-1.5 bg-rose-50 border border-rose-200/50 p-2.5 rounded-xl">
                  {errorMessage}
                </div>
              )}
              
              <div className="flex items-center justify-between">
                {showSaved ? (
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                    <CheckCircle className="h-4.5 w-4.5" />
                    Settings saved successfully!
                  </div>
                ) : <div />}
                <button
                  type="submit"
                  className="rounded-xl bg-brand-primary px-5 py-2.5 text-xs font-bold text-white shadow-ambient hover:bg-brand-primary-light transition-all flex items-center gap-1.5 cursor-pointer"
                  id="save-settings-btn"
                >
                  <Save className="h-4 w-4" />
                  Save Settings
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Activity rule: what makes a wakala Active for a reporting week */}
        <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-6 shadow-ambient mt-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-brand-primary border-b border-brand-gray-border pb-2.5 mb-4 flex items-center gap-1.5">
            <SlidersHorizontal className="h-4.5 w-4.5" />
            Active / Inactive Wakala Rule
          </h3>
          <p className="text-xs text-brand-text-variant mb-4">
            A wakala counts as active for a reporting week when its cash-in and cash-out
            transactions reach the number below. Changing this re-evaluates every stored week.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1.5">
                Transactions required
              </label>
              <input
                type="number"
                min={0}
                value={thresholdInput}
                onChange={(e) => setThresholdInput(e.target.value)}
                className="w-full rounded-xl bg-brand-bg border-2 border-transparent px-4 py-2.5 text-sm text-brand-text outline-none focus:border-brand-primary focus:bg-white transition-all font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1.5">
                How they are counted
              </label>
              <select
                value={modeInput}
                onChange={(e) => setModeInput(e.target.value as 'combined' | 'separate')}
                className="w-full rounded-xl bg-brand-bg border-2 border-transparent px-4 py-2.5 text-sm text-brand-text outline-none focus:border-brand-primary focus:bg-white transition-all font-semibold"
              >
                <option value="combined">Cash-in + cash-out together</option>
                <option value="separate">Cash-in and cash-out each</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1.5">
                Penalty rate (%)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={penaltyInput}
                onChange={(e) => setPenaltyInput(e.target.value)}
                className="w-full rounded-xl bg-brand-bg border-2 border-transparent px-4 py-2.5 text-sm text-brand-text outline-none focus:border-brand-primary focus:bg-white transition-all font-semibold"
              />
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-brand-gray-border pt-5 mt-5">
            {rulesSaved ? (
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                <CheckCircle className="h-4.5 w-4.5" />
                Rule saved — weeks re-evaluated.
              </div>
            ) : (
              <span className="text-xs text-brand-text-variant">
                Current rule: {rules.threshold} transactions ({rules.mode === 'combined' ? 'combined' : 'each'}) per week
              </span>
            )}
            <button
              type="button"
              disabled={savingRules}
              onClick={handleSaveRules}
              className="rounded-xl bg-brand-primary px-5 py-2.5 text-xs font-bold text-white shadow-ambient hover:bg-brand-primary-light transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {savingRules ? 'Re-evaluating…' : 'Save Rule'}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
