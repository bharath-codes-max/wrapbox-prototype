import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, Database, Plus, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { agentById, type Decision } from "../data/agents";
import { WrapboxLogo } from "../components/logo";
import { Button, Card, DecisionPill, Logo, cn } from "../components/ui";
import { go } from "../lib/router";
import { setState, switchWorkspace, useStore, workspaceHasData } from "../lib/store";

const TICKER: { agent: string; action: string; d: Decision; why: string }[] = [
  { agent: "claude-code", action: "Read .env.production", d: "BLOCK", why: "secrets are never read autonomously" },
  { agent: "stripe-mcp", action: "create_refund · $300", d: "ALLOW", why: "≤ $500 is automatic" },
  { agent: "postgres-mcp", action: "SELECT email, phone FROM customers", d: "CONSTRAIN", why: "PII masked · LIMIT 500" },
  { agent: "cursor", action: "kubectl delete deployment payments-api -n prod", d: "REVIEW", why: "on-call signs with a passkey" },
  { agent: "langgraph", action: "pay_claim · ₹3,00,000", d: "REVIEW", why: "two claims managers" },
  { agent: "openai-handoffs", action: "place_order · $100,000", d: "BLOCK", why: "exceeds the $10,000 its parent delegated" },
  { agent: "codex-cli", action: "git push --force origin feat/ledger", d: "CONSTRAIN", why: "rewritten to --force-with-lease" },
];

function Ticker() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % TICKER.length), 1900);
    return () => clearInterval(t);
  }, []);
  const rows = [0, 1, 2].map((k) => TICKER[(i + k) % TICKER.length]);
  return (
    <div className="space-y-2">
      <AnimatePresence initial={false} mode="popLayout">
        {rows.map((r, k) => {
          const a = agentById(r.agent);
          return (
            <motion.div
              key={r.action}
              layout
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: k === 0 ? 1 : 0.55 - k * 0.12, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.45 }}
              className="flex items-center gap-3 rounded-xl bg-white/[0.06] ring-1 ring-white/10 px-3 py-2.5"
            >
              <Logo name={a.logo} bleed={a.bleed} size={28} rounded="rounded-lg" />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[12px] text-white truncate">{r.action}</div>
                <div className="text-[11px] text-white/55 truncate">
                  {a.name} · {r.why}
                </div>
              </div>
              <DecisionPill d={r.d} size="sm" />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function Start() {
  const workspace = useStore((s) => s.workspace);
  const s = useStore((x) => x);
  const freshHasData = workspaceHasData("fresh");

  const steps: { label: string; done: boolean; path: string; hint: string }[] = [
    { label: "Create the workspace", done: s.onboarded.admin || !!s.idp, path: "/onboarding/admin", hint: "SSO, company, data region" },
    { label: "Connect your first agent", done: Object.keys(s.connected).length > 0, path: "/agents", hint: `${Object.keys(s.connected).length} of 25 connected` },
    { label: "Publish your intent contract", done: s.version > 0 && s.published.length > 0, path: "/contract", hint: s.published.length ? `v${s.version} · ${s.published.length} rules` : "empty — everything is allowed" },
    { label: "Send your first action", done: s.events.length > 0, path: "/playground", hint: `${s.events.length} decisions so far` },
    { label: "Bring in your team", done: s.members.length > 1, path: "/team", hint: `${s.members.length} ${s.members.length === 1 ? "person" : "people"}` },
    { label: "An employee installs Wrapbox", done: s.devices.length > 0, path: "/onboarding/employee", hint: `${s.devices.length} laptops reporting` },
    { label: "First signed human approval", done: s.approvals.some((a) => a.status === "approved"), path: "/approvals", hint: `${s.approvals.filter((a) => a.status === "pending").length} waiting` },
    { label: "Read the evidence trail", done: s.events.some((e) => e.permit), path: "/evidence", hint: "human → agent → rule → permit → outcome" },
  ];
  const done = steps.filter((x) => x.done).length;

  const startFresh = (role: "admin" | "employee") => {
    switchWorkspace("fresh");
    setState({ role });
    go(role === "admin" ? "/onboarding/admin" : "/onboarding/employee");
  };

  return (
    <div className="mx-auto max-w-[1180px] px-4 lg:px-8 py-8">
      <section
        className="relative overflow-hidden rounded-3xl p-7 lg:p-9 text-white"
        style={{ background: "radial-gradient(700px 260px at 10% -10%, rgba(79,123,255,0.35), transparent 70%), radial-gradient(500px 240px at 100% 120%, rgba(157,182,255,0.18), transparent 70%), linear-gradient(160deg, #13214a 0%, #0f1b35 55%, #0b1530 100%)" }}
      >
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/[0.08] ring-1 ring-white/15 pl-1 pr-3 py-1 text-[12px] text-white/80">
              <span className="grid size-6 place-items-center rounded-full bg-[#0a1226]">
                <WrapboxLogo size={16} />
              </span>
              Runtime authorization for AI agents
            </div>
            <h1 className="mt-5 text-[38px] lg:text-[46px] leading-[1.02] font-semibold tracking-[-0.04em]">
              Put every AI agent
              <br />
              on a <span className="bg-[linear-gradient(120deg,#9db6ff,#5a82ff)] bg-clip-text text-transparent">permit</span>.
            </h1>
            <p className="mt-4 max-w-[52ch] text-[14.5px] leading-relaxed text-white/70">
              Claude Code, Cursor, Codex, your LangGraph agents, Agentforce, browser agents — every risky action is checked a few milliseconds before it runs, against one contract you write. Explore a live company, or build your own from zero.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button onClick={() => startFresh("admin")} className="inline-flex items-center gap-2 h-11 rounded-full bg-white px-5 text-[14px] font-semibold text-[#0f1b35] hover:opacity-90">
                <Plus className="size-4" /> Build from zero
              </button>
              <button
                onClick={() => {
                  switchWorkspace("demo");
                  setState({ role: "admin" });
                  go("/");
                }}
                className="inline-flex items-center gap-2 h-11 rounded-full bg-white/[0.08] ring-1 ring-white/20 px-5 text-[14px] font-semibold text-white hover:bg-white/[0.12]"
              >
                Explore the live demo <ArrowRight className="size-4" />
              </button>
            </div>
          </div>
          <div className="rounded-2xl bg-black/20 ring-1 ring-white/10 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] font-medium text-white/80">Decisions, as they happen</span>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-[#b6f0d6]">
                <span className="size-1.5 rounded-full bg-[#3fd49b] live-dot" /> p50 3 ms
              </span>
            </div>
            <Ticker />
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <PathCard
          icon={<Database className="size-4.5" />}
          tag="Demo workspace"
          title="Explore a live company"
          body="30 days of traffic across 12 connected agents, a 14-version contract, approvals waiting, laptops reporting. Poke anything."
          cta="Open the demo"
          active={workspace === "demo"}
          onClick={() => {
            switchWorkspace("demo");
            setState({ role: "admin" });
            go("/");
          }}
        />
        <PathCard
          icon={<Plus className="size-4.5" />}
          tag={freshHasData ? "Fresh workspace · in progress" : "Fresh workspace · empty"}
          title="Build it yourself, as the admin"
          body="No data anywhere. Create the workspace, write the contract, connect agents, invite people — and watch every page fill in from what you do."
          cta={freshHasData ? "Resume admin setup" : "Start from zero"}
          active={workspace === "fresh"}
          primary
          onClick={() => startFresh("admin")}
        />
        <PathCard
          icon={<UserRound className="size-4.5" />}
          tag={workspace === "fresh" ? "In your fresh workspace" : "In the demo workspace"}
          title="Join as an employee"
          body="Accept the invite, run one command, see the rules in plain English, try a blocked action, approve from Slack. About 3 minutes."
          cta="Join as Dev"
          onClick={() => {
            setState({ role: "employee" });
            go("/onboarding/employee");
          }}
        />
      </div>

      <Card className="mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 px-6 pt-5 pb-4">
          <div className="flex-1 min-w-[260px]">
            <div className="eyebrow">{workspace === "fresh" ? "Your fresh workspace" : "Demo workspace"} · setup checklist</div>
            <div className="mt-1 text-[18px] font-semibold tracking-tight">
              {done === steps.length ? "Everything is live." : `${done} of ${steps.length} done — ${steps.find((x) => !x.done)?.label.toLowerCase()} next.`}
            </div>
          </div>
          <div className="w-[220px]">
            <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
              <motion.div className="h-full bg-allow" animate={{ width: `${(done / steps.length) * 100}%` }} />
            </div>
            <div className="mt-1 text-right text-[11.5px] text-fg-3 tnum">{Math.round((done / steps.length) * 100)}%</div>
          </div>
        </div>
        <ol className="grid sm:grid-cols-2 border-t border-line">
          {steps.map((x, i) => (
            <li key={x.label} className={cn("border-b border-line sm:odd:border-r", i >= steps.length - 2 && "sm:border-b-0")}>
              <a href={"#" + x.path} className="flex items-center gap-3 px-6 py-3.5 hover:bg-surface-2 transition-colors">
                <span className={cn("grid size-6 place-items-center rounded-full text-[11px] font-semibold shrink-0", x.done ? "bg-allow text-white" : "border border-line-strong text-fg-3")}>{x.done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[13.5px] font-medium", x.done && "text-fg-2")}>{x.label}</span>
                  <span className="block text-[11.5px] text-fg-3 truncate">{x.hint}</span>
                </span>
                <ArrowRight className="size-3.5 text-fg-3" />
              </a>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

function PathCard({ icon, tag, title, body, cta, onClick, active, primary }: { icon: React.ReactNode; tag: string; title: string; body: string; cta: string; onClick: () => void; active?: boolean; primary?: boolean }) {
  return (
    <Card className={cn("p-5 flex flex-col transition-all hover:shadow-card", active ? "border-fg/40" : "hover:border-line-strong")}>
      <div className="flex items-center justify-between">
        <span className={cn("grid size-9 place-items-center rounded-xl", primary ? "bg-nav text-white" : "bg-surface-2 text-fg-2")}>{icon}</span>
        {active && <span className="rounded-full bg-surface-2 border border-line px-2 py-0.5 text-[11px] text-fg-2">you're here</span>}
      </div>
      <div className="mt-4 eyebrow">{tag}</div>
      <div className="mt-1 text-[16px] font-semibold tracking-tight">{title}</div>
      <p className="mt-1.5 text-[12.5px] text-fg-2 leading-relaxed flex-1">{body}</p>
      <Button variant={primary ? "primary" : "secondary"} className="mt-4 self-start" onClick={onClick}>
        {cta} <ArrowRight className="size-3.5" />
      </Button>
    </Card>
  );
}
