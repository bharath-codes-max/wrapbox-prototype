/**
 * wrapboxd configuration.
 * Reads from ~/.wrapbox/config.json or environment variables.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface Config {
  /** Control Plane URL */
  server: string;
  /** Device API key (from enrollment) */
  apiKey: string;
  /** How often to pull rules (seconds) */
  pullInterval: number;
  /** How often to heartbeat (seconds) */
  heartbeatInterval: number;
  /** Local cache directory */
  cacheDir: string;
}

const CONFIG_DIR = path.join(os.homedir(), ".wrapbox");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const DEFAULTS: Partial<Config> = {
  server: "http://localhost:4100",
  pullInterval: 60,
  heartbeatInterval: 60,
  cacheDir: path.join(CONFIG_DIR, "cache"),
};

export function loadConfig(): Config {
  let fileConfig: Partial<Config> = {};

  if (fs.existsSync(CONFIG_FILE)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    } catch {
      console.error(`⚠ Could not parse ${CONFIG_FILE}, using defaults`);
    }
  }

  const config: Config = {
    server: process.env.WRAPBOX_SERVER || fileConfig.server || DEFAULTS.server!,
    apiKey: process.env.WRAPBOX_API_KEY || fileConfig.apiKey || "",
    pullInterval: Number(process.env.WRAPBOX_PULL_INTERVAL) || fileConfig.pullInterval || DEFAULTS.pullInterval!,
    heartbeatInterval: Number(process.env.WRAPBOX_HEARTBEAT_INTERVAL) || fileConfig.heartbeatInterval || DEFAULTS.heartbeatInterval!,
    cacheDir: fileConfig.cacheDir || DEFAULTS.cacheDir!,
  };

  if (!config.apiKey) {
    console.error("✖ No API key. Run: wrapboxd enroll --server <url> --org <org_id>");
    process.exit(1);
  }

  // Ensure cache dir exists
  fs.mkdirSync(config.cacheDir, { recursive: true });

  return config;
}

export function saveConfig(partial: Partial<Config>) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });

  let existing: Partial<Config> = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try { existing = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")); } catch {}
  }

  const merged = { ...existing, ...partial };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
  console.log(`✔ Config saved to ${CONFIG_FILE}`);
}
