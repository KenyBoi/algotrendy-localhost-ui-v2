/**
 * AlgoTrendy Dashboard - JWT Authenticated Version
 *
 * Features integrated:
 *   #1 Unified Aggregator — uses /v1/metrics/aggregate with fallback
 *   #2 Health Indicators  — HealthBadge in header + full card in status row
 *   #3 Session Recording  — SessionTimeline panel at bottom
 */

import React from "react";
import { useMetricsJWT } from "../hooks/useMetricsJWT";
import { LoginForm } from "../components/LoginForm";
import { HealthBadge } from "./components/ui/health-badge";
import { SessionTimeline } from "./components/SessionTimeline";

export function AppJWT() {
  const {
    data,
    source,
    auth,
    isAuthenticated,
    sessionId,
    isLoading,
    error,
    refresh,
    signIn,
    signOut,
  } = useMetricsJWT({
    refreshInterval: 5000,
    mockWhenUnauthenticated: true,
  });

  // Show login form if not authenticated
  if (!isAuthenticated) {
    return <LoginForm onSignIn={signIn} isLoading={isLoading} />;
  }

  // Loading state
  if (isLoading && !data) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <h1>AlgoTrendy Dashboard</h1>
        <div className="header-actions">
          <span className="user-email">{auth.user?.email}</span>
          {/* Feature #2: Health badge in header */}
          <HealthBadge health={data?._health ?? null} mode="compact" />
          <span className={`source-badge ${source}`}>
            {source === "vps" ? "🟢 LIVE" : source === "mock" ? "🟡 MOCK" : "🔴 ERROR"}
          </span>
          <button onClick={refresh} disabled={isLoading}>
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
          <button onClick={signOut} className="signout-btn">
            Sign Out
          </button>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="error-banner">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Main Content */}
      {data && (
        <main className="dashboard-content">
          {/* System Status Row */}
          <div className="status-row">
            <div className={`status-card ${data.systemVerdict.state.toLowerCase()}`}>
              <h3>System Verdict</h3>
              <div className="status-value">{data.systemVerdict.state}</div>
              <p>{data.systemVerdict.reason}</p>
            </div>

            <div className="status-card">
              <h3>Confidence</h3>
              <div className="status-value">{data.systemConfidence.score}%</div>
              <p>Evaluated at {new Date(data.systemConfidence.evaluatedAt).toLocaleTimeString()}</p>
            </div>

            <div className={`status-card ${data.operatorRecommendation.value.toLowerCase()}`}>
              <h3>Recommendation</h3>
              <div className="status-value">{data.operatorRecommendation.value}</div>
              <p>{data.operatorRecommendation.details}</p>
            </div>

            {/* Feature #2: Full health card in status row */}
            <HealthBadge health={data._health} mode="full" />
          </div>

          {/* Markets */}
          <section className="markets-section">
            <h2>Markets</h2>
            <div className="markets-grid">
              {Object.entries(data.markets).map(([key, market]) => (
                <div key={key} className={`market-card ${market.connected ? "connected" : "disconnected"}`}>
                  <h4>{market.id}</h4>
                  <div className="market-status">
                    {market.connected ? "🟢 Connected" : "🔴 Disconnected"}
                  </div>
                  <dl>
                    <dt>Latency</dt>
                    <dd>{market.latencyMs}ms</dd>
                    <dt>Active Strategies</dt>
                    <dd>{market.activeStrategies}</dd>
                    <dt>Last Update</dt>
                    <dd>{new Date(market.lastUpdate).toLocaleTimeString()}</dd>
                  </dl>
                </div>
              ))}
            </div>
          </section>

          {/* Strategy Activity */}
          <section className="activity-section">
            <h2>Strategy Activity</h2>
            <div className="activity-grid">
              <div className="activity-card">
                <h4>Proving Pipeline</h4>
                <dl>
                  <dt>Total</dt>
                  <dd>{data.strategyActivity.provingPipeline.total}</dd>
                  <dt>Active</dt>
                  <dd>{data.strategyActivity.provingPipeline.active}</dd>
                  <dt>Queued</dt>
                  <dd>{data.strategyActivity.provingPipeline.queued}</dd>
                  <dt>Health</dt>
                  <dd>{data.strategyActivity.provingPipeline.health}%</dd>
                </dl>
              </div>

              <div className="activity-card">
                <h4>Gate Pressure</h4>
                <dl>
                  <dt>Current</dt>
                  <dd>{data.strategyActivity.gatePressure.current}</dd>
                  <dt>Pending Action</dt>
                  <dd>{data.strategyActivity.gatePressure.pendingAction}</dd>
                </dl>
              </div>

              <div className="activity-card">
                <h4>Promotions</h4>
                <dl>
                  <dt>Recent</dt>
                  <dd>{data.strategyActivity.promotions.recentCount}</dd>
                  <dt>Last</dt>
                  <dd>{data.strategyActivity.promotions.lastPromotion || "N/A"}</dd>
                </dl>
              </div>
            </div>
          </section>

          {/* Positions */}
          {data.positions.length > 0 && (
            <section className="positions-section">
              <h2>Open Positions</h2>
              <table className="positions-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Market</th>
                    <th>Size</th>
                    <th>Entry</th>
                    <th>Current</th>
                    <th>PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {data.positions.map((pos) => (
                    <tr key={pos.id}>
                      <td>{pos.symbol}</td>
                      <td>{pos.market}</td>
                      <td>{pos.size}</td>
                      <td>${pos.entryPrice.toFixed(2)}</td>
                      <td>${pos.currentPrice.toFixed(2)}</td>
                      <td className={pos.pnl >= 0 ? "positive" : "negative"}>
                        ${pos.pnl.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Feature #3: Session Timeline */}
          <SessionTimeline
            sessionId={sessionId}
            isAuthenticated={isAuthenticated}
          />

          {/* Footer */}
          <footer className="dashboard-footer">
            <span>Last updated: {data.timestamps.lastUpdatedMetrics}</span>
            <span>Source: {data._proxy.source}</span>
            <span>Auth: {data._proxy.auth}</span>
            <span>User: {data._proxy.user}</span>
            <span>Latency: {data._proxy.totalLatencyMs}ms</span>
          </footer>
        </main>
      )}

      <style>{`
        .dashboard {
          min-height: 100vh;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          color: #fff;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 2rem;
          background: rgba(0, 0, 0, 0.3);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .dashboard-header h1 {
          margin: 0;
          font-size: 1.5rem;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .user-email {
          color: rgba(255, 255, 255, 0.7);
          font-size: 0.875rem;
        }

        .source-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 999px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .source-badge.vps { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
        .source-badge.mock { background: rgba(234, 179, 8, 0.2); color: #eab308; }
        .source-badge.error { background: rgba(239, 68, 68, 0.2); color: #ef4444; }

        button {
          padding: 0.5rem 1rem;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: transparent;
          color: #fff;
          cursor: pointer;
          transition: all 0.2s;
        }

        button:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
        }

        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .signout-btn {
          border-color: rgba(239, 68, 68, 0.5);
          color: #ef4444;
        }

        .error-banner {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #ef4444;
          padding: 1rem 2rem;
          margin: 1rem 2rem;
          border-radius: 8px;
        }

        .dashboard-content {
          padding: 2rem;
        }

        .status-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .status-card {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 1.5rem;
        }

        .status-card h3 {
          margin: 0 0 0.5rem 0;
          font-size: 0.875rem;
          color: rgba(255, 255, 255, 0.6);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .status-value {
          font-size: 2rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
        }

        .status-card.nominal .status-value { color: #22c55e; }
        .status-card.degraded .status-value { color: #eab308; }
        .status-card.critical .status-value { color: #ef4444; }
        .status-card.monitor .status-value { color: #3b82f6; }
        .status-card.investigate .status-value { color: #eab308; }

        .status-card p {
          margin: 0;
          color: rgba(255, 255, 255, 0.6);
          font-size: 0.875rem;
        }

        section h2 {
          margin: 0 0 1rem 0;
          font-size: 1.25rem;
        }

        .markets-grid, .activity-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1rem;
        }

        .market-card, .activity-card {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 1rem;
        }

        .market-card h4, .activity-card h4 {
          margin: 0 0 0.5rem 0;
        }

        .market-status {
          margin-bottom: 0.5rem;
        }

        dl {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.25rem 1rem;
          margin: 0;
          font-size: 0.875rem;
        }

        dt { color: rgba(255, 255, 255, 0.6); }
        dd { margin: 0; text-align: right; }

        .positions-table {
          width: 100%;
          border-collapse: collapse;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          overflow: hidden;
        }

        .positions-table th,
        .positions-table td {
          padding: 0.75rem 1rem;
          text-align: left;
        }

        .positions-table th {
          background: rgba(0, 0, 0, 0.3);
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: rgba(255, 255, 255, 0.6);
        }

        .positions-table td.positive { color: #22c55e; }
        .positions-table td.negative { color: #ef4444; }

        .dashboard-footer {
          margin-top: 2rem;
          padding-top: 1rem;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          flex-wrap: wrap;
          gap: 2rem;
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.5);
        }

        .loading-container {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          color: #fff;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(255, 255, 255, 0.1);
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .markets-section, .activity-section, .positions-section {
          margin-bottom: 2rem;
        }
      `}</style>
    </div>
  );
}

export default AppJWT;
