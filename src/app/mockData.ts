import { DashboardState } from '@/app/types';

const NOW = "2026-01-29T14:32:45Z"; // Central Eval Time
const MIN_AGO = "2026-01-29T14:31:30Z";
const SOURCE_RECENT = "2026-01-29T14:32:44Z";
const SOURCE_LAGGING = "2026-01-29T14:32:00Z";

export const MOCK_DATA: DashboardState = {
  evalTime: NOW,
  verdict: {
    status: 'NOMINAL',
    message: 'System operating within normal parameters',
    evalTime: NOW
  },
  recommendation: {
    action: 'MONITOR',
    details: 'No manual intervention required. Trend strength increasing in FUT.'
  },
  confidence: 94.5,
  
  markets: {
    FUT: {
      market: 'FUT',
      connected: true,
      latencyMs: 45,
      lastUpdate: SOURCE_RECENT,
      drift: 0.02,
      activeStrategies: 3,
      lastSignal: "LONG ES_F (Filtered)",
      lastBlocked: null
    },
    CRY: {
      market: 'CRY',
      connected: true,
      latencyMs: 120,
      lastUpdate: SOURCE_LAGGING, // Slightly lagging
      drift: 0.15,
      activeStrategies: 1,
      lastSignal: "SHORT BTC-PERP (Entry)",
      lastBlocked: "SHORT BTC (Drift > 0.1)"
    }
  },
  
  positions: [
    {
      id: 'p1',
      symbol: 'ES_F',
      market: 'FUT',
      size: 2,
      entryPrice: 4850.25,
      currentPrice: 4862.50,
      pnl: 1225.00,
      openTime: "2026-01-29T13:15:00Z"
    },
    {
      id: 'p2',
      symbol: 'BTC-PERP',
      market: 'CRY',
      size: 0.5,
      entryPrice: 42100,
      currentPrice: 42050,
      pnl: -25.00,
      openTime: "2026-01-29T14:05:00Z"
    }
  ],
  
  alerts: [
    {
      id: 'a1',
      severity: 'info',
      message: 'Volatility expansion detected in ES_F',
      timestamp: MIN_AGO
    }
  ],
  
  sessionLog: [
    { id: 'l1', time: "2026-01-29T14:32:45Z", category: 'SYSTEM', message: 'Evaluation cycle complete (23ms)' },
    { id: 'l2', time: "2026-01-29T14:32:44Z", category: 'DATA', message: 'FUT data packet received' },
    { id: 'l3', time: "2026-01-29T14:32:00Z", category: 'DATA', message: 'CRY data packet received' },
    { id: 'l4', time: "2026-01-29T14:30:00Z", category: 'STRAT', message: 'Strategy signal: LONG ES_F (Filtered)' },
    { id: 'l5', time: "2026-01-29T14:05:00Z", category: 'EXEC', message: 'Filled: BUY 0.5 BTC-PERP @ 42100' },
  ],
  
  metrics: {
    interventionPreview: 'Reducing leverage on CRY if drift > 0.2',
    gatePressure: 12, // Low
    intentQuality: 88,
    autoSafety: 'ENABLED',
    controlLoop: 'ACTIVE'
  }
};