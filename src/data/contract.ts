import { YAMLException, load } from "js-yaml";
import type { CategoryId, Decision } from "./agents";

/* ---------- The normalized action model: what a rule can talk about ---------- */

export type Field = "path" | "command" | "branch" | "env" | "columns" | "amount" | "destination";

export const EFFECTS: { id: string; label: string; desc: string; fields: Field[]; unit?: "USD" | "INR" | "%"; constrain?: Rule["constrain"] }[] = [
  { id: "filesystem.read", label: "Read a file", desc: "Any route — editor, shell, python, MCP", fields: ["path", "env"] },
  { id: "filesystem.write", label: "Write or delete a file", desc: "Edits, overwrites, rm", fields: ["path", "env"] },
  { id: "shell.exec", label: "Run a command", desc: "bash, kubectl, terraform, python", fields: ["command", "env"] },
  { id: "git.push", label: "Push to a branch", desc: "Including force-pushes", fields: ["branch", "command"], constrain: "force-with-lease" },
  { id: "git.merge", label: "Merge into a branch", desc: "PR merges, fast-forwards", fields: ["branch"] },
  { id: "database.read", label: "Read from a database", desc: "SELECT, by columns touched", fields: ["columns", "env"], constrain: "mask" },
  { id: "database.write", label: "Change rows", desc: "UPDATE, DELETE, DROP", fields: ["env"] },
  { id: "database.migrate", label: "Change a schema", desc: "ALTER, CREATE, migrations", fields: ["env"] },
  { id: "payments.refund", label: "Refund a payment", desc: "Stripe, Razorpay, any route", fields: ["amount"], unit: "USD" },
  { id: "claims.payout", label: "Pay out a claim", desc: "Custom claims agents", fields: ["amount"], unit: "INR" },
  { id: "crm.apply_discount", label: "Give a discount", desc: "CRM and billing actions", fields: ["amount"], unit: "%" },
  { id: "payment.submit", label: "Submit a payment in a browser", desc: "The final click", fields: ["amount"], unit: "USD" },
  { id: "network.egress", label: "Send data to a domain", desc: "curl, fetch, webhooks", fields: ["destination"] },
  { id: "purchase.order", label: "Place a delegated order", desc: "Subagents spending money", fields: [] },
];
export const effectInfo = (id: string) => EFFECTS.find((e) => e.id === id);

export interface Match {
  effect: string[];
  path?: string[];
  command?: string[];
  branch?: string[];
  env?: string[];
  columns?: string[];
  subject?: CategoryId[];
  destinationNotIn?: string[];
  credentials?: boolean;
}

export interface Tier {
  max: number | null; // null = everything above the previous tier
  decision: Decision;
  approvers?: string;
  quorum?: number;
}

export interface Rule {
  id: string;
  title: string;
  why: string;
  when: Match;
  decision?: Decision;
  approvers?: string;
  quorum?: number;
  ttl?: string;
  tiers?: Tier[];
  unit?: "USD" | "INR" | "%";
  attenuate?: boolean;
  constrain?: "mask" | "force-with-lease";
  scope: "all" | "coding" | "business";
  mode?: "enforce" | "observe";
  custom?: boolean;
}

const CODING: CategoryId[] = ["ide", "cli", "cloud"];

export const INITIAL_RULES: Rule[] = [
  {
    id: "secrets.read",
    title: "Secret files are never read autonomously",
    why: "Reads are first-class: exfiltration starts with a read.",
    when: { effect: ["filesystem.read"], path: ["**/.env*", "**/*.pem", "**/id_rsa*"] },
    decision: "BLOCK",
    scope: "all",
  },
  {
    id: "network.egress",
    title: "No credentials to unknown domains",
    why: "Allowed-channel exfiltration via curl, DNS or fetch.",
    when: { effect: ["network.egress"], destinationNotIn: ["api.github.com", "registry.npmjs.org", "pypi.org", "api.wrapbox.ai"], credentials: true },
    decision: "BLOCK",
    scope: "all",
  },
  {
    id: "git.main",
    title: "Agents never push or merge to main",
    why: "Protected branches stay human.",
    when: { effect: ["git.push", "git.merge"], branch: ["main", "master"] },
    decision: "BLOCK",
    scope: "coding",
  },
  {
    id: "git.force",
    title: "Force-pushes become --force-with-lease",
    why: "A force-push can't silently overwrite a teammate's commits.",
    when: { effect: ["git.push"], command: ["* --force *", "* --force", "* -f *"] },
    decision: "CONSTRAIN",
    constrain: "force-with-lease",
    scope: "coding",
  },
  {
    id: "git.feature",
    title: "Feature branches are open to agents",
    why: "Keep low-risk work automatic.",
    when: { effect: ["git.push"], branch: ["feature/*", "feat/*", "copilot/*", "codex/*"] },
    decision: "ALLOW",
    scope: "coding",
  },
  {
    id: "prod.k8s.delete",
    title: "Production deletes need the on-call engineer",
    why: "Destructive, irreversible, production.",
    when: { effect: ["shell.exec"], command: ["kubectl delete * -n prod*", "kubectl delete * --namespace prod*"] },
    decision: "REVIEW",
    approvers: "oncall-sre",
    ttl: "60s",
    scope: "coding",
  },
  {
    id: "prod.db.migrate",
    title: "Coding agents cannot change production schemas",
    why: "Separate code autonomy from production authority.",
    when: { effect: ["database.migrate"], env: ["production"], subject: CODING },
    decision: "BLOCK",
    scope: "coding",
  },
  {
    id: "db.prod.write",
    title: "No destructive SQL on production",
    why: "UPDATE, DELETE or DROP on production tables.",
    when: { effect: ["database.write"], env: ["production"] },
    decision: "BLOCK",
    scope: "all",
  },
  {
    id: "pii.read",
    title: "Customer PII is masked for agents",
    why: "Agents get the answer, not the raw contact data.",
    when: { effect: ["database.read"], columns: ["email", "phone", "pan", "aadhaar"] },
    decision: "CONSTRAIN",
    constrain: "mask",
    scope: "all",
  },
  {
    id: "payments.refund",
    title: "Refund tiers",
    why: "Any refund route: Stripe MCP, Razorpay MCP, SDK or REST.",
    when: { effect: ["payments.refund"] },
    unit: "USD",
    tiers: [
      { max: 500, decision: "ALLOW" },
      { max: 5000, decision: "REVIEW", approvers: "payments-manager", quorum: 1 },
      { max: null, decision: "BLOCK" },
    ],
    scope: "business",
  },
  {
    id: "claims.payout",
    title: "Claims payout tiers",
    why: "Two-person rule above ₹2,00,000.",
    when: { effect: ["claims.payout"] },
    unit: "INR",
    tiers: [
      { max: 25000, decision: "ALLOW" },
      { max: 200000, decision: "REVIEW", approvers: "claims-manager", quorum: 1 },
      { max: null, decision: "REVIEW", approvers: "claims-manager", quorum: 2 },
    ],
    scope: "business",
  },
  {
    id: "crm.discount",
    title: "Discount authority",
    why: "Commercial commitments need the right human.",
    when: { effect: ["crm.apply_discount"] },
    unit: "%",
    tiers: [
      { max: 10, decision: "ALLOW" },
      { max: 25, decision: "REVIEW", approvers: "sales-manager", quorum: 1 },
      { max: null, decision: "REVIEW", approvers: "vp-sales", quorum: 1 },
    ],
    scope: "business",
  },
  {
    id: "browser.payment",
    title: "Browser payments are gated at the final click",
    why: "The permit binds payee, account and amount.",
    when: { effect: ["payment.submit"] },
    decision: "REVIEW",
    approvers: "finance-controller",
    ttl: "60s",
    scope: "business",
  },
  {
    id: "agent.delegate",
    title: "Children never exceed their parent",
    why: "Authority attenuates on every handoff.",
    when: { effect: ["purchase.order"] },
    attenuate: true,
    scope: "all",
  },
];

/* ---------- Policy packs: the starting point for a new contract ---------- */
export const PACKS: { id: string; name: string; rules: string[]; ex: string; rec?: boolean }[] = [
  { id: "secrets", name: "Secrets & credentials", rules: ["secrets.read", "network.egress"], ex: "Agents never read .env files or send credentials to unknown domains.", rec: true },
  { id: "git", name: "Source control", rules: ["git.main", "git.force", "git.feature"], ex: "Main stays human-only, force-pushes are made safe, feature branches stay automatic.", rec: true },
  { id: "prod", name: "Production infrastructure", rules: ["prod.k8s.delete", "prod.db.migrate", "db.prod.write"], ex: "Prod deletes need on-call; no schema changes or destructive SQL from agents.", rec: true },
  { id: "pii", name: "Customer data (PII)", rules: ["pii.read"], ex: "Email and phone are masked for agents and results are capped.", rec: true },
  { id: "payments", name: "Payments & refunds", rules: ["payments.refund"], ex: "Automatic up to a limit, then a manager, then blocked.", rec: true },
  { id: "claims", name: "Claims payouts", rules: ["claims.payout"], ex: "Two claims managers above ₹2,00,000." },
  { id: "commercial", name: "Commercial actions", rules: ["crm.discount"], ex: "Discounts above 25% need VP Sales." },
  { id: "browser", name: "Browser payments", rules: ["browser.payment"], ex: "The final “Submit payment” click needs the finance controller." },
  { id: "delegation", name: "Agent delegation", rules: ["agent.delegate"], ex: "A subagent never gets more authority than its parent.", rec: true },
];
export const rulesForPacks = (ids: string[]) => INITIAL_RULES.filter((r) => PACKS.some((p) => ids.includes(p.id) && p.rules.includes(r.id)));

/* ---------- Display ---------- */
export function ruleChips(r: Rule): [string, string][] {
  const w = r.when;
  const out: [string, string][] = [["effect", w.effect.join(" | ")]];
  if (w.path) out.push(["path", w.path.join(", ")]);
  if (w.command) out.push(["command", w.command.join(", ")]);
  if (w.branch) out.push(["branch", w.branch.join(", ")]);
  if (w.env) out.push(["env", w.env.join(", ")]);
  if (w.columns) out.push(["columns", w.columns.join(", ")]);
  if (w.subject) out.push(["agents", w.subject.includes("ide") && w.subject.length === 3 ? "coding agents" : w.subject.join(", ")]);
  if (w.destinationNotIn) out.push(["destination", "not in allowlist"]);
  if (w.credentials) out.push(["carries", "credentials"]);
  return out;
}

const q = (s: string) => JSON.stringify(s);
const list = (xs: string[]) => (xs.length === 1 && /^[\w.\-/]+$/.test(xs[0]) ? xs[0] : `[${xs.map(q).join(", ")}]`);

export function toYaml(rules: Rule[], version: number): string {
  const out: string[] = [`# wrapbox.yaml · v${version}`, `# One contract for every agent in the org`, `version: 1`, `org: wrapbox`, `default: ALLOW`, ``, `rules:`];
  if (!rules.length) out.push(`  []   # empty — every action is allowed by default`);
  for (const r of rules) {
    out.push(`  - id: ${r.id}`);
    out.push(`    title: ${q(r.title)}`);
    if (r.why) out.push(`    why: ${q(r.why)}`);
    out.push(`    when:`);
    out.push(`      effect: ${list(r.when.effect)}`);
    if (r.when.path) out.push(`      path: ${list(r.when.path)}`);
    if (r.when.command) out.push(`      command: ${list(r.when.command)}`);
    if (r.when.branch) out.push(`      branch: ${list(r.when.branch)}`);
    if (r.when.env) out.push(`      env: ${list(r.when.env)}`);
    if (r.when.columns) out.push(`      columns: ${list(r.when.columns)}`);
    if (r.when.subject) out.push(`      agents: ${list(r.when.subject)}`);
    if (r.when.destinationNotIn) out.push(`      destination_not_in: ${list(r.when.destinationNotIn)}`);
    if (r.when.credentials) out.push(`      carries_credentials: true`);
    if (r.decision) out.push(`    decision: ${r.decision}`);
    if (r.constrain) out.push(`    constrain: ${r.constrain}`);
    if (r.approvers) out.push(`    approvers: ${r.approvers}`);
    if (r.quorum && r.quorum > 1) out.push(`    quorum: ${r.quorum}`);
    if (r.ttl) out.push(`    permit_ttl: ${r.ttl}`);
    if (r.attenuate) out.push(`    attenuate: true`);
    if (r.unit && r.tiers) out.push(`    unit: ${r.unit === "%" ? '"%"' : r.unit}`);
    if (r.tiers) {
      out.push(`    tiers:`);
      r.tiers.forEach((t, i) => {
        const cond = t.max === null ? `gt: ${r.tiers![i - 1]?.max ?? 0}` : `lte: ${t.max}`;
        const extra = [t.approvers ? `approvers: ${t.approvers}` : "", t.quorum && t.quorum > 1 ? `quorum: ${t.quorum}` : ""].filter(Boolean);
        out.push(`      - { ${[cond, `decision: ${t.decision}`, ...extra].join(", ")} }`);
      });
    }
    if (r.mode === "observe") out.push(`    mode: observe`);
    if (r.scope !== "all") out.push(`    scope: ${r.scope}`);
  }
  return out.join("\n");
}

/* ---------- Parse: YAML you type becomes the contract ---------- */
export interface ParseIssue {
  line?: number;
  msg: string;
}
const DECISIONS = ["ALLOW", "CONSTRAIN", "REVIEW", "BLOCK"];
const arr = (v: unknown): string[] | undefined => (v === undefined || v === null ? undefined : Array.isArray(v) ? v.map(String) : [String(v)]);

export function fromYaml(text: string): { rules: Rule[]; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];
  let doc: unknown;
  try {
    doc = load(text);
  } catch (e) {
    const ex = e as YAMLException & { mark?: { line: number } };
    return { rules: [], issues: [{ line: (ex.mark?.line ?? 0) + 1, msg: ex.reason ?? String(e) }] };
  }
  const lines = text.split("\n");
  const lineOf = (id: string) => {
    const i = lines.findIndex((l) => new RegExp(`id:\\s*${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`).test(l));
    return i >= 0 ? i + 1 : undefined;
  };
  const root = (doc ?? {}) as Record<string, unknown>;
  const raw = root.rules ?? [];
  if (!Array.isArray(raw)) return { rules: [], issues: [{ msg: "`rules` must be a list" }] };
  const seen = new Set<string>();
  const rules: Rule[] = [];
  raw.forEach((x, i) => {
    const r = (x ?? {}) as Record<string, unknown>;
    const id = String(r.id ?? `rule-${i + 1}`);
    const line = lineOf(id);
    if (!r.id) issues.push({ line, msg: `rule ${i + 1} has no id` });
    if (seen.has(id)) issues.push({ line, msg: `duplicate id “${id}”` });
    seen.add(id);
    const w = (r.when ?? {}) as Record<string, unknown>;
    const effect = arr(w.effect);
    if (!effect?.length) {
      issues.push({ line, msg: `${id}: when.effect is required` });
      return;
    }
    for (const e of effect) if (!effectInfo(e)) issues.push({ line, msg: `${id}: unknown effect “${e}” — try ${EFFECTS.slice(0, 3).map((x) => x.id).join(", ")}…` });
    const decision = r.decision ? String(r.decision).toUpperCase() : undefined;
    if (decision && !DECISIONS.includes(decision)) issues.push({ line, msg: `${id}: decision must be ALLOW, CONSTRAIN, REVIEW or BLOCK` });
    const tiersRaw = Array.isArray(r.tiers) ? (r.tiers as Record<string, unknown>[]) : undefined;
    if (!decision && !tiersRaw && !r.attenuate) issues.push({ line, msg: `${id}: needs a decision, tiers or attenuate: true` });
    if (decision === "REVIEW" && !r.approvers) issues.push({ line, msg: `${id}: REVIEW needs approvers (an approver group)` });
    if (decision === "CONSTRAIN" && !r.constrain) issues.push({ line, msg: `${id}: CONSTRAIN needs constrain: mask or force-with-lease` });
    const tiers: Tier[] | undefined = tiersRaw?.map((t) => ({
      max: t.lte !== undefined ? Number(t.lte) : null,
      decision: String(t.decision ?? "ALLOW").toUpperCase() as Decision,
      approvers: t.approvers ? String(t.approvers) : undefined,
      quorum: t.quorum ? Number(t.quorum) : undefined,
    }));
    rules.push({
      id,
      title: String(r.title ?? id),
      why: String(r.why ?? ""),
      when: {
        effect,
        path: arr(w.path),
        command: arr(w.command),
        branch: arr(w.branch),
        env: arr(w.env),
        columns: arr(w.columns),
        subject: arr(w.agents) as CategoryId[] | undefined,
        destinationNotIn: arr(w.destination_not_in),
        credentials: w.carries_credentials ? true : undefined,
      },
      decision: decision as Decision | undefined,
      approvers: r.approvers ? String(r.approvers) : undefined,
      quorum: r.quorum ? Number(r.quorum) : undefined,
      ttl: r.permit_ttl ? String(r.permit_ttl) : undefined,
      tiers,
      unit: r.unit ? (String(r.unit) as Rule["unit"]) : undefined,
      attenuate: r.attenuate ? true : undefined,
      constrain: r.constrain ? (String(r.constrain) as Rule["constrain"]) : undefined,
      scope: (r.scope as Rule["scope"]) ?? "all",
      mode: r.mode === "observe" ? "observe" : undefined,
      custom: !INITIAL_RULES.some((x) => x.id === id) || undefined,
    });
  });
  return { rules, issues };
}

/* ---------- Tiers + replay ---------- */
export function evalTier(rule: Rule, value: number): { decision: Decision; tier: number; approvers?: string; quorum?: number } {
  const tiers = rule.tiers ?? [];
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    if (t.max === null || value <= t.max) return { decision: t.decision, tier: i, approvers: t.approvers, quorum: t.quorum };
  }
  return { decision: "ALLOW", tier: -1 };
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function logSeries(seed: number, n: number, lo: number, hi: number) {
  const r = mulberry32(seed);
  const a = Math.log(lo),
    b = Math.log(hi);
  return Array.from({ length: n }, () => Math.round(Math.exp(a + (b - a) * Math.pow(r(), 1.6))));
}

export const HISTORY: Record<string, number[]> = {
  "payments.refund": logSeries(7, 1240, 5, 12000),
  "claims.payout": logSeries(11, 860, 1500, 480000),
  "crm.discount": logSeries(19, 310, 1, 48),
};

export interface ReplayResult {
  total: number;
  changed: number;
  newlyBlocked: number;
  newlyReview: number;
  newlyAllowed: number;
  samples: { rule: string; value: number; unit: string; from: Decision; to: Decision }[];
}

export function replay(draft: Rule[], published: Rule[]): ReplayResult {
  const res: ReplayResult = { total: 0, changed: 0, newlyBlocked: 0, newlyReview: 0, newlyAllowed: 0, samples: [] };
  for (const id of Object.keys(HISTORY)) {
    const d = draft.find((r) => r.id === id);
    const p = published.find((r) => r.id === id);
    for (const v of HISTORY[id]) {
      res.total++;
      const a: Decision = p?.tiers ? evalTier(p, v).decision : "ALLOW";
      const b: Decision = d?.tiers ? evalTier(d, v).decision : "ALLOW";
      if (a !== b) {
        res.changed++;
        if (b === "BLOCK") res.newlyBlocked++;
        else if (b === "REVIEW") res.newlyReview++;
        else res.newlyAllowed++;
        if (res.samples.length < 6) res.samples.push({ rule: id, value: v, unit: (d ?? p)?.unit ?? "", from: a, to: b });
      }
    }
  }
  const ids = new Set([...draft, ...published].filter((r) => !r.tiers).map((r) => r.id));
  for (const id of ids) {
    const r = draft.find((x) => x.id === id);
    const p = published.find((x) => x.id === id);
    const volume = FIXED_VOLUME[id] ?? 40;
    res.total += volume;
    const from: Decision = p && p.mode !== "observe" ? (p.decision ?? "ALLOW") : "ALLOW";
    const to: Decision = r && r.mode !== "observe" ? (r.decision ?? "ALLOW") : "ALLOW";
    if (from !== to) {
      res.changed += volume;
      if (to === "BLOCK") res.newlyBlocked += volume;
      else if (to === "REVIEW" || to === "CONSTRAIN") res.newlyReview += volume;
      else res.newlyAllowed += volume;
      res.samples.push({ rule: id, value: volume, unit: "actions", from, to });
    }
  }
  return res;
}

const FIXED_VOLUME: Record<string, number> = {
  "secrets.read": 212,
  "git.main": 64,
  "git.force": 31,
  "git.feature": 3810,
  "prod.k8s.delete": 18,
  "prod.db.migrate": 9,
  "db.prod.write": 41,
  "browser.payment": 57,
  "network.egress": 23,
  "pii.read": 388,
};

export function fmtValue(v: number, unit?: string) {
  if (unit === "INR") return "₹" + v.toLocaleString("en-IN");
  if (unit === "USD") return "$" + v.toLocaleString("en-US");
  if (unit === "%") return v + "%";
  return v.toLocaleString("en-US") + (unit ? " " + unit : "");
}

/** Stable signature for "did this rule change?" — ignores key order and cosmetic fields. */
function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.keys(v as object)
        .sort()
        .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
        .map((k) => [k, sortDeep((v as Record<string, unknown>)[k])]),
    );
  return v;
}
export function ruleSig(r: Rule) {
  const norm = { ...r, custom: undefined, why: undefined, quorum: r.quorum && r.quorum > 1 ? r.quorum : undefined, tiers: r.tiers?.map((t) => ({ ...t, quorum: t.quorum && t.quorum > 1 ? t.quorum : undefined })) };
  return JSON.stringify(sortDeep(norm));
}
