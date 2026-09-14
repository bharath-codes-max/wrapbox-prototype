/**
 * Control-plane HTTP wrappers. Every call carries AbortSignal.timeout(5000).
 * NOTE: the hook decision path (commands/check.ts) never imports this module —
 * decisions are made from cache only.
 */

import type { Config } from "./config.js";
import type { Receipt } from "./receipts.js";

const TIMEOUT_MS = 5000;

async function post(url: string, body: unknown, headers: Record<string, string> = {}): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${url} -> ${res.status}: ${json?.error ?? JSON.stringify(json)}`);
  }
  return json;
}

export interface EnrollBody {
  org_id: string;
  enroll_token: string;
  hostname: string;
  os: string;
  arch?: string;
  owner_email?: string;
  public_key: string;
}

export interface EnrollResponse {
  id: string;
  api_key: string;
  key_id: string;
  message: string;
}

export async function enroll(server: string, body: EnrollBody): Promise<EnrollResponse> {
  return post(`${server}/v1/devices/enroll`, body);
}

export async function heartbeat(
  cfg: Config,
  body: { daemon_version?: string; ruleset_pulled_at?: string; chain_head_seq?: number },
): Promise<{ status: string; device_id: string }> {
  return post(`${cfg.server}/v1/devices/heartbeat`, body, { authorization: `Bearer ${cfg.api_key}` });
}

export interface RulesPullResponse {
  rules: Array<{
    id: string;
    name: string;
    effect: "allow" | "block" | "review";
    priority: number;
    condition_json: string | null;
    project_id: string | null;
  }>;
  pulled_at: string;
}

export async function pullRules(cfg: Config): Promise<RulesPullResponse> {
  const res = await fetch(`${cfg.server}/v1/rules/pull`, {
    headers: { authorization: `Bearer ${cfg.api_key}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`/v1/rules/pull -> ${res.status}: ${json?.error ?? ""}`);
  return json as RulesPullResponse;
}

export async function pushEvidence(
  cfg: Config,
  receipts: Receipt[],
): Promise<{ accepted: number; duplicates: number; rejected: Array<{ id: string; reason: string }> }> {
  return post(`${cfg.server}/v1/evidence`, { receipts }, { authorization: `Bearer ${cfg.api_key}` });
}
