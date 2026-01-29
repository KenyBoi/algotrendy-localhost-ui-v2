import React from 'react';
import { cn } from '@/app/components/ui/typography';

interface PanelProps {
  title?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
  alert?: boolean;
  borderAccent?: 'emerald' | 'amber' | 'rose' | 'blue';
}

export const Panel: React.FC<PanelProps> = ({ 
  title, 
  right, 
  children, 
  className, 
  noPadding, 
  alert,
  borderAccent 
}) => {
  return (
    <div className={cn(
      "border border-neutral-800 bg-neutral-950 flex flex-col relative",
      alert && "border-rose-900/50 bg-rose-950/5",
      className
    )}>
      {/* Accent Line - Toned down saturation */}
      {borderAccent && (
        <div className={cn(
          "absolute top-0 left-0 bottom-0 w-[2px]",
          borderAccent === 'emerald' && "bg-emerald-600/80",
          borderAccent === 'amber' && "bg-amber-600/80",
          borderAccent === 'rose' && "bg-rose-600/80",
          borderAccent === 'blue' && "bg-blue-600/80",
        )} />
      )}
      
      {(title || right) && (
        <div className={cn(
          "flex items-center justify-between px-3 py-1.5 border-b border-neutral-800 bg-neutral-900/30",
          borderAccent && "pl-4"
        )}>
          <div className="font-mono text-[10px] font-semibold text-neutral-500 uppercase tracking-widest">{title}</div>
          <div className="flex items-center gap-2">{right}</div>
        </div>
      )}
      <div className={cn("flex-1 relative", !noPadding && "p-3", borderAccent && "pl-4")}>
        {children}
      </div>
    </div>
  );
};