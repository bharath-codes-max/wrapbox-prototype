// The pitch theatre — a full-screen, three-column "policy theatre" that plays
// itself like a product film. The surroundings (browser chrome, terminal, MDM
// push, packets between planes) are simulated; every VERDICT is the real engine
// output returned by runDecision() — this file never authors a decision string.
//
// Left = ADMIN console · Middle = THE MACHINERY (the star) · Right = EMPLOYEE.
// Motion via motion/react; app design tokens, elevated onto a dark cinematic
// stage. Respects prefers-reduced-motion through the director's `reducedMotion`.

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BadgeCheck,
  Building2,
  Check,
  CheckCheck,
  Clapperboard,
  Cloud,
  Cpu,
  Database,
  Fingerprint,
  Gauge,
  KeyRound,
  Laptop,
  Lock,
  LogOut,
  Pause,
  Play,
  RotateCcw,
  ScrollText,
  Server,
  ShieldCheck,
  Signature,
} from "lucide-react";
import { LIVE_BEATS, LIVE_CHAPTERS, LIVE_RULES, runDecision, type Beat, type Plane } from "../data/live";
import { useDirector } from "../lib/liveDirector";
import type { Decision } from "../data/agents";
import type { Verdict } from "../lib/engine";
import { switchWorkspace } from "../lib/store";
import { WrapboxLogo } from "../components/logo";
import { cn } from "../components/ui";

/* ============================ stage theme ============================ */
// The stage commits to a dark look regardless of the app theme: we pin the app's
// dark token values on the root so every `bg-surface` / `text-fg` / `text-allow`
// class resolves to its dark value inside the theatre, and the three screens glow
// against an even darker ground.
const STAGE: CSSProperties = {
  // app dark palette (from index.css) — scoped to the theatre subtree
  ["--bg" as string]: "#070b15",
  ["--surface" as string]: "#0e1424",
  ["--surface-2" as string]: "#141b2e",
  ["--surface-3" as string]: "#1b2338",
  ["--line" as string]: "#1e273d",
  ["--line-strong" as string]: "#2b3652",
  ["--fg" as string]: "#e8ecf5",
  ["--fg-2" as string]: "#a3acc2",
  ["--fg-3" as string]: "#6c7590",
  ["--accent" as string]: "#7c98ff",
  ["--accent-2" as string]: "#9db4ff",
  ["--accent-soft" as string]: "#161f3a",
  ["--accent-fg" as string]: "#070b15",
  ["--ink" as string]: "#e8ecf5",
  ["--ink-fg" as string]: "#111c35",
  ["--allow" as string]: "#3fd49b",
  ["--allow-soft" as string]: "#0d271e",
  ["--constrain" as string]: "#a78bff",
  ["--constrain-soft" as string]: "#221a3f",
  ["--review" as string]: "#f4b453",
  ["--review-soft" as string]: "#2c2010",
  ["--block" as string]: "#ff6e8a",
  ["--block-soft" as string]: "#321219",
  fontFamily: "var(--font-sans)",
  color: "var(--fg)",
  // near-black cinematic ground
  background: "radial-gradient(1200px 700px at 50% -8%, #101a33 0%, #0a0f1d 42%, #05070e 100%)",
};

const D_TEXT: Record<Decision, string> = { ALLOW: "text-allow", CONSTRAIN: "text-constrain", REVIEW: "text-review", BLOCK: "text-block" };
const D_SOFT: Record<Decision, string> = { ALLOW: "bg-allow-soft", CONSTRAIN: "bg-constrain-soft", REVIEW: "bg-review-soft", BLOCK: "bg-block-soft" };
const D_VAR: Record<Decision, string> = { ALLOW: "var(--allow)", CONSTRAIN: "var(--constrain)", REVIEW: "var(--review)", BLOCK: "var(--block)" };
const D_WORD: Record<Decision, string> = { ALLOW: "Allowed", CONSTRAIN: "Constrained", REVIEW: "Held for review", BLOCK: "Blocked" };

const EASE = [0.22, 0.61, 0.36, 1] as const;

/* ============================ helpers ============================ */
const IDX: Record<string, number> = Object.fromEntries(LIVE_BEATS.map((b, i) => [b.id, i]));
const foci = (b: Beat | null): Plane[] => (!b ? [] : Array.isArray(b.focus) ? b.focus : [b.focus]);
const hasFocus = (b: Beat | null, p: Plane) => foci(b).includes(p);

/** Session ctx replayed from beat 0 up to (and including) `index` — mirrors the director. */
function ctxUpTo(index: number): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  for (let i = 0; i <= index && i < LIVE_BEATS.length; i++) {
    const s = LIVE_BEATS[i].setCtx;
    if (s) Object.assign(c, s);
  }
  return c;
}

/** The most recent decision beat of a plane at or before `index`, with its own ctx. */
function lastDecision(index: number, plane: "runtime" | "gateway") {
  for (let i = index; i >= 0; i--) {
    const b = LIVE_BEATS[i];
    if (b.decision?.plane === plane) return { beat: b, at: i };
  }
  return null;
}

/** Which machinery sub-surface is live this beat. */
function machineryView(b: Beat | null): "runtime" | "controlplane" | "gateway" {
  if (!b) return "controlplane";
  if (b.decision) return b.decision.plane;
  if (hasFocus(b, "gateway")) return "gateway";
  if (hasFocus(b, "runtime")) return "runtime";
  if (hasFocus(b, "controlplane")) return "controlplane";
  return b.chapter === 3 ? "runtime" : b.chapter === 4 ? "gateway" : "controlplane";
}

/** The latest typing stream aimed at `target` at or before `index`. */
function latestTyping(
  index: number,
  target: "admin-prompt" | "employee-terminal" | "contract-draft",
  chapters?: number[],
) {
  for (let i = index; i >= 0; i--) {
    const b = LIVE_BEATS[i];
    if (chapters && !chapters.includes(b.chapter)) continue;
    if (b.typing?.target === target) return { text: b.typing.text, at: i };
  }
  return null;
}

/* ============================ typing ============================ */
function useTyper(text: string, live: boolean, speed: number, reduced: boolean) {
  const [n, setN] = useState(live ? 0 : text.length);
  useEffect(() => {
    if (!live || reduced) {
      setN(text.length);
      return;
    }
    setN(0);
    let i = 0;
    const per = Math.max(8, 26 / speed);
    const id = window.setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) window.clearInterval(id);
    }, per);
    return () => window.clearInterval(id);
  }, [text, live, speed, reduced]);
  return { shown: text.slice(0, n), done: n >= text.length };
}

function Caret({ on }: { on: boolean }) {
  return <span className="inline-block w-[7px] -mb-[1px] ml-[1px] align-baseline" style={{ height: "1em", background: on ? "currentColor" : "transparent", animation: on ? "wbxcaret 1s steps(1) infinite" : undefined }} />;
}

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
      animate={{ scale: active ? 1 : 0.972, opacity: active ? 1 : 0.62, filter: active ? "saturate(1)" : "saturate(0.72)" }}
      transition={{ duration: 0.5, ease: EASE }}
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
        <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12.5px] font-bold tracking-wide" style={{ background: D_VAR[d], color: "#0a0f1d" }}>
          {d === "BLOCK" ? <Lock className="size-3.5" /> : d === "ALLOW" ? <Check className="size-3.5" /> : d === "REVIEW" ? <ShieldCheck className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
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

/* ============================ ADMIN column ============================ */
function BrowserChrome({ children, url = "console.wrapbox.ai" }: { children: ReactNode; url?: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-[#0b0f1c]">
      <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <div className="ml-2 flex h-6 flex-1 items-center gap-1.5 rounded-md bg-[#070b15] px-2 text-[11px] text-fg-3">
          <Lock className="size-3 text-allow" />
          <span className="truncate">{url}</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3.5">{children}</div>
    </div>
  );
}

function AdminColumn({ d }: { d: ReturnType<typeof useDirector> }) {
  const { beat, index, awaiting, resolveInteraction } = d;
  const chapter = beat?.chapter ?? 1;
  const draft = latestTyping(index, "contract-draft");
  const draftLive = beat?.typing?.target === "contract-draft" && d.state === "playing";
  const draftText = useTyper(draft?.text ?? "", draftLive, d.speed, d.reducedMotion);
  const cmd = latestTyping(index, "admin-prompt");
  const cmdLive = beat?.typing?.target === "admin-prompt" && d.state === "playing";
  const cmdText = useTyper(cmd?.text ?? "", cmdLive, d.speed, d.reducedMotion);
  const hero = LIVE_RULES.find((r) => r.id === "prod-db-write")!;

  const publishing = beat?.interactive?.kind === "publish" && awaiting;
  const verifying = beat?.interactive?.kind === "click" && awaiting;

  return (
    <BrowserChrome>
      {/* console header */}
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-md bg-accent-soft"><WrapboxLogo size={14} tone="dark" /></span>
        <span className="text-[12.5px] font-semibold text-fg">Wrapbox Console</span>
        <span className="ml-auto text-[11px] text-fg-3">Northwind Financial</span>
      </div>

      <AnimatePresence mode="wait">
        {chapter === 1 && (
          <motion.div key="c1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} className="space-y-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-fg-3">Create workspace</div>
            <Field label="Organization" value="Northwind Financial" icon={<Building2 className="size-3.5" />} />
            <Field label="Single sign-on" value="Okta · SAML" icon={<Fingerprint className="size-3.5" />} />
            <Field label="Control plane region" value="us-east-1" icon={<Server className="size-3.5" />} />
            {cmd && (
              <div className="rounded-md border border-line bg-[#070b15] px-2.5 py-1.5 font-mono text-[11px] text-fg-2">
                <span className="text-allow">$</span> {cmdText.shown}
                <Caret on={cmdLive && !cmdText.done} />
              </div>
            )}
            <InteractiveButton active={publishing && beat?.id === "c1-mdm"} label={beat?.interactive?.label ?? "Push wrapboxd to the fleet"} onClick={resolveInteraction} icon={<Laptop className="size-4" />} />
          </motion.div>
        )}

        {chapter === 2 && (
          <motion.div key="c2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} className="space-y-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-fg-3">Intent contract</div>
            <div>
              <div className="mb-1 text-[11px] font-medium text-fg-2">Describe</div>
              <div className="min-h-[86px] rounded-md border border-line bg-[#070b15] p-2.5 text-[12px] leading-relaxed text-fg">
                {draftText.shown}
                <Caret on={draftLive && !draftText.done} />
              </div>
            </div>
            {index >= IDX["c2-compile"] && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                <div className="mb-1 mt-1 text-[11px] font-medium text-fg-2">Build · <span className="font-mono text-fg-3">{hero.id}</span></div>
                <div className="flex flex-wrap gap-1.5">
                  <Chip tone="review">REVIEW</Chip>
                  <Chip>env: production</Chip>
                  <Chip tone="block">forbid: DROP · TRUNCATE · unscoped DELETE</Chip>
                  <Chip tone="review">approvers: {hero.approvers} ×{hero.quorum}</Chip>
                  <Chip>business-hours · fail-closed</Chip>
                  <Chip tone="block">PII-taint → BLOCK</Chip>
                  <Chip tone="allow">single-use permit · {hero.permit?.ttlSeconds}s</Chip>
                </div>
              </motion.div>
            )}
            <InteractiveButton active={publishing && beat?.id === "c2-publish"} label={beat?.interactive?.label ?? "Publish the contract"} onClick={resolveInteraction} icon={<ShieldCheck className="size-4" />} />
          </motion.div>
        )}

        {(chapter === 3 || chapter === 4) && (
          <motion.div key="c34" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} className="space-y-2.5">
            <div className="rounded-lg border border-allow/25 bg-allow-soft px-3 py-2">
              <div className="flex items-center gap-2 text-[12px] font-semibold text-allow"><ShieldCheck className="size-4" /> Contract v1 · live</div>
              <div className="mt-0.5 text-[11px] text-fg-2">Enforced on every laptop and at the Gateway.</div>
            </div>
            <div className="text-[11px] leading-relaxed text-fg-3">The admin watches decisions land in real time. Every one becomes a signed receipt — reviewed in Chapter 5.</div>
            <div className="font-mono text-[10.5px] text-fg-3">{hero.id} · v1 · region us-east-1</div>
          </motion.div>
        )}

        {chapter === 5 && (
          <motion.div key="c5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} className="space-y-2.5">
            <div className="text-[11px] uppercase tracking-[0.14em] text-fg-3">Evidence · signed receipts</div>
            <EvidenceFeed verified={index >= IDX["c5-verify"] && (awaiting || d.state === "done" || index > IDX["c5-verify"])} />
            <InteractiveButton active={verifying} label={beat?.interactive?.label ?? "Verify the chain"} onClick={resolveInteraction} icon={<BadgeCheck className="size-4" />} tone="allow" />
          </motion.div>
        )}
      </AnimatePresence>
    </BrowserChrome>
  );
}

function Field({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-line bg-surface-2 px-2.5 py-2">
      <span className="grid size-7 place-items-center rounded-md bg-surface-3 text-fg-2">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-fg-3">{label}</div>
        <div className="truncate text-[12.5px] font-medium text-fg">{value}</div>
      </div>
    </div>
  );
}

const RECEIPTS: { seq: number; label: string; d: Decision }[] = [
  { seq: 1, label: "PII read · masked", d: "CONSTRAIN" },
  { seq: 2, label: "Laptop write · PII taint", d: "BLOCK" },
  { seq: 3, label: "Cloud write · held", d: "REVIEW" },
  { seq: 4, label: "Write executed · permit", d: "ALLOW" },
  { seq: 5, label: "Replay · consumed", d: "BLOCK" },
];
function EvidenceFeed({ verified }: { verified: boolean }) {
  return (
    <div className="space-y-1.5">
      {RECEIPTS.map((r, i) => (
        <motion.div key={r.seq} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.09, duration: 0.35 }} className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-1.5">
          <span className="font-mono text-[10px] text-fg-3">#{r.seq}</span>
          <span className="size-1.5 rounded-full" style={{ background: D_VAR[r.d] }} />
          <span className="flex-1 truncate text-[11.5px] text-fg">{r.label}</span>
          <span className="font-mono text-[9.5px] text-fg-3">sha256…{(r.seq * 7 + 3).toString(16)}c{r.seq}a</span>
          <AnimatePresence>{verified && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-allow"><CheckCheck className="size-3.5" /></motion.span>}</AnimatePresence>
        </motion.div>
      ))}
      {verified && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 pt-0.5 text-[11.5px] font-medium text-allow">
          <BadgeCheck className="size-4" /> Chain verified — every link checks.
        </motion.div>
      )}
    </div>
  );
}

function InteractiveButton({ active, label, onClick, icon, tone = "accent" }: { active: boolean; label: string; onClick: () => void; icon: ReactNode; tone?: "accent" | "allow" }) {
  const base = tone === "allow" ? "var(--allow)" : "var(--accent)";
  return (
    <motion.button
      onClick={onClick}
      className="relative flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-semibold"
      style={{ background: active ? base : "var(--surface-3)", color: active ? "#0a0f1d" : "var(--fg-2)" }}
      animate={active ? { boxShadow: [`0 0 0 0 ${base}66`, `0 0 0 8px ${base}00`] } : { boxShadow: "0 0 0 0 transparent" }}
      transition={active ? { duration: 1.4, repeat: Infinity, ease: "easeOut" } : { duration: 0.2 }}
    >
      {icon}
      {label}
      {active && <span className="ml-1 text-[10px] font-normal opacity-80">your turn ↵</span>}
    </motion.button>
  );
}

/* ============================ MACHINERY column (the star) ============================ */
function MachineryColumn({ d }: { d: ReturnType<typeof useDirector> }) {
  const { beat, index, ctx } = d;
  const view = machineryView(beat);

  const runtime = useMemo(() => {
    const ld = lastDecision(index, "runtime");
    if (!ld) return null;
    return { ...runDecision(ld.beat, ctxUpTo(ld.at)), beat: ld.beat, at: ld.at };
  }, [index]);
  const gateway = useMemo(() => {
    const ld = lastDecision(index, "gateway");
    if (!ld) return null;
    return { ...runDecision(ld.beat, ctxUpTo(ld.at)), beat: ld.beat, at: ld.at };
  }, [index]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <Cpu className="size-4 text-accent" />
        <span className="text-[12px] font-semibold text-fg">The machinery</span>
        <span className="ml-auto flex items-center gap-1 text-[10.5px] uppercase tracking-[0.14em] text-fg-3">
          <PlaneTab on={view === "runtime"}>wrapboxd</PlaneTab>
          <PlaneTab on={view === "controlplane"}>control plane</PlaneTab>
          <PlaneTab on={view === "gateway"}>gateway</PlaneTab>
        </span>
      </div>
      <div className="relative min-h-0 flex-1">
        <AnimatePresence mode="wait">
          {view === "controlplane" && (
            <MachinerySlot key="cp">
              {beat?.chapter === 1 ? <MdmPush d={d} /> : <ControlPlaneRail d={d} />}
            </MachinerySlot>
          )}
          {view === "runtime" && (
            <MachinerySlot key="rt">
              <RuntimePlane d={d} dec={runtime} pii={ctx["session.pii_touched"] === true} timeWindow={ctx["time.window"]} />
            </MachinerySlot>
          )}
          {view === "gateway" && (
            <MachinerySlot key="gw">
              <GatewayPlane index={index} dec={gateway} />
            </MachinerySlot>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function PlaneTab({ on, children }: { on: boolean; children: ReactNode }) {
  return <span className={cn("rounded px-1.5 py-0.5 transition-colors", on ? "bg-accent-soft text-accent" : "text-fg-3")}>{children}</span>;
}
function MachinerySlot({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.985 }} transition={{ duration: 0.4, ease: EASE }} className="absolute inset-0 overflow-auto rounded-2xl border border-line-strong bg-[#0b0f1c] p-4" style={{ boxShadow: "inset 0 1px 0 #ffffff0a, 0 0 40px -18px #7c98ff55" }}>
      {children}
    </motion.div>
  );
}

/* ---- runtime (wrapboxd on the laptop) ---- */
function RuntimePlane({ d, dec, pii, timeWindow }: { d: ReturnType<typeof useDirector>; dec: ReturnType<typeof runDecision> & { beat: Beat; at: number } | null; pii: boolean; timeWindow: unknown }) {
  const firing = !!d.beat?.decision && d.beat.decision.plane === "runtime";
  const steps = ["hook intercepts", "evaluate()", dec ? dec.verdict.rule : "match rule", "decision"];
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2.5 rounded-lg border border-line bg-surface-2 px-3 py-2">
        <span className="grid size-8 place-items-center rounded-lg bg-surface-3"><Laptop className="size-4 text-fg-2" /></span>
        <div>
          <div className="text-[12.5px] font-semibold text-fg">dk-macbook-pro · wrapboxd</div>
          <div className="text-[11px] text-fg-3">runtime v1.4.2 · hooks fail-closed</div>
        </div>
        <Chip tone="allow" className="ml-auto"><span className="size-1.5 rounded-full bg-allow" /> enforcing</Chip>
      </div>

      {/* pipeline */}
      <div className="flex items-center gap-1">
        {steps.map((s, i) => (
          <div key={i} className="flex flex-1 items-center gap-1">
            <motion.div
              animate={firing ? { opacity: [0.4, 1], borderColor: ["var(--line)", "var(--accent)"] } : { opacity: 1 }}
              transition={{ delay: firing ? i * 0.18 : 0, duration: 0.4 }}
              className="flex-1 rounded-md border border-line bg-[#070b15] px-1.5 py-1.5 text-center font-mono text-[9.5px] leading-tight text-fg-2"
            >
              {s}
            </motion.div>
            {i < steps.length - 1 && <ArrowRight className="size-3 shrink-0 text-fg-3" />}
          </div>
        ))}
      </div>

      {/* session state ledger — the wow */}
      <div className="rounded-lg border border-line bg-surface-2 p-2.5">
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-fg-3"><ScrollText className="size-3" /> session state</div>
        <LedgerRow k="time.window" v={String(timeWindow ?? "—")} ok={timeWindow === "business-hours"} />
        <motion.div animate={pii ? { backgroundColor: "var(--block-soft)" } : {}} className="rounded-md">
          <LedgerRow k="session.pii_touched" v={pii ? "true" : "false"} danger={pii} ok={!pii} />
        </motion.div>
        {pii && <div className="mt-1 flex items-center gap-1 text-[10.5px] text-block"><ArrowUp className="size-3" /> this is what turns the next write red.</div>}
      </div>

      {/* the real verdict */}
      <div className="min-h-0 flex-1">
        {dec ? <VerdictCard verdict={dec.verdict} permitId={dec.permitId} /> : <Idle text="Waiting for the agent to act…" />}
      </div>
    </div>
  );
}
function LedgerRow({ k, v, ok, danger }: { k: string; v: string; ok?: boolean; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between px-1.5 py-1 font-mono text-[11px]">
      <span className="text-fg-3">{k}</span>
      <span className={cn("flex items-center gap-1 font-medium", danger ? "text-block" : ok ? "text-allow" : "text-fg-2")}>
        {v}
        {danger ? <Lock className="size-3" /> : ok ? <Check className="size-3" /> : null}
      </span>
    </div>
  );
}

/* ---- control plane (sync rail: bundle down, receipts up) ---- */
function ControlPlaneRail({ d }: { d: ReturnType<typeof useDirector> }) {
  const { beat } = d;
  const publishing = beat?.chapter === 2; // bundle glides down after publish
  const evidence = beat?.chapter === 5; // receipts glide up
  const dir = publishing ? "down" : "up";
  const packets = evidence ? RECEIPTS.map((r) => `receipt #${r.seq}`) : ["policy bundle v1"];
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <PlaneEnd icon={<ShieldCheck className="size-4 text-accent" />} title="Control Plane" sub="us-east-1 · signed" />
      </div>
      <div className="relative my-2 flex-1">
        {/* the rail */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-gradient-to-b from-accent/10 via-line to-accent/10" />
        {packets.map((label, i) => (
          <motion.div
            key={label + dir}
            initial={{ top: dir === "down" ? "2%" : "88%", opacity: 0 }}
            animate={{ top: dir === "down" ? ["2%", "88%"] : ["88%", "2%"], opacity: [0, 1, 1, 0] }}
            transition={{ duration: d.reducedMotion ? 0.01 : 2.4, delay: i * 0.5, repeat: d.reducedMotion ? 0 : Infinity, ease: EASE }}
            className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-md border border-accent/40 bg-accent-soft px-2 py-1 text-[10.5px] font-medium text-accent"
          >
            {dir === "down" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />} {label}
          </motion.div>
        ))}
      </div>
      <PlaneEnd icon={<Laptop className="size-4 text-fg-2" />} title={evidence ? "Auditors" : "Fleet · every device"} sub={evidence ? "independent verify" : "runtime + gateway"} />
    </div>
  );
}
function PlaneEnd({ icon, title, sub }: { icon: ReactNode; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-line bg-surface-2 px-3 py-2">
      <span className="grid size-8 place-items-center rounded-lg bg-surface-3">{icon}</span>
      <div>
        <div className="text-[12px] font-semibold text-fg">{title}</div>
        <div className="text-[10.5px] text-fg-3">{sub}</div>
      </div>
    </div>
  );
}

/* ---- MDM push (chapter 1) ---- */
function MdmPush({ d }: { d: ReturnType<typeof useDirector> }) {
  const pushed = d.index >= IDX["c1-mdm"] && (d.awaiting ? false : true);
  const enrolled = d.index >= IDX["c1-planes"] || (d.beat?.id === "c1-mdm" && !d.awaiting);
  return (
    <div className="flex h-full flex-col">
      <PlaneEnd icon={<ShieldCheck className="size-4 text-accent" />} title="MDM · profile" sub="wrapboxd signed profile" />
      <div className="relative my-3 flex-1">
        <div className="absolute left-1/2 top-2 bottom-14 w-px -translate-x-1/2 bg-gradient-to-b from-accent/40 to-line" />
        {(d.index >= IDX["c1-mdm"]) &&
          [0, 1, 2].map((i) => (
            <motion.div key={i} initial={{ top: "2%", opacity: 0 }} animate={{ top: "72%", opacity: [0, 1, 0] }} transition={{ duration: d.reducedMotion ? 0.01 : 1.8, delay: i * 0.35, repeat: d.reducedMotion ? 0 : Infinity }} className="absolute left-1/2 -translate-x-1/2 rounded bg-accent px-1.5 py-0.5 text-[9px] font-bold text-[#0a0f1d]" style={{ left: `${30 + i * 20}%` }}>
              profile
            </motion.div>
          ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {["dk-mbp", "arjun-mbp", "sara-mbp", "neha-win"].map((name, i) => (
          <motion.div key={name} initial={false} animate={enrolled ? { borderColor: "var(--allow)" } : {}} transition={{ delay: i * 0.15 }} className="flex flex-col items-center gap-1 rounded-lg border border-line bg-surface-2 px-1 py-2">
            <Laptop className="size-4 text-fg-2" />
            <span className="text-[9px] text-fg-3">{name}</span>
            <AnimatePresence>
              {enrolled ? (
                <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 + i * 0.15 }} className="flex items-center gap-0.5 text-[9px] font-medium text-allow">
                  <Check className="size-2.5" /> key
                </motion.span>
              ) : (
                <span className="text-[9px] text-fg-3">…</span>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
      <div className="mt-2 text-center text-[10.5px] text-fg-3">{enrolled ? "Each device minted a hardware-backed key." : "Pushing wrapboxd to the fleet…"}</div>
    </div>
  );
}

/* ---- gateway (data-plane gate in front of prod DB) ---- */
function GatewayPlane({ index, dec }: { index: number; dec: (ReturnType<typeof runDecision> & { beat: Beat; at: number }) | null }) {
  const phase = index >= IDX["c4-replay"] ? "replay" : index >= IDX["c4-execute"] ? "execute" : index >= IDX["c4-approve"] ? "approve" : "review";
  const approved = phase === "execute" || phase === "approve";
  const hero = LIVE_RULES.find((r) => r.id === "prod-db-write")!;
  return (
    <div className="flex h-full flex-col gap-2.5">
      {/* the gate */}
      <div className="flex items-center justify-between gap-2">
        <PlaneEnd icon={<Cloud className="size-4 text-fg-2" />} title="Cloud agent" sub="no laptop" />
        <motion.div animate={{ color: phase === "replay" ? "var(--block)" : approved ? "var(--allow)" : "var(--review)" }} className="flex flex-col items-center">
          <Server className="size-5" />
          <span className="text-[9px] uppercase tracking-wide">gateway</span>
        </motion.div>
        <PlaneEnd icon={<Database className="size-4 text-fg-2" />} title="prod DB" sub="us-east-1" />
      </div>

      {/* approver choreography */}
      <div className="rounded-lg border border-line bg-surface-2 p-2.5">
        <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-fg-3">
          <span>quorum · {hero.approvers}</span>
          <span>{approved ? "2 / 2" : "0 / 2"}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[0, 1].map((i) => {
            const on = phase === "approve" ? true : approved;
            return (
              <motion.div key={i} animate={on ? { borderColor: "var(--allow)", backgroundColor: "var(--allow-soft)" } : {}} transition={{ delay: phase === "approve" ? i * 0.6 : 0, duration: 0.4 }} className="flex items-center gap-2 rounded-md border border-line bg-[#070b15] px-2 py-1.5">
                <span className="grid size-6 place-items-center rounded-full bg-surface-3 text-[10px] font-semibold text-fg-2">S{i + 1}</span>
                <span className="text-[11px] text-fg-2">on-call SRE</span>
                {on && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="ml-auto text-allow"><Check className="size-3.5" /></motion.span>}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* permit / credential */}
      <AnimatePresence>
        {(phase === "execute" || phase === "replay") && dec && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: phase === "replay" ? "var(--block)55" : "var(--allow)55", background: phase === "replay" ? "var(--block-soft)" : "var(--allow-soft)" }}>
            <KeyRound className={cn("size-4", phase === "replay" ? "text-block" : "text-allow")} />
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[11px] text-fg">{dec.permitId ?? "wbp_… (consumed)"}</div>
              <div className="text-[10px] text-fg-3">ttl {hero.permit?.ttlSeconds}s · single-use · bound to {hero.permit?.bind?.join(" + ")}</div>
            </div>
            {phase === "replay" ? <Chip tone="block">dead</Chip> : <Chip tone="allow">brokered</Chip>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* the real verdict */}
      <div className="min-h-0 flex-1">{dec ? <VerdictCard verdict={dec.verdict} permitId={phase === "execute" ? dec.permitId : undefined} dense /> : <Idle text="Awaiting the cloud agent…" />}</div>
    </div>
  );
}

/* ============================ EMPLOYEE column ============================ */
function EmployeeColumn({ d }: { d: ReturnType<typeof useDirector> }) {
  const { beat } = d;
  const chapter = beat?.chapter ?? 1;
  if (chapter === 4) return <CloudRunner d={d} />;
  return <EmployeeTerminal d={d} />;
}

function EmployeeTerminal({ d }: { d: ReturnType<typeof useDirector> }) {
  const { index, beat } = d;
  // Only the laptop chapters' typing belongs in the Claude Code terminal — never
  // chapter 4's cloud-runner command (which also targets employee-terminal).
  const t = latestTyping(index, "employee-terminal", [1, 2, 3, 5]);
  const live = beat?.chapter !== 4 && beat?.typing?.target === "employee-terminal" && d.state === "playing";
  const typed = useTyper(t?.text ?? "", live, d.speed, d.reducedMotion);
  const read = useMemo(() => (index >= IDX["c3-read"] ? runDecision(LIVE_BEATS[IDX["c3-read"]], ctxUpTo(IDX["c3-read"])) : null), [index]);
  const write = useMemo(() => (index >= IDX["c3-write"] ? runDecision(LIVE_BEATS[IDX["c3-write"]], ctxUpTo(IDX["c3-write"])) : null), [index]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-[#05070e]">
      <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="ml-2 text-[11px] text-fg-3">dev@dk-macbook-pro — Claude Code</span>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3 font-mono text-[11.5px] leading-relaxed">
        <div className="text-fg-3"># an agent session on a managed laptop</div>
        {t && (
          <div className="text-fg">
            <span className="text-allow">➜</span> <span className="text-accent-2">claude</span> {typed.shown}
            {live && !typed.done && <Caret on />}
          </div>
        )}
        {read && (
          <TermBlock>
            <div className="text-fg-3">-- SELECT email, phone FROM customers …</div>
            <div className="mt-1 rounded bg-constrain-soft px-2 py-1 text-constrain">CONSTRAIN · masked on read</div>
            <div className="mt-1 whitespace-pre-wrap break-all text-[10.5px] text-fg-2">{read.maskedSql}</div>
            <table className="mt-1 w-full text-[10px] text-fg-2">
              <tbody>
                <tr><td className="pr-2 text-fg-3">1042</td><td>wbx_mask(email)</td><td>wbx_mask(phone)</td></tr>
                <tr><td className="pr-2 text-fg-3">1043</td><td>wbx_mask(email)</td><td>wbx_mask(phone)</td></tr>
              </tbody>
            </table>
          </TermBlock>
        )}
        {index >= IDX["c3-write"] && write && (
          <TermBlock>
            <div className="text-fg-3">-- UPDATE customers SET note='reviewed' …</div>
            <div className="mt-1 flex items-center gap-1.5 rounded bg-block-soft px-2 py-1 font-sans text-[11px] font-semibold text-block">
              <Lock className="size-3.5" /> Wrapbox blocked this write
            </div>
            <div className="mt-1 font-sans text-[11px] text-fg-2">{write.verdict.reason}</div>
            <div className="mt-0.5 text-[10px] text-fg-3">rule {write.verdict.rule}</div>
          </TermBlock>
        )}
      </div>
    </div>
  );
}
function TermBlock({ children }: { children: ReactNode }) {
  return <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="rounded-md border border-line bg-[#0b0f1c] p-2">{children}</motion.div>;
}

function CloudRunner({ d }: { d: ReturnType<typeof useDirector> }) {
  const { index, beat } = d;
  const t = latestTyping(index, "employee-terminal", [4]);
  const live = beat?.chapter === 4 && beat?.typing?.target === "employee-terminal" && d.state === "playing";
  const typed = useTyper(t?.text ?? "", live, d.speed, d.reducedMotion);
  const phase = index >= IDX["c4-replay"] ? "replay" : index >= IDX["c4-execute"] ? "done" : index >= IDX["c4-review"] ? "held" : "run";
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-[#0b0f1c]">
      <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
        <Cloud className="size-4 text-fg-2" />
        <span className="text-[11.5px] font-semibold text-fg">Scheduled cloud agent</span>
        <Chip className="ml-auto">no device</Chip>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3.5">
        <div className="rounded-lg border border-line bg-surface-2 p-2.5">
          <div className="flex items-center gap-2 text-[11px] text-fg-3"><Server className="size-3.5" /> nightly-reconciler · cron 02:00</div>
          <div className="mt-1.5 font-mono text-[11px] text-fg">
            <span className="text-allow">$</span> {typed.shown}
            {live && !typed.done && <Caret on />}
          </div>
        </div>
        <div className="rounded-lg border border-review/30 bg-review-soft/40 p-2.5 text-[11.5px] leading-relaxed text-fg-2">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-fg"><ShieldCheck className="size-4 text-review" /> Governed by the Gateway</div>
          This job never touches a managed device — there is no laptop runtime to lean on. The Gateway is the only thing between it and production, and it holds the write for human approval.
        </div>
        <div className="space-y-1.5">
          <Step on={phase !== "run"} label="Write intercepted at the Gateway" tone="review" />
          <Step on={phase === "done" || phase === "replay"} label="Two on-call SREs approved · permit minted" tone="allow" />
          <Step on={phase === "done" || phase === "replay"} label="Credential brokered · write ran once" tone="allow" />
          <Step on={phase === "replay"} label="Replay hit a consumed permit · dead" tone="block" />
        </div>
      </div>
    </div>
  );
}
function Step({ on, label, tone }: { on: boolean; label: string; tone: "review" | "allow" | "block" }) {
  const c = tone === "allow" ? "var(--allow)" : tone === "block" ? "var(--block)" : "var(--review)";
  return (
    <motion.div animate={{ opacity: on ? 1 : 0.4 }} className="flex items-center gap-2 text-[11.5px]">
      <span className="grid size-4 place-items-center rounded-full" style={{ background: on ? c : "var(--surface-3)" }}>{on && <Check className="size-2.5 text-[#0a0f1d]" />}</span>
      <span className="text-fg-2">{label}</span>
    </motion.div>
  );
}

function Idle({ text }: { text: string }) {
  return <div className="grid h-full place-items-center text-center text-[11.5px] text-fg-3">{text}</div>;
}

/* ============================ transport + chrome ============================ */
function Transport({ d }: { d: ReturnType<typeof useDirector> }) {
  const playing = d.state === "playing";
  return (
    <div className="flex items-center gap-3">
      <button onClick={d.restart} title="Restart" className="grid size-9 place-items-center rounded-full border border-line bg-surface-2 text-fg-2 transition-colors hover:text-fg"><RotateCcw className="size-4" /></button>
      <button onClick={d.toggle} title={playing ? "Pause" : "Play"} className="grid size-11 place-items-center rounded-full text-[#0a0f1d]" style={{ background: "var(--accent)", boxShadow: "0 8px 24px -8px var(--accent)" }}>
        {playing ? <Pause className="size-5" /> : <Play className="ml-0.5 size-5" />}
      </button>

      <div className="mx-1 flex flex-1 items-center gap-1.5">
        {LIVE_CHAPTERS.map((c) => {
          const active = d.chapter === c.n;
          return (
            <button key={c.n} onClick={() => { d.seekChapter(c.n); d.play(); }} className={cn("group relative flex-1 rounded-lg border px-2 py-1.5 text-left transition-colors", active ? "border-accent/50 bg-accent-soft" : "border-line bg-surface-2 hover:border-line-strong")}>
              <div className="flex items-center gap-1.5">
                <span className={cn("grid size-4 place-items-center rounded-full text-[9px] font-bold", active ? "bg-accent text-[#0a0f1d]" : "bg-surface-3 text-fg-3")}>{c.n}</span>
                <span className={cn("truncate text-[11px] font-medium", active ? "text-fg" : "text-fg-3")}>{c.title}</span>
              </div>
              {active && (
                <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-surface-3">
                  <motion.div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(d.progress * 100)}%` }} transition={{ ease: "linear" }} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => d.setSpeed(d.speed === 1 ? 1.5 : d.speed === 1.5 ? 2 : 1)}
        title="Playback speed"
        className="flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium text-fg-2 transition-colors hover:text-fg"
      >
        <Gauge className="size-3.5" /> {d.speed}×
      </button>
    </div>
  );
}

/* ============================ the page ============================ */
export function LiveDemo() {
  const d = useDirector(LIVE_BEATS);
  const { beat } = d;

  // Dev-only: expose the director for local screenshot/verification harnesses,
  // mirroring the store's window.__wbx. Never present in a build.
  useEffect(() => {
    if (import.meta.env.DEV && typeof window !== "undefined") (window as unknown as { __live?: unknown }).__live = d;
  }, [d]);
  const adminActive = hasFocus(beat, "admin");
  const employeeActive = hasFocus(beat, "employee");
  const machineryActive = foci(beat).some((p) => p === "runtime" || p === "controlplane" || p === "gateway");

  // Keyboard: space toggles, ← / → seek chapters, R restarts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space") { e.preventDefault(); d.state === "idle" ? d.play() : d.toggle(); }
      else if (e.key === "ArrowRight") d.seekChapter(Math.min(5, d.chapter + 1));
      else if (e.key === "ArrowLeft") d.seekChapter(Math.max(1, d.chapter - 1));
      else if (e.key.toLowerCase() === "r") d.restart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [d]);

  return (
    <div style={STAGE} className="fixed inset-0 flex flex-col overflow-hidden">
      <style>{`@keyframes wbxcaret{50%{opacity:0}}`}</style>

      {/* top chrome */}
      <header className="flex items-center gap-3 px-6 pt-4 pb-1">
        <div className="flex items-center gap-2.5">
          <WrapboxLogo size={22} tone="dark" />
          <span className="font-brand text-[15px] font-bold tracking-tight text-white" style={{ fontFamily: "var(--font-brand)" }}>Wrapbox</span>
          <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/80">Live demo</span>
        </div>
        <Chip className="ml-1" tone="muted"><span className="size-1.5 animate-pulse rounded-full bg-accent" /> Simulated environment · live policy engine</Chip>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[11px] text-fg-3 sm:inline">Northwind Financial</span>
          <button onClick={() => switchWorkspace("v2")} className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[11.5px] font-medium text-fg-2 transition-colors hover:text-fg">
            <LogOut className="size-3.5" /> Exit demo
          </button>
        </div>
      </header>

      {/* the three screens */}
      <div className="grid min-h-0 flex-1 gap-3 px-6 py-3" style={{ gridTemplateColumns: "1fr 1.34fr 1fr" }}>
        <Screen active={adminActive} glow="#7c98ff" label={<><ShieldCheck className="size-3.5" /> Admin · console</>}>
          <AdminColumn d={d} />
        </Screen>
        <Screen active={machineryActive} glow="#9db4ff" label={<><Cpu className="size-3.5" /> The machinery</>} className="z-10">
          <MachineryColumn d={d} />
        </Screen>
        <Screen active={employeeActive} glow="#3fd49b" label={<><Laptop className="size-3.5" /> Employee · agent</>}>
          <EmployeeColumn d={d} />
        </Screen>
      </div>

      {/* narration */}
      <div className="px-6">
        <div className="mx-auto flex min-h-[30px] max-w-4xl items-center justify-center text-center">
          <AnimatePresence mode="wait">
            <motion.p key={beat?.id ?? "idle"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.4, ease: EASE }} className="text-[13.5px] leading-snug text-fg-2">
              {beat?.caption ?? "Press play to begin."}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>

      {/* transport */}
      <footer className="border-t border-line/60 bg-[#070b15]/80 px-6 py-3 backdrop-blur">
        <Transport d={d} />
      </footer>

      {/* idle overlay */}
      <AnimatePresence>
        {d.state === "idle" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="absolute inset-0 z-30 grid place-items-center" style={{ background: "radial-gradient(900px 500px at 50% 45%, #0a0f1dcc 0%, #05070ef2 70%)", backdropFilter: "blur(2px)" }}>
            <div className="flex max-w-xl flex-col items-center text-center">
              <div className="mb-6 flex items-center gap-3">
                <WrapboxLogo size={30} tone="dark" />
                <span className="font-brand text-2xl font-bold tracking-tight text-white" style={{ fontFamily: "var(--font-brand)" }}>Wrapbox</span>
              </div>
              <motion.button
                onClick={d.play}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className="grid size-20 place-items-center rounded-full text-[#0a0f1d]"
                style={{ background: "var(--accent)", boxShadow: "0 0 0 1px #ffffff22, 0 20px 60px -12px var(--accent)" }}
              >
                <motion.span animate={{ boxShadow: ["0 0 0 0 var(--accent)", "0 0 0 22px transparent"] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }} className="absolute inset-0 rounded-full" />
                <Play className="ml-1 size-9" />
              </motion.button>
              <h1 className="mt-7 text-[22px] font-semibold tracking-tight text-white">Watch one policy stop a real agent</h1>
              <p className="mt-2 text-[14px] text-fg-2">On the laptop and in the cloud. Every verdict is the real policy engine — the surroundings are simulated.</p>
              <div className="mt-5 flex items-center gap-1.5 text-[11.5px] text-fg-3"><Clapperboard className="size-3.5" /> 5 chapters · ~90 seconds · press space to play</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default LiveDemo;
