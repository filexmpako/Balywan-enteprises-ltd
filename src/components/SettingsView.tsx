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
  SlidersHorizontal,
  Activity,
  Banknote,
  ShieldCheck,
  Building2,
  Mail,
  Palette
} from 'lucide-react';
import { getActivityRules, saveActivityRules } from '../utils/activityRules';
import { refreshWeeklyStatsHistory } from '../utils/weeklyHistory';
import { motion } from 'motion/react';
import PageHeaderBanner from './PageHeaderBanner';
import { useAuth } from './AuthContext';
import { useCompany } from './CompanyContext';
import { Button } from './ui/button';

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
  const [activeTab, setActiveTab] = useState<'organization' | 'appearance' | 'notifications'>('organization');

  // --- Active/Inactive & Served/Unserved rule configuration ---
  const [rules, setRules] = useState(() => getActivityRules());
  const [thresholdInput, setThresholdInput] = useState(String(rules.threshold));
  const [amountThresholdInput, setAmountThresholdInput] = useState(String(rules.amountThreshold));
  const [servedTxnThresholdInput, setServedTxnThresholdInput] = useState(String(rules.servedTxnThreshold));
  const [modeInput, setModeInput] = useState<'combined' | 'separate'>(rules.mode);
  const [penaltyInput, setPenaltyInput] = useState(String(rules.penaltyRate));
  const [savingRules, setSavingRules] = useState(false);
  const [rulesSaved, setRulesSaved] = useState(false);
  const transactionThreshold = Number(thresholdInput);
  const amountThreshold = Number(amountThresholdInput);
  const servedTxnThreshold = Number(servedTxnThresholdInput);
  const penaltyRate = Number(penaltyInput);
  const ruleIsValid = Number.isFinite(transactionThreshold) && transactionThreshold > 0
    && Number.isFinite(amountThreshold) && amountThreshold > 0
    && Number.isFinite(servedTxnThreshold) && servedTxnThreshold > 0
    && Number.isFinite(penaltyRate) && penaltyRate >= 0;

  const handleSaveRules = async () => {
    if (!ruleIsValid) {
      setErrorMessage('Transaction, served value, and served transaction thresholds must be greater than zero, and the penalty rate cannot be negative.');
      return;
    }
    setErrorMessage('');
    setSavingRules(true);
    setRulesSaved(false);
    try {
      const next = saveActivityRules({
        threshold: transactionThreshold,
        amountThreshold,
        servedTxnThreshold,
        mode: modeInput,
        window: 'weekly',
        penaltyRate,
      });
      setRules(next);
      // Re-run every stored week so recorded statuses follow the new rule.
      await refreshWeeklyStatsHistory();
      window.dispatchEvent(new Event('weekly-kpi-updated'));
      setRulesSaved(true);
      setTimeout(() => setRulesSaved(false), 3500);
    } catch (err) {
      console.error('Failed to save activity rule:', err);
      setErrorMessage('Could not save the activity rule. Please try again.');
    } finally {
      setSavingRules(false);
    }
  };

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

  const ruleSummary = `${rules.threshold.toLocaleString()} CI+CO txns active · TZS ${rules.amountThreshold.toLocaleString()} or ${rules.servedTxnThreshold.toLocaleString()} txns served`;

  const tabs: { id: typeof activeTab; label: string; icon: typeof Building2 }[] = [
    { id: 'organization', label: 'Organization', icon: Building2 },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ];

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
        subtitle="Manage your organization, weekly activity rules, appearance, and alerts."
      />

      {/* Quick-glance overview */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient flex items-center gap-4">
          <div className="h-11 w-11 shrink-0 rounded-xl bg-blue-50 dark:bg-brand-primary/10 text-brand-primary flex items-center justify-center">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-brand-text-variant uppercase tracking-wider">Organization</p>
            <p className="text-sm font-black text-brand-text truncate">{companyName || '—'}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient flex items-center gap-4">
          <div className="h-11 w-11 shrink-0 rounded-xl bg-blue-50 dark:bg-brand-primary/10 text-brand-primary flex items-center justify-center">
            <User className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-brand-text-variant uppercase tracking-wider">Administrator</p>
            <p className="text-sm font-black text-brand-text truncate">{user?.name || adminName || '—'}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient flex items-center gap-4">
          <div className={`h-11 w-11 shrink-0 rounded-xl flex items-center justify-center ${theme === 'dark' ? 'bg-blue-950 text-blue-400' : 'bg-amber-100 text-amber-600'}`}>
            {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-brand-text-variant uppercase tracking-wider">Theme</p>
            <p className="text-sm font-black text-brand-text capitalize truncate">{theme}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient flex items-center gap-4">
          <div className="h-11 w-11 shrink-0 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-brand-text-variant uppercase tracking-wider">Active Rule</p>
            <p className="text-sm font-black text-brand-text truncate" title={ruleSummary}>{ruleSummary}</p>
          </div>
        </div>
      </div>

      <div className="grid max-w-6xl gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        {/* Main Settings Form */}
        <div className="rounded-xl border border-brand-gray-border bg-brand-card p-6 shadow-ambient">
          {/* Section tabs */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === id
                    ? 'bg-brand-primary text-white shadow-md'
                    : 'bg-brand-bg text-brand-text-variant hover:bg-brand-gray-hover border border-brand-gray-border'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSave} className="space-y-6">

            {/* Sec 1: Profile & Organization */}
            <div className={activeTab === 'organization' ? 'space-y-4' : 'hidden'}>
              <p className="text-xs text-brand-text-variant leading-5">
                The name, administrator, and contact details used across reports and audit exports.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-brand-primary" /> Company / Organization Name
                  </label>
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
                  <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-brand-primary" /> Administrator Display Name
                  </label>
                  <input
                    type="text"
                    required
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    className="w-full rounded-xl bg-brand-bg border-2 border-transparent px-4 py-2.5 text-sm text-brand-text outline-none focus:border-brand-primary focus:bg-white transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-brand-primary" /> Primary Contact Email
                  </label>
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
            <div className={activeTab === 'appearance' ? 'space-y-4' : 'hidden'}>
              <p className="text-xs text-brand-text-variant leading-5">
                Choose the interface theme used across every portal on this device.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Button
                  type="button"
                  variant="outline"
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
                </Button>

                <Button
                  type="button"
                  variant="outline"
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
                </Button>
              </div>
            </div>

            {/* Sec 3: Alerts */}
            <div className={activeTab === 'notifications' ? 'space-y-3' : 'hidden'}>
              <p className="text-xs text-brand-text-variant leading-5 mb-1">
                Choose which automated notifications this organization receives.
              </p>
              <label className="flex items-start gap-3 rounded-xl border border-brand-gray-border bg-brand-bg p-4 cursor-pointer hover:border-brand-primary-light/40 transition-all">
                <input type="checkbox" defaultChecked className="mt-0.5 rounded text-brand-primary focus:ring-brand-primary h-4.5 w-4.5 border-slate-300" />
                <span>
                  <span className="block text-sm font-bold text-brand-text">Failed upload alerts</span>
                  <span className="block text-xs text-brand-text-variant mt-0.5">Send a Slack alert whenever a Daily MGT file fails schema validation on upload.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-brand-gray-border bg-brand-bg p-4 cursor-pointer hover:border-brand-primary-light/40 transition-all">
                <input type="checkbox" defaultChecked className="mt-0.5 rounded text-brand-primary focus:ring-brand-primary h-4.5 w-4.5 border-slate-300" />
                <span>
                  <span className="block text-sm font-bold text-brand-text">Weekly audit reports</span>
                  <span className="block text-xs text-brand-text-variant mt-0.5">Transmit weekly transaction reports to {companyName} audits.</span>
                </span>
              </label>
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
                <Button
                  type="submit"
                  className="h-10 rounded-lg bg-brand-primary px-5 text-xs font-bold text-white shadow-ambient hover:bg-brand-primary-light"
                  id="save-settings-btn"
                >
                  <Save className="h-4 w-4" />
                  Save Settings
                </Button>
              </div>
            </div>
          </form>
        </div>

        {/* Activity rule: what makes a wakala Active for a reporting week */}
        <div className="rounded-xl border border-brand-gray-border bg-brand-card p-6 shadow-ambient xl:sticky xl:top-24 xl:self-start">
          <div className="flex items-center gap-3 border-b border-brand-gray-border pb-4 mb-4">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-brand-primary">
                Active / Inactive &amp; Served Rules
              </h3>
              <p className="text-[11px] text-brand-text-variant mt-0.5">Applies to weekly and monthly reporting, KPI, and penalty calculations</p>
            </div>
          </div>
          <div className="mb-5 rounded-lg border border-brand-primary/20 bg-brand-primary-container/40 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-brand-primary p-2 text-white"><ShieldCheck className="h-4 w-4" /></div>
              <div>
                <p className="text-sm font-bold text-brand-text">Active/Inactive is transaction count only</p>
                <p className="mt-1 text-xs leading-5 text-brand-text-variant">
                  A wakala is Active once its CI+CO transaction count reaches the threshold below — amount is never part of this decision. Served/Unserved is a separate rule, set below, that depends on whether the wakala is Active or Inactive.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1.5">
                <span className="flex items-center gap-2"><Activity className="h-4 w-4 text-brand-primary" /> Transactions required to be Active</span>
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
                How transactions are counted
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
          </div>

          <div className="mt-6 mb-4 border-t border-brand-gray-border pt-5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-brand-text">Served / Unserved Rule</h4>
            <p className="mt-1 text-[11px] leading-5 text-brand-text-variant">
              Active wakala: served once servicing value reaches the threshold. Inactive wakala: served once either the transaction count or the servicing value reaches its threshold. Merged with any uploaded servicing_status column — a "served" reading from either source wins.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1.5">
                <span className="flex items-center gap-2"><Banknote className="h-4 w-4 text-brand-primary" /> Served value threshold</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-brand-text-variant">TZS</span>
                <input
                  type="number"
                  min={0}
                  step="1000"
                  value={amountThresholdInput}
                  onChange={(e) => setAmountThresholdInput(e.target.value)}
                  className="w-full rounded-xl bg-brand-bg border-2 border-transparent py-2.5 pl-14 pr-4 text-sm text-brand-text outline-none focus:border-brand-primary focus:bg-white transition-all font-semibold"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1.5">
                <span className="flex items-center gap-2"><Activity className="h-4 w-4 text-brand-primary" /> Served transactions (Inactive wakala)</span>
              </label>
              <input
                type="number"
                min={0}
                value={servedTxnThresholdInput}
                onChange={(e) => setServedTxnThresholdInput(e.target.value)}
                className="w-full rounded-xl bg-brand-bg border-2 border-transparent px-4 py-2.5 text-sm text-brand-text outline-none focus:border-brand-primary focus:bg-white transition-all font-semibold"
              />
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

          <div className="mt-5 rounded-lg bg-brand-bg p-4 text-xs text-brand-text-variant space-y-1">
            <div><span className="font-bold text-brand-text">Active:</span> {modeInput === 'combined' ? 'combined transactions' : 'cash-in and cash-out individually'} ≥ {Number(thresholdInput || 0).toLocaleString()}.</div>
            <div><span className="font-bold text-brand-text">Served (Active wakala):</span> value ≥ TZS {Number(amountThresholdInput || 0).toLocaleString()}.</div>
            <div><span className="font-bold text-brand-text">Served (Inactive wakala):</span> transactions ≥ {Number(servedTxnThresholdInput || 0).toLocaleString()} <span className="font-bold text-brand-primary">OR</span> value ≥ TZS {Number(amountThresholdInput || 0).toLocaleString()}.</div>
          </div>

          <div className="flex flex-col gap-3 border-t border-brand-gray-border pt-5 mt-5 sm:flex-row sm:items-center sm:justify-between">
            {rulesSaved ? (
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                <CheckCircle className="h-4.5 w-4.5" />
                Rule saved — weeks re-evaluated.
              </div>
            ) : (
              <span className="text-xs text-brand-text-variant">
                 Saved: {rules.threshold.toLocaleString()} txns active · TZS {rules.amountThreshold.toLocaleString()} or {rules.servedTxnThreshold.toLocaleString()} txns served
              </span>
            )}
            <Button
              type="button"
              disabled={savingRules || !ruleIsValid}
              onClick={handleSaveRules}
              className="h-10 rounded-lg bg-brand-primary px-5 text-xs font-bold text-white shadow-ambient hover:bg-brand-primary-light"
            >
              <Save className="h-4 w-4" />
              {savingRules ? 'Re-evaluating…' : 'Save Rule'}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
