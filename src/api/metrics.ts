// Metrics API Client
// Connects to VPS via Supabase Edge Function proxy

import { projectId, publicAnonKey } from '/utils/supabase/info';
import { DashboardState } from '@/app/types';
import { MOCK_DATA } from '@/app/mockData';

const SUPABASE_BASE = `https://${projectId}.supabase.co/functions/v1`;

export type FetchMode = 'live' | 'mock' | 'auto';

interface FetchResult {
  data: DashboardState;
  source: 'live' | 'mock';
  error?: string;
}

/**
 * Fetch dashboard data from VPS via proxy
 * Falls back to mock data if proxy fails
 */
export async function fetchDashboardData(mode: FetchMode = 'auto'): Promise<FetchResult> {
  // If explicitly requesting mock, return mock data
  if (mode === 'mock') {
    return {
      data: { ...MOCK_DATA, evalTime: new Date().toISOString() },
      source: 'mock'
    };
  }

  try {
    const response = await fetch(`${SUPABASE_BASE}/metrics-proxy/dashboard`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();

    return {
      data,
      source: 'live'
    };

  } catch (error) {
    console.warn('Live data fetch failed, using mock:', error);

    // If mode is 'live', throw the error instead of falling back
    if (mode === 'live') {
      return {
        data: MOCK_DATA,
        source: 'mock',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // Auto mode: fall back to mock data
    return {
      data: { ...MOCK_DATA, evalTime: new Date().toISOString() },
      source: 'mock',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Fetch a specific metrics endpoint via proxy
 */
export async function fetchMetricsPath(path: string): Promise<any> {
  const response = await fetch(
    `${SUPABASE_BASE}/metrics-proxy/proxy?path=${encodeURIComponent(path)}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Check proxy health
 */
export async function checkProxyHealth(): Promise<{
  proxyOk: boolean;
  vpsConfigured: boolean;
  error?: string;
}> {
  try {
    const response = await fetch(`${SUPABASE_BASE}/metrics-proxy`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`
      }
    });

    if (!response.ok) {
      return { proxyOk: false, vpsConfigured: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return {
      proxyOk: data.status === 'ok',
      vpsConfigured: data.vpsConfigured || false
    };

  } catch (error) {
    return {
      proxyOk: false,
      vpsConfigured: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
