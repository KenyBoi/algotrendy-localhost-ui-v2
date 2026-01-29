#!/usr/bin/env python3
"""
AlgoTrendy Dashboard Server (Read-Only)
Terminal-style monitoring dashboard for AlgoTrendy trading system

Deploy to VPS: /opt/algotrendy/dashboard_server.py
Port: 5000
"""
from flask import Flask, render_template_string, jsonify, request
import requests
from datetime import datetime
import json

app = Flask(__name__)

# Configuration
METRICS_API_URL = "http://127.0.0.1:9000"


# ═══════════════════════════════════════════════════════════════════════════
# TERMINAL-STYLE DASHBOARD HTML
# ═══════════════════════════════════════════════════════════════════════════

DASHBOARD_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <title>AlgoTrendy Dashboard v2.3</title>
  <style>
    /* Terminal aesthetic with clean CSS borders */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      background: #0c0c0c;
      color: #e6e6e6;
      font-family: "Consolas", "Monaco", "Courier New", monospace;
      font-size: 14px;
      line-height: 1.5;
      padding: 20px;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
    }

    /* Header banner */
    .header {
      border: 2px solid #0cf;
      padding: 12px;
      text-align: center;
      margin-bottom: 20px;
      background: #0a0a0a;
    }

    .header h1 {
      color: #0cf;
      font-size: 18px;
      font-weight: normal;
      letter-spacing: 2px;
    }

    /* Panel boxes */
    .panel {
      border: 1px solid #444;
      margin-bottom: 20px;
      background: #0a0a0a;
    }

    .panel-header {
      border-bottom: 1px solid #444;
      padding: 8px 12px;
      background: #111;
      color: #0cf;
      font-weight: bold;
    }

    .panel-body {
      padding: 12px;
    }

    /* Data rows */
    .row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px dotted #222;
    }

    .row:last-child {
      border-bottom: none;
    }

    .label {
      color: #888;
    }

    .value {
      color: #fff;
      font-weight: bold;
    }

    /* Status colors */
    .ok { color: #0f0; }
    .warn { color: #ff0; }
    .bad { color: #f33; }
    .info { color: #0cf; }

    /* Trade items */
    .trade-item {
      border: 1px solid #333;
      padding: 10px;
      margin-bottom: 10px;
      background: #050505;
    }

    .trade-item:last-child {
      margin-bottom: 0;
    }

    .trade-header {
      color: #0cf;
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid #222;
    }

    .trade-row {
      display: flex;
      justify-content: space-between;
      padding: 3px 0;
    }

    /* Entry types grid */
    .entry-types {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 4px;
      margin-top: 8px;
    }

    .entry-type {
      display: flex;
      justify-content: space-between;
      padding: 4px 8px;
      background: #111;
      border-left: 2px solid #333;
    }

    /* Footer */
    .footer {
      border-top: 1px solid #444;
      padding-top: 12px;
      margin-top: 20px;
      text-align: center;
      color: #666;
      font-size: 12px;
    }

    /* Loading state */
    .loading {
      text-align: center;
      padding: 40px;
      color: #0cf;
      font-size: 16px;
    }

    .loading::after {
      content: '...';
      animation: dots 1.5s infinite;
    }

    @keyframes dots {
      0%, 20% { content: '.'; }
      40% { content: '..'; }
      60%, 100% { content: '...'; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>ALGOTRENDY DASHBOARD (TERMINAL)</h1>
      <div style="font-size: 11px; color: #666; margin-top: 4px;">v4.0.0-temporal | Time First-Class</div>
    </div>

    <div id="content" class="loading">Loading metrics</div>

    <div class="footer" id="footer"></div>
  </div>

  <script>
    const API_BASE = "";

    // ═════════════════════════════════════════════════════════════════
    // MARKET CONFIGURATION (Crypto First-Class)
    // ═════════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // SYSTEM INVARIANT (v3.1.0):
    //   IF market.instrumented == false THEN execution_capability == false
    //
    // A NOT_INSTRUMENTED market is OBSERVE-ONLY. It cannot:
    //   - Execute trades
    //   - Generate actionable intents
    //   - Contribute to "SAFE TO TRADE" without qualification
    //
    // This invariant enables future features:
    //   - Per-market auto-safety arming
    //   - Cross-market risk coupling (only when both instrumented)
    //   - Backtesting parity guarantees
    //
    // FREEZE LINE: Do not modify multi-market semantics (confidence weights,
    // rollup thresholds, partial verdict wording) until timestamps land.
    // ═══════════════════════════════════════════════════════════════

    // Market states: LIVE, OFF, DEGRADED, NOT_INSTRUMENTED
    const MARKETS = {
      FUTURES: {
        name: 'FUTURES',
        enabled: true,
        state: 'LIVE',  // Will be computed from broker data
        instrumented: true
      },
      CRYPTO: {
        name: 'CRYPTO',
        enabled: true,  // Set to false to disable crypto entirely
        state: 'NOT_INSTRUMENTED',  // Until crypto API is connected
        instrumented: false  // No crypto endpoints yet
      }
    };

    // Historical tracking for trend analysis (Phase 3) - Per Market
    const history = {
      // Futures tracking
      futures: {
        dataLag: [],
        gatePressure: []
      },
      // Crypto tracking
      crypto: {
        dataLag: [],
        gatePressure: []
      },
      // Global tracking
      fetchTiming: [],   // Track API response times
      maxSamples: 20,    // Keep last N samples
      sessionEvents: []  // Session narrative (Phase 6)
    };

    function addSessionEvent(event) {
      // Only add unique events
      if (!history.sessionEvents.includes(event)) {
        history.sessionEvents.push(event);
        if (history.sessionEvents.length > 10) history.sessionEvents.shift();
      }
    }

    // Market state badge helper
    function marketStateBadge(state) {
      switch(state) {
        case 'LIVE': return '<span class="ok">✓</span>';
        case 'OFF': return '<span class="info">OFF</span>';
        case 'DEGRADED': return '<span class="warn">⚠</span>';
        case 'NOT_INSTRUMENTED': return '<span class="warn">?</span>';
        default: return '<span class="bad">✗</span>';
      }
    }

    // Compute market state from data
    function computeMarketState(market, broker, dataFreshness) {
      if (!MARKETS[market].enabled) return 'OFF';
      if (!MARKETS[market].instrumented) return 'NOT_INSTRUMENTED';

      if (market === 'FUTURES') {
        if (!broker.connected || !broker.token_valid) return 'DEGRADED';
        if (broker.killing_active) return 'OFF';
        if (dataFreshness.status === 'STALE') return 'DEGRADED';
        return 'LIVE';
      }

      if (market === 'CRYPTO') {
        // When crypto is instrumented, this will use crypto-specific data
        return 'NOT_INSTRUMENTED';
      }

      return 'NOT_INSTRUMENTED';
    }

    function statusBadge(connected, valid) {
      if (connected && valid) return '<span class="ok">CONNECTED</span>';
      if (connected && !valid) return '<span class="warn">TOKEN INVALID</span>';
      return '<span class="bad">DISCONNECTED</span>';
    }

    function pressureColor(level) {
      if (level === "LOW") return '<span class="ok">LOW</span>';
      if (level === "MEDIUM") return '<span class="warn">MEDIUM</span>';
      return '<span class="bad">HIGH</span>';
    }

    function addToHistory(arr, value) {
      arr.push(value);
      if (arr.length > history.maxSamples) arr.shift();
    }

    function computeTrend(arr) {
      // Returns: STABLE, RISING, FALLING
      if (arr.length < 3) return 'STABLE';

      const recent3 = arr.slice(-3);
      const avg = recent3.reduce((a, b) => a + b, 0) / recent3.length;
      const oldest = arr.slice(0, Math.min(5, arr.length));
      const oldAvg = oldest.reduce((a, b) => a + b, 0) / oldest.length;

      const change = ((avg - oldAvg) / oldAvg) * 100;

      if (Math.abs(change) < 10) return 'STABLE';
      return change > 0 ? 'RISING' : 'FALLING';
    }

    function trendBadge(trend, invertGood = false) {
      // invertGood: for metrics where RISING is bad (like lag)
      if (trend === 'STABLE') return '<span class="ok">STABLE</span>';
      if (trend === 'RISING') {
        return invertGood ? '<span class="warn">RISING ↑</span>' : '<span class="ok">RISING ↑</span>';
      }
      return invertGood ? '<span class="ok">FALLING ↓</span>' : '<span class="warn">FALLING ↓</span>';
    }

    function formatDuration(seconds) {
      if (seconds < 60) return `${seconds.toFixed(0)}s`;
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}m ${secs}s`;
    }

    // ═════════════════════════════════════════════════════════════════
    // PHASE 7: TIME AS FIRST-CLASS AXIS
    // ═════════════════════════════════════════════════════════════════
    //
    // CORE PRINCIPLE: Every observable truth must answer three questions:
    //   1. What is the state?
    //   2. Which market does it belong to?
    //   3. As of when is this true?
    //
    // Formalized as: (state, market, timestamp_utc)
    //
    // TIME SOURCE: Client-side Date.now() for evaluation timestamps
    // PROPAGATION: Captured once per refresh cycle, passed to all computations
    // FORMAT: ISO-8601 UTC (YYYY-MM-DD HH:MM:SS UTC)
    // ═════════════════════════════════════════════════════════════════

    // Format a Date object as UTC string for display
    function formatUTC(date) {
      if (!date) return 'N/A';
      if (typeof date === 'string') date = new Date(date);
      if (isNaN(date.getTime())) return 'INVALID';

      const pad = (n) => n.toString().padStart(2, '0');
      return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
             `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;
    }

    // Format a Date object as compact UTC (HH:MM:SS UTC)
    function formatUTCCompact(date) {
      if (!date) return 'N/A';
      if (typeof date === 'string') date = new Date(date);
      if (isNaN(date.getTime())) return 'INVALID';

      const pad = (n) => n.toString().padStart(2, '0');
      return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;
    }

    // Parse an API timestamp and return Date object
    function parseAPITimestamp(ts) {
      if (!ts) return null;
      const date = new Date(ts);
      return isNaN(date.getTime()) ? null : date;
    }

    // Session timeline for chronological narrative
    const sessionTimeline = {
      events: [],  // {timestamp: Date, market: string, event: string}
      startTime: new Date(),

      addEvent(timestamp, market, event) {
        // Avoid duplicates based on event text
        const exists = this.events.some(e => e.event === event && e.market === market);
        if (!exists) {
          this.events.push({ timestamp: timestamp || new Date(), market, event });
          // Keep sorted by time
          this.events.sort((a, b) => a.timestamp - b.timestamp);
          // Limit to last 20 events
          if (this.events.length > 20) this.events.shift();
        }
      },

      getChronological() {
        return this.events.map(e => ({
          time: formatUTCCompact(e.timestamp),
          market: e.market,
          event: e.event
        }));
      }
    };

    // ═════════════════════════════════════════════════════════════════
    // PHASE 6: DECISION AUTOMATION (HUMAN-FIRST) - MARKET AWARE
    // ═════════════════════════════════════════════════════════════════

    function computeMarketConfidence(market, broker, gates, dataFreshness, jitterLevel, intentQuality) {
      // Per-market confidence calculation
      let confidence = 0;
      const marketConfig = MARKETS[market];

      // If market is OFF, it contributes full confidence (no penalty)
      if (!marketConfig.enabled) {
        return { score: 100, contributing: false };
      }

      // If market is NOT_INSTRUMENTED, it contributes 0 confidence
      if (!marketConfig.instrumented) {
        return { score: 0, contributing: true, capped: true };
      }

      // Market is enabled and instrumented - compute normally
      if (market === 'FUTURES') {
        // Broker + Token Health: 25 points
        if (broker.connected && broker.token_valid) {
          confidence += 25;
        } else if (broker.connected) {
          confidence += 12;
        }

        // Data Freshness: 25 points
        if (dataFreshness.futures && dataFreshness.futures.status === 'HEALTHY') {
          confidence += 25;
        } else if (dataFreshness.futures && dataFreshness.futures.status === 'DEGRADED') {
          confidence += 12;
        }

        // Control Loop Jitter: 15 points
        if (jitterLevel === 'LOW' || jitterLevel.includes('LOW')) {
          confidence += 15;
        } else if (jitterLevel === 'MEDIUM' || jitterLevel.includes('MEDIUM')) {
          confidence += 7;
        }

        // Gate Pressure Trend: 20 points
        const gateTrend = computeTrend(history.futures.gatePressure);
        if (gateTrend === 'STABLE' || gateTrend === 'FALLING') {
          confidence += 20;
        } else if (gateTrend === 'RISING') {
          confidence += 5;
        }

        // Intent Quality (if trading): 15 points
        if (!broker.killing_active) {
          if (intentQuality === 'N/A' || intentQuality === '100%') {
            confidence += 15;
          } else {
            const quality = parseInt(intentQuality);
            if (quality >= 70) confidence += 15;
            else if (quality >= 40) confidence += 7;
          }
        } else {
          confidence += 15;
        }
      }

      if (market === 'CRYPTO') {
        // When crypto is instrumented, similar logic here
        // For now, returns 0 because not instrumented
        confidence = 0;
      }

      return { score: Math.min(100, Math.max(0, confidence)), contributing: true, capped: false };
    }

    function computeSystemConfidence(broker, gates, dataFreshness, jitterLevel, intentQuality) {
      // Compute per-market confidence
      const futuresConf = computeMarketConfidence('FUTURES', broker, gates, dataFreshness, jitterLevel, intentQuality);
      const cryptoConf = computeMarketConfidence('CRYPTO', broker, gates, dataFreshness, jitterLevel, intentQuality);

      // Count enabled markets
      let enabledMarkets = 0;
      let totalScore = 0;
      let hasUninstrumented = false;

      if (MARKETS.FUTURES.enabled) {
        enabledMarkets++;
        if (futuresConf.contributing) {
          totalScore += futuresConf.score;
          if (futuresConf.capped) hasUninstrumented = true;
        }
      }

      if (MARKETS.CRYPTO.enabled) {
        enabledMarkets++;
        if (cryptoConf.contributing) {
          totalScore += cryptoConf.score;
          if (cryptoConf.capped) hasUninstrumented = true;
        }
      }

      // Average across enabled markets
      let globalConfidence = enabledMarkets > 0 ? Math.round(totalScore / enabledMarkets) : 0;

      // Cap at 85 if any enabled market is uninstrumented
      if (hasUninstrumented && globalConfidence > 85) {
        globalConfidence = 85;
      }

      return {
        global: globalConfidence,
        futures: futuresConf.score,
        crypto: cryptoConf.score,
        capped: hasUninstrumented
      };
    }

    function computeOperatorRecommendation(broker, gates, dataFreshness, driftVerdictText, intentQuality, confidence, marketStates) {
      const futuresState = marketStates.FUTURES;
      const cryptoState = marketStates.CRYPTO;

      // Check if any enabled market is uninstrumented
      const hasUninstrumented = (MARKETS.FUTURES.enabled && !MARKETS.FUTURES.instrumented) ||
                                (MARKETS.CRYPTO.enabled && !MARKETS.CRYPTO.instrumented);

      // HALT ADVISED: Critical failures in any live market
      if (futuresState === 'DEGRADED' && (!broker.connected || broker.killing_active)) {
        return {
          text: 'HALT ADVISED',
          subtext: null,
          class: 'bad',
          symbol: '⚠'
        };
      }

      // PAUSE NEW ENTRIES: Data or drift issues
      if (dataFreshness.futures && dataFreshness.futures.status === 'STALE' || driftVerdictText === 'DEGRADING') {
        return {
          text: 'PAUSE NEW ENTRIES',
          subtext: null,
          class: 'warn',
          symbol: '⏸'
        };
      }

      // REDUCE RISK: Elevated gate pressure or low quality
      if (gates.pressure_level === 'HIGH') {
        return {
          text: 'REDUCE RISK',
          subtext: null,
          class: 'warn',
          symbol: '⚠'
        };
      }

      if (!broker.killing_active && intentQuality !== 'N/A') {
        const quality = parseInt(intentQuality);
        if (quality < 30) {
          return {
            text: 'REDUCE RISK',
            subtext: null,
            class: 'warn',
            symbol: '⚠'
          };
        }
      }

      // Market-scoped recommendations
      if (confidence.global >= 50) {
        // Check if we can say "CONTINUE TRADING" globally
        if (futuresState === 'LIVE' && (cryptoState === 'LIVE' || cryptoState === 'OFF')) {
          return {
            text: 'CONTINUE TRADING',
            subtext: null,
            class: 'ok',
            symbol: '✓'
          };
        }

        // Partial visibility - scope the recommendation
        if (futuresState === 'LIVE' && cryptoState === 'NOT_INSTRUMENTED') {
          return {
            text: 'CONTINUE FUTURES TRADING',
            subtext: 'CRYPTO VISIBILITY INCOMPLETE',
            class: 'ok',
            symbol: '✓'
          };
        }
      }

      // Default fallback
      return {
        text: 'PAUSE NEW ENTRIES',
        subtext: hasUninstrumented ? 'VISIBILITY INCOMPLETE' : null,
        class: 'warn',
        symbol: '⏸'
      };
    }

    function computeInterventionPreview(dataLagTrend, gatePressureTrend, dataFreshness) {
      // Determine what would trigger next
      let nextAction = 'None';
      let trigger = 'N/A';

      if (dataLagTrend === 'RISING') {
        nextAction = 'PAUSE NEW ENTRIES';
        trigger = 'Data Lag Trend = RISING for 3 cycles';
      } else if (gatePressureTrend === 'RISING') {
        nextAction = 'REDUCE RISK';
        trigger = 'Gate Pressure Trend = RISING for 3 cycles';
      } else if (dataFreshness.status === 'DEGRADED') {
        nextAction = 'PAUSE NEW ENTRIES';
        trigger = 'Data freshness → STALE';
      } else {
        nextAction = 'None';
        trigger = 'All systems nominal';
      }

      return { nextAction, trigger };
    }

    function generateSessionNarrative(broker, trades, gates, marketStates, evalTime, apiTimestamps) {
      // PHASE 7: Chronological narrative with timestamps
      // Returns array of {time: string, market: string, event: string}
      const events = [];

      // Session start (use earliest API timestamp or session start)
      const sessionStart = sessionTimeline.startTime;

      // Per-market trading status (explicit) - use session start as approximate time
      if (MARKETS.FUTURES.enabled) {
        if (marketStates.FUTURES === 'LIVE') {
          events.push({
            time: formatUTCCompact(sessionStart),
            market: 'FUTURES',
            event: 'Futures trading activated'
          });
        } else if (marketStates.FUTURES === 'OFF' || broker.killing_active) {
          events.push({
            time: formatUTCCompact(evalTime),
            market: 'FUTURES',
            event: 'Futures trading halted'
          });
        } else {
          events.push({
            time: formatUTCCompact(evalTime),
            market: 'FUTURES',
            event: `Futures status: ${marketStates.FUTURES}`
          });
        }
      }

      if (MARKETS.CRYPTO.enabled) {
        if (marketStates.CRYPTO === 'LIVE') {
          events.push({
            time: formatUTCCompact(sessionStart),
            market: 'CRYPTO',
            event: 'Crypto trading activated'
          });
        } else if (marketStates.CRYPTO === 'OFF') {
          events.push({
            time: formatUTCCompact(sessionStart),
            market: 'CRYPTO',
            event: 'Crypto trading disabled'
          });
        } else if (marketStates.CRYPTO === 'NOT_INSTRUMENTED') {
          events.push({
            time: formatUTCCompact(sessionStart),
            market: 'CRYPTO',
            event: 'Crypto enabled but not instrumented'
          });
        }
      }

      // Open positions (categorized by market) with their open timestamps
      if (trades.count > 0) {
        trades.trades.forEach(trade => {
          const openTime = trade.timestamp_utc ? new Date(trade.timestamp_utc) : evalTime;
          const isFutures = ['NQ', 'ES', 'MNQ', 'MES', 'YM', 'RTY'].includes(trade.symbol);
          const isCrypto = ['BTC', 'ETH', 'SOL', 'BTCUSDT', 'ETHUSDT'].includes(trade.symbol);
          const market = isFutures ? 'FUTURES' : (isCrypto ? 'CRYPTO' : 'UNKNOWN');
          events.push({
            time: formatUTCCompact(openTime),
            market: market,
            event: `Position opened (${trade.symbol})`
          });
        });
      }

      // Gate denials (use gates timestamp)
      if (gates.denials_last_hour > 0) {
        const gateTime = apiTimestamps.gates || evalTime;
        events.push({
          time: formatUTCCompact(gateTime),
          market: 'FUTURES',
          event: `${gates.denials_last_hour} gate denial${gates.denials_last_hour > 1 ? 's' : ''} recorded`
        });
      }

      // Data freshness changes (current evaluation)
      const futuresLagTrend = computeTrend(history.futures.dataLag);
      if (futuresLagTrend !== 'STABLE') {
        events.push({
          time: formatUTCCompact(evalTime),
          market: 'FUTURES',
          event: `Data freshness trending ${futuresLagTrend.toLowerCase()}`
        });
      }

      // Final status line
      events.push({
        time: formatUTCCompact(evalTime),
        market: 'SYSTEM',
        event: gates.denials_last_hour === 0 && futuresLagTrend === 'STABLE'
          ? 'No operator intervention required'
          : 'Monitor conditions'
      });

      // Sort by time (already mostly sorted, but ensure)
      events.sort((a, b) => {
        // Parse time strings back to comparable values (HH:MM:SS)
        return a.time.localeCompare(b.time);
      });

      return events;
    }

    function computeSystemVerdict(broker, gates, marketStates) {
      // Compute overall system health with market awareness
      const futuresState = marketStates.FUTURES;
      const cryptoState = marketStates.CRYPTO;

      const connected = broker.connected && broker.token_valid;
      const tradingActive = !broker.killing_active;
      const pressureOk = gates.pressure_level === 'LOW';

      // Build market status line
      let marketLine = 'Markets: ';
      if (MARKETS.FUTURES.enabled) {
        marketLine += `FUTURES ${marketStateBadge(futuresState)}`;
      }
      if (MARKETS.CRYPTO.enabled) {
        marketLine += ` | CRYPTO ${marketStateBadge(cryptoState)}`;
      }

      // Determine verdict
      const futuresHealthy = futuresState === 'LIVE';
      const cryptoHealthy = cryptoState === 'LIVE' || cryptoState === 'OFF';
      const cryptoPartial = cryptoState === 'NOT_INSTRUMENTED' || cryptoState === 'DEGRADED';

      if (futuresHealthy && cryptoHealthy && connected && tradingActive && pressureOk) {
        return {
          status: 'SAFE',
          html: `<span class="ok">SAFE TO TRADE</span><div style="font-size: 0.75em; margin-top: 4px; color: #888;">${marketLine}</div>`
        };
      } else if (futuresHealthy && cryptoPartial && connected && tradingActive && pressureOk) {
        return {
          status: 'SAFE_PARTIAL',
          html: `<span class="ok">SAFE TO TRADE</span> <span class="warn">(PARTIAL)</span><div style="font-size: 0.75em; margin-top: 4px; color: #888;">${marketLine}</div>`
        };
      } else if (!connected || broker.killing_active) {
        return {
          status: 'UNSAFE',
          html: `<span class="bad">UNSAFE — HALT ADVISED</span><div style="font-size: 0.75em; margin-top: 4px; color: #888;">${marketLine}</div>`
        };
      } else {
        return {
          status: 'DEGRADED',
          html: `<span class="warn">DEGRADED — MONITOR</span><div style="font-size: 0.75em; margin-top: 4px; color: #888;">${marketLine}</div>`
        };
      }
    }

    function computeDataFreshness(broker, trades, strategies, gates, cryptoData) {
      const now = new Date();

      // Compute per-market freshness
      function computeMarketFreshness(timestamps) {
        const validTs = timestamps.filter(Boolean);
        if (validTs.length === 0) {
          return { status: 'UNKNOWN', age: null, html: '<span class="warn">UNKNOWN</span>' };
        }

        const mostRecent = new Date(Math.max(...validTs.map(t => new Date(t))));
        const ageSeconds = (now - mostRecent) / 1000;

        let status, html;
        if (ageSeconds < 10) {
          status = 'HEALTHY';
          html = '<span class="ok">HEALTHY</span>';
        } else if (ageSeconds < 30) {
          status = 'DEGRADED';
          html = '<span class="warn">DEGRADED</span>';
        } else {
          status = 'STALE';
          html = '<span class="bad">STALE</span>';
        }

        return { status, age: ageSeconds.toFixed(1), html };
      }

      // FUTURES freshness
      const futuresTimestamps = [
        broker.timestamp_utc,
        trades.timestamp_utc,
        strategies.timestamp_utc,
        gates.timestamp_utc
      ];
      const futuresFreshness = computeMarketFreshness(futuresTimestamps);

      // CRYPTO freshness (when instrumented)
      let cryptoFreshness;
      if (MARKETS.CRYPTO.instrumented && cryptoData) {
        const cryptoTimestamps = [cryptoData.timestamp_utc];
        cryptoFreshness = computeMarketFreshness(cryptoTimestamps);
      } else if (MARKETS.CRYPTO.enabled) {
        cryptoFreshness = { status: 'NOT_INSTRUMENTED', age: null, html: '<span class="info">N/A</span>' };
      } else {
        cryptoFreshness = { status: 'OFF', age: null, html: '<span class="info">OFF</span>' };
      }

      // Global freshness (conservative - worst of enabled markets)
      let globalStatus = 'HEALTHY';
      if (futuresFreshness.status === 'STALE' || (MARKETS.CRYPTO.instrumented && cryptoFreshness.status === 'STALE')) {
        globalStatus = 'STALE';
      } else if (futuresFreshness.status === 'DEGRADED' || (MARKETS.CRYPTO.instrumented && cryptoFreshness.status === 'DEGRADED')) {
        globalStatus = 'DEGRADED';
      }

      return {
        futures: futuresFreshness,
        crypto: cryptoFreshness,
        global: globalStatus,
        // Legacy compatibility
        status: futuresFreshness.status,
        age: futuresFreshness.age,
        html: futuresFreshness.html
      };
    }

    function computeDataFreshnessLegacy(broker, trades, strategies, gates) {
      // Legacy function for backward compatibility
      const now = new Date();
      const timestamps = [
        broker.timestamp_utc,
        trades.timestamp_utc,
        strategies.timestamp_utc,
        gates.timestamp_utc
      ].filter(Boolean);

      if (timestamps.length === 0) {
        return { status: 'UNKNOWN', age: null, html: '<span class="warn">UNKNOWN</span>' };
      }

      const mostRecent = new Date(Math.max(...timestamps.map(t => new Date(t))));
      const ageSeconds = (now - mostRecent) / 1000;

      let status, html;
      if (ageSeconds < 10) {
        status = 'HEALTHY';
        html = '<span class="ok">HEALTHY</span>';
      } else if (ageSeconds < 30) {
        status = 'DEGRADED';
        html = '<span class="warn">DEGRADED</span>';
      } else {
        status = 'STALE';
        html = '<span class="bad">STALE</span>';
      }

      return { status, age: ageSeconds.toFixed(1), html };
    }

    function computeAlerts(broker, gates, dataFreshness) {
      const alerts = [];

      if (!broker.connected) alerts.push('Broker disconnected');
      if (!broker.token_valid) alerts.push('Invalid broker token');
      if (broker.killing_active) alerts.push('Trading stopped by kill directive');
      if (gates.pressure_level === 'HIGH') alerts.push('Gate pressure HIGH');
      if (gates.denials_last_hour > 5) alerts.push(`${gates.denials_last_hour} gate denials in last hour`);
      if (dataFreshness.status === 'STALE') alerts.push('Data feed is stale');

      return alerts;
    }

    async function refresh() {
      const fetchStart = Date.now();

      try {
        const [broker, trades, strategies, gates] = await Promise.all([
          fetch('/api/broker').then(r => r.json()),
          fetch('/api/trades').then(r => r.json()),
          fetch('/api/strategies').then(r => r.json()),
          fetch('/api/gates').then(r => r.json())
        ]);

        const fetchEnd = Date.now();
        const fetchDuration = fetchEnd - fetchStart;

        // ═══════════════════════════════════════════════════════════════
        // PHASE 7: Capture evaluation timestamp (single source of truth)
        // All computed values from this cycle use this timestamp
        // ═══════════════════════════════════════════════════════════════
        const evalTime = new Date();
        const evalTimeUTC = formatUTC(evalTime);
        const evalTimeCompact = formatUTCCompact(evalTime);

        // Parse API timestamps for absolute reference
        const apiTimestamps = {
          broker: parseAPITimestamp(broker.timestamp_utc),
          trades: parseAPITimestamp(trades.timestamp_utc),
          strategies: parseAPITimestamp(strategies.timestamp_utc),
          gates: parseAPITimestamp(gates.timestamp_utc)
        };

        // Compute data freshness (per-market aware)
        const dataFreshness = computeDataFreshness(broker, trades, strategies, gates, null);

        // Track historical data per market (Phase 3)
        if (dataFreshness.futures && dataFreshness.futures.age !== null) {
          addToHistory(history.futures.dataLag, parseFloat(dataFreshness.futures.age));
        }
        addToHistory(history.futures.gatePressure, gates.denials_last_hour || 0);
        addToHistory(history.fetchTiming, fetchDuration);

        // Compute market states
        const marketStates = {
          FUTURES: computeMarketState('FUTURES', broker, dataFreshness),
          CRYPTO: computeMarketState('CRYPTO', broker, dataFreshness)
        };

        // Update MARKETS object with current states
        MARKETS.FUTURES.state = marketStates.FUTURES;
        MARKETS.CRYPTO.state = marketStates.CRYPTO;

        let html = '';

        // System Verdict Panel (market-aware, timestamped)
        const verdict = computeSystemVerdict(broker, gates, marketStates);
        html += `
          <div class="panel">
            <div class="panel-header">SYSTEM VERDICT</div>
            <div class="panel-body">
              <div style="text-align: center; font-size: 1.3em; padding: 8px 0;">
                ${verdict.html}
              </div>
              <div style="text-align: center; font-size: 0.7em; color: #555; margin-top: 8px; border-top: 1px solid #222; padding-top: 8px;">
                As Of: ${evalTimeCompact}
              </div>
            </div>
          </div>
        `;

        // ═════════════════════════════════════════════════════════════════
        // PHASE 6: DECISION AUTOMATION PANELS
        // ═════════════════════════════════════════════════════════════════

        // Pre-compute values needed for Phase 6
        const dataLagTrend = computeTrend(history.dataLag);
        const gatePressureTrend = computeTrend(history.gatePressure);
        const latencyTrend = computeTrend(history.fetchTiming);

        let driftVerdictText = 'STABLE';
        if (dataLagTrend === 'RISING' && gatePressureTrend === 'RISING') {
          driftVerdictText = 'DEGRADING';
        } else if (dataLagTrend === 'RISING' || gatePressureTrend === 'RISING') {
          driftVerdictText = 'WATCH';
        }

        const intentsGenerated = strategies.intents.total_emitted;
        const intentsBlocked = strategies.intents.total_denied;
        const intentsExecuted = intentsGenerated - intentsBlocked;
        let intentQuality = 'N/A';
        if (intentsGenerated > 0) {
          const qualityPercent = ((intentsExecuted / intentsGenerated) * 100).toFixed(0);
          intentQuality = qualityPercent + '%';
        }

        const avgLatency = history.fetchTiming.length > 0
          ? (history.fetchTiming.reduce((a, b) => a + b, 0) / history.fetchTiming.length).toFixed(2)
          : 'N/A';

        let jitterLevel = 'LOW';
        if (history.fetchTiming.length >= 3) {
          const recent = history.fetchTiming.slice(-5);
          const max = Math.max(...recent);
          const min = Math.min(...recent);
          const jitter = max - min;
          if (jitter > 2000) jitterLevel = 'HIGH';
          else if (jitter > 500) jitterLevel = 'MEDIUM';
          else jitterLevel = 'LOW';
        }

        // Compute confidence (market-aware) and recommendation
        const confidence = computeSystemConfidence(broker, gates, dataFreshness, jitterLevel, intentQuality);
        const recommendation = computeOperatorRecommendation(broker, gates, dataFreshness, driftVerdictText, intentQuality, confidence, marketStates);
        const intervention = computeInterventionPreview(dataLagTrend, gatePressureTrend, dataFreshness);

        // Operator Recommendation Panel (TOP PRIORITY, timestamped)
        html += `
          <div class="panel">
            <div class="panel-header">OPERATOR RECOMMENDATION</div>
            <div class="panel-body">
              <div style="text-align: center; font-size: 1.5em; padding: 12px 0;">
                <span class="${recommendation.class}">${recommendation.symbol} ${recommendation.text}</span>
              </div>
              ${recommendation.subtext ? `<div style="text-align: center; font-size: 0.85em; color: #f90; margin-top: 4px;">${recommendation.subtext}</div>` : ''}
              <div style="text-align: center; font-size: 0.7em; color: #555; margin-top: 8px;">
                Computed At: ${evalTimeCompact}
              </div>
            </div>
          </div>
        `;

        // System Confidence Panel (market-aware, timestamped)
        let confidenceClass = 'ok';
        if (confidence.global < 50) confidenceClass = 'bad';
        else if (confidence.global < 70) confidenceClass = 'warn';

        html += `
          <div class="panel">
            <div class="panel-header">SYSTEM CONFIDENCE</div>
            <div class="panel-body">
              <div style="text-align: center; font-size: 1.8em; padding: 8px 0;">
                <span class="${confidenceClass}">${confidence.global} / 100</span>
                ${confidence.capped ? '<span style="font-size: 0.5em; color: #f90;"> (capped)</span>' : ''}
              </div>
              <div style="font-size: 0.8em; color: #666; text-align: center; margin-top: 4px;">
                FUTURES: ${confidence.futures} | CRYPTO: ${MARKETS.CRYPTO.instrumented ? confidence.crypto : 'N/A'}
              </div>
              <div style="font-size: 0.7em; color: #555; text-align: center; margin-top: 8px;">
                Evaluated At: ${evalTimeCompact}
              </div>
            </div>
          </div>
        `;

        // Intervention Preview Panel (timestamped)
        html += `
          <div class="panel">
            <div class="panel-header">IF CONDITIONS WORSEN</div>
            <div class="panel-body">
              <div class="row">
                <span class="label">Next Action</span>
                <span class="value ${intervention.nextAction !== 'None' ? 'warn' : 'ok'}">${intervention.nextAction}</span>
              </div>
              <div class="row">
                <span class="label">Trigger</span>
                <span class="value">${intervention.trigger}</span>
              </div>
              <div class="row">
                <span class="label">Evaluated At</span>
                <span class="value" style="color: #555; font-weight: normal;">${evalTimeCompact}</span>
              </div>
            </div>
          </div>
        `;

        // Session Summary Panel (chronological with timestamps)
        const narrativeEvents = generateSessionNarrative(broker, trades, gates, marketStates, evalTime, apiTimestamps);
        html += `
          <div class="panel">
            <div class="panel-header">SESSION SUMMARY (Chronological)</div>
            <div class="panel-body">
        `;

        narrativeEvents.forEach(event => {
          const marketBadge = event.market === 'FUTURES' ? '<span class="info">FUT</span>' :
                             event.market === 'CRYPTO' ? '<span class="warn">CRY</span>' :
                             '<span style="color: #666;">SYS</span>';
          html += `<div style="padding: 4px 0; color: #aaa; font-size: 0.9em;">
            <span style="color: #555;">${event.time}</span> ${marketBadge} ${event.event}
          </div>`;
        });

        html += `
            </div>
          </div>
        `;

        // Broker Status Panel (timestamped)
        const brokerAsOf = apiTimestamps.broker ? formatUTCCompact(apiTimestamps.broker) : evalTimeCompact;
        html += `
          <div class="panel">
            <div class="panel-header">BROKER STATUS</div>
            <div class="panel-body">
              <div class="row">
                <span class="label">Broker</span>
                <span class="value">${broker.broker.toUpperCase()}</span>
              </div>
              <div class="row">
                <span class="label">Connection</span>
                <span class="value">${statusBadge(broker.connected, broker.token_valid)}</span>
              </div>
              <div class="row">
                <span class="label">Trading Status</span>
                <span class="value">${broker.killing_active ? '<span class="bad">STOPPED</span>' : '<span class="ok">ACTIVE</span>'}</span>
              </div>
              <div class="row">
                <span class="label">Active Directive ID</span>
                <span class="value">${broker.active_directive_id || 'N/A'}</span>
              </div>
              <div class="row">
                <span class="label">As Of</span>
                <span class="value" style="color: #555; font-weight: normal;">${brokerAsOf}</span>
              </div>
            </div>
          </div>
        `;

        // Live Positions Panel
        html += `
          <div class="panel">
            <div class="panel-header">LIVE POSITIONS (${trades.count})</div>
            <div class="panel-body">
        `;

        if (trades.count > 0) {
          trades.trades.forEach(trade => {
            const tradeOpenedAt = trade.timestamp_utc ? formatUTC(new Date(trade.timestamp_utc)) : 'N/A';
            html += `
              <div class="trade-item">
                <div class="trade-header">${trade.strategy} - ${trade.symbol} (${trade.state})</div>
                <div class="trade-row">
                  <span class="label">Entry Price</span>
                  <span class="value">${trade.entry_price}</span>
                </div>
                <div class="trade-row">
                  <span class="label">Stop Loss</span>
                  <span class="value">${trade.stop_loss}</span>
                </div>
                <div class="trade-row">
                  <span class="label">Take Profit</span>
                  <span class="value">${trade.take_profit}</span>
                </div>
                <div class="trade-row">
                  <span class="label">Quantity</span>
                  <span class="value">${trade.quantity}</span>
                </div>
                <div class="trade-row">
                  <span class="label">Opened At</span>
                  <span class="value" style="color: #555; font-weight: normal; font-size: 0.85em;">${tradeOpenedAt}</span>
                </div>
              </div>
            `;
          });
        } else {
          html += '<div style="text-align: center; color: #666; padding: 20px;">No active positions</div>';
        }

        html += `
            </div>
          </div>
        `;

        // Strategy Seeding Panel
        html += `
          <div class="panel">
            <div class="panel-header">STRATEGY SEEDING</div>
            <div class="panel-body">
              <div class="row">
                <span class="label">Total Seeded</span>
                <span class="value">${strategies.seeding.total_seeded}</span>
              </div>
              <div class="row">
                <span class="label">Seeding Failures</span>
                <span class="value ${strategies.seeding.seeding_failures > 0 ? 'warn' : ''}">${strategies.seeding.seeding_failures}</span>
              </div>
              <div class="row">
                <span class="label">Promotions to Live</span>
                <span class="value">${strategies.promotions.total_to_live}</span>
              </div>
              <div class="row">
                <span class="label">Intents Emitted</span>
                <span class="value">${strategies.intents.total_emitted}</span>
              </div>
              <div class="row">
                <span class="label">Intents Denied</span>
                <span class="value ${strategies.intents.total_denied > 0 ? 'warn' : ''}">${strategies.intents.total_denied}</span>
              </div>
        `;

        if (strategies.seeding.entry_types) {
          html += '<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #222;">';
          html += '<div class="label" style="margin-bottom: 8px;">Entry Types:</div>';
          html += '<div class="entry-types">';

          const entries = Object.entries(strategies.seeding.entry_types)
            .sort((a, b) => b[1] - a[1]);

          entries.forEach(([type, count]) => {
            html += `
              <div class="entry-type">
                <span>${type}</span>
                <span class="value">${count}</span>
              </div>
            `;
          });

          html += '</div></div>';
        }

        html += `
            </div>
          </div>
        `;

        // Gate Pressure Panel
        html += `
          <div class="panel">
            <div class="panel-header">GATE PRESSURE</div>
            <div class="panel-body">
              <div class="row">
                <span class="label">Pressure Level</span>
                <span class="value">${pressureColor(gates.pressure_level)}</span>
              </div>
              <div class="row">
                <span class="label">Total Denials</span>
                <span class="value">${gates.total_denials}</span>
              </div>
              <div class="row">
                <span class="label">Denials (Last Hour)</span>
                <span class="value">${gates.denials_last_hour}</span>
              </div>
        `;

        if (gates.by_gate && Object.keys(gates.by_gate).length > 0) {
          html += '<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #222;">';
          html += '<div class="label" style="margin-bottom: 8px;">Denials by Gate:</div>';

          Object.entries(gates.by_gate).forEach(([gate, count]) => {
            html += `
              <div class="row">
                <span class="label" style="padding-left: 16px;">${gate}</span>
                <span class="value warn">${count}</span>
              </div>
            `;
          });

          html += '</div>';
        }

        if (gates.by_reason && Object.keys(gates.by_reason).length > 0) {
          html += '<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #222;">';
          html += '<div class="label" style="margin-bottom: 8px;">Denials by Reason:</div>';

          Object.entries(gates.by_reason).forEach(([reason, count]) => {
            html += `
              <div class="row">
                <span class="label" style="padding-left: 16px;">${reason}</span>
                <span class="value warn">${count}</span>
              </div>
            `;
          });

          html += '</div>';
        }

        // Add timestamp
        const gatesAsOf = apiTimestamps.gates ? formatUTCCompact(apiTimestamps.gates) : evalTimeCompact;
        html += `
              <div class="row" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #222;">
                <span class="label">As Of</span>
                <span class="value" style="color: #555; font-weight: normal;">${gatesAsOf}</span>
              </div>
            </div>
          </div>
        `;

        // Strategy Activity Panel (timestamped)
        const strategiesAsOf = apiTimestamps.strategies ? formatUTCCompact(apiTimestamps.strategies) : evalTimeCompact;
        html += `
          <div class="panel">
            <div class="panel-header">STRATEGY ACTIVITY</div>
            <div class="panel-body">
              <div class="row">
                <span class="label">Intents Generated</span>
                <span class="value">${strategies.intents.total_emitted}</span>
              </div>
              <div class="row">
                <span class="label">Intents Blocked</span>
                <span class="value ${strategies.intents.total_denied > 0 ? 'warn' : ''}">${strategies.intents.total_denied}</span>
              </div>
              <div class="row">
                <span class="label">Open Positions</span>
                <span class="value">${trades.count}</span>
              </div>
              <div class="row">
                <span class="label">As Of</span>
                <span class="value" style="color: #555; font-weight: normal;">${strategiesAsOf}</span>
              </div>
            </div>
          </div>
        `;

        // Data Freshness Panel (per-market with absolute timestamps)
        // Get the most recent futures API timestamp for absolute reference
        const futuresLastUpdate = [apiTimestamps.broker, apiTimestamps.trades, apiTimestamps.strategies, apiTimestamps.gates]
          .filter(Boolean)
          .sort((a, b) => b - a)[0];
        const futuresLastUpdateStr = futuresLastUpdate ? formatUTCCompact(futuresLastUpdate) : 'N/A';

        html += `
          <div class="panel">
            <div class="panel-header">DATA FRESHNESS</div>
            <div class="panel-body">
              <div class="row">
                <span class="label">FUTURES</span>
                <span class="value">${dataFreshness.futures.age ? dataFreshness.futures.age + 's ago' : 'N/A'} ${dataFreshness.futures.html}</span>
              </div>
              <div class="row" style="padding-left: 16px;">
                <span class="label" style="font-size: 0.85em;">Last Update</span>
                <span class="value" style="color: #555; font-weight: normal; font-size: 0.85em;">${futuresLastUpdateStr}</span>
              </div>
              <div class="row">
                <span class="label">CRYPTO</span>
                <span class="value">${dataFreshness.crypto.html}</span>
              </div>
              <div class="row">
                <span class="label">Global</span>
                <span class="value"><span class="${dataFreshness.global === 'HEALTHY' ? 'ok' : dataFreshness.global === 'STALE' ? 'bad' : 'warn'}">${dataFreshness.global}</span></span>
              </div>
              <div class="row">
                <span class="label">Evaluated At</span>
                <span class="value" style="color: #555; font-weight: normal;">${evalTimeCompact}</span>
              </div>
            </div>
          </div>
        `;

        // Alerts Panel (timestamped)
        const alerts = computeAlerts(broker, gates, dataFreshness);
        html += `
          <div class="panel">
            <div class="panel-header">ALERTS</div>
            <div class="panel-body">
        `;

        if (alerts.length === 0) {
          html += '<div style="text-align: center; color: #0f0; padding: 12px;">None active ✓</div>';
        } else {
          alerts.forEach(alert => {
            html += `<div class="row"><span class="value bad">${alert}</span></div>`;
          });
        }

        html += `
              <div style="text-align: right; font-size: 0.75em; color: #555; margin-top: 8px; padding-top: 8px; border-top: 1px solid #222;">
                As Of: ${evalTimeCompact}
              </div>
            </div>
          </div>
        `;

        // ═════════════════════════════════════════════════════════════════
        // PHASE 3: PREDICTIVE INSTRUMENTS
        // ═════════════════════════════════════════════════════════════════

        // System Drift Panel (per-market aware)
        let driftVerdictClass = 'ok';
        if (driftVerdictText === 'DEGRADING' || driftVerdictText === 'WATCH') {
          driftVerdictClass = 'warn';
        }

        // Compute per-market drift status
        const futuresDriftStatus = marketStates.FUTURES === 'LIVE' ? driftVerdictText : marketStates.FUTURES;
        const cryptoDriftStatus = MARKETS.CRYPTO.instrumented ? 'STABLE' : 'N/A';

        html += `
          <div class="panel">
            <div class="panel-header">SYSTEM DRIFT</div>
            <div class="panel-body">
              <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #222;">
                <div style="color: #0cf; font-size: 0.85em; margin-bottom: 4px;">FUTURES</div>
                <div class="row">
                  <span class="label">Data Lag</span>
                  <span class="value">${trendBadge(dataLagTrend, true)}</span>
                </div>
                <div class="row">
                  <span class="label">Gate Pressure</span>
                  <span class="value">${trendBadge(gatePressureTrend, true)}</span>
                </div>
                <div class="row">
                  <span class="label">Status</span>
                  <span class="value"><span class="${futuresDriftStatus === 'STABLE' ? 'ok' : 'warn'}">${futuresDriftStatus}</span></span>
                </div>
              </div>
              <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #222;">
                <div style="color: #0cf; font-size: 0.85em; margin-bottom: 4px;">CRYPTO</div>
                <div class="row">
                  <span class="label">Status</span>
                  <span class="value"><span class="info">${cryptoDriftStatus}</span></span>
                </div>
              </div>
              <div class="row">
                <span class="label">API Latency</span>
                <span class="value">${trendBadge(latencyTrend, true)}</span>
              </div>
              <div class="row">
                <span class="label">Global Verdict</span>
                <span class="value"><span class="${driftVerdictClass}">${driftVerdictText}</span></span>
              </div>
              <div class="row">
                <span class="label">Evaluated At</span>
                <span class="value" style="color: #555; font-weight: normal;">${evalTimeCompact}</span>
              </div>
            </div>
          </div>
        `;

        // Intent Quality Ratio Panel (values already computed in Phase 6)
        let qualityStatus = '';
        if (intentQuality !== 'N/A') {
          const q = parseInt(intentQuality);
          if (q >= 70) qualityStatus = 'ok';
          else if (q >= 40) qualityStatus = 'warn';
          else qualityStatus = 'bad';
        }

        html += `
          <div class="panel">
            <div class="panel-header">INTENT QUALITY (Session)</div>
            <div class="panel-body">
              <div class="row">
                <span class="label">Generated</span>
                <span class="value">${intentsGenerated}</span>
              </div>
              <div class="row">
                <span class="label">Executed</span>
                <span class="value">${intentsExecuted}</span>
              </div>
              <div class="row">
                <span class="label">Quality</span>
                <span class="value ${qualityStatus}">${intentQuality}</span>
              </div>
              <div class="row">
                <span class="label">As Of</span>
                <span class="value" style="color: #555; font-weight: normal;">${evalTimeCompact}</span>
              </div>
            </div>
          </div>
        `;

        // Last Signal Timer Panel (with absolute timestamp anchor)
        let lastSignalTime = 'UNKNOWN';
        let lastSignalAbsolute = 'N/A';
        let signalStatus = '<span class="info">UNKNOWN</span>';

        if (trades.count > 0 && trades.trades[0].timestamp_utc) {
          const tradeTime = new Date(trades.trades[0].timestamp_utc);
          const secondsSince = (evalTime - tradeTime) / 1000;
          lastSignalTime = formatDuration(secondsSince);
          lastSignalAbsolute = formatUTC(tradeTime);

          if (secondsSince < 1800) {  // < 30 min
            signalStatus = '<span class="ok">NORMAL</span>';
          } else if (secondsSince < 7200) {  // < 2 hours
            signalStatus = '<span class="warn">QUIET</span>';
          } else {
            signalStatus = '<span class="bad">SUSPICIOUSLY QUIET</span>';
          }
        }

        html += `
          <div class="panel">
            <div class="panel-header">LAST STRATEGY SIGNAL</div>
            <div class="panel-body">
              <div class="row">
                <span class="label">Time Since</span>
                <span class="value">${lastSignalTime}</span>
              </div>
              <div class="row">
                <span class="label">Last Signal At</span>
                <span class="value" style="color: #555; font-weight: normal; font-size: 0.85em;">${lastSignalAbsolute}</span>
              </div>
              <div class="row">
                <span class="label">Expected</span>
                <span class="value">${signalStatus}</span>
              </div>
            </div>
          </div>
        `;

        // ═════════════════════════════════════════════════════════════════
        // PHASE 4: EXPLAIN SURPRISE
        // ═════════════════════════════════════════════════════════════════

        // Last Rejected Intent Panel (if any rejections, timestamped)
        if (gates.by_gate && Object.keys(gates.by_gate).length > 0) {
          const lastGate = Object.keys(gates.by_gate)[0];
          const lastReason = gates.by_reason ? Object.keys(gates.by_reason)[0] : 'Unknown';
          // Use gates timestamp as the "At" time (best available proxy)
          const gateEventAt = apiTimestamps.gates ? formatUTC(apiTimestamps.gates) : 'N/A';

          html += `
            <div class="panel">
              <div class="panel-header">LAST BLOCKED INTENT</div>
              <div class="panel-body">
                <div class="row">
                  <span class="label">Strategy</span>
                  <span class="value">N/A</span>
                </div>
                <div class="row">
                  <span class="label">Gate</span>
                  <span class="value warn">${lastGate}</span>
                </div>
                <div class="row">
                  <span class="label">Reason</span>
                  <span class="value">${lastReason}</span>
                </div>
                <div class="row">
                  <span class="label">At</span>
                  <span class="value" style="color: #555; font-weight: normal; font-size: 0.85em;">${gateEventAt}</span>
                </div>
              </div>
            </div>
          `;
        }

        // Position Confidence Panel (if open positions, timestamped)
        if (trades.count > 0) {
          const trade = trades.trades[0];  // First position

          // Calculate distance to stop (as percentage of range)
          const entry = trade.entry_price;
          const stop = trade.stop_loss;
          const target = trade.take_profit;

          // Assuming current price is near entry for now (would need live price feed)
          // For demonstration, we'll calculate theoretical distance
          const range = Math.abs(target - entry);
          const risk = Math.abs(entry - stop);
          const distanceToStop = ((risk / range) * 100).toFixed(0);

          let riskStatus = 'ACCEPTABLE';
          let riskColor = 'ok';
          if (parseFloat(distanceToStop) > 70) {
            riskStatus = 'MARGINAL';
            riskColor = 'warn';
          }
          if (parseFloat(distanceToStop) > 90) {
            riskStatus = 'CRITICAL';
            riskColor = 'bad';
          }

          html += `
            <div class="panel">
              <div class="panel-header">OPEN POSITION HEALTH</div>
              <div class="panel-body">
                <div class="row">
                  <span class="label">Symbol</span>
                  <span class="value">${trade.symbol}</span>
                </div>
                <div class="row">
                  <span class="label">Distance to Stop</span>
                  <span class="value">${distanceToStop}%</span>
                </div>
                <div class="row">
                  <span class="label">Exit Engine</span>
                  <span class="value ok">ARMED</span>
                </div>
                <div class="row">
                  <span class="label">Risk Status</span>
                  <span class="value ${riskColor}">${riskStatus}</span>
                </div>
                <div class="row">
                  <span class="label">Evaluated At</span>
                  <span class="value" style="color: #555; font-weight: normal;">${evalTimeCompact}</span>
                </div>
              </div>
            </div>
          `;
        }

        // ═════════════════════════════════════════════════════════════════
        // PHASE 5: OPERATOR TRUST
        // ═════════════════════════════════════════════════════════════════

        // Heartbeat Integrity Panel (values already computed in Phase 6, timestamped)
        let jitterLevelHtml = '<span class="ok">LOW</span>';
        if (jitterLevel === 'HIGH') jitterLevelHtml = '<span class="bad">HIGH</span>';
        else if (jitterLevel === 'MEDIUM') jitterLevelHtml = '<span class="warn">MEDIUM</span>';

        html += `
          <div class="panel">
            <div class="panel-header">CONTROL LOOP</div>
            <div class="panel-body">
              <div class="row">
                <span class="label">Last Cycle</span>
                <span class="value">${avgLatency !== 'N/A' ? avgLatency + 'ms' : 'N/A'}</span>
              </div>
              <div class="row">
                <span class="label">Jitter</span>
                <span class="value">${jitterLevelHtml}</span>
              </div>
              <div class="row">
                <span class="label">As Of</span>
                <span class="value" style="color: #555; font-weight: normal;">${evalTimeCompact}</span>
              </div>
            </div>
          </div>
        `;

        // Auto-Kill Readiness Panel (timestamped)
        html += `
          <div class="panel">
            <div class="panel-header">AUTO SAFETY</div>
            <div class="panel-body">
              <div class="row">
                <span class="label">Enabled</span>
                <span class="value info">NO</span>
              </div>
              <div class="row">
                <span class="label">Armed</span>
                <span class="value info">NO</span>
              </div>
              <div class="row">
                <span class="label">Evaluated At</span>
                <span class="value" style="color: #555; font-weight: normal;">${evalTimeCompact}</span>
              </div>
            </div>
          </div>
        `;

        document.getElementById('content').innerHTML = html;

        // Update footer (with UTC timestamp)
        document.getElementById('footer').innerHTML = `
          Last Updated: ${evalTimeUTC} | Auto-refresh: 5 seconds
        `;

      } catch (err) {
        document.getElementById('content').innerHTML = `
          <div class="panel">
            <div class="panel-header">ERROR</div>
            <div class="panel-body">
              <div style="color: #f33;">Unable to reach metrics API</div>
              <div style="color: #666; margin-top: 8px;">${err.toString()}</div>
            </div>
          </div>
        `;
      }
    }

    // Initial load
    refresh();

    // Auto-refresh every 5 seconds
    setInterval(refresh, 5000);
  </script>
</body>
</html>
"""


# ═══════════════════════════════════════════════════════════════════════════
# ROUTES
# ═══════════════════════════════════════════════════════════════════════════

@app.route('/')
def index():
    """Main dashboard page"""
    from flask import make_response
    response = make_response(render_template_string(DASHBOARD_HTML))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'dashboard_server',
        'timestamp': datetime.utcnow().isoformat(),
        'version': '4.0.0-temporal'
    }), 200


@app.route('/api/broker', methods=['GET'])
def get_broker():
    """Proxy to metrics API - broker status"""
    try:
        response = requests.get(f"{METRICS_API_URL}/brokers/status", timeout=3)
        return jsonify(response.json()), response.status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/trades', methods=['GET'])
def get_trades():
    """Proxy to metrics API - live trades"""
    try:
        response = requests.get(f"{METRICS_API_URL}/trades/live", timeout=3)
        return jsonify(response.json()), response.status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/strategies', methods=['GET'])
def get_strategies():
    """Proxy to metrics API - strategy proving/seeding"""
    try:
        response = requests.get(f"{METRICS_API_URL}/strategies/proving", timeout=3)
        return jsonify(response.json()), response.status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/gates', methods=['GET'])
def get_gates():
    """Proxy to metrics API - gate pressure"""
    try:
        response = requests.get(f"{METRICS_API_URL}/metrics/gate-pressure", timeout=3)
        return jsonify(response.json()), response.status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ═══════════════════════════════════════════════════════════════════════════
# SERVER CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    import logging

    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    logger = logging.getLogger(__name__)
    logger.info("Starting AlgoTrendy Terminal Dashboard Server on port 5000")

    # Run Flask server
    # IMPORTANT: Only bind to localhost for security
    # SSH tunneling will make it accessible locally
    app.run(
        host='127.0.0.1',  # Only localhost - not exposed to internet
        port=5000,
        debug=False,
        threaded=True
    )
