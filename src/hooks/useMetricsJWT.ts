/**
 * React Hook for JWT-authenticated Metrics Dashboard
 *
 * Provides:
 * - Authentication state management
 * - Auto-refreshing dashboard data
 * - Loading and error states
 * - Sign in/out functionality
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  UnifiedMetricsPayload,
  AuthState,
  getAuthState,
  fetchDashboardData,
  getMockDashboardData,
  signIn as apiSignIn,
  signOut as apiSignOut,
  onAuthStateChange,
} from "../api/metrics-jwt";

interface UseMetricsJWTOptions {
  /** Refresh interval in milliseconds (default: 5000) */
  refreshInterval?: number;
  /** Whether to use mock data when not authenticated (default: true) */
  mockWhenUnauthenticated?: boolean;
  /** Whether to start fetching immediately (default: true) */
  autoStart?: boolean;
}

interface UseMetricsJWTReturn {
  // Data
  data: UnifiedMetricsPayload | null;
  source: "vps" | "mock" | "error" | "loading";

  // Auth state
  auth: AuthState;
  isAuthenticated: boolean;

  // Loading/Error states
  isLoading: boolean;
  error: string | null;

  // Actions
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
}

export function useMetricsJWT(options: UseMetricsJWTOptions = {}): UseMetricsJWTReturn {
  const {
    refreshInterval = 5000,
    mockWhenUnauthenticated = true,
    autoStart = true,
  } = options;

  // State
  const [data, setData] = useState<UnifiedMetricsPayload | null>(null);
  const [source, setSource] = useState<"vps" | "mock" | "error" | "loading">("loading");
  const [auth, setAuth] = useState<AuthState>({
    authenticated: false,
    user: null,
    session: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs for cleanup
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  // Fetch dashboard data
  const fetchData = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      // If not authenticated and mock is enabled, use mock data
      if (!auth.authenticated && mockWhenUnauthenticated) {
        setData(getMockDashboardData());
        setSource("mock");
        setError(null);
        setIsLoading(false);
        return;
      }

      // If not authenticated and mock disabled, show error
      if (!auth.authenticated) {
        setData(null);
        setSource("error");
        setError("Please sign in to view live metrics");
        setIsLoading(false);
        return;
      }

      // Fetch from VPS via JWT proxy
      const result = await fetchDashboardData();

      if (!mountedRef.current) return;

      if (result.error) {
        setError(result.error);
        setSource("error");

        // Fall back to mock if configured
        if (mockWhenUnauthenticated) {
          setData(getMockDashboardData());
          setSource("mock");
        }
      } else {
        setData(result.data);
        setSource(result.source);
        setError(null);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Unknown error");
      setSource("error");
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [auth.authenticated, mockWhenUnauthenticated]);

  // Manual refresh
  const refresh = useCallback(async () => {
    setIsLoading(true);
    await fetchData();
  }, [fetchData]);

  // Sign in
  const signIn = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    const result = await apiSignIn(email, password);

    if (result.success) {
      // Auth state change listener will update the state
      await fetchData();
    } else {
      setIsLoading(false);
    }

    return result;
  }, [fetchData]);

  // Sign out
  const signOut = useCallback(async () => {
    await apiSignOut();
    setData(mockWhenUnauthenticated ? getMockDashboardData() : null);
    setSource(mockWhenUnauthenticated ? "mock" : "error");
  }, [mockWhenUnauthenticated]);

  // Initialize auth state
  useEffect(() => {
    mountedRef.current = true;

    // Get initial auth state
    getAuthState().then((state) => {
      if (mountedRef.current) {
        setAuth(state);
      }
    });

    // Subscribe to auth changes
    const unsubscribe = onAuthStateChange((state) => {
      if (mountedRef.current) {
        setAuth(state);
      }
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, []);

  // Fetch data when auth changes or on mount
  useEffect(() => {
    if (autoStart) {
      fetchData();
    }
  }, [auth.authenticated, autoStart, fetchData]);

  // Set up refresh interval
  useEffect(() => {
    if (refreshInterval > 0 && auth.authenticated) {
      intervalRef.current = setInterval(fetchData, refreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [refreshInterval, auth.authenticated, fetchData]);

  return {
    data,
    source,
    auth,
    isAuthenticated: auth.authenticated,
    isLoading,
    error,
    refresh,
    signIn,
    signOut,
  };
}

export default useMetricsJWT;
