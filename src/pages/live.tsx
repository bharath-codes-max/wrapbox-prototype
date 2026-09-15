// The Enforcement Playground — a full-screen, three-column exploration of one
// intent contract. Click-driven only: nothing autoplays, nothing advances on a
// timer, and every motion in here is the direct consequence of a click.
//
// Left = ADMIN · deploy + the intent contract · Middle = THE WRAPBOX FABRIC (the
// teaching diagram + the real decision) · Right = WHERE IS THE AGENT? (the explorer).
//
// The surroundings (browser chrome, IDE, SQL editor, refund form, the MDM push)
// are simulated; every VERDICT is the real engine output returned by
// runAction() — this file never authors a decision string.
//
// Presentation is built from the product's own atoms (src/components/ui.tsx) and
// page idioms (fleet / settings / evidence) so this reads as the same product.

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Bot,
  Boxes,
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
  Send,
  Server,
  Signature,
  Terminal,
  Upload,
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
import { Button, Card, CardHead, Chip, D_DOT, DecisionPill, Dot, Drawer, Kbd, Segmented, Toggle, cn } from "../components/ui";

/* ============================ stage theme ============================ */
// The stage commits to a light look regardless of the app theme setting: we pin
// the app's LIGHT token values on the root so every `bg-surface` / `text-fg` /
// `text-allow` class resolves to its light value inside the playground, and the
// three cards sit on an off-white ground with a faint blue-tinted spotlight.
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
  ["--shadow" as string]: "0 1px 2px rgba(17, 28, 53, 0.04), 0 8px 24px -12px rgba(17, 28, 53, 0.12)",
  ["--shadow-lg" as string]: "0 24px 60px -24px rgba(17, 28, 53, 0.35)",
  fontFamily: "var(--font-sans)",
  color: "var(--fg)",
  // off-white ground with a faint spotlight, never stark white
  background: "radial-gradient(1200px 700px at 50% -8%, #eef2ff 0%, #f5f6f4 42%, #fafaf8 100%)",
};

const D_WORD: Record<Decision, string> = { ALLOW: "Allowed", CONSTRAIN: "Constrained", REVIEW: "Held for review", BLOCK: "Blocked" };

// The product's motion vocabulary: springs for things that land (Segmented,
// Drawer), a single ease for glides.
const SPRING = { type: "spring", duration: 0.35, bounce: 0.15 } as const;
const EASE = [0.22, 0.61, 0.36, 1] as const;

/* ============================ deploy (new, click-driven) ============================ */
type DeployState = "idle" | "onboarded" | "pushed";

const ORG = { name: "Northwind Financial", sso: "Okta · SAML", region: "us-east-1", mdm: "Jamf Pro" };

/** The four devices in the MDM scope. Simulated fleet; deterministic key ids. */
const FLEET: { host: string; os: string }[] = [
  { host: "nwf-mbp-0417", os: "macOS 15.3" },
  { host: "nwf-mbp-0422", os: "macOS 15.3" },
  { host: "nwf-lnx-ci-02", os: "Ubuntu 24.04" },
  { host: "nwf-mbp-0431", os: "macOS 14.7" },
];

/** Device key id: FNV-1a over the hostname, so the same host always shows the same `dk_…`. No randomness. */
function keyIdFor(host: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < host.length; i++) {
    h ^= host.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `dk_${h.toString(16).padStart(8, "0")}`;
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

/* ============================ the real verdict ============================ */
function VerdictCard({ verdict, permitId, rewritten, original }: { verdict: Verdict; permitId?: string; rewritten?: string; original?: string }) {
  const d = verdict.decision;
  const enforced = verdict.trace.filter((t) => t.matched);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <DecisionPill d={d} />
        <span className="text-[13px] font-semibold">{D_WORD[d]}</span>
        {verdict.constrain && <Chip tone="muted"><span className={cn("size-1.5 rounded-full", D_DOT.CONSTRAIN)} />{verdict.constrain === "mask" ? "masked" : verdict.constrain}</Chip>}
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">{verdict.reason}</p>
      {enforced.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {enforced.slice(0, 2).map((t, i) => (
            <div key={i} className="text-[12px] leading-snug text-fg-3">
              <span className="font-mono text-fg-2">{t.rule.id}</span> — {t.why}
            </div>
          ))}
        </div>
      )}
      {(verdict.approvers || verdict.quorum || permitId) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {verdict.approvers && <Chip tone="review">{verdict.approvers}</Chip>}
          {verdict.quorum ? <Chip tone="review"><Signature className="size-3" /> quorum {verdict.quorum}</Chip> : null}
          {permitId && <Chip tone="accent"><KeyRound className="size-3" /> {permitId}</Chip>}
        </div>
      )}
      {rewritten && (
        <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3">
          <div className="eyebrow mb-1.5">Rewritten before it ran</div>
          <div className="font-mono text-[11.5px] leading-snug text-fg-3 line-through">{original}</div>
          <div className="mt-1 break-all font-mono text-[11.5px] leading-snug text-fg">{rewritten}</div>
        </div>
      )}
    </div>
  );
}

/* ============================ 1 · ADMIN ============================ */
function DeployCard({ deploy, onOnboard, onPush, reduced }: { deploy: DeployState; onOnboard: () => void; onPush: () => void; reduced: boolean }) {
  const onboarded = deploy !== "idle";
  const pushed = deploy === "pushed";
  return (
    <Card className="shrink-0 overflow-hidden">
      {/* The one prism on the page: the same ribbed glass as the product's Get-started tile, as a slim
          band. Its ambient drift is frozen here — on this stage nothing moves without a click. */}
      <div className="hero-prism h-2" style={{ animation: "none" }} aria-hidden />
      <CardHead title="Deploy" sub="Create the workspace, then push wrapboxd to the fleet. Two clicks; nothing here runs on its own." />
      <div className="border-t border-line">
        {/* Step 1 */}
        <div className="px-6 py-4 border-b border-line">
          <div className="flex items-center justify-between gap-3">
            <div className="eyebrow">Step 1 · Create workspace</div>
            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-fg-3">
              <Dot tone={onboarded ? "allow" : "muted"} /> {onboarded ? "done" : "idle"}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-[112px_1fr] gap-y-1.5 text-[12.5px]">
            <dt className="text-fg-3">Organization</dt>
            <dd className="font-medium">{ORG.name}</dd>
            <dt className="text-fg-3">Single sign-on</dt>
            <dd className="font-medium">{ORG.sso}</dd>
            <dt className="text-fg-3">Region</dt>
            <dd className="font-mono text-[12px]">{ORG.region}</dd>
          </dl>
          <div className="mt-3 flex items-center gap-3">
            {onboarded ? (
              <>
                <Chip tone="allow"><Check className="size-3" /> Workspace created</Chip>
                <span className="font-mono text-[11.5px] text-fg-3">console.wrapbox.ai/northwind</span>
              </>
            ) : (
              <Button variant="primary" size="sm" onClick={onOnboard}>Create workspace</Button>
            )}
          </div>
        </div>
        {/* Step 2 */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="eyebrow">Step 2 · Push wrapboxd to the fleet</div>
            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-fg-3">
              <Dot tone={pushed ? "allow" : "muted"} /> {pushed ? "done" : "idle"}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-lg bg-surface-2 text-fg-2"><Laptop className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold">{ORG.mdm}</div>
              <div className="text-[12px] text-fg-2">{FLEET.length} devices in scope · macOS and Linux</div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            {pushed ? (
              <Chip tone="allow"><Check className="size-3" /> Pushed · {FLEET.length} enrolled</Chip>
            ) : (
              <Button variant="accent" size="sm" onClick={onPush} disabled={!onboarded}>Push via MDM</Button>
            )}
            <AnimatePresence initial={false}>
              {!onboarded && (
                <motion.span key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0.01 : 0.2 }} className="text-[11.5px] text-fg-3">
                  create the workspace first
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </Card>
  );
}

function IntentContract({ enabled, onToggle, onReset, reduced }: { enabled: string[]; onToggle: (id: string) => void; onReset: () => void; reduced: boolean }) {
  // The same helper runAction() uses, so the chips can never disagree with the
  // rule set the engine actually evaluated.
  const active = activeRules(enabled);
  const grouped = DECISION_ORDER.map((d) => ({ d, rules: active.filter((r) => ruleDecision(r) === d) })).filter((g) => g.rules.length);

  return (
    <Card className="shrink-0">
      <CardHead title="Intent contract" sub="What the admin wrote" right={<Button variant="ghost" size="sm" onClick={onReset}><RotateCcw className="size-3.5" /> Reset</Button>} />
      <div className="border-t border-line">
        <div className="px-6 py-4 border-b border-line">
          <blockquote className="border-l-2 border-accent pl-3">
            {INTENT_CONTRACT.map((line, i) => (
              <p key={i} className={cn("text-[13.5px] leading-relaxed", i && "mt-1")}>{line}</p>
            ))}
          </blockquote>
        </div>

        {/* compiled */}
        <div className="px-6 py-4 border-b border-line">
          <div className="eyebrow">Compiled into {active.length} rules</div>
          <div className="mt-3 space-y-3">
            {grouped.map((g) => (
              <div key={g.d}>
                <div className="eyebrow mb-1.5 flex items-center gap-1.5">
                  <span className={cn("size-1.5 rounded-full", D_DOT[g.d])} />
                  {g.d} · {g.rules.length}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <AnimatePresence initial={false}>
                    {g.rules.map((r) => (
                      <motion.span key={r.id} layout initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} transition={reduced ? { duration: 0.01 } : SPRING} title={r.why}>
                        <Chip tone="muted">{r.title}</Chip>
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* toggles — these really add and remove rules */}
        <div className="px-6 pt-4 pb-2">
          <div className="eyebrow">Policy switches</div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-fg-3">Each switch adds or removes real rules from the set the engine evaluates. Turning one off re-runs the selected action, and the decision changes.</p>
        </div>
        <div>
          {POLICY_TOGGLES.map((t, i) => {
            const on = enabled.includes(t.id);
            return (
              <div key={t.id} className={cn("flex items-center gap-4 px-6 py-3.5", i < POLICY_TOGGLES.length - 1 && "border-b border-line")}>
                <div className="min-w-0 flex-1">
                  <div className={cn("text-[13.5px] font-semibold", !on && "text-fg-2")}>{t.label}</div>
                  <div className="mt-0.5 font-mono text-[11.5px] text-fg-3 truncate">{t.ruleIds.join(" · ")}</div>
                </div>
                <Toggle on={on} onChange={() => onToggle(t.id)} label={t.label} />
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

/* ============================ 2 · THE WRAPBOX FABRIC ============================ */
function Node({ icon, title, copy, lit, ruleId, right, reduced, children }: { icon: ReactNode; title: string; copy: ReactNode; lit?: boolean; ruleId?: string; right?: ReactNode; reduced: boolean; children?: ReactNode }) {
  return (
    <motion.div
      animate={{ boxShadow: lit ? "0 0 0 2px color-mix(in oklab, var(--accent) 30%, transparent)" : "0 0 0 0px transparent" }}
      transition={{ duration: reduced ? 0.01 : 0.3, ease: EASE, delay: lit && !reduced ? 0.4 : 0 }}
      className="relative overflow-hidden rounded-xl border border-line bg-surface-2 px-3.5 py-3"
    >
      {lit && <motion.span layout initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: reduced ? 0.01 : 0.3, ease: EASE, delay: reduced ? 0 : 0.4 }} className="prism-swatch absolute inset-x-0 top-0 h-[2px] origin-left" />}
      <div className="flex items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-surface text-fg-2 border border-line">{icon}</span>
        <span className="eyebrow !text-fg">{title}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {right}
          <AnimatePresence initial={false}>
            {lit && ruleId && (
              <motion.span key={ruleId} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={reduced ? { duration: 0.01 } : { ...SPRING, delay: 0.45 }}>
                <Chip tone="accent"><span className="font-mono">{ruleId}</span></Chip>
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-fg-3">{copy}</p>
      {children}
    </motion.div>
  );
}

function RailDown() {
  return (
    <div className="relative h-5" aria-hidden>
      <span className="absolute left-1/2 top-0 h-2.5 w-px -translate-x-1/2 bg-line" />
      <span className="absolute left-[25%] right-[25%] top-2.5 h-px bg-line" />
      <span className="absolute left-[25%] top-2.5 h-2.5 w-px bg-line" />
      <span className="absolute right-[25%] top-2.5 h-2.5 w-px bg-line" />
    </div>
  );
}
function RailUp() {
  return (
    <div className="relative h-5" aria-hidden>
      <span className="absolute left-[25%] top-0 h-2.5 w-px bg-line" />
      <span className="absolute right-[25%] top-0 h-2.5 w-px bg-line" />
      <span className="absolute left-[25%] right-[25%] top-2.5 h-px bg-line" />
      <span className="absolute left-1/2 top-2.5 h-2.5 w-px -translate-x-1/2 bg-line" />
    </div>
  );
}

/** The request travelling from the top of the map into the enforcement point.
 *  Keyed on the run so it replays on a click — and only on a click. */
function Packet({ runKey, label, reduced }: { runKey: string; label: string; reduced: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center">
      <motion.span
        key={runKey}
        initial={{ y: reduced ? 6 : -64, opacity: 0 }}
        animate={{ y: 6, opacity: [0, 1, 1, 0] }}
        transition={{ duration: reduced ? 0.01 : 0.6, ease: EASE, times: [0, 0.2, 0.75, 1] }}
        className="max-w-[80%]"
      >
        <Chip tone="accent" className="shadow-card"><span className="font-mono truncate">{label}</span></Chip>
      </motion.span>
    </div>
  );
}

function FleetList({ deploy, reduced }: { deploy: DeployState; reduced: boolean }) {
  if (deploy !== "pushed") return <div className="mt-2.5 border-t border-line pt-2 text-[12px] text-fg-3">0 devices · push wrapboxd from the admin console</div>;
  return (
    <ul className="mt-2.5 border-t border-line">
      {FLEET.map((d, i) => (
        <motion.li
          key={d.host}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: reduced ? 0.01 : 0.28, ease: EASE, delay: reduced ? 0 : 0.12 + i * 0.14 }}
          className="py-1.5 border-b border-line last:border-0 text-[11.5px]"
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-fg truncate">{d.host}</span>
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-fg-2"><Dot tone="allow" /> enrolled</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-fg-3">
            <span className="truncate">{d.os}</span>
            <span aria-hidden>·</span>
            <span className="font-mono">{keyIdFor(d.host)}</span>
          </div>
        </motion.li>
      ))}
    </ul>
  );
}

function FabricMap({ run, runKey, effect, deploy, receiptCount, reduced }: { run: RunResult | null; runKey: string; effect: string; deploy: DeployState; receiptCount: number; reduced: boolean }) {
  const plane = run?.plane;
  const pushed = deploy === "pushed";
  return (
    <div className="px-6 py-5">
      <Node
        icon={<Cpu className="size-3.5" />}
        title="Control plane"
        copy="Holds the contract and the evidence — compiles the admin's sentence into rules and signs every receipt."
        right={pushed && <Chip tone="muted"><Signature className="size-3" /> policy bundle v1 · signed</Chip>}
        reduced={reduced}
      />
      <RailDown />
      <div className="grid grid-cols-2 gap-3">
        <div className="relative">
          <Node
            icon={<Laptop className="size-3.5" />}
            title="Runtime"
            copy="On the device · OS-level enforcement (Apple Endpoint Security on macOS, kernel confinement on Linux)."
            lit={plane === "runtime"}
            ruleId={run?.verdict.rule}
            right={pushed && <Chip tone="allow">Fleet · {FLEET.length} enrolled</Chip>}
            reduced={reduced}
          >
            <FleetList deploy={deploy} reduced={reduced} />
          </Node>
          {run && plane === "runtime" && <Packet runKey={runKey} label={effect} reduced={reduced} />}
        </div>
        <div className="relative">
          <Node
            icon={<Server className="size-3.5" />}
            title="Gateway"
            copy="To company systems — APIs, MCP, SaaS, cloud and data — even when the agent runs elsewhere."
            lit={plane === "gateway"}
            ruleId={run?.verdict.rule}
            reduced={reduced}
          />
          {run && plane === "gateway" && <Packet runKey={runKey} label={effect} reduced={reduced} />}
        </div>
      </div>
      <RailUp />
      <Node
        icon={<Signature className="size-3.5" />}
        title="Signed evidence"
        copy={receiptCount ? `${receiptCount} signed ${receiptCount === 1 ? "receipt" : "receipts"} this session · replayable from the control plane.` : "Every decision — allowed, constrained, held or blocked — becomes a signed receipt the control plane can replay."}
        reduced={reduced}
      />
    </div>
  );
}

interface Receipt {
  key: string;
  receiptId: string;
  decision: Decision;
  label: string;
}

function EvidenceList({ receipts, reduced }: { receipts: Receipt[]; reduced: boolean }) {
  if (!receipts.length) return null;
  return (
    <div className="border-t border-line">
      <div className="eyebrow px-6 pt-4 pb-2">Evidence · last {Math.min(receipts.length, 5)}</div>
      <AnimatePresence initial={false}>
        {receipts.slice(0, 5).map((r) => (
          <motion.div
            key={r.key}
            layout="position"
            initial={{ opacity: 0, y: -8, backgroundColor: "color-mix(in oklab, var(--accent) 8%, transparent)" }}
            animate={{ opacity: 1, y: 0, backgroundColor: "rgba(0,0,0,0)" }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0.01 : 0.5 }}
            className="flex items-center gap-3 px-6 py-2.5 border-b border-line last:border-0"
          >
            <DecisionPill d={r.decision} size="sm" />
            <span className="min-w-0 flex-1 truncate text-[12.5px]">{r.label}</span>
            <span className="font-mono text-[11px] text-fg-3">{r.receiptId}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** The evidence-chain list: the same vertical dotted idiom as the Evidence page. */
function Chain({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <ol className="relative">
      {rows.map((c, i) => (
        <li key={c.label} className="relative grid grid-cols-[88px_1fr] gap-3 pb-3.5 last:pb-0">
          {i < rows.length - 1 && <span className="absolute left-[91px] top-4 bottom-0 w-px bg-line" />}
          <span className="text-[12px] text-fg-3 pt-0.5">{c.label}</span>
          <span className="relative pl-4 text-[13px] min-w-0">
            <span className="absolute left-[-1px] top-[7px] size-[7px] rounded-full bg-accent" />
            {c.value}
          </span>
        </li>
      ))}
    </ol>
  );
}

function FabricColumn({
  run,
  runKey,
  action,
  surface,
  receipts,
  deploy,
  reduced,
  onAnotherAgent,
}: {
  run: RunResult | null;
  runKey: string;
  action: ScenarioAction | null;
  surface: Surface | null;
  receipts: Receipt[];
  deploy: DeployState;
  reduced: boolean;
  onAnotherAgent: () => void;
}) {
  const [why, setWhy] = useState(false);
  useEffect(() => setWhy(false), [runKey]);
  const reveal = reduced ? 0 : 0.5;
  // After the click-triggered reveal lands, bring the decision into view (the
  // map above it is tall once the fleet is enrolled). Nearest edge only — no
  // jump when it is already visible.
  const decisionRef = useRef<HTMLDivElement>(null);
  const settle = () => decisionRef.current?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  const live = run && action && surface;

  const rows = live
    ? [
        {
          label: "Source",
          value: (
            <>
              <span className="font-medium">{run.agent}</span>
              <span className="text-fg-3">{run.agent === surface.title ? "" : ` · ${surface.title}`} — {surface.subtitle}</span>
            </>
          ),
        },
        { label: "Intent", value: <span className="text-fg-2">{action.intent}</span> },
        {
          label: "Enforcement point",
          value: (
            <span className="flex flex-wrap items-center gap-x-1.5">
              {run.plane === "runtime" ? <Laptop className="size-3.5 text-fg-2" /> : <Server className="size-3.5 text-fg-2" />}
              <span className="font-medium capitalize">{run.plane}</span>
              <span className="text-fg-3">— {run.plane === "runtime" ? "on the device" : "in front of the company system"}</span>
              {run.plane === "runtime" && deploy !== "pushed" && <span className="basis-full text-[12px] text-fg-3">fleet not pushed yet — enrolled ad hoc for this run</span>}
            </span>
          ),
        },
        {
          label: "Matched rule",
          value: (
            <>
              <span className="font-mono text-[12px]">{run.verdict.rule}</span>
              <span className="text-fg-3"> · {run.verdict.title}</span>
            </>
          ),
        },
        { label: "Decision", value: <VerdictCard verdict={run.verdict} permitId={run.permitId} rewritten={run.rewritten} original={action.act.command ?? action.act.sql} /> },
        { label: "Result", value: <span className="text-fg-2">{run.result}</span> },
        {
          label: "Evidence",
          value: (
            <span className="inline-flex flex-wrap items-center gap-2">
              <Chip tone="muted"><Signature className="size-3" /> <span className="font-mono">{run.receiptId}</span></Chip>
              <span className="text-fg-3">signed receipt · replayable</span>
            </span>
          ),
        },
      ]
    : [];

  return (
    <Card className="shrink-0">
      <CardHead title="The Wrapbox fabric" sub="Where the request goes, which rule matched, and what the engine decided at the moment you clicked." />
      <div className="border-t border-line">
        <FabricMap run={run} runKey={runKey} effect={action?.act.effect ?? ""} deploy={deploy} receiptCount={receipts.length} reduced={reduced} />
      </div>

      {!live ? (
        <div className="border-t border-line px-6 py-10 text-center text-[13px] text-fg-3">Pick a surface on the right, then run one of its actions. Nothing plays on its own.</div>
      ) : (
        <div className="border-t border-line px-6 py-5">
          <motion.div ref={decisionRef} key={runKey} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0.01 : 0.35, ease: EASE, delay: reveal }} onAnimationComplete={settle}>
            <Card className="overflow-hidden">
              <CardHead title="Decision" sub={`${run.agent} · ${action.label}`} right={<DecisionPill d={run.verdict.decision} />} />
              <div className="border-t border-line px-6 py-5">
                <Chain rows={rows} />
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-line px-6 py-3.5">
                <Button variant="secondary" size="sm" onClick={() => setWhy(true)}><HelpCircle className="size-3.5" /> Why?</Button>
                <Button variant="secondary" size="sm" onClick={onAnotherAgent}><Repeat className="size-3.5" /> Try another agent</Button>
                <span className="text-[12px] text-fg-3">Same rule, different agent — the decision does not change.</span>
              </div>
            </Card>
          </motion.div>
        </div>
      )}

      <EvidenceList receipts={receipts} reduced={reduced} />

      <Drawer open={why && !!live} onClose={() => setWhy(false)} width={480} title="Why this decision">
        {live && (
          <div className="p-5 space-y-5">
            <div className="flex items-center gap-2">
              <DecisionPill d={run.verdict.decision} />
              <span className="text-[13px] font-semibold">{D_WORD[run.verdict.decision]}</span>
              <span className="ml-auto font-mono text-[11.5px] text-fg-3">{run.receiptId}</span>
            </div>
            <div>
              <div className="eyebrow mb-2">The rule, in plain English</div>
              <p className="text-[13.5px] leading-relaxed">{action.why}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface-2 p-4">
              <div className="text-[13px] font-semibold">{run.verdict.title}</div>
              {run.verdict.reason !== run.verdict.title && <p className="mt-1 text-[12.5px] leading-relaxed text-fg-2">{run.verdict.reason}</p>}
              <div className="mt-2 font-mono text-[11.5px] text-fg-3">rule {run.verdict.rule}</div>
            </div>
            <div>
              <div className="eyebrow mb-2">Evaluation trace</div>
              <Chain
                rows={run.verdict.trace
                  .filter((t) => t.matched)
                  .map((t) => ({
                    label: t.decision ?? "match",
                    value: (
                      <>
                        <span className="font-mono text-[12px]">{t.rule.id}</span>
                        <span className="text-fg-3"> — {t.why}</span>
                      </>
                    ),
                  }))}
              />
            </div>
            <div className="flex items-center gap-2 text-[12px] text-fg-3"><Kbd>Esc</Kbd> closes this panel</div>
          </div>
        )}
      </Drawer>
    </Card>
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
const TABS: { value: TabId; label: string }[] = [
  { value: "all", label: "All" },
  { value: "runtime", label: "Runtime" },
  { value: "gateway", label: "Gateway" },
  { value: "browser", label: "Browser" },
  { value: "ide", label: "IDE" },
  { value: "mcp", label: "MCP" },
  { value: "cloud", label: "Cloud" },
  { value: "data", label: "Data" },
  { value: "saas", label: "SaaS" },
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
  <Chip tone="muted" className="uppercase tracking-wide">
    {plane === "runtime" ? <Laptop className="size-3" /> : <Server className="size-3" />}
    {plane}
  </Chip>
);

/* ---- the mini interfaces (simulated surroundings, on product tokens) ---- */
const Traffic = () => (
  <span className="flex gap-1" aria-hidden>
    <i className="size-2 rounded-full bg-[#ff5f57]" />
    <i className="size-2 rounded-full bg-[#febc2e]" />
    <i className="size-2 rounded-full bg-[#28c840]" />
  </span>
);
function Field({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 h-7 text-[11.5px] text-fg-3", className)}>{children}</div>;
}

function MiniChrome({ surface, action, agent }: { surface: Surface; action: ScenarioAction | null; agent: string }) {
  const a = action;
  const box = "rounded-lg border border-line bg-surface-2 p-2.5";
  switch (surface.chrome) {
    case "browser":
      return (
        <div className={cn(box, "space-y-2")}>
          <div className="flex items-center gap-2">
            <Traffic />
            <span className="truncate rounded-t-md border border-b-0 border-line bg-surface px-2 py-0.5 text-[11px] text-fg-2">{a?.detail ?? "New tab"}</span>
          </div>
          <Field><Lock className="size-3 text-allow" /><span className="truncate font-mono">{a?.act.destination ?? "about:blank"}</span></Field>
          <Field><Upload className="size-3" /><span className="truncate text-fg-2">{a?.detail ?? "Choose file…"}</span><Chip tone="muted" className="ml-auto">Attach</Chip></Field>
        </div>
      );
    case "ide":
      return (
        <div className={cn(box, "grid grid-cols-[84px_1fr] gap-2")}>
          <div className="space-y-0.5 border-r border-line pr-2 text-[11px] text-fg-3">
            <div className="text-fg-2">src</div>
            <div className="pl-2.5">checkout.ts</div>
            <div className="pl-2.5">pricing.ts</div>
            <div className="pl-2.5 text-block">.env</div>
          </div>
          <div className="space-y-2 min-w-0">
            <div className="truncate rounded-md border border-line bg-surface px-2 py-1 font-mono text-[11px] text-fg-2"><span className="text-fg-3">1 </span>{a?.act.path ?? "src/checkout.ts"}</div>
            <Field className="font-mono"><span className="text-allow">➜</span><span className="truncate text-fg-2">{a?.act.command ?? `${agent || "agent"} — ask anything`}</span></Field>
          </div>
        </div>
      );
    case "app":
      return (
        <div className={box}>
          <div className="mb-2 flex items-center gap-2 border-b border-line pb-2">
            <Traffic />
            <span className="text-[11.5px] font-medium text-fg-2">{surface.title}</span>
          </div>
          <div className="rounded-md bg-surface px-2.5 py-2 text-[12px] leading-snug text-fg-2">{a?.intent ?? "Ask the desktop agent to do something."}</div>
          <Field className="mt-2"><span className="truncate">Message {surface.title}…</span><Send className="ml-auto size-3" /></Field>
        </div>
      );
    case "console":
      return (
        <div className={cn(box, "font-mono text-[11.5px] leading-relaxed")}>
          <div className="text-fg-3">{agent || surface.title}</div>
          <div className="break-all text-fg-2"><span className="text-allow">$</span> {a?.act.command ?? a?.act.path ?? "python agent.py"}</div>
        </div>
      );
    case "sql":
      return (
        <div className={box}>
          <div className="eyebrow mb-1.5 flex items-center gap-1.5"><Database className="size-3" /> {surface.title} · production</div>
          <div className="min-h-[38px] break-all rounded-md border border-line bg-surface px-2.5 py-2 font-mono text-[11.5px] leading-snug text-fg-2">{a?.act.sql ?? "SELECT 1;"}</div>
          <div className="mt-2 text-[11.5px] text-fg-3">Pick an action below to run it through the Gateway.</div>
        </div>
      );
    case "payments":
      return (
        <div className={box}>
          <div className="eyebrow mb-1.5 flex items-center gap-1.5"><CreditCard className="size-3" /> Refund</div>
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-line bg-surface px-2.5 py-1 font-mono text-[14px] font-semibold tnum">${(a?.act.amountUsd ?? a?.act.amount ?? 0).toLocaleString("en-US")}</span>
            <span className="text-[11.5px] text-fg-3">USD · charge ch_3Q7f…</span>
          </div>
        </div>
      );
    case "repo":
      return (
        <div className={box}>
          <div className="flex items-center gap-1.5 text-[11.5px] text-fg-2"><GitBranch className="size-3" /> <span className="font-mono">{a?.act.branch ?? "main"}</span><Chip tone="muted" className="ml-auto">2 checks</Chip></div>
          <Field className="mt-2 font-mono"><span className="truncate">{a?.act.command ?? a?.act.destination ?? "api.github.com"}</span></Field>
        </div>
      );
    case "cloud":
      return (
        <div className={cn(box, "grid grid-cols-3 gap-2 text-[11px] text-fg-2")}>
          <div className="rounded-md border border-line bg-surface px-2 py-1.5">S3 · bucket</div>
          <div className="rounded-md border border-line bg-surface px-2 py-1.5">IAM · role</div>
          <div className="rounded-md border border-line bg-surface px-2 py-1.5">Deploy · {String(a?.act.env ?? "production")}</div>
          <div className="col-span-3 truncate font-mono text-[11px] text-fg-3">{a?.act.destination ?? "aws.amazonaws.com"}</div>
        </div>
      );
    case "chat":
      return (
        <div className={box}>
          <div className="flex items-center gap-1.5 text-[11.5px] text-fg-2"><Hash className="size-3" /> {a?.act.ctx?.["dest.external"] ? "vendor-connect (external)" : "eng-releases"}</div>
          <Field className="mt-2"><span className="truncate">{a?.intent ?? "Message the channel…"}</span><Send className="ml-auto size-3" /></Field>
        </div>
      );
  }
}

function SurfaceRow({
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
    <div className={cn("border-b border-line last:border-0", open && "bg-surface-2/40")}>
      <button onClick={onOpen} aria-expanded={open} className="flex w-full items-start gap-3 px-5 py-3.5 text-left hover:bg-surface-2 transition-colors">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", open ? "bg-accent-soft text-accent" : "bg-surface-2 text-fg-2")}><Icon className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{surface.title}</span>
          <span className="block truncate text-[12px] text-fg-2">{surface.subtitle}</span>
        </span>
        <PlaneTag plane={surface.plane} />
        <ChevronDown className={cn("mt-1.5 size-3.5 shrink-0 text-fg-3 transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduced ? 0.01 : 0.28, ease: EASE }} className="overflow-hidden">
            <div className="space-y-3 px-5 pb-4">
              <MiniChrome surface={surface} action={shown} agent={agent} />
              <div>
                <div className="eyebrow mb-2">Actions</div>
                <div className="flex flex-wrap gap-1.5">
                  {surface.actions.map((a) => {
                    const on = a.id === selectedActionId;
                    return (
                      // "selected", never "running": a BLOCKED action never ran.
                      <Button key={a.id} size="sm" variant={on ? "primary" : "secondary"} onClick={() => onRun(a)} aria-pressed={on} className="max-w-full">
                        <span className="truncate">{a.label}</span>
                      </Button>
                    );
                  })}
                </div>
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
    <Card className="shrink-0">
      <CardHead title="Where is the agent?" sub="Every place an agent can run. Open one, then run an action — any surface, any order." />
      <div className="px-6 pb-4">
        <Segmented size="sm" options={TABS} value={tab} onChange={setTab} className="flex-wrap" />
      </div>
      <div className="border-t border-line">
        {list.map((s) => (
          <SurfaceRow key={s.id} surface={s} open={openId === s.id} selectedActionId={selectedActionId} agent={agent} onOpen={() => setOpenId(openId === s.id ? null : s.id)} onRun={(a) => onRun(s, a)} reduced={reduced} />
        ))}
        {!list.length && <div className="px-6 py-10 text-[12.5px] text-fg-3">No surfaces in this filter.</div>}
      </div>
    </Card>
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
  // Deploy is presentation state: it never feeds runAction(). Clicks set it; the
  // Fabric animates from it. Nothing gates the explorer on it.
  const [deploy, setDeploy] = useState<DeployState>("idle");

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
    setDeploy("idle");
  };

  // The STAGE pin covers this subtree; the product Drawer portals to <body>, so
  // the light pin is extended to the root theme while the playground is mounted
  // and restored on unmount. Presentation only.
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.dataset.theme;
    root.dataset.theme = "light";
    return () => {
      if (prev === undefined) delete root.dataset.theme;
      else root.dataset.theme = prev;
    };
  }, []);

  return (
    <div style={STAGE} className="fixed inset-0 flex flex-col overflow-hidden">
      <style>{`.wbx-pg{grid-template-columns:1fr}@media(min-width:1100px){.wbx-pg{grid-template-columns:1fr 1.34fr 1fr}.wbx-pg>div{overflow-y:auto;min-height:0}}`}</style>

      {/* top chrome */}
      <header className="flex h-14 shrink-0 items-center gap-3 px-6">
        <div className="flex items-center gap-2.5">
          <WrapboxLogo size={22} tone="light" />
          <span className="font-brand text-[15px] font-bold tracking-tight">Wrapbox</span>
          <Chip tone="accent" className="uppercase tracking-wide">Live demo</Chip>
        </div>
        <Chip tone="muted"><Dot tone="accent" /> Simulated environment · live policy engine</Chip>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-[12px] text-fg-3 sm:inline">{ORG.name}</span>
          <Button variant="secondary" size="sm" onClick={() => switchWorkspace("v2")}><LogOut className="size-3.5" /> Exit demo</Button>
        </div>
      </header>

      {/* the three columns */}
      <div className="wbx-pg grid min-h-0 flex-1 gap-3 overflow-y-auto px-6 pb-4 pt-1 scroll-thin">
        <div className="flex flex-col gap-3 scroll-thin pr-0.5">
          <DeployCard deploy={deploy} onOnboard={() => setDeploy("onboarded")} onPush={() => setDeploy("pushed")} reduced={reduced} />
          <IntentContract enabled={enabled} onToggle={toggle} onReset={reset} reduced={reduced} />
        </div>
        <div className="flex flex-col gap-3 scroll-thin pr-0.5">
          <FabricColumn run={run} runKey={runKey} action={action} surface={surface} receipts={receipts} deploy={deploy} reduced={reduced} onAnotherAgent={anotherAgent} />
        </div>
        <div className="flex flex-col gap-3 scroll-thin pr-0.5">
          <Explorer tab={tab} setTab={setTab} openId={openId} setOpenId={setOpenId} selectedActionId={sel?.actionId ?? null} agent={sel?.agent ?? ""} onRun={onRun} reduced={reduced} />
        </div>
      </div>
    </div>
  );
}

// The route still imports LiveDemo; the playground is what it renders now.
export const LiveDemo = EnforcementPlayground;
export default EnforcementPlayground;
