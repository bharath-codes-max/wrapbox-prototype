/**
 * `wrapboxd wrap [id...]` — install PATH shims for every detected shim-safe
 * agent (or the subset named). `wrapboxd unwrap` removes them.
 */
import { installShims, uninstallShims, SHIMS_DIR } from "../shims.js";

export async function cmdWrap(args: string[]): Promise<number> {
  const only = args.filter((a) => !a.startsWith("-"));
  const res = await installShims(only.length ? only : undefined);
  if (res.installed.length === 0) {
    console.log(`No shim-safe agents detected. Nothing to wrap. (Shims dir: ${SHIMS_DIR})`);
    return 0;
  }
  console.log(`Wrapped ${res.installed.length} agent binary/binaries:`);
  for (const s of res.installed) console.log(`  ${s.path} → ${s.registryId} (sha256 ${s.sha256.slice(0, 16)}…)`);
  console.log("");
  console.log(res.hint);
  return 0;
}

export async function cmdUnwrap(_args: string[]): Promise<number> {
  const res = uninstallShims();
  if (res.removed.length === 0) {
    console.log("No shims to remove.");
    return 0;
  }
  console.log(`Removed ${res.removed.length} shim(s):`);
  for (const p of res.removed) console.log(`  ${p}`);
  return 0;
}
