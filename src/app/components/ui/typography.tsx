import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Typography Components
export const Label = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span className={cn("text-xs font-medium text-neutral-400 uppercase tracking-wider", className)}>
    {children}
  </span>
);

export const Value = ({ children, className, variant = 'default' }: { children: React.ReactNode; className?: string; variant?: 'default' | 'mono' | 'highlight' }) => (
  <span className={cn(
    "text-neutral-200",
    variant === 'mono' && "font-mono",
    variant === 'highlight' && "text-white font-semibold",
    className
  )}>
    {children}
  </span>
);