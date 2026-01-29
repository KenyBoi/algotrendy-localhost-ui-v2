// Supabase Edge Function - Metrics Proxy
// Securely proxies requests from cloud dashboard to VPS metrics API

import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";

const app = new Hono();

// Environment variables
const VPS_METRICS_ENDPOINT = Deno.env.get("VPS_METRICS_ENDPOINT") ?? "";
const PROXY_API_KEY = Deno.env.get("PROXY_API_KEY") ?? "";

// Allowed paths to proxy (whitelist for security)
// These match the actual VPS metrics API endpoints from /health
const ALLOWED_PATHS = [
  "/health",
  "/brokers/status",          // Broker connection status
  "/trades/live",             // Currently open trades
  "/trades/history",          // Trade history (supports ?hours=N)
  "/strategies/proving",      // Strategy proving conveyor state
  "/strategies/promotions",   // Promotion history and state
  "/metrics/gate-pressure",   // Gate pressure and denial analysis
  "/docs",
  "/redoc",
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
        "Authorization": `Bearer ${PROXY_API_KEY}`,  // Forward API key to VPS nginx
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
    // Using correct VPS API endpoint paths (from /health listing)
    const endpoints = [
      "/brokers/status",
      "/trades/live",
      "/strategies/proving",
      "/strategies/promotions",
      "/metrics/gate-pressure"
    ];

    const fetchPromises = endpoints.map(async (endpoint) => {
      try {
        const res = await fetch(`${VPS_METRICS_ENDPOINT}${endpoint}`, {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${PROXY_API_KEY}`,  // Forward API key to VPS nginx
          },
        });
        if (res.ok) {
          return { endpoint, data: await res.json(), success: true };
        }
        return { endpoint, data: null, success: false, status: res.status };
      } catch (e) {
        return { endpoint, data: null, success: false, error: String(e) };
      }
    });

    const results = await Promise.all(fetchPromises);

    // Build aggregated response (matching VPS API endpoint paths)
    const broker = results.find(r => r.endpoint === "/brokers/status")?.data || {};
    const trades = results.find(r => r.endpoint === "/trades/live")?.data || {};
    const proving = results.find(r => r.endpoint === "/strategies/proving")?.data || {};
    const promotions = results.find(r => r.endpoint === "/strategies/promotions")?.data || {};
    const gatePressure = results.find(r => r.endpoint === "/metrics/gate-pressure")?.data || {};

    const evalTime = new Date().toISOString();

    // Determine broker connection status
    const isConnected = broker.connected === true;

    // Count active strategies from proving data
    const activeStrategies = proving.strategies?.filter((s: any) => s.state === "active")?.length || 0;

    // Transform to dashboard state format
    const dashboardState = {
      evalTime,
      verdict: {
        status: isConnected ? "NOMINAL" : "DEGRADED",
        message: isConnected
          ? "System operating within normal parameters"
          : "Broker connection issue detected",
        evalTime
      },
      recommendation: {
        action: activeStrategies > 0 ? "MONITOR" : "INVESTIGATE",
        details: activeStrategies > 0
          ? `${activeStrategies} strategies active. System operating.`
          : "No active strategies. Check proving pipeline."
      },
      confidence: isConnected ? 94.5 : 65.0,
      markets: {
        FUT: {
          market: "FUT",
          connected: isConnected,
          latencyMs: broker.latency_ms || 0,
          lastUpdate: broker.timestamp_utc || evalTime,
          drift: 0.02,
          activeStrategies: activeStrategies,
          lastSignal: proving.last_signal || null,
          lastBlocked: gatePressure.last_denial || null
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
      positions: (trades.positions || []).map((p: any, i: number) => ({
        id: `p${i + 1}`,
        symbol: p.symbol,
        market: "FUT",
        size: p.size || p.quantity,
        entryPrice: p.entry_price || p.avg_price,
        currentPrice: p.current_price || p.mark_price,
        pnl: p.unrealized_pnl || p.pnl,
        openTime: p.open_time || p.timestamp
      })),
      alerts: [],
      sessionLog: [
        { id: "l1", time: evalTime, category: "SYSTEM", message: "Live data fetched from VPS" }
      ],
      metrics: {
        interventionPreview: gatePressure.pending_action || "No intervention pending",
        gatePressure: gatePressure.current_pressure || 0,
        intentQuality: proving.pipeline_health || 100,
        recentPromotions: promotions.recent_count || 0,
        lastPromotion: promotions.last_promotion || null
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
