/**
 * Evan AI — ForensicLog (Indexed Audit Trail) [OPUS 4.8 Resilience]
 *
 * Forensic-level observability for the scan pipeline.
 * Every decision, anomaly, healing action, and snapshot diff is
 * indexed by scanId for O(1) lookup.
 *
 * Supports "explain why this scan failed" in a single call.
 *
 * Architecture:
 *   - Per-scan audit trail indexed by scanId
 *   - Compact entry format (type + summary + timestamp)
 *   - Bounded storage (max 100 scan trails, 50 entries per trail)
 *   - Builds on top of ScanObserver — does NOT replace it
 *   - ScanObserver = raw event stream, ForensicLog = indexed decisions
 *
 * Guarantees:
 *   - O(1) lookup by scanId (Map-based index)
 *   - O(1) append per entry
 *   - Bounded memory: 100 scans × 50 entries × ~200B = ~1MB
 *   - Never blocks pipeline — fire-and-forget writes
 */

import type { ScanPhase } from "../hooks/useEvanBrain";
import type { SnapshotDiff } from "./SnapshotManager";
import type { DegradationMode } from "./GracefulDegradation";

// ── Types ──────────────────────────────────────────────────────────────────

export type ForensicEntryType =
  | "governor_decision"
  | "phase_transition"
  | "snapshot_captured"
  | "snapshot_diff"
  | "anomaly_detected"
  | "healing_started"
  | "healing_completed"
  | "healing_failed"
  | "degradation_change"
  | "replay_mismatch"
  | "invariant_violation"
  | "contract_event"
  | "error";

export interface ForensicEntry {
  /** Entry type for filtering */
  type: ForensicEntryType;
  /** Timestamp */
  timestamp: number;
  /** Current phase when entry was created */
  phase: ScanPhase;
  /** Compact summary (one line, human-readable) */
  summary: string;
  /** Structured data (queryable) */
  data: Record<string, unknown>;
}

export interface ScanAuditTrail {
  /** The scanId this trail belongs to */
  scanId: string;
  /** When the scan started */
  startedAt: number;
  /** When the scan ended (null if still active) */
  endedAt: number | null;
  /** Final outcome */
  outcome: "complete" | "error" | "aborted" | "active";
  /** Ordered list of forensic entries */
  entries: ForensicEntry[];
}

export interface ScanExplanation {
  /** The scanId explained */
  scanId: string;
  /** Quick summary (1-2 sentences) */
  summary: string;
  /** Phase where failure occurred (null if successful) */
  failurePhase: ScanPhase | null;
  /** Error message (null if successful) */
  errorMessage: string | null;
  /** Anomalies detected during this scan */
  anomalies: ForensicEntry[];
  /** Healing actions taken during this scan */
  healingActions: ForensicEntry[];
  /** Invariant violations during this scan */
  violations: ForensicEntry[];
  /** Full timeline of entries */
  timeline: ForensicEntry[];
  /** Total scan duration (ms) */
  durationMs: number | null;
}

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_SCAN_TRAILS = 100;
const MAX_ENTRIES_PER_TRAIL = 50;

// ── ForensicLog ────────────────────────────────────────────────────────────

class _ForensicLog {
  /** Indexed by scanId for O(1) lookup */
  private _trails = new Map<string, ScanAuditTrail>();
  /** Ordered list of scanIds for eviction */
  private _scanOrder: string[] = [];
  /** Global entries (not tied to a specific scan) */
  private _globalEntries: ForensicEntry[] = [];

  // ── Trail Management ──────────────────────────────────────────────────

  /**
   * Begin a new audit trail for a scan.
   */
  beginScan(scanId: string): void {
    // Evict oldest if at capacity
    if (this._trails.size >= MAX_SCAN_TRAILS) {
      const evictId = this._scanOrder.shift();
      if (evictId) this._trails.delete(evictId);
    }

    const trail: ScanAuditTrail = {
      scanId,
      startedAt: Date.now(),
      endedAt: null,
      outcome: "active",
      entries: [],
    };

    this._trails.set(scanId, trail);
    this._scanOrder.push(scanId);
  }

  /**
   * End a scan's audit trail.
   */
  endScan(scanId: string, outcome: "complete" | "error" | "aborted"): void {
    const trail = this._trails.get(scanId);
    if (!trail) return;
    trail.endedAt = Date.now();
    trail.outcome = outcome;
  }

  // ── Entry Recording ───────────────────────────────────────────────────

  /**
   * Record a forensic entry for a specific scan.
   * O(1) append to the trail.
   */
  record(
    scanId: string | null,
    type: ForensicEntryType,
    phase: ScanPhase,
    summary: string,
    data: Record<string, unknown> = {},
  ): void {
    const entry: ForensicEntry = {
      type,
      timestamp: Date.now(),
      phase,
      summary,
      data,
    };

    if (scanId) {
      const trail = this._trails.get(scanId);
      if (trail) {
        if (trail.entries.length >= MAX_ENTRIES_PER_TRAIL) {
          trail.entries.shift();
        }
        trail.entries.push(entry);
      }
    } else {
      // Global entry
      if (this._globalEntries.length >= MAX_ENTRIES_PER_TRAIL) {
        this._globalEntries.shift();
      }
      this._globalEntries.push(entry);
    }
  }

  // ── Convenience Recorders ─────────────────────────────────────────────

  recordGovernorDecision(
    scanId: string | null,
    phase: ScanPhase,
    action: string,
    allowed: boolean,
    rejections?: Array<{ rule: string; message: string }>,
  ): void {
    this.record(
      scanId,
      "governor_decision",
      phase,
      allowed
        ? `Governor ALLOWED ${action}`
        : `Governor BLOCKED ${action}: ${rejections?.[0]?.message ?? "unknown"}`,
      { action, allowed, rejections },
    );
  }

  recordSnapshotDiff(
    scanId: string | null,
    phase: ScanPhase,
    diff: SnapshotDiff,
  ): void {
    const changesSummary = diff.changes
      .map((c) => `${c.path}: ${String(c.from)} → ${String(c.to)}`)
      .join(", ");

    this.record(
      scanId,
      "snapshot_diff",
      phase,
      `Snapshot diff (${diff.elapsedMs}ms): ${diff.changes.length} changes — ${changesSummary}`,
      { diff },
    );
  }

  recordAnomaly(
    scanId: string | null,
    phase: ScanPhase,
    anomalyType: string,
    details: string,
    data: Record<string, unknown> = {},
  ): void {
    this.record(
      scanId,
      "anomaly_detected",
      phase,
      `ANOMALY [${anomalyType}]: ${details}`,
      { anomalyType, ...data },
    );
  }

  recordHealing(
    scanId: string | null,
    phase: ScanPhase,
    strategy: string,
    status: "started" | "completed" | "failed",
    details: string = "",
  ): void {
    const type: ForensicEntryType =
      status === "started" ? "healing_started" :
      status === "completed" ? "healing_completed" : "healing_failed";

    this.record(
      scanId,
      type,
      phase,
      `HEALING [${strategy}] ${status}${details ? `: ${details}` : ""}`,
      { strategy, status },
    );
  }

  recordDegradation(
    from: DegradationMode,
    to: DegradationMode,
    reason: string,
  ): void {
    this.record(
      null,
      "degradation_change",
      "idle",
      `Mode: ${from} → ${to} (${reason})`,
      { from, to, reason },
    );
  }

  // ── Queries ───────────────────────────────────────────────────────────

  /**
   * Get the full audit trail for a scan.
   * O(1) lookup.
   */
  getTrail(scanId: string): ScanAuditTrail | null {
    return this._trails.get(scanId) ?? null;
  }

  /**
   * Explain why a scan succeeded or failed.
   * Returns a structured explanation with anomalies, healing actions,
   * violations, and full timeline.
   *
   * O(n) where n = entries in the trail (max 50).
   */
  explain(scanId: string): ScanExplanation | null {
    const trail = this._trails.get(scanId);
    if (!trail) return null;

    const anomalies = trail.entries.filter((e) => e.type === "anomaly_detected");
    const healingActions = trail.entries.filter(
      (e) =>
        e.type === "healing_started" ||
        e.type === "healing_completed" ||
        e.type === "healing_failed",
    );
    const violations = trail.entries.filter(
      (e) => e.type === "invariant_violation",
    );

    // Find failure point
    const errorEntry = trail.entries.find((e) => e.type === "error");
    const failurePhase = errorEntry?.phase ?? null;
    const errorMessage =
      (errorEntry?.data?.message as string) ??
      errorEntry?.summary ??
      null;

    // Build summary
    let summary: string;
    if (trail.outcome === "complete") {
      summary = `Scan ${scanId} completed successfully`;
      if (anomalies.length > 0) {
        summary += ` with ${anomalies.length} anomalie(s) detected`;
      }
      if (healingActions.length > 0) {
        summary += `, ${healingActions.length} healing action(s) taken`;
      }
    } else if (trail.outcome === "error") {
      summary = `Scan ${scanId} failed in ${failurePhase ?? "unknown"} phase: ${errorMessage ?? "unknown error"}`;
    } else if (trail.outcome === "aborted") {
      summary = `Scan ${scanId} was aborted`;
    } else {
      summary = `Scan ${scanId} is still active`;
    }

    const durationMs =
      trail.endedAt != null ? trail.endedAt - trail.startedAt : null;

    return {
      scanId,
      summary,
      failurePhase,
      errorMessage: trail.outcome === "error" ? errorMessage : null,
      anomalies,
      healingActions,
      violations,
      timeline: trail.entries,
      durationMs,
    };
  }

  /** Get all active (incomplete) scan trails */
  getActiveTrails(): ScanAuditTrail[] {
    return Array.from(this._trails.values()).filter(
      (t) => t.outcome === "active",
    );
  }

  /** Get recent scan explanations (most recent first) */
  getRecentExplanations(count: number = 10): ScanExplanation[] {
    const recentIds = this._scanOrder.slice(-count).reverse();
    return recentIds
      .map((id) => this.explain(id))
      .filter((e): e is ScanExplanation => e !== null);
  }

  /** Global entries (not tied to a scan) */
  getGlobalEntries(): readonly ForensicEntry[] {
    return this._globalEntries;
  }

  // ── Reset ─────────────────────────────────────────────────────────────

  reset(): void {
    this._trails.clear();
    this._scanOrder = [];
    this._globalEntries = [];
  }
}

// ── Export Singleton ─────────────────────────────────────────────────────────

export const ForensicLog = new _ForensicLog();
