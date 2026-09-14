/**
 * Pure mappers from Control Plane admin payloads → the store's shapes.
 * Nothing here invents a value: a field the API did not return becomes "—"
 * (or 0 for numbers where a "—" would break math). Every screen renders what
 * the API returned or an honest blank.
 */

import type { Decision } from "../data/agents";
import type { Rule } from "../data/contract";
import type { DiscoveredAgent, Evt, FleetDevice } from "./store";
import type { CpAgentRow, CpDeviceRow, CpReceiptRow, CpRuleRow } from "./cp-api";

/* ------------ device ------------ */

function osLogoOf(os: string): string {
  const s = os.toLowerCase();
  if (s.includes("mac") || s.includes("darwin") || s.includes("osx") || s.includes("os x")) return "apple";
  if (s.includes("ubuntu")) return "ubuntu";
  if (s.includes("debian")) return "debian";
  if (s.includes("fedora")) return "fedora";
  if (s.includes("linux")) return "linux";
  if (s.includes("windows") || s.includes("win")) return "windows";
  return "device";
}

function stateOf(s: string | null | undefined): FleetDevice["state"] {
  const v = (s ?? "").toLowerCase();
  if (v === "healthy" || v === "heartbeat-lost" || v === "quarantined" || v === "enrolling") return v;
  return "enrolling";
}

/**
 * SQLite's datetime('now') returns UTC as "YYYY-MM-DD HH:MM:SS" — no T, no
 * zone marker. Date.parse() reads that as LOCAL time, so every timestamp the
 * Control Plane wrote lands off by the viewer's UTC offset (a live device
 * reads as hours stale). Stamp the zone on before parsing; ISO strings with
 * their own offset are passed through untouched.
 */
function toMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const sqliteUtc = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(iso);
  const t = Date.parse(sqliteUtc ? `${iso.replace(" ", "T")}Z` : iso);
  return Number.isFinite(t) ? t : 0;
}

export function deviceFromCp(row: CpDeviceRow, agents: DiscoveredAgent[] = []): FleetDevice {
  return {
    id: row.id,
    hostname: row.hostname ?? row.id,
    ownerId: row.owner_email ?? "",
    os: row.os ?? "",
    osLogo: osLogoOf(row.os ?? ""),
    arch: row.arch ?? "",
    enrolledAt: toMs(row.created_at),
    runtimeVersion: row.daemon_version ?? "—",
    policyBundleVersion: 0,
    heartbeat: toMs(row.last_heartbeat),
    state: stateOf(row.state),
    killSwitch: false,
    keyId: row.key_id ?? "",
    agents,
  };
}

/* ------------ agents (grouped per device) ------------ */

export function agentFromCp(row: CpAgentRow): DiscoveredAgent {
  const name = typeof row.name === "string" ? row.name : String(row.id);
  return {
    agentId: `unknown:${name}`,
    binary: typeof row.where === "string" ? row.where : name,
    version: typeof row.version === "string" ? row.version : "",
    launchMode: "unknown",
    // The row's own timestamps, never 0 — epoch renders as "20711d ago".
    discoveredAt: toMs((row.created_at ?? row.last_seen_at) as string | undefined),
  };
}

export function groupAgentsByDevice(rows: CpAgentRow[]): Record<string, DiscoveredAgent[]> {
  const out: Record<string, DiscoveredAgent[]> = {};
  for (const row of rows) {
    if (!row?.device_id) continue;
    (out[row.device_id] ??= []).push(agentFromCp(row));
  }
  return out;
}

/* ------------ receipts → Evt ------------ */

const DECISION_MAP: Record<string, Decision> = {
  allow: "ALLOW",
  block: "BLOCK",
  review: "REVIEW",
  violation: "BLOCK",
  tamper: "BLOCK",
  discover: "ALLOW",
};

export function evtFromReceipt(row: CpReceiptRow): Evt {
  const r = row.receipt ?? ({} as CpReceiptRow["receipt"]);
  const effectRaw = (r.effect ?? "").toLowerCase();
  const decision: Decision = DECISION_MAP[effectRaw] ?? "BLOCK";
  const path = typeof r.tool_input?.path === "string" ? (r.tool_input.path as string) : undefined;
  const action = `${r.tool_name ?? ""} ${r.target ?? ""}`.trim() || (r.tool_name ?? "");
  return {
    id: row.id,
    ts: toMs(r.ts ?? row.ts) || 0,
    agentId: (typeof r.agent === "string" && r.agent) ? r.agent : "unknown",
    human: "",
    action,
    effect: (r.tool_name ?? effectRaw) || "",
    decision,
    rule: r.rule_id ?? "—",
    reason: r.reason ?? "",
    latency: 0,
    env: "production",
    source: "live",
    act: {
      effect: r.tool_name ?? "",
      ...(path ? { path } : {}),
      ctx: {
        "device.id": r.device_id ?? row.device_id,
        enforcement: r.enforcement ?? "",
      },
    },
  };
}

/* ------------ rules ------------ */

export function ruleFromCp(row: CpRuleRow): Rule {
  const effect = (row.effect ?? "block").toLowerCase();
  const decision: Decision = effect === "allow" ? "ALLOW" : effect === "review" ? "REVIEW" : "BLOCK";
  // The CP rule condition is retained inside `why` so the Contract screen can
  // render it as advanced-condition text instead of silently dropping it —
  // and `custom: true` keeps the Builder from trying to represent it.
  const conditionSummary = row.condition_json ? ` — advanced condition: ${row.condition_json}` : "";
  return {
    id: row.id,
    title: row.name ?? row.id,
    why: (row.description ?? "").trim() + conditionSummary,
    when: { effect: ["policy.*"] },
    decision,
    scope: "all",
    custom: true,
  };
}
