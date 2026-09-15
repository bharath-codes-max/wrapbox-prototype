// Self-test: prove the REAL engine agrees with every intended verdict in the film.
//
// For each decision beat we rebuild the session ctx exactly the way the director
// would (replaying setCtx from beat 0 up to the beat), call runDecision, and
// assert the genuine engine output. If any assertion fails the RULES are wrong —
// never patch the UI to hide it.
//
// Run:  npx tsx src/data/live.selftest.ts

import { LIVE_BEATS, LIVE_RULES, runDecision, type Beat } from "./live";

let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean, detail: string) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}\n        ${detail}`);
  }
}

/** Rebuild session ctx the way the director does: setCtx from beat 0..index. */
function ctxUpTo(index: number): Record<string, unknown> {
  const ctx: Record<string, unknown> = {};
  for (let i = 0; i <= index; i++) {
    const s = LIVE_BEATS[i]?.setCtx;
    if (s) Object.assign(ctx, s);
  }
  return ctx;
}

function beatAt(id: string): { beat: Beat; ctx: Record<string, unknown> } {
  const index = LIVE_BEATS.findIndex((b) => b.id === id);
  if (index < 0) throw new Error(`beat not found: ${id}`);
  return { beat: LIVE_BEATS[index], ctx: ctxUpTo(index) };
}

console.log("\nWrapbox live-demo core · engine self-test\n" + "=".repeat(44));

/* ---- Chapter 3 · PII read → CONSTRAIN + mask ---- */
{
  const { beat, ctx } = beatAt("c3-read");
  const r = runDecision(beat, ctx);
  console.log(`\n[c3-read]  ${r.verdict.decision}  ${r.verdict.rule}  "${r.verdict.reason}"`);
  console.log(`           maskedSql: ${r.maskedSql}`);
  ok("Ch3 read → CONSTRAIN", r.verdict.decision === "CONSTRAIN", `got ${r.verdict.decision}`);
  ok("Ch3 read → constrain: mask", r.verdict.constrain === "mask", `got ${String(r.verdict.constrain)}`);
  ok("Ch3 read → masked SQL contains wbx_mask(email)", !!r.maskedSql?.includes("wbx_mask(email)"), `got ${r.maskedSql}`);
}

/* ---- Chapter 3 · write after PII read → BLOCK on taint ---- */
{
  const { beat, ctx } = beatAt("c3-write");
  const r = runDecision(beat, ctx);
  console.log(`\n[c3-write] ${r.verdict.decision}  ${r.verdict.rule}  "${r.verdict.reason}"`);
  console.log(`           session.pii_touched = ${String(ctx["session.pii_touched"])}`);
  ok("Ch3 write → BLOCK", r.verdict.decision === "BLOCK", `got ${r.verdict.decision}`);
  ok("Ch3 write → reason mentions PII", /pii/i.test(r.verdict.reason), `reason: ${r.verdict.reason}`);
}

/* ---- Chapter 4 · gateway write, business hours, no taint → REVIEW/2 ---- */
{
  const { beat, ctx } = beatAt("c4-review");
  const r = runDecision(beat, ctx);
  console.log(`\n[c4-review] ${r.verdict.decision}  approvers=${r.verdict.approvers}  quorum=${r.verdict.quorum}`);
  console.log(`            session.pii_touched = ${String(ctx["session.pii_touched"])}, time.window = ${String(ctx["time.window"])}`);
  ok("Ch4 review → REVIEW", r.verdict.decision === "REVIEW", `got ${r.verdict.decision}`);
  ok("Ch4 review → approvers sre-oncall", r.verdict.approvers === "sre-oncall", `got ${String(r.verdict.approvers)}`);
  ok("Ch4 review → quorum 2", r.verdict.quorum === 2, `got ${String(r.verdict.quorum)}`);
}

/* ---- Chapter 4 · approved + permit mint → ALLOW with permit id ---- */
{
  const { beat, ctx } = beatAt("c4-execute");
  const r = runDecision(beat, ctx);
  console.log(`\n[c4-execute] ${r.verdict.decision}  permitId=${r.permitId}  "${r.verdict.reason}"`);
  ok("Ch4 execute → ALLOW", r.verdict.decision === "ALLOW", `got ${r.verdict.decision}`);
  ok("Ch4 execute → permit id minted (wbp_)", !!r.permitId?.startsWith("wbp_"), `got ${String(r.permitId)}`);
  ok("Ch4 execute → reason names the permit", !!r.permitId && r.verdict.reason.includes(r.permitId), `reason: ${r.verdict.reason}`);
}

/* ---- Chapter 4 · replay → blocked ---- */
{
  const { beat, ctx } = beatAt("c4-replay");
  const r = runDecision(beat, ctx);
  console.log(`\n[c4-replay] ${r.verdict.decision}  replayBlocked=${r.replayBlocked}  "${r.verdict.reason}"`);
  ok("Ch4 replay → BLOCK", r.verdict.decision === "BLOCK", `got ${r.verdict.decision}`);
  ok("Ch4 replay → replayBlocked true", r.replayBlocked === true, `got ${String(r.replayBlocked)}`);
  ok("Ch4 replay → reason mentions consumed/single use", /consumed|single use/i.test(r.verdict.reason), `reason: ${r.verdict.reason}`);
}

/* ---- Destructive DROP variant → BLOCK via forbid ---- */
{
  const base = beatAt("c4-review");
  const destructive: Beat = {
    ...base.beat,
    id: "synthetic-destructive",
    decision: {
      plane: "gateway",
      act: {
        effect: "database.write",
        env: "production",
        sql: "DROP TABLE customers",
        ctx: { actor: "agent:codex@cloud-runner", sql: "DROP TABLE customers", "rows.affected": 42 },
      },
    },
  };
  const r = runDecision(destructive, base.ctx);
  console.log(`\n[destructive] ${r.verdict.decision}  "${r.verdict.reason}"`);
  ok("Destructive DROP → BLOCK", r.verdict.decision === "BLOCK", `got ${r.verdict.decision}`);
  ok("Destructive DROP → BLOCK via forbid", /forbidden|drop table/i.test(r.verdict.reason), `reason: ${r.verdict.reason}`);
}

/* ---- Outside business hours (drop the time.window fact) → BLOCK fail closed ---- */
{
  const base = beatAt("c4-review");
  const offHours = { ...base.ctx };
  delete (offHours as Record<string, unknown>)["time.window"]; // the org clock says off-hours
  const r = runDecision(base.beat, offHours);
  console.log(`\n[off-hours] ${r.verdict.decision}  "${r.verdict.reason}"  (time.window dropped)`);
  ok("Off-hours → BLOCK", r.verdict.decision === "BLOCK", `got ${r.verdict.decision}`);
  ok("Off-hours → fail closed (context not proven)", /not proven|context|time\.window/i.test(r.verdict.reason), `reason: ${r.verdict.reason}`);
}

/* ---- Sanity: rules typecheck and the hero rule carries every hard feature ---- */
{
  const hero = LIVE_RULES.find((r) => r.id === "prod-db-write")!;
  ok("Hero rule present", !!hero, "prod-db-write missing");
  ok("Hero rule has forbid", !!hero.forbid?.length, "no forbid");
  ok("Hero rule has requires (business hours)", !!hero.when.requires?.length, "no requires");
  ok("Hero rule has escalations (PII + blast radius)", (hero.escalations?.length ?? 0) >= 2, "expected 2 escalations");
  ok("Hero rule has single-use permit bound to sql+actor", hero.permit?.singleUse === true && (hero.permit?.bind?.length ?? 0) === 2, "permit binding wrong");
}

console.log("\n" + "=".repeat(44));
console.log(`RESULT: ${passed} passed, ${failed} failed\n`);
// Signal a non-zero exit for CI without depending on @types/node in tsconfig.
if (failed > 0) (globalThis as { process?: { exit?: (code: number) => void } }).process?.exit?.(1);
