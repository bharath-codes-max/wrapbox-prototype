import { Compass, LogOut, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Card, PageHeader, cn } from "../components/ui";
import { setNavStyle, useNavStyle, type NavStyle } from "../lib/navstyle";
import { signOut, useAccount } from "../lib/auth";
import { go } from "../lib/router";
import { setState, setTheme, useStore } from "../lib/store";

function Row({ title, sub, children, last }: { title: string; sub: string; children: ReactNode; last?: boolean }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-4 px-6 py-5", !last && "border-b border-line")}>
      <div className="min-w-[240px] flex-1">
        <div className="text-[14px] font-semibold">{title}</div>
        <p className="mt-0.5 text-[12.5px] text-fg-3 leading-relaxed max-w-[52ch]">{sub}</p>
      </div>
      {children}
    </div>
  );
}

/** A small picture of the top bar in each style. */
function BarPreview({ style, active, onClick }: { style: NavStyle; active: boolean; onClick: () => void }) {
  const black = style === "black";
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn("group w-[168px] rounded-xl border p-1.5 text-left transition-all", active ? "border-fg shadow-card" : "border-line hover:border-line-strong")}
    >
      <span className={cn("flex h-9 items-center gap-1.5 rounded-lg px-2.5", black ? "bg-[linear-gradient(180deg,#161618,#0d0d0f)]" : "bg-[#fafaf8] ring-1 ring-black/10")}>
        <span className={cn("size-3.5 rounded-[4px] border-[1.5px]", black ? "border-[#9db6ff]" : "border-[#1848ff]")} />
        <span className={cn("h-1.5 w-9 rounded-full", black ? "bg-white/85" : "bg-[#111c35]/85")} />
        <span className={cn("ml-auto h-4 w-10 rounded-md", black ? "bg-white/10" : "bg-black/[0.06]")} />
      </span>
      <span className="mt-1.5 flex items-center justify-between px-1 text-[12px] font-medium">
        {black ? "Matte black" : "Off-white"}
        <span className={cn("grid size-3.5 place-items-center rounded-full border", active ? "border-fg bg-fg" : "border-line-strong")}>{active && <span className="size-1.5 rounded-full bg-surface" />}</span>
      </span>
    </button>
  );
}

export function SettingsPage() {
  const theme = useStore((s) => s.theme);
  const nav = useNavStyle();
  const account = useAccount();
  return (
    <div className="mx-auto max-w-[880px] px-4 lg:px-8 py-7">
      <PageHeader eyebrow="Workspace" title="Settings" sub="How Wrapbox looks on this browser, and a guided walk-through whenever you want one." />

      <div className="eyebrow mb-2 px-1">Appearance</div>
      <Card className="overflow-hidden">
        <Row title="Theme" sub="Light is an off-white page; dark is easier on the eyes at night.">
          <div className="inline-flex rounded-xl border border-line bg-surface-2 p-1" role="radiogroup" aria-label="Theme">
            {(
              [
                { v: "light", label: "Light", icon: Sun },
                { v: "dark", label: "Dark", icon: Moon },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                role="radio"
                aria-checked={theme === o.v}
                onClick={() => setTheme(o.v)}
                className={cn("inline-flex items-center gap-2 rounded-lg h-9 px-4 text-[13px] font-medium transition-colors", theme === o.v ? "bg-surface text-fg shadow-card border border-line" : "text-fg-3 hover:text-fg-2")}
              >
                <o.icon className="size-4" /> {o.label}
              </button>
            ))}
          </div>
        </Row>
        <Row title="Top bar" sub="Matte black stands apart from the page; off-white blends into it." last>
          <div className="flex gap-2.5">
            <BarPreview style="black" active={nav === "black"} onClick={() => setNavStyle("black")} />
            <BarPreview style="light" active={nav === "light"} onClick={() => setNavStyle("light")} />
          </div>
        </Row>
      </Card>

      <div className="eyebrow mt-7 mb-2 px-1">Account</div>
      <Card className="overflow-hidden">
        <Row title={account?.name ?? account?.email ?? "Signed in"} sub={`Signed in as ${account?.email ?? "—"}${account?.company ? ` · ${account.company}` : ""}. Signing out returns you to the sign-in page.`} last>
          <Button
            onClick={() => {
              signOut();
              go("/login");
            }}
          >
            <LogOut className="size-4" /> Sign out
          </Button>
        </Row>
      </Card>

      <div className="eyebrow mt-7 mb-2 px-1">Help</div>
      <Card className="overflow-hidden">
        <Row title="Guided tour" sub="Walks you through each page step by step: agents, the intent contract, approvals and evidence." last>
          <Button variant="primary" onClick={() => setState({ tour: 0 })}>
            <Compass className="size-4" /> Start the tour
          </Button>
        </Row>
      </Card>
    </div>
  );
}
