/* Test a single rule.
 *
 * Everything here is derived from the rule itself: the inputs shown are the ones the rule's effect
 * actually uses, the agent list is limited to the categories the rule applies to, and the verdict
 * comes from the same engine that runs in production (checkRule + evaluate). There is no separate
 * demo logic that could disagree with the YAML.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { AGENTS, CATEGORIES, agentById, type CategoryId } from "../data/agents";
import { effectInfo, type Rule } from "../data/contract";
import { checkRule, evaluate, type Act, type Env } from "../lib/engine";
import { DecisionPill, cn } from "./ui";

const ENVS: Env[] = ["production", "staging", "development"];
const catName = (c: CategoryId) => CATEGORIES.find((x) => x.id === c)?.name ?? c;

/** Which inputs an effect can actually use — never show a field the rule can't match on. */
export function inputsFor(effect: string): ("path" | "command" | "branch" | "columns" | "destination" | "amount" | "sql" | "env")[] {
  switch (effect) {
    case "filesystem.read":
    case "filesystem.write":
      return ["path", "env"];
    case "shell.exec":
      return ["command", "env"];
    case "git.push":
      return ["branch", "command"];
    case "git.merge":
      return ["branch"];
    case "database.read":
      return ["columns", "sql", "env"];
    case "database.write":
    case "database.migrate":
      return ["sql", "env"];
    case "network.egress":
      return ["destination", "env"];
    case "payments.refund":
    case "claims.payout":
    case "crm.apply_discount":
    case "payment.submit":
    case "purchase.order":
      return ["amount"];
    default:
      return ["env"];
  }
}

/* Turn a glob from the rule into a concrete example that matches it. */
const fromGlob = (g: string, kind: "path" | "text") => {
  if (kind === "path") {
    let p = g.replace(/\*\*\//g, "src/").replace(/\/\*\*/g, "/001_users.sql");
    p = p.replace(/\.env\*/, ".env.production").replace(/\*/g, "file");
    return p.startsWith("/") || p.startsWith("src/") ? p : `src/${p}`;
  }
  return g.replace(/\s*\*\s*$/, " -auto-approve").replace(/\*/g, "").replace(/\s+/g, " ").trim();
};

/** A starting action that satisfies the rule, so the tester opens on a matching case. */
function seedAct(r: Rule): Act {
  const effect = r.when.effect[0];
  const a: Act = { effect };
  const inputs = inputsFor(effect);
  if (inputs.includes("path")) a.path = r.when.path?.[0] ? fromGlob(r.when.path[0], "path") : "src/app/config.ts";
  if (inputs.includes("command")) a.command = r.when.command?.[0] ? fromGlob(r.when.command[0], "text") : "npm test";
  if (inputs.includes("branch")) a.branch = r.when.branch?.[0]?.replace(/\*/g, "x") ?? "feat/ledger";
  if (inputs.includes("columns")) a.columns = r.when.columns ?? ["email"];
  if (inputs.includes("destination")) a.destination = "paste.example.com";
  if (r.when.credentials) a.credentials = true;
  if (inputs.includes("sql")) {
    a.sql = effect === "database.read" ? `SELECT ${(r.when.columns ?? ["email"]).join(", ")} FROM customers LIMIT 50` : effect === "database.migrate" ? "ALTER TABLE invoices ADD COLUMN cycle text" : "DELETE FROM orders WHERE created_at < '2024-01-01'";
  }
  if (inputs.includes("amount")) {
    const first = r.tiers?.[0]?.max;
    const v = typeof first === "number" ? Math.max(1, Math.floor(first / 2)) : 100;
    a.amount = v;
    if (r.unit === "USD" || !r.unit) a.amountUsd = v;
    if (effect === "purchase.order") a.budget = typeof first === "number" ? first : 10000;
  }
  a.env = (r.when.env?.[0] as Env) ?? "development";
  return a;
}

/** An agent whose category the rule applies to, so the default case matches. */
function seedAgent(r: Rule): string {
  const subject = r.when.subject;
  if (subject?.length) {
    const a = AGENTS.find((x) => subject.includes(x.category));
    if (a) return a.id;
  }
  const e = r.when.effect[0];
  const byEffect = e.startsWith("payments") ? "stripe-mcp" : e === "claims.payout" ? "langgraph" : e === "crm.apply_discount" ? "agentforce" : e === "payment.submit" ? "browser-use" : e === "purchase.order" ? "openai-handoffs" : e.startsWith("database") ? "postgres-mcp" : "claude-code";
  return AGENTS.some((x) => x.id === byEffect) ? byEffect : AGENTS[0].id;
}

const inputCls = "w-full h-9 rounded-lg border border-line bg-surface px-2.5 font-mono text-[12px] outline-none focus:border-fg-3";

export function RuleTester({ rule }: { rule: Rule }) {
  const effect = rule.when.effect[0];
  const info = effectInfo(effect);
  const inputs = inputsFor(effect);
  // Re-seed whenever the effect or its conditions change, so stale inputs can never linger.
  const seedKey = JSON.stringify({ e: effect, w: rule.when, t: rule.tiers?.map((t) => t.max), u: rule.unit });
  const [act, setAct] = useState<Act>(() => seedAct(rule));
  const [agentId, setAgentId] = useState(() => seedAgent(rule));
  useEffect(() => {
    setAct(seedAct(rule));
    setAgentId(seedAgent(rule));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  const agent = agentById(agentId);
  const set = (p: Partial<Act>) => setAct((a) => ({ ...a, ...p }));

  const { checks, verdict } = useMemo(() => {
    const one: Rule = { ...rule, id: rule.id || "this-rule", mode: undefined };
    return { checks: checkRule(one, act, agent.category).checks, verdict: evaluate(act, [one], agent.category) };
  }, [rule, act, agent.category]);
  const matched = checks.every((c) => c.ok);

  return (
    <div className="space-y-3">
      <div>
        <div className="text-[11.5px] font-medium text-fg-2 mb-1">Agent</div>
        <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-[12.5px]">
          {AGENTS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {catName(a.category)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {inputs.includes("path") && (
          <Labeled label="File path">
            <input className={inputCls} value={act.path ?? ""} onChange={(e) => set({ path: e.target.value })} />
          </Labeled>
        )}
        {inputs.includes("command") && (
          <Labeled label="Command">
            <input className={inputCls} value={act.command ?? ""} onChange={(e) => set({ command: e.target.value })} />
          </Labeled>
        )}
        {inputs.includes("branch") && (
          <Labeled label="Branch">
            <input className={inputCls} value={act.branch ?? ""} onChange={(e) => set({ branch: e.target.value })} />
          </Labeled>
        )}
        {inputs.includes("columns") && (
          <Labeled label="Columns read (comma separated)">
            <input className={inputCls} value={(act.columns ?? []).join(", ")} onChange={(e) => set({ columns: e.target.value.split(",").map((c) => c.trim()).filter(Boolean) })} />
          </Labeled>
        )}
        {inputs.includes("destination") && (
          <>
            <Labeled label="Destination domain">
              <input className={inputCls} value={act.destination ?? ""} onChange={(e) => set({ destination: e.target.value })} />
            </Labeled>
            <Labeled label="Payload">
              <label className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-[12px]">
                <input type="checkbox" checked={!!act.credentials} onChange={(e) => set({ credentials: e.target.checked })} />
                carries credentials
              </label>
            </Labeled>
          </>
        )}
        {inputs.includes("sql") && (
          <Labeled label="SQL" wide>
            <input
              className={inputCls}
              value={act.sql ?? ""}
              onChange={(e) => {
                const sql = e.target.value;
                const cols = (sql.match(/select\s+(.*?)\s+from/i)?.[1] ?? "").split(",").map((c) => c.trim().split(/\s+/)[0].replace(/.*\./, "").toLowerCase()).filter(Boolean);
                set({ sql, ...(effect === "database.read" ? { columns: cols } : {}) });
              }}
            />
          </Labeled>
        )}
        {inputs.includes("amount") && (
          <Labeled label={`Amount${info?.unit ? ` (${info.unit})` : ""}`}>
            <input
              type="number"
              className={inputCls}
              value={act.amount ?? 0}
              onChange={(e) => {
                const v = Number(e.target.value) || 0;
                set({ amount: v, ...(info?.unit === "USD" || !info?.unit ? { amountUsd: v } : {}) });
              }}
            />
          </Labeled>
        )}
        {effect === "purchase.order" && (
          <Labeled label="Budget its parent delegated (USD)">
            <input type="number" className={inputCls} value={act.budget ?? 0} onChange={(e) => set({ budget: Number(e.target.value) || 0 })} />
          </Labeled>
        )}
        {inputs.includes("env") && (
          <Labeled label="Environment">
            <select value={act.env ?? "development"} onChange={(e) => set({ env: e.target.value as Env })} className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-[12.5px]">
              {ENVS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Labeled>
        )}
      </div>

      <div className="rounded-lg bg-surface-2 p-3">
        <div className="space-y-1">
          {checks.map((c) => (
            <div key={c.field} className={cn("flex items-start gap-1.5 font-mono text-[11.5px]", c.ok ? "text-fg-2" : "text-block")}>
              {c.ok ? <Check className="mt-0.5 size-3 shrink-0 text-allow" strokeWidth={3} /> : <X className="mt-0.5 size-3 shrink-0" strokeWidth={3} />}
              <span>{c.detail}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2 text-[12.5px]">
          {matched ? (
            <>
              <span className="text-fg-3">→</span>
              <DecisionPill d={verdict.decision} size="sm" />
              {verdict.approvers && (
                <span className="font-mono text-[11.5px] text-fg-2">
                  {verdict.approvers}
                  {verdict.quorum && verdict.quorum > 1 ? ` · ${verdict.quorum} people` : ""}
                </span>
              )}
              {verdict.constrain && <span className="font-mono text-[11.5px] text-fg-2">rewrite: {verdict.constrain}</span>}
              <span className="text-fg-3">{verdict.reason}</span>
            </>
          ) : (
            <span className="font-semibold text-fg-2">→ DOESN'T MATCH — this action falls through to the rest of the contract</span>
          )}
        </div>
      </div>
    </div>
  );
}

function Labeled({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={cn("block", wide && "sm:col-span-2")}>
      <span className="text-[11.5px] font-medium text-fg-2">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
