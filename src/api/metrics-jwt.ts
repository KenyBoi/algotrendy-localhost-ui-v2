/**
 * AlgoTrendy Metrics API Client - JWT Authenticated
 *
 * This client uses Supabase Auth JWT for secure communication with the
 * metrics-proxy-jwt Edge Function, which then forwards to the VPS.
 *
 * Flow:
 * 1. Get JWT from Supabase Auth session
 * 2. Send request to Edge Function with JWT
 * 3. Edge Function validates JWT & creates internal token
 * 4. VPS receives request with internal JWT
 * 5. Response flows back through the chain
 */

import { createClient, SupabaseClient, Session } from "@supabase/supabase-js";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SystemVerdict {
  state: "NOMINAL" | "DEGRADED" | "CRITICAL";
  reason: string;
  timestamp: string;
}

export interface OperatorRecommendation {
  value: "MONITOR" | "INVESTIGATE" | "INTERVENE";
  details: string;
  computedAt: string;
}

export interface SystemConfidence {
  score: number;
  evaluatedAt: string;
}

export interface MarketStatus {
  id: string;
  connected: boolean;
  latencyMs: number;
  lastUpdate: string;
  drift: number;
  activeStrategies: number;
  lastSignal: string | null;
  lastDenial: string | null;
}

export interface DataFreshness {
  brokerStatus: string | null;
  trades: string | null;
  strategies: string | null;
  gatePressure: string | null;
}

export interface ProvingPipeline {
  total: number;
  active: number;
  queued: number;
  health: number;
}

export interface PromotionActivity {
  recentCount: number;
  lastPromotion: string | null;
  history: any[];
}

export interface GatePressureActivity {
  current: number;
  pendingAction: string;
  recentDenials: any[];
}

export interface StrategyActivity {
  provingPipeline: ProvingPipeline;
  promotions: PromotionActivity;
  gatePressure: GatePressureActivity;
}

export interface Position {
  id: string;
  symbol: string;
  market: string;
  size: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  openTime: string;
}

export interface TimelineEvent {
  at: string;
  market: string;
  event: string;
  actor?: string;
}

export interface ProxyMetadata {
  source: string;
  auth: string;
  user: string;
  userId: string;
  timestamp: string;
  endpoints: Array<{ path: string; success: boolean; status: number }>;
}

export interface UnifiedMetricsPayload {
  systemVerdict: SystemVerdict;
  operatorRecommendation: OperatorRecommendation;
  systemConfidence: SystemConfidence;
  markets: {
    futures: MarketStatus;
    crypto: MarketStatus;
  };
  dataFreshness: DataFreshness;
  strategyActivity: StrategyActivity;
  positions: Position[];
  sessionTimeline: TimelineEvent[];
  timestamps: {
    lastUpdatedMetrics: string;
    serverTime: string;
  };
  _proxy: ProxyMetadata;
}

export interface AuthState {
  authenticated: boolean;
  user: {
    id: string;
    email: string;
  } | null;
  session: Session | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

const EDGE_FUNCTION_BASE = `${SUPABASE_URL}/functions/v1/metrics-proxy-jwt`;

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE CLIENT (Singleton)
// ═══════════════════════════════════════════════════════════════════════════

let supabaseClient: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase URL and Anon Key must be configured");
    }
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get current authentication state
 */
export async function getAuthState(): Promise<AuthState> {
  try {
    const supabase = getSupabase();
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      return { authenticated: false, user: null, session: null };
    }

    return {
      authenticated: true,
      user: {
        id: session.user.id,
        email: session.user.email || "",
      },
      session,
    };
  } catch {
    return { authenticated: false, user: null, session: null };
  }
}

/**
 * Get JWT token from current session
 * Returns null if not authenticated
 */
export async function getJWT(): Promise<string | null> {
  const authState = await getAuthState();
  return authState.session?.access_token || null;
}

/**
 * Sign in with email/password
 */
export async function signIn(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Sign in failed",
    };
  }
}

/**
 * Sign out
 */
export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  await supabase.auth.signOut();
}

/**
 * Subscribe to auth state changes
 */
export function onAuthStateChange(
  callback: (authState: AuthState) => void
): () => void {
  const supabase = getSupabase();

  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (event, session) => {
      if (session) {
        callback({
          authenticated: true,
          user: {
            id: session.user.id,
            email: session.user.email || "",
          },
          session,
        });
      } else {
        callback({ authenticated: false, user: null, session: null });
      }
    }
  );

  return () => subscription.unsubscribe();
}

// ═══════════════════════════════════════════════════════════════════════════
// METRICS API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch a specific metrics path through the JWT proxy
 */
export async function fetchMetricsPath<T = any>(
  path: string
): Promise<{ data: T | null; error: string | null }> {
  try {
    const jwt = await getJWT();

    if (!jwt) {
      return { data: null, error: "Not authenticated. Please sign in." };
    }

    const response = await fetch(`${EDGE_FUNCTION_BASE}/proxy?path=${encodeURIComponent(path)}`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 401) {
      return { data: null, error: "Session expired. Please sign in again." };
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        data: null,
        error: errorData.error || `Request failed: ${response.status}`,
      };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/**
 * Fetch the unified dashboard data
 * This is the primary method for getting all metrics in one call
 */
export async function fetchDashboardData(): Promise<{
  data: UnifiedMetricsPayload | null;
  error: string | null;
  source: "vps" | "mock" | "error";
}> {
  try {
    const jwt = await getJWT();

    if (!jwt) {
      return {
        data: null,
        error: "Not authenticated. Please sign in.",
        source: "error",
      };
    }

    const response = await fetch(`${EDGE_FUNCTION_BASE}/dashboard`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 401) {
      return {
        data: null,
        error: "Session expired. Please sign in again.",
        source: "error",
      };
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        data: null,
        error: errorData.error || `Request failed: ${response.status}`,
        source: "error",
      };
    }

    const data = await response.json();
    return { data, error: null, source: "vps" };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Network error",
      source: "error",
    };
  }
}

/**
 * Check proxy health (no auth required)
 */
export async function checkProxyHealth(): Promise<{
  healthy: boolean;
  auth: string;
  vpsConfigured: boolean;
}> {
  try {
    const response = await fetch(EDGE_FUNCTION_BASE);

    if (!response.ok) {
      return { healthy: false, auth: "unknown", vpsConfigured: false };
    }

    const data = await response.json();
    return {
      healthy: data.status === "ok",
      auth: data.auth || "unknown",
      vpsConfigured: data.vpsConfigured || false,
    };
  } catch {
    return { healthy: false, auth: "unknown", vpsConfigured: false };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK DATA (for development/fallback)
// ═══════════════════════════════════════════════════════════════════════════

export function getMockDashboardData(): UnifiedMetricsPayload {
  const now = new Date().toISOString();
  return {
    systemVerdict: {
      state: "NOMINAL",
      reason: "Mock data - system simulation",
      timestamp: now,
    },
    operatorRecommendation: {
      value: "MONITOR",
      details: "Mock mode active. Connect to VPS for live data.",
      computedAt: now,
    },
    systemConfidence: {
      score: 85.0,
      evaluatedAt: now,
    },
    markets: {
      futures: {
        id: "FUT",
        connected: true,
        latencyMs: 45,
        lastUpdate: now,
        drift: 0.01,
        activeStrategies: 3,
        lastSignal: "BUY ES 2026-03",
        lastDenial: null,
      },
      crypto: {
        id: "CRY",
        connected: false,
        latencyMs: 0,
        lastUpdate: now,
        drift: 0,
        activeStrategies: 0,
        lastSignal: null,
        lastDenial: null,
      },
    },
    dataFreshness: {
      brokerStatus: now,
      trades: now,
      strategies: now,
      gatePressure: now,
    },
    strategyActivity: {
      provingPipeline: {
        total: 5,
        active: 3,
        queued: 2,
        health: 95,
      },
      promotions: {
        recentCount: 2,
        lastPromotion: now,
        history: [],
      },
      gatePressure: {
        current: 0.15,
        pendingAction: "None",
        recentDenials: [],
      },
    },
    positions: [
      {
        id: "p1",
        symbol: "ES",
        market: "FUT",
        size: 2,
        entryPrice: 5250.5,
        currentPrice: 5275.25,
        pnl: 2475.0,
        openTime: now,
      },
    ],
    sessionTimeline: [
      { at: now, market: "FUT", event: "Mock data loaded" },
    ],
    timestamps: {
      lastUpdatedMetrics: now,
      serverTime: now,
    },
    _proxy: {
      source: "mock",
      auth: "none",
      user: "mock-user",
      userId: "mock-id",
      timestamp: now,
      endpoints: [],
    },
  };
}
