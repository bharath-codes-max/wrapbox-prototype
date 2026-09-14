#!/usr/bin/env node
/**
 * wrapboxd — the Wrapbox device runtime (macOS).
 * Commands are dynamically imported so the hot path (`check`, invoked on
 * every agent tool call) loads only what it needs.
 */

const HELP = `wrapboxd — Wrapbox device runtime

Usage: wrapboxd <command> [options]

Commands:
  enroll --server URL --org ORG --token WBXE...   Enroll this device (generates keypair)
  pull                                            Force a policy sync from the control plane
  status                                          Enrollment, ruleset freshness, chain, spool, hooks
  check [--agent NAME] [--project ID]             PreToolUse hook shim (stdin JSON -> decision JSON)
  run [--project ID] [--net on|off|loopback:PORT]
      [--deny PATH]... -- <cmd...>                Run a command under a Seatbelt profile
  protect claude-code                             Install PreToolUse governor hooks
  unprotect claude-code                           Remove the governor hooks
  discover                                        List every agent detected on this machine
  scan                                            Discover + emit receipts for new sightings
  wrap [id...]                                    Install PATH shims for detected shim-safe agents
  unwrap                                          Remove installed PATH shims
  daemon                                          Foreground loop: heartbeat, pull, drain, tamper watch, proxy
  verify                                          Verify the local receipt chain (sig + prev + seq)
  sync                                            Drain the evidence spool once

State lives under WRAPBOX_HOME (default ~/.wrapbox).
`;

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case undefined:
    case "--help":
    case "-h":
    case "help":
      process.stdout.write(HELP);
      return cmd === undefined ? 64 : 0;
    case "enroll":
      return (await import("./commands/enroll.js")).cmdEnroll(rest);
    case "pull":
      return (await import("./commands/pull.js")).cmdPull();
    case "status":
      return (await import("./commands/status.js")).cmdStatus();
    case "check":
      // cmdCheck never returns — it owns stdout/exit codes per the hook contract.
      return (await import("./commands/check.js")).cmdCheck(rest);
    case "run":
      return (await import("./commands/run.js")).cmdRun(rest);
    case "protect":
      return (await import("./commands/protect.js")).cmdProtect(rest);
    case "unprotect":
      return (await import("./commands/protect.js")).cmdUnprotect(rest);
    case "daemon":
      return (await import("./commands/daemon.js")).cmdDaemon();
    case "verify":
      return (await import("./commands/verify.js")).cmdVerify();
    case "sync":
      return (await import("./commands/sync.js")).cmdSync();
    case "discover":
      return (await import("./commands/discover.js")).cmdDiscover();
    case "scan":
      return (await import("./commands/discover.js")).cmdScan();
    case "wrap":
      return (await import("./commands/wrap.js")).cmdWrap(rest);
    case "unwrap":
      return (await import("./commands/wrap.js")).cmdUnwrap(rest);
    default:
      console.error(`wrapboxd: unknown command '${cmd}' (see wrapboxd --help)`);
      return 64;
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`wrapboxd: ${(err as Error).message}`);
    process.exit(1);
  },
);
