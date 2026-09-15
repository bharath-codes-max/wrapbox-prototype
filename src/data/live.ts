// The live demo CORE — the pitch theatre's data and its engine wiring.
//
// Every policy decision the film shows is computed by the REAL engine in
// src/lib/engine.ts (evaluate / rewrite / permitCheck) against the REAL Rule
// objects below. Nothing here hardcodes a verdict the engine could compute.
// The surroundings (browser chrome, terminal, MDM push, packets) are simulated;
// the decisions are not. Prove it with src/data/live.selftest.ts.

import { evaluate, permitCheck, rewrite, type Act, type Verdict } from "../lib/engine";
import type { CategoryId } from "./agents";
import type { Rule } from "./contract";

/* ============================================================================
 * The hero contract — one genuinely hard policy, encoded as real Rule objects.
 * "Production data, under permit." Exercises forbid, env, requires (business
 * hours, fail-closed), escalations (PII-taint → BLOCK, blast-radius → higher
 * quorum), approvers + quorum, a single-use permit bound to the statement, and
 * constrain: mask on reads.
 * ========================================================================== */

export const LIVE_RULES: Rule[] = [
  {
    id: "prod-db-write",
    title: "Production writes run under permit",
    why: "A production write is held for two SRE on-call approvers, only inside business hours, never destructive, and never after this session read customer PII. Approved, it runs once under a single-use permit bound to the exact statement.",
    when: {
      effect: ["database.write", "database.migrate"],
      env: ["production"],
      // Business hours must be PROVEN by the action's context. If the fact is
      // absent (off-hours), the rule fails closed → BLOCK "context not proven".
      requires: [{ key: "time.window", op: "is", value: "business-hours" }],
    },
    // Destructive statements are refused outright, matched against sql/command.
    forbid: ["drop table", "truncate", "delete from *"],
    failClosed: true,
    decision: "REVIEW",
    approvers: "sre-oncall",
    quorum: 2,
    escalations: [
      // No exfiltration laundered through a write: if the same session already
      // read customer PII, the write is refused.
      { when: [{ key: "session.pii_touched", op: "is", value: true }], decision: "BLOCK", why: "agent read customer PII earlier this session" },
      // Large blast radius raises the bar to a third approver.
      { when: [{ key: "rows.affected", op: "gte", value: 10000 }], decision: "REVIEW", quorum: 3, why: "large blast radius" },
    ],
    permit: { ttlSeconds: 300, singleUse: true, bind: ["sql", "actor"] },
    scope: "all",
  },
  {
    id: "prod-pii-read",
    title: "Customer PII is masked on read",
    why: "Agents get the answer, not the raw contact data. Reads of customer PII are allowed but masked on the way out.",
    when: {
      effect: ["database.read"],
      env: ["production"],
      columns: ["email", "phone", "pan", "aadhaar"],
    },
    decision: "CONSTRAIN",
    constrain: "mask",
    scope: "all",
  },
  {
    id: "coding-ok",
    title: "Ordinary developer actions are automatic",
    why: "Low-risk local work stays hands-off so the policy is felt only where it matters.",
    when: { effect: ["filesystem.read", "shell.exec"] },
    decision: "ALLOW",
    scope: "coding",
  },
];

const heroRule = () => LIVE_RULES.find((r) => r.id === "prod-db-write")!;

/* ============================================================================
 * Types the UI depends on. These names/shapes are a CONTRACT — keep them exact.
 * ========================================================================== */

export type Plane = "admin" | "runtime" | "controlplane" | "gateway" | "employee";

export interface Beat {
  id: string;
  chapter: number; // 1..5
  /** which column/plane is the focus this beat — UI lifts it, dims others */
  focus: Plane | Plane[];
  /** short caption shown in the theatre's narration strip */
  caption: string;
  /** ms this beat runs before auto-advancing (director may scale by speed) */
  duration: number;
  /** optional: presenter action; theatre pauses then auto-performs after idleMs */
  interactive?: { kind: "publish" | "type" | "approve" | "click"; label: string; idleMs?: number };
  /** optional typing stream for a terminal/prompt */
  typing?: { target: "admin-prompt" | "employee-terminal" | "contract-draft"; text: string };
  /** optional ctx to merge into the running session before this beat decides */
  setCtx?: Record<string, string | number | boolean>;
  /** if present, this beat runs a REAL engine decision and the UI renders the Verdict */
  decision?: {
    plane: "runtime" | "gateway";
    act: Act; // real Act; ctx is merged with session ctx at run time
    /** for the permit replay beat: re-check an already-issued permit */
    permitReplay?: boolean;
  };
  /** optional scripted artifacts the UI shows (masked sql is COMPUTED via rewrite(), not hardcoded) */
  show?: Record<string, unknown>;
}

export interface Chapter {
  n: number;
  title: string;
  blurb: string;
}

export const LIVE_CHAPTERS: Chapter[] = [
  { n: 1, title: "Deploy", blurb: "Northwind Financial onboards the org and pushes wrapboxd to the fleet via MDM." },
  { n: 2, title: "The contract", blurb: "The admin authors one genuinely tough policy in plain English; it compiles to signed YAML." },
  { n: 3, title: "On the laptop", blurb: "An engineer's coding agent is caught by the runtime — PII masked, a laundered write refused." },
  { n: 4, title: "In the cloud", blurb: "A cloud agent with no laptop is caught by the Gateway — quorum approval, single-use permit, dead replay." },
  { n: 5, title: "The evidence", blurb: "The signed, hash-chained trail; anyone can verify it independently." },
];

/* ============================================================================
 * The film — an ordered list of beats telling the five-chapter story.
 * Session facts flow forward: time.window is set at deploy (the org clock);
 * Chapter 3 taints the session with PII; Chapter 4 opens a fresh session.
 * ========================================================================== */

const ACTOR_LAPTOP = "agent:claude-code@laptop";
const ACTOR_CLOUD = "agent:codex@cloud-runner";

export const LIVE_BEATS: Beat[] = [
  /* ---- Chapter 1 · Deploy ---- */
  {
    id: "c1-onboard",
    chapter: 1,
    focus: "admin",
    caption: "Northwind Financial onboards Wrapbox — one org, every agent.",
    duration: 3200,
    typing: { target: "admin-prompt", text: "wrapbox org init --company \"Northwind Financial\" --sso okta" },
    // The org clock. Every downstream decision proves business hours against it.
    setCtx: { "time.window": "business-hours" },
  },
  {
    id: "c1-mdm",
    chapter: 1,
    focus: "controlplane",
    caption: "wrapboxd is signed and pushed to the fleet via MDM.",
    duration: 3600,
    interactive: { kind: "publish", label: "Push wrapboxd to the fleet", idleMs: 4000 },
  },
  {
    id: "c1-planes",
    chapter: 1,
    focus: ["controlplane", "employee"],
    caption: "Runtime lands on every laptop; the Gateway fronts cloud agents. The Control Plane holds the contract.",
    duration: 3200,
  },

  /* ---- Chapter 2 · The contract ---- */
  {
    id: "c2-intent",
    chapter: 2,
    focus: "admin",
    caption: "The admin writes one policy in plain English.",
    duration: 4200,
    typing: {
      target: "contract-draft",
      text:
        "Any write to a production database is held for two SRE on-call approvers, and only inside business hours. Destructive statements (DROP, TRUNCATE, unscoped DELETE) are refused. If the same agent read customer PII earlier this session, the write is refused. Reads of customer PII are masked. An approved write runs once, under a single-use permit bound to the exact statement.",
    },
  },
  {
    id: "c2-compile",
    chapter: 2,
    focus: "admin",
    caption: "It compiles to a normalized rule and signed YAML — forbid, requires, escalations, quorum, permit.",
    duration: 3800,
    show: { ruleId: "prod-db-write" },
  },
  {
    id: "c2-publish",
    chapter: 2,
    focus: ["admin", "controlplane"],
    caption: "The contract is published to runtime and Gateway alike.",
    duration: 3400,
    interactive: { kind: "publish", label: "Publish the contract", idleMs: 4000 },
  },

  /* ---- Chapter 3 · On the laptop (runtime / wrapboxd) ---- */
  {
    id: "c3-open",
    chapter: 3,
    focus: "employee",
    caption: "An engineer's Claude Code agent opens a shell on the laptop.",
    duration: 3000,
    typing: { target: "employee-terminal", text: "psql prod -c \"SELECT email, phone FROM customers WHERE region = 'EU'\"" },
  },
  {
    id: "c3-read",
    chapter: 3,
    focus: ["employee", "controlplane"],
    caption: "The agent reads customer PII — allowed, but masked on the way out.",
    duration: 4200,
    // Reading PII taints the session for the rest of it.
    setCtx: { "session.pii_touched": true },
    decision: {
      plane: "runtime",
      act: {
        effect: "database.read",
        env: "production",
        columns: ["email", "phone"],
        sql: "SELECT email, phone FROM customers WHERE region = 'EU'",
        ctx: { actor: ACTOR_LAPTOP },
      },
    },
  },
  {
    id: "c3-write",
    chapter: 3,
    focus: ["employee", "controlplane"],
    caption: "The same session then tries a write — refused: it read PII earlier. No exfiltration laundered through a write.",
    duration: 4600,
    decision: {
      plane: "runtime",
      act: {
        effect: "database.write",
        env: "production",
        sql: "UPDATE customers SET note = 'reviewed' WHERE region = 'EU'",
        // sql + actor let the permit bind; rows.affected below the blast-radius bar.
        ctx: { actor: ACTOR_LAPTOP, sql: "UPDATE customers SET note = 'reviewed' WHERE region = 'EU'", "rows.affected": 240 },
      },
    },
  },

  /* ---- Chapter 4 · In the cloud (Gateway) ---- */
  {
    id: "c4-arrive",
    chapter: 4,
    focus: "gateway",
    caption: "A cloud agent with no laptop hits the Gateway — a fresh session, no laptop runtime to lean on.",
    duration: 3200,
    typing: { target: "employee-terminal", text: "codex run migrate --env prod --apply" },
    // A new session: the earlier PII taint does not carry across agents.
    setCtx: { "session.pii_touched": false },
  },
  {
    id: "c4-review",
    chapter: 4,
    focus: ["gateway", "controlplane"],
    caption: "A production write, in business hours, clean session — held for two SRE on-call approvers.",
    duration: 4600,
    decision: {
      plane: "gateway",
      act: {
        effect: "database.write",
        env: "production",
        sql: "UPDATE accounts SET status = 'active' WHERE cohort = 'q3'",
        ctx: { actor: ACTOR_CLOUD, sql: "UPDATE accounts SET status = 'active' WHERE cohort = 'q3'", "rows.affected": 42 },
      },
    },
  },
  {
    id: "c4-approve",
    chapter: 4,
    focus: ["gateway", "controlplane"],
    caption: "Two on-call SREs approve. A single-use permit is minted, bound to the exact statement.",
    duration: 3600,
    interactive: { kind: "approve", label: "Approve (2 of 2 on-call SREs)", idleMs: 4000 },
  },
  {
    id: "c4-execute",
    chapter: 4,
    focus: ["gateway", "controlplane"],
    caption: "The write runs once, under the permit.",
    duration: 4000,
    decision: {
      plane: "gateway",
      act: {
        effect: "database.write",
        env: "production",
        sql: "UPDATE accounts SET status = 'active' WHERE cohort = 'q3'",
        // A minted, unspent permit within TTL, bound to sql + actor.
        ctx: { actor: ACTOR_CLOUD, sql: "UPDATE accounts SET status = 'active' WHERE cohort = 'q3'", "rows.affected": 42, "permit.age_seconds": 18 },
      },
    },
  },
  {
    id: "c4-replay",
    chapter: 4,
    focus: ["gateway", "controlplane"],
    caption: "A replay of the same permit is dead — single-use, already consumed.",
    duration: 4200,
    decision: {
      plane: "gateway",
      permitReplay: true,
      act: {
        effect: "database.write",
        env: "production",
        sql: "UPDATE accounts SET status = 'active' WHERE cohort = 'q3'",
        ctx: { actor: ACTOR_CLOUD, sql: "UPDATE accounts SET status = 'active' WHERE cohort = 'q3'", "rows.affected": 42, "permit.age_seconds": 26, "permit.consumed": true },
      },
    },
  },

  /* ---- Chapter 5 · The evidence ---- */
  {
    id: "c5-chain",
    chapter: 5,
    focus: ["controlplane", "admin"],
    caption: "Every decision — CONSTRAIN, BLOCK, REVIEW, the permit, the dead replay — is signed and hash-chained.",
    duration: 3600,
  },
  {
    id: "c5-verify",
    chapter: 5,
    focus: "admin",
    caption: "Anyone can verify the chain independently. The receipts match the decisions the engine actually made.",
    duration: 3600,
    interactive: { kind: "click", label: "Verify the chain", idleMs: 4000 },
  },
];

/* ============================================================================
 * runDecision — run a beat's REAL decision against the accumulated session ctx.
 *
 * Three genuine engine paths, never a scripted verdict:
 *   1. request  → evaluate()      (CONSTRAIN read, BLOCK on taint/forbid, REVIEW)
 *   2. execute  → permitCheck()   (an approved, single-use permit lets it run once)
 *   3. replay   → evaluate()      (the consumed permit is re-checked → BLOCK)
 * ========================================================================== */

const categoryFor = (plane: "runtime" | "gateway"): CategoryId => (plane === "runtime" ? "cli" : "cloud");

// A deterministic permit id — no Math.random anywhere near a verdict.
function permitId(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return "wbp_" + (h >>> 0).toString(36).padStart(7, "0");
}

export function runDecision(
  beat: Beat,
  sessionCtx: Record<string, unknown>,
): { verdict: Verdict; maskedSql?: string; permitId?: string; replayBlocked?: boolean } {
  const d = beat.decision;
  if (!d) throw new Error(`runDecision called on a non-decision beat: ${beat.id}`);

  const category = categoryFor(d.plane);
  // Merge accumulated session ctx first, then the beat's own act ctx (beat wins).
  const act: Act = { ...d.act, ctx: { ...(sessionCtx as Act["ctx"]), ...(d.act.ctx ?? {}) } };

  // --- Replay: the engine re-checks an already-issued permit → BLOCK. ---
  if (d.permitReplay) {
    const verdict = evaluate(act, LIVE_RULES, category);
    return { verdict, replayBlocked: verdict.decision === "BLOCK" };
  }

  // --- Execute-under-permit: an approved, unspent permit within TTL. ---
  // A minted permit is signalled by permit.age_seconds present and not consumed.
  const ctx = act.ctx ?? {};
  const executing = ctx["permit.age_seconds"] !== undefined && ctx["permit.consumed"] !== true;
  if (executing) {
    const gov = heroRule();
    const pc = permitCheck(gov, act);
    if (pc?.ok) {
      const id = permitId(`${beat.id}|${act.sql ?? ""}`);
      const verdict: Verdict = {
        decision: "ALLOW",
        rule: gov.id,
        title: gov.title,
        reason: `execution granted under permit ${id} — ${pc.detail}`,
        trace: [{ rule: gov, matched: true, why: pc.detail, decision: "ALLOW" }],
      };
      return { verdict, permitId: id };
    }
    // A permit that no longer checks out falls back to the real evaluator (BLOCK).
    return { verdict: evaluate(act, LIVE_RULES, category) };
  }

  // --- Request: the ordinary evaluation path. ---
  const verdict = evaluate(act, LIVE_RULES, category);
  const maskedSql = verdict.constrain ? rewrite(act, verdict.constrain) : undefined;
  return { verdict, maskedSql };
}
