import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, CircleCheck, KeyRound, Loader2, Mail, Play, ShieldCheck, Terminal as TerminalIcon, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { AGENTS, CATEGORIES, METHODS, agentById, type CategoryId, type Decision } from "../data/agents";
import { INITIAL_RULES, toYaml, type Rule } from "../data/contract";
import { PEOPLE } from "../data/people";
import { SCENARIOS, actOf, nativeFor, type Gate } from "../data/scenarios";
import { CodeBlock, InlineCmd, json } from "../components/code";
import { SlackCard } from "../components/insight";
import { WrapboxLogo } from "../components/logo";
import { Avatar, Button, Card, Chip, CopyButton, DecisionPill, Logo, Segmented, Toggle, cn } from "../components/ui";
import { approveWithPasskey } from "../lib/actions";
import { sha256 } from "../lib/permit";
import { go } from "../lib/router";
import { ADMIN, DEMO_GROUPS, EMPLOYEE, askPasskey, connectAgent, ensurePending, evaluateNow, getState, grantConnectedAgents, markOnboarded, pushEvent, registerDevice, resolveApprovers, setState, syncDirectory, toast, upsertApproval, approvalFrom, gateFromAct, useStore } from "../lib/store";
import type { Verdict } from "../lib/engine";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ================= Shared layout ================= */

function SetupLayout({
  who,
  title,
  steps,
  step,
  reached,
  onJump,
  children,
}: {
  who: "admin" | "employee";
  title: string;
  steps: { t: string; s: string }[];
  step: number;
  reached: number;
  onJump: (i: number) => void;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1280px] px-4 lg:px-8 py-7">
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 self-start">
          <div className="flex items-center gap-2.5">
            <Avatar p={who === "admin" ? ADMIN : EMPLOYEE} size={30} />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold truncate">{title}</div>
              <div className="text-[11.5px] text-fg-3">{who === "admin" ? "Priya Menon · Founder" : "Dev Kapoor · Engineer"}</div>
            </div>
          </div>
          <div className="mt-4 h-1 rounded-full bg-surface-3 overflow-hidden">
            <motion.div className="h-full bg-ink" animate={{ width: `${((step + 1) / steps.length) * 100}%` }} />
          </div>
          <ol className="mt-4 space-y-0.5">
            {steps.map((x, i) => (
              <li key={x.t}>
                <button
                  disabled={i > reached}
                  onClick={() => onJump(i)}
                  className={cn("flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed", i === step ? "bg-surface border border-line shadow-card" : "border border-transparent hover:bg-surface-2")}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid size-5 place-items-center rounded-full text-[10.5px] font-semibold shrink-0",
                      i < reached || (i < step) ? "bg-allow text-white" : i === step ? "bg-ink text-ink-fg" : "border border-line text-fg-3",
                    )}
                  >
                    {i < step || (i < reached && i !== step) ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block text-[13px] font-medium", i > reached ? "text-fg-3" : "text-fg")}>{x.t}</span>
                    <span className="block text-[11.5px] text-fg-3 leading-snug">{x.s}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <button onClick={() => go("/start")} className="mt-4 inline-flex items-center gap-1.5 px-2.5 text-[12px] text-fg-3 hover:text-fg">
            <X className="size-3.5" /> Exit setup
          </button>
        </aside>
        <AnimatePresence mode="wait">
          <motion.section key={step} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }} className="min-w-0">
            {children}
          </motion.section>
        </AnimatePresence>
      </div>
    </div>
  );
}

function StepHead({ n, total, title, sub }: { n: number; total: number; title: string; sub: string }) {
  return (
    <div className="mb-5">
      <div className="eyebrow">
        Step {n} of {total}
      </div>
      <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight">{title}</h1>
      <p className="mt-1.5 max-w-[68ch] text-[14px] text-fg-2 leading-relaxed">{sub}</p>
    </div>
  );
}

function Footer({ onBack, onNext, next = "Continue", disabled, hint }: { onBack?: () => void; onNext: () => void; next?: string; disabled?: boolean; hint?: string }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
      {onBack && (
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-3.5" /> Back
        </Button>
      )}
      {hint && <span className="text-[12px] text-fg-3">{hint}</span>}
      <Button variant="primary" size="lg" className="ml-auto" onClick={onNext} disabled={disabled}>
        {next} <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}

function Tick({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2 text-[13px]">
      {on ? <CircleCheck className="size-4 text-allow shrink-0" /> : <Loader2 className="size-4 animate-spin text-fg-3 shrink-0" />}
      <span className={on ? "text-fg" : "text-fg-3"}>{children}</span>
    </motion.div>
  );
}

/* ================= Admin setup ================= */

const PACKS: { id: string; name: string; rules: string[]; ex: string; rec?: boolean }[] = [
  { id: "secrets", name: "Secrets & credentials", rules: ["secrets.read", "network.egress"], ex: "Agents never read .env files or send credentials to unknown domains.", rec: true },
  { id: "git", name: "Source control", rules: ["git.main", "git.feature"], ex: "Main stays human-only; feature branches stay automatic.", rec: true },
  { id: "prod", name: "Production infrastructure", rules: ["prod.k8s.delete", "prod.db.migrate", "db.prod.write"], ex: "Prod deletes need on-call; no schema changes or destructive SQL from agents.", rec: true },
  { id: "pii", name: "Customer data (PII)", rules: ["pii.read"], ex: "Email and phone are masked for agents and results are capped.", rec: true },
  { id: "payments", name: "Payments & refunds", rules: ["payments.refund"], ex: "Automatic up to a limit, then a manager, then blocked.", rec: true },
  { id: "claims", name: "Claims payouts", rules: ["claims.payout"], ex: "Two claims managers above ₹2,00,000." },
  { id: "commercial", name: "Commercial actions", rules: ["crm.discount"], ex: "Discounts above 25% need VP Sales." },
  { id: "browser", name: "Browser payments", rules: ["browser.payment"], ex: "The final “Submit payment” click needs the finance controller." },
  { id: "delegation", name: "Agent delegation", rules: ["agent.delegate"], ex: "A subagent never gets more authority than its parent.", rec: true },
];

const BLOCKS: { id: string; cats: CategoryId[]; title: string; agents: string[]; what: string }[] = [
  { id: "coding", cats: ["ide", "cli"], title: "Coding agents on laptops", agents: ["claude-code", "cursor", "codex-cli", "copilot-ide"], what: "One installer writes each agent's native hook file — Claude Code, Cursor, Codex, Copilot, Gemini." },
  { id: "cloud", cats: ["cloud"], title: "Cloud coding agents", agents: ["copilot-cloud"], what: "Give the hosted runner a task-scoped token and route its tools through the gateway." },
  { id: "sdk", cats: ["custom"], title: "Your own agents (SDK)", agents: ["langgraph"], what: "Wrap each tool executor, and have the target service verify the permit." },
  { id: "mcp", cats: ["mcp"], title: "MCP servers & payment gateways", agents: ["stripe-mcp", "github-mcp", "postgres-mcp", "razorpay-mcp"], what: "Wrap each upstream once; every MCP client uses the Wrapbox URL." },
  { id: "saas", cats: ["saas"], title: "SaaS agents", agents: ["agentforce"], what: "Consequential platform actions call a Wrapbox-authorized connector." },
  { id: "browser", cats: ["browser"], title: "Browser agents", agents: ["browser-use"], what: "The executor re-checks the final click against the permit." },
  { id: "a2a", cats: ["a2a"], title: "Multi-agent delegation", agents: ["openai-handoffs"], what: "Handoffs carry an attenuated token; children can't exceed parents." },
];

const REPOS = ["wrapbox/web", "wrapbox/billing", "wrapbox/payments", "wrapbox/claims-agent", "wrapbox/infra", "wrapbox/mobile", "wrapbox/data-platform", "wrapbox/ops-agents"];
const FOUND: [string, string, string, number][] = [
  ["claudecode", "Claude Code", ".claude/settings.json", 11],
  ["cursor", "Cursor", ".cursor/rules · hooks.json", 18],
  ["codex", "Codex", "AGENTS.md · .codex/", 9],
  ["githubcopilot", "GitHub Copilot", ".github/copilot-instructions.md", 14],
  ["mcp", "MCP servers", "mcp.json → stripe, github, postgres", 6],
  ["langgraph", "LangGraph", "langgraph.json", 2],
  ["salesforce", "Agentforce", "Okta app catalog", 1],
  ["browseruse", "Browser Use", "requirements.txt", 1],
];

const ADMIN_STEPS = [
  { t: "Create workspace", s: "SSO, company, data region" },
  { t: "Discover agents", s: "Find what already runs" },
  { t: "Intent contract", s: "Policy packs + rollout mode" },
  { t: "Connect agents", s: "Hooks, SDK, MCP, connectors" },
  { t: "Approvers & alerts", s: "Who signs what, where" },
  { t: "Invite your team", s: "Directory, installer, links" },
  { t: "Go live", s: "See the first decision" },
];

export function AdminSetup() {
  const fresh = useStore((s) => s.workspace === "fresh");
  const connectedNow = useStore((s) => s.connected);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const next = () => {
    setStep((s) => s + 1);
    setReached((r) => Math.max(r, step + 1));
    document.getElementById("main-scroll")?.scrollTo({ top: 0 });
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  // Step 1
  const [idp, setIdp] = useState<string | null>(null);
  const [company, setCompany] = useState("Wrapbox");
  const [domain, setDomain] = useState("wrapbox.ai");
  const [region, setRegion] = useState<"us" | "eu" | "in">("us");
  const [prov, setProv] = useState(0);
  const [thumb, setThumb] = useState("");
  // Step 2
  const [scan, setScan] = useState<"idle" | "scanning" | "done">("idle");
  const [scanned, setScanned] = useState(0);
  const [cats, setCats] = useState<CategoryId[]>(["ide", "cli", "cloud", "custom", "mcp", "saas", "browser", "a2a"]);
  // Step 3
  const [packs, setPacks] = useState<string[]>(PACKS.filter((p) => p.rec).map((p) => p.id).concat(["claims", "commercial", "browser"]));
  const [mode, setMode] = useState<"observe" | "enforce">("enforce");
  const [autoMax, setAutoMax] = useState(500);
  const [reviewMax, setReviewMax] = useState(5000);
  // Step 4
  const [linked, setLinked] = useState<Record<string, "busy" | "done">>({});
  const [openBlock, setOpenBlock] = useState<string>("coding");
  const [codingMode, setCodingMode] = useState<"mdm" | "cmd">("mdm");
  const [sdkKey, setSdkKey] = useState(false);
  // Step 5
  const [channels, setChannels] = useState({ slack: true, teams: false, email: true });
  const [passkeyReq, setPasskeyReq] = useState(true);
  const [escalate, setEscalate] = useState<"5" | "15" | "30">("15");
  // Step 6
  const [scim, setScim] = useState<"idle" | "busy" | "done">("idle");
  const [invited, setInvited] = useState(false);
  // Step 7
  const [tests, setTests] = useState<{ key: string; stage: number; v?: Verdict }[]>([]);

  const rules: Rule[] = INITIAL_RULES.filter((r) => PACKS.some((p) => packs.includes(p.id) && p.rules.includes(r.id))).map((r) => {
    const x: Rule = { ...r, mode: mode === "observe" ? "observe" : undefined };
    if (r.id === "payments.refund" && r.tiers) x.tiers = [{ ...r.tiers[0], max: autoMax }, { ...r.tiers[1], max: reviewMax }, r.tiers[2]];
    return x;
  });
  const blocks = BLOCKS.filter((b) => b.cats.some((c) => cats.includes(c)));
  const linkedCount = blocks.filter((b) => linked[b.id] === "done").length;

  async function provision() {
    setProv(1);
    const kp = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const raw = await crypto.subtle.exportKey("raw", kp.publicKey);
    const hex = await sha256(Array.from(new Uint8Array(raw), (b) => String.fromCharCode(b)).join(""));
    setThumb(hex.slice(0, 16));
    for (let i = 2; i <= 5; i++) {
      await sleep(450);
      setProv(i);
    }
    if (fresh) setState({ company, domain, region, idp: idp ?? "" });
  }

  async function runScan() {
    setScan("scanning");
    for (let i = 1; i <= REPOS.length; i++) {
      await sleep(220);
      setScanned(i);
    }
    await sleep(300);
    setScan("done");
  }

  async function link(id: string) {
    setLinked((l) => ({ ...l, [id]: "busy" }));
    await sleep(1100);
    setLinked((l) => ({ ...l, [id]: "done" }));
    const b = BLOCKS.find((x) => x.id === id)!;
    for (const a of b.agents) {
      const m = METHODS[agentById(a).category].find((x) => x.recommended) ?? METHODS[agentById(a).category][0];
      connectAgent(a, m.id, m.assurance);
    }
    toast(`${b.title} connected`, b.agents.map((a) => agentById(a).name).join(" · "), "allow");
    const nextOpen = blocks.find((x) => x.id !== id && linked[x.id] !== "done");
    if (nextOpen) setOpenBlock(nextOpen.id);
  }

  const TESTS: { key: string; label: string; agentId: string; gate: Gate }[] = [
    { key: "env", label: "Claude Code reads .env.production", agentId: "claude-code", gate: SCENARIOS.ide.gates[0] },
    { key: "refund", label: "Stripe refund of $8,000 via MCP", agentId: "stripe-mcp", gate: SCENARIOS["mcp-stripe"].gates[1] },
    { key: "pii", label: "Agent queries customer emails", agentId: "postgres-mcp", gate: SCENARIOS["mcp-postgres"].gates[0] },
  ];
  async function runTest(key: string) {
    const t = TESTS.find((x) => x.key === key)!;
    const v = evaluateNow(actOf(t.gate), t.agentId);
    setTests((ts) => [...ts.filter((x) => x.key !== key), { key, stage: 0, v }]);
    for (let i = 1; i <= 4; i++) {
      await sleep(380);
      setTests((ts) => ts.map((x) => (x.key === key ? { ...x, stage: i } : x)));
    }
    pushEvent({ agentId: t.agentId, human: "priya.m", action: t.gate.display, effect: actOf(t.gate).effect, decision: v.decision, observed: v.observed, rule: v.rule, reason: v.reason, latency: t.gate.latency, env: actOf(t.gate).env ?? "production", rewritten: v.decision === "CONSTRAIN" ? t.gate.constrain?.display : undefined, source: "flow" });
  }

  function finish() {
    if (fresh) grantConnectedAgents();
    markOnboarded("admin");
    setState({ role: "admin" });
    toast("Wrapbox is live", fresh ? "Every page now reflects what you set up. Invite employees next, or send an action from the playground." : "The demo workspace keeps its 30 days of traffic.", "allow");
    go("/");
  }

  const total = ADMIN_STEPS.length;
  return (
    <SetupLayout who="admin" title="Set up Wrapbox" steps={ADMIN_STEPS} step={step} reached={reached} onJump={setStep}>
      {step === 0 && (
        <Card className="p-6">
          <StepHead n={1} total={total} title="Create your workspace" sub="Sign in with your company identity provider. Everyone you invite later signs in the same way, so agent actions are always tied to a real person." />
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              ["google", "Google Workspace"],
              ["microsoft", "Microsoft Entra ID"],
              ["okta", "Okta"],
            ].map(([l, n]) => (
              <button key={l} onClick={() => setIdp(n)} className={cn("flex items-center gap-2.5 rounded-xl border px-3.5 h-11 text-[13px] font-medium transition-colors", idp === n ? "border-fg bg-surface" : "border-line hover:border-line-strong")}>
                <Logo name={l} size={22} rounded="rounded-md" /> Continue with {n.split(" ")[0]}
                {idp === n && <Check className="ml-auto size-4 text-allow" />}
              </button>
            ))}
          </div>
          {idp && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex items-center gap-2.5 rounded-xl bg-surface-2 border border-line px-3.5 py-2.5 text-[13px]">
              <Avatar p={ADMIN} size={24} /> Signed in as <b>priya@{domain}</b> via {idp} · MFA verified
            </motion.div>
          )}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Company name" value={company} onChange={setCompany} />
            <Field label="Email domain (auto-join for SSO users)" value={domain} onChange={setDomain} />
            <div className="sm:col-span-2">
              <div className="text-[12px] font-medium mb-1.5">Data region — where decisions and evidence are stored</div>
              <Segmented
                value={region}
                onChange={setRegion}
                options={[
                  { value: "us", label: "United States" },
                  { value: "eu", label: "European Union" },
                  { value: "in", label: "India" },
                ]}
              />
            </div>
          </div>
          {prov > 0 && (
            <div className="mt-5 space-y-2 rounded-xl border border-line p-4">
              <Tick on={prov > 1}>Workspace “{company}” created · {region === "us" ? "us-east-1" : region === "eu" ? "eu-central-1" : "ap-south-1"}</Tick>
              {prov > 1 && <Tick on={prov > 2}>Signing key generated · ECDSA P-256 · thumbprint {thumb}</Tick>}
              {prov > 2 && <Tick on={prov > 3}>Policy engine ready · deterministic, p50 3 ms</Tick>}
              {prov > 3 && <Tick on={prov > 4}>Hash-chained evidence log opened</Tick>}
            </div>
          )}
          <Footer
            onNext={prov >= 5 ? next : provision}
            next={prov >= 5 ? "Continue" : prov > 0 ? "Creating…" : "Create workspace"}
            disabled={!idp || (prov > 0 && prov < 5)}
            hint={!idp ? "Choose an identity provider first" : undefined}
          />
        </Card>
      )}

      {step === 1 && (
        <Card className="p-6">
          <StepHead n={2} total={total} title="Discover the agents you already run" sub="Most companies have more agents than they think. Wrapbox reads repository configs and your app catalog — no code is uploaded — then you choose which platforms to govern." />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant={scan === "done" ? "secondary" : "primary"} onClick={runScan} disabled={scan === "scanning"}>
              <Logo name="github_light" size={18} rounded="rounded" /> {scan === "idle" ? "Scan the GitHub org" : scan === "scanning" ? `Scanning ${scanned}/${REPOS.length} repos…` : "Scan again"}
            </Button>
            <span className="text-[12px] text-fg-3">Read-only GitHub App · metadata only · 42 repos in github.com/wrapbox</span>
          </div>
          {scan !== "idle" && (
            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
              <div className="rounded-xl border border-line p-3 font-mono text-[12px] space-y-1">
                {REPOS.slice(0, scanned).map((r) => (
                  <motion.div key={r} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
                    <Check className="size-3.5 text-allow" /> {r}
                  </motion.div>
                ))}
                {scan === "scanning" && <div className="text-fg-3">…</div>}
              </div>
              {scan === "done" && (
                <div className="rounded-xl border border-line overflow-hidden">
                  {FOUND.map(([logo, name, where, n]) => (
                    <div key={name} className="flex items-center gap-3 px-3.5 py-2 border-b border-line last:border-0">
                      <Logo name={logo} size={22} rounded="rounded-md" bleed={logo === "browseruse"} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] font-medium">{name}</div>
                        <div className="font-mono text-[11px] text-fg-3 truncate">{where}</div>
                      </div>
                      <span className="font-mono text-[12px] tnum text-fg-2">{n} {n === 1 ? "source" : "repos"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="mt-6">
            <div className="text-[13px] font-semibold mb-2">Platforms to govern</div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {CATEGORIES.map((c) => {
                const on = cats.includes(c.id);
                return (
                  <button key={c.id} onClick={() => setCats((x) => (on ? x.filter((y) => y !== c.id) : [...x, c.id]))} className={cn("rounded-xl border p-3 text-left transition-colors", on ? "border-fg bg-surface" : "border-line opacity-70 hover:opacity-100")}>
                    <div className="flex items-center justify-between">
                      <div className="flex -space-x-1.5">
                        {AGENTS.filter((a) => a.category === c.id)
                          .slice(0, 3)
                          .map((a) => (
                            <Logo key={a.id} name={a.logo} bleed={a.bleed} size={20} rounded="rounded-full" className="ring-2 ring-surface" />
                          ))}
                      </div>
                      <span className={cn("grid size-4.5 place-items-center rounded border", on ? "bg-ink border-ink text-ink-fg" : "border-line-strong")}>{on && <Check className="size-3" strokeWidth={3} />}</span>
                    </div>
                    <div className="mt-2 text-[12.5px] font-semibold">{c.name}</div>
                    <div className="text-[11px] text-fg-3">{c.method}</div>
                  </button>
                );
              })}
            </div>
          </div>
          <Footer onBack={back} onNext={next} disabled={!cats.length} hint={`${cats.length} of 8 platforms selected`} />
        </Card>
      )}

      {step === 2 && (
        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_480px] xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="p-6 min-w-0">
            <StepHead n={3} total={total} title="Write your intent contract" sub="Start from policy packs, not a blank page. Each pack is a few plain rules about effects — reading secrets, moving money, deleting in production — that apply to every agent, whatever vendor." />
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {PACKS.map((p) => {
                const on = packs.includes(p.id);
                return (
                  <div key={p.id} className={cn("rounded-xl border p-3.5 transition-colors", on ? "border-fg bg-surface" : "border-line")}>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[13px] font-semibold">{p.name}</span>
                          {p.rec && <Chip>recommended</Chip>}
                        </div>
                        <p className="mt-0.5 text-[12px] text-fg-2 leading-relaxed">{p.ex}</p>
                        <div className="mt-1.5 font-mono text-[10.5px] text-fg-3">{p.rules.join(" · ")}</div>
                      </div>
                      <Toggle on={on} onChange={() => setPacks((x) => (on ? x.filter((y) => y !== p.id) : [...x, p.id]))} label={p.name} />
                    </div>
                    {p.id === "payments" && on && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
                        <DecisionPill d="ALLOW" size="sm" /> up to $
                        <input type="number" value={autoMax} onChange={(e) => setAutoMax(Number(e.target.value) || 0)} className="w-16 rounded border border-line bg-surface-2 px-1.5 h-6 font-mono" />
                        <DecisionPill d="REVIEW" size="sm" /> up to $
                        <input type="number" value={reviewMax} onChange={(e) => setReviewMax(Number(e.target.value) || 0)} className="w-20 rounded border border-line bg-surface-2 px-1.5 h-6 font-mono" />
                        <DecisionPill d="BLOCK" size="sm" /> above
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-5 rounded-xl border border-line p-4">
              <div className="text-[13px] font-semibold">How to roll it out</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["enforce", "Enforce now", "Decisions apply immediately. Best for secrets and production rules.", true],
                    ["observe", "Observe for 7 days", "Log what would have been blocked, without interrupting anyone. Good for a big rollout.", false],
                  ] as const
                ).map(([v, t, d, rec]) => (
                  <button key={v} onClick={() => setMode(v)} className={cn("rounded-xl border p-3 text-left", mode === v ? "border-fg" : "border-line hover:border-line-strong")}>
                    <div className="flex items-center gap-2 text-[13px] font-semibold">
                      <span className={cn("size-3.5 rounded-full border-2", mode === v ? "border-fg bg-fg" : "border-line-strong")} />
                      {t} {rec && <Chip>recommended</Chip>}
                    </div>
                    <p className="mt-1 text-[12px] text-fg-2">{d}</p>
                  </button>
                ))}
              </div>
            </div>
            <Footer
              onBack={back}
              onNext={() => {
                if (fresh) {
                  setState((st) => ({ rules, published: rules, version: st.version + 1, publishedAt: Date.now() }));
                  toast(`Contract v${getState().version} published`, `${rules.length} rules · ${mode === "observe" ? "observe mode" : "enforcing"}`, "allow");
                }
                next();
              }}
              next={fresh ? `Publish contract · ${rules.length} rules` : `Save contract v1 · ${rules.length} rules`}
              disabled={!rules.length}
              hint={fresh ? undefined : "Demo workspace: the existing v14 contract stays in place"}
            />
          </Card>
          <div className="min-w-0 xl:sticky xl:top-6 self-start">
            <CodeBlock file="wrapbox.yaml" note={mode === "observe" ? "observe mode" : "enforce"} lang="yaml" code={toYaml(rules, 1)} numbers maxH={640} />
          </div>
        </div>
      )}

      {step === 3 && (
        <Card className="p-6">
          <StepHead
            n={4}
            total={total}
            title="Connect your agents"
            sub="Each platform already exposes a place to intercept actions — a hook, a tool wrapper, an MCP endpoint, a connector. Wrapbox plugs into the one it has. Expand a block, follow it, press Verify."
          />
          <div className="mb-4 flex items-center gap-3">
            <div className="h-1.5 flex-1 rounded-full bg-surface-3 overflow-hidden">
              <motion.div className="h-full bg-allow" animate={{ width: `${(linkedCount / Math.max(1, blocks.length)) * 100}%` }} />
            </div>
            <span className="text-[12px] text-fg-2 tnum">
              {linkedCount} of {blocks.length} connected
            </span>
          </div>
          <div className="space-y-2">
            {blocks.map((b) => {
              const open = openBlock === b.id;
              const st = linked[b.id];
              return (
                <div key={b.id} className={cn("rounded-xl border", st === "done" ? "border-allow/40" : "border-line")}>
                  <button onClick={() => setOpenBlock(open ? "" : b.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                    <div className="flex -space-x-1.5">
                      {b.agents.slice(0, 4).map((a) => (
                        <Logo key={a} name={agentById(a).logo} bleed={agentById(a).bleed} size={24} rounded="rounded-full" className="ring-2 ring-surface" />
                      ))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-semibold">{b.title}</div>
                      <div className="text-[12px] text-fg-3 truncate">{b.what}</div>
                    </div>
                    {st === "done" ? <Chip tone="allow"><Check className="size-3" /> Connected</Chip> : <Chip>Not connected</Chip>}
                    <ChevronDown className={cn("size-4 text-fg-3 transition-transform", open && "rotate-180")} />
                  </button>
                  {open && (
                    <div className="border-t border-line px-4 py-4 space-y-3">
                      <BlockBody id={b.id} codingMode={codingMode} setCodingMode={setCodingMode} sdkKey={sdkKey} setSdkKey={setSdkKey} />
                      <div className="flex items-center gap-3">
                        <Button variant={st === "done" ? "secondary" : "primary"} onClick={() => link(b.id)} disabled={st === "busy"}>
                          {st === "busy" ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
                          {st === "busy" ? "Sending test events…" : st === "done" ? "Verify again" : "Verify connection"}
                        </Button>
                        <span className="text-[12px] text-fg-3">Wrapbox sends a synthetic action through the adapter and checks the decision comes back.</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Footer onBack={back} onNext={next} hint={linkedCount < blocks.length ? "You can connect the rest later from Agents" : "Everything selected is connected"} />
        </Card>
      )}

      {step === 4 && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Card className="p-6 min-w-0">
            <StepHead n={5} total={total} title="Approvers and alerts" sub="REVIEW decisions go to people, not to a queue nobody watches. Map each approver group in your contract to real people, and choose where they get asked." />
            <div className="rounded-xl border border-line overflow-hidden">
              {(
                [
                  ["oncall-sre", [PEOPLE.dev, PEOPLE.arjun], "PagerDuty schedule “payments-primary”", "pagerduty"],
                  ["claims-manager", [PEOPLE.meera, PEOPLE.rohan], "2 of 2 above ₹2,00,000", ""],
                  ["payments-manager", [PEOPLE.sara], "refunds $500–$5,000", ""],
                  ["vp-sales", [PEOPLE.ananya], "discounts > 25%", ""],
                  ["finance-controller", [PEOPLE.vikram], "browser payments", ""],
                ] as const
              ).map(([g, people, note, logo]) => (
                <div key={g} className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-line last:border-0">
                  <span className="font-mono text-[12.5px] text-review w-[150px]">{g}</span>
                  <div className="flex items-center gap-1.5">
                    {people.map((p) => (
                      <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border border-line pl-0.5 pr-2 h-7 text-[12px]">
                        <Avatar p={p} size={22} className="!ring-0" /> {p.name}
                      </span>
                    ))}
                  </div>
                  <span className="ml-auto flex items-center gap-1.5 text-[11.5px] text-fg-3">
                    {logo && <Logo name={logo} size={16} rounded="rounded" />} {note}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-line p-4 space-y-3">
                <div className="text-[13px] font-semibold">Where approvers get asked</div>
                {(
                  [
                    ["slack", "slack", "Slack"],
                    ["teams", "teams", "Microsoft Teams"],
                    ["email", "gmail", "Email"],
                  ] as const
                ).map(([k, logo, name]) => (
                  <div key={k} className="flex items-center gap-2.5">
                    <Logo name={logo} size={22} rounded="rounded-md" />
                    <span className="text-[13px] flex-1">{name}</span>
                    <Toggle on={channels[k]} onChange={(v) => setChannels((c) => ({ ...c, [k]: v }))} label={name} />
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-line p-4 space-y-3">
                <div className="text-[13px] font-semibold">Approval safety</div>
                <div className="flex items-center gap-2.5">
                  <KeyRound className="size-4 text-fg-2" />
                  <span className="text-[13px] flex-1">Every approval is a passkey signature</span>
                  <Toggle on={passkeyReq} onChange={setPasskeyReq} label="Passkey" />
                </div>
                <div className="flex items-center gap-2.5 opacity-80">
                  <ShieldCheck className="size-4 text-fg-2" />
                  <span className="text-[13px] flex-1">Requester can never approve their own action</span>
                  <Chip>always on</Chip>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[13px] flex-1">Escalate to admin after</span>
                  <Segmented
                    size="sm"
                    value={escalate}
                    onChange={setEscalate}
                    options={[
                      { value: "5", label: "5 min" },
                      { value: "15", label: "15 min" },
                      { value: "30", label: "30 min" },
                    ]}
                  />
                </div>
              </div>
            </div>
            <Footer
              onBack={back}
              onNext={() => {
                if (fresh) setState({ groups: DEMO_GROUPS });
                next();
              }}
            />
          </Card>
          <div className="space-y-3 min-w-0">
            <div className="eyebrow">What an approver sees in Slack</div>
            <SlackCard
              who="Dev Kapoor"
              title="Claude Code needs approval for Arjun Nair"
              lines={[
                ["Action", "kubectl delete deployment payments-api -n prod"],
                ["Rule", "prod.k8s.delete"],
                ["Dry run", "2 pods · ~40s of 5xx on /pay"],
              ]}
              onApprove={() => toast("Preview only", "Approvals happen in the live workspace")}
              onReject={() => toast("Preview only")}
            />
            <p className="text-[12px] text-fg-3 leading-relaxed">The same request is in the Wrapbox approval studio with the dry run, the risk signals and approval history. Approving from either place mints the same one-time permit.</p>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Card className="p-6 min-w-0">
            <StepHead n={6} total={total} title="Invite your team" sub="People come from your directory; laptops get Wrapbox from your MDM. Here is exactly what an admin shares — nothing else is needed from employees." />
            <div className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Logo name="okta" size={26} rounded="rounded-md" />
                <div className="flex-1 min-w-[200px]">
                  <div className="text-[13px] font-semibold">Sync people from Okta (SCIM)</div>
                  <div className="text-[12px] text-fg-3">Groups become roles: eng → Developer · claims → Business user · sre-oncall → approver group oncall-sre</div>
                </div>
                <Button
                  variant={scim === "done" ? "secondary" : "primary"}
                  onClick={async () => {
                    setScim("busy");
                    await sleep(1000);
                    setScim("done");
                    if (fresh) syncDirectory();
                  }}
                  disabled={scim === "busy"}
                >
                  {scim === "busy" ? <Loader2 className="size-3.5 animate-spin" /> : null} {scim === "done" ? "Synced · 11 people" : "Connect Okta"}
                </Button>
              </div>
              {scim === "done" && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {Object.values(PEOPLE).map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border border-line pl-0.5 pr-2 h-7 text-[12px]">
                      <Avatar p={p} size={22} className="!ring-0" /> {p.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-4 text-[13px] font-semibold mb-2">What you share</div>
            <div className="space-y-2">
              <ShareRow n={1} title="Invite link" desc="Employees sign in with SSO and land in their own view.">
                <CopyField value="https://app.wrapbox.ai/join/7Hq2-dK4v" />
              </ShareRow>
              <ShareRow n={2} title="Laptop rollout" desc="Push through Jamf or Intune — or share one command for unmanaged machines.">
                <InlineCmd cmd="npx @wrapbox/cli install --all --org wrapbox" />
                <div className="mt-2 font-mono text-[11.5px] text-fg-3">Jamf: Wrapbox-1.4.2.pkg · Intune: Wrapbox-1.4.2.msi · both run `wrapbox install --all --managed`</div>
              </ShareRow>
              <ShareRow n={3} title="MCP endpoints" desc="Replace upstream MCP URLs with the Wrapbox ones in any client.">
                <CodeBlock
                  file=".mcp.json"
                  lang="json"
                  code={`{\n  "mcpServers": {\n    "stripe":   { "url": "https://mcp.wrapbox.ai/stripe" },\n    "github":   { "url": "https://mcp.wrapbox.ai/github" },\n    "postgres": { "url": "https://mcp.wrapbox.ai/postgres-prod" }\n  }\n}`}
                />
              </ShareRow>
              <ShareRow n={4} title="SDK keys — platform team only" desc="For custom agents. Scoped per agent identity, rotated every 30 days.">
                <CopyField value="WRAPBOX_TOKEN=wbx_sdk_live_claimsagentprod_••••••••3f9a" />
              </ShareRow>
            </div>
            <Footer
              onBack={back}
              onNext={() => {
                if (!invited) {
                  setInvited(true);
                  toast("Invites sent", "11 people · rollout policy queued in Jamf and Intune", "allow");
                }
                next();
              }}
              next={invited ? "Continue" : "Send invites & continue"}
            />
          </Card>
          <div className="space-y-3 min-w-0">
            <div className="eyebrow">The email employees receive</div>
            <InviteEmail />
          </div>
        </div>
      )}

      {step === 6 && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="p-6 min-w-0">
            <StepHead n={7} total={total} title="Go live — watch the first decisions" sub="Send a real test action through a connected agent. It goes through the same pipeline as production traffic and shows up in the live stream." />
            <div className="space-y-2">
              {TESTS.map((t) => {
                const run = tests.find((x) => x.key === t.key);
                const agent = agentById(t.agentId);
                const native = nativeFor(agent, t.gate);
                const on = !!connectedNow[t.agentId];
                const dv = run?.v;
                return (
                  <div key={t.key} className="rounded-xl border border-line">
                    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <Logo name={agent.logo} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold">{t.label}</div>
                        <div className="font-mono text-[11.5px] text-fg-3 truncate">{t.gate.display}</div>
                      </div>
                      {run?.stage === 4 && dv ? <DecisionPill d={dv.decision} /> : null}
                      {run?.stage === 4 && dv?.observed && <Chip tone="review">would {dv.observed}</Chip>}
                      {!on && <Chip>connect in step 4</Chip>}
                      <Button size="sm" onClick={() => runTest(t.key)} disabled={!on || (!!run && run.stage < 4)}>
                        {run && run.stage < 4 ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3 fill-current" />} {run ? "Run again" : "Send test"}
                      </Button>
                    </div>
                    {run && (
                      <div className="border-t border-line px-4 py-3 grid gap-3 md:grid-cols-[200px_1fr]">
                        <div className="space-y-1.5">
                          {["Intercepted", "Normalized", "Policy matched", "Decided"].map((s, i) => (
                            <div key={s} className="flex items-center gap-2 text-[12px]">
                              {run.stage > i ? <CircleCheck className="size-3.5 text-allow" /> : <Loader2 className="size-3.5 animate-spin text-fg-3" />}
                              <span className={run.stage > i ? "text-fg" : "text-fg-3"}>{s}</span>
                              {i === 2 && run.stage > i && <span className="font-mono text-[10.5px] text-fg-3">{dv?.rule === "default" ? "no rule · default ALLOW" : dv?.rule}</span>}
                            </div>
                          ))}
                        </div>
                        {run.stage === 4 && (
                          <CodeBlock
                            lang="json"
                            maxH={170}
                            code={json(native.respond(dv!.decision, { reason: dv!.reason, rule: dv!.rule, decisionId: "d-1a2b3c", permitId: "wbp_first01", rewritten: dv!.decision === "CONSTRAIN" ? t.gate.constrain?.args : undefined }))}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <Footer onBack={back} onNext={finish} next="Open the control plane" hint={tests.some((t) => t.stage === 4) ? "Your first decisions are in the live stream" : "Send at least one test to see it end to end"} />
          </Card>
          <Card className="p-5 h-fit">
            <div className="text-[13.5px] font-semibold">Setup summary</div>
            <ul className="mt-3 space-y-2.5 text-[13px]">
              {(
                [
                  [true, `Workspace “${company}” · ${idp ?? "SSO"} · ${region.toUpperCase()}`],
                  [true, `${cats.length} agent platforms selected`],
                  [true, `Contract · ${rules.length} rules · ${mode === "observe" ? "observe 7 days, then enforce" : "enforcing"}`],
                  [linkedCount > 0, `${linkedCount} of ${blocks.length} integrations verified`],
                  [true, `Approvals via ${Object.entries(channels).filter(([, v]) => v).map(([k]) => k).join(", ")} · passkey ${passkeyReq ? "required" : "optional"}`],
                  [invited, invited ? `${getState().members.length} people in the directory · laptops rolling out` : "Team not invited yet"],
                ] as const
              ).map(([ok, t]) => (
                <li key={t} className="flex items-start gap-2">
                  {ok ? <CircleCheck className="size-4 text-allow shrink-0 mt-0.5" /> : <span className="mt-1 size-3 rounded-full border-2 border-line-strong shrink-0" />}
                  <span className={ok ? "" : "text-fg-3"}>{t}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11.5px] text-fg-3 leading-relaxed">{fresh ? "Everything above is now real in this workspace — open any page in the sidebar to see it." : "Demo workspace: your choices are previewed; the demo keeps its own contract and traffic. Start a fresh workspace to build for real."}</p>
          </Card>
        </div>
      )}
    </SetupLayout>
  );
}

function BlockBody({ id, codingMode, setCodingMode, sdkKey, setSdkKey }: { id: string; codingMode: "mdm" | "cmd"; setCodingMode: (v: "mdm" | "cmd") => void; sdkKey: boolean; setSdkKey: (v: boolean) => void }) {
  if (id === "coding")
    return (
      <div className="space-y-3">
        <Segmented
          size="sm"
          value={codingMode}
          onChange={setCodingMode}
          options={[
            { value: "mdm", label: "Push with MDM (recommended)" },
            { value: "cmd", label: "Share a command" },
          ]}
        />
        {codingMode === "mdm" ? (
          <CodeBlock
            file="/Library/Application Support/ClaudeCode/managed-settings.json"
            note="users can't override managed settings"
            lang="json"
            code={AGENTS.find((a) => a.id === "claude-code")!.snippet}
          />
        ) : (
          <InlineCmd cmd="npx @wrapbox/cli install --all --org wrapbox" />
        )}
        <p className="text-[12px] text-fg-3">The installer also writes .cursor/hooks.json (failClosed), ~/.codex/hooks.json and .github/hooks/wrapbox.json, and turns on the endpoint runtime as a backstop.</p>
      </div>
    );
  if (id === "cloud") {
    const a = AGENTS.find((x) => x.id === "copilot-cloud")!;
    return <CodeBlock file={a.file} note={a.fileNote} lang="json" code={a.snippet} />;
  }
  if (id === "sdk")
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={() => setSdkKey(true)} disabled={sdkKey}>
            <KeyRound className="size-3.5" /> {sdkKey ? "Key created" : "Create SDK key for claims-agent-prod"}
          </Button>
          {sdkKey && <CopyField value="wbx_sdk_live_claimsagentprod_7Hq29fKc••••3f9a" />}
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <CodeBlock file="agent · src/claims/graph.ts" lang="ts" code={AGENTS.find((a) => a.id === "langgraph")!.snippet} />
          <CodeBlock
            file="payment-service · routes/pay.ts"
            note="resource-verified"
            lang="ts"
            code={`import { verifyPermit } from "@wrapbox/verify";

app.post("/pay", async (req, res) => {
  // signature · expiry · exact-args hash · one-time nonce
  const permit = await verifyPermit(req.header("X-Wrapbox-Permit"), req.body);
  if (!permit.ok) return res.status(403).json({ error: permit.reason });
  await ledger.pay(req.body);           // runs exactly once
  res.json({ ok: true, decision: permit.decisionId });
});`}
          />
        </div>
      </div>
    );
  if (id === "mcp")
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            ["stripe", "Stripe", "https://mcp.stripe.com", "stripe"],
            ["razorpay", "Razorpay", "https://mcp.razorpay.com/mcp", "razorpay"],
            ["github_light", "GitHub", "https://api.githubcopilot.com/mcp/", "github"],
            ["postgresql", "Postgres · prod", "postgres-mcp (stdio)", "postgres-prod"],
          ] as const
        ).map(([logo, name, up, slug]) => (
          <div key={slug} className="rounded-xl border border-line p-3">
            <div className="flex items-center gap-2">
              <Logo name={logo} size={22} rounded="rounded-md" />
              <span className="text-[13px] font-semibold">{name}</span>
            </div>
            <div className="mt-2 font-mono text-[11px] text-fg-3 line-through truncate">{up}</div>
            <div className="mt-0.5 flex items-center gap-1 font-mono text-[11.5px]">
              <ShieldCheck className="size-3 text-allow" /> https://mcp.wrapbox.ai/{slug}
              <CopyButton text={`https://mcp.wrapbox.ai/${slug}`} label="" className="ml-auto" />
            </div>
          </div>
        ))}
      </div>
    );
  if (id === "saas") {
    const a = AGENTS.find((x) => x.id === "agentforce")!;
    return <CodeBlock file={a.file} note={a.fileNote} lang="yaml" code={a.snippet} />;
  }
  if (id === "browser") {
    const a = AGENTS.find((x) => x.id === "browser-use")!;
    return <CodeBlock file={a.file} note={a.fileNote} lang="py" code={a.snippet} />;
  }
  const a = AGENTS.find((x) => x.id === "openai-handoffs")!;
  return <CodeBlock file={a.file} note={a.fileNote} lang="py" code={a.snippet} />;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[12px] font-medium">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-line bg-surface px-3 text-[13.5px] outline-none focus:border-fg-3" />
    </label>
  );
}

function CopyField({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 pl-3 pr-1 h-9 min-w-0">
      <code className="flex-1 truncate font-mono text-[12px]">{value}</code>
      <CopyButton text={value} />
    </div>
  );
}

function ShareRow({ n, title, desc, children }: { n: number; title: string; desc: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-6 place-items-center rounded-full bg-ink text-ink-fg text-[11px] font-semibold shrink-0">{n}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">{title}</div>
          <div className="text-[12px] text-fg-3 mb-2">{desc}</div>
          {children}
        </div>
      </div>
    </div>
  );
}

function InviteEmail({ onAccept, accepted }: { onAccept?: () => void; accepted?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-surface overflow-hidden">
      <div className="flex items-center gap-2 px-4 h-10 border-b border-line bg-surface-2 text-[12px] text-fg-2">
        <Mail className="size-3.5" /> Inbox · dev.k@wrapbox.ai
      </div>
      <div className="p-5">
        <div className="text-[12px] text-fg-3">From: Priya Menon via Wrapbox &lt;no-reply@wrapbox.ai&gt;</div>
        <div className="mt-1 text-[15px] font-semibold">Priya invited you to the Wrapbox workspace</div>
        <div className="mt-4 rounded-xl bg-nav p-5 text-white">
          <div className="flex items-center gap-2.5">
            <WrapboxLogo size={26} />
            <span style={{ fontFamily: "var(--font-brand)" }} className="text-[16px] font-bold">
              Wrapbox
            </span>
          </div>
          <p className="mt-3 text-[13px] text-white/80 leading-relaxed">Hi Dev — Wrapbox keeps the AI agents you use at work safe to run. Your agents keep working as they do today; Wrapbox only steps in when an action touches secrets, main, customer data or production.</p>
          <div className="mt-3 text-[12px] text-white/60">Your role: Developer · Approver (oncall-sre)</div>
          <button onClick={onAccept} className={cn("mt-4 h-9 rounded-lg px-4 text-[13px] font-semibold", accepted ? "bg-[#3fd49b] text-[#0f1b35]" : "bg-white text-[#0f1b35] hover:opacity-90")}>
            {accepted ? "✓ Invitation accepted" : "Accept invitation"}
          </button>
        </div>
        <p className="mt-3 text-[11.5px] text-fg-3">Setup takes about 3 minutes: sign in, run one command, done.</p>
      </div>
    </div>
  );
}

/* ================= Employee setup ================= */

const EMP_STEPS = [
  { t: "Invitation", s: "From your admin" },
  { t: "Sign in", s: "SSO, device check, passkey" },
  { t: "Install", s: "One command on your laptop" },
  { t: "What changes", s: "Rules in plain English" },
  { t: "Try it", s: "Real actions in Claude Code" },
  { t: "Approve from Slack", s: "You're on call" },
  { t: "You're set", s: "Your workspace" },
];

type TryKey = "test" | "env" | "force" | "delete";
interface TryDef {
  key: TryKey;
  prompt: string;
  tool: string;
  act: import("../lib/engine").Act;
  ok: string;
}
interface TryResult {
  key: TryKey;
  d: Decision | "UNGOVERNED";
  observed?: Decision;
  out: string[];
  how?: string;
}
const TRIES: TryDef[] = [
  { key: "test", prompt: "Run the unit tests", tool: "Bash(npm test)", act: { effect: "shell.exec", command: "npm test", env: "development" }, ok: "214 passed · 0 failed" },
  { key: "env", prompt: "Print the values in .env.production", tool: "Read(.env.production)", act: { effect: "filesystem.read", path: "/wrapbox/payments/.env.production", env: "development" }, ok: "DATABASE_URL=postgres://admin:••••@prod-db…  STRIPE_SECRET_KEY=sk_live_51Nx…" },
  { key: "force", prompt: "Force-push my ledger branch", tool: "Bash(git push --force origin feat/ledger)", act: { effect: "git.push", branch: "feat/ledger", command: "git push --force origin feat/ledger", env: "development" }, ok: "+ 3f9a2c1...b81e004 feat/ledger -> feat/ledger" },
  { key: "delete", prompt: "Delete the payments deployment in prod", tool: "Bash(kubectl delete deployment payments-api -n prod)", act: { effect: "shell.exec", command: "kubectl delete deployment payments-api -n prod", env: "production" }, ok: 'deployment.apps "payments-api" deleted' },
];
const CODING_LOCAL: { id: string; name: string; ver: string; file: string; logo: string }[] = [
  { id: "cursor", name: "Cursor", ver: "1.8.2", file: ".cursor/hooks.json (failClosed: true)", logo: "cursor" },
  { id: "claude-code", name: "Claude Code", ver: "2.1", file: "managed settings (PreToolUse, 90s)", logo: "claudecode" },
  { id: "codex-cli", name: "Codex CLI", ver: "0.153.4", file: "~/.codex/hooks.json", logo: "codex" },
  { id: "copilot-cli", name: "Copilot CLI", ver: "1.0", file: ".github/hooks/wrapbox.json", logo: "githubcopilot" },
];

export function EmployeeSetup() {
  const fresh = useStore((s) => s.workspace === "fresh");
  const connected = useStore((s) => s.connected);
  const members = useStore((s) => s.members);
  const version = useStore((s) => s.version);
  const ruleCount = useStore((s) => s.published.length);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const next = () => {
    setStep((s) => s + 1);
    setReached((r) => Math.max(r, step + 1));
    document.getElementById("main-scroll")?.scrollTo({ top: 0 });
  };
  const back = () => setStep((s) => Math.max(0, s - 1));
  const [accepted, setAccepted] = useState(false);
  const [signed, setSigned] = useState(false);
  const [device, setDevice] = useState(0);
  const [passkey, setPasskey] = useState(false);
  const [installed, setInstalled] = useState(0);
  const [tried, setTried] = useState<TryResult[]>([]);
  const approval = useStore((s) => s.approvals.find((a) => a.id === "ap-cli-2"));
  const invitedByAdmin = members.some((m) => m.id === EMPLOYEE.id);

  // What the installer finds: the coding agents your admin has connected are enabled for you.
  const enabled = CODING_LOCAL.filter((a) => a.id !== "copilot-cli" && connected[a.id]);
  const installLines: { t: string; ok?: boolean; dim?: boolean; warn?: boolean }[] = [
    { t: "$ npx @wrapbox/cli install --all --org wrapbox" },
    { t: "✓ signed in as dev.k@wrapbox.ai (Okta)", ok: true },
    { t: "✓ device registered: dk-macbook-pro · key in Secure Enclave", ok: true },
    { t: "→ detecting agents on this machine…", dim: true },
    ...CODING_LOCAL.map((a) =>
      enabled.some((e) => e.id === a.id)
        ? { t: `  ${a.name} ${a.ver} ${".".repeat(Math.max(2, 16 - a.name.length - a.ver.length))} enabled for you → ${a.file}`, ok: true }
        : { t: `  ${a.name} ${a.ver} ${".".repeat(Math.max(2, 16 - a.name.length - a.ver.length))} not enabled by your admin → skipped`, warn: true },
    ),
    { t: "✓ endpoint runtime on · file · process · network", ok: true },
    { t: `✓ policy cache v${version} · ${ruleCount} rules · api.wrapbox.ai 38 ms`, ok: ruleCount > 0, warn: ruleCount === 0 },
    { t: enabled.length ? "Done in 6.2s. Your agents work exactly as before." : "Done. No agents are enabled for you yet — your admin connects them in Wrapbox.", dim: true },
  ];

  useEffect(() => {
    if (!signed) return;
    let i = 0;
    const t = setInterval(() => {
      i++;
      setDevice(i);
      if (i >= 3) clearInterval(t);
    }, 380);
    return () => clearInterval(t);
  }, [signed]);

  // Arjun's Claude Code asks for a prod delete while Dev is on call — only if the contract says it needs a person.
  useEffect(() => {
    if (step !== 5) return;
    const st = getState();
    const existing = st.approvals.find((a) => a.id === "ap-cli-2");
    if (existing) return;
    const g = SCENARIOS.cli.gates[1];
    const v = evaluateNow(actOf(g), "claude-code");
    if (v.decision === "REVIEW" && st.connected["claude-code"]) ensurePending(SCENARIOS.cli, g, "claude-code", v);
  }, [step]);

  async function install() {
    for (let i = 1; i <= installLines.length; i++) {
      await sleep(i === 1 ? 200 : 330);
      setInstalled(i);
    }
    registerDevice(
      EMPLOYEE.id,
      enabled.map((a) => ({ name: a.name, logo: a.logo, state: "protected" as const, note: a.file })),
    );
    setState((s) => ({ allowed: { ...s.allowed, [EMPLOYEE.id]: Array.from(new Set([...(s.allowed[EMPLOYEE.id] ?? []), ...enabled.map((a) => a.id)])) } }));
  }

  function tryIt(t: TryDef) {
    if (tried.some((x) => x.key === t.key)) return;
    if (!getState().connected["claude-code"]) {
      setTried((x) => [...x, { key: t.key, d: "UNGOVERNED", out: [`⎿  ${t.ok}`], how: "Claude Code isn't connected to Wrapbox in this workspace, so the action ran and nobody saw it. Your admin connects it under Agents." }]);
      return;
    }
    const v = evaluateNow(t.act, "claude-code");
    const id = "try-" + t.key + "-" + Date.now().toString(36);
    const base = { agentId: "claude-code", human: EMPLOYEE.id, action: t.tool, effect: t.act.effect, rule: v.rule, reason: v.reason, latency: 2, env: t.act.env ?? "development", source: "flow" as const, observed: v.observed };
    let r: TryResult;
    if (v.decision === "BLOCK") {
      r = { key: t.key, d: "BLOCK", out: [`⎿  PreToolUse:${t.tool.startsWith("Read") ? "Read" : "Bash"} hook error: wrapbox: ${v.reason} (rule ${v.rule})`], how: t.key === "env" ? "How to get it done: `wrapbox secrets ref DATABASE_URL` gives the agent a handle, never the value." : "Blocked by your company's contract. Request an exception from My workspace if you really need it." };
      pushEvent({ ...base, decision: "BLOCK" });
    } else if (v.decision === "CONSTRAIN") {
      const rw = "git push --force-with-lease origin feat/ledger";
      r = { key: t.key, d: "CONSTRAIN", out: [`⎿  wrapbox rewrote the command (updatedInput): ${rw}`, `⎿  ${t.ok}`], how: "Allowed as a safer variant: --force-with-lease can't overwrite a teammate's commits." };
      pushEvent({ ...base, decision: "CONSTRAIN", rewritten: rw });
    } else if (v.decision === "REVIEW") {
      const approvers = resolveApprovers(v.approvers, EMPLOYEE.id);
      upsertApproval(approvalFrom({ gate: gateFromAct(id, t.tool, t.act, v), agentId: "claude-code", human: EMPLOYEE, intent: t.prompt, approvers, quorum: v.quorum, args: { ...t.act } }));
      r = { key: t.key, d: "REVIEW", out: [`⎿  ⏸ held by Wrapbox · routed to ${approvers.map((p) => p.name).join(" + ")}`], how: `You're on call, but you asked — so you can't approve it yourself. It's waiting in ${approvers[0]?.name.split(" ")[0]}'s approvals.` };
      pushEvent({ ...base, decision: "REVIEW" });
    } else {
      const risky = t.key !== "test";
      r = { key: t.key, d: "ALLOW", observed: v.observed, out: [`⎿  ✓ allowed in 2 ms · permit wbp_${id.slice(-4)}`, `⎿  ${t.ok}`], how: risky ? (v.observed ? `Observe mode: the contract would ${v.observed} this, but it's only logging for now.` : "Your contract has no rule for this, so it ran. Your admin can add one in the Intent contract.") : undefined };
      pushEvent({ ...base, decision: "ALLOW" });
    }
    setTried((x) => [...x, r]);
  }

  function finish() {
    markOnboarded("employee");
    setState({ role: "employee" });
    toast("You're set, Dev", "Your agents are protected. Nothing else to do.", "allow");
    go("/");
  }

  const total = EMP_STEPS.length;
  return (
    <SetupLayout who="employee" title="Join Wrapbox" steps={EMP_STEPS} step={step} reached={reached} onJump={setStep}>
      {step === 0 && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card className="p-6">
            <StepHead n={1} total={total} title="You've been invited" sub="Priya set up Wrapbox for the company and added you. Nothing about how you use Cursor, Claude Code or Codex changes — Wrapbox only steps in for risky actions." />
            <ul className="space-y-2 text-[13px] text-fg-2">
              <li className="flex gap-2"><CircleCheck className="size-4 text-allow shrink-0 mt-0.5" /> Edits, tests, builds, feature branches — allowed instantly</li>
              <li className="flex gap-2"><CircleCheck className="size-4 text-allow shrink-0 mt-0.5" /> Secrets, main, production, customer data — checked first</li>
              <li className="flex gap-2"><CircleCheck className="size-4 text-allow shrink-0 mt-0.5" /> Every block tells you why, and how to get the task done</li>
            </ul>
            <Footer onNext={next} disabled={!accepted} next="Continue" hint={accepted ? undefined : "Accept the invitation in the email"} />
          </Card>
          <div className="space-y-3">
            {fresh && !invitedByAdmin && (
              <div className="rounded-xl border border-review/40 bg-review-soft/60 px-3.5 py-2.5 text-[12.5px]">
                <b>Heads up:</b> in this fresh workspace Priya hasn't synced the directory yet. Accepting adds you as an invited member so you can walk through it.
              </div>
            )}
            <InviteEmail
              accepted={accepted}
              onAccept={() => {
                setAccepted(true);
                if (!getState().members.some((m) => m.id === EMPLOYEE.id)) setState((s) => ({ members: [...s.members, { id: EMPLOYEE.id, roles: ["Developer", "Approver · oncall-sre"], status: "invited" }] }));
              }}
            />
          </div>
        </div>
      )}

      {step === 1 && (
        <Card className="p-6">
          <StepHead n={2} total={total} title="Sign in and register your approval passkey" sub="You sign in with the company SSO. Because you're an approver (on-call), you also register a passkey — approvals are signed by your device, so nobody can approve as you from a script or a spoofed prompt." />
          <Button variant={signed ? "secondary" : "primary"} onClick={() => setSigned(true)} disabled={signed}>
            <Logo name="okta" size={18} rounded="rounded" /> {signed ? "Signed in as dev.k@wrapbox.ai" : "Continue with Okta"}
          </Button>
          {signed && (
            <div className="mt-4 space-y-2 rounded-xl border border-line p-4">
              <Tick on={device > 0}>macOS 15.6 · supported</Tick>
              {device > 0 && <Tick on={device > 1}>FileVault disk encryption on</Tick>}
              {device > 1 && <Tick on={device > 2}>Managed by Jamf · compliant</Tick>}
            </div>
          )}
          {device >= 3 && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                variant={passkey ? "secondary" : "primary"}
                disabled={passkey}
                onClick={async () => {
                  const ok = await askPasskey({ person: EMPLOYEE, title: "Register this Mac as your approval device", detail: "Touch ID · the private key never leaves the Secure Enclave" });
                  if (ok) setPasskey(true);
                }}
              >
                <KeyRound className="size-3.5" /> {passkey ? "Passkey registered" : "Register passkey"}
              </Button>
              {passkey && <span className="text-[12.5px] text-allow">✓ This Mac can now sign your approvals</span>}
            </div>
          )}
          <Footer onBack={back} onNext={next} disabled={!passkey} />
        </Card>
      )}

      {step === 2 && (
        <Card className="p-6">
          <StepHead n={3} total={total} title="Install on your laptop" sub="On a Jamf-managed Mac this already ran for you. On any other machine it's one command. It finds your agents and writes each one's native hook file." />
          <div className="rounded-xl bg-[#0a0e19] border border-[#1b2338] overflow-hidden">
            <div className="flex items-center gap-2 px-3.5 h-9 border-b border-[#1b2338] text-[11.5px] text-[#8a95b3] font-mono">
              <TerminalIcon className="size-3.5" /> zsh — dk-macbook-pro
              {!installed && (
                <button onClick={install} className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-white text-[#0f1b35] px-2.5 h-6 font-sans text-[12px] font-semibold">
                  <Play className="size-3 fill-current" /> Run
                </button>
              )}
            </div>
            <div className="p-4 font-mono text-[12.5px] leading-[1.75] min-h-[280px]">
              {!installed && <div className="text-white">$ npx @wrapbox/cli install --all --org wrapbox<span className="caret" /></div>}
              {installLines.slice(0, installed).map((l) => (
                <motion.div key={l.t} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn("whitespace-pre-wrap", l.ok ? "text-[#3fd49b]" : l.warn ? "text-[#f4b453]" : l.dim ? "text-[#7d879f]" : "text-white")}>
                  {l.t}
                </motion.div>
              ))}
            </div>
          </div>
          <Footer onBack={back} onNext={next} disabled={installed < installLines.length} />
        </Card>
      )}

      {step === 3 && (
        <Card className="p-6">
          <StepHead n={4} total={total} title="What changes for you" sub="Set by your admin, written in plain English. You can always read them under “Rules for me”." />
          <div className="grid gap-4 lg:grid-cols-2">
            <ul className="space-y-2">
              {(
                [
                  ["BLOCK", "Reading .env files, keys or credentials"],
                  ["BLOCK", "Pushing or merging to main"],
                  ["BLOCK", "Sending credentials to unknown domains"],
                  ["CONSTRAIN", "Querying customer PII — masked automatically"],
                  ["CONSTRAIN", "git push --force — becomes --force-with-lease"],
                  ["REVIEW", "Deleting anything in production — on-call signs"],
                  ["ALLOW", "Everything else: edits, tests, builds, feature branches"],
                ] as const
              ).map(([d, t]) => (
                <li key={t} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-[13px]">
                  <DecisionPill d={d} size="sm" className="w-[84px] justify-center" /> {t}
                </li>
              ))}
            </ul>
            <div className="rounded-xl border border-line bg-surface-2 p-4 text-[12.5px] space-y-3">
              <div className="text-[13px] font-semibold">Your privacy</div>
              <div>
                <div className="font-medium">Your admin sees</div>
                <div className="text-fg-2">Your agents' actions and decisions, laptop and hook health, your requests and approvals.</div>
              </div>
              <div>
                <div className="font-medium">Never collected</div>
                <div className="text-fg-2">Source code, file contents, chat history. Your prompt is attached only when an action needs someone's approval.</div>
              </div>
            </div>
          </div>
          <Footer onBack={back} onNext={next} />
        </Card>
      )}

      {step === 4 && (
        <Card className="p-6">
          <StepHead n={5} total={total} title="Try it in Claude Code" sub="Ask your agent for something. Every action goes through Wrapbox; watch what happens in the terminal. Try all four." />
          <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div className="space-y-2">
              {TRIES.map((t) => {
                const r = tried.find((x) => x.key === t.key);
                return (
                  <button key={t.key} onClick={() => tryIt(t)} className={cn("w-full rounded-xl border px-3 py-2.5 text-left transition-colors", r ? "border-line bg-surface-2" : "border-line hover:border-fg")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium">“{t.prompt}”</span>
                      {r && (r.d === "UNGOVERNED" ? <Chip tone="block">ungoverned</Chip> : <span className="flex items-center gap-1"><DecisionPill d={r.d} size="sm" />{r.observed && <Chip tone="review">would {r.observed}</Chip>}</span>)}
                    </div>
                  </button>
                );
              })}
              <p className="px-1 text-[11.5px] text-fg-3">Decided by contract v{version} ({ruleCount} rules){fresh ? " — the one your admin published in this workspace." : "."}</p>
            </div>
            <div className="rounded-xl bg-[#0a0e19] border border-[#1b2338] overflow-hidden">
              <div className="flex items-center gap-2 px-3.5 h-9 border-b border-[#1b2338] font-mono text-[11.5px] text-[#8a95b3]">
                <Logo name="claudecode" size={16} rounded="rounded" /> claude — ~/wrapbox/payments
                <span className="ml-auto inline-flex items-center gap-1 rounded bg-[#131a2e] px-1.5 py-0.5 text-[10px] text-[#9db4ff]">
                  <ShieldCheck className="size-3" /> wrapbox hook
                </span>
              </div>
              <div className="p-4 font-mono text-[12.5px] leading-[1.75] min-h-[300px] space-y-3">
                {!tried.length && <div className="text-[#5f6a88]">Pick a request on the left.</div>}
                {tried.map((r) => {
                  const t = { ...TRIES.find((x) => x.key === r.key)!, ...r };
                  return (
                    <motion.div key={r.key} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                      <div className="text-white font-semibold">{"> " + t.prompt}</div>
                      <div className="text-[#e7ebf6]">
                        <span className="text-[#d97757]">⏺ </span>
                        {t.tool}
                      </div>
                      {t.out.map((o) => (
                        <div key={o} className={t.d === "BLOCK" || t.d === "UNGOVERNED" ? "text-[#ff6e8a]" : t.d === "REVIEW" ? "text-[#f4b453]" : t.d === "CONSTRAIN" ? "text-[#a78bff]" : "text-[#3fd49b]"}>
                          {"  " + o}
                        </div>
                      ))}
                      {t.how && <div className="text-[#8a95b3] font-sans text-[12px] mt-1">{t.how}</div>}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
          <Footer onBack={back} onNext={next} disabled={tried.length < 2} hint={tried.length < 2 ? "Try at least two" : `${tried.length} of 4 tried · they're in your activity now`} />
        </Card>
      )}

      {step === 5 && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card className="p-6">
            <StepHead n={6} total={total} title="Approve from Slack" sub="You're in the oncall-sre approver group. When Arjun's Claude Code wants to delete a production deployment, you get this message. Approving signs the exact command with your passkey — the permit can't be reused for anything else." />
            <ul className="space-y-2 text-[13px] text-fg-2">
              <li className="flex gap-2"><CircleCheck className="size-4 text-allow shrink-0 mt-0.5" /> You see the command, the dry run and the rule — not a vague “agent wants to run a tool”.</li>
              <li className="flex gap-2"><CircleCheck className="size-4 text-allow shrink-0 mt-0.5" /> Your approval mints a permit bound to this command for 60 seconds.</li>
              <li className="flex gap-2"><CircleCheck className="size-4 text-allow shrink-0 mt-0.5" /> If the agent changes a single argument, the permit fails.</li>
            </ul>
            <Footer onBack={back} onNext={next} disabled={approval?.status === "pending" && approval.approvers.some((p) => p.id === EMPLOYEE.id)} hint={approval?.status === "pending" ? "Approve the request in Slack" : undefined} />
          </Card>
          <div className="space-y-3">
            {!approval ? (
              <div className="rounded-xl border border-line bg-surface p-5 text-[13px]">
                <div className="font-semibold">Nothing to approve right now</div>
                <p className="mt-1 text-fg-2 leading-relaxed">
                  {!connected["claude-code"]
                    ? "Claude Code isn't connected in this workspace yet, so Wrapbox never sees Arjun's actions. Your admin connects it under Agents."
                    : evaluateNow(actOf(SCENARIOS.cli.gates[1]), "claude-code").observed
                      ? "Your admin's contract is still in observe mode — Arjun's delete would only be logged (would REVIEW). Once the rule is enforced, requests like this land here."
                      : "Your contract doesn't require a person for production deletes, so Arjun's delete would just run. Ask your admin to add the Production infrastructure pack in the Intent contract."}
                </p>
              </div>
            ) : (
              <>
                <SlackCard
                  who={approval.approvers[0]?.name ?? "Dev Kapoor"}
                  title={`Claude Code needs approval for ${approval.human.name}`}
                  lines={[
                    ["Action", "kubectl delete deployment payments-api -n prod"],
                    ["Asked", `“${approval.intent}”`],
                    ["Rule", approval.rule],
                  ]}
                  done={approval.status === "approved" ? "approved" : approval.status === "rejected" ? "rejected" : undefined}
                  onApprove={() => (approval.approvers.some((p) => p.id === EMPLOYEE.id) ? approveWithPasskey(approval, EMPLOYEE) : toast("You're not an approver for this", `It's routed to ${approval.approvers.map((p) => p.name).join(", ")}`, "review"))}
                  onReject={() => toast("Try approving", "Rejecting works too — the agent gets your reason.")}
                />
                {!approval.approvers.some((p) => p.id === EMPLOYEE.id) && <div className="rounded-xl border border-review/40 bg-review-soft/60 p-3.5 text-[12.5px]">This request is routed to {approval.approvers.map((p) => p.name).join(", ")} — you're not in the approver group for it in this workspace.</div>}
                {approval.status === "approved" && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-allow/40 bg-allow-soft/60 p-3.5 text-[12.5px]">
                    <b>Signed.</b> Wrapbox minted a one-time permit for exactly this command. Arjun's Claude Code hook is released and the delete runs once.
                  </motion.div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {step === 6 && (
        <Card className="p-6">
          <StepHead n={7} total={total} title="You're set" sub="That's all an employee ever does. From here, Wrapbox stays out of the way until an action needs it." />
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["Your agents", "Cursor, Claude Code and Codex are protected on dk-macbook-pro."],
              ["Your activity", "Every decision, with a plain-language reason and a way forward."],
              ["Your approvals", "On-call requests arrive in Slack; sign with your passkey."],
            ].map(([t, d]) => (
              <div key={t} className="rounded-xl border border-line p-4">
                <div className="text-[13.5px] font-semibold">{t}</div>
                <div className="mt-1 text-[12.5px] text-fg-2">{d}</div>
              </div>
            ))}
          </div>
          <Footer onBack={back} onNext={finish} next="Open my workspace" />
        </Card>
      )}
    </SetupLayout>
  );
}
