/**
 * Evidence / decisions log.
 * GET /v1/evidence — query the decision log (admin)
 * GET /v1/evidence/:id — get a single decision with its receipt
 */

import { FastifyInstance } from "fastify";
import { client } from "../db/index.js";
import { resolveAdmin } from "../auth.js";

export async function evidenceRoutes(app: FastifyInstance) {
  app.get("/v1/evidence", async (req, reply) => {
    if (!resolveAdmin(req)) return reply.code(401).send({ error: "Unauthorized" });

    const { org_id, device_id, agent_id, effect, limit } = req.query as {
      org_id?: string; device_id?: string; agent_id?: string; effect?: string; limit?: string;
    };
    if (!org_id) return reply.code(400).send({ error: "org_id required" });

    const take = Math.min(Number(limit) || 50, 200);
    let sql = "SELECT * FROM decisions WHERE org_id = ?";
    const args: unknown[] = [org_id];

    if (device_id) { sql += " AND device_id = ?"; args.push(device_id); }
    if (agent_id) { sql += " AND agent_id = ?"; args.push(agent_id); }
    if (effect) { sql += " AND effect = ?"; args.push(effect); }

    sql += " ORDER BY created_at DESC LIMIT ?";
    args.push(take);

    const { rows } = await client().execute({ sql, args });
    return reply.send(rows);
  });

  app.get("/v1/evidence/:id", async (req, reply) => {
    if (!resolveAdmin(req)) return reply.code(401).send({ error: "Unauthorized" });

    const { id } = req.params as { id: string };
    const { rows } = await client().execute({ sql: "SELECT * FROM decisions WHERE id = ?", args: [id] });
    if (rows.length === 0) return reply.code(404).send({ error: "Not found" });

    return reply.send(rows[0]);
  });
}
