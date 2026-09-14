/**
 * Policy loading + re-export of the shared evaluator.
 * The ONE matcher: @wrapbox/policy-core is the same engine the control plane
 * uses — never add a second, screen- or shim-local evaluator here.
 */

import fs from "node:fs";
import { evaluate, applyProjectFilter } from "@wrapbox/policy-core";
import type { Rule, ToolCall, Decision, Condition } from "@wrapbox/policy-core";
import { PATHS, FRESH_HOURS } from "./config.js";

export { evaluate, applyProjectFilter };
export type { Rule, ToolCall, Decision, Condition };
export { FRESH_HOURS };

/** A rule as cached from /v1/rules/pull — engine Rule plus its project scope. */
export type CachedRule = Rule & { project_id: string | null };

export interface CachedRules {
  rules: CachedRule[];
  pulled_at: string;
  /** true when the cache is younger than FRESH_HOURS */
  fresh: boolean;
  ageHours: number;
}

/** Parse cache/rules.json (the exact /v1/rules/pull body) into evaluator shape. */
export function loadCachedRules(): CachedRules | null {
  let raw: string;
  try {
    raw = fs.readFileSync(PATHS.rulesCache, "utf-8");
  } catch {
    return null;
  }
  let body: { rules?: any[]; pulled_at?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(body.rules) || typeof body.pulled_at !== "string") return null;

  const rules: CachedRule[] = [];
  for (const row of body.rules) {
    let condition: Condition | null = null;
    if (typeof row.condition_json === "string" && row.condition_json.trim() !== "") {
      try {
        condition = JSON.parse(row.condition_json);
      } catch {
        // An unparseable condition must NOT become "no condition" (which matches
        // everything — a narrow allow would widen). Drop the rule: with the
        // engine's block-by-default, dropping is the fail-closed choice.
        continue;
      }
    } else if (row.condition != null) {
      condition = row.condition;
    }
    rules.push({
      id: row.id,
      name: row.name,
      effect: row.effect,
      priority: row.priority,
      condition,
      project_id: row.project_id ?? null,
    } as CachedRule);
  }

  const ageHours = (Date.now() - Date.parse(body.pulled_at)) / 3_600_000;
  return { rules, pulled_at: body.pulled_at, fresh: Number.isFinite(ageHours) && ageHours < FRESH_HOURS, ageHours };
}
