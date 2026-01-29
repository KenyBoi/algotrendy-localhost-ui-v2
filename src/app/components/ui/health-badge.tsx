/**
 * HealthBadge Component (Feature #2)
 *
 * Displays VPS health status: connectivity, endpoint count, latency.
 * Supports two modes:
 *   - compact: small pill for the header bar
 *   - full: expanded card with per-endpoint details
 */

import React from "react";
import { HealthIndicators } from "../../../api/metrics-jwt";

interface HealthBadgeProps {
  health: HealthIndicators | null;
  mode?: "compact" | "full";
}

export function HealthBadge({ health, mode = "compact" }: HealthBadgeProps) {
  if (!health) {
    return (
      <span className="health-badge health-unknown">
        ⚪ No health data
      </span>
    );
  }

  const { vpsReachable, healthyEndpoints, totalEndpoints, degradedEndpoints, avgLatencyMs } = health;

  const statusClass = vpsReachable
    ? degradedEndpoints > 0
      ? "health-degraded"
      : "health-ok"
    : "health-down";

  const statusIcon = vpsReachable
    ? degradedEndpoints > 0
      ? "🟡"
      : "🟢"
    : "🔴";

  const statusLabel = vpsReachable
    ? degradedEndpoints > 0
      ? "DEGRADED"
      : "HEALTHY"
    : "DOWN";

  if (mode === "compact") {
    return (
      <span className={`health-badge ${statusClass}`} title={`VPS: ${statusLabel} | ${healthyEndpoints}/${totalEndpoints} endpoints | ${avgLatencyMs}ms`}>
        {statusIcon} {avgLatencyMs}ms

        <style>{`
          .health-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.25rem;
            padding: 0.2rem 0.6rem;
            border-radius: 999px;
            font-size: 0.7rem;
            font-weight: 600;
            font-variant-numeric: tabular-nums;
            cursor: default;
          }

          .health-ok {
            background: rgba(34, 197, 94, 0.15);
            color: #22c55e;
            border: 1px solid rgba(34, 197, 94, 0.3);
          }

          .health-degraded {
            background: rgba(234, 179, 8, 0.15);
            color: #eab308;
            border: 1px solid rgba(234, 179, 8, 0.3);
          }

          .health-down {
            background: rgba(239, 68, 68, 0.15);
            color: #ef4444;
            border: 1px solid rgba(239, 68, 68, 0.3);
          }

          .health-unknown {
            background: rgba(148, 163, 184, 0.15);
            color: #94a3b8;
            border: 1px solid rgba(148, 163, 184, 0.3);
          }
        `}</style>
      </span>
    );
  }

  // Full mode: expanded card
  return (
    <div className={`health-card ${statusClass}`}>
      <div className="health-card-header">
        <span className="health-card-icon">{statusIcon}</span>
        <span className="health-card-label">VPS Health</span>
        <span className="health-card-status">{statusLabel}</span>
      </div>

      <div className="health-card-stats">
        <div className="health-stat">
          <span className="health-stat-value">{healthyEndpoints}/{totalEndpoints}</span>
          <span className="health-stat-label">Endpoints</span>
        </div>
        <div className="health-stat">
          <span className="health-stat-value">{avgLatencyMs}ms</span>
          <span className="health-stat-label">Avg Latency</span>
        </div>
        {degradedEndpoints > 0 && (
          <div className="health-stat">
            <span className="health-stat-value health-warn">{degradedEndpoints}</span>
            <span className="health-stat-label">Degraded</span>
          </div>
        )}
      </div>

      <div className="health-card-footer">
        Last checked: {new Date(health.lastChecked).toLocaleTimeString()}
      </div>

      <style>{`
        .health-card {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 1rem;
          font-size: 0.875rem;
        }

        .health-card.health-ok {
          border-color: rgba(34, 197, 94, 0.3);
        }

        .health-card.health-degraded {
          border-color: rgba(234, 179, 8, 0.3);
        }

        .health-card.health-down {
          border-color: rgba(239, 68, 68, 0.3);
        }

        .health-card-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
        }

        .health-card-icon {
          font-size: 1.1rem;
        }

        .health-card-label {
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
          flex: 1;
        }

        .health-card-status {
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .health-ok .health-card-status { color: #22c55e; }
        .health-degraded .health-card-status { color: #eab308; }
        .health-down .health-card-status { color: #ef4444; }

        .health-card-stats {
          display: flex;
          gap: 1.5rem;
          margin-bottom: 0.75rem;
        }

        .health-stat {
          display: flex;
          flex-direction: column;
          gap: 0.1rem;
        }

        .health-stat-value {
          font-size: 1.25rem;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          color: #fff;
        }

        .health-stat-value.health-warn {
          color: #eab308;
        }

        .health-stat-label {
          font-size: 0.7rem;
          color: rgba(255, 255, 255, 0.5);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .health-card-footer {
          color: rgba(255, 255, 255, 0.4);
          font-size: 0.75rem;
          padding-top: 0.5rem;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }
      `}</style>
    </div>
  );
}

export default HealthBadge;
