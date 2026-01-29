import React, { useEffect, useState } from 'react';
import { MOCK_DATA } from '@/app/mockData';
import { DashboardState } from '@/app/types';
import { Panel } from '@/app/components/ui/panel';
import { Timestamp } from '@/app/components/ui/timestamp';
import { Badge, MarketBadge } from '@/app/components/ui/badge';
import { Label, cn } from '@/app/components/ui/typography';
import { fetchDashboardData, type FetchMode } from '@/api/metrics';
import {
  AlertTriangle,
  Cpu,
  GitCommit,
  ShieldAlert,
  Terminal,
  Wifi,
  WifiOff,
  Radio,
  RadioOff,
} from 'lucide-react';

type DataSource = 'live' | 'mock' | 'connecting';

export default function App() {
  const [data, setData] = useState<DashboardState>(MOCK_DATA);
  const [dataSource, setDataSource] = useState<DataSource>('connecting');
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const result = await fetchDashboardData('auto');

      setData(result.data);
      setDataSource(result.source);
      setLastSync(new Date().toISOString());

      if (result.error) {
        setLastError(result.error);
      } else {
        setLastError(null);
      }
    };

    // Initial fetch
    fetchData();

    // Poll every 5 seconds
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const isConnected = dataSource === 'live';

  const isNominal = data.verdict.status === 'NOMINAL';

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-300 font-sans selection:bg-neutral-700 p-2 text-sm">
      
      {/* HEADER / COCKPIT STATUS BAR */}
      <header className="mb-2 grid grid-cols-12 gap-2">
        {/* Main Verdict */}
        <div className="col-span-12 lg:col-span-8 flex flex-col justify-stretch">
          <div className={cn(
            "flex items-center justify-between p-3 rounded-sm border-l-2 h-full bg-neutral-900/50 border border-neutral-800",
            isNominal ? "border-l-emerald-600/50" : "border-l-rose-600/50"
          )}>
            <div className="flex items-center gap-4">
              <div className="relative flex items-center justify-center w-6 h-6">
                <div className={cn(
                  "absolute inset-0 rounded-full opacity-10 animate-ping",
                  isNominal ? "bg-emerald-500" : "bg-rose-500"
                )} />
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  isNominal ? "bg-emerald-600" : "bg-rose-600"
                )} />
              </div>
              
              <div>
                <Label className="block text-[10px] mb-0.5 text-neutral-500">System Verdict</Label>
                <div className="text-xl font-light tracking-tight text-neutral-200 flex items-baseline gap-3">
                  <span className="font-mono font-bold tracking-tighter">{data.verdict.status}</span>
                  <span className="hidden md:inline-block text-xs text-neutral-600 font-mono before:content-['//_']">
                    {data.verdict.message}
                  </span>
                </div>
              </div>
            </div>

            <div className="text-right pl-8 border-l border-neutral-800/50 flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                 <Label className="text-[10px] text-indigo-400/80">Evaluated Time</Label>
                 {/* Data Source Indicator */}
                 <div
                   className={cn(
                     "flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono",
                     dataSource === 'live' ? "bg-emerald-900/30 text-emerald-400" :
                     dataSource === 'connecting' ? "bg-blue-900/30 text-blue-400" :
                     "bg-amber-900/30 text-amber-400"
                   )}
                   title={lastError || (dataSource === 'live' ? 'Connected to VPS' : 'Using mock data')}
                 >
                   {dataSource === 'live' ? <Radio className="w-3 h-3" /> : <RadioOff className="w-3 h-3" />}
                   {dataSource === 'live' ? 'VPS' : dataSource === 'connecting' ? '...' : 'MOCK'}
                 </div>
              </div>
              <Timestamp iso={data.evalTime} type="eval" showIcon className="text-base" />
            </div>
          </div>
        </div>

        {/* Top Metrics */}
        <div className="col-span-12 lg:col-span-4 grid grid-cols-2 gap-2">
           <Panel className="justify-center items-center" noPadding>
              <div className="flex flex-col items-center justify-center h-full py-2">
                <Label className="mb-1.5 flex items-center gap-1.5 text-neutral-500">
                   <Cpu className="w-3 h-3" /> Control Loop
                </Label>
                <Badge variant={data.metrics.controlLoop === 'ACTIVE' ? 'nominal' : 'inactive'} size="sm">
                  {data.metrics.controlLoop}
                </Badge>
              </div>
           </Panel>
           <Panel className="justify-center items-center" noPadding>
              <div className="flex flex-col items-center justify-center h-full py-2">
                <Label className="mb-1.5 flex items-center gap-1.5 text-neutral-500">
                  <ShieldAlert className="w-3 h-3" /> Auto Safety
                </Label>
                <Badge variant={data.metrics.autoSafety === 'ENABLED' ? 'neutral' : 'warning'} size="sm">
                  {data.metrics.autoSafety}
                </Badge>
              </div>
           </Panel>
        </div>
      </header>

      {/* MAIN OPERATOR GRID */}
      <div className="grid grid-cols-12 gap-2 mb-2">
        
        {/* LEFT COLUMN: RECOMMENDATION & CONFIDENCE (5 cols) */}
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-2">
          <Panel title="Operator Recommendation" className="bg-neutral-900/40 flex-1 min-h-[140px]">
            <div className="flex flex-col h-full justify-between">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-neutral-800/30 rounded-[2px] border border-neutral-800">
                  <Terminal className="w-5 h-5 text-neutral-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-neutral-200 mb-2 tracking-tight">
                    {data.recommendation.action.replace('_', ' ')}
                  </div>
                  <p className="text-neutral-500 text-xs leading-relaxed font-mono">
                    {data.recommendation.details}
                  </p>
                </div>
              </div>
            </div>
          </Panel>

          <div className="grid grid-cols-2 gap-2 h-32">
             <Panel title="Confidence">
                <div className="flex flex-col justify-end h-full pb-1">
                   <div className="text-4xl font-light text-neutral-200 font-mono tracking-tighter">
                     {data.confidence}<span className="text-lg text-neutral-600 ml-1">%</span>
                   </div>
                   <div className="w-full bg-neutral-800 h-1 mt-2 rounded-full overflow-hidden">
                      <div className="bg-neutral-400 h-full" style={{ width: `${data.confidence}%` }} />
                   </div>
                </div>
             </Panel>
             <Panel title="Gate Pressure">
                <div className="flex flex-col justify-end h-full pb-1">
                   <div className="text-2xl font-mono text-neutral-300 mb-1">
                     {data.metrics.gatePressure}<span className="text-xs text-neutral-600">/100</span>
                   </div>
                   <div className="h-1.5 w-full bg-neutral-800/50 rounded-full overflow-hidden flex gap-[1px]">
                     {Array.from({ length: 10 }).map((_, i) => (
                       <div key={i} className={cn(
                         "flex-1",
                         (i * 10) < data.metrics.gatePressure ? "bg-neutral-500" : "bg-transparent"
                       )} />
                     ))}
                   </div>
                </div>
             </Panel>
          </div>
        </div>

        {/* MIDDLE COLUMN: MARKETS (3 cols) */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-2">
          {(['FUT', 'CRY'] as const).map(marketKey => {
            const m = data.markets[marketKey];
            const isHealthy = m.drift < 0.1;
            
            return (
              <Panel 
                key={marketKey}
                title={<div className="flex items-center gap-2"><MarketBadge market={marketKey} /></div>}
                right={
                   <div className={cn("flex items-center gap-1.5 text-[9px] font-mono", m.connected ? "text-emerald-600/80" : "text-rose-600/80")}>
                     {m.connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                     <span className="text-neutral-500">{m.latencyMs}ms</span>
                   </div>
                }
                className="flex-1"
                borderAccent={isHealthy ? undefined : 'amber'}
              >
                <div className="space-y-3">
                   <div className="flex justify-between items-end">
                      <div>
                        <Label className="text-[9px] text-neutral-500">Source Time</Label>
                        <Timestamp iso={m.lastUpdate} type="source" className="text-[10px]" withSeconds={false} />
                      </div>
                      <div className="text-right">
                        <Label className="text-[9px] text-neutral-500">Drift</Label>
                        <div className={cn("font-mono text-base leading-none", isHealthy ? "text-neutral-400" : "text-amber-500")}>
                          {m.drift.toFixed(2)}σ
                        </div>
                      </div>
                   </div>

                   <div className="pt-2 border-t border-neutral-800/50">
                      <Label className="text-[9px] mb-1 block text-neutral-500">Active Strat</Label>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1.5 text-neutral-400 font-mono text-xs">
                          <GitCommit className="w-3 h-3 text-neutral-600" />
                          {m.activeStrategies}
                        </div>
                        <div className="text-[9px] text-neutral-600 font-mono truncate max-w-[80px]">
                          {m.lastSignal || "-"}
                        </div>
                      </div>
                   </div>
                </div>
              </Panel>
            );
          })}
        </div>

        {/* RIGHT COLUMN: POSITIONS & ALERTS (4 cols) */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-2">
           <Panel title="Live Positions" className="flex-1" noPadding>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-neutral-900/50 text-neutral-500 text-[10px] uppercase border-b border-neutral-800">
                    <tr>
                      <th className="px-3 py-2 font-normal">Sym</th>
                      <th className="px-3 py-2 font-normal text-right">Sz</th>
                      <th className="px-3 py-2 font-normal text-right">PnL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/50">
                    {data.positions.map(p => (
                      <tr key={p.id} className="hover:bg-neutral-800/20">
                        <td className="px-3 py-2">
                           <div className="flex items-center gap-2">
                             <div className={cn("w-1 h-1 rounded-full", p.market === 'FUT' ? "bg-neutral-400" : "bg-neutral-600")} />
                             <span className="text-neutral-300">{p.symbol}</span>
                           </div>
                        </td>
                        <td className="px-3 py-2 text-right text-neutral-500">{p.size}</td>
                        <td className={cn("px-3 py-2 text-right font-medium", p.pnl >= 0 ? "text-emerald-500/90" : "text-rose-500/90")}>
                          {p.pnl > 0 ? '+' : ''}{p.pnl.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                     {data.positions.length === 0 && (
                        <tr><td colSpan={3} className="px-3 py-8 text-center text-neutral-700 italic">No positions</td></tr>
                     )}
                  </tbody>
                </table>
              </div>
           </Panel>

           <Panel title="Intervention" className="h-auto bg-neutral-900/20">
              <div className="flex flex-col gap-1">
                <div className="text-[10px] text-neutral-500 uppercase tracking-wider">Preview</div>
                <p className="text-xs font-mono text-neutral-400 line-clamp-2">
                  {data.metrics.interventionPreview}
                </p>
              </div>
           </Panel>
        </div>
      </div>

      {/* FOOTER GRID */}
      <div className="grid grid-cols-12 gap-2">
         {/* Session Log */}
         <div className="col-span-12 lg:col-span-8">
            <Panel title="Event Log" className="h-40" noPadding>
              <div className="h-full overflow-y-auto p-2 font-mono text-xs space-y-1">
                  {data.sessionLog.map((log) => (
                    <div key={log.id} className="flex gap-3 hover:bg-neutral-900/50 px-2 py-0.5 rounded-sm">
                        <span className="text-neutral-600 shrink-0">
                           {log.time.split('T')[1].replace('Z', '')}
                        </span>
                        <span className={cn(
                          "shrink-0 w-12 text-[10px] text-center px-1 rounded-[1px] border uppercase",
                          log.category === 'SYSTEM' ? "text-neutral-500 border-neutral-800" :
                          log.category === 'DATA' ? "text-neutral-400 border-neutral-700 bg-neutral-900" :
                          log.category === 'EXEC' ? "text-emerald-600/80 border-emerald-900/20" :
                          "text-indigo-400/80 border-indigo-900/20"
                        )}>
                          {log.category}
                        </span>
                        <span className="text-neutral-400 truncate">{log.message}</span>
                    </div>
                  ))}
              </div>
            </Panel>
         </div>

         {/* Alerts */}
         <div className="col-span-12 lg:col-span-4">
            <Panel title="Active Alerts" className="h-40" noPadding alert={data.alerts.length > 0}>
               <div className="divide-y divide-neutral-800/50 overflow-y-auto h-full">
                  {data.alerts.map(alert => (
                    <div key={alert.id} className="p-3 flex gap-3 items-start hover:bg-neutral-800/10">
                       <AlertTriangle className={cn("w-4 h-4 mt-0.5 shrink-0", alert.severity === 'info' ? "text-blue-500/50" : "text-amber-500/80")} />
                       <div>
                         <p className="text-xs text-neutral-300 leading-snug font-medium">{alert.message}</p>
                         <Timestamp iso={alert.timestamp} type="source" className="mt-1 text-[10px] opacity-40" withSeconds={false} />
                       </div>
                    </div>
                  ))}
                  {data.alerts.length === 0 && (
                     <div className="p-4 text-center text-neutral-700 text-xs">No active alerts</div>
                  )}
               </div>
            </Panel>
         </div>
      </div>

    </div>
  );
}