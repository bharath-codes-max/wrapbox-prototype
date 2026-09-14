/**
 * Database schema for the Wrapbox Control Plane.
 * SQLite via better-sqlite3 — lightweight, zero-config, single file.
 * Migrates to Postgres when we deploy to Railway.
 */

export const MIGRATIONS = [
  // 001: Core tables
  `CREATE TABLE IF NOT EXISTS orgs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    domain TEXT,
    region TEXT DEFAULT 'us',
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES orgs(id),
    name TEXT NOT NULL,
    repo_url TEXT,
    path_pattern TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES orgs(id),
    project_id TEXT REFERENCES projects(id),
    name TEXT NOT NULL,
    description TEXT,
    effect TEXT NOT NULL CHECK (effect IN ('allow', 'block', 'review')),
    priority INTEGER DEFAULT 0,
    condition_json TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES orgs(id),
    hostname TEXT NOT NULL,
    os TEXT NOT NULL,
    arch TEXT,
    owner_email TEXT,
    api_key_hash TEXT NOT NULL,
    state TEXT DEFAULT 'enrolling' CHECK (state IN ('enrolling', 'healthy', 'heartbeat-lost', 'quarantined')),
    last_heartbeat TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL REFERENCES devices(id),
    org_id TEXT NOT NULL REFERENCES orgs(id),
    name TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    version TEXT,
    adapter_state TEXT DEFAULT 'provisioned' CHECK (adapter_state IN ('provisioned', 'tampered', 're-provisioned')),
    discovered_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS decisions (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES orgs(id),
    device_id TEXT NOT NULL REFERENCES devices(id),
    agent_id TEXT REFERENCES agents(id),
    project_id TEXT REFERENCES projects(id),
    rule_id TEXT REFERENCES rules(id),
    tool_name TEXT NOT NULL,
    tool_input TEXT,
    effect TEXT NOT NULL CHECK (effect IN ('allow', 'block', 'review')),
    reason TEXT,
    receipt_sig TEXT,
    prev_receipt_hash TEXT,
    latency_ms INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  // Indexes for common queries
  `CREATE INDEX IF NOT EXISTS idx_decisions_org ON decisions(org_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_decisions_device ON decisions(device_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_devices_org ON devices(org_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rules_org ON rules(org_id, active)`,
  `CREATE INDEX IF NOT EXISTS idx_agents_device ON agents(device_id)`,
];
