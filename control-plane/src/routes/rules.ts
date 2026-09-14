/**
 * Rules CRUD — admin creates/reads/updates/deletes rules.
 * GET  /v1/rules         — list rules for an org
 * POST /v1/rules         — create a rule
 * PUT  /v1/rules/:id     — update a rule
 * DELETE /v1/rules/:id   — deactivate a rule
 * GET  /v1/rules/pull    — devices pull their current rule set
 */

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { nanoid } from "nanoid";
import { client } from "../db/index.js";
import { resolveDevice, resolveAdmin } from "../auth.js";

const CreateRule = z.object({
  org_id: z.string(),
  project_id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  effect: z.enum(["allow", "block", "review"]),
  priority: z.number().int().default(0),
  condition: z.any().optional(),
});

const UpdateRule = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  effect: z.enum(["allow", "block", "review"]).optional(),
  priority: z.number().int().optional(),
  condition: z.any().optional(),
  active: z.boolean().optional(),
});

export async function rulesRoutes(app: FastifyInstance) {
  app.get("/v1/rules", async (req, reply) => {
    if (!resolveAdmin(req)) return reply.code(401).send({ error: "Unauthorized" });

    const { org_id, project_id } = req.query as { org_id?: string; project_id?: string };
    if (!org_id) return reply.code(400).send({ error: "org_id required" });

    const { rows } = project_id
      ? await client().execute({
          sql: "SELECT * FROM rules WHERE org_id = ? AND (project_id IS NULL OR project_id = ?) ORDER BY priority DESC",
          args: [org_id, project_id],
        })
      : await client().execute({
          sql: "SELECT * FROM rules WHERE org_id = ? ORDER BY priority DESC",
          args: [org_id],
        });

    return reply.send(rows);
  });

  app.post("/v1/rules", async (req, reply) => {
    if (!resolveAdmin(req)) return reply.code(401).send({ error: "Unauthorized" });

    const parsed = CreateRule.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid body", details: parsed.error.flatten() });

    const r = parsed.data;
    const id = nanoid();

    await client().execute({
      sql: "INSERT INTO rules (id, org_id, project_id, name, description, effect, priority, condition_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      args: [id, r.org_id, r.project_id ?? null, r.name, r.description ?? null, r.effect, r.priority, r.condition ? JSON.stringify(r.condition) : null],
    });

    return reply.code(201).send({ id, ...r });
  });

  app.put("/v1/rules/:id", async (req, reply) => {
    if (!resolveAdmin(req)) return reply.code(401).send({ error: "Unauthorized" });

    const { id } = req.params as { id: string };
    const parsed = UpdateRule.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid body", details: parsed.error.flatten() });

    const { rows } = await client().execute({ sql: "SELECT * FROM rules WHERE id = ?", args: [id] });
    if (rows.length === 0) return reply.code(404).send({ error: "Rule not found" });

    const updates = parsed.data;
    const sets: string[] = [];
    const args: unknown[] = [];

    if (updates.name !== undefined) { sets.push("name = ?"); args.push(updates.name); }
    if (updates.description !== undefined) { sets.push("description = ?"); args.push(updates.description); }
    if (updates.effect !== undefined) { sets.push("effect = ?"); args.push(updates.effect); }
    if (updates.priority !== undefined) { sets.push("priority = ?"); args.push(updates.priority); }
    if (updates.condition !== undefined) { sets.push("condition_json = ?"); args.push(JSON.stringify(updates.condition)); }
    if (updates.active !== undefined) { sets.push("active = ?"); args.push(updates.active ? 1 : 0); }

    if (sets.length > 0) {
      args.push(id);
      await client().execute({ sql: `UPDATE rules SET ${sets.join(", ")} WHERE id = ?`, args });
    }

    return reply.send({ id, updated: sets.length });
  });

  app.delete("/v1/rules/:id", async (req, reply) => {
    if (!resolveAdmin(req)) return reply.code(401).send({ error: "Unauthorized" });
    const { id } = req.params as { id: string };
    await client().execute({ sql: "UPDATE rules SET active = 0 WHERE id = ?", args: [id] });
    return reply.send({ id, deactivated: true });
  });

  // Device: pull current rules
  app.get("/v1/rules/pull", async (req, reply) => {
    const device = await resolveDevice(req);
    if (!device) return reply.code(401).send({ error: "Invalid API key" });

    const { rows } = await client().execute({
      sql: "SELECT id, name, effect, priority, condition_json, project_id FROM rules WHERE org_id = ? AND active = 1 ORDER BY priority DESC",
      args: [device.org_id],
    });

    return reply.send({ rules: rows, pulled_at: new Date().toISOString() });
  });
}
