import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Sparkles, Check } from 'lucide-react';
import { formatPeriodDisplay, periodsMatch } from '../utils/periodUtils';

export interface PeriodSelectorProps {
  currentPeriod: string;
  availablePeriods: string[];
  autoDetectedPeriod?: string;
  isManuallySet?: boolean;
  onSelectPeriod: (period: string) => void;
  onAutoDetect?: () => void;
  label?: string;
  align?: 'left' | 'right';
  showManualBadge?: boolean;
  dropdownTitle?: string;
  dropdownSubtitle?: string;
  titleTooltip?: string;
  id?: string;
  className?: string;
  buttonClassName?: string;
}

export default function PeriodSelector({
  currentPeriod,
  availablePeriods,
  autoDetectedPeriod,
  isManuallySet = false,
  onSelectPeriod,
  onAutoDetect,
  label = 'Reporting Month',
  align = 'right',
  showManualBadge = true,
  dropdownTitle = 'Select Global Period',
  dropdownSubtitle = 'Applies across Dashboard, KPI Reports & Audit Logs.',
  titleTooltip = 'Click to set global reporting period',
  id = 'period-selector',
  className = 'relative',
  buttonClassName
}: PeriodSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const displayPeriod = formatPeriodDisplay(currentPeriod);

  const isAlignRight = align === 'right';

  const defaultButtonClass = isAlignRight
    ? 'text-right group p-1.5 -mr-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer flex items-center gap-1.5'
    : 'text-left group p-1.5 -ml-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer flex items-center gap-1.5';

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={buttonClassName || defaultButtonClass}
        title={titleTooltip}
        id={id}
      >
        <div>
          <span
            className={`flex items-center gap-1 text-[10px] font-bold text-brand-text-variant uppercase tracking-wider ${
              isAlignRight ? 'justify-end' : 'justify-start'
            }`}
          >
            {label}
            {showManualBadge && isManuallySet && (
              <span className="bg-amber-100 text-amber-800 text-[9px] px-1 py-0.2 rounded font-extrabold lowercase">
                manual
              </span>
            )}
          </span>
          <span
            className={`font-sans text-sm font-bold text-brand-primary group-hover:text-brand-primary-light flex items-center gap-1 ${
              isAlignRight ? 'justify-end' : 'justify-start'
            }`}
          >
            {displayPeriod}
            <ChevronDown className="h-3.5 w-3.5 text-brand-text-variant group-hover:text-brand-primary" />
          </span>
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className={`absolute ${
                isAlignRight ? 'right-0' : 'left-0'
              } top-full mt-2 w-64 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 shadow-xl z-40 text-left font-sans text-xs`}
            >
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                <p className="font-extrabold text-slate-900 dark:text-white text-xs">
                  {dropdownTitle}
                </p>
                {dropdownSubtitle && (
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {dropdownSubtitle}
                  </p>
                )}
              </div>

              {onAutoDetect && autoDetectedPeriod && (
                <div className="py-1">
                  {/* Auto-detect option */}
                  <button
                    type="button"
                    onClick={() => {
                      onAutoDetect();
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                      !isManuallySet
                        ? 'bg-brand-primary/10 text-brand-primary font-bold'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      <div>
                        <div className="font-bold">Auto-detect</div>
                        <div className="text-[10px] opacity-70">
                          Currently: {formatPeriodDisplay(autoDetectedPeriod)}
                        </div>
                      </div>
                    </div>
                    {!isManuallySet && (
                      <Check className="h-4 w-4 text-brand-primary shrink-0" />
                    )}
                  </button>
                </div>
              )}

              <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

              <div className="max-h-48 overflow-y-auto space-y-0.5">
                <p className="px-3 py-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                  Available Data Periods
                </p>
                {availablePeriods.map((p) => {
                  const isSelected = isManuallySet
                    ? periodsMatch(currentPeriod, p)
                    : !onAutoDetect && periodsMatch(currentPeriod, p);
                  const formattedLabel = formatPeriodDisplay(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        onSelectPeriod(p);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-brand-primary/10 text-brand-primary font-bold'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium'
                      }`}
                    >
                      <span>{formattedLabel}</span>
                      {isSelected && (
                        <Check className="h-4 w-4 text-brand-primary shrink-0" />
                      )}
                    </button>
                  );
                })}
                {availablePeriods.length === 0 && (
                  <p className="px-3 py-2 text-slate-400 text-[11px] italic">
                    No uploaded transaction periods found.
                  </p>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
