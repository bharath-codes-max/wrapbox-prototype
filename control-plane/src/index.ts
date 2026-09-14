/**
 * Wrapbox Control Plane — the server that stores rules and answers
 * "is this allowed?" for every device running wrapboxd.
 */

import Fastify from "fastify";
import { initDb, close } from "./db/index.js";
import { orgsRoutes } from "./routes/orgs.js";
import { checkRoute } from "./routes/check.js";
import { rulesRoutes } from "./routes/rules.js";
import { devicesRoutes } from "./routes/devices.js";
import { evidenceRoutes } from "./routes/evidence.js";
import { enrollTokensRoutes } from "./routes/enroll-tokens.js";
import { agentsRoutes } from "./routes/agents.js";

const PORT = Number(process.env.PORT) || 4100;

const app = Fastify({ logger: true });

// Health check
app.get("/health", async () => ({ status: "ok", version: "0.1.0" }));

// Register routes
await orgsRoutes(app);
await checkRoute(app);
await rulesRoutes(app);
await devicesRoutes(app);
await evidenceRoutes(app);
await enrollTokensRoutes(app);
await agentsRoutes(app);

// Initialize DB (runs migrations)
await initDb();

// Start
try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`\n  🔒 Wrapbox Control Plane running on http://localhost:${PORT}\n`);
} catch (err) {
  app.log.error(err);
  close();
  process.exit(1);
}

// Graceful shutdown
process.on("SIGINT", () => { close(); process.exit(0); });
process.on("SIGTERM", () => { close(); process.exit(0); });
