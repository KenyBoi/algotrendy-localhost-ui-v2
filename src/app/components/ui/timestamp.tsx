import React from 'react';
import { cn } from '@/app/components/ui/typography';
import { Clock, Eye, Activity } from 'lucide-react';

interface TimestampProps {
  iso: string;
  type?: 'eval' | 'source' | 'log';
  label?: string;
  className?: string;
  showIcon?: boolean;
  withSeconds?: boolean;
}

export const Timestamp: React.FC<TimestampProps> = ({ 
  iso, 
  type = 'source', 
  label, 
  className, 
  showIcon = false,
  withSeconds = true
}) => {
  // Parse simple HH:MM:SS from ISO string
  const timeStr = iso.includes('T') ? iso.split('T')[1].replace('Z', '') : iso;
  const displayTime = withSeconds ? timeStr : timeStr.split('.')[0]; 

  const isEval = type === 'eval';
  
  return (
    <div className={cn("flex items-center gap-2 font-mono text-xs", className)}>
      {showIcon && (
        isEval ? <Activity className="w-3 h-3 text-indigo-400/80" /> : <Eye className="w-3 h-3 text-neutral-600" />
      )}
      
      {label && <span className="text-neutral-500 font-sans text-[10px] uppercase tracking-wider">{label}</span>}
      
      <div className={cn(
        "flex items-baseline gap-1",
        type === 'eval' ? "text-indigo-300/90" :
        type === 'source' ? "text-neutral-400" :
        "text-neutral-500"
      )}>
        <span className={cn(
            isEval && "font-bold drop-shadow-sm",
            "tracking-tight"
        )}>
            {displayTime}
        </span>
        <span className="text-[9px] text-neutral-600 font-medium">UTC</span>
      </div>
    </div>
  );
};