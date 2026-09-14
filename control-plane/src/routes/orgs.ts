/**
 * Org management.
 * POST /v1/orgs   — create an org (admin)
 * GET  /v1/orgs   — list orgs (admin)
 */

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { nanoid } from "nanoid";
import { client } from "../db/index.js";
import { resolveAdmin } from "../auth.js";

const CreateOrg = z.object({
  name: z.string().min(1),
  domain: z.string().optional(),
  region: z.string().default("us"),
});

export async function orgsRoutes(app: FastifyInstance) {
  app.post("/v1/orgs", async (req, reply) => {
    if (!resolveAdmin(req)) return reply.code(401).send({ error: "Unauthorized" });

    const parsed = CreateOrg.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid body", details: parsed.error.flatten() });

    const o = parsed.data;
    const id = nanoid();

    await client().execute({
      sql: "INSERT INTO orgs (id, name, domain, region) VALUES (?, ?, ?, ?)",
      args: [id, o.name, o.domain ?? null, o.region],
    });

    return reply.code(201).send({ id, ...o });
  });

  app.get("/v1/orgs", async (req, reply) => {
    if (!resolveAdmin(req)) return reply.code(401).send({ error: "Unauthorized" });
    const { rows } = await client().execute("SELECT * FROM orgs ORDER BY created_at DESC");
    return reply.send(rows);
  });
}
