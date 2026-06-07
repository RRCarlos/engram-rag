import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { PreflightResult } from "../engram/runPreflight.js";
import type { MemSaveInput } from "../engram/EngramTools.js";
import type { OperationalMetrics } from "../engram/EngramTools.js";

/**
 * In-process operational metrics counters with optional disk
 * persistence (PR4 / #30).
 *
 * PR3 / #29 introduced the `error_stats` MCP tool, which reports
 * five aggregate metrics:
 *
 *   - `preflight_coverage`   — fraction of preflight consults that
 *                              were NOT degraded.
 *   - `retrieval_hit_rate`   — fraction of consults that produced at
 *                              least one consulted id.
 *   - `application_rate`     — fraction of consults that produced at
 *                              least one applied rule.
 *   - `repeat_error_rate`    — fraction of learn records whose
 *                              `failure_signature` was already seen.
 *   - `prevention_rate`      — fraction of consults whose enforcement
 *                              outcome was `correct` or `blocked`.
 *
 * PR4 / #30 adds disk persistence so the counters survive a process
 * restart (the previous in-process state was lost on every MCP
 * server boot). The state is intentionally simple: a single object
 * per process lifetime, mutated synchronously by the handler layer,
 * snapshotted on demand. Persistence is opt-in via
 * `loadOperationalMetricsState(path)` / `saveOperationalMetricsState(path,
 * state)`; in-memory tests can keep using
 * `createOperationalMetricsState()` without a path.
 */

export const OPERATIONAL_METRICS_SCHEMA_VERSION = "1.0" as const;

interface OperationalMetricsStateInternal {
  total_consults: number;
  degraded_consults: number;
  consults_with_hits: number;
  consults_with_applied_rules: number;
  prevented_actions: number;
  total_learns: number;
  repeated_errors: number;
  seen_failure_signatures: Set<string>;
}

/**
 * JSON-serializable snapshot of an `OperationalMetricsState`. The
 * `seen_failure_signatures` Set is materialized as a sorted array so
 * the shape round-trips through `JSON.stringify` / `JSON.parse`
 * without losing information.
 */
export interface OperationalMetricsPersistShape {
  schema_version: typeof OPERATIONAL_METRICS_SCHEMA_VERSION;
  saved_at: string;
  total_consults: number;
  degraded_consults: number;
  consults_with_hits: number;
  consults_with_applied_rules: number;
  prevented_actions: number;
  total_learns: number;
  repeated_errors: number;
  seen_failure_signatures: string[];
}

export interface OperationalMetricsState {
  recordConsult(result: PreflightResult): void;
  recordLearn(input: MemSaveInput): void;
  snapshot(): OperationalMetrics;
  reset(): void;
  /**
   * Materialize the state as a JSON-serializable shape. PR4 uses
   * this for the on-disk persistence format; the `seen_failure_signatures`
   * Set becomes a sorted array.
   */
  toJSON(): OperationalMetricsPersistShape;
}

function safeRate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

interface CreateStateOptions {
  /**
   * Optional pre-hydrated values (PR4). When provided, the state
   * starts with the given counters instead of zeros. The
   * `seen_failure_signatures` array is re-built as a Set internally.
   */
  initial?: OperationalMetricsPersistShape;
  /**
   * Optional ISO timestamp injected as `saved_at` when serializing.
   * Test-only; defaults to `now()`.
   */
  now?: () => Date;
}

export function createOperationalMetricsState(
  options: CreateStateOptions = {},
): OperationalMetricsState {
  const now = options.now ?? (() => new Date());
  const state: OperationalMetricsStateInternal = {
    total_consults: options.initial?.total_consults ?? 0,
    degraded_consults: options.initial?.degraded_consults ?? 0,
    consults_with_hits: options.initial?.consults_with_hits ?? 0,
    consults_with_applied_rules:
      options.initial?.consults_with_applied_rules ?? 0,
    prevented_actions: options.initial?.prevented_actions ?? 0,
    total_learns: options.initial?.total_learns ?? 0,
    repeated_errors: options.initial?.repeated_errors ?? 0,
    seen_failure_signatures: new Set<string>(
      options.initial?.seen_failure_signatures ?? [],
    ),
  };

  return {
    recordConsult(result: PreflightResult): void {
      state.total_consults += 1;
      if (result.degraded) {
        state.degraded_consults += 1;
      }
      if (result.consulted_ids.length > 0) {
        state.consults_with_hits += 1;
      }
      if (result.applied_rules.length > 0) {
        state.consults_with_applied_rules += 1;
      }
      if (
        result.enforcement.outcome === "correct" ||
        result.enforcement.outcome === "blocked"
      ) {
        state.prevented_actions += 1;
      }
    },
    recordLearn(input: MemSaveInput): void {
      state.total_learns += 1;
      const signature = input.failure_signature;
      if (state.seen_failure_signatures.has(signature)) {
        state.repeated_errors += 1;
      } else {
        state.seen_failure_signatures.add(signature);
      }
    },
    snapshot(): OperationalMetrics {
      return {
        preflight_coverage: safeRate(
          state.total_consults - state.degraded_consults,
          state.total_consults,
        ),
        retrieval_hit_rate: safeRate(state.consults_with_hits, state.total_consults),
        application_rate: safeRate(
          state.consults_with_applied_rules,
          state.total_consults,
        ),
        repeat_error_rate: safeRate(state.repeated_errors, state.total_learns),
        prevention_rate: safeRate(state.prevented_actions, state.total_consults),
        total_consults: state.total_consults,
        total_learns: state.total_learns,
      };
    },
    reset(): void {
      state.total_consults = 0;
      state.degraded_consults = 0;
      state.consults_with_hits = 0;
      state.consults_with_applied_rules = 0;
      state.prevented_actions = 0;
      state.total_learns = 0;
      state.repeated_errors = 0;
      state.seen_failure_signatures.clear();
    },
    toJSON(): OperationalMetricsPersistShape {
      return {
        schema_version: OPERATIONAL_METRICS_SCHEMA_VERSION,
        saved_at: now().toISOString(),
        total_consults: state.total_consults,
        degraded_consults: state.degraded_consults,
        consults_with_hits: state.consults_with_hits,
        consults_with_applied_rules: state.consults_with_applied_rules,
        prevented_actions: state.prevented_actions,
        total_learns: state.total_learns,
        repeated_errors: state.repeated_errors,
        seen_failure_signatures: [...state.seen_failure_signatures].sort(),
      };
    },
  };
}

export interface LoadOperationalMetricsStateOptions {
  now?: () => Date;
}

/**
 * Load a persisted `OperationalMetricsState` from `path`.
 *
 * Behavior:
 *
 *   - File missing → return a fresh state. (The MCP server calls this
 *     on every boot; a missing file is the normal first-run case.)
 *   - File present but corrupt (invalid JSON, wrong shape, wrong
 *     `schema_version`) → return a fresh state. The corrupt file is
 *     NOT deleted; the caller can decide whether to back it up.
 *   - File present and valid → hydrate a state with the stored
 *     counters and `seen_failure_signatures` set.
 *
 * The function never throws on a missing or corrupt file. The default
 * location `<cwd>/.engram/metrics.json` is therefore safe to call
 * unconditionally; CI and the first MCP server boot will simply
 * receive a fresh state.
 */
export function loadOperationalMetricsState(
  path: string,
  options: LoadOperationalMetricsStateOptions = {},
): OperationalMetricsState {
  const createOptions: CreateStateOptions = {};
  if (options.now !== undefined) createOptions.now = options.now;
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return createOperationalMetricsState(createOptions);
    }
    // Any other read error (EACCES, EISDIR) is treated as a missing
    // file from the caller's perspective. The state is fresh; the
    // operator can investigate the filesystem.
    return createOperationalMetricsState(createOptions);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return createOperationalMetricsState(createOptions);
  }
  if (!isOperationalMetricsPersistShape(parsed)) {
    return createOperationalMetricsState(createOptions);
  }
  return createOperationalMetricsState({ ...createOptions, initial: parsed });
}

export interface SaveOperationalMetricsStateOptions {
  now?: () => Date;
}

/**
 * Persist an `OperationalMetricsState` to `path` as JSON.
 *
 * The parent directory is created if it does not exist. The function
 * throws when the file system rejects the write (EACCES, ENOSPC,
 * EROFS, …); callers (e.g. the MCP server) wrap the call in a
 * try/catch so a broken file system does not crash the server.
 */
export function saveOperationalMetricsState(
  path: string,
  state: OperationalMetricsState,
  options: SaveOperationalMetricsStateOptions = {},
): void {
  const now = options.now ?? (() => new Date());
  const json = JSON.stringify(state.toJSON(), null, 2);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${json}\n`, "utf8");
}

/**
 * Default persistence path for the MCP server. Reads
 * `process.env.ENGRAM_METRICS_PATH` first, then falls back to
 * `<cwd>/.engram/metrics.json`. The fallback is intentionally inside
 * the project so it is hidden by `.gitignore` and the file system
 * is writable on every developer / CI checkout.
 */
export function defaultOperationalMetricsPath(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string {
  const fromEnv = env.ENGRAM_METRICS_PATH;
  if (typeof fromEnv === "string" && fromEnv.length > 0) {
    return fromEnv;
  }
  return `${cwd}/.engram/metrics.json`;
}

function isOperationalMetricsPersistShape(
  value: unknown,
): value is OperationalMetricsPersistShape {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record["schema_version"] !== OPERATIONAL_METRICS_SCHEMA_VERSION) {
    return false;
  }
  if (typeof record["saved_at"] !== "string") return false;
  const numberFields = [
    "total_consults",
    "degraded_consults",
    "consults_with_hits",
    "consults_with_applied_rules",
    "prevented_actions",
    "total_learns",
    "repeated_errors",
  ];
  for (const field of numberFields) {
    if (typeof record[field] !== "number" || !Number.isFinite(record[field])) {
      return false;
    }
  }
  if (!Array.isArray(record["seen_failure_signatures"])) return false;
  if (
    !record["seen_failure_signatures"].every((entry) => typeof entry === "string")
  ) {
    return false;
  }
  return true;
}
