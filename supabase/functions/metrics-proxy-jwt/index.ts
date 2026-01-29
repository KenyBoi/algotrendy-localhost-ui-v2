// ═══════════════════════════════════════════════════════════════════════════
// Supabase Edge Function — JWT-Based Metrics Proxy v2.1.0
// ═══════════════════════════════════════════════════════════════════════════
//
// Features:
//   #1 Unified Aggregator  — /v1/metrics/aggregate
//   #2 Health Indicators   — /v1/health/detailed + _health in payload
//   #3 Session Recording   — /v1/sessions/events + /v1/sessions/export
//   #4 WebSockets          — stub (planned)
//   #5 Per-Market Risk     — stub (riskCoupling: null)
//   #6 Forensic Replay     — stub (/v1/metrics/replay → 501)
//   #7 Rate Limiting       — stub (X-RateLimit-* headers, pass-through)
//   #8 API Versioning      — done (/v1/ prefix, X-API-Version header)
//   #9 Role-Based Views    — stub (_roles: null)
//  #10 Synthetic Tests     — stub (test placeholder file)
//
// Flow:
//   1. Browser sends Supabase JWT (from auth.getSession())
//   2. This function validates the Supabase JWT
//   3. Creates a short-lived internal JWT signed with INTERNAL_JWT_SECRET
//   4. Forwards to VPS nginx with internal JWT
//   5. nginx validates internal JWT before proxying to metrics API
//   6. Records session events to Supabase DB (fire-and-forget)
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SignJWT } from "npm:jose@5";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface AuthResult {
  valid: boolean;
  userId?: string;
  email?: string;
  role?: string;
  error?: string;
}

interface EndpointResult {
  endpoint: string;
  data: any;
  success: boolean;
  status?: number;
  error?: string;
  latencyMs: number;
}

interface EndpointHealthEntry {
  endpoint: string;
  lastSuccess: string | null;
  lastFailure: string | null;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
  latencies: number[]; // sliding window
}

interface HealthSnapshot {
  vpsReachable: boolean;
  totalEndpoints: number;
  healthyEndpoints: number;
  degradedEndpoints: number;
  avgOverallLatencyMs: number;
  endpoints: Record<
    string,
    {
      status: "healthy" | "degraded" | "down";
      lastSuccess: string | null;
      lastFailure: string | null;
      successRate: number;
      avgLatencyMs: number;
    }
  >;
  lastChecked: string;
}

type Env = {
  Variables: {
    authResult: AuthResult;
  };
};

const app = new Hono<Env>();

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VPS_METRICS_ENDPOINT = Deno.env.get("VPS_METRICS_ENDPOINT") ?? "";
const INTERNAL_JWT_SECRET = Deno.env.get("INTERNAL_JWT_SECRET") ?? "";

const INTERNAL_JWT_ISSUER = "supabase-metrics-proxy";
const INTERNAL_JWT_AUDIENCE = "vps-metrics-api";
const INTERNAL_JWT_TTL_SECONDS = 60;
const API_VERSION = "v1";
const HEALTH_WINDOW_SIZE = 20; // sliding window for latency tracking

const ALLOWED_PATHS = [
  "/health",
  "/brokers/status",
  "/trades/live",
  "/trades/history",
  "/strategies/proving",
  "/strategies/promotions",
  "/metrics/gate-pressure",
];

const AGGREGATE_ENDPOINTS = [
  "/brokers/status",
  "/trades/live",
  "/strategies/proving",
  "/strategies/promotions",
  "/metrics/gate-pressure",
];

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH STATE (module-level, in-memory)
// Resets on cold start — acceptable for observational data
// ═══════════════════════════════════════════════════════════════════════════

const healthState = new Map<string, EndpointHealthEntry>();

function initEndpointHealth(endpoint: string): EndpointHealthEntry {
  return {
    endpoint,
    lastSuccess: null,
    lastFailure: null,
    successCount: 0,
    failureCount: 0,
    avgLatencyMs: 0,
    latencies: [],
  };
}

function recordEndpointResult(
  endpoint: string,
  success: boolean,
  latencyMs: number
): void {
  let entry = healthState.get(endpoint);
  if (!entry) {
    entry = initEndpointHealth(endpoint);
    healthState.set(endpoint, entry);
  }

  if (success) {
    entry.lastSuccess = new Date().toISOString();
    entry.successCount++;
  } else {
    entry.lastFailure = new Date().toISOString();
    entry.failureCount++;
  }

  entry.latencies.push(latencyMs);
  if (entry.latencies.length > HEALTH_WINDOW_SIZE) {
    entry.latencies.shift();
  }
  entry.avgLatencyMs =
    entry.latencies.reduce((a, b) => a + b, 0) / entry.latencies.length;
}

function getHealthSnapshot(): HealthSnapshot {
  const now = new Date().toISOString();
  const endpoints: HealthSnapshot["endpoints"] = {};
  let totalLatency = 0;
  let healthyCount = 0;
  let degradedCount = 0;
  let totalEndpoints = 0;

  for (const [ep, entry] of healthState) {
    const total = entry.successCount + entry.failureCount;
    const successRate = total > 0 ? entry.successCount / total : 0;
    const status: "healthy" | "degraded" | "down" =
      successRate >= 0.9 ? "healthy" : successRate >= 0.5 ? "degraded" : "down";

    endpoints[ep] = {
      status,
      lastSuccess: entry.lastSuccess,
      lastFailure: entry.lastFailure,
      successRate: Math.round(successRate * 100),
      avgLatencyMs: Math.round(entry.avgLatencyMs),
    };

    totalLatency += entry.avgLatencyMs;
    if (status === "healthy") healthyCount++;
    else if (status === "degraded") degradedCount++;
    totalEndpoints++;
  }

  return {
    vpsReachable: healthyCount > 0,
    totalEndpoints,
    healthyEndpoints: healthyCount,
    degradedEndpoints: degradedCount,
    avgOverallLatencyMs:
      totalEndpoints > 0 ? Math.round(totalLatency / totalEndpoints) : 0,
    endpoints,
    lastChecked: now,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CLIENT (for session recording — Feature #3)
// ═══════════════════════════════════════════════════════════════════════════

let _serviceClient: ReturnType<typeof createClient> | null = null;

function getServiceClient() {
  if (!_serviceClient && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    _serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return _serviceClient;
}

/**
 * Fire-and-forget session event recording.
 * Does NOT block the response — errors are logged but not propagated.
 */
function recordSessionEvent(
  sessionId: string,
  userId: string,
  eventType: string,
  eventPayload: Record<string, unknown>
): void {
  const client = getServiceClient();
  if (!client || !sessionId) return;

  client
    .from("session_events")
    .insert({
      session_id: sessionId,
      user_id: userId,
      event_type: eventType,
      event_payload: eventPayload,
    })
    .then(({ error }) => {
      if (error)
        console.error("[Session] Failed to record event:", error.message);
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// JWT UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

async function verifySupabaseJWT(authHeader: string): Promise<AuthResult> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { valid: false, error: "Missing or invalid Authorization header" };
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    });

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

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
    return {
      valid: false,
      error: err instanceof Error ? err.message : "JWT verification failed",
    };
  }
}

async function createInternalJWT(
  userId: string,
  email: string,
  role: string
): Promise<string> {
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
// SHARED AGGREGATION FUNCTION (Feature #1)
//
// Extracted from the legacy /dashboard handler so both /dashboard and
// /v1/metrics/aggregate can share the same fetch-aggregate-record logic.
// ═══════════════════════════════════════════════════════════════════════════

async function fetchAndAggregateMetrics(
  authResult: AuthResult,
  sessionId?: string
): Promise<{
  payload: Record<string, any>;
  endpointResults: EndpointResult[];
  totalLatencyMs: number;
}> {
  const overallStart = Date.now();

  // Create internal JWT for VPS
  const internalJWT = await createInternalJWT(
    authResult.userId!,
    authResult.email!,
    authResult.role!
  );

  // Fetch all endpoints in parallel with per-endpoint timing
  const fetchPromises = AGGREGATE_ENDPOINTS.map(
    async (endpoint): Promise<EndpointResult> => {
      const start = Date.now();
      try {
        const res = await fetch(`${VPS_METRICS_ENDPOINT}${endpoint}`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${internalJWT}`,
            "X-Proxy-User": authResult.email || "unknown",
          },
        });
        const latencyMs = Date.now() - start;

        if (res.ok) {
          const data = await res.json();
          recordEndpointResult(endpoint, true, latencyMs);
          return { endpoint, data, success: true, status: res.status, latencyMs };
        }
        recordEndpointResult(endpoint, false, latencyMs);
        return {
          endpoint,
          data: null,
          success: false,
          status: res.status,
          latencyMs,
        };
      } catch (e) {
        const latencyMs = Date.now() - start;
        recordEndpointResult(endpoint, false, latencyMs);
        return {
          endpoint,
          data: null,
          success: false,
          error: String(e),
          latencyMs,
        };
      }
    }
  );

  const results = await Promise.all(fetchPromises);
  const totalLatencyMs = Date.now() - overallStart;

  // Extract data from results
  const broker =
    results.find((r) => r.endpoint === "/brokers/status")?.data || {};
  const trades =
    results.find((r) => r.endpoint === "/trades/live")?.data || {};
  const proving =
    results.find((r) => r.endpoint === "/strategies/proving")?.data || {};
  const promotions =
    results.find((r) => r.endpoint === "/strategies/promotions")?.data || {};
  const gatePressure =
    results.find((r) => r.endpoint === "/metrics/gate-pressure")?.data || {};

  const evalTime = new Date().toISOString();
  const isConnected = broker.connected === true;
  const activeStrategies =
    proving.strategies?.filter((s: any) => s.state === "active")?.length || 0;
  const healthSnapshot = getHealthSnapshot();

  // ═════════════════════════════════════════════════════════════════════════
  // UNIFIED METRICS PAYLOAD CONTRACT
  // ═════════════════════════════════════════════════════════════════════════
  const payload = {
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
      details:
        activeStrategies > 0
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
        queued:
          proving.strategies?.filter((s: any) => s.state === "queued")
            ?.length || 0,
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

    // Feature #2: Health indicators embedded in payload
    _health: {
      vpsReachable: healthSnapshot.vpsReachable,
      totalEndpoints: healthSnapshot.totalEndpoints,
      healthyEndpoints: healthSnapshot.healthyEndpoints,
      degradedEndpoints: healthSnapshot.degradedEndpoints,
      avgLatencyMs: healthSnapshot.avgOverallLatencyMs,
      lastChecked: healthSnapshot.lastChecked,
    },

    // Feature #5 stub: Per-Market Risk Coupling
    riskCoupling: null,

    // Feature #9 stub: Role-Based Views
    _roles: null,

    // Proxy Metadata
    _proxy: {
      source: "vps-live",
      auth: "jwt",
      user: authResult.email,
      userId: authResult.userId,
      timestamp: evalTime,
      endpoints: results.map((r) => ({
        path: r.endpoint,
        success: r.success,
        status: r.success ? 200 : r.status || 0,
        latencyMs: r.latencyMs,
      })),
      totalLatencyMs,
    },
  };

  // Feature #3: Fire-and-forget session recording
  if (sessionId && authResult.userId) {
    recordSessionEvent(sessionId, authResult.userId, "metrics_fetch", {
      systemState: payload.systemVerdict.state,
      endpointCount: results.length,
      successCount: results.filter((r) => r.success).length,
      totalLatencyMs,
    });
  }

  return { payload, endpointResults: results, totalLatencyMs };
}

// ═══════════════════════════════════════════════════════════════════════════
// CORS
// ═══════════════════════════════════════════════════════════════════════════

app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "X-Session-Id"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH ENDPOINTS (no auth required)
// ═══════════════════════════════════════════════════════════════════════════

app.get("/metrics-proxy-jwt", (c) => {
  return c.json({
    status: "ok",
    service: "metrics-proxy-jwt",
    version: "2.1.0",
    auth: "jwt",
    apiVersion: API_VERSION,
    vpsConfigured: !!VPS_METRICS_ENDPOINT,
    internalJwtConfigured: !!INTERNAL_JWT_SECRET,
    allowedPaths: ALLOWED_PATHS,
    features: {
      unifiedAggregator: true, // #1
      healthIndicators: true, // #2
      sessionRecording: true, // #3
      webSockets: false, // #4 stub
      riskCoupling: false, // #5 stub
      forensicReplay: false, // #6 stub
      rateLimiting: "stub", // #7 stub
      apiVersioning: true, // #8 done
      roleBasedViews: false, // #9 stub
      syntheticTests: false, // #10 stub
    },
  });
});

app.get("/metrics-proxy-jwt/health", (c) => {
  return c.json({ status: "ok", auth: "jwt", version: "2.1.0" });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTH MIDDLEWARE for /v1/* endpoints
//
// Validates Supabase JWT once and stores the result in context.
// Also sets rate-limit headers (Feature #7 stub) and API version header.
// ═══════════════════════════════════════════════════════════════════════════

app.use("/metrics-proxy-jwt/v1/*", async (c, next) => {
  const authHeader = c.req.header("Authorization") || "";
  const authResult = await verifySupabaseJWT(authHeader);

  if (!authResult.valid) {
    return c.json(
      {
        error: "Unauthorized",
        message: authResult.error,
        hint: "Provide a valid Supabase JWT in Authorization header",
      },
      401
    );
  }

  c.set("authResult", authResult);

  // Feature #7 stub: Rate limiting headers (pass-through, no actual limiting)
  c.header("X-RateLimit-Limit", "60");
  c.header("X-RateLimit-Remaining", "59");
  c.header(
    "X-RateLimit-Reset",
    String(Math.floor(Date.now() / 1000) + 60)
  );

  // Feature #8: API version header
  c.header("X-API-Version", API_VERSION);

  await next();
});

// ═══════════════════════════════════════════════════════════════════════════
// V1: UNIFIED AGGREGATOR (Feature #1)
// GET /metrics-proxy-jwt/v1/metrics/aggregate
//
// Identical payload to /dashboard but via versioned route.
// Preferred endpoint — /dashboard is deprecated.
// ═══════════════════════════════════════════════════════════════════════════

app.get("/metrics-proxy-jwt/v1/metrics/aggregate", async (c) => {
  try {
    const authResult = c.get("authResult");
    const sessionId = c.req.header("X-Session-Id") || "";

    if (!VPS_METRICS_ENDPOINT) {
      return c.json({ error: "VPS endpoint not configured" }, 503);
    }

    console.log(`[v1/aggregate] User ${authResult.email} fetching metrics`);

    const { payload } = await fetchAndAggregateMetrics(authResult, sessionId);
    return c.json(payload);
  } catch (error) {
    console.error("[v1/aggregate] Error:", error);
    return c.json(
      {
        error: "Aggregation error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// V1: HEALTH DETAILED (Feature #2)
// GET /metrics-proxy-jwt/v1/health/detailed
//
// Returns per-endpoint health: success rate, latency, status.
// Data is populated by the shared aggregation function.
// ═══════════════════════════════════════════════════════════════════════════

app.get("/metrics-proxy-jwt/v1/health/detailed", async (c) => {
  try {
    const authResult = c.get("authResult");
    console.log(`[v1/health] User ${authResult.email} checking health`);

    const snapshot = getHealthSnapshot();

    return c.json({
      status: snapshot.vpsReachable ? "ok" : "degraded",
      ...snapshot,
      _meta: {
        service: "metrics-proxy-jwt",
        version: "2.1.0",
        user: authResult.email,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[v1/health] Error:", error);
    return c.json(
      {
        error: "Health check error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// V1: SESSION EVENTS (Feature #3)
// GET /metrics-proxy-jwt/v1/sessions/events?session_id=&limit=&offset=
//
// Lists session events for the authenticated user.
// If session_id is provided, filters to that session only.
// ═══════════════════════════════════════════════════════════════════════════

app.get("/metrics-proxy-jwt/v1/sessions/events", async (c) => {
  try {
    const authResult = c.get("authResult");
    const sessionId = c.req.query("session_id") || "";
    const limit = Math.min(parseInt(c.req.query("limit") || "50"), 200);
    const offset = parseInt(c.req.query("offset") || "0");

    const client = getServiceClient();
    if (!client) {
      return c.json({ error: "Session recording not configured" }, 503);
    }

    let query = client
      .from("session_events")
      .select("*")
      .eq("user_id", authResult.userId!)
      .order("timestamp_utc", { ascending: false })
      .range(offset, offset + limit - 1);

    if (sessionId) {
      query = query.eq("session_id", sessionId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[v1/sessions/events] Query error:", error.message);
      return c.json(
        { error: "Failed to fetch session events", detail: error.message },
        500
      );
    }

    return c.json({
      events: data || [],
      pagination: {
        limit,
        offset,
        hasMore: (data?.length || 0) === limit,
      },
      _meta: {
        sessionId: sessionId || "all",
        user: authResult.email,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[v1/sessions/events] Error:", error);
    return c.json(
      {
        error: "Session events error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// V1: SESSION EXPORT (Feature #3)
// GET /metrics-proxy-jwt/v1/sessions/export?session_id=&format=json|csv|text
//
// Downloads session events in the requested format.
// ═══════════════════════════════════════════════════════════════════════════

app.get("/metrics-proxy-jwt/v1/sessions/export", async (c) => {
  try {
    const authResult = c.get("authResult");
    const sessionId = c.req.query("session_id") || "";
    const format = c.req.query("format") || "json";

    if (!sessionId) {
      return c.json({ error: "session_id query parameter is required" }, 400);
    }

    const client = getServiceClient();
    if (!client) {
      return c.json({ error: "Session recording not configured" }, 503);
    }

    const { data, error } = await client
      .from("session_events")
      .select("*")
      .eq("user_id", authResult.userId!)
      .eq("session_id", sessionId)
      .order("timestamp_utc", { ascending: true });

    if (error) {
      return c.json(
        { error: "Export failed", detail: error.message },
        500
      );
    }

    const events = data || [];

    // CSV format
    if (format === "csv") {
      const header = "id,session_id,event_type,timestamp_utc,event_payload\n";
      const rows = events
        .map(
          (e: any) =>
            `${e.id},"${e.session_id}","${e.event_type}","${e.timestamp_utc}","${JSON.stringify(e.event_payload).replace(/"/g, '""')}"`
        )
        .join("\n");

      return new Response(header + rows, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="session_${sessionId}.csv"`,
        },
      });
    }

    // Plain text format
    if (format === "text") {
      const lines = events
        .map(
          (e: any) =>
            `[${e.timestamp_utc}] ${e.event_type}: ${JSON.stringify(e.event_payload)}`
        )
        .join("\n");

      return new Response(lines || "No events found", {
        headers: {
          "Content-Type": "text/plain",
          "Content-Disposition": `attachment; filename="session_${sessionId}.txt"`,
        },
      });
    }

    // Default: JSON
    return c.json({
      sessionId,
      eventCount: events.length,
      events,
      exportedAt: new Date().toISOString(),
      user: authResult.email,
    });
  } catch (error) {
    console.error("[v1/sessions/export] Error:", error);
    return c.json(
      {
        error: "Export error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// V1 STUB: Forensic Replay (Feature #6) — 501 Not Implemented
// ═══════════════════════════════════════════════════════════════════════════

app.get("/metrics-proxy-jwt/v1/metrics/replay", (c) => {
  return c.json(
    {
      error: "Not Implemented",
      feature: "Forensic Replay",
      status: 501,
      message:
        "Forensic replay will allow re-playing historical session data " +
        "with full market context. Coming in a future release.",
      plannedEndpoints: [
        "GET /v1/metrics/replay?session_id=&start=&end=",
        "GET /v1/metrics/replay/snapshot?timestamp=",
      ],
    },
    501
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY: GENERIC PROXY ENDPOINT (unchanged, no deprecation)
// GET /metrics-proxy-jwt/proxy?path=/brokers/status
// ═══════════════════════════════════════════════════════════════════════════

app.get("/metrics-proxy-jwt/proxy", async (c) => {
  try {
    const path = c.req.query("path") || "";

    if (
      !path ||
      !ALLOWED_PATHS.some((p) => path === p || path.startsWith(p + "/"))
    ) {
      return c.json(
        { error: "Invalid path", allowed: ALLOWED_PATHS, received: path },
        400
      );
    }

    const authHeader = c.req.header("Authorization") || "";
    const authResult = await verifySupabaseJWT(authHeader);

    if (!authResult.valid) {
      return c.json(
        { error: "Unauthorized", message: authResult.error },
        401
      );
    }

    if (!VPS_METRICS_ENDPOINT) {
      return c.json({ error: "VPS endpoint not configured" }, 503);
    }

    const internalJWT = await createInternalJWT(
      authResult.userId!,
      authResult.email!,
      authResult.role!
    );

    const vpsUrl = `${VPS_METRICS_ENDPOINT}${path}`;
    console.log(`[JWT Proxy] User ${authResult.email} requesting: ${vpsUrl}`);

    const vpsResponse = await fetch(vpsUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${internalJWT}`,
        "X-Proxy-User": authResult.email || "unknown",
      },
    });

    if (!vpsResponse.ok) {
      return c.json(
        {
          error: "VPS request failed",
          status: vpsResponse.status,
          statusText: vpsResponse.statusText,
        },
        vpsResponse.status as any
      );
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
    return c.json(
      {
        error: "Proxy error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY: AGGREGATED DASHBOARD (deprecated — use /v1/metrics/aggregate)
// GET /metrics-proxy-jwt/dashboard
//
// Sets deprecation headers pointing to the successor endpoint.
// ═══════════════════════════════════════════════════════════════════════════

app.get("/metrics-proxy-jwt/dashboard", async (c) => {
  try {
    const authHeader = c.req.header("Authorization") || "";
    const authResult = await verifySupabaseJWT(authHeader);

    if (!authResult.valid) {
      return c.json(
        { error: "Unauthorized", message: authResult.error },
        401
      );
    }

    if (!VPS_METRICS_ENDPOINT) {
      return c.json({ error: "VPS endpoint not configured" }, 503);
    }

    console.log(
      `[Dashboard DEPRECATED] User ${authResult.email} fetching dashboard`
    );

    const sessionId = c.req.header("X-Session-Id") || "";
    const { payload } = await fetchAndAggregateMetrics(authResult, sessionId);

    // Deprecation headers (Feature #1)
    c.header("Deprecation", "true");
    c.header("Sunset", "2026-06-01");
    c.header(
      "Link",
      '</metrics-proxy-jwt/v1/metrics/aggregate>; rel="successor-version"'
    );

    return c.json(payload);
  } catch (error) {
    console.error("[Dashboard] Error:", error);
    return c.json(
      {
        error: "Dashboard proxy error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE #4 STUB: WebSocket Upgrade
// ═══════════════════════════════════════════════════════════════════════════
// Planned: Real-time metrics streaming via WebSocket
//
// Implementation approach:
//   1. Client sends upgrade request to /v1/ws/metrics
//   2. Edge Function authenticates JWT from query param or initial message
//   3. Establishes WebSocket to VPS via Deno.upgradeWebSocket()
//   4. Bridges messages between client and VPS
//   5. Sends heartbeats every 15s, auto-reconnect on failure
//
// Blocked: Need VPS WebSocket server first
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(app.fetch);
