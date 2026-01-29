import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-48f63c42/health", (c) => {
  return c.json({ status: "ok" });
});

// Default Mock Data for Initialization
const NOW = new Date().toISOString();
const MIN_AGO = new Date(Date.now() - 60000).toISOString();

const DEFAULT_DASHBOARD_STATE = {
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
      lastUpdate: NOW,
      drift: 0.02,
      activeStrategies: 3,
      lastSignal: "LONG ES_F (Filtered)",
      lastBlocked: null
    },
    CRY: {
      market: 'CRY',
      connected: true,
      latencyMs: 120,
      lastUpdate: MIN_AGO,
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
      openTime: new Date(Date.now() - 3600000).toISOString()
    },
    {
      id: 'p2',
      symbol: 'BTC-PERP',
      market: 'CRY',
      size: 0.5,
      entryPrice: 42100,
      currentPrice: 42050,
      pnl: -25.00,
      openTime: new Date(Date.now() - 1800000).toISOString()
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
    { id: 'l1', time: NOW, category: 'SYSTEM', message: 'Evaluation cycle complete (23ms)' },
    { id: 'l2', time: MIN_AGO, category: 'DATA', message: 'FUT data packet received' },
  ],
  metrics: {
    interventionPreview: 'Reducing leverage on CRY if drift > 0.2',
    gatePressure: 12,
    intentQuality: 88,
    autoSafety: 'ENABLED',
    controlLoop: 'ACTIVE'
  }
};

app.get("/make-server-48f63c42/dashboard", async (c) => {
  try {
    let state = await kv.get("dashboard_state");
    
    if (!state) {
      // Initialize if empty
      state = DEFAULT_DASHBOARD_STATE;
      // Update timestamps to be current
      const now = new Date().toISOString();
      state.evalTime = now;
      state.verdict.evalTime = now;
      await kv.set("dashboard_state", state);
    }

    return c.json(state);
  } catch (error) {
    console.error("Error fetching dashboard state:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

app.post("/make-server-48f63c42/dashboard/reset", async (c) => {
    const now = new Date().toISOString();
    const state = { ...DEFAULT_DASHBOARD_STATE, evalTime: now };
    await kv.set("dashboard_state", state);
    return c.json(state);
});

Deno.serve(app.fetch);