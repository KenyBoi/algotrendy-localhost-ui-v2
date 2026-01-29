export type MarketType = 'FUT' | 'CRY';

export interface Timestamp {
  value: string; // ISO-8601
  type: 'eval' | 'source';
}

export interface SystemVerdict {
  status: 'NOMINAL' | 'DEGRADED' | 'HALT' | 'WATCH';
  message: string;
  evalTime: string;
}

export interface OperatorRecommendation {
  action: 'MONITOR' | 'INTERVENE' | 'REDUCE_RISK' | 'NO_ACTION';
  details: string;
}

export interface Position {
  id: string;
  symbol: string;
  market: MarketType;
  size: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  openTime: string; // Source time
}

export interface MarketStatus {
  market: MarketType;
  connected: boolean;
  latencyMs: number;
  lastUpdate: string; // Source time
  drift: number; // Standard deviations or simple value
  activeStrategies: number;
  lastSignal?: string;
  lastBlocked?: string | null;
}

export interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: string; // Eval time
}

export interface LogEntry {
  id: string;
  time: string;
  category: string;
  message: string;
}

export interface DashboardState {
  verdict: SystemVerdict;
  recommendation: OperatorRecommendation;
  confidence: number; // 0-100
  evalTime: string; // The central "First-Class" time
  
  markets: {
    FUT: MarketStatus;
    CRY: MarketStatus;
  };
  
  positions: Position[];
  alerts: Alert[];
  sessionLog: LogEntry[];
  
  metrics: {
    interventionPreview: string;
    gatePressure: number; // 0-100
    intentQuality: number; // 0-100
    autoSafety: 'ENABLED' | 'DISABLED';
    controlLoop: 'ACTIVE' | 'PAUSED';
  };
}