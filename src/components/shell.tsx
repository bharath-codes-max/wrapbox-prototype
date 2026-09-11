import { AnimatePresence, motion } from "motion/react";
import {
  Bot,
  Check,
  ChevronsUpDown,
  CircleCheck,
  CirclePlay,
  Compass,
  FileCheck2,
  FlaskConical,
  Hand,
  Info,
  KeyRound,
  LayoutGrid,
  ListTree,
  Lock,
  Menu,
  Moon,
  Network,
  OctagonX,
  Plus,
  RotateCcw,
  Rocket,
  Search,
  Sun,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AGENTS, CATEGORIES } from "../data/agents";
import { SCENARIOS } from "../data/scenarios";
import type { Env } from "../lib/engine";
import { go } from "../lib/router";
import { ADMIN, EMPLOYEE, TOUR, getState, resetFresh, setState, setTheme, switchWorkspace, useStore, workspaceHasData, type Role, type WorkspaceId } from "../lib/store";
import { PasskeyModal } from "./insight";
import { WrapboxLogo, WrapboxWordmark } from "./logo";
import { Avatar, Kbd, Logo, cn } from "./ui";

interface NavItem {
  path: string;
  label: string;
  icon: typeof Bot;
  badge?: number | string;
  adminOnly?: boolean;
  tone?: "review" | "accent";
}

function useNav(role: Role): { section?: string; items: NavItem[] }[] {
  const pending = useStore((s) => s.approvals.filter((a) => a.status === "pending").length);
  const myPending = useStore((s) => s.approvals.filter((a) => a.status === "pending" && a.approvers.some((p) => p.id === EMPLOYEE.id)).length);
  const connectedCount = useStore((s) => Object.keys(s.connected).length);
  const requests = useStore((s) => s.requests.filter((r) => r.status === "pending").length);
  const onboarded = useStore((s) => s.onboarded);
  const ruleCount = useStore((s) => s.published.length);
  if (role === "admin")
    return [
      {
        items: [
          { path: "/start", label: "Get started", icon: Rocket, badge: onboarded.admin ? undefined : "Setup", tone: "accent" },
          { path: "/", label: "Overview", icon: LayoutGrid },
        ],
      },
      {
        section: "Govern",
        items: [
          { path: "/agents", label: "Agents", icon: Bot, badge: connectedCount || undefined },
          { path: "/contract", label: "Intent contract", icon: FileCheck2, badge: ruleCount || undefined },
          { path: "/gateway", label: "MCP gateway", icon: Network },
        ],
      },
      {
        section: "Operate",
        items: [
          { path: "/playground", label: "Playground", icon: FlaskConical },
          { path: "/flows", label: "Happy flows", icon: CirclePlay },
          { path: "/approvals", label: "Approvals", icon: Hand, badge: pending || undefined, tone: "review" },
          { path: "/evidence", label: "Evidence", icon: ListTree },
        ],
      },
      { section: "Organization", items: [{ path: "/team", label: "Team & devices", icon: Users, badge: requests || undefined, tone: "review" }] },
    ];
  return [
    {
      items: [
        { path: "/onboarding/employee", label: "Get started", icon: Rocket, badge: onboarded.employee ? undefined : "Setup", tone: "accent" },
        { path: "/", label: "My workspace", icon: LayoutGrid },
      ],
    },
    {
      section: "My work",
      items: [
        { path: "/agents", label: "My agents", icon: Bot },
        { path: "/contract", label: "Rules for me", icon: FileCheck2 },
        { path: "/playground", label: "Playground", icon: FlaskConical },
        { path: "/flows", label: "Happy flows", icon: CirclePlay },
        { path: "/approvals", label: "My approvals", icon: Hand, badge: myPending || undefined, tone: "review" },
        { path: "/evidence", label: "My activity", icon: ListTree },
      ],
    },
    {
      section: "Admin only",
      items: [
        { path: "/gateway", label: "MCP gateway", icon: Network, adminOnly: true },
        { path: "/team", label: "Team & devices", icon: Users, adminOnly: true },
      ],
    },
  ];
}

function isActive(path: string, current: string) {
  if (path === "/") return current === "/";
  if (path === "/start") return current === "/start" || current.startsWith("/onboarding/admin");
  return current === path || current.startsWith(path + "/");
}

function NavLink({ it, current, onNavigate }: { it: NavItem; current: string; onNavigate?: () => void }) {
  const active = isActive(it.path, current);
  return (
    <a
      href={"#" + it.path}
      onClick={onNavigate}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-2.5 h-9 text-[13.5px] transition-colors",
        active ? "bg-surface text-fg font-medium shadow-card border border-line" : "text-fg-2 hover:text-fg hover:bg-surface-2 border border-transparent",
        it.adminOnly && "opacity-60",
      )}
    >
      {active && <span className="absolute -left-2.5 top-2 bottom-2 w-[3px] rounded-r-full bg-accent" />}
      <it.icon className={cn("size-4 shrink-0", active ? "text-fg" : "text-fg-3 group-hover:text-fg-2")} strokeWidth={1.8} />
      <span className="truncate">{it.label}</span>
      {it.adminOnly ? (
        <Lock className="ml-auto size-3.5 text-fg-3" />
      ) : it.badge !== undefined ? (
        <span className={cn("ml-auto rounded-full px-1.5 text-[11px] font-semibold tnum", it.tone === "review" ? "bg-review-soft text-review" : it.tone === "accent" ? "bg-ink text-ink-fg" : "bg-surface-3 text-fg-2")}>{it.badge}</span>
      ) : null}
    </a>
  );
}

function Sidebar({ current, onNavigate }: { current: string; onNavigate?: () => void }) {
  const role = useStore((s) => s.role);
  const workspace = useStore((s) => s.workspace);
  const company = useStore((s) => s.company);
  const nav = useNav(role);
  const me = role === "admin" ? ADMIN : EMPLOYEE;
  return (
    <div className="flex h-full flex-col">
      <nav className="flex-1 overflow-y-auto scroll-thin px-2.5 pt-3 pb-3">
        {nav.map((g, gi) => (
          <div key={gi} className="mb-2">
            {g.section && <div className="eyebrow px-2.5 pt-3 pb-1.5 !text-[10.5px]">{g.section}</div>}
            {g.items.map((it) => (
              <NavLink key={it.path} it={it} current={current} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>
      <div className="px-2.5 pb-2">
        <NavLink it={{ path: "/welcome", label: "About Wrapbox", icon: Info }} current={current} onNavigate={onNavigate} />
      </div>
      <div className="mx-2.5 mb-3 flex items-center gap-2.5 rounded-xl border border-line bg-surface p-2.5">
        <Avatar p={me} size={32} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold truncate">{me.name}</div>
          <div className="text-[11.5px] text-fg-3 truncate">
            {role === "admin" ? "Owner" : "Engineer · on-call"} · {company}
            {workspace === "fresh" ? " (fresh)" : ""}
          </div>
        </div>
      </div>
    </div>
  );
}

const TITLES: [string, string][] = [
  ["/welcome", "About Wrapbox"],
  ["/start", "Get started"],
  ["/onboarding/admin", "Admin setup"],
  ["/onboarding/employee", "Employee setup"],
  ["/agents", "Agents"],
  ["/contract", "Intent contract"],
  ["/gateway", "MCP gateway"],
  ["/playground", "Playground"],
  ["/flows", "Happy flows"],
  ["/approvals", "Approvals"],
  ["/evidence", "Evidence"],
  ["/team", "Team & devices"],
  ["/", "Overview"],
];

const ENVS: { id: "all" | Env; label: string; dot: string; note: string }[] = [
  { id: "all", label: "All environments", dot: "bg-white/40", note: "every decision" },
  { id: "production", label: "Production", dot: "bg-[#3fd49b]", note: "customer-facing systems" },
  { id: "staging", label: "Staging", dot: "bg-[#f4b453]", note: "cloud runners, previews" },
  { id: "development", label: "Development", dot: "bg-[#9db4ff]", note: "laptops and sandboxes" },
];

function WorkspaceMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const workspace = useStore((s) => s.workspace);
  const company = useStore((s) => s.company);
  const envFilter = useStore((s) => s.envFilter);
  const events = useStore((s) => s.events);
  const connectedCount = useStore((s) => Object.keys(s.connected).length);
  const counts = useMemo(() => {
    const m: Record<string, number> = { all: events.length, production: 0, staging: 0, development: 0 };
    for (const e of events) m[e.env] = (m[e.env] ?? 0) + 1;
    return m;
  }, [events]);
  useEffect(() => {
    const k = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", k);
    return () => window.removeEventListener("mousedown", k);
  }, []);
  const env = ENVS.find((e) => e.id === envFilter)!;
  const pickWs = (id: WorkspaceId) => {
    switchWorkspace(id);
    setOpen(false);
    go(id === "fresh" && !workspaceHasData("fresh") ? "/start" : "/");
  };
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className={cn("flex items-center gap-2.5 rounded-xl h-10 pl-1.5 pr-2.5 transition-colors ring-1", open ? "bg-white/[0.12] ring-white/20" : "bg-white/[0.06] ring-white/10 hover:bg-white/[0.1]")}>
        <span className={cn("grid size-7 place-items-center rounded-lg", workspace === "fresh" ? "border border-dashed border-white/40" : "bg-[#0a1226] ring-1 ring-white/10")}>
          {workspace === "fresh" ? <Plus className="size-3.5 text-white/80" /> : <WrapboxLogo size={18} />}
        </span>
        <span className="text-left leading-tight">
          <span className="block text-[12.5px] font-semibold text-white">
            {company} <span className="font-normal text-white/50">· {workspace === "fresh" ? "fresh" : "demo"}</span>
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-white/60">
            <span className={cn("size-1.5 rounded-full", env.dot)} />
            {env.label}
          </span>
        </span>
        <ChevronsUpDown className="size-3.5 text-white/50" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} className="absolute left-0 top-12 z-50 w-[360px] rounded-2xl border border-line bg-surface text-fg shadow-float overflow-hidden">
            <div className="px-4 pt-3.5 pb-2 eyebrow">Workspace</div>
            <div className="px-2 space-y-1">
              {(
                [
                  { id: "demo", title: `${company === "Wrapbox" || workspace === "fresh" ? "Wrapbox" : company} — demo`, desc: "30 days of live traffic · 12 agents connected · 4 approvals waiting" },
                  { id: "fresh", title: "Fresh workspace", desc: workspaceHasData("fresh") ? `Your own build · ${workspace === "fresh" ? connectedCount : "…"} agents · resumes where you left off` : "Completely empty. Start from zero and watch every page fill in." },
                ] as const
              ).map((w) => (
                <button key={w.id} onClick={() => pickWs(w.id)} className={cn("flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors", workspace === w.id ? "bg-surface-2" : "hover:bg-surface-2")}>
                  <span className={cn("mt-0.5 grid size-8 place-items-center rounded-lg shrink-0", w.id === "demo" ? "bg-nav" : "border border-dashed border-line-strong")}>{w.id === "demo" ? <WrapboxLogo size={20} /> : <Plus className="size-4 text-fg-2" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">{w.title}</span>
                    <span className="block text-[11.5px] text-fg-3 leading-snug">{w.desc}</span>
                  </span>
                  {workspace === w.id && <Check className="size-4 text-fg mt-1" />}
                </button>
              ))}
            </div>
            {workspaceHasData("fresh") && (
              <button
                onClick={() => {
                  resetFresh();
                  setOpen(false);
                  if (getState().workspace === "fresh") go("/start");
                }}
                className="mx-4 mt-1 inline-flex items-center gap-1.5 text-[11.5px] text-fg-3 hover:text-block"
              >
                <RotateCcw className="size-3" /> Reset the fresh workspace
              </button>
            )}
            <div className="mt-2 border-t border-line px-4 pt-3 pb-2 eyebrow">Environment</div>
            <div className="px-2 pb-2 grid grid-cols-2 gap-1">
              {ENVS.map((e) => (
                <button key={e.id} onClick={() => setState({ envFilter: e.id })} className={cn("rounded-xl px-2.5 py-2 text-left transition-colors border", envFilter === e.id ? "border-fg bg-surface" : "border-transparent hover:bg-surface-2")}>
                  <span className="flex items-center gap-1.5 text-[12.5px] font-medium">
                    <span className={cn("size-2 rounded-full", e.dot.replace("bg-white/40", "bg-fg-3"))} />
                    {e.label}
                  </span>
                  <span className="block text-[11px] text-fg-3">
                    {counts[e.id] ?? 0} decisions · {e.note}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 border-t border-line bg-surface-2 px-4 py-2.5 text-[11px] text-fg-3">
              <KeyRound className="size-3" /> Signing key wbx-2026-09 · ECDSA P-256 · region us-east-1
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RoleSwitch() {
  const role = useStore((s) => s.role);
  const opts: { v: Role; label: string; p: typeof ADMIN }[] = [
    { v: "admin", label: "Admin", p: ADMIN },
    { v: "employee", label: "Employee", p: EMPLOYEE },
  ];
  return (
    <div className="flex rounded-full bg-white/[0.07] p-0.5 ring-1 ring-white/10" role="tablist" aria-label="View as">
      {opts.map((o) => (
        <button key={o.v} role="tab" aria-selected={role === o.v} onClick={() => setState({ role: o.v })} className={cn("relative flex items-center gap-1.5 rounded-full h-8 pl-1 pr-3 text-[12.5px] font-medium transition-colors", role === o.v ? "text-[#0f1b35]" : "text-white/70 hover:text-white")}>
          {role === o.v && <motion.span layoutId="role-pill" className="absolute inset-0 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.25)]" transition={{ type: "spring", duration: 0.35, bounce: 0.15 }} />}
          <span className="relative">
            <Avatar p={o.p} size={22} className="!ring-0" />
          </span>
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const theme = useStore((s) => s.theme);
  const kill = useStore((s) => s.killSwitch);
  const live = useStore((s) => s.live);
  const events = useStore((s) => s.events.length);
  const ruleCount = useStore((s) => s.published.length);
  return (
    <header
      className="relative sticky top-0 z-40 flex items-center gap-3 h-[68px] px-4 lg:px-5 text-white border-b border-[var(--nav-line)]"
      style={{
        background: "radial-gradient(520px 140px at 150px -30px, rgba(79,123,255,0.30), transparent 70%), radial-gradient(420px 120px at 85% -40px, rgba(157,182,255,0.12), transparent 70%), linear-gradient(180deg, #13214a 0%, #0f1b35 55%, #0c1630 100%)",
      }}
    >
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgba(157,182,255,0.45),transparent)]" />
      <button onClick={onMenu} className="lg:hidden grid size-9 place-items-center rounded-lg hover:bg-white/10" aria-label="Open menu">
        <Menu className="size-4.5" />
      </button>
      <a href="#/" aria-label="Wrapbox home" className="shrink-0">
        <WrapboxWordmark />
      </a>
      <span className="hidden md:block h-7 w-px bg-white/12 mx-1" />
      <div className="hidden md:block">
        <WorkspaceMenu />
      </div>
      <button
        onClick={() => setState({ palette: true })}
        className="ml-2 hidden lg:flex items-center gap-2.5 h-10 w-[min(420px,32vw)] rounded-xl bg-white/[0.07] ring-1 ring-white/12 px-3.5 text-[13px] text-white/60 hover:bg-white/[0.1] hover:text-white/80 transition-colors shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
      >
        <Search className="size-4" />
        Search agents, rules, flows, people…
        <span className="ml-auto flex items-center gap-1">
          <kbd className="grid h-5 min-w-5 place-items-center rounded-md bg-white/10 px-1 font-mono text-[10.5px] text-white/70">⌘</kbd>
          <kbd className="grid h-5 min-w-5 place-items-center rounded-md bg-white/10 px-1 font-mono text-[10.5px] text-white/70">K</kbd>
        </span>
      </button>
      <div className="ml-auto flex items-center gap-2">
        {kill ? (
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-[#ff6e8a]/15 text-[#ff8fa3] ring-1 ring-[#ff6e8a]/30 px-3 h-8 text-[12px] font-semibold">
            <OctagonX className="size-3.5" /> Kill switch on
          </span>
        ) : ruleCount ? (
          <span className="hidden xl:inline-flex items-center gap-2 rounded-full bg-[#3fd49b]/10 ring-1 ring-[#3fd49b]/25 px-3 h-8 text-[12px] text-[#b6f0d6]">
            <span className={cn("size-1.5 rounded-full bg-[#3fd49b]", live && "live-dot")} />
            Enforcing {ruleCount} rules · 3 ms
          </span>
        ) : (
          <span className="hidden xl:inline-flex items-center gap-2 rounded-full ring-1 ring-white/12 px-3 h-8 text-[12px] text-white/65">
            <span className="size-1.5 rounded-full bg-white/35" />
            {events ? "No rules — allowing everything" : "Waiting for your first agent"}
          </span>
        )}
        <button onClick={() => setState({ tour: 0 })} className="hidden md:inline-flex items-center gap-1.5 rounded-full h-8 px-3 text-[12.5px] text-white/80 ring-1 ring-white/10 hover:text-white hover:bg-white/[0.08]">
          <Compass className="size-3.5" /> Guided tour
        </button>
        <RoleSwitch />
        <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="grid size-9 place-items-center rounded-full ring-1 ring-white/10 text-white/75 hover:text-white hover:bg-white/[0.08]" aria-label="Toggle theme">
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </div>
    </header>
  );
}

function Palette() {
  const open = useStore((s) => s.palette);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const rules = useStore((s) => s.rules);
  const members = useStore((s) => s.members);
  const items = useMemo(() => {
    const pages = TITLES.map(([p, t]) => ({ label: t, hint: "Page", path: p, logo: undefined as string | undefined }));
    const agents = AGENTS.map((a) => ({ label: a.name, hint: CATEGORIES.find((c) => c.id === a.category)!.name, path: "/agents/" + a.id, logo: a.logo }));
    const flows = Object.values(SCENARIOS).map((s) => ({ label: s.title, hint: "Happy flow", path: "/flows/" + s.id, logo: undefined }));
    const rs = rules.map((r) => ({ label: `${r.id} — ${r.title}`, hint: "Rule", path: "/contract", logo: undefined }));
    const ps = members.map((m) => ({ label: m.id, hint: "Person", path: "/team", logo: undefined }));
    const all = [...pages, ...agents, ...flows, ...rs, ...ps];
    const f = q.trim().toLowerCase();
    return (f ? all.filter((x) => (x.label + " " + x.hint).toLowerCase().includes(f)) : all).slice(0, 12);
  }, [q, rules, members]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setState({ palette: !getState().palette });
      }
      if (e.key === "Escape") setState({ palette: false });
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  useEffect(() => setSel(0), [q]);
  const choose = (p: string) => {
    go(p);
    setState({ palette: false });
    setQ("");
  };
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setState({ palette: false })} className="absolute inset-0 bg-[#070b16]/35 backdrop-blur-[2px]" />
          <motion.div initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} className="relative w-full max-w-[600px] rounded-2xl border border-line bg-surface shadow-float overflow-hidden">
            <div className="flex items-center gap-2 px-4 h-13 border-b border-line">
              <Search className="size-4 text-fg-3" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, items.length - 1));
                  if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0));
                  if (e.key === "Enter" && items[sel]) choose(items[sel].path);
                }}
                placeholder="Jump to an agent, rule, flow, person or page…"
                className="flex-1 bg-transparent outline-none text-[14.5px] placeholder:text-fg-3"
              />
              <Kbd>esc</Kbd>
            </div>
            <div className="max-h-[380px] overflow-y-auto scroll-thin p-1.5">
              {items.map((it, i) => (
                <button key={it.path + it.label} onMouseEnter={() => setSel(i)} onClick={() => choose(it.path)} className={cn("flex w-full items-center gap-3 rounded-lg px-3 h-10 text-left text-[13.5px]", i === sel ? "bg-surface-2" : "")}>
                  {it.logo ? (
                    <Logo name={it.logo} size={22} rounded="rounded-md" />
                  ) : (
                    <span className="grid size-[22px] place-items-center rounded-md bg-surface-3 text-fg-3">
                      <CircleCheck className="size-3.5" />
                    </span>
                  )}
                  <span className="flex-1 truncate">{it.label}</span>
                  <span className="text-[12px] text-fg-3">{it.hint}</span>
                </button>
              ))}
              {!items.length && <div className="px-3 py-6 text-center text-fg-3 text-[13px]">No matches for “{q}”.</div>}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] flex flex-col items-center gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} initial={{ y: 16, opacity: 0, scale: 0.97 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 8, opacity: 0 }} className="pointer-events-auto flex items-start gap-2.5 rounded-xl bg-[#0f1b35] text-white px-4 py-2.5 shadow-float max-w-[460px] ring-1 ring-white/10">
            <span className={cn("mt-1.5 size-2 rounded-full shrink-0", t.tone === "allow" ? "bg-[#3fd49b]" : t.tone === "block" ? "bg-[#ff6e8a]" : t.tone === "review" ? "bg-[#f4b453]" : "bg-[#9db4ff]")} />
            <div>
              <div className="text-[13px] font-semibold">{t.title}</div>
              {t.body && <div className="text-[12px] opacity-70 mt-0.5">{t.body}</div>}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function TourCard() {
  const step = useStore((s) => s.tour);
  if (step === null) return null;
  const t = TOUR[step];
  const goStep = (i: number) => {
    const n = TOUR[i];
    setState({ tour: i, role: n.role ?? "admin" });
    go(n.path);
  };
  return (
    <motion.div key={step} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="fixed bottom-4 right-4 z-[55] w-[min(360px,calc(100vw-32px))] rounded-2xl bg-[#0f1b35] text-white p-4 shadow-float ring-1 ring-white/10">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono opacity-60">
          Guided tour · {step + 1}/{TOUR.length}
        </span>
        <button onClick={() => setState({ tour: null })} className="opacity-60 hover:opacity-100" aria-label="End tour">
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-2 text-[15px] font-semibold leading-snug">{t.title}</div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed opacity-75">{t.body}</p>
      <div className="mt-3 h-1 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full brand-grad transition-all" style={{ width: `${((step + 1) / TOUR.length) * 100}%` }} />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button disabled={step === 0} onClick={() => goStep(step - 1)} className="text-[12.5px] opacity-70 hover:opacity-100 disabled:opacity-25">
          Back
        </button>
        {step < TOUR.length - 1 ? (
          <button onClick={() => goStep(step + 1)} className="rounded-full bg-white text-[#0f1b35] px-3.5 h-8 text-[12.5px] font-semibold">
            Next
          </button>
        ) : (
          <button onClick={() => setState({ tour: null })} className="rounded-full bg-white text-[#0f1b35] px-3.5 h-8 text-[12.5px] font-semibold">
            Finish tour
          </button>
        )}
      </div>
    </motion.div>
  );
}

export function Shell({ current, children, focus }: { current: string; children: ReactNode; focus?: boolean }) {
  const [menu, setMenu] = useState(false);
  const workspace = useStore((s) => s.workspace);
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg text-fg">
      <Topbar onMenu={() => setMenu(true)} />
      {workspace === "fresh" && (
        <div className="flex items-center justify-center gap-2 h-8 bg-[#fff7e6] dark:bg-[#2c2010] text-[12px] text-[#8a5a00] dark:text-[#f4b453] border-b border-[#f2dfb3] dark:border-[#3b2c14]">
          <span className="size-1.5 rounded-full bg-current" />
          Fresh workspace — every number, decision and person here comes from what you do.
          <button onClick={() => switchWorkspace("demo")} className="ml-1 underline underline-offset-2 font-medium">
            Back to demo
          </button>
        </div>
      )}
      <div className="flex flex-1 min-h-0">
        {!focus && (
          <aside className="relative z-10 hidden lg:block w-[244px] shrink-0 border-r border-line bg-bg shadow-[6px_0_24px_-14px_rgba(17,28,53,0.22)]">
            <Sidebar current={current} />
          </aside>
        )}
        <AnimatePresence>
          {menu && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMenu(false)} className="lg:hidden fixed inset-0 z-40 bg-black/30" />
              <motion.aside initial={{ x: -260 }} animate={{ x: 0 }} exit={{ x: -260 }} transition={{ type: "spring", duration: 0.35, bounce: 0 }} className="lg:hidden fixed left-0 top-[68px] bottom-0 z-50 w-[260px] bg-bg border-r border-line shadow-float">
                <Sidebar current={current} onNavigate={() => setMenu(false)} />
              </motion.aside>
            </>
          )}
        </AnimatePresence>
        <main id="main-scroll" className="flex-1 min-w-0 overflow-y-auto scroll-thin">
          {children}
        </main>
      </div>
      <Palette />
      <Toasts />
      <TourCard />
      <PasskeyModal />
    </div>
  );
}
