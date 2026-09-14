/**
 * Universal network gate — a local HTTP proxy on 127.0.0.1 that every wrapped
 * agent's traffic is routed through (via HTTP_PROXY / HTTPS_PROXY set by the
 * shim). Enforces the same cached ruleset the check hook uses, and writes a
 * signed receipt for every allow/block decision.
 *
 * NO TLS MITM — for HTTPS we inspect the CONNECT line's host string, decide,
 * then either pipe raw sockets through or close with 403. Hostname-level
 * control is the guarantee. Content inspection is the Gateway's job.
 */

import http from "node:http";
import net from "node:net";
import type { Duplex } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import { loadConfig, PATHS, type Config } from "./config.js";
import { loadCachedRules, evaluate, applyProjectFilter, type ToolCall, type Rule } from "./policy.js";
import { makeReceipt, appendToSpool } from "./receipts.js";

export const DEFAULT_PROXY_PORT = Number(process.env.WRAPBOX_PROXY_PORT || 4180);

// Known model API hosts — baked in so the daemon can raise the "unknown
// process reached a model API" alarm even when no rule mentions them.
export const MODEL_API_HOSTS = new Set([
  "api.openai.com",
  "api.anthropic.com",
  "generativelanguage.googleapis.com",
  "api.mistral.ai",
  "api.cohere.ai",
  "api.groq.com",
  "api.together.xyz",
  "api.perplexity.ai",
  "api.deepseek.com",
  "api.x.ai",
  "api.fireworks.ai",
]);

interface ProxySession {
  agent: string;
  session: string;
  registeredAt: number;
}

const SESSION_FILE = () => path.join(PATHS.home, "proxy-session.json");

/**
 * Prototype attribution: `wrapboxd run --agent X --net proxy` writes a session
 * record here on start and removes it on exit. The proxy stamps concurrent
 * connections with that agent. Production would peer-lookup by socket (via
 * netstat/lsof) — noted as a known limitation.
 */
export function writeProxySession(agent: string, session: string): void {
  fs.mkdirSync(PATHS.home, { recursive: true });
  fs.writeFileSync(SESSION_FILE(), JSON.stringify({ agent, session, registeredAt: Date.now() }));
}
export function clearProxySession(): void {
  try { fs.unlinkSync(SESSION_FILE()); } catch { /* nothing to clear */ }
}
function readProxySession(): ProxySession | null {
  try {
    const raw = fs.readFileSync(SESSION_FILE(), "utf-8");
    const s = JSON.parse(raw);
    if (!s || typeof s.agent !== "string") return null;
    // stale after 6 hours
    if (Date.now() - (s.registeredAt || 0) > 6 * 3600_000) return null;
    return s as ProxySession;
  } catch { return null; }
}

interface Decision {
  effect: "allow" | "block";
  reason: string;
  rule_id: string | null;
  degraded: boolean;
  pulled_at: string | null;
  matchedRule?: Rule | null;
}

function decide(host: string, port: number, agent: string): Decision {
  const cached = loadCachedRules();
  if (!cached) {
    return {
      effect: "block",
      reason: "No cached ruleset — proxy failing closed",
      rule_id: null,
      degraded: true,
      pulled_at: null,
    };
  }
  const rules = applyProjectFilter(cached.rules, undefined);
  const call: ToolCall = {
    tool_name: "network.connect",
    tool_input: { host, port, agent },
  };
  const r = evaluate(call, rules);
  const matched = r.matched_rule_id ? cached.rules.find((x) => x.id === r.matched_rule_id) : undefined;
  const isModelApi = MODEL_API_HOSTS.has(host);
  const unknownProc = agent === "unknown";

  // Special alarm: an unattributed process reaching a model API. Only an
  // EXPLICIT rule — one whose condition actually targets host/tool_input —
  // counts as authorisation. A catch-all allow (no condition, or a condition
  // that doesn't mention the host field) leaves the model-API guard in force
  // and the connection is blocked with the loud reason. This is the whole
  // point of the guard: default-allow policies must not silently open every
  // model provider to unattributed local processes.
  if (isModelApi && unknownProc) {
    if (r.effect === "allow" && matched && ruleTargetsHost(matched)) {
      return { effect: "allow", reason: matched.name || r.reason, rule_id: matched.id, degraded: !cached.fresh, pulled_at: cached.pulled_at };
    }
    // If a rule DID block this call, preserve its name in the reason — the
    // rule and the guard both fired; the operator wants to see both.
    const guard = "unknown-process → model-API";
    const reason = r.effect === "block" && matched
      ? `${matched.name} — ${guard}`
      : guard;
    return { effect: "block", reason, rule_id: matched?.id ?? null, degraded: !cached.fresh, pulled_at: cached.pulled_at };
  }
  return {
    effect: r.effect === "allow" ? "allow" : "block",
    reason: matched?.name || r.reason,
    rule_id: matched?.id ?? null,
    degraded: !cached.fresh,
    pulled_at: cached.pulled_at,
  };
}

/**
 * Is this rule specific enough to authorise a model-API host? True only when
 * its condition explicitly names the host field — a catch-all with no
 * condition, or one that only filters e.g. tool_name, is not.
 */
function ruleTargetsHost(rule: { condition: unknown }): boolean {
  const c = rule.condition;
  if (!c) return false;
  const parts: unknown[] = Array.isArray(c) ? c : [c];
  return parts.some((p) => {
    if (!p || typeof p !== "object") return false;
    const field = (p as Record<string, unknown>).field;
    return typeof field === "string" && (field === "tool_input.host" || field.endsWith(".host"));
  });
}

function writeReceipt(cfg: Config, host: string, port: number, agent: string, session: string, d: Decision, enforcement: "proxy") {
  try {
    const receipt = makeReceipt(cfg, {
      agent,
      session,
      tool_name: "network.connect",
      tool_input: { host, port },
      target: `${host}:${port}`,
      effect: d.effect,
      reason: d.reason,
      rule_id: d.rule_id,
      ruleset_pulled_at: d.pulled_at,
      enforcement,
      degraded: d.degraded,
    });
    appendToSpool(receipt);
  } catch (err) {
    console.error(`proxy: failed to write receipt: ${(err as Error).message}`);
  }
}

function parseHostPort(hostHeader: string, defaultPort: number): { host: string; port: number } {
  // hostHeader may be "host", "host:port", or "[v6]:port".
  const m = hostHeader.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (m) return { host: m[1], port: m[2] ? Number(m[2]) : defaultPort };
  const idx = hostHeader.lastIndexOf(":");
  if (idx > 0 && /^\d+$/.test(hostHeader.slice(idx + 1))) {
    return { host: hostHeader.slice(0, idx), port: Number(hostHeader.slice(idx + 1)) };
  }
  return { host: hostHeader, port: defaultPort };
}

export interface ProxyHandle {
  server: http.Server;
  port: number;
  stop: () => Promise<void>;
}

export async function startProxy(port: number = DEFAULT_PROXY_PORT): Promise<ProxyHandle> {
  const cfg = loadConfig();
  if (!cfg) throw new Error("proxy: not enrolled — cannot sign receipts (run: wrapboxd enroll ...)");

  // Universal safety net — one connection must never crash the daemon.
  //
  // try/catch alone is NOT that net: a socket reset arrives asynchronously as
  // an 'error' event, and an unhandled one takes the whole process down. Every
  // socket therefore gets an error listener attached BEFORE any I/O on it.
  const server = http.createServer((req, res) => {
    req.on("error", () => { /* client hung up mid-request */ });
    res.on("error", () => { /* client hung up mid-response */ });
    try { handleHttp(req, res); } catch (err) {
      console.error(`proxy handler: ${(err as Error).message}`);
      try { res.destroy(); } catch { /* ignore */ }
    }
  });
  // Malformed request line / TLS sent to the plain port: answer if we still can,
  // otherwise drop quietly. Without this listener Node throws on the socket.
  server.on("clientError", (_err, socket) => {
    try {
      if ((socket as net.Socket).writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      else socket.destroy();
    } catch { /* ignore */ }
  });
  const handleHttp = (req: http.IncomingMessage, res: http.ServerResponse) => {
    // Plain HTTP forward. req.url may be absolute (proxy request) or relative.
    let target: URL;
    try {
      target = new URL(req.url && /^https?:\/\//i.test(req.url) ? req.url : `http://${req.headers.host}${req.url}`);
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("bad request");
      return;
    }
    const host = target.hostname;
    const port = Number(target.port || (target.protocol === "https:" ? 443 : 80));
    const session = readProxySession();
    const agent = session?.agent || "unknown";
    const sid = session?.session || "";
    const d = decide(host, port, agent);
    writeReceipt(cfg, host, port, agent, sid, d, "proxy");

    if (d.effect === "block") {
      // HTTP header values must be printable ASCII (RFC 7230 §3.2.6); strip anything else.
      const safeReason = d.reason.replace(/[^\x20-\x7e]/g, "?");
      res.writeHead(403, { "Content-Type": "text/plain", "X-Wrapbox-Reason": safeReason });
      res.end(`Wrapbox proxy: blocked - ${d.reason}\n`);
      return;
    }

    // Allow: forward. Strip hop-by-hop headers per RFC 7230 §6.1.
    const outgoingHeaders = { ...req.headers } as Record<string, any>;
    delete outgoingHeaders["proxy-connection"];
    delete outgoingHeaders["proxy-authorization"];
    const outReq = http.request({
      host,
      port,
      method: req.method,
      path: target.pathname + target.search,
      headers: outgoingHeaders,
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    });
    outReq.on("error", (err) => {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end(`upstream error: ${err.message}\n`);
    });
    req.pipe(outReq);
  };

  server.on("connect", (req, clientSocket, head) => {
    // Attach FIRST: a browser that is refused a tunnel typically resets the
    // socket immediately, and that reset must not reach the process as an
    // unhandled 'error'.
    clientSocket.on("error", () => { /* client reset the tunnel */ });
    try { handleConnect(req, clientSocket, head); } catch (err) {
      console.error(`proxy connect: ${(err as Error).message}`);
      try { clientSocket.destroy(); } catch { /* ignore */ }
    }
  });
  const handleConnect = (req: http.IncomingMessage, clientSocket: Duplex, head: Buffer) => {
    // HTTPS tunnel — never MITM. Inspect the CONNECT target host string only.
    const { host, port } = parseHostPort(req.url || "", 443);
    const session = readProxySession();
    const agent = session?.agent || "unknown";
    const sid = session?.session || "";
    const d = decide(host, port, agent);
    writeReceipt(cfg, host, port, agent, sid, d, "proxy");

    if (d.effect === "block") {
      const safeReason = d.reason.replace(/[^\x20-\x7e]/g, "?");
      try {
        clientSocket.write(`HTTP/1.1 403 Forbidden\r\nX-Wrapbox-Reason: ${safeReason}\r\n\r\n`);
        clientSocket.end();
      } catch { /* client already gone — the receipt is already written */ }
      return;
    }
    const upstream = net.connect(port, host);
    upstream.on("error", () => {
      try {
        if ((clientSocket as net.Socket).writable) clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
        else clientSocket.destroy();
      } catch { /* ignore */ }
    });
    upstream.on("connect", () => {
      try {
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head && head.length) upstream.write(head);
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
      } catch { try { upstream.destroy(); } catch { /* ignore */ } }
    });
    clientSocket.on("close", () => { try { upstream.destroy(); } catch { /* ignore */ } });
  };

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });

  const stop = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return { server, port, stop };
}
