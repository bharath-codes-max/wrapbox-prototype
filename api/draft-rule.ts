/* Server-side rule drafter.
 *
 * Runs on Vercel as a Node serverless function, so OPENAI_API_KEY stays on the server: it is
 * never sent to the browser, never bundled, never logged, never written into a rule or YAML.
 *
 * The model only DRAFTS. It proposes a rule, this function validates that draft against the
 * Wrapbox rule schema, and a person still reviews it in the builder and publishes it. Runtime
 * ALLOW / CONSTRAIN / REVIEW / BLOCK decisions never involve a model.
 *
 * GET  → { configured, model }        status only, no secret
 * POST → { rule, understood, unsupported, missing, source }
 */

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/* The vocabulary the engine understands. Kept in step with src/data/contract.ts. */
const EFFECTS = [
  { id: "filesystem.read", label: "Read a file", fields: ["path", "env"] },
  { id: "filesystem.write", label: "Write or delete a file", fields: ["path", "env"] },
  { id: "shell.exec", label: "Run a command", fields: ["command", "env"] },
  { id: "git.push", label: "Push to a branch", fields: ["branch", "command"], constrain: "force-with-lease" },
  { id: "git.merge", label: "Merge into a branch", fields: ["branch"] },
  { id: "database.read", label: "Read from a database", fields: ["columns", "env"], constrain: "mask" },
  { id: "database.write", label: "Change rows", fields: ["env"] },
  { id: "database.migrate", label: "Change a schema", fields: ["env"] },
  { id: "payments.refund", label: "Refund a payment", fields: ["amount"], unit: "USD" },
  { id: "claims.payout", label: "Pay out a claim", fields: ["amount"], unit: "INR" },
  { id: "crm.apply_discount", label: "Give a discount", fields: ["amount"], unit: "%" },
  { id: "payment.submit", label: "Submit a payment in a browser", fields: ["amount"], unit: "USD" },
  { id: "network.egress", label: "Send data to a domain", fields: ["destination"] },
  { id: "purchase.order", label: "Place a delegated order", fields: [] },
] as const;
const EFFECT_IDS = EFFECTS.map((e) => e.id);
const DECISIONS = ["ALLOW", "CONSTRAIN", "REVIEW", "BLOCK"];
const ENVS = ["production", "staging", "development"];
const SUBJECTS = ["ide", "cli", "cloud", "custom", "mcp", "saas", "browser", "a2a"];
const GROUPS = ["oncall-sre", "payments-manager", "claims-manager", "sales-manager", "vp-sales", "finance-controller", "security", "admin"];

const SYSTEM = `You turn a plain-English sentence from a company admin into ONE draft authorization rule for Wrapbox, a runtime permit layer for AI agents.

Effects you may use (pick exactly one):
${EFFECTS.map((e) => `- ${e.id} — ${e.label}${"unit" in e && e.unit ? ` (amount in ${e.unit})` : ""}`).join("\n")}

Rules of the output:
- decision is one of ALLOW, CONSTRAIN, REVIEW, BLOCK. Use tiers instead of decision when the sentence sets a money or percentage threshold.
- CONSTRAIN is only valid for database.read (constrain "mask") and git.push (constrain "force-with-lease"). If the sentence asks to limit something else, use REVIEW.
- approver groups available: ${GROUPS.join(", ")}. Use the closest one; use "admin" if unclear.
- quorum 2 when the sentence asks for two people / dual approval.
- env only when the sentence names production, staging or development.
- subject only when the sentence names a kind of agent (coding agents → ide, cli, cloud).
- understood: short label/value pairs describing what you extracted, for a non-technical reader.
- unsupported: things the sentence asks for that this schema cannot express — time-of-day windows, rate limits, per-person approvers, geography, spend budgets over time. Never silently drop them.
- missing: what the sentence still needs before it can become a rule.
- Never invent a threshold, an approver or a decision that the sentence does not imply.
- title: a short sentence-case title. why: the reason an employee sees when stopped.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["effect", "path", "command", "branch", "env", "columns", "destination_not_in", "credentials", "subject", "decision", "tiers", "unit", "approvers", "quorum", "constrain", "title", "why", "understood", "unsupported", "missing"],
  properties: {
    effect: { type: ["string", "null"], enum: [...EFFECT_IDS, null] },
    path: { type: "array", items: { type: "string" } },
    command: { type: "array", items: { type: "string" } },
    branch: { type: "array", items: { type: "string" } },
    env: { type: "array", items: { type: "string", enum: ENVS } },
    columns: { type: "array", items: { type: "string" } },
    destination_not_in: { type: "array", items: { type: "string" } },
    credentials: { type: ["boolean", "null"] },
    subject: { type: "array", items: { type: "string", enum: SUBJECTS } },
    decision: { type: ["string", "null"], enum: [...DECISIONS, null] },
    tiers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["max", "decision", "approvers", "quorum"],
        properties: {
          max: { type: ["number", "null"] },
          decision: { type: "string", enum: DECISIONS },
          approvers: { type: ["string", "null"] },
          quorum: { type: ["number", "null"] },
        },
      },
    },
    unit: { type: ["string", "null"], enum: ["USD", "INR", "%", null] },
    approvers: { type: ["string", "null"] },
    quorum: { type: ["number", "null"] },
    constrain: { type: ["string", "null"], enum: ["mask", "force-with-lease", null] },
    title: { type: "string" },
    why: { type: "string" },
    understood: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["label", "value"], properties: { label: { type: "string" }, value: { type: "string" } } },
    },
    unsupported: { type: "array", items: { type: "string" } },
    missing: { type: "array", items: { type: "string" } },
  },
};

const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : undefined);
const arr = (x: unknown) => (Array.isArray(x) ? x.map(String).filter(Boolean) : undefined);
const clean = <T,>(x: T[] | undefined) => (x && x.length ? x : undefined);

/** Validate the model's draft against the Wrapbox rule schema. Anything off-schema is dropped or rejected. */
function toRule(d: Record<string, unknown>, existingIds: string[]) {
  const effect = str(d.effect);
  if (!effect || !EFFECT_IDS.includes(effect as (typeof EFFECT_IDS)[number])) return { rule: null, reason: "no usable effect" };
  const info = EFFECTS.find((e) => e.id === effect)!;
  const fields: readonly string[] = info.fields;

  let decision = str(d.decision);
  if (decision && !DECISIONS.includes(decision)) decision = undefined;

  const rawTiers = Array.isArray(d.tiers) ? (d.tiers as Record<string, unknown>[]) : [];
  let tiers = rawTiers
    .filter((t) => DECISIONS.includes(String(t.decision)))
    .map((t) => ({
      max: t.max === null || t.max === undefined ? null : Number(t.max),
      decision: String(t.decision) as "ALLOW" | "CONSTRAIN" | "REVIEW" | "BLOCK",
      approvers: str(t.approvers),
      quorum: t.quorum ? Number(t.quorum) : undefined,
    }));
  // tiers only make sense for amount effects, must be ordered, and end with an open band
  if (!fields.includes("amount")) tiers = [];
  if (tiers.length) {
    const bounded = tiers.filter((t) => t.max !== null).sort((a, b) => (a.max as number) - (b.max as number));
    const open = tiers.find((t) => t.max === null) ?? { max: null, decision: "REVIEW" as const, approvers: "admin", quorum: undefined };
    tiers = [...bounded, open];
    if (tiers.some((t) => t.max !== null && !Number.isFinite(t.max))) return { rule: null, reason: "a tier limit was not a number" };
  }

  let constrain = str(d.constrain);
  if (constrain && constrain !== (info as { constrain?: string }).constrain) constrain = undefined;
  if (decision === "CONSTRAIN" && !constrain) decision = "REVIEW";
  if (!decision && !tiers.length) return { rule: null, reason: "no decision" };

  let approvers = str(d.approvers);
  if (approvers && !GROUPS.includes(approvers)) approvers = approvers.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 40) || "admin";
  if (decision === "REVIEW" && !approvers) approvers = "admin";

  const when: Record<string, unknown> = { effect: [effect] };
  if (fields.includes("path")) when.path = clean(arr(d.path));
  if (fields.includes("command")) when.command = clean(arr(d.command));
  if (fields.includes("branch")) when.branch = clean(arr(d.branch));
  if (fields.includes("columns")) when.columns = clean(arr(d.columns));
  if (fields.includes("destination")) when.destinationNotIn = clean(arr(d.destination_not_in));
  if (fields.includes("env")) when.env = clean(arr(d.env)?.filter((e) => ENVS.includes(e)));
  if (effect === "network.egress" && d.credentials === true) when.credentials = true;
  const subject = clean(arr(d.subject)?.filter((s) => SUBJECTS.includes(s)));
  if (subject) when.subject = subject;
  for (const k of Object.keys(when)) if (when[k] === undefined) delete when[k];

  const base = tiers.length ? `${effect}.tiers` : `${effect}.${(decision ?? "rule").toLowerCase()}`;
  let id = base;
  for (let i = 2; existingIds.includes(id); i++) id = `${base}.${i}`;

  const title = (str(d.title) ?? info.label).slice(0, 90);
  const rule = {
    id,
    title,
    why: (str(d.why) ?? title).slice(0, 200),
    when,
    ...(tiers.length ? { tiers, unit: (info as { unit?: string }).unit } : { decision }),
    ...(approvers && !tiers.length ? { approvers } : {}),
    ...(d.quorum && !tiers.length ? { quorum: Number(d.quorum) } : {}),
    ...(constrain ? { constrain } : {}),
    scope: /payment|claim|discount|purchase/.test(effect) ? "business" : /git|filesystem|shell/.test(effect) ? "coding" : "all",
    custom: true,
  };
  return { rule, reason: "" };
}

export default async function handler(req: { method?: string; body?: unknown }, res: ResponseLike) {
  const key = process.env.OPENAI_API_KEY;

  if (req.method === "GET") return res.status(200).json({ configured: !!key, model: key ? MODEL : null });
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  if (!key) return res.status(501).json({ error: "not configured", configured: false });

  let body: { sentence?: string; existingIds?: string[] } = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : ((req.body ?? {}) as typeof body);
  } catch {
    return res.status(400).json({ error: "bad request body" });
  }
  const sentence = (body.sentence ?? "").toString().trim().slice(0, 500);
  const existingIds = Array.isArray(body.existingIds) ? body.existingIds.map(String).slice(0, 200) : [];
  if (sentence.length < 4) return res.status(400).json({ error: "sentence too short" });

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: sentence },
        ],
        response_format: { type: "json_schema", json_schema: { name: "wrapbox_rule_draft", strict: true, schema: SCHEMA } },
      }),
    });
    if (!r.ok) {
      // Never echo the upstream body — it can contain request context. Status only.
      return res.status(502).json({ error: `openai request failed (${r.status})` });
    }
    const data = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return res.status(502).json({ error: "empty response from openai" });

    const parsed = JSON.parse(content) as Record<string, unknown>;
    const { rule, reason } = toRule(parsed, existingIds);
    const understood = Array.isArray(parsed.understood)
      ? (parsed.understood as { label?: unknown; value?: unknown }[]).filter((u) => str(u.label) && str(u.value)).map((u) => ({ label: String(u.label).slice(0, 40), value: String(u.value).slice(0, 120) }))
      : [];
    const unsupported = (arr(parsed.unsupported) ?? []).map((s) => s.slice(0, 160));
    const missing = rule ? (arr(parsed.missing) ?? []) : [...(arr(parsed.missing) ?? []), reason].filter(Boolean);

    return res.status(200).json({ rule, understood, unsupported, missing, source: "openai", model: MODEL });
  } catch (e) {
    return res.status(502).json({ error: "could not reach openai", detail: e instanceof Error ? e.message.slice(0, 120) : undefined });
  }
}

interface ResponseLike {
  status: (code: number) => { json: (body: unknown) => unknown };
}
