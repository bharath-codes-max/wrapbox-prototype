/**
 * `wrapboxd daemon` — foreground loop (Ctrl-C to stop):
 *   heartbeat every heartbeatInterval, rule pull every pullInterval,
 *   evidence drain every 10s, hooks tamper-watch every 5s.
 * All failures log and continue — the loop never crashes.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, PATHS } from "../config.js";
import { heartbeat, pullRules } from "../api.js";
import { loadState, makeReceipt, appendToSpool, drainSpool, spoolDepth } from "../receipts.js";
import { sha256hex } from "../canonical.js";
import { installHooks } from "./protect.js";
import { startProxy, type ProxyHandle } from "../proxy.js";
import { detectAgents } from "../discover.js";
import { checkShimTamper, installShims } from "../shims.js";

function daemonVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(fs.readFileSync(path.resolve(here, "..", "..", "package.json"), "utf-8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function cachedPulledAt(): string | undefined {
  try {
    const body = JSON.parse(fs.readFileSync(PATHS.rulesCache, "utf-8"));
    return typeof body.pulled_at === "string" ? body.pulled_at : undefined;
  } catch {
    return undefined;
  }
}

export async function cmdDaemon(): Promise<number> {
  const cfg = loadConfig();
  if (!cfg) {
    console.error("✖ Not enrolled. Run: wrapboxd enroll --server URL --org ORG --token WBXE...");
    return 1;
  }
  const version = daemonVersion();
  console.log(`wrapboxd ${version} — daemon started (server ${cfg.server}). Ctrl-C to stop.`);

  const timers: NodeJS.Timeout[] = [];
  let lastRulesHash = "";
  try {
    lastRulesHash = sha256hex(fs.readFileSync(PATHS.rulesCache, "utf-8"));
  } catch { /* no cache yet */ }

  const doHeartbeat = async () => {
    try {
      const state = loadState();
      await heartbeat(cfg, {
        daemon_version: version,
        ruleset_pulled_at: cachedPulledAt(),
        chain_head_seq: state.seq,
      });
    } catch (err) {
      console.error(`heartbeat failed: ${(err as Error).message}`);
    }
  };

  const doPull = async () => {
    try {
      const body = await pullRules(cfg);
      const text = JSON.stringify(body, null, 2) + "\n";
      const hash = sha256hex(text);
      fs.mkdirSync(PATHS.cacheDir, { recursive: true });
      fs.writeFileSync(PATHS.rulesCache, text);
      if (hash !== lastRulesHash) {
        console.log(`rules updated: ${body.rules.length} rule(s) @ ${body.pulled_at}`);
        lastRulesHash = hash;
      }
    } catch (err) {
      console.error(`rule pull failed: ${(err as Error).message}`);
    }
  };

  const doDrain = async () => {
    try {
      if (spoolDepth().unsent > 0) {
        const res = await drainSpool(cfg);
        console.log(`evidence drained: ${res.accepted} accepted, ${res.duplicates} duplicate(s), ${res.rejected.length} rejected`);
      }
    } catch (err) {
      console.error(`evidence drain failed: ${(err as Error).message}`);
    }
  };

  const doTamperCheck = () => {
    try {
      const state = loadState();
      if (!state.hooks_hash || !state.hooks_path) return; // hooks were never installed
      let current = "";
      try {
        current = sha256hex(fs.readFileSync(state.hooks_path, "utf-8"));
      } catch { /* file deleted counts as drift */ }
      if (current === state.hooks_hash) return;
      installHooks(); // rewrite our entries; also re-records the new hash
      const receipt = makeReceipt(cfg, {
        agent: "claude-code",
        session: "",
        tool_name: "",
        tool_input: { file: state.hooks_path },
        target: state.hooks_path,
        effect: "tamper",
        reason: "claude-code hooks modified — restored",
        rule_id: null,
        ruleset_pulled_at: cachedPulledAt() ?? null,
        enforcement: "hook",
        degraded: false,
      });
      appendToSpool(receipt);
      console.log("tamper: claude-code hooks modified — restored (receipt written)");
    } catch (err) {
      console.error(`tamper check failed: ${(err as Error).message}`);
    }
  };

  // Universal network gate — supervise with a small exponential backoff so a
  // one-off crash doesn't leave the fabric ungoverned.
  let proxy: ProxyHandle | null = null;
  let proxyBackoffMs = 500;
  const superviseProxy = async () => {
    try {
      proxy = await startProxy();
      proxyBackoffMs = 500;
      console.log(`proxy: listening on 127.0.0.1:${proxy.port}`);
      proxy.server.on("close", () => {
        proxy = null;
        setTimeout(() => { void superviseProxy(); }, proxyBackoffMs);
        proxyBackoffMs = Math.min(proxyBackoffMs * 2, 30_000);
      });
    } catch (err) {
      console.error(`proxy failed to start: ${(err as Error).message}`);
      setTimeout(() => { void superviseProxy(); }, proxyBackoffMs);
      proxyBackoffMs = Math.min(proxyBackoffMs * 2, 30_000);
    }
  };
  await superviseProxy();

  const doInventory = async () => {
    try {
      const sightings = await detectAgents();
      console.log(`inventory: ${sightings.length} agent sighting(s) detected`);
    } catch (err) {
      console.error(`inventory scan failed: ${(err as Error).message}`);
    }
  };

  const doShimTamper = () => {
    try {
      const report = checkShimTamper();
      if (report.drifted.length === 0 && report.missing.length === 0) return;
      console.log(`shim tamper: ${report.drifted.length} drifted, ${report.missing.length} missing — regenerating`);
      void installShims();
    } catch (err) {
      console.error(`shim tamper check failed: ${(err as Error).message}`);
    }
  };

  // Kick everything once at start, then on their intervals.
  await doHeartbeat();
  await doPull();
  await doDrain();
  doTamperCheck();
  await doInventory();
  doShimTamper();

  timers.push(setInterval(doHeartbeat, cfg.heartbeatInterval * 1000));
  timers.push(setInterval(doPull, cfg.pullInterval * 1000));
  timers.push(setInterval(doDrain, 10_000));
  timers.push(setInterval(doTamperCheck, 5_000));
  timers.push(setInterval(doInventory, 15 * 60_000));
  timers.push(setInterval(doShimTamper, 5 * 60_000));

  return new Promise<number>((resolve) => {
    const stop = () => {
      timers.forEach(clearInterval);
      if (proxy) proxy.server.removeAllListeners("close");
      void proxy?.stop();
      console.log("\nwrapboxd daemon stopped.");
      resolve(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}
