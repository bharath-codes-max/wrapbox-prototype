import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Lock, Play, Plug, Search, Send, Unplug } from "lucide-react";
import { useMemo, useState } from "react";
import { AGENTS, ASSURANCE, CATEGORIES, METHODS, agentById, categoryById, type Agent, type CategoryId } from "../data/agents";
import { scenarioFor } from "../data/scenarios";
import { CodeBlock, InlineCmd } from "../components/code";
import { FlowRunner } from "../components/runner";
import { DecisionStream } from "../components/stream";
import { AssuranceBadge, Button, Card, Chip, CopyButton, DecisionPill, Logo, Modal, PageHeader, Segmented, cn } from "../components/ui";
import { ago, go } from "../lib/router";
import { EMPLOYEE, NONE, getState, connectAgent, disconnectAgent, setState, toast, useStore } from "../lib/store";
import { EvidenceDrawer } from "./evidence";
import type { Evt } from "../lib/store";

/* ================= Catalog ================= */

export function AgentsPage({ query }: { query: URLSearchParams }) {
  const role = useStore((s) => s.role);
  const connected = useStore((s) => s.connected);
  const allowed = useStore((s) => s.allowed[EMPLOYEE.id] ?? NONE);
  const requests = useStore((s) => s.requests);
  const [f, setF] = useState<"all" | "on" | "off">("all");
  const [q, setQ] = useState("");
  const [req, setReq] = useState<Agent | null>(null);
  const focus = query.get("c") as CategoryId | null;
  const mine = role === "employee";

  const list = (c: CategoryId) =>
    AGENTS.filter(
      (a) =>
        a.category === c &&
        (!q || (a.name + a.vendor).toLowerCase().includes(q.toLowerCase())) &&
        (f === "all" || (f === "on" ? !!connected[a.id] : !connected[a.id])),
    );

  return (
    <div className="mx-auto max-w-[1280px] px-4 lg:px-8 py-7">
      <PageHeader
        eyebrow={mine ? "Enabled for you by your admin" : "8 platform categories · 25 integrations"}
        title={mine ? "My agents" : "Agents"}
        sub={
          mine
            ? "These agents are protected on your laptop. Anything else needs your admin's approval — request it below."
            : "Connect an agent once and the intent contract follows it. Every card says how Wrapbox plugs in and how strong that guarantee is."
        }
        right={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 h-8 rounded-full border border-line bg-surface px-3 w-[220px]">
              <Search className="size-3.5 text-fg-3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter agents" className="flex-1 bg-transparent outline-none text-[12.5px] placeholder:text-fg-3" />
            </div>
            {!mine && (
              <Segmented
                size="sm"
                value={f}
                onChange={setF}
                options={[
                  { value: "all", label: "All" },
                  { value: "on", label: "Connected" },
                  { value: "off", label: "Available" },
                ]}
              />
            )}
          </div>
        }
      />

      {mine && (
        <Card className="p-5 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[260px]">
              <div className="text-[14px] font-semibold">Protect every agent on this laptop</div>
              <div className="text-[12.5px] text-fg-3 mt-0.5">Installs managed hooks for Cursor, Claude Code and Codex CLI, signed in as dev.k@wrapbox.ai.</div>
            </div>
            <InlineCmd cmd="npx @wrapbox/cli install --all --org wrapbox" className="w-full md:w-[440px]" />
          </div>
          <div className="mt-4 grid sm:grid-cols-3 gap-2">
            {allowed.map((id) => {
              const a = agentById(id);
              return (
                <a key={id} href={`#/agents/${id}`} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 hover:border-line-strong">
                  <Logo name={a.logo} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold truncate">{a.name}</div>
                    <div className="text-[11.5px] text-allow flex items-center gap-1">
                      <CheckCircle2 className="size-3" /> Protected · checked in 2m ago
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </Card>
      )}

      <div className="space-y-8">
        {CATEGORIES.filter((c) => !focus || c.id === focus).map((c) => {
          const items = list(c.id);
          if (!items.length) return null;
          return (
            <section key={c.id}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
                <span className="font-mono text-[11px] text-fg-3">{String(c.n).padStart(2, "0")}</span>
                <h2 className="text-[16px] font-semibold">{c.name}</h2>
                <Chip tone={c.timing === "NOW" ? "allow" : c.timing === "NEXT" ? "accent" : "muted"}>{c.timing}</Chip>
                <span className="text-[12.5px] text-fg-3">{c.method}</span>
                <a href={`#/flows/${c.scenario}`} className="ml-auto text-[12.5px] font-medium text-accent inline-flex items-center gap-1">
                  Happy flow <ArrowRight className="size-3" />
                </a>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {items.map((a) => {
                  const on = connected[a.id];
                  const isAllowed = !mine || allowed.includes(a.id);
                  const requested = requests.find((r) => r.agentId === a.id && r.person.id === EMPLOYEE.id);
                  return (
                    <div key={a.id} className={cn("group flex flex-col rounded-2xl border bg-surface p-4 transition-all", on ? "border-line hover:border-line-strong hover:shadow-card" : "border-dashed border-line-strong")}>
                      <div className="flex items-start gap-3">
                        <Logo name={a.logo} bleed={a.bleed} size={40} rounded="rounded-xl" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px] font-semibold leading-tight">{a.name}</div>
                          <div className="text-[12px] text-fg-3">{a.vendor}</div>
                        </div>
                        {on ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-allow-soft px-2 py-0.5 text-[11px] font-medium text-allow">
                            <span className="size-1.5 rounded-full bg-allow" /> Connected
                          </span>
                        ) : (
                          <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-fg-3">Available</span>
                        )}
                      </div>
                      <div className="mt-3 font-mono text-[11px] text-fg-2 truncate" title={a.file}>
                        {a.file}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {a.hookEvents.slice(0, 3).map((h) => (
                          <span key={h} className="rounded border border-line bg-surface-2 px-1.5 py-px font-mono text-[10.5px] text-fg-3">
                            {h}
                          </span>
                        ))}
                      </div>
                      <div className="mt-auto pt-4 flex items-center justify-between gap-2">
                        {on ? <AssuranceBadge a={on.assurance} /> : <span className="text-[11.5px] text-fg-3">{METHODS[a.category].find((m) => m.recommended)?.name}</span>}
                        {isAllowed ? (
                          <Button size="sm" variant={on ? "secondary" : "primary"} onClick={() => go(`/agents/${a.id}`)}>
                            {on ? "Manage" : "Connect"}
                          </Button>
                        ) : requested ? (
                          <Chip tone="review">Requested</Chip>
                        ) : (
                          <Button size="sm" onClick={() => setReq(a)}>
                            <Lock className="size-3" /> Request
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <RequestModal agent={req} onClose={() => setReq(null)} />
    </div>
  );
}

function RequestModal({ agent, onClose }: { agent: Agent | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  return (
    <Modal open={!!agent} onClose={onClose}>
      {agent && (
        <div className="p-5">
          <div className="flex items-center gap-3">
            <Logo name={agent.logo} bleed={agent.bleed} size={36} />
            <div>
              <div className="text-[15px] font-semibold">Request access to {agent.name}</div>
              <div className="text-[12.5px] text-fg-3">Your admin will see this in Team & access.</div>
            </div>
          </div>
          <label className="block mt-4">
            <span className="text-[12px] font-medium">What will you use it for?</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Generating integration tests for the claims service"
              className="mt-1 w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-[13px] outline-none focus:border-accent"
            />
          </label>
          <p className="mt-2 text-[12px] text-fg-3">Once approved, the same contract applies to it automatically — no new rules to learn.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setState((s) => ({
                  requests: [{ id: "rq-" + Date.now(), kind: "agent" as const, person: EMPLOYEE, agentId: agent.id, reason: reason || "Requested from My agents", status: "pending", at: Date.now() }, ...s.requests],
                }));
                toast("Request sent", `${agent.name} · waiting for Priya Menon`, "review");
                setReason("");
                onClose();
              }}
            >
              <Send className="size-3.5" /> Send request
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ================= Detail ================= */

export function AgentDetail({ id, query }: { id: string; query: URLSearchParams }) {
  const agent = AGENTS.find((a) => a.id === id);
  const conn = useStore((s) => (agent ? s.connected[agent.id] : undefined));
  const role = useStore((s) => s.role);
  const allowed = useStore((s) => s.allowed[EMPLOYEE.id] ?? NONE);
  const [tab, setTab] = useState<"connect" | "flow" | "activity">((query.get("tab") as "flow") ?? "connect");
  if (!agent) return <div className="p-10">Unknown agent.</div>;
  const cat = categoryById(agent.category);
  const locked = role === "employee" && !allowed.includes(agent.id);

  return (
    <div className="mx-auto max-w-[1280px] px-4 lg:px-8 py-7">
      <a href="#/agents" className="inline-flex items-center gap-1.5 text-[12.5px] text-fg-3 hover:text-fg mb-4">
        <ArrowLeft className="size-3.5" /> All agents
      </a>
      <div className="flex flex-wrap items-center gap-4 mb-5">
        <Logo name={agent.logo} bleed={agent.bleed} size={56} rounded="rounded-2xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[24px] font-semibold tracking-tight">{agent.name}</h1>
            {conn ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-allow-soft px-2 py-0.5 text-[11.5px] font-medium text-allow">
                <span className="size-1.5 rounded-full bg-allow live-dot" /> Connected {ago(conn.at)}
              </span>
            ) : (
              <span className="rounded-full border border-line px-2 py-0.5 text-[11.5px] text-fg-3">Not connected</span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-fg-3">
            <span>{agent.vendor}</span>
            <span>·</span>
            <a href={`#/agents?c=${cat.id}`} className="hover:text-fg">
              Category {cat.n} · {cat.name}
            </a>
            <span>·</span>
            <span>owner {agent.owner}</span>
            <span>·</span>
            <span>{agent.env}</span>
            {conn && <AssuranceBadge a={conn.assurance} />}
          </div>
        </div>
        <div className="flex gap-2">
          {conn && role === "admin" && (
            <Button
              variant="ghost"
              onClick={() => {
                disconnectAgent(agent.id);
                toast(`${agent.name} disconnected`, "Its hook now fails closed until reconnected.", "block");
              }}
            >
              <Unplug className="size-3.5" /> Disconnect
            </Button>
          )}
          <Button variant="primary" onClick={() => setTab("flow")}>
            <Play className="size-3.5 fill-current" /> Run happy flow
          </Button>
        </div>
      </div>

      <div className="mb-5 border-b border-line flex gap-5">
        {(
          [
            ["connect", conn ? "Connection" : "Connect"],
            ["flow", "Happy flow"],
            ["activity", "Activity"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("relative pb-2.5 text-[13.5px] font-medium transition-colors", tab === k ? "text-fg" : "text-fg-3 hover:text-fg-2")}>
            {l}
            {tab === k && <motion.span layoutId="agent-tab" className="absolute left-0 right-0 -bottom-px h-0.5 bg-fg rounded-full" />}
          </button>
        ))}
      </div>

      {tab === "connect" &&
        (locked ? (
          <Card className="p-8 text-center">
            <Lock className="mx-auto size-6 text-fg-3" />
            <div className="mt-3 font-semibold">Not enabled for you</div>
            <p className="mt-1 text-[13px] text-fg-3">Request access from My agents. Your admin connects it once for the org.</p>
          </Card>
        ) : (
          <ConnectWizard agent={agent} onRun={() => setTab("flow")} />
        ))}
      {tab === "flow" && <FlowRunner key={agent.id} scenario={scenarioFor(agent)} agent={agent} />}
      {tab === "activity" && <AgentActivity agent={agent} />}
    </div>
  );
}

function AgentActivity({ agent }: { agent: Agent }) {
  const events = useStore((s) => s.events);
  const [open, setOpen] = useState<Evt | null>(null);
  const mine = useMemo(() => events.filter((e) => e.agentId === agent.id), [events, agent.id]);
  const c = { ALLOW: 0, CONSTRAIN: 0, REVIEW: 0, BLOCK: 0 };
  mine.forEach((e) => c[e.decision]++);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <Card className="overflow-hidden">
        {mine.length ? <DecisionStream events={mine} limit={30} onPick={setOpen} /> : <div className="p-10 text-center text-[13px] text-fg-3">No decisions yet. Run the happy flow to generate some.</div>}
      </Card>
      <Card className="p-5 h-fit space-y-3">
        <div className="text-[13.5px] font-semibold">In this session</div>
        {(["ALLOW", "CONSTRAIN", "REVIEW", "BLOCK"] as const).map((d) => (
          <div key={d} className="flex items-center justify-between">
            <DecisionPill d={d} size="sm" />
            <span className="font-mono tnum">{c[d]}</span>
          </div>
        ))}
      </Card>
      <EvidenceDrawer e={open} onClose={() => setOpen(null)} />
    </div>
  );
}

/* ================= Connect wizard ================= */

const TESTS: Record<CategoryId, [string, "ALLOW" | "REVIEW" | "BLOCK", string][]> = {
  ide: [
    ["Read README.md", "ALLOW", "default"],
    ["Read .env.production", "BLOCK", "secrets.read"],
  ],
  cli: [
    ["Bash(git status)", "ALLOW", "default"],
    ["Read(.env.production)", "BLOCK", "secrets.read"],
    ["Bash(kubectl delete ns payments -n prod)", "REVIEW", "prod.k8s.delete"],
  ],
  cloud: [
    ["git push origin copilot/test-branch", "ALLOW", "git.feature"],
    ["postgres-prod · apply_migration(prod)", "BLOCK", "prod.db.migrate"],
  ],
  custom: [
    ["pay_claim(amount=5000)", "ALLOW", "claims.payout"],
    ["pay_claim(amount=300000)", "REVIEW", "claims.payout"],
  ],
  mcp: [
    ["tools/list", "ALLOW", "default"],
    ["refund_payment(amount=300)", "ALLOW", "payments.refund"],
    ["refund_payment(amount=8000)", "BLOCK", "payments.refund"],
  ],
  saas: [
    ["Apply Discount 5%", "ALLOW", "crm.discount"],
    ["Apply Discount 40%", "REVIEW", "crm.discount"],
  ],
  browser: [
    ["navigate vendor.example", "ALLOW", "default"],
    ["payment.submit $50,000", "REVIEW", "browser.payment"],
  ],
  a2a: [
    ["delegate(budget=$10,000)", "ALLOW", "agent.delegate"],
    ["place_order($100,000)", "BLOCK", "agent.delegate"],
  ],
};

function ConnectWizard({ agent, onRun }: { agent: Agent; onRun: () => void }) {
  const conn = useStore((s) => s.connected[agent.id]);
  const version = useStore((s) => s.version);
  const methods = METHODS[agent.category];
  const [method, setMethod] = useState(conn?.method ?? (methods.find((m) => m.recommended) ?? methods[0]).id);
  const [reveal, setReveal] = useState(false);
  const [log, setLog] = useState<{ t: string; d?: "ALLOW" | "REVIEW" | "BLOCK"; ms?: number; ok?: boolean }[]>([]);
  const [verifying, setVerifying] = useState(false);
  const m = methods.find((x) => x.id === method) ?? methods.find((x) => x.recommended) ?? methods[0];
  const token = `wbx_agt_${agent.id.replace(/-/g, "")}_7Hq29fKc3xT1c9f2`;
  const masked = token.slice(0, 13) + "•".repeat(14) + token.slice(-4);

  async function verify() {
    setVerifying(true);
    setLog([]);
    const push = (l: (typeof log)[number]) => setLog((x) => [...x, l]);
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    await wait(350);
    push({ t: `→ wrapbox ping · ${agent.hookEvents[0]} adapter` });
    await wait(500);
    push({ t: `✓ token valid · org wrapbox · agent ${agent.id}`, ok: true });
    for (const [action, d, rule] of TESTS[agent.category]) {
      await wait(520);
      push({ t: `→ simulated ${agent.hookEvents[0]} · ${action}` });
      await wait(420);
      push({ t: `← ${d} · rule ${rule}`, d, ms: 1 + Math.floor(Math.random() * 4) });
    }
    await wait(500);
    push({ t: `✓ Connected · ${ASSURANCE[m.assurance].label.toLowerCase()} · decisions answered in ${agent.name}'s own format`, ok: true });
    connectAgent(agent.id, method, m.assurance);
    toast(`${agent.name} connected`, `Contract v${getState().version} now applies · ${ASSURANCE[m.assurance].label}`, "allow");
    setVerifying(false);
  }

  const done = !!conn && !verifying;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4 min-w-0">
        {/* Step 1 */}
        <WizardStep n={1} title="Choose how Wrapbox enforces" done>
          <div className="grid gap-2 md:grid-cols-3">
            {methods.map((x) => (
              <button
                key={x.id}
                onClick={() => setMethod(x.id)}
                className={cn("text-left rounded-xl border p-3.5 transition-all", method === x.id ? "border-fg ring-1 ring-fg" : "border-line hover:border-line-strong")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold">{x.name}</span>
                  {x.recommended && <Chip tone="accent">Recommended</Chip>}
                </div>
                <p className="mt-1 text-[12px] text-fg-2 leading-relaxed">{x.desc}</p>
                <AssuranceBadge a={x.assurance} className="mt-2" />
              </button>
            ))}
          </div>
        </WizardStep>

        {/* Step 2 */}
        <WizardStep n={2} title={`Install into ${agent.name}`} done>
          <div className="space-y-3">
            <div>
              <div className="text-[12px] font-medium text-fg-2 mb-1.5">Option A — one command</div>
              <InlineCmd cmd={agent.install} />
            </div>
            <div>
              <div className="text-[12px] font-medium text-fg-2 mb-1.5">Option B — copy the config into the agent's own file</div>
              <CodeBlock file={agent.file} note={agent.fileNote} lang={agent.lang} code={agent.snippet} numbers />
            </div>
            <div className="rounded-xl border border-line p-3.5">
              <div className="flex items-center gap-2 text-[12.5px] font-medium">
                <KeyRound className="size-3.5 text-accent" /> {agent.category === "cloud" ? "COPILOT_MCP_WRAPBOX_TOKEN" : "WRAPBOX_TOKEN"}
                <span className="ml-auto text-[11.5px] text-fg-3 font-normal">scoped to {agent.id} · rotates every 30 days</span>
              </div>
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-surface-2 border border-line px-3 h-9">
                <code className="flex-1 font-mono text-[12px] truncate">{reveal ? token : masked}</code>
                <button onClick={() => setReveal(!reveal)} className="text-fg-3 hover:text-fg" aria-label="Reveal token">
                  {reveal ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
                <CopyButton text={token} />
              </div>
              <p className="mt-2 text-[11.5px] text-fg-3">
                Demo token. Wrapbox listens on: <span className="font-mono">{agent.hookEvents.join(" · ")}</span> · docs <span className="font-mono">{agent.docs}</span>
              </p>
            </div>
          </div>
        </WizardStep>

        {/* Step 3 */}
        <WizardStep n={3} title="Verify the connection" done={done}>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <Button variant={done ? "secondary" : "accent"} onClick={verify} disabled={verifying}>
              {verifying ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
              {verifying ? "Talking to the agent…" : done ? "Re-run verification" : "Send test events"}
            </Button>
            <span className="text-[12px] text-fg-3">Wrapbox fires synthetic actions through the adapter and checks the decisions come back.</span>
          </div>
          <div className="rounded-xl bg-code border border-code-line p-3.5 font-mono text-[12px] leading-[1.8] min-h-[120px]">
            {!log.length && <div className="text-[#5f6a88]">{conn ? `Last verified ${ago(conn.at)} · ${ASSURANCE[conn.assurance].label}` : "Waiting for the first test event…"}</div>}
            <AnimatePresence>
              {log.map((l, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} className={cn("flex items-center gap-2", l.ok ? "text-[#3fd49b]" : l.d === "BLOCK" ? "text-[#ff6e8a]" : l.d === "REVIEW" ? "text-[#f4b453]" : l.d ? "text-[#3fd49b]" : "text-[#a2acc5]")}>
                  <span className="truncate">{l.t}</span>
                  {l.ms && <span className="ml-auto text-[#5f6a88] shrink-0">{l.ms} ms</span>}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </WizardStep>
      </div>

      {/* Summary rail */}
      <div className="space-y-4">
        <Card className={cn("p-5", done && "border-allow/40")}>
          <div className="flex items-center gap-2">
            {done ? <CheckCircle2 className="size-5 text-allow" /> : <span className="size-5 rounded-full border-2 border-dashed border-line-strong" />}
            <span className="text-[14px] font-semibold">{done ? "Connected" : "Not connected yet"}</span>
          </div>
          <dl className="mt-4 space-y-2 text-[12.5px]">
            {[
              ["Method", m.name],
              ["Assurance", ASSURANCE[m.assurance].label],
              ["Contract", `v${version} · 12 rules`],
              ["Fail mode", agent.adapter === "cursor" ? "failClosed: true" : agent.adapter === "claude" ? "managed · deny on timeout" : "closed"],
              ["Identity", `${agent.id}@wrapbox`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-fg-3">{k}</dt>
                <dd className="font-medium text-right">{v}</dd>
              </div>
            ))}
          </dl>
          <Button className="mt-4 w-full" variant={done ? "primary" : "secondary"} onClick={onRun} disabled={!done}>
            <Play className="size-3.5 fill-current" /> Run the happy flow
          </Button>
        </Card>
        <Card className="p-5">
          <div className="text-[13px] font-semibold">What happens after connecting</div>
          <ol className="mt-3 space-y-2.5 text-[12.5px] text-fg-2">
            {[
              `${agent.name} calls Wrapbox before every ${agent.hookEvents[0]}.`,
              "Wrapbox normalizes it and matches wrapbox.yaml.",
              "The agent gets ALLOW / REVIEW / BLOCK in its own format.",
              "Approved actions carry a 60-second permit the executor verifies.",
              "Every decision appears in Evidence and the live stream.",
            ].map((t, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="grid size-5 place-items-center rounded-full bg-surface-3 text-[10.5px] font-semibold shrink-0">{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}

function WizardStep({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <span className={cn("grid size-6 place-items-center rounded-full text-[12px] font-semibold", done ? "bg-ink text-ink-fg" : "border border-line-strong text-fg-3")}>{done && n === 3 ? <Check className="size-3.5" /> : n}</span>
        <span className="text-[14.5px] font-semibold">{title}</span>
      </div>
      {children}
    </Card>
  );
}
