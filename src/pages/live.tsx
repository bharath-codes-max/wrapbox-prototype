// The Enforcement Playground — a full-screen, three-column exploration of one
// intent contract. Click-driven only: nothing autoplays, nothing advances on a
// timer, and every motion in here is the direct consequence of a click.
//
// Left = ADMIN · the intent contract · Middle = THE WRAPBOX FABRIC (the teaching
// diagram + the real decision) · Right = WHERE IS THE AGENT? (the explorer).
//
// The surroundings (browser chrome, IDE, SQL editor, refund form) are simulated;
// every VERDICT is the real engine output returned by runAction() — this file
// never authors a decision string.

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowRight,
  Bot,
  Boxes,
  Braces,
  Building2,
  Check,
  ChevronDown,
  Cloud,
  Code,
  Code2,
  CreditCard,
  Cpu,
  Database,
  FileCode,
  FolderTree,
  GitBranch,
  Globe,
  Hash,
  HelpCircle,
  KeyRound,
  Laptop,
  Lock,
  LogOut,
  MessageCircle,
  MessageSquare,
  Repeat,
  RotateCcw,
  Search,
  Send,
  Server,
  ShieldCheck,
  Signature,
  Terminal,
  Upload,
  Users,
} from "lucide-react";
import {
  AGENT_POOLS,
  INTENT_CONTRACT,
  POLICY_TOGGLES,
  SURFACES,
  activeRules,
  runAction,
  type Plane,
  type RunResult,
  type ScenarioAction,
  type Surface,
  type SurfaceGroup,
} from "../data/playground";
import type { Decision } from "../data/agents";
import type { Rule } from "../data/contract";
import type { Verdict } from "../lib/engine";
import { switchWorkspace } from "../lib/store";
import { WrapboxLogo } from "../components/logo";
import { cn } from "../components/ui";

/* ============================ stage theme ============================ */
// The stage commits to a light look regardless of the app theme setting: we pin
// the app's LIGHT token values on the root so every `bg-surface` / `text-fg` /
// `text-allow` class resolves to its light value inside the playground, and the
// three screens sit on an off-white ground with a faint blue-tinted spotlight.
const STAGE: CSSProperties = {
  // app light palette (from index.css) — scoped to the playground subtree
  ["--bg" as string]: "#fafaf8",
  ["--surface" as string]: "#ffffff",
  ["--surface-2" as string]: "#f4f4f1",
  ["--surface-3" as string]: "#ebebe7",
  ["--line" as string]: "#e6e5e0",
  ["--line-strong" as string]: "#d3d2cc",
  ["--fg" as string]: "#111c35",
  ["--fg-2" as string]: "#4a5061",
  ["--fg-3" as string]: "#8a8e99",
  ["--accent" as string]: "#1848ff",
  ["--accent-2" as string]: "#5a82ff",
  ["--accent-soft" as string]: "#f0f2f8",
  ["--accent-fg" as string]: "#ffffff",
  ["--ink" as string]: "#111c35",
  ["--ink-fg" as string]: "#ffffff",
  ["--allow" as string]: "#0a8a5c",
  ["--allow-soft" as string]: "#e9f5ee",
  ["--constrain" as string]: "#6b45e0",
  ["--constrain-soft" as string]: "#f1ecfd",
  ["--review" as string]: "#b26500",
  ["--review-soft" as string]: "#fbf2e1",
  ["--block" as string]: "#d6224a",
  ["--block-soft" as string]: "#fcecee",
  fontFamily: "var(--font-sans)",
  color: "var(--fg)",
  // off-white ground with a faint spotlight, never stark white
  background: "radial-gradient(1200px 700px at 50% -8%, #eef2ff 0%, #f5f6f4 42%, #fafaf8 100%)",
};
// Text set on a saturated brand/decision color (a pill, a button, an active
// chip). The light palette's colors are dark/saturated enough that white reads
// correctly everywhere they're used — unlike the dark theme's pale colors,
// which needed dark text instead.
const ON_COLOR = "#ffffff";

const D_TEXT: Record<Decision, string> = { ALLOW: "text-allow", CONSTRAIN: "text-constrain", REVIEW: "text-review", BLOCK: "text-block" };
const D_SOFT: Record<Decision, string> = { ALLOW: "bg-allow-soft", CONSTRAIN: "bg-constrain-soft", REVIEW: "bg-review-soft", BLOCK: "bg-block-soft" };
const D_VAR: Record<Decision, string> = { ALLOW: "var(--allow)", CONSTRAIN: "var(--constrain)", REVIEW: "var(--review)", BLOCK: "var(--block)" };
const D_WORD: Record<Decision, string> = { ALLOW: "Allowed", CONSTRAIN: "Constrained", REVIEW: "Held for review", BLOCK: "Blocked" };

const EASE = [0.22, 0.61, 0.36, 1] as const;

/* ============================ small ui atoms ============================ */
function Chip({ children, tone = "muted", className }: { children: ReactNode; tone?: "muted" | "accent" | "allow" | "review" | "block" | "constrain"; className?: string }) {
  const map: Record<string, string> = {
    muted: "bg-surface-3 text-fg-2 border-line",
    accent: "bg-accent-soft text-accent border-accent/30",
    allow: "bg-allow-soft text-allow border-allow/30",
    review: "bg-review-soft text-review border-review/30",
    block: "bg-block-soft text-block border-block/30",
    constrain: "bg-constrain-soft text-constrain border-constrain/30",
  };
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium", map[tone], className)}>{children}</span>;
}

function Screen({ active, glow, label, children, className }: { active: boolean; glow: string; label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <motion.section
      animate={{ scale: active ? 1 : 0.985, opacity: active ? 1 : 0.86, filter: active ? "saturate(1)" : "saturate(0.88)" }}
      transition={{ duration: 0.45, ease: EASE }}
      className={cn("relative flex min-h-0 flex-col rounded-2xl border bg-surface", active ? "border-line-strong" : "border-line", className)}
      style={{ boxShadow: active ? `0 0 0 1px ${glow}22, 0 24px 60px -28px ${glow}66, 0 8px 30px -18px #00000088` : "0 10px 30px -22px #000000aa" }}
    >
      <div className="flex items-center gap-2 px-3.5 pt-3 pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-fg-3">{label}</div>
      <div className="min-h-0 flex-1 overflow-hidden px-3.5 pb-3.5">{children}</div>
    </motion.section>
  );
}

/* ============================ the real verdict ============================ */
function VerdictCard({ verdict, permitId, dense }: { verdict: Verdict; permitId?: string; dense?: boolean }) {
  const d = verdict.decision;
  const enforced = verdict.trace.filter((t) => t.matched);
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }} className={cn("rounded-xl border p-3", D_SOFT[d])} style={{ borderColor: `${D_VAR[d]}55` }}>
      <div className="flex items-center gap-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12.5px] font-bold tracking-wide" style={{ background: D_VAR[d], color: ON_COLOR }}>
          {d === "BLOCK" ? <Lock className="size-3.5" /> : d === "ALLOW" ? <Check className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
          {d}
        </span>
        <span className={cn("text-[12.5px] font-semibold", D_TEXT[d])}>{D_WORD[d]}</span>
        {verdict.constrain && <Chip tone="constrain" className="ml-auto">{verdict.constrain === "mask" ? "masked" : verdict.constrain}</Chip>}
      </div>
      <p className="mt-2 text-[12.5px] leading-snug text-fg">{verdict.reason}</p>
      {(verdict.approvers || verdict.quorum) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {verdict.quorum ? <Chip tone="review"><Signature className="size-3" /> quorum {verdict.quorum}</Chip> : null}
          {verdict.approvers ? <Chip tone="review">{verdict.approvers}</Chip> : null}
        </div>
      )}
      {permitId && (
        <div className="mt-2 flex items-center gap-1.5">
          <Chip tone="allow"><KeyRound className="size-3" /> {permitId}</Chip>
        </div>
      )}
      {!dense && (
        <div className="mt-2.5 border-t border-line/70 pt-2">
          <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-fg-3">Trace · {verdict.rule}</div>
          <div className="space-y-1">
            {enforced.map((t, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[11px]">
                <span className="mt-[3px] size-1.5 shrink-0 rounded-full" style={{ background: t.decision ? D_VAR[t.decision] : "var(--fg-3)" }} />
                <span className="text-fg-3">
                  <span className="font-mono text-fg-2">{t.rule.id}</span> — {t.why}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

/* ============================ browser chrome framing ============================ */
function BrowserChrome({ children, url = "console.wrapbox.ai", className }: { children: ReactNode; url?: string; className?: string }) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-surface", className)}>
      <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <div className="ml-2 flex h-6 flex-1 items-center gap-1.5 rounded-md bg-surface-2 px-2 text-[11px] text-fg-3">
          <Lock className="size-3 text-allow" />
          <span className="truncate">{url}</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3.5">{children}</div>
    </div>
  );
}

/* ============================ rule → decision (derived, never written) ============================ */
const RANK: Record<Decision, number> = { ALLOW: 1, CONSTRAIN: 2, REVIEW: 3, BLOCK: 4 };

/** The strongest decision this rule can reach — read off the Rule, not typed in. */
function ruleDecision(r: Rule): Decision {
  const cands: Decision[] = [];
  if (r.decision) cands.push(r.decision);
  for (const t of r.tiers ?? []) cands.push(t.decision);
  for (const e of r.escalations ?? []) cands.push(e.decision);
  if (r.forbid?.length) cands.push("BLOCK");
  if (!cands.length) return "ALLOW";
  return cands.sort((x, y) => RANK[y] - RANK[x])[0];
}

const DECISION_ORDER: Decision[] = ["BLOCK", "REVIEW", "CONSTRAIN", "ALLOW"];
const TONE: Record<Decision, "allow" | "review" | "block" | "constrain"> = { ALLOW: "allow", REVIEW: "review", BLOCK: "block", CONSTRAIN: "constrain" };

/* ============================ 1 · ADMIN · INTENT CONTRACT ============================ */
function IntentContract({ enabled, onToggle, onReset }: { enabled: string[]; onToggle: (id: string) => void; onReset: () => void }) {
  // The same helper runAction() uses, so the chips can never disagree with the
  // rule set the engine actually evaluated.
  const active = activeRules(enabled);
  const grouped = DECISION_ORDER.map((d) => ({ d, rules: active.filter((r) => ruleDecision(r) === d) })).filter((g) => g.rules.length);

  return (
    <BrowserChrome>
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-md bg-accent-soft"><WrapboxLogo size={14} tone="light" /></span>
        <span className="text-[12.5px] font-semibold text-fg">Wrapbox Console</span>
        <span className="ml-auto text-[11px] text-fg-3">Northwind Financial</span>
      </div>

      {/* the written intent */}
      <div className="text-[11px] uppercase tracking-[0.14em] text-fg-3">What the admin wrote</div>
      <div className="mt-1.5 rounded-lg border border-line bg-surface-2 p-3">
        {INTENT_CONTRACT.map((line, i) => (
          <p key={i} className={cn("text-[13px] leading-relaxed text-fg", i && "mt-1")}>{line}</p>
        ))}
      </div>

      {/* compiled */}
      <div className="mt-3.5 flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.14em] text-fg-3">Compiled into {active.length} rules</span>
        <span className="h-px flex-1 bg-line" />
      </div>
      <div className="mt-2 space-y-2.5">
        {grouped.map((g) => (
          <div key={g.d}>
            <div className={cn("mb-1 text-[10px] font-semibold uppercase tracking-[0.14em]", D_TEXT[g.d])}>{g.d}</div>
            <div className="flex flex-wrap gap-1.5">
              <AnimatePresence initial={false}>
                {g.rules.map((r) => (
                  <motion.span key={r.id} layout initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} transition={{ duration: 0.22, ease: EASE }} title={r.why}>
                    <Chip tone={TONE[g.d]}>{r.title}</Chip>
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>

      {/* toggles — these really add and remove rules */}
      <div className="mt-4 flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.14em] text-fg-3">Policy switches</span>
        <span className="h-px flex-1 bg-line" />
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-fg-3">
        Each switch adds or removes real rules from the set the engine evaluates. Turning one off re-runs the selected action and the decision changes.
      </p>
      <div className="mt-2 space-y-1.5">
        {POLICY_TOGGLES.map((t) => {
          const on = enabled.includes(t.id);
          return (
            <button
              key={t.id}
              onClick={() => onToggle(t.id)}
              role="switch"
              aria-checked={on}
              className={cn("flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors", on ? "border-accent/30 bg-accent-soft/60" : "border-line bg-surface-2")}
            >
              <span className={cn("mt-0.5 flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors", on ? "bg-accent" : "bg-surface-3")}>
                <motion.span layout transition={{ duration: 0.18, ease: EASE }} className="block size-3 rounded-full bg-white shadow-sm" style={{ marginLeft: on ? "12px" : 0 }} />
              </span>
              <span className="min-w-0">
                <span className={cn("block text-[12px] font-medium leading-snug", on ? "text-fg" : "text-fg-3")}>{t.label}</span>
                <span className="mt-0.5 block font-mono text-[10px] leading-snug text-fg-3">{t.ruleIds.join(" · ")}</span>
              </span>
            </button>
          );
        })}
      </div>

      <button onClick={onReset} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12px] font-medium text-fg-2 transition-colors hover:text-fg">
        <RotateCcw className="size-3.5" /> Reset the playground
      </button>
    </BrowserChrome>
  );
}

/* ============================ 2 · THE WRAPBOX FABRIC ============================ */
function FabricNode({
  icon,
  title,
  caption,
  lit,
  decision,
  delay,
  children,
}: {
  icon: ReactNode;
  title: string;
  caption: ReactNode;
  lit?: boolean;
  decision?: Decision;
  delay: number;
  children?: ReactNode;
}) {
  const c = lit && decision ? D_VAR[decision] : "var(--line)";
  return (
    <motion.div
      animate={{ borderColor: c, boxShadow: lit && decision ? `0 0 0 1px ${D_VAR[decision]}44, 0 10px 34px -20px ${D_VAR[decision]}` : "0 0 0 0 transparent" }}
      transition={{ duration: 0.35, ease: EASE, delay }}
      className="relative rounded-xl border bg-surface-2 px-3 py-2.5"
    >
      <div className="flex items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-surface-3 text-fg-2">{icon}</span>
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-fg">{title}</span>
        {lit && decision && (
          <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay, duration: 0.25 }} className="ml-auto size-2 rounded-full" style={{ background: D_VAR[decision] }} />
        )}
      </div>
      <p className="mt-1 text-[11px] leading-snug text-fg-3">{caption}</p>
      {children}
    </motion.div>
  );
}

function ForkDown() {
  return (
    <div className="relative h-5">
      <span className="absolute left-1/2 top-0 h-2.5 w-px -translate-x-1/2 bg-line-strong" />
      <span className="absolute left-[25%] right-[25%] top-2.5 h-px bg-line-strong" />
      <span className="absolute left-[25%] top-2.5 h-2.5 w-px bg-line-strong" />
      <span className="absolute right-[25%] top-2.5 h-2.5 w-px bg-line-strong" />
    </div>
  );
}
function ForkUp() {
  return (
    <div className="relative h-5">
      <span className="absolute left-[25%] top-0 h-2.5 w-px bg-line-strong" />
      <span className="absolute right-[25%] top-0 h-2.5 w-px bg-line-strong" />
      <span className="absolute left-[25%] right-[25%] top-2.5 h-px bg-line-strong" />
      <span className="absolute left-1/2 top-2.5 h-2.5 w-px -translate-x-1/2 bg-line-strong" />
    </div>
  );
}

/** The request travelling from the surface into the enforcement point. Keyed on
 *  the run so it replays on a click — and only on a click. */
function Packet({ runKey, label, decision, reduced }: { runKey: string; label: string; decision: Decision; reduced: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible">
      <motion.span
        key={runKey}
        initial={{ x: reduced ? 0 : 150, opacity: 0 }}
        animate={{ x: 0, opacity: reduced ? [0, 0] : [0, 1, 1, 0] }}
        transition={{ duration: reduced ? 0.01 : 0.52, ease: EASE, times: [0, 0.2, 0.7, 1] }}
        className="absolute right-2 top-1/2 -translate-y-1/2 truncate rounded-full border px-2 py-0.5 text-[10px] font-medium"
        style={{ borderColor: `${D_VAR[decision]}66`, background: "var(--surface)", color: D_VAR[decision], maxWidth: "70%" }}
      >
        {label}
      </motion.span>
    </div>
  );
}

function FabricMap({ run, runKey, reduced, receipts }: { run: RunResult | null; runKey: string; reduced: boolean; receipts: Receipt[] }) {
  const d = run?.verdict.decision;
  const plane = run?.plane;
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <FabricNode
        icon={<Cpu className="size-3.5" />}
        title="Control plane"
        caption="Holds the contract and the evidence. Compiles the admin's sentence into rules and signs every receipt."
        delay={0}
      />
      <ForkDown />
      <div className="grid grid-cols-2 gap-2.5">
        <div className="relative">
          <FabricNode
            icon={<Laptop className="size-3.5" />}
            title="Runtime"
            caption={
              <>
                Governs what an agent does <span className="font-semibold text-fg-2">on</span> the device. Enforced at the OS layer — Apple Endpoint Security on macOS, kernel-level confinement on Linux.
              </>
            }
            lit={plane === "runtime"}
            decision={d}
            delay={reduced ? 0 : 0.34}
          />
          {run && plane === "runtime" && <Packet runKey={runKey} label={run.verdict.rule} decision={run.verdict.decision} reduced={reduced} />}
        </div>
        <div className="relative">
          <FabricNode
            icon={<Server className="size-3.5" />}
            title="Gateway"
            caption={
              <>
                Governs what an agent does <span className="font-semibold text-fg-2">to</span> company systems — APIs, MCP, SaaS, cloud and data — even when the agent is running somewhere else.
              </>
            }
            lit={plane === "gateway"}
            decision={d}
            delay={reduced ? 0 : 0.34}
          />
          {run && plane === "gateway" && <Packet runKey={runKey} label={run.verdict.rule} decision={run.verdict.decision} reduced={reduced} />}
        </div>
      </div>
      <ForkUp />
      <FabricNode
        icon={<Signature className="size-3.5" />}
        title="Signed evidence"
        caption="Every decision — allowed, constrained, held or blocked — becomes a signed receipt the control plane can replay."
        lit={!!run}
        decision={d}
        delay={reduced ? 0 : 0.78}
      >
        <EvidenceStrip receipts={receipts} reduced={reduced} />
      </FabricNode>
    </div>
  );
}

interface Receipt {
  key: string;
  receiptId: string;
  decision: Decision;
  label: string;
}

function EvidenceStrip({ receipts, reduced }: { receipts: Receipt[]; reduced: boolean }) {
  if (!receipts.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-line/70 pt-2">
      <AnimatePresence initial={false}>
        {receipts.slice(0, 5).map((r, i) => (
          <motion.span
            key={r.key}
            initial={{ opacity: 0, y: -6, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ duration: reduced ? 0.01 : 0.3, ease: EASE, delay: i === 0 && !reduced ? 0.8 : 0 }}
            title={r.label}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 font-mono text-[10px] text-fg-2"
          >
            <span className="size-1.5 rounded-full" style={{ background: D_VAR[r.decision] }} />
            {r.receiptId}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_1fr] items-start gap-2 py-1">
      <span className="pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-3">{k}</span>
      <div className="min-w-0 text-[12px] leading-snug text-fg">{children}</div>
    </div>
  );
}

function FabricColumn({
  run,
  runKey,
  action,
  surface,
  receipts,
  reduced,
  onAnotherAgent,
}: {
  run: RunResult | null;
  runKey: string;
  action: ScenarioAction | null;
  surface: Surface | null;
  receipts: Receipt[];
  reduced: boolean;
  onAnotherAgent: () => void;
}) {
  const [why, setWhy] = useState(false);
  useEffect(() => setWhy(false), [runKey]);
  const reveal = reduced ? 0 : 0.55;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 overflow-auto pr-0.5">
      <FabricMap run={run} runKey={runKey} reduced={reduced} receipts={receipts} />

      {!run || !action || !surface ? (
        <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-line px-6 py-8 text-center">
          <div>
            <p className="text-[13px] font-medium text-fg">Pick a surface on the right, then run one of its actions.</p>
            <p className="mt-1.5 text-[12px] leading-snug text-fg-2">
              Nothing here plays on its own. Every decision below is produced by the real policy engine at the moment you click.
            </p>
          </div>
        </div>
      ) : (
        <motion.div
          key={runKey}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0.01 : 0.36, ease: EASE, delay: reveal }}
          className="rounded-xl border border-line bg-surface p-3"
        >
          <Row k="Source">
            <span className="font-medium">{run.agent}</span>
            <span className="text-fg-3">{run.agent === surface.title ? "" : ` · ${surface.title}`} — {surface.subtitle}</span>
          </Row>
          <Row k="Intent">{action.intent}</Row>
          <Row k="Enforcement point">
            <span className="inline-flex items-center gap-1.5">
              {run.plane === "runtime" ? <Laptop className="size-3.5 text-fg-2" /> : <Server className="size-3.5 text-fg-2" />}
              <span className="font-medium capitalize">{run.plane}</span>
              <span className="text-fg-3">— {run.plane === "runtime" ? "on the device" : "in front of the company system"}</span>
            </span>
          </Row>
          <Row k="Matched rule">
            <span className="font-mono text-[11.5px] text-fg-2">{run.verdict.rule}</span>
            <span className="text-fg-3"> · {run.verdict.title}</span>
          </Row>

          <div className="mt-1.5">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-3">Decision</div>
            <VerdictCard verdict={run.verdict} permitId={run.permitId} />
          </div>

          {run.rewritten && (
            <div className="mt-2 rounded-lg border border-constrain/30 bg-constrain-soft p-2.5">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-constrain">
                <Braces className="size-3" /> Rewritten before it ran
              </div>
              <div className="font-mono text-[11px] leading-snug text-fg-3 line-through decoration-block/50">{action.act.command ?? action.act.sql}</div>
              <div className="mt-1 break-all font-mono text-[11px] leading-snug text-fg">{run.rewritten}</div>
            </div>
          )}

          <div className="mt-2">
            <Row k="Result">{run.result}</Row>
            <Row k="Evidence">
              <span className="inline-flex items-center gap-1.5">
                <Chip tone={TONE[run.verdict.decision]}><Signature className="size-3" /> {run.receiptId}</Chip>
                <span className="text-fg-3">signed receipt · replayable</span>
              </span>
            </Row>
          </div>

          {/* why drawer + try another agent */}
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line/70 pt-2.5">
            <button
              onClick={() => setWhy((v) => !v)}
              aria-expanded={why}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[11.5px] font-medium text-fg-2 transition-colors hover:text-fg"
            >
              <HelpCircle className="size-3.5" /> Why?
              <ChevronDown className={cn("size-3.5 transition-transform", why && "rotate-180")} />
            </button>
            <button
              onClick={onAnotherAgent}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[11.5px] font-medium text-fg-2 transition-colors hover:text-fg"
            >
              <Repeat className="size-3.5" /> Try another agent
            </button>
            <span className="text-[11px] text-fg-3">Same rule, different agent — the decision does not change.</span>
          </div>

          <AnimatePresence initial={false}>
            {why && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: reduced ? 0.01 : 0.26, ease: EASE }}
                className="overflow-hidden"
              >
                <div className="mt-2 rounded-lg border border-line bg-surface-2 p-2.5">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-3">The rule, in plain English</div>
                  <p className="text-[12px] leading-relaxed text-fg">{action.why}</p>
                  <div className="mt-2 border-t border-line pt-2">
                    <div className="text-[11.5px] font-semibold text-fg">{run.verdict.title}</div>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-fg-2">{run.verdict.reason}</p>
                    <p className="mt-1 font-mono text-[10.5px] text-fg-3">rule {run.verdict.rule}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}

/* ============================ 3 · WHERE IS THE AGENT? ============================ */
const ICONS: Record<string, typeof Globe> = {
  Globe,
  Bot,
  Code,
  Code2,
  Hash,
  FileCode,
  MessageSquare,
  Terminal,
  CreditCard,
  Database,
  GitBranch,
  Cloud,
  MessageCircle,
  Building2,
  Laptop,
  Server,
  Boxes,
};
const iconFor = (name: string) => ICONS[name] ?? Boxes;

type TabId = "all" | "runtime" | "gateway" | "browser" | "ide" | "mcp" | "cloud" | "data" | "saas";
const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "runtime", label: "Runtime" },
  { id: "gateway", label: "Gateway" },
  { id: "browser", label: "Browser" },
  { id: "ide", label: "IDE" },
  { id: "mcp", label: "MCP" },
  { id: "cloud", label: "Cloud" },
  { id: "data", label: "Data" },
  { id: "saas", label: "SaaS" },
];
const GROUPS_OF_TAB: Record<Exclude<TabId, "all" | "runtime" | "gateway">, SurfaceGroup[]> = {
  browser: ["runtime-browser"],
  ide: ["runtime-ide", "runtime-agent"],
  mcp: ["gateway-mcp"],
  cloud: ["gateway-cloud", "gateway-deploy"],
  data: ["gateway-database"],
  saas: ["gateway-saas"],
};
function matchesTab(s: Surface, tab: TabId): boolean {
  if (tab === "all") return true;
  if (tab === "runtime" || tab === "gateway") return s.plane === tab;
  return GROUPS_OF_TAB[tab].includes(s.group);
}

const PlaneTag = ({ plane }: { plane: Plane }) => (
  <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.1em]", plane === "runtime" ? "border-accent/25 bg-accent-soft text-accent" : "border-line-strong bg-surface-3 text-fg-2")}>
    {plane === "runtime" ? <Laptop className="size-2.5" /> : <Server className="size-2.5" />}
    {plane}
  </span>
);

/* ---- the mini interfaces ---- */
function Bar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-[10.5px] text-fg-3", className)}>{children}</div>;
}

function MiniChrome({ surface, action, agent }: { surface: Surface; action: ScenarioAction | null; agent: string }) {
  const a = action;
  switch (surface.chrome) {
    case "browser":
      return (
        <div className="space-y-1.5 rounded-lg border border-line bg-surface-2 p-2">
          <div className="flex items-center gap-1.5">
            <span className="flex gap-1"><i className="size-1.5 rounded-full bg-[#ff5f57]" /><i className="size-1.5 rounded-full bg-[#febc2e]" /><i className="size-1.5 rounded-full bg-[#28c840]" /></span>
            <span className="truncate rounded-t-md border border-b-0 border-line bg-surface px-2 py-0.5 text-[10px] text-fg-2">{a?.detail ?? "New tab"}</span>
          </div>
          <Bar><Lock className="size-2.5 text-allow" /><span className="truncate">{a?.act.destination ?? "about:blank"}</span><Search className="ml-auto size-2.5" /></Bar>
          <Bar><Upload className="size-3" /><span className="truncate text-fg-2">{a?.detail ?? "Choose file…"}</span><span className="ml-auto rounded bg-surface-3 px-1.5 py-0.5 text-[9.5px] text-fg-2">Attach</span></Bar>
        </div>
      );
    case "ide":
      return (
        <div className="grid grid-cols-[76px_1fr] gap-1.5 rounded-lg border border-line bg-surface-2 p-2">
          <div className="space-y-0.5 border-r border-line pr-1.5 text-[9.5px] text-fg-3">
            <div className="flex items-center gap-1 text-fg-2"><FolderTree className="size-2.5" /> src</div>
            <div className="pl-3">checkout.ts</div>
            <div className="pl-3">pricing.ts</div>
            <div className="pl-3 text-block">.env</div>
          </div>
          <div className="space-y-1.5">
            <div className="rounded-md border border-line bg-surface px-2 py-1 font-mono text-[10px] text-fg-2">
              <span className="text-fg-3">1 </span>{a?.act.path ?? "src/checkout.ts"}
            </div>
            <Bar className="font-mono"><span className="text-allow">➜</span><span className="truncate">{a?.act.command ?? `${agent} — ask anything`}</span></Bar>
          </div>
        </div>
      );
    case "app":
      return (
        <div className="rounded-lg border border-line bg-surface-2 p-2">
          <div className="mb-1.5 flex items-center gap-1.5 border-b border-line pb-1.5">
            <span className="flex gap-1"><i className="size-1.5 rounded-full bg-[#ff5f57]" /><i className="size-1.5 rounded-full bg-[#febc2e]" /><i className="size-1.5 rounded-full bg-[#28c840]" /></span>
            <span className="text-[10px] font-medium text-fg-2">{surface.title}</span>
          </div>
          <div className="rounded-md bg-surface px-2 py-1.5 text-[10.5px] leading-snug text-fg-2">{a?.intent ?? "Ask the desktop agent to do something."}</div>
          <Bar className="mt-1.5"><span className="truncate">Message {surface.title}…</span><Send className="ml-auto size-2.5" /></Bar>
        </div>
      );
    case "console":
      return (
        <div className="rounded-lg border border-line bg-surface-2 p-2 font-mono text-[10px] leading-relaxed">
          <div className="text-fg-3">{agent}</div>
          <div className="text-fg-2"><span className="text-allow">$</span> {a?.act.command ?? a?.act.path ?? "python agent.py"}</div>
        </div>
      );
    case "sql":
      return (
        <div className="rounded-lg border border-line bg-surface-2 p-2">
          <div className="mb-1 flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.1em] text-fg-3"><Database className="size-2.5" /> {surface.title} · production</div>
          <div className="min-h-[34px] break-all rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-[10px] leading-snug text-fg-2">{a?.act.sql ?? "SELECT 1;"}</div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[9.5px] font-medium text-fg-2">Run</span>
            <span className="text-[9.5px] text-fg-3">pick an action below to run it through the Gateway</span>
          </div>
        </div>
      );
    case "payments":
      return (
        <div className="rounded-lg border border-line bg-surface-2 p-2">
          <div className="mb-1 flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.1em] text-fg-3"><CreditCard className="size-2.5" /> Refund</div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-md border border-line bg-surface px-2 py-1 font-mono text-[12px] font-semibold text-fg">
              ${(a?.act.amountUsd ?? a?.act.amount ?? 0).toLocaleString("en-US")}
            </span>
            <span className="text-[10px] text-fg-3">USD · charge ch_3Q7f…</span>
          </div>
        </div>
      );
    case "repo":
      return (
        <div className="rounded-lg border border-line bg-surface-2 p-2">
          <div className="flex items-center gap-1.5 text-[10px] text-fg-2"><GitBranch className="size-2.5" /> <span className="font-mono">{a?.act.branch ?? "main"}</span><span className="ml-auto rounded bg-surface-3 px-1.5 py-0.5 text-[9.5px]">2 checks</span></div>
          <Bar className="mt-1.5 font-mono"><span className="truncate">{a?.act.command ?? a?.act.destination ?? "api.github.com"}</span></Bar>
        </div>
      );
    case "cloud":
      return (
        <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-line bg-surface-2 p-2 text-[9.5px] text-fg-2">
          <div className="rounded-md border border-line bg-surface px-1.5 py-1">S3 · bucket</div>
          <div className="rounded-md border border-line bg-surface px-1.5 py-1">IAM · role</div>
          <div className="rounded-md border border-line bg-surface px-1.5 py-1">Deploy · {String(a?.act.env ?? "production")}</div>
          <div className="col-span-3 font-mono text-[9.5px] text-fg-3">{a?.act.destination ?? "aws.amazonaws.com"}</div>
        </div>
      );
    case "chat":
      return (
        <div className="rounded-lg border border-line bg-surface-2 p-2">
          <div className="flex items-center gap-1.5 text-[10px] text-fg-2"><Hash className="size-2.5" /> {a?.act.ctx?.["dest.external"] ? "vendor-connect (external)" : "eng-releases"}<Users className="ml-auto size-2.5 text-fg-3" /></div>
          <Bar className="mt-1.5"><span className="truncate">{a?.intent ?? "Message the channel…"}</span><Send className="ml-auto size-2.5" /></Bar>
        </div>
      );
  }
}

function SurfaceCard({
  surface,
  open,
  selectedActionId,
  agent,
  onOpen,
  onRun,
  reduced,
}: {
  surface: Surface;
  open: boolean;
  selectedActionId: string | null;
  agent: string;
  onOpen: () => void;
  onRun: (a: ScenarioAction) => void;
  reduced: boolean;
}) {
  const Icon = iconFor(surface.icon);
  // The mini interface shows the action that is actually selected on THIS surface.
  const shown = surface.actions.find((x) => x.id === selectedActionId) ?? null;
  return (
    <div className={cn("rounded-xl border bg-surface transition-colors", open ? "border-line-strong" : "border-line")}>
      <button onClick={onOpen} aria-expanded={open} className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-3 text-fg-2"><Icon className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold text-fg">{surface.title}</span>
          <span className="block truncate text-[11px] text-fg-3">{surface.subtitle}</span>
        </span>
        <PlaneTag plane={surface.plane} />
        <ChevronDown className={cn("size-3.5 shrink-0 text-fg-3 transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0.01 : 0.28, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="space-y-2 border-t border-line px-2.5 py-2.5">
              <MiniChrome surface={surface} action={shown} agent={agent} />
              <div className="space-y-1">
                {surface.actions.map((a) => {
                  const on = a.id === selectedActionId;
                  return (
                    <button
                      key={a.id}
                      onClick={() => onRun(a)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors",
                        on ? "border-accent/45 bg-accent-soft" : "border-line bg-surface-2 hover:border-line-strong",
                      )}
                    >
                      <ArrowRight className={cn("size-3 shrink-0", on ? "text-accent" : "text-fg-3")} />
                      <span className={cn("min-w-0 flex-1 truncate text-[11.5px]", on ? "font-semibold text-fg" : "text-fg-2")}>{a.label}</span>
                      {/* "selected", never "running": a BLOCKED action never ran. */}
                      {on && <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-accent">selected</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Explorer({
  tab,
  setTab,
  openId,
  setOpenId,
  selectedActionId,
  agent,
  onRun,
  reduced,
}: {
  tab: TabId;
  setTab: (t: TabId) => void;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  selectedActionId: string | null;
  agent: string;
  onRun: (s: Surface, a: ScenarioAction) => void;
  reduced: boolean;
}) {
  const list = SURFACES.filter((s) => matchesTab(s, tab));
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors", tab === t.id ? "border-accent/40 bg-accent-soft text-accent" : "border-line bg-surface-2 text-fg-3 hover:text-fg-2")}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] leading-snug text-fg-3">
        Every place an agent can run. Open one, then run an action — any surface, any order.
      </p>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-auto pr-0.5">
        {list.map((s) => (
          <SurfaceCard
            key={s.id}
            surface={s}
            open={openId === s.id}
            selectedActionId={selectedActionId}
            agent={agent}
            onOpen={() => setOpenId(openId === s.id ? null : s.id)}
            onRun={(a) => onRun(s, a)}
            reduced={reduced}
          />
        ))}
        {!list.length && <div className="grid place-items-center py-8 text-[11.5px] text-fg-3">No surfaces in this filter.</div>}
      </div>
    </div>
  );
}

/* ============================ the page ============================ */
interface Selection {
  surfaceId: string;
  actionId: string;
  agent: string;
  /** Bumped on every explicit click so motion replays — never incremented by a timer. */
  n: number;
}

const DEFAULT_TOGGLES = POLICY_TOGGLES.filter((t) => t.defaultOn).map((t) => t.id);

export function EnforcementPlayground() {
  const reduced = !!useReducedMotion();
  const [enabled, setEnabled] = useState<string[]>(DEFAULT_TOGGLES);
  const [sel, setSel] = useState<Selection | null>(null);
  const [tab, setTab] = useState<TabId>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);

  const surface = useMemo(() => SURFACES.find((s) => s.id === sel?.surfaceId) ?? null, [sel]);
  const action = useMemo(() => surface?.actions.find((a) => a.id === sel?.actionId) ?? null, [surface, sel]);

  // The only place a decision comes from. Recomputed when the selection changes
  // (a click) or a policy switch changes (a click) — never on a schedule.
  const run = useMemo(() => (action ? runAction(action, { enabledToggleIds: enabled, agent: sel?.agent }) : null), [action, enabled, sel?.agent]);
  const runKey = sel && run ? `${sel.actionId}:${sel.agent}:${sel.n}:${enabled.join(",")}` : "idle";

  // Drop a receipt for each distinct decision produced. A ref guards against the
  // double-invoke of StrictMode, not against time.
  //
  // receiptId is a stable hash of the action id, so re-running the SAME action
  // (a different agent, a policy switch) resolves to the same receipt. The strip
  // therefore carries one row per receipt id, refreshed to the newest decision,
  // rather than printing two different signed receipts under one id — an
  // evidence ledger that repeated an id would be lying about what it holds.
  const lastReceipt = useRef<string>("");
  useEffect(() => {
    if (!run || !action || runKey === "idle" || lastReceipt.current === runKey) return;
    lastReceipt.current = runKey;
    setReceipts((prev) =>
      [{ key: runKey, receiptId: run.receiptId, decision: run.verdict.decision, label: action.label }, ...prev.filter((r) => r.receiptId !== run.receiptId)].slice(0, 12),
    );
  }, [runKey, run, action]);

  const onRun = (s: Surface, a: ScenarioAction) => {
    setSel((prev) => ({ surfaceId: s.id, actionId: a.id, agent: prev?.actionId === a.id ? prev.agent : a.defaultAgent, n: (prev?.n ?? 0) + 1 }));
  };

  const anotherAgent = () => {
    if (!action || !sel) return;
    const pool = AGENT_POOLS[action.agentPool];
    const i = pool.indexOf(sel.agent);
    setSel({ ...sel, agent: pool[(i + 1 + pool.length) % pool.length], n: sel.n + 1 });
  };

  const toggle = (id: string) => setEnabled((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const reset = () => {
    setEnabled(DEFAULT_TOGGLES);
    setSel(null);
    setOpenId(null);
    setReceipts([]);
    lastReceipt.current = "";
  };

  return (
    <div style={STAGE} className="fixed inset-0 flex flex-col overflow-hidden">
      <style>{`.wbx-pg{grid-template-columns:1fr}.wbx-pg>section{min-height:640px}@media(min-width:1100px){.wbx-pg{grid-template-columns:1fr 1.34fr 1fr}.wbx-pg>section{min-height:0}}`}</style>

      {/* top chrome */}
      <header className="flex items-center gap-3 px-6 pt-4 pb-1">
        <div className="flex items-center gap-2.5">
          <WrapboxLogo size={22} tone="light" />
          <span className="font-brand text-[15px] font-bold tracking-tight text-fg" style={{ fontFamily: "var(--font-brand)" }}>Wrapbox</span>
          <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">Live demo</span>
        </div>
        <Chip className="ml-1" tone="muted"><span className="size-1.5 rounded-full bg-accent" /> Simulated environment · live policy engine</Chip>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[11px] text-fg-3 sm:inline">Northwind Financial</span>
          <button onClick={() => switchWorkspace("v2")} className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[11.5px] font-medium text-fg-2 transition-colors hover:text-fg">
            <LogOut className="size-3.5" /> Exit demo
          </button>
        </div>
      </header>

      {/* the three screens */}
      <div className="wbx-pg grid min-h-0 flex-1 gap-3 overflow-y-auto px-6 py-3">
        <Screen active glow="#7c98ff" label={<><ShieldCheck className="size-3.5" /> Admin · intent contract</>}>
          <IntentContract enabled={enabled} onToggle={toggle} onReset={reset} />
        </Screen>
        <Screen active glow="#9db4ff" label={<><Cpu className="size-3.5" /> The Wrapbox fabric</>} className="z-10">
          <FabricColumn
            run={run}
            runKey={runKey}
            action={action}
            surface={surface}
            receipts={receipts}
            reduced={reduced}
            onAnotherAgent={anotherAgent}
          />
        </Screen>
        <Screen active glow="#3fd49b" label={<><Boxes className="size-3.5" /> Where is the agent?</>}>
          <Explorer
            tab={tab}
            setTab={setTab}
            openId={openId}
            setOpenId={setOpenId}
            selectedActionId={sel?.actionId ?? null}
            agent={sel?.agent ?? ""}
            onRun={onRun}
            reduced={reduced}
          />
        </Screen>
      </div>
    </div>
  );
}

// The route still imports LiveDemo; the playground is what it renders now.
export const LiveDemo = EnforcementPlayground;
export default EnforcementPlayground;
