import React from 'react';
import { cn } from '@/app/components/ui/typography';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'nominal' | 'warning' | 'critical' | 'neutral' | 'inactive' | 'info';
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'neutral', className, size = 'md' }) => {
  const variants = {
    // Reduced background opacity and saturation for a "low-noise" look
    nominal: "bg-emerald-950/30 text-emerald-500 border-emerald-900/50", 
    warning: "bg-amber-950/30 text-amber-500 border-amber-900/50",
    critical: "bg-rose-950/30 text-rose-500 border-rose-900/50",
    neutral: "bg-neutral-900 text-neutral-400 border-neutral-800",
    inactive: "bg-transparent text-neutral-600 border-neutral-800 border-dashed",
    info: "bg-blue-950/20 text-blue-400 border-blue-900/30",
  };
  
  const sizes = {
    sm: "px-1.5 text-[10px] h-4",
    md: "px-2 text-xs h-5",
    lg: "px-3 text-sm h-7",
  };

  return (
    <span className={cn(
      "inline-flex items-center justify-center border font-mono font-medium tracking-wide uppercase rounded-[1px]",
      variants[variant],
      sizes[size],
      className
    )}>
      {children}
    </span>
  );
};

export const MarketBadge: React.FC<{ market: 'FUT' | 'CRY'; className?: string }> = ({ market, className }) => {
    // Unify market badges to be less distinct/colorful. 
    // They are now monochromatic tags to reduce noise.
    return (
        <span className={cn(
            "font-mono font-semibold text-[10px] px-1.5 py-0.5 border rounded-[1px] tracking-wider",
            "text-neutral-400 bg-neutral-900 border-neutral-800",
            className
        )}>
            {market}
        </span>
    )
}