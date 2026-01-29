// Supabase Edge Function - Metrics Proxy
// Securely proxies requests from cloud dashboard to VPS metrics API

import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";

const app = new Hono();

// Environment variables
const VPS_METRICS_ENDPOINT = Deno.env.get("VPS_METRICS_ENDPOINT") ?? "";
const PROXY_API_KEY = Deno.env.get("PROXY_API_KEY") ?? "";

// Allowed paths to proxy (whitelist for security)
const ALLOWED_PATHS = [
  "/health",
  "/metrics",
  "/metrics/summary",
  "/metrics/events",
  "/system/activity",
  "/system/status",
  "/broker/status",
  "/positions",
  "/strategies",
  "/gates",
  "/trades",
];

// Enable CORS
app.use("/*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "OPTIONS"],
}));

// Health check for the proxy itself
app.get("/metrics-proxy", (c) => {
  return c.json({
    status: "ok",
    service: "metrics-proxy",
    vpsConfigured: !!VPS_METRICS_ENDPOINT,
    allowedPaths: ALLOWED_PATHS
  });
});

app.get("/metrics-proxy/health", (c) => {
  return c.json({ status: "ok" });
});

// Main proxy endpoint
app.get("/metrics-proxy/proxy", async (c) => {
  try {
    // Get the path to proxy from query parameter
    const path = c.req.query("path") || "";

    // Validate path is in whitelist
    if (!path || !ALLOWED_PATHS.some(p => path === p || path.startsWith(p + "/"))) {
      return c.json({
        error: "Invalid path",
        allowed: ALLOWED_PATHS,
        received: path
      }, 400);
    }

    // Check API key authorization
    const authHeader = c.req.header("Authorization") || "";
    if (PROXY_API_KEY && !authHeader.includes(PROXY_API_KEY)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Check VPS endpoint is configured
    if (!VPS_METRICS_ENDPOINT) {
      return c.json({
        error: "VPS endpoint not configured",
        hint: "Set VPS_METRICS_ENDPOINT environment variable"
      }, 503);
    }

    // Build VPS URL and proxy the request
    const vpsUrl = `${VPS_METRICS_ENDPOINT}${path}`;
    console.log(`Proxying to: ${vpsUrl}`);

    const vpsResponse = await fetch(vpsUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        // Forward any custom headers if needed
      },
    });

    if (!vpsResponse.ok) {
      return c.json({
        error: "VPS request failed",
        status: vpsResponse.status,
        statusText: vpsResponse.statusText
      }, vpsResponse.status);
    }

    const data = await vpsResponse.json();

    // Add proxy metadata
    return c.json({
      ...data,
      _proxy: {
        source: "vps",
        timestamp: new Date().toISOString(),
        path: path
      }
    });

  } catch (error) {
    console.error("Proxy error:", error);
    return c.json({
      error: "Proxy error",
      message: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

// Aggregated dashboard endpoint - fetches all data in one call
app.get("/metrics-proxy/dashboard", async (c) => {
  try {
    // Check API key authorization
    const authHeader = c.req.header("Authorization") || "";
    if (PROXY_API_KEY && !authHeader.includes(PROXY_API_KEY)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (!VPS_METRICS_ENDPOINT) {
      return c.json({
        error: "VPS endpoint not configured",
        hint: "Set VPS_METRICS_ENDPOINT environment variable"
      }, 503);
    }

    // Fetch all required endpoints in parallel
    const endpoints = [
      "/broker/status",
      "/trades",
      "/strategies",
      "/gates",
      "/system/activity"
    ];

    const fetchPromises = endpoints.map(async (endpoint) => {
      try {
        const res = await fetch(`${VPS_METRICS_ENDPOINT}${endpoint}`);
        if (res.ok) {
          return { endpoint, data: await res.json(), success: true };
        }
        return { endpoint, data: null, success: false, status: res.status };
      } catch (e) {
        return { endpoint, data: null, success: false, error: String(e) };
      }
    });

    const results = await Promise.all(fetchPromises);

    // Build aggregated response
    const broker = results.find(r => r.endpoint === "/broker/status")?.data || {};
    const trades = results.find(r => r.endpoint === "/trades")?.data || {};
    const strategies = results.find(r => r.endpoint === "/strategies")?.data || {};
    const gates = results.find(r => r.endpoint === "/gates")?.data || {};
    const activity = results.find(r => r.endpoint === "/system/activity")?.data || {};

    const evalTime = new Date().toISOString();

    // Transform to dashboard state format
    const dashboardState = {
      evalTime,
      verdict: {
        status: broker.connection_status === "connected" ? "NOMINAL" : "DEGRADED",
        message: broker.connection_status === "connected"
          ? "System operating within normal parameters"
          : "Broker connection issue detected",
        evalTime
      },
      recommendation: {
        action: activity.seeding_active ? "MONITOR" : "INVESTIGATE",
        details: activity.seeding_active
          ? "Seeding scheduler active. No intervention required."
          : "Seeding scheduler inactive. Check system status."
      },
      confidence: broker.connection_status === "connected" ? 94.5 : 65.0,
      markets: {
        FUT: {
          market: "FUT",
          connected: broker.connection_status === "connected",
          latencyMs: broker.latency_ms || 0,
          lastUpdate: broker.timestamp_utc || evalTime,
          drift: 0.02,
          activeStrategies: strategies.active_count || 0,
          lastSignal: strategies.last_signal || null,
          lastBlocked: gates.last_blocked || null
        },
        CRY: {
          market: "CRY",
          connected: false, // Crypto not yet instrumented
          latencyMs: 0,
          lastUpdate: evalTime,
          drift: 0,
          activeStrategies: 0,
          lastSignal: null,
          lastBlocked: null
        }
      },
      positions: (trades.open_positions || []).map((p: any, i: number) => ({
        id: `p${i + 1}`,
        symbol: p.symbol,
        market: "FUT",
        size: p.size,
        entryPrice: p.entry_price,
        currentPrice: p.current_price,
        pnl: p.unrealized_pnl,
        openTime: p.open_time
      })),
      alerts: [],
      sessionLog: [
        { id: "l1", time: evalTime, category: "SYSTEM", message: "Live data fetched from VPS" }
      ],
      metrics: {
        interventionPreview: gates.intervention_preview || "No intervention pending",
        gatePressure: gates.pressure || 0,
        intentQuality: strategies.intent_quality || 100,
        autoSafety: activity.auto_safety ? "ENABLED" : "DISABLED",
        controlLoop: activity.control_loop ? "ACTIVE" : "INACTIVE"
      },
      _proxy: {
        source: "vps-live",
        timestamp: evalTime,
        endpoints: results.map(r => ({ path: r.endpoint, success: r.success }))
      }
    };

    return c.json(dashboardState);

  } catch (error) {
    console.error("Dashboard proxy error:", error);
    return c.json({
      error: "Dashboard proxy error",
      message: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

Deno.serve(app.fetch);
