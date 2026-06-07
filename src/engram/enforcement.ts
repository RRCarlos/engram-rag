import { createHash } from "node:crypto";
import type { ActionKind, RetrievalRequest } from "../contracts/retrieval.js";
import type { QuarantinedRecord } from "./EngramTools.js";
import type { PreflightResult } from "./runPreflight.js";
import { deriveStableTraceId } from "./trace.js";

/**
 * Typed enforcement/correction decision for shell and write actions.
 *
 * The enforcement layer sits beside `PreflightResult` and turns the
 * untyped consult output into a hard gate for risky actions. The
 * outcome is one of three values:
 *
 *   - `"allow"`    — preflight is clean and the action is safe.
 *   - `"correct"`  — the action may proceed only with the supplied
 *                    `corrected_command`. The original command MUST
 *                    NOT be executed unchanged.
 *   - `"blocked"`  — the action MUST NOT proceed. The reason is
 *                    always set so the caller can surface it.
 *
 * PR2 wires this into `runPreflight` and the live preflight CLI so
 * that PowerShell `&&` (PR1 proof case) and degraded/missing
 * retrieval states become hard gates instead of advisory prose.
 */

export const ENFORCEMENT_OUTCOMES = ["allow", "correct", "blocked"] as const;
export type EnforcementOutcome = (typeof ENFORCEMENT_OUTCOMES)[number];

/**
 * Actions that can mutate state on the host. Safe actions (`read`,
 * `spec`, `design`, `verify`, `review`) may always proceed; only
 * high-risk actions can be blocked or corrected by enforcement.
 */
export const HIGH_RISK_ACTIONS: ReadonlySet<ActionKind> = new Set<ActionKind>([
  "shell",
  "write",
]);

/**
 * The canonical PowerShell correction pattern that PR1 surfaces via
 * `correction_candidates`. We use it as the primary
 * `corrected_command` payload when a real rewrite is not safe.
 */
export const POWERSHELL_PLACEHOLDER_CORRECTION = "cmd1; if ($?) { cmd2 }";

const POWERSHELL_AND_DETECTION = /&&/;
const POWERSHELL_PLACEHOLDER_RE = /cmd1;\s*if \(\$\?\)\s*\{\s*cmd2\s*\}/;
const POWERSHELL_REWRITE_RE = /(\S+)\s*&&\s*(\S+)/;
const POWERSHELL_REWRITE_PATTERN_RE = /;\s*if \(\$\?\)\s*\{/;
const POWERSHELL_CLEAN_REWRITE_RE = /^([\w./-]+)\s+&&\s+([\w./-]+)$/;

export interface PreflightEnforcement {
  outcome: EnforcementOutcome;
  reason: string;
  corrected_command?: string;
  consulted_ids: number[];
  missing_expected_records: string[];
  quarantined_records: QuarantinedRecord[];
  /**
   * Enforcement trace ID — bound to the exact consult state
   * (consulted observation ids, missing records, degraded flag).
   * Useful for debugging a single enforcement decision.
   */
  trace_id: string;
  /**
   * Stable trace ID (PR4 / #30) — bound to the request + the sorted
   * consulted failure_signature set + the protocol key. Stable across
   * live state shifts when the input + action + consulted signatures
   * are identical. See `src/engram/trace.ts` for the derivation.
   */
  stable_trace_id: string;
}

export interface EvaluateEnforcementInput {
  request: RetrievalRequest;
  result: Omit<PreflightResult, "enforcement">;
}

export function isHighRiskAction(action: ActionKind): boolean {
  return HIGH_RISK_ACTIONS.has(action);
}

/**
 * Detect the PR1 PowerShell `&&` risk pattern from a request. The
 * detection is intentionally permissive: any `&&` substring inside a
 * PowerShell shell action triggers the correction flow. The actual
 * rewrite is the agent's responsibility, but the original command
 * MUST NOT run unchanged.
 */
export function isPowershellAndRisk(request: RetrievalRequest): boolean {
  return (
    request.action_kind === "shell" &&
    request.shell === "powershell" &&
    POWERSHELL_AND_DETECTION.test(request.task_text)
  );
}

/**
 * Best-effort rewrite of a `cmd1 && cmd2` substring into the
 * PowerShell-safe form. Only used when the entire input looks like
 * a clean two-token command; otherwise we fall back to the canonical
 * placeholder from `correction_candidates`. Returns `undefined` when
 * the input is not a clean rewrite candidate.
 */
export function rewritePowershellAnd(input: string): string | undefined {
  const match = input.match(POWERSHELL_CLEAN_REWRITE_RE);
  if (match === null) return undefined;
  const left = match[1];
  const right = match[2];
  if (left === undefined || right === undefined) return undefined;
  return `${left}; if ($?) { ${right} }`;
}

/**
 * Pick the best corrected command for the request. We prefer:
 *   1. The canonical `cmd1; if ($?) { cmd2 }` placeholder from
 *      PR1's `correction_candidates` (the spec's required proof).
 *   2. Any other candidate that contains the rewrite pattern.
 *   3. A literal rewrite of the task_text when one is available.
 */
export function findCorrectedCommand(
  request: RetrievalRequest,
  candidates: readonly string[],
): string | undefined {
  for (const candidate of candidates) {
    if (POWERSHELL_PLACEHOLDER_RE.test(candidate)) {
      return candidate;
    }
  }
  for (const candidate of candidates) {
    if (POWERSHELL_REWRITE_PATTERN_RE.test(candidate)) {
      return candidate;
    }
  }
  return rewritePowershellAnd(request.task_text);
}

function deterministicTraceId(parts: readonly string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part);
    hash.update("\u0000");
  }
  return `trc-${hash.digest("hex").slice(0, 16)}`;
}

function stableTraceParts(
  request: RetrievalRequest,
  consultedIds: readonly number[],
  missing: readonly string[],
  degraded: boolean,
): string[] {
  return [
    request.project,
    request.agent_id,
    request.action_kind,
    request.shell ?? "",
    request.task_text,
    [...consultedIds].sort((a, b) => a - b).join(","),
    [...missing].sort().join(","),
    String(degraded),
  ];
}

function buildEnforcement(
  outcome: EnforcementOutcome,
  reason: string,
  request: RetrievalRequest,
  baseTrace: readonly string[],
  consultedIds: number[],
  missing: string[],
  quarantined: QuarantinedRecord[],
  records: readonly PreflightResult["records"][number][],
  correctedCommand?: string,
): PreflightEnforcement {
  const enforcement: PreflightEnforcement = {
    outcome,
    reason,
    consulted_ids: consultedIds,
    missing_expected_records: missing,
    quarantined_records: quarantined,
    trace_id: deterministicTraceId([...baseTrace, outcome]),
    stable_trace_id: deriveStableTraceId({ request, records }),
  };
  if (correctedCommand !== undefined) {
    enforcement.corrected_command = correctedCommand;
  }
  return enforcement;
}

/**
 * Pure, deterministic enforcement decision. Does not call Engram.
 * Same input → same `trace_id` and same outcome.
 */
export function evaluateEnforcement(
  input: EvaluateEnforcementInput,
): PreflightEnforcement {
  const { request, result } = input;
  const highRisk = isHighRiskAction(request.action_kind);
  const consultedIds = [...result.consulted_ids];
  const quarantined = [...result.quarantined_records];
  const missing = [...result.missing_expected_records];
  const records = result.records;
  const baseTrace = stableTraceParts(request, consultedIds, missing, result.degraded);

  // Rule 1 — high-risk action + degraded retrieval cannot proceed.
  if (highRisk && result.degraded) {
    return buildEnforcement(
      "blocked",
      "preflight degraded: high-risk action cannot run without verified memory",
      request,
      baseTrace,
      consultedIds,
      missing,
      quarantined,
      records,
    );
  }

  // Rule 2 — high-risk action + missing expected records cannot proceed.
  if (highRisk && missing.length > 0) {
    return buildEnforcement(
      "blocked",
      `missing expected records for high-risk action: ${missing.join(", ")}`,
      request,
      baseTrace,
      consultedIds,
      missing,
      quarantined,
      records,
    );
  }

  // Rule 3 — PowerShell `&&` is always corrected when detected, even
  // on safe actions, because the caller would otherwise run an
  // invalid command. The original MUST NOT be executed unchanged.
  if (isPowershellAndRisk(request)) {
    const corrected = findCorrectedCommand(request, result.correction_candidates);
    if (corrected !== undefined) {
      return buildEnforcement(
        "correct",
        "PowerShell does not support `&&`; replace with the corrected form",
        request,
        baseTrace,
        consultedIds,
        missing,
        quarantined,
        records,
        corrected,
      );
    }
    return buildEnforcement(
      "blocked",
      "PowerShell `&&` detected but no correction candidate is available",
      request,
      baseTrace,
      consultedIds,
      missing,
      quarantined,
      records,
    );
  }

  // Default — preflight is clean and the action is safe.
  return buildEnforcement(
    "allow",
    "preflight clean and action safe",
    request,
    baseTrace,
    consultedIds,
    missing,
    quarantined,
    records,
  );
}
