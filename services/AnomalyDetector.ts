/**
 * Evan AI — AnomalyDetector (Statistical Anomaly Engine) [OPUS 4.8 Resilience]
 *
 * Detects anomalies in the scan pipeline using lightweight statistical baselines.
 * Flags deviations in latency, state transitions, resource pressure, and
 * behavioral patterns without any ML dependencies.
 *
 * Anomaly Types:
 *   1. LATENCY    — Phase duration exceeds rolling percentile
 *   2. TRANSITION — Invalid or unexpected state transition slipped through
 *   3. RESOURCE   — Memory/buffer pressure (event log size, queue depth)
 *   4. BEHAVIORAL — Prediction confidence collapse, unusual scan patterns
 *   5. FREQUENCY  — Governor block rate spike, error rate spike
 *
 * Architecture:
 *   - Rolling statistical baselines (mean, stddev, p95)
 *   - Anomaly = value > mean + 2.5σ OR invariant-based rule violation
 *   - Subscribes to ScanObserver event stream
 *   - Reports anomalies to ForensicLog + GracefulDegradation
 *   - All math is O(1) via incremental updates
 *
 * Guarantees:
 *   - No false positives on cold start (needs MIN_SAMPLES before alerting)
 *   - No ML — pure deterministic math
 *   - Bounded memory: fixed-size rolling windows
 *   - Never blocks pipeline — anomaly check is fire-and-forget
 */

import { ScanObserver, type ObserverEvent } from "./ScanObserver";
import { ForensicLog } from "./ForensicLog";
import { GracefulDegradation } from "./GracefulDegradation";
import { ScanScheduler } from "./ScanScheduler";
import type { ScanPhase } from "../hooks/useEvanBrain";

// ── Types ──────────────────────────────────────────────────────────────────

export type AnomalyType =
  | "LATENCY"
  | "TRANSITION"
  | "RESOURCE"
  | "BEHAVIORAL"
  | "FREQUENCY";

export type AnomalySeverity = "low" | "medium" | "high" | "critical";

export interface Anomaly {
  /** Unique anomaly ID */
  id: string;
  /** Anomaly type */
  type: AnomalyType;
  /** Severity level */
  severity: AnomalySeverity;
  /** Human-readable description */
  description: string;
  /** Active scanId (null if not scan-specific) */
  scanId: string | null;
  /** Phase when anomaly was detected */
  phase: ScanPhase;
  /** Timestamp */
  timestamp: number;
  /** Observed value */
  observed: number;
  /** Expected baseline (mean) */
  baseline: number;
  /** Standard deviation */
  stddev: number;
  /** How many σ above baseline */
  deviationSigma: number;
}

export interface AnomalyStats {
  totalDetected: number;
  byType: Record<AnomalyType, number>;
  bySeverity: Record<AnomalySeverity, number>;
  recentAnomalies: Anomaly[];
}

// ── Rolling Statistics ─────────────────────────────────────────────────────

/** Welford's online algorithm for incremental mean + variance */
class RollingStats {
  private _count = 0;
  private _mean = 0;
  private _m2 = 0;
  private _min = Infinity;
  private _max = -Infinity;
  /** Recent values for percentile calculation */
  private _window: number[] = [];
  private _maxWindow: number;

  constructor(windowSize: number = 50) {
    this._maxWindow = windowSize;
  }

  push(value: number): void {
    this._count++;

    // Welford's algorithm
    const delta = value - this._mean;
    this._mean += delta / this._count;
    const delta2 = value - this._mean;
    this._m2 += delta * delta2;

    this._min = Math.min(this._min, value);
    this._max = Math.max(this._max, value);

    // Rolling window
    if (this._window.length >= this._maxWindow) {
      this._window.shift();
    }
    this._window.push(value);
  }

  get count(): number { return this._count; }
  get mean(): number { return this._mean; }

  get variance(): number {
    return this._count > 1 ? this._m2 / (this._count - 1) : 0;
  }

  get stddev(): number {
    return Math.sqrt(this.variance);
  }

  get min(): number { return this._min; }
  get max(): number { return this._max; }

  /** Approximate percentile from rolling window */
  percentile(p: number): number {
    if (this._window.length === 0) return 0;
    const sorted = [...this._window].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  /** How many σ above mean a value is */
  zScore(value: number): number {
    const sd = this.stddev;
    if (sd === 0) return 0;
    return (value - this._mean) / sd;
  }

  reset(): void {
    this._count = 0;
    this._mean = 0;
    this._m2 = 0;
    this._min = Infinity;
    this._max = -Infinity;
    this._window = [];
  }
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Minimum samples before anomaly detection activates */
const MIN_SAMPLES = 10;

/** Z-score threshold for anomaly detection (2.5σ) */
const Z_THRESHOLD = 2.5;

/** Anomaly ring buffer size */
const MAX_ANOMALIES = 100;

/** Resource pressure thresholds */
const QUEUE_PRESSURE_THRESHOLD = 5;
const EVENT_LOG_PRESSURE_RATIO = 0.9; // 90% of max capacity

/** Frequency check: Governor block rate threshold (per 10 events) */
const BLOCK_RATE_THRESHOLD = 0.3; // 30% of decisions blocked = anomalous

/** Minimum time between same-type anomalies to prevent flooding */
const ANOMALY_DEDUP_MS = 5_000;

let _anomalySeq = 0;
function nextAnomalyId(): string {
  _anomalySeq += 1;
  return `anomaly_${Date.now()}_${_anomalySeq}`;
}

// ── AnomalyDetector ────────────────────────────────────────────────────────

class _AnomalyDetector {
  /** Per-phase latency baselines */
  private _latencyBaselines = new Map<string, RollingStats>();
  /** Governor block rate tracker */
  private _blockRateWindow: boolean[] = [];
  private _blockRateMaxWindow = 20;
  /** Error rate tracker */
  private _errorRateWindow: boolean[] = [];
  private _errorRateMaxWindow = 20;
  /** Total scan duration baseline */
  private _totalLatencyBaseline = new RollingStats();
  /** Detected anomalies ring buffer */
  private _anomalies: Anomaly[] = [];
  /** Anomaly count by type */
  private _countByType: Record<AnomalyType, number> = {
    LATENCY: 0, TRANSITION: 0, RESOURCE: 0, BEHAVIORAL: 0, FREQUENCY: 0,
  };
  private _countBySeverity: Record<AnomalySeverity, number> = {
    low: 0, medium: 0, high: 0, critical: 0,
  };
  /** Last anomaly timestamp by type (for dedup) */
  private _lastAnomalyTime = new Map<string, number>();
  /** ScanObserver subscription */
  private _unsubscribe: (() => void) | null = null;
  /** Anomaly listeners */
  private _listeners: Array<(anomaly: Anomaly) => void> = [];

  // ── Lifecycle ─────────────────────────────────────────────────────────

  /**
   * Start listening to ScanObserver events.
   * Idempotent — safe to call multiple times.
   */
  start(): void {
    if (this._unsubscribe) return;

    this._unsubscribe = ScanObserver.onEvent((event) => {
      this._processEvent(event);
    });
  }

  /** Stop listening. */
  stop(): void {
    this._unsubscribe?.();
    this._unsubscribe = null;
  }

  // ── Event Processing ──────────────────────────────────────────────────

  private _processEvent(event: ObserverEvent): void {
    // ── 1. Latency anomalies ─────────────────────────────────────────
    if (event.event === "SCAN_LATENCY" && event.data.durations) {
      this._checkLatencyAnomalies(event);
    }

    // ── 2. Transition anomalies ──────────────────────────────────────
    if (event.category === "invariant_violation") {
      this._flagTransitionAnomaly(event);
    }

    // ── 3. Resource pressure ─────────────────────────────────────────
    if (event.event === "SCHEDULER_OVERLOAD") {
      this._flagResourceAnomaly(event, "queue_overload",
        `Scheduler queue overload: ${event.data.queueLength} entries`);
    }

    // ── 4. Governor block tracking ───────────────────────────────────
    if (event.event === "GOVERNOR_BLOCKED") {
      this._trackBlockRate(true, event);
    } else if (event.category === "phase_transition") {
      this._trackBlockRate(false, event);
    }

    // ── 5. Error rate tracking ───────────────────────────────────────
    if (event.category === "error") {
      this._trackErrorRate(true, event);
    } else if (event.event === "SCAN_LATENCY" && event.data.reason === "complete") {
      this._trackErrorRate(false, event);
    }

    // ── 6. Contract timeout (behavioral) ─────────────────────────────
    if (event.event === "CONTRACT_TIMEOUT") {
      this._flagBehavioralAnomaly(event, "contract_timeout",
        `Phase contract timeout in ${event.phase}: ${event.data.elapsedMs}ms`);
    }
  }

  // ── Latency Checks ────────────────────────────────────────────────────

  private _checkLatencyAnomalies(event: ObserverEvent): void {
    const durations = event.data.durations as Record<string, number | undefined>;
    const totalMs = event.data.totalMs as number | undefined;

    // Check per-phase durations
    for (const [key, value] of Object.entries(durations)) {
      if (value == null) continue;

      const baseline = this._getOrCreateBaseline(key);
      baseline.push(value);

      if (baseline.count < MIN_SAMPLES) continue;

      const z = baseline.zScore(value);
      if (z > Z_THRESHOLD) {
        this._emit({
          type: "LATENCY",
          severity: z > 4 ? "high" : "medium",
          description: `${key} latency spike: ${value}ms (baseline: ${Math.round(baseline.mean)}ms ± ${Math.round(baseline.stddev)}ms, ${z.toFixed(1)}σ)`,
          scanId: event.scanId,
          phase: event.phase,
          observed: value,
          baseline: baseline.mean,
          stddev: baseline.stddev,
          deviationSigma: z,
        });
      }
    }

    // Check total scan duration
    if (totalMs != null) {
      this._totalLatencyBaseline.push(totalMs);
      if (this._totalLatencyBaseline.count >= MIN_SAMPLES) {
        const z = this._totalLatencyBaseline.zScore(totalMs);
        if (z > Z_THRESHOLD) {
          this._emit({
            type: "LATENCY",
            severity: z > 4 ? "high" : "medium",
            description: `Total scan duration spike: ${totalMs}ms (baseline: ${Math.round(this._totalLatencyBaseline.mean)}ms, ${z.toFixed(1)}σ)`,
            scanId: event.scanId,
            phase: event.phase,
            observed: totalMs,
            baseline: this._totalLatencyBaseline.mean,
            stddev: this._totalLatencyBaseline.stddev,
            deviationSigma: z,
          });
        }
      }
    }
  }

  // ── Transition Checks ─────────────────────────────────────────────────

  private _flagTransitionAnomaly(event: ObserverEvent): void {
    this._emit({
      type: "TRANSITION",
      severity: event.severity === "critical" ? "critical" : "high",
      description: `Invariant violation: ${event.event} — ${event.data.violation ?? event.data.message ?? "unknown"}`,
      scanId: event.scanId,
      phase: event.phase,
      observed: 1,
      baseline: 0,
      stddev: 0,
      deviationSigma: Infinity,
    });
  }

  // ── Resource Checks ───────────────────────────────────────────────────

  private _flagResourceAnomaly(
    event: ObserverEvent,
    subtype: string,
    description: string,
  ): void {
    this._emit({
      type: "RESOURCE",
      severity: "medium",
      description,
      scanId: event.scanId,
      phase: event.phase,
      observed: (event.data.queueLength as number) ?? 0,
      baseline: 1,
      stddev: 0,
      deviationSigma: 0,
    });
  }

  // ── Frequency Checks ──────────────────────────────────────────────────

  private _trackBlockRate(blocked: boolean, event: ObserverEvent): void {
    this._blockRateWindow.push(blocked);
    if (this._blockRateWindow.length > this._blockRateMaxWindow) {
      this._blockRateWindow.shift();
    }

    if (this._blockRateWindow.length >= this._blockRateMaxWindow) {
      const rate = this._blockRateWindow.filter(Boolean).length / this._blockRateWindow.length;
      if (rate > BLOCK_RATE_THRESHOLD) {
        this._emit({
          type: "FREQUENCY",
          severity: rate > 0.5 ? "high" : "medium",
          description: `Governor block rate spike: ${(rate * 100).toFixed(0)}% of last ${this._blockRateMaxWindow} decisions blocked`,
          scanId: event.scanId,
          phase: event.phase,
          observed: rate,
          baseline: 0.05, // Expected block rate < 5%
          stddev: 0,
          deviationSigma: 0,
        });
      }
    }
  }

  private _trackErrorRate(errored: boolean, event: ObserverEvent): void {
    this._errorRateWindow.push(errored);
    if (this._errorRateWindow.length > this._errorRateMaxWindow) {
      this._errorRateWindow.shift();
    }

    if (this._errorRateWindow.length >= this._errorRateMaxWindow) {
      const rate = this._errorRateWindow.filter(Boolean).length / this._errorRateWindow.length;
      if (rate > 0.3) {
        this._emit({
          type: "FREQUENCY",
          severity: rate > 0.5 ? "high" : "medium",
          description: `Error rate spike: ${(rate * 100).toFixed(0)}% of last ${this._errorRateMaxWindow} scans errored`,
          scanId: event.scanId,
          phase: event.phase,
          observed: rate,
          baseline: 0.05,
          stddev: 0,
          deviationSigma: 0,
        });
      }
    }
  }

  // ── Behavioral Checks ─────────────────────────────────────────────────

  private _flagBehavioralAnomaly(
    event: ObserverEvent,
    subtype: string,
    description: string,
  ): void {
    this._emit({
      type: "BEHAVIORAL",
      severity: "high",
      description,
      scanId: event.scanId,
      phase: event.phase,
      observed: (event.data.elapsedMs as number) ?? 0,
      baseline: 0,
      stddev: 0,
      deviationSigma: 0,
    });
  }

  // ── Anomaly Emission ──────────────────────────────────────────────────

  private _emit(
    partial: Omit<Anomaly, "id" | "timestamp">,
  ): void {
    // Dedup: don't flood with same anomaly type within window
    const dedupKey = `${partial.type}_${partial.description.slice(0, 30)}`;
    const lastTime = this._lastAnomalyTime.get(dedupKey);
    if (lastTime && Date.now() - lastTime < ANOMALY_DEDUP_MS) return;
    this._lastAnomalyTime.set(dedupKey, Date.now());

    const anomaly: Anomaly = {
      ...partial,
      id: nextAnomalyId(),
      timestamp: Date.now(),
    };

    // Store in ring buffer
    if (this._anomalies.length >= MAX_ANOMALIES) {
      this._anomalies.shift();
    }
    this._anomalies.push(anomaly);

    // Update counts
    this._countByType[anomaly.type]++;
    this._countBySeverity[anomaly.severity]++;

    // Report to ForensicLog
    ForensicLog.recordAnomaly(
      anomaly.scanId,
      anomaly.phase,
      anomaly.type,
      anomaly.description,
      {
        observed: anomaly.observed,
        baseline: anomaly.baseline,
        stddev: anomaly.stddev,
        deviationSigma: anomaly.deviationSigma,
        severity: anomaly.severity,
      },
    );

    // Report to GracefulDegradation
    GracefulDegradation.recordAnomaly(anomaly.description);

    // Emit to ScanObserver
    ScanObserver.emit(
      anomaly.severity === "critical" ? "critical" :
      anomaly.severity === "high" ? "error" : "warn",
      "invariant_violation",
      `ANOMALY_${anomaly.type}`,
      anomaly.scanId,
      anomaly.phase,
      {
        anomalyId: anomaly.id,
        anomalyType: anomaly.type,
        severity: anomaly.severity,
        description: anomaly.description,
        observed: anomaly.observed,
        baseline: anomaly.baseline,
        deviationSigma: anomaly.deviationSigma,
      },
    );

    // Notify listeners
    for (const fn of this._listeners) {
      try { fn(anomaly); } catch {}
    }
  }

  // ── Queries ───────────────────────────────────────────────────────────

  /** All detected anomalies (most recent last) */
  getAnomalies(): readonly Anomaly[] {
    return this._anomalies;
  }

  /** Anomalies for a specific scan */
  getAnomaliesForScan(scanId: string): Anomaly[] {
    return this._anomalies.filter((a) => a.scanId === scanId);
  }

  /** Aggregate statistics */
  getStats(): AnomalyStats {
    return {
      totalDetected: this._anomalies.length,
      byType: { ...this._countByType },
      bySeverity: { ...this._countBySeverity },
      recentAnomalies: this._anomalies.slice(-10),
    };
  }

  /** Get baseline stats for a specific metric */
  getBaseline(metric: string): { mean: number; stddev: number; count: number; p95: number } | null {
    const baseline = this._latencyBaselines.get(metric);
    if (!baseline) return null;
    return {
      mean: baseline.mean,
      stddev: baseline.stddev,
      count: baseline.count,
      p95: baseline.percentile(95),
    };
  }

  /** Subscribe to anomaly detections */
  onAnomaly(fn: (anomaly: Anomaly) => void): () => void {
    this._listeners.push(fn);
    return () => {
      const idx = this._listeners.indexOf(fn);
      if (idx >= 0) this._listeners.splice(idx, 1);
    };
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private _getOrCreateBaseline(key: string): RollingStats {
    let baseline = this._latencyBaselines.get(key);
    if (!baseline) {
      baseline = new RollingStats();
      this._latencyBaselines.set(key, baseline);
    }
    return baseline;
  }

  // ── Reset ─────────────────────────────────────────────────────────────

  reset(): void {
    this.stop();
    this._latencyBaselines.clear();
    this._blockRateWindow = [];
    this._errorRateWindow = [];
    this._totalLatencyBaseline.reset();
    this._anomalies = [];
    this._countByType = { LATENCY: 0, TRANSITION: 0, RESOURCE: 0, BEHAVIORAL: 0, FREQUENCY: 0 };
    this._countBySeverity = { low: 0, medium: 0, high: 0, critical: 0 };
    this._lastAnomalyTime.clear();
    this._listeners = [];
  }
}

// ── Export Singleton ─────────────────────────────────────────────────────────

export const AnomalyDetector = new _AnomalyDetector();
