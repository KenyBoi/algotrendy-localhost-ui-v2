// Supabase Edge Function - JWT-Based Metrics Proxy
// Secure trust chain: Supabase Auth JWT → Internal JWT → VPS nginx
//
// Flow:
// 1. Browser sends Supabase JWT (from auth.getSession())
// 2. This function validates the Supabase JWT
// 3. Creates a short-lived internal JWT signed with INTERNAL_JWT_SECRET
// 4. Forwards to VPS nginx with internal JWT
// 5. nginx validates internal JWT before proxying to metrics API

import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SignJWT, jwtVerify } from "npm:jose@5";

const app = new Hono();

// Environment variables
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const VPS_METRICS_ENDPOINT = Deno.env.get("VPS_METRICS_ENDPOINT") ?? "";
const INTERNAL_JWT_SECRET = Deno.env.get("INTERNAL_JWT_SECRET") ?? "";

// Internal JWT configuration
const INTERNAL_JWT_ISSUER = "supabase-metrics-proxy";
const INTERNAL_JWT_AUDIENCE = "vps-metrics-api";
const INTERNAL_JWT_TTL_SECONDS = 60; // Short-lived: 60 seconds

// Allowed paths to proxy (whitelist for security)
const ALLOWED_PATHS = [
  "/health",
  "/brokers/status",
  "/trades/live",
  "/trades/history",
  "/strategies/proving",
  "/strategies/promotions",
  "/metrics/gate-pressure",
];

// Enable CORS
app.use("/*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "OPTIONS"],
}));

// ═══════════════════════════════════════════════════════════════════════════
// JWT UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Verify Supabase JWT and extract user info
 */
async function verifySupabaseJWT(authHeader: string): Promise<{
  valid: boolean;
  userId?: string;
  email?: string;
  role?: string;
  error?: string;
}> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { valid: false, error: "Missing or invalid Authorization header" };
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    // Create Supabase client and verify the JWT
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    });

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return { valid: false, error: error?.message || "Invalid token" };
    }

    return {
      valid: true,
      userId: user.id,
      email: user.email,
      role: user.role || "authenticated",
    };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : "JWT verification failed" };
  }
}

/**
 * Create a short-lived internal JWT for VPS communication
 */
async function createInternalJWT(userId: string, email: string, role: string): Promise<string> {
  const secret = new TextEncoder().encode(INTERNAL_JWT_SECRET);

  const jwt = await new SignJWT({
    sub: userId,
    email: email,
    roles: [role],
    aud: INTERNAL_JWT_AUDIENCE,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(INTERNAL_JWT_ISSUER)
    .setExpirationTime(`${INTERNAL_JWT_TTL_SECONDS}s`)
    .sign(secret);

  return jwt;
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH ENDPOINTS (no auth required)
// ═══════════════════════════════════════════════════════════════════════════

app.get("/metrics-proxy-jwt", (c) => {
  return c.json({
    status: "ok",
    service: "metrics-proxy-jwt",
    version: "2.0.0",
    auth: "jwt",
    vpsConfigured: !!VPS_METRICS_ENDPOINT,
    internalJwtConfigured: !!INTERNAL_JWT_SECRET,
    allowedPaths: ALLOWED_PATHS,
  });
});

app.get("/metrics-proxy-jwt/health", (c) => {
  return c.json({ status: "ok", auth: "jwt" });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATED PROXY ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════

app.get("/metrics-proxy-jwt/proxy", async (c) => {
  try {
    // Get the path to proxy from query parameter
    const path = c.req.query("path") || "";

    // Validate path is in whitelist
    if (!path || !ALLOWED_PATHS.some(p => path === p || path.startsWith(p + "/"))) {
      return c.json({
        error: "Invalid path",
        allowed: ALLOWED_PATHS,
        received: path,
      }, 400);
    }

    // Verify Supabase JWT
    const authHeader = c.req.header("Authorization") || "";
    const authResult = await verifySupabaseJWT(authHeader);

    if (!authResult.valid) {
      return c.json({
        error: "Unauthorized",
        message: authResult.error,
        hint: "Provide a valid Supabase JWT in Authorization header",
      }, 401);
    }

    // Check VPS endpoint is configured
    if (!VPS_METRICS_ENDPOINT) {
      return c.json({
        error: "VPS endpoint not configured",
        hint: "Set VPS_METRICS_ENDPOINT environment variable",
      }, 503);
    }

    // Create internal JWT for VPS
    const internalJWT = await createInternalJWT(
      authResult.userId!,
      authResult.email!,
      authResult.role!
    );

    // Build VPS URL and proxy the request
    const vpsUrl = `${VPS_METRICS_ENDPOINT}${path}`;
    console.log(`[JWT Proxy] User ${authResult.email} requesting: ${vpsUrl}`);

    const vpsResponse = await fetch(vpsUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${internalJWT}`,
        "X-Proxy-User": authResult.email || "unknown",
      },
    });

    if (!vpsResponse.ok) {
      return c.json({
        error: "VPS request failed",
        status: vpsResponse.status,
        statusText: vpsResponse.statusText,
      }, vpsResponse.status);
    }

    const data = await vpsResponse.json();

    return c.json({
      ...data,
      _proxy: {
        source: "vps",
        auth: "jwt",
        user: authResult.email,
        timestamp: new Date().toISOString(),
        path: path,
      },
    });

  } catch (error) {
    console.error("[JWT Proxy] Error:", error);
    return c.json({
      error: "Proxy error",
      message: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// AGGREGATED DASHBOARD ENDPOINT (JWT Auth)
// ═══════════════════════════════════════════════════════════════════════════

app.get("/metrics-proxy-jwt/dashboard", async (c) => {
  try {
    // Verify Supabase JWT
    const authHeader = c.req.header("Authorization") || "";
    const authResult = await verifySupabaseJWT(authHeader);

    if (!authResult.valid) {
      return c.json({
        error: "Unauthorized",
        message: authResult.error,
        hint: "Provide a valid Supabase JWT in Authorization header",
      }, 401);
    }

    if (!VPS_METRICS_ENDPOINT) {
      return c.json({
        error: "VPS endpoint not configured",
        hint: "Set VPS_METRICS_ENDPOINT environment variable",
      }, 503);
    }

    // Create internal JWT for VPS
    const internalJWT = await createInternalJWT(
      authResult.userId!,
      authResult.email!,
      authResult.role!
    );

    console.log(`[JWT Dashboard] User ${authResult.email} fetching dashboard`);

    // Fetch all required endpoints in parallel
    const endpoints = [
      "/brokers/status",
      "/trades/live",
      "/strategies/proving",
      "/strategies/promotions",
      "/metrics/gate-pressure",
    ];

    const fetchPromises = endpoints.map(async (endpoint) => {
      try {
        const res = await fetch(`${VPS_METRICS_ENDPOINT}${endpoint}`, {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${internalJWT}`,
            "X-Proxy-User": authResult.email || "unknown",
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

    // Build aggregated response
    const broker = results.find(r => r.endpoint === "/brokers/status")?.data || {};
    const trades = results.find(r => r.endpoint === "/trades/live")?.data || {};
    const proving = results.find(r => r.endpoint === "/strategies/proving")?.data || {};
    const promotions = results.find(r => r.endpoint === "/strategies/promotions")?.data || {};
    const gatePressure = results.find(r => r.endpoint === "/metrics/gate-pressure")?.data || {};

    const evalTime = new Date().toISOString();
    const isConnected = broker.connected === true;
    const activeStrategies = proving.strategies?.filter((s: any) => s.state === "active")?.length || 0;

    // ═══════════════════════════════════════════════════════════════════════
    // UNIFIED METRICS PAYLOAD CONTRACT
    // ═══════════════════════════════════════════════════════════════════════
    const unifiedPayload = {
      // System Verdict
      systemVerdict: {
        state: isConnected ? "NOMINAL" : "DEGRADED",
        reason: isConnected
          ? "All systems operational"
          : "Broker connection issue detected",
        timestamp: evalTime,
      },

      // Operator Recommendation
      operatorRecommendation: {
        value: activeStrategies > 0 ? "MONITOR" : "INVESTIGATE",
        details: activeStrategies > 0
          ? `${activeStrategies} strategies active. System operating normally.`
          : "No active strategies. Check proving pipeline.",
        computedAt: evalTime,
      },

      // System Confidence
      systemConfidence: {
        score: isConnected ? 94.5 : 65.0,
        evaluatedAt: evalTime,
      },

      // Markets
      markets: {
        futures: {
          id: "FUT",
          connected: isConnected,
          latencyMs: broker.latency_ms || 0,
          lastUpdate: broker.timestamp_utc || evalTime,
          drift: 0.02,
          activeStrategies: activeStrategies,
          lastSignal: proving.last_signal || null,
          lastDenial: gatePressure.last_denial || null,
        },
        crypto: {
          id: "CRY",
          connected: false,
          latencyMs: 0,
          lastUpdate: evalTime,
          drift: 0,
          activeStrategies: 0,
          lastSignal: null,
          lastDenial: null,
        },
      },

      // Data Freshness
      dataFreshness: {
        brokerStatus: broker.timestamp_utc || null,
        trades: trades.timestamp_utc || null,
        strategies: proving.timestamp_utc || null,
        gatePressure: gatePressure.timestamp_utc || null,
      },

      // Strategy Activity
      strategyActivity: {
        provingPipeline: {
          total: proving.strategies?.length || 0,
          active: activeStrategies,
          queued: proving.strategies?.filter((s: any) => s.state === "queued")?.length || 0,
          health: proving.pipeline_health || 100,
        },
        promotions: {
          recentCount: promotions.recent_count || 0,
          lastPromotion: promotions.last_promotion || null,
          history: promotions.history?.slice(0, 5) || [],
        },
        gatePressure: {
          current: gatePressure.current_pressure || 0,
          pendingAction: gatePressure.pending_action || "None",
          recentDenials: gatePressure.recent_denials || [],
        },
      },

      // Positions (from trades)
      positions: (trades.positions || []).map((p: any, i: number) => ({
        id: `p${i + 1}`,
        symbol: p.symbol,
        market: "FUT",
        size: p.size || p.quantity,
        entryPrice: p.entry_price || p.avg_price,
        currentPrice: p.current_price || p.mark_price,
        pnl: p.unrealized_pnl || p.pnl,
        openTime: p.open_time || p.timestamp,
      })),

      // Session Timeline
      sessionTimeline: [
        {
          at: evalTime,
          market: "FUT",
          event: "Dashboard data fetched via JWT proxy",
          actor: authResult.email,
        },
      ],

      // Timestamps
      timestamps: {
        lastUpdatedMetrics: evalTime,
        serverTime: new Date().toISOString(),
      },

      // Proxy Metadata
      _proxy: {
        source: "vps-live",
        auth: "jwt",
        user: authResult.email,
        userId: authResult.userId,
        timestamp: evalTime,
        endpoints: results.map(r => ({
          path: r.endpoint,
          success: r.success,
          status: r.success ? 200 : (r as any).status || 0,
        })),
      },
    };

    return c.json(unifiedPayload);

  } catch (error) {
    console.error("[JWT Dashboard] Error:", error);
    return c.json({
      error: "Dashboard proxy error",
      message: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
});

Deno.serve(app.fetch);
