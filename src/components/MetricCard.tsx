import React from 'react';
import { motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';

export type MetricCardVariant = 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'indigo' | 'slate';

interface MetricCardProps {
  title: string;
  value: React.ReactNode;
  subValue?: React.ReactNode;
  icon: LucideIcon;
  variant?: MetricCardVariant;
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

const variantStyles: Record<MetricCardVariant, { border: string; iconBg: string; iconText: string }> = {
  blue: {
    border: 'border-b-4 border-blue-500',
    iconBg: 'bg-blue-100',
    iconText: 'text-blue-600',
  },
  green: {
    border: 'border-b-4 border-emerald-500',
    iconBg: 'bg-emerald-100',
    iconText: 'text-emerald-600',
  },
  red: {
    border: 'border-b-4 border-rose-500',
    iconBg: 'bg-rose-100',
    iconText: 'text-rose-600',
  },
  amber: {
    border: 'border-b-4 border-amber-500',
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-600',
  },
  purple: {
    border: 'border-b-4 border-purple-500',
    iconBg: 'bg-purple-100',
    iconText: 'text-purple-600',
  },
  indigo: {
    border: 'border-b-4 border-indigo-500',
    iconBg: 'bg-indigo-100',
    iconText: 'text-indigo-600',
  },
  slate: {
    border: 'border-b-4 border-slate-400',
    iconBg: 'bg-slate-100',
    iconText: 'text-slate-600',
  },
};

export default function MetricCard({
  title,
  value,
  subValue,
  icon: Icon,
  variant = 'blue',
  children,
  className = '',
  onClick,
}: MetricCardProps) {
  const styles = variantStyles[variant];

  return (
    <motion.div
      whileHover={onClick ? { y: -4, boxShadow: '0 12px 30px -8px rgba(0,0,0,0.12)' } : { y: -2 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={`
        relative overflow-hidden rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient
        ${styles.border}
        ${onClick ? 'cursor-pointer hover:border-brand-primary/30' : ''}
        ${className}
      `}
      onClick={onClick}
    >
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">
              {title}
            </p>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-sans text-xl font-black text-brand-text">{value}</span>
              {subValue && (
                <span className="font-sans text-xs font-medium text-brand-text-variant">{subValue}</span>
              )}
            </div>
          </div>
          <div
            className={`
              flex h-10 w-10 shrink-0 items-center justify-center rounded-xl
              ${styles.iconBg} ${styles.iconText}
            `}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </motion.div>
  );
}
