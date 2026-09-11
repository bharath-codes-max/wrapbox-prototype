import { Download, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { AGENTS, agentById, type Decision } from "../data/agents";
import { personById } from "../data/people";
import { CodeBlock, json } from "../components/code";
import { Avatar, Button, Card, DecisionPill, Drawer, Logo, PageHeader, Segmented, cn } from "../components/ui";
import { clock } from "../lib/router";
import { EMPLOYEE, getState, toast, useStore, type Evt } from "../lib/store";

export function EvidenceDrawer({ e, onClose }: { e: Evt | null; onClose: () => void }) {
  return (
    <Drawer open={!!e} onClose={onClose} title={e ? <span className="flex items-center gap-2"><DecisionPill d={e.decision} size="sm" /> Decision {e.id}</span> : ""}>
      {e && <EvidenceBody e={e} />}
    </Drawer>
  );
}

function EvidenceBody({ e }: { e: Evt }) {
  const a = agentById(e.agentId);
  const p = personById(e.human);
  const approvers = (e.approvers ?? []).map((id) => personById(id)).filter(Boolean);
  const chain: { label: string; value: React.ReactNode; tone?: string }[] = [
    { label: "Human", value: p ? <span className="flex items-center gap-2"><Avatar p={p} size={20} />{p.name} <span className="text-fg-3">· {p.role}</span></span> : e.human },
    { label: "Agent", value: <span className="flex items-center gap-2"><Logo name={a.logo} bleed={a.bleed} size={20} rounded="rounded" />{a.name}</span> },
    { label: "Action", value: <span className="font-mono text-[12px]">{e.action}</span> },
    { label: "Effect", value: <span className="font-mono text-[12px]">{e.effect}</span> },
    { label: "Policy", value: <span className="font-mono text-[12px]">rule {e.rule} · {e.reason}</span> },
    ...(e.rewritten ? [{ label: "Rewritten", value: <span className="font-mono text-[12px] text-constrain">{e.rewritten}</span> }] : []),
    ...(e.decision === "REVIEW" || approvers.length
      ? [{ label: "Approver", value: approvers.length ? approvers.map((x) => x!.name).join(" + ") : <span className="text-review">waiting for a human</span> }]
      : []),
    { label: "Decision", value: <span className="flex items-center gap-2"><DecisionPill d={e.decision} size="sm" /><span className="font-mono text-[12px] text-fg-3">{e.latency} ms · {e.env}</span>{e.observed && <span className="text-[11.5px] text-review">observe mode: would {e.observed}</span>}</span> },
    { label: "Permit", value: e.permit ? <span className="font-mono text-[12px] text-accent">{e.permit} · verified · used once</span> : <span className="text-fg-3">{e.decision === "BLOCK" ? "none — denied before execution" : e.decision === "REVIEW" ? "pending approval" : "auto-minted, 60s"}</span> },
    { label: "Outcome", value: e.decision === "BLOCK" ? <span className="text-block font-medium">Effect never executed</span> : e.decision === "REVIEW" ? <span className="text-review font-medium">Paused</span> : e.decision === "CONSTRAIN" ? <span className="text-constrain font-medium">Safer variant executed once</span> : <span className="text-allow font-medium">Executed once</span> },
  ];
  return (
    <div className="p-5 space-y-5">
      <div>
        <div className="eyebrow mb-3">Evidence chain</div>
        <ol className="relative">
          {chain.map((c, i) => (
            <li key={c.label} className="relative grid grid-cols-[80px_1fr] gap-3 pb-3.5">
              {i < chain.length - 1 && <span className="absolute left-[83px] top-4 bottom-0 w-px bg-line" />}
              <span className="text-[12px] text-fg-3 pt-0.5">{c.label}</span>
              <span className="relative pl-4 text-[13px] min-w-0">
                <span className="absolute left-[-1px] top-[7px] size-[7px] rounded-full bg-accent" />
                {c.value}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <div className="eyebrow mb-2">Immutable record</div>
        <CodeBlock
          file={`evidence/${e.id}.json`}
          lang="json"
          code={json({
            decision_id: e.id,
            timestamp: new Date(e.ts).toISOString(),
            org: "wrapbox",
            human: e.human,
            subject_agent: e.agentId,
            action: e.action,
            effect: e.effect,
            rule: e.rule,
            decision: e.decision,
            reason: e.reason,
            latency_ms: e.latency,
            environment: e.env,
            observe_mode_would: e.observed ?? null,
            permit_id: e.permit ?? null,
            approved_by: e.approvers ?? [],
            rewritten_to: e.rewritten ?? null,
            contract_version: getState().version,
            prev_hash: "sha256:" + (parseInt(e.id.slice(2), 16) * 2654435761).toString(16).slice(0, 12) + "…",
          })}
        />
      </div>
    </div>
  );
}

export function Evidence() {
  const role = useStore((s) => s.role);
  const allRaw = useStore((s) => s.events);
  const envFilter = useStore((s) => s.envFilter);
  const all = useMemo(() => (envFilter === "all" ? allRaw : allRaw.filter((e) => e.env === envFilter)), [allRaw, envFilter]);
  const [d, setD] = useState<"all" | Decision>("all");
  const [agent, setAgent] = useState("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Evt | null>(null);
  const mine = role === "employee";
  const rows = useMemo(
    () =>
      all.filter(
        (e) =>
          (!mine || e.human === EMPLOYEE.id) &&
          (d === "all" || e.decision === d) &&
          (agent === "all" || e.agentId === agent) &&
          (!q || (e.action + e.rule + e.id).toLowerCase().includes(q.toLowerCase())),
      ),
    [all, d, agent, q, mine],
  );
  const agentsInLog = useMemo(() => Array.from(new Set(all.map((e) => e.agentId))), [all]);
  return (
    <div className="mx-auto max-w-[1240px] px-4 lg:px-8 py-7">
      <PageHeader
        eyebrow={mine ? "Your actions only" : "Audit & evidence"}
        title={mine ? "My activity" : "Evidence"}
        sub={
          mine
            ? "Everything your agents tried, what Wrapbox decided, and why. Only you and your admins can see this."
            : "Every decision with the chain that produced it: human → agent → tool → resource → policy → approver → permit → outcome."
        }
        right={
          !mine && (
            <>
              <Button size="sm" onClick={() => toast("Exported to Splunk", `${all.length} decisions · HEC endpoint splunk.wrapbox.ai (simulated)`)}>
                <Logo name="splunk" size={16} rounded="rounded" /> Export to Splunk
              </Button>
              <Button size="sm" onClick={() => toast("Streaming to Datadog", "Logs pipeline wrapbox-decisions (simulated)")}>
                <Logo name="datadog" size={16} rounded="rounded" /> Datadog
              </Button>
              <Button size="sm" onClick={() => toast("Evidence pack generated", "SOC 2 CC6/CC7 · 30 days · signed PDF (simulated)")}>
                <Download className="size-3.5" /> Evidence pack
              </Button>
            </>
          )
        }
      />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-line">
          <Segmented
            size="sm"
            value={d}
            onChange={setD}
            options={[
              { value: "all", label: "All" },
              { value: "ALLOW", label: "Allowed" },
              { value: "CONSTRAIN", label: "Rewritten" },
              { value: "REVIEW", label: "Review" },
              { value: "BLOCK", label: "Blocked" },
            ]}
          />
          <select value={agent} onChange={(e) => setAgent(e.target.value)} className="h-7 rounded-full border border-line bg-surface px-3 text-[12.5px] text-fg-2 outline-none">
            <option value="all">All agents</option>
            {AGENTS.filter((a) => agentsInLog.includes(a.id)).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <div className="ml-auto flex items-center gap-2 h-7 rounded-full border border-line bg-surface px-3 w-[240px] max-w-full">
            <Search className="size-3.5 text-fg-3" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search action, rule or id" className="flex-1 bg-transparent outline-none text-[12.5px] placeholder:text-fg-3" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr className="text-[11.5px] text-fg-3 border-b border-line">
                <th className="font-medium px-4 py-2 w-[80px]">Time</th>
                <th className="font-medium px-2 py-2 w-[90px]">Decision</th>
                <th className="font-medium px-2 py-2">Agent · action</th>
                <th className="font-medium px-2 py-2">{mine ? "Why" : "Rule"}</th>
                {!mine && <th className="font-medium px-2 py-2">Human</th>}
                <th className="font-medium px-4 py-2 text-right">Latency</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 80).map((e) => {
                const a = agentById(e.agentId);
                const p = personById(e.human);
                return (
                  <tr key={e.id} onClick={() => setOpen(e)} className="border-b border-line last:border-0 hover:bg-surface-2 cursor-pointer">
                    <td className="px-4 py-2.5 font-mono text-[11.5px] text-fg-3 tnum">{clock(e.ts)}</td>
                    <td className="px-2 py-2.5"><DecisionPill d={e.decision} size="sm" /></td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Logo name={a.logo} bleed={a.bleed} size={22} rounded="rounded-md" />
                        <div className="min-w-0">
                          <div className="text-[12.5px] font-medium truncate">{a.name}</div>
                          <div className="font-mono text-[11.5px] text-fg-2 truncate max-w-[420px]">{e.action}</div>
                        </div>
                      </div>
                    </td>
                    <td className={cn("px-2 py-2.5 text-[12px]", mine ? "text-fg-2" : "font-mono text-fg-3")}>{mine ? e.reason : e.rule}</td>
                    {!mine && <td className="px-2 py-2.5">{p && <span className="flex items-center gap-2 text-[12.5px]"><Avatar p={p} size={20} />{p.name}</span>}</td>}
                    <td className="px-4 py-2.5 text-right font-mono text-[11.5px] text-fg-3 tnum">{e.latency} ms</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && <div className="px-4 py-12 text-center text-[13px] text-fg-3">{allRaw.length ? "No decisions match these filters." : "No decisions yet — they appear here the moment an agent acts. Try the playground."}</div>}
        </div>
      </Card>
      <EvidenceDrawer e={open} onClose={() => setOpen(null)} />
    </div>
  );
}
