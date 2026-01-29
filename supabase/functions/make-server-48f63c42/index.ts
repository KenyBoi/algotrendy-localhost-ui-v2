// Supabase Edge Function - AlgoTrendy Dashboard Server
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";

const app = new Hono();

// Enable CORS for all routes
app.use("/*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "OPTIONS"],
}));

// Routes include function name prefix (Supabase passes full path)
app.get("/make-server-48f63c42", (c) => c.json({ status: "ok", service: "algotrendy-dashboard" }));
app.get("/make-server-48f63c42/health", (c) => c.json({ status: "ok" }));

// Default dashboard state
const getDefaultState = () => ({
  evalTime: new Date().toISOString(),
  verdict: {
    status: 'NOMINAL',
    message: 'System operating within normal parameters',
    evalTime: new Date().toISOString()
  },
  recommendation: {
    action: 'MONITOR',
    details: 'No manual intervention required.'
  },
  confidence: 94.5,
  markets: {
    FUT: {
      market: 'FUT',
      connected: true,
      latencyMs: 45,
      lastUpdate: new Date().toISOString(),
      drift: 0.02,
      activeStrategies: 3,
      lastSignal: "LONG ES_F (Filtered)",
      lastBlocked: null
    },
    CRY: {
      market: 'CRY',
      connected: true,
      latencyMs: 120,
      lastUpdate: new Date(Date.now() - 60000).toISOString(),
      drift: 0.15,
      activeStrategies: 1,
      lastSignal: "SHORT BTC-PERP (Entry)",
      lastBlocked: "SHORT BTC (Drift > 0.1)"
    }
  },
  positions: [
    { id: 'p1', symbol: 'ES_F', market: 'FUT', size: 2, entryPrice: 4850.25, currentPrice: 4862.50, pnl: 1225.00, openTime: new Date(Date.now() - 3600000).toISOString() },
    { id: 'p2', symbol: 'BTC-PERP', market: 'CRY', size: 0.5, entryPrice: 42100, currentPrice: 42050, pnl: -25.00, openTime: new Date(Date.now() - 1800000).toISOString() }
  ],
  alerts: [
    { id: 'a1', severity: 'info', message: 'Volatility expansion detected in ES_F', timestamp: new Date(Date.now() - 60000).toISOString() }
  ],
  sessionLog: [
    { id: 'l1', time: new Date().toISOString(), category: 'SYSTEM', message: 'Evaluation cycle complete (23ms)' },
    { id: 'l2', time: new Date(Date.now() - 60000).toISOString(), category: 'DATA', message: 'FUT data packet received' },
  ],
  metrics: {
    interventionPreview: 'Reducing leverage on CRY if drift > 0.2',
    gatePressure: 12,
    intentQuality: 88,
    autoSafety: 'ENABLED',
    controlLoop: 'ACTIVE'
  }
});

// In-memory state (resets on cold start)
let dashboardState: ReturnType<typeof getDefaultState> | null = null;

// Dashboard data endpoint
app.get("/make-server-48f63c42/dashboard", (c) => {
  if (!dashboardState) {
    dashboardState = getDefaultState();
  }
  // Update timestamp on each request
  dashboardState.evalTime = new Date().toISOString();
  return c.json(dashboardState);
});

// Reset endpoint
app.post("/make-server-48f63c42/dashboard/reset", (c) => {
  dashboardState = getDefaultState();
  return c.json(dashboardState);
});

// Supabase Edge Function handler
Deno.serve(app.fetch);
