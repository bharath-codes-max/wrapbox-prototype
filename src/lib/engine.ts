// The deterministic policy engine. No model in the loop: the same action and
// the same contract always produce the same decision, with a trace of why.

import type { CategoryId, Decision } from "../data/agents";
import { evalTier, fmtValue, type Rule } from "../data/contract";

export type Env = "production" | "staging" | "development";

export interface Act {
  effect: string;
  path?: string;
  command?: string;
  branch?: string;
  env?: Env;
  amount?: number;
  amountUsd?: number;
  columns?: string[];
  destination?: string;
  credentials?: boolean;
  budget?: number;
  sql?: string;
}

export interface TraceRow {
  rule: Rule;
  matched: boolean;
  why: string;
  decision?: Decision;
}

export interface Verdict {
  decision: Decision;
  observed?: Decision;
  rule: string;
  title: string;
  reason: string;
  trace: TraceRow[];
  approvers?: string;
  quorum?: number;
  constrain?: Rule["constrain"];
}

const RANK: Record<Decision, number> = { ALLOW: 1, CONSTRAIN: 2, REVIEW: 3, BLOCK: 4 };

function globToRe(pattern: string, kind: "path" | "text") {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (kind === "path" && pattern[i + 1] === "*") {
        re += pattern[i + 2] === "/" ? "(?:.*/)?" : ".*";
        i += pattern[i + 2] === "/" ? 2 : 1;
      } else re += kind === "path" ? "[^/]*" : ".*";
    } else if (c === "?") re += ".";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, kind === "text" ? "i" : "");
}
export const globMatch = (pattern: string, value: string, kind: "path" | "text" = "text") => {
  const v = kind === "path" && !value.startsWith("/") && pattern.startsWith("**/") ? "/" + value : value;
  return globToRe(pattern, kind).test(kind === "text" ? v.replace(/\s+/g, " ").trim() : v);
};

function matchRule(r: Rule, a: Act, category: CategoryId): { ok: boolean; why: string } {
  const w = r.when;
  if (!w.effect.some((e) => e === a.effect || (e.endsWith(".*") && a.effect.startsWith(e.slice(0, -1)))))
    return { ok: false, why: `effect is ${a.effect}` };
  if (w.subject && !w.subject.includes(category)) return { ok: false, why: `applies to ${w.subject.join("/")} agents only` };
  if (w.env && !w.env.includes(a.env ?? "production")) return { ok: false, why: `env is ${a.env ?? "production"}` };
  if (w.path) {
    if (!a.path || !w.path.some((p) => globMatch(p, a.path!, "path"))) return { ok: false, why: `path ${a.path ?? "—"} doesn't match ${w.path.join(", ")}` };
  }
  if (w.command) {
    if (!a.command || !w.command.some((p) => globMatch(p, a.command!))) return { ok: false, why: `command doesn't match ${w.command[0]}` };
  }
  if (w.branch) {
    if (!a.branch || !w.branch.some((p) => globMatch(p, a.branch!))) return { ok: false, why: `branch ${a.branch ?? "—"} isn't ${w.branch.join(", ")}` };
  }
  if (w.columns) {
    const hit = (a.columns ?? []).filter((c) => w.columns!.includes(c.toLowerCase()));
    if (!hit.length) return { ok: false, why: `no ${w.columns.join("/")} column touched` };
  }
  if (w.destinationNotIn) {
    if (!a.destination) return { ok: false, why: "no destination" };
    if (w.destinationNotIn.some((d) => a.destination === d || a.destination!.endsWith("." + d))) return { ok: false, why: `${a.destination} is on the allowlist` };
  }
  if (w.credentials && !a.credentials) return { ok: false, why: "no credentials in the payload" };
  return { ok: true, why: "matched" };
}

function decide(r: Rule, a: Act): { d: Decision; why: string; approvers?: string; quorum?: number } {
  if (r.attenuate) {
    const amt = a.amount ?? 0;
    const budget = a.budget ?? 0;
    return amt > budget
      ? { d: "BLOCK", why: `$${amt.toLocaleString("en-US")} exceeds the $${budget.toLocaleString("en-US")} its parent delegated` }
      : { d: "ALLOW", why: `within the delegated $${budget.toLocaleString("en-US")} budget` };
  }
  if (r.tiers) {
    const v = r.unit === "USD" ? (a.amountUsd ?? a.amount ?? 0) : (a.amount ?? 0);
    const t = evalTier(r, v);
    const tier = r.tiers[t.tier];
    const prev = r.tiers[t.tier - 1];
    const band = tier?.max === null ? `above ${fmtValue(prev?.max ?? 0, r.unit)}` : `≤ ${fmtValue(tier?.max ?? 0, r.unit)}`;
    return { d: t.decision, why: `${fmtValue(v, r.unit)} · tier ${band}`, approvers: t.approvers, quorum: t.quorum };
  }
  return { d: r.decision ?? "ALLOW", why: r.title, approvers: r.approvers, quorum: r.quorum };
}

export function evaluate(a: Act, rules: Rule[], category: CategoryId, opts: { kill?: boolean } = {}): Verdict {
  if (opts.kill) return { decision: "BLOCK", rule: "kill-switch", title: "Org kill switch", reason: "org-wide kill switch engaged", trace: [] };
  const trace: TraceRow[] = rules.map((r) => {
    const m = matchRule(r, a, category);
    if (!m.ok) return { rule: r, matched: false, why: m.why };
    const d = decide(r, a);
    return { rule: r, matched: true, why: d.why, decision: d.d };
  });
  const hits = trace.filter((t) => t.matched);
  const enforced = hits.filter((t) => t.rule.mode !== "observe").sort((x, y) => RANK[y.decision!] - RANK[x.decision!]);
  const observing = hits.filter((t) => t.rule.mode === "observe").sort((x, y) => RANK[y.decision!] - RANK[x.decision!]);
  const win = enforced[0];
  const base: Verdict = win
    ? (() => {
        const d = decide(win.rule, a);
        return { decision: win.decision!, rule: win.rule.id, title: win.rule.title, reason: win.rule.tiers || win.rule.attenuate ? d.why : win.rule.title, trace, approvers: d.approvers, quorum: d.quorum, constrain: win.rule.constrain };
      })()
    : observing[0]
      ? { decision: "ALLOW", rule: observing[0].rule.id, title: observing[0].rule.title, reason: `observe mode — would ${observing[0].decision}: ${observing[0].why}`, trace }
      : { decision: "ALLOW", rule: "default", title: "Default", reason: "no rule matched · default ALLOW", trace };
  const obs = observing[0];
  if (obs && RANK[obs.decision!] > RANK[base.decision]) base.observed = obs.decision;
  return base;
}

/* ---------- Safe rewrites for CONSTRAIN ---------- */
const PII = ["email", "phone", "pan", "aadhaar"];
export function rewrite(a: Act, how: Rule["constrain"]): string | undefined {
  if (how === "force-with-lease" && a.command) return a.command.replace(/\s--force(?!-)(\s|$)/, " --force-with-lease$1").replace(/\s-f(\s|$)/, " --force-with-lease$1");
  if (how === "mask" && a.sql) {
    let s = a.sql;
    for (const c of PII) s = s.replace(new RegExp(`\\b${c}\\b(?![^(]*\\))`, "gi"), `wbx_mask(${c}) AS ${c}`);
    return /\blimit\b/i.test(s) ? s : s.replace(/;?\s*$/, " LIMIT 500");
  }
  return undefined;
}

/* ---------- Classify free-form agent actions ---------- */
const SECRETISH = /(\.env[\w.-]*|\.pem\b|id_rsa|\.aws\/credentials|secrets?\.(json|ya?ml))/i;

export function classify(text: string, env: Env): { act: Act; label: string } {
  const t = text.trim().replace(/\s+/g, " ");
  const prodNs = /\s-n\s?prod\b|--namespace[= ]prod\b|\bprod(uction)?\b/.test(t);
  const e: Env = prodNs && /kubectl|helm|terraform/.test(t) ? "production" : env;
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(?:read|cat|less|head|tail|more|bat|open|view)\s+(\S+)/i))) return { act: { effect: "filesystem.read", path: abs(m[1]), env: e }, label: "file read" };
  if ((m = t.match(/open\(\s*['"]([^'"]+)['"]/))) return { act: { effect: "filesystem.read", path: abs(m[1]), env: e, command: t }, label: "file read via process" };
  if (/^git push\b/i.test(t)) {
    const toks = t.split(" ").slice(2).filter((x) => !x.startsWith("-"));
    const branch = (toks[1] ?? "main").replace(/^HEAD:/, "").replace(/^refs\/heads\//, "");
    return { act: { effect: "git.push", branch, command: t, env: e }, label: "git push" };
  }
  if ((m = t.match(/^(?:gh pr merge|git merge)\b.*?(?:--base\s+|into\s+)?(\S+)?$/i))) return { act: { effect: "git.merge", branch: /main|master/.test(t) ? "main" : (m[1] ?? "main"), command: t, env: e }, label: "merge" };
  if ((m = t.match(/\b(https?:\/\/[^\s'"]+)/)) && /^(curl|wget|http|fetch|nc)\b/i.test(t)) {
    let host = "";
    try {
      host = new URL(m[1]).hostname;
    } catch {
      host = m[1];
    }
    return { act: { effect: "network.egress", destination: host, credentials: SECRETISH.test(t) || /authorization|token|secret|password/i.test(t), command: t, env: e }, label: "network egress" };
  }
  const sql = t.replace(/^(psql|mysql)\b.*?-c\s+/i, "").replace(/^["']|["']$/g, "");
  if (/^\s*(select)\b/i.test(sql)) {
    const cols = (sql.match(/select\s+(.*?)\s+from/i)?.[1] ?? "").split(",").map((c) => c.trim().split(/\s+/)[0].replace(/.*\./, "").toLowerCase());
    return { act: { effect: "database.read", columns: cols, sql, env: e }, label: "SQL read" };
  }
  if (/^\s*(delete|update|insert|drop|truncate)\b/i.test(sql)) return { act: { effect: "database.write", sql, env: e }, label: "SQL write" };
  if (/^\s*(alter|create)\b/i.test(sql)) return { act: { effect: "database.migrate", sql, env: e }, label: "schema change" };
  if ((m = t.match(/^(?:rm|mv|cp|tee|truncate)\s+(?:-\S+\s+)*(\S+)/))) return { act: { effect: "filesystem.write", path: abs(m[1]), command: t, env: e }, label: "file write" };
  return { act: { effect: "shell.exec", command: t, env: e }, label: "command" };
}
const abs = (p: string) => (p.startsWith("/") || p.startsWith("~") ? p : `/wrapbox/web/${p.replace(/^\.\//, "")}`);

/** A readable one-liner for an action. */
export function describe(a: Act): string {
  if (a.command) return a.command;
  if (a.sql) return a.sql;
  if (a.path) return `${a.effect} ${a.path}`;
  if (a.amountUsd !== undefined) return `${a.effect} $${a.amountUsd.toLocaleString("en-US")}`;
  if (a.amount !== undefined) return `${a.effect} ${a.amount}`;
  return a.effect;
}
