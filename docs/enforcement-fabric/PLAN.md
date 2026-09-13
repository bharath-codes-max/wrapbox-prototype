# Enforcement Fabric — v2: implementation plan

Status: **approved**; reconciled with the follow-up brief of 13 September 2026 (that brief wins on every conflict).
Inputs: `wrapbox-enforcement-fabric-architecture.md` (authoritative), `wrapbox-enforcement-fabric-change-pack.md` (vocabulary and invariants only), the two v2 diagrams (authoritative), the two earlier diagrams (context), and this repo's `CLAUDE.md`.

## 0. Decisions made

| Decision | Value |
|---|---|
| Workspace | id `fabric`, label "Enforcement Fabric — v2", kind reference, labs off, `sims` on |
| Tenant | Oakridge Mutual, one product version after `prod`; same people, groups and contract lineage |
| Visibility | `fabric` is the default and the **only** workspace the UI shows. `prod` / `demo` / `fresh` stay in the code and seeds, reachable only with `?workspaces=all` in the URL, for regression |
| Simulation | Controls that stand in for device-side events (tamper, stop wrapboxd, quarantine) are labelled "Simulate" and exist only where `sims` is on |
| Policy language | The existing normalized `Rule`. No Cedar, no second schema, no sandbox code, no daemon code |
| Receipt | The existing ECDSA permit, with the rule id added to the signed body |

## 1. What wins where the documents and the prototype disagree

| Document says | This prototype does |
|---|---|
| Cedar (I-5) | The normalized `Rule` is the policy language; v2 rules are ordinary rules |
| `schema/*.json` is the contract (I-1) | `Act` + `Ctx` in `src/lib/engine.ts`; v2 adds context keys, matched with the existing `requires` |
| Embed `srt` (I-6), daemon phases | Confinement, enrollment, discovery, provisioning, heartbeat and tamper are **state machines** in the store; nothing pretends to sandbox a process |
| Delete per-agent modules | The catalog stays; profiles are data derived from it (I-2 is the invariant that matters) |
| "Runtime v1 … Windows behind a flag" | Install commands are shown per OS with the real package names; enrollment is simulated with realistic output |

Real: the evaluator, the rules, YAML round-trip, ECDSA receipts and verification, every derived count.
Simulated (as visible state, labelled where a control triggers it): the agents, the Runtime and its install, Gateway traffic, SSO / MDM / vault, background traffic.

## 2. Existing modules extended

| Module | Change |
|---|---|
| `src/lib/store.ts` | `WorkspaceId` gains `fabric`; `WorkspaceMeta` gains `fabric`, `sims`; `WORKSPACE_ORDER` starts with `fabric`; `ALL_WORKSPACES` / `VISIBLE_WORKSPACES` read `?workspaces=all`; default and start workspace `fabric`. `State` gains v2 slices (`fleet`, `gateways`, `vault`, `sessions`, `destinations`), empty in v1 workspaces. `homePath()` (Fleet in v2, the hub in v1). Live traffic in v2 is generated from the fleet **as it is now**, so a tamper or a lost heartbeat changes what is produced. Later commits add: `setDeviceState`, `tamperAdapter`, `reprovisionAdapter`, `revokeSession`, `mintReceipt`, `enrollDevice`, `discoverAgents`, `provisionAdapters` |
| `src/lib/engine.ts` | No matcher change. Later: device pre-checks next to the org kill switch (quarantined device / device kill switch → BLOCK, like `kill-switch`), and a `broker` kind in `rewrite()` |
| `src/data/contract.ts` | Effects added to the vocabulary: `model.request`, `http.request`, `secret.use`, `runtime.integrity` |
| `src/lib/permit.ts` | `rule` in the signed body; negative ttl allowed for the expired-receipt failure case |
| `src/lib/traffic.ts` | `attributeAsIs` (device-attributed traffic keeps the logged-in person) |
| `src/data/agents.ts` | `agentById` resolves `unknown:<binary>` to a synthetic agent so an unprofiled process renders everywhere; catalog untouched |
| `src/data/reference.ts` | Exports its directory, groups, changelog and template factories for the v2 seed |
| `src/components/shell.tsx` | v2 nav (Enforce: Fleet, Gateway · Govern: Intent contract · Operate: Approvals, Evidence), employee nav (My device, Rules for me, My approvals, My activity), switcher shows only visible workspaces, palette indexes devices |
| `src/App.tsx` | `/` → Fleet, `/fleet/:id`; v1-only routes (`/start`, `/onboarding/*`, `/agents*`, `/team`) redirect to Fleet in v2; `/evidence?agent=` |
| `src/pages/evidence.tsx` | Query-driven agent filter; unknown agents in the filter. Later: Device and Coverage columns |
| `src/pages/gateway.tsx` | Activity link → Evidence in v2. Later: Servers · Broker · Destinations tabs |
| `src/pages/settings.tsx` | Tour row only when a tour exists for the workspace |
| `src/pages/auth.tsx`, `src/pages/landing.tsx` | Post-login lands on `homePath()`. Later: copy describes the install-once product |

## 3. New files

| File | Purpose |
|---|---|
| `src/data/profiles.ts` | One profile per agent: binaries, signing id, model endpoints, adapter kind + per-OS path + `render(org)` (real-format file), launch mode, covered action kinds. `HOOK_SHIM` paths. `MODEL_ENDPOINTS` |
| `src/lib/fabric.ts` | `CTX` keys, `LAUNCH`, `COVERAGE`, `KINDS`, `kindOf`, `sourceFor`, `provisionAgent`, `coverageFor`, `gapFor`, `coverageClassOf`, `withProvenance`, `provenanceOf`, `connectedFrom`, `devicesFor`. Grep gate: no catalog agent id in this file or in the Fleet page |
| `src/data/fabric.ts` | The seed: contract (v1 rules with `git.main` and `payments.refund` carrying receipts, plus `prod.deploy`, `model.egress`, `fs.confine`, `runtime.integrity`), changelog v1–v27, 3 devices + 1 gateway, vault refs, session tokens, destinations, 14 days of device- and gateway-attributed decisions, approvals and receipts, the tamper history |
| `src/pages/fleet.tsx` | Fleet (KPIs, needs-attention, device and gateway cards, live decisions) and device detail (agents, adapters with paths, coverage matrix, gaps, decisions) |
| Later | `src/pages/enroll.tsx`, `src/components/receipt.tsx`, `src/components/tour.tsx` |
| `docs/enforcement-fabric/STATUS.md` | Updated every commit |

## 4. Device and runtime model (v2 only)

```ts
LaunchMode  = wrapbox | native-managed | native-unmanaged | unknown
DeviceState = enrolling → healthy → heartbeat-lost → quarantined     (killSwitch orthogonal)
AdapterState = provisioned → tampered → re-provisioned
DiscoveredAgent { agentId, binary, version, launchMode, discoveredAt, adapter?: { path, kind, state, writtenAt, sha256 } }
FleetDevice { id, hostname, ownerId, os, arch, enrolledAt, runtimeVersion, policyBundleVersion, heartbeat, state, killSwitch, keyId, agents[] }
GatewayNode { id, region, version, state, heartbeat, policyBundleVersion, upstreams[], brokered[] }
```

Coverage per action kind is derived, never stored, onto the existing `Assurance` axis: endpoint-enforced = Floor (device healthy, fs / exec / net / model kinds), hook-enforced = Ceiling (adapter provisioned or re-provisioned, launch mode wrapbox or native-managed, kind in the profile's `covers`), gateway-enforced = Remote (gateway fronts the upstream or brokers the host), resource-verified = Assured (a tier-0 destination for that kind). Anything else is a stated gap.

## 5. Engine extension: context keys, not a new engine

Keys in `Act.ctx`: `agent.launch_mode`, `provenance.source`, `device.id`, `device.state`, `coverage.class`, `path.in_workspace`. Rules use `requires`, which already fails closed on a missing key, so the tester renders an input for each and YAML round-trips them today.

| Rule | Shape | Proves |
|---|---|---|
| `model.egress` | `model.request` requires `agent.launch_mode in [wrapbox, native-managed]` → ALLOW; otherwise the engine refuses (BLOCK) | The model-egress gate, evaluated, never hard-coded |
| `fs.confine` | `filesystem.write` requires `path.in_workspace is true` → ALLOW; otherwise BLOCK | The Floor |
| `runtime.integrity` | `runtime.integrity` → BLOCK | A changed adapter is rejected and rewritten; the agent is reclassified until then |
| `git.main` (changed) | REVIEW by oncall-sre, permit 300 s single-use | Approved pushes carry a receipt GitHub verifies |
| `payments.refund` (changed) | tiers unchanged, permit 300 s single-use | Refunds above the automatic tier carry a receipt |
| `credentials.broker` (commit 4) | `http.request` carrying credentials → CONSTRAIN `broker` | Strip-and-replace |

## 6. Credential broker, receipts, destinations

Vault entries are references (`vault://payments/stripe-restricted-key`); session tokens `{ agent, device, person, ttl, scope, state }` with a working revoke; the strip-and-replace flow is a CONSTRAIN rewrite whose request detail shows `<agent-supplied key · redacted>` → `<brokered session wbs_… · expires in mm:ss>`. Receipts render the permit (`decision_id · action_hash · effect · rule · exp`); `mintReceipt` refuses for a quarantined device or a stopped runtime; three tier-0 destinations refuse un-receipted requests; expired receipts come from the real signer and fail the real verifier. The secret scan gains key-shaped patterns.

## 7. Onboarding, tour, copy

Enrollment (`/onboarding/admin` in v2): org → OS → the real install per OS (macOS `.pkg` via MDM or shell one-liner, Windows `.msi`, Linux apt / rpm) → simulated enrollment output (device key, bundle version, first heartbeat) → discovery from profiles → adapters written with paths → bundle applied → Fleet. Every step mutates the store; every later count follows.
Tour: offered after enrollment and on first Fleet visit, resumable, relaunchable from Settings; twelve steps anchored to real elements with copy derived from state; honest branches when a state is absent.
Copy: landing and auth describe the install-once product; no workspace or version words anywhere a viewer can see.

## 8. Seeded data

- 3 devices: `dk-macbook-pro` (Dev; Claude Code under Wrapbox launch with managed settings, Cursor and Codex CLI native-managed with hooks.json), `tanvi-mbp` (Tanvi; Cursor re-provisioned after a tamper 3 days ago, Windsurf, and `claims-bot.py` — unknown, Floor only, model calls refused), `claims-worker-01` (Linux server, LangGraph via the Runtime, heartbeat lost 12 minutes ago).
- 1 gateway `gw-us-east-1`: virtual MCP for Stripe, GitHub, Postgres; brokered `api.stripe.com`, `api.github.com`.
- Vault refs ×4, session tokens ×6 (3 active, 2 expired, 1 revoked at the tamper), destinations ×4 (3 tier-0).
- Contract v27 with the full history; 14 days of decisions, approvals (incl. two open now), receipts.

## 9. Commit order

1. Workspace + seed + profiles + Fleet + nav/routes; v1 hidden behind the flag. **(done)**
2. Fleet actions: kill switch, quarantine, Simulate tamper / stop wrapboxd; engine device pre-checks; evidence device + coverage columns.
3. Rules in the tester and YAML round-trip; `broker` constrain kind.
4. Gateway → Broker.
5. Receipts and Destinations.
6. Enrollment wizard.
7. Copy pass (landing, auth, About), employee polish.
8. Tour.
9. Design parity pass.

## 10. Verification before "done"

Sweep 4 workspaces × 2 roles (`sweep4.mjs`) with structural snapshots of `prod` / `demo` / `fresh` compared before and after; v2 pages checked for leaked v1 wording, labs wording and key-shaped strings; in-page invariants over the generated state; tamper → launch mode flips → `model.egress` BLOCKs through the evaluator; receipt refusal paths through `permit.ts`; Rule → YAML → Rule equality for every v2 rule; grep gates for agent ids in fleet logic and for secrets.
