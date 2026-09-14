/**
 * Thin fetch wrappers around the Control Plane admin endpoints.
 * Every call carries X-Admin-Key from cp-config and an AbortSignal.timeout(4000).
 * Nothing throws — callers switch on { ok, status, data | error }.
 */

import { getCpConfig, type CpConfig } from "./cp-config";

export interface Ok<T> { ok: true; status: number; data: T }
export interface Err { ok: false; status: number; error: string }
export type Result<T> = Ok<T> | Err;

const TIMEOUT_MS = 4000;

function trimServer(server: string): string {
  return server.replace(/\/+$/, "");
}

function timeoutSignal(): AbortSignal {
  // AbortSignal.timeout may not exist on very old runtimes; guard.
  if (typeof AbortSignal !== "undefined" && typeof (AbortSignal as unknown as { timeout?: (n: number) => AbortSignal }).timeout === "function") {
    return (AbortSignal as unknown as { timeout: (n: number) => AbortSignal }).timeout(TIMEOUT_MS);
  }
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  return ctrl.signal;
}

async function get<T>(path: string, cfgOverride?: Partial<CpConfig>): Promise<Result<T>> {
  const cfg = { ...getCpConfig(), ...cfgOverride };
  if (!cfg.server || !cfg.adminKey) return { ok: false, status: 0, error: "unconfigured" };
  const url = `${trimServer(cfg.server)}${path}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "X-Admin-Key": cfg.adminKey, Accept: "application/json" },
      signal: timeoutSignal(),
    });
    let payload: unknown = null;
    const text = await res.text();
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = text; }
    }
    if (!res.ok) {
      const err = (payload && typeof payload === "object" && "error" in payload && typeof (payload as { error: unknown }).error === "string")
        ? (payload as { error: string }).error
        : `HTTP ${res.status}`;
      return { ok: false, status: res.status, error: err };
    }
    return { ok: true, status: res.status, data: payload as T };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, error: msg || "network error" };
  }
}

/* --------------- Endpoint shapes as CP actually returns them --------------- */

export interface CpOrg {
  id: string;
  name: string;
  domain: string | null;
  region: string;
  created_at?: string;
}
export interface CpDeviceRow {
  id: string;
  hostname: string;
  os: string;
  arch: string | null;
  owner_email: string | null;
  state: string;
  last_heartbeat: string | null;
  key_id: string | null;
  daemon_version: string | null;
  ruleset_pulled_at: string | null;
  chain_head_seq: number | null;
  created_at: string | null;
}
export interface CpRuleRow {
  id: string;
  org_id: string;
  project_id: string | null;
  name: string;
  description: string | null;
  effect: "allow" | "block" | "review";
  priority: number;
  condition_json: string | null;
  active?: number | boolean;
  created_at?: string | null;
}
export interface CpAgentRow {
  id: string;
  device_id: string;
  name?: string;
  kind?: string;
  detected_via?: string;
  where?: string;
  [k: string]: unknown;
}
export interface CpReceiptRow {
  id: string;
  device_id: string;
  seq: number;
  ts: string;
  verified: boolean;
  created_at: string | null;
  receipt: {
    v?: number;
    id: string;
    seq: number;
    ts: string;
    device_id: string;
    key_id?: string;
    agent?: string;
    session?: string;
    tool_name?: string;
    tool_input?: Record<string, unknown>;
    tool_input_sha256?: string;
    target?: string;
    effect: string;
    reason?: string;
    rule_id?: string | null;
    ruleset_pulled_at?: string | null;
    enforcement?: string;
    degraded?: boolean;
    prev?: string;
    sig?: string;
  };
}
export interface CpVerifyChain {
  device_id: string;
  total: number;
  verified_through_seq: number;
  chain_ok: boolean;
  breaks: Array<{ seq: number; kind: string; detail: string }>;
}

export const listOrgs = () => get<CpOrg[]>("/v1/orgs");
export const listDevices = (orgId: string) => get<CpDeviceRow[]>(`/v1/devices?org_id=${encodeURIComponent(orgId)}`);
export const listAgents = (orgId: string) => get<CpAgentRow[]>(`/v1/agents?org_id=${encodeURIComponent(orgId)}`);
export const listRules = (orgId: string) => get<CpRuleRow[]>(`/v1/rules?org_id=${encodeURIComponent(orgId)}`);
export const listReceipts = (orgId: string, opts: { limit?: number; deviceId?: string } = {}) => {
  const params = new URLSearchParams({ org_id: orgId, limit: String(opts.limit ?? 200) });
  if (opts.deviceId) params.set("device_id", opts.deviceId);
  return get<CpReceiptRow[]>(`/v1/receipts?${params.toString()}`);
};
export const verifyChain = (orgId: string, deviceId: string) =>
  get<CpVerifyChain>(`/v1/evidence/verify?org_id=${encodeURIComponent(orgId)}&device_id=${encodeURIComponent(deviceId)}`);

/** Ping /health with only the server URL (no admin key required). */
export async function ping(server: string): Promise<Result<{ status?: string }>> {
  if (!server) return { ok: false, status: 0, error: "unconfigured" };
  const url = `${trimServer(server)}/health`;
  try {
    const res = await fetch(url, { method: "GET", signal: timeoutSignal() });
    const text = await res.text();
    let payload: unknown = null;
    if (text) { try { payload = JSON.parse(text); } catch { payload = { status: text }; } }
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    return { ok: true, status: res.status, data: payload as { status?: string } };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : "network error" };
  }
}
