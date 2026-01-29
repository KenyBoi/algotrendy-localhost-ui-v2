/**
 * SessionTimeline Component (Feature #3)
 *
 * Displays session events with:
 *   - Event list in reverse chronological order
 *   - Export buttons (JSON, CSV, text)
 *   - Session ID display
 *
 * Events are fetched from /v1/sessions/events and can be exported
 * via /v1/sessions/export.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  SessionEvent,
  fetchSessionEvents,
  getSessionExportUrl,
} from "../../api/metrics-jwt";

interface SessionTimelineProps {
  sessionId: string;
  isAuthenticated: boolean;
}

export function SessionTimeline({ sessionId, isAuthenticated }: SessionTimelineProps) {
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const loadEvents = useCallback(async () => {
    if (!isAuthenticated || !sessionId) return;

    setIsLoading(true);
    setError(null);

    const result = await fetchSessionEvents({
      sessionId,
      limit: 20,
    });

    if (result.error) {
      setError(result.error);
    } else if (result.data) {
      setEvents(result.data.events);
    }

    setIsLoading(false);
  }, [sessionId, isAuthenticated]);

  // Auto-refresh events when expanded
  useEffect(() => {
    if (isExpanded && isAuthenticated) {
      loadEvents();
      const interval = setInterval(loadEvents, 10000);
      return () => clearInterval(interval);
    }
  }, [isExpanded, isAuthenticated, loadEvents]);

  const handleExport = (format: "json" | "csv" | "text") => {
    const url = getSessionExportUrl(sessionId, format);
    window.open(url, "_blank");
  };

  return (
    <div className="session-timeline">
      <div className="session-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="session-header-left">
          <span className="session-icon">{isExpanded ? "▼" : "▶"}</span>
          <h3 className="session-title">Session Recording</h3>
          <span className="session-count">
            {events.length > 0 ? `${events.length} events` : ""}
          </span>
        </div>

        <div className="session-id-display">
          <span className="session-id-label">ID:</span>
          <code className="session-id-value">
            {sessionId.slice(0, 8)}...
          </code>
        </div>
      </div>

      {isExpanded && (
        <div className="session-content">
          {/* Export buttons */}
          <div className="session-actions">
            <button
              className="export-btn"
              onClick={() => handleExport("json")}
              title="Export as JSON"
            >
              📄 JSON
            </button>
            <button
              className="export-btn"
              onClick={() => handleExport("csv")}
              title="Export as CSV"
            >
              📊 CSV
            </button>
            <button
              className="export-btn"
              onClick={() => handleExport("text")}
              title="Export as text"
            >
              📝 Text
            </button>
            <button
              className="export-btn refresh-btn"
              onClick={loadEvents}
              disabled={isLoading}
            >
              {isLoading ? "⏳" : "🔄"} Refresh
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="session-error">
              {error}
            </div>
          )}

          {/* Event list */}
          {events.length === 0 && !isLoading && !error ? (
            <div className="session-empty">
              No events recorded yet. Events appear as you use the dashboard.
            </div>
          ) : (
            <div className="session-events">
              {events.map((event) => (
                <div key={event.id} className="session-event">
                  <div className="event-time">
                    {new Date(event.timestamp_utc).toLocaleTimeString()}
                  </div>
                  <div className="event-dot" />
                  <div className="event-body">
                    <span className="event-type">{event.event_type}</span>
                    {event.event_payload && Object.keys(event.event_payload).length > 0 && (
                      <div className="event-payload">
                        {Object.entries(event.event_payload).map(([k, v]) => (
                          <span key={k} className="payload-item">
                            <span className="payload-key">{k}:</span>{" "}
                            <span className="payload-value">{String(v)}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        .session-timeline {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          margin-top: 2rem;
          overflow: hidden;
        }

        .session-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.25rem;
          cursor: pointer;
          user-select: none;
          transition: background 0.15s;
        }

        .session-header:hover {
          background: rgba(255, 255, 255, 0.03);
        }

        .session-header-left {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .session-icon {
          font-size: 0.7rem;
          color: rgba(255, 255, 255, 0.5);
        }

        .session-title {
          margin: 0;
          font-size: 0.9rem;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
        }

        .session-count {
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.4);
        }

        .session-id-display {
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }

        .session-id-label {
          font-size: 0.7rem;
          color: rgba(255, 255, 255, 0.4);
          text-transform: uppercase;
        }

        .session-id-value {
          font-size: 0.75rem;
          background: rgba(255, 255, 255, 0.05);
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
          color: rgba(255, 255, 255, 0.6);
          font-family: 'SF Mono', 'Fira Code', monospace;
        }

        .session-content {
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          padding: 1rem 1.25rem;
        }

        .session-actions {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .export-btn {
          padding: 0.3rem 0.6rem;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: transparent;
          color: rgba(255, 255, 255, 0.7);
          font-size: 0.75rem;
          cursor: pointer;
          transition: all 0.15s;
        }

        .export-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
        }

        .export-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .refresh-btn {
          margin-left: auto;
        }

        .session-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #ef4444;
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
          font-size: 0.8rem;
          margin-bottom: 0.75rem;
        }

        .session-empty {
          color: rgba(255, 255, 255, 0.4);
          font-size: 0.85rem;
          text-align: center;
          padding: 1.5rem 0;
        }

        .session-events {
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .session-event {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 0.6rem 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }

        .session-event:last-child {
          border-bottom: none;
        }

        .event-time {
          font-size: 0.7rem;
          color: rgba(255, 255, 255, 0.4);
          min-width: 70px;
          font-variant-numeric: tabular-nums;
          font-family: 'SF Mono', 'Fira Code', monospace;
          padding-top: 0.15rem;
        }

        .event-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: rgba(59, 130, 246, 0.6);
          margin-top: 0.35rem;
          flex-shrink: 0;
        }

        .event-body {
          flex: 1;
          min-width: 0;
        }

        .event-type {
          font-size: 0.8rem;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.85);
        }

        .event-payload {
          display: flex;
          flex-wrap: wrap;
          gap: 0.25rem 0.75rem;
          margin-top: 0.25rem;
        }

        .payload-item {
          font-size: 0.7rem;
          color: rgba(255, 255, 255, 0.4);
        }

        .payload-key {
          color: rgba(255, 255, 255, 0.5);
        }

        .payload-value {
          color: rgba(255, 255, 255, 0.6);
          font-family: 'SF Mono', 'Fira Code', monospace;
        }
      `}</style>
    </div>
  );
}

export default SessionTimeline;
