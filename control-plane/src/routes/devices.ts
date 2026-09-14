/**
 * Device registration and management.
 * POST /v1/devices/enroll  — a new machine registers itself
 * POST /v1/devices/heartbeat — daemon pings every 60s
 * GET  /v1/devices         — admin lists all devices in the org
 */

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { nanoid } from "nanoid";
import { createHash, randomBytes } from "node:crypto";
import { client } from "../db/index.js";
import { resolveAdmin } from "../auth.js";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

const EnrollBody = z.object({
  org_id: z.string(),
  hostname: z.string().min(1),
  os: z.string().min(1),
  arch: z.string().optional(),
  owner_email: z.string().email().optional(),
});

export async function devicesRoutes(app: FastifyInstance) {
  // Enroll a new device — returns the API key (shown once, never stored in plain text)
  app.post("/v1/devices/enroll", async (req, reply) => {
    const parsed = EnrollBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid body", details: parsed.error.flatten() });

    const d = parsed.data;
    const id = nanoid();
    const apiKey = `wbx_${randomBytes(32).toString("hex")}`;
    const keyHash = hashKey(apiKey);

    await client().execute({
      sql: `INSERT INTO devices (id, org_id, hostname, os, arch, owner_email, api_key_hash, state, last_heartbeat)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'healthy', datetime('now'))`,
      args: [id, d.org_id, d.hostname, d.os, d.arch ?? null, d.owner_email ?? null, keyHash],
    });

    return reply.code(201).send({
      id,
      api_key: apiKey,
      message: "Save this API key — it will not be shown again.",
    });
  });

  // Heartbeat
  app.post("/v1/devices/heartbeat", async (req, reply) => {
    const authHeader = req.headers.authorization;
    const rawKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!rawKey) return reply.code(401).send({ error: "Missing API key" });

    const keyHash = hashKey(rawKey);
    const { rows } = await client().execute({
      sql: "SELECT id, org_id, state FROM devices WHERE api_key_hash = ?",
      args: [keyHash],
    });
    if (rows.length === 0) return reply.code(401).send({ error: "Unknown device" });

    const device = rows[0];
    await client().execute({
      sql: "UPDATE devices SET last_heartbeat = datetime('now'), state = 'healthy' WHERE id = ?",
      args: [device.id],
    });

    return reply.send({ status: "ok", device_id: device.id });
  });

  // Admin: list all devices
  app.get("/v1/devices", async (req, reply) => {
    if (!resolveAdmin(req)) return reply.code(401).send({ error: "Unauthorized" });

    const { org_id } = req.query as { org_id?: string };
    if (!org_id) return reply.code(400).send({ error: "org_id required" });

    const { rows } = await client().execute({
      sql: "SELECT id, hostname, os, arch, owner_email, state, last_heartbeat, created_at FROM devices WHERE org_id = ? ORDER BY created_at DESC",
      args: [org_id],
    });

    return reply.send(rows);
  });
}
