import React from 'react';
import { LucideIcon } from 'lucide-react';

interface PageHeaderBannerProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
}

export default function PageHeaderBanner({ icon: Icon, title, subtitle }: PageHeaderBannerProps) {
  return (
    <div className="flex flex-col gap-1.5 bg-brand-primary rounded-2xl pl-4 pr-6 py-3.5 shadow-md w-full">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-9 w-9 rounded-full bg-white/15 flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5 text-white" />
        </div>
        <h2 className="font-sans text-xl sm:text-2xl font-extrabold uppercase tracking-tight text-white whitespace-nowrap">
          {title}
        </h2>
      </div>
      {subtitle && (
        <p className="font-sans text-xs sm:text-sm text-white/80 pl-12">
          {subtitle}
        </p>
      )}
    </div>
  );
}
