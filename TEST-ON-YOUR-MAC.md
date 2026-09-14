# Test Wrapbox end-to-end on your Mac (about 15 minutes)

Prereqs: node 20+ and Xcode command-line tools (you already have both).
Everything runs under `/tmp/wrapbox-demo` — nothing touches your real config.
When you're done, one `rm -rf /tmp/wrapbox-demo` cleans up.

## 0. One-time setup (Terminal, ~5 min)

```sh
cd ~/Music/wrapbox-prototype

# Install everything (first run only).
(cd control-plane && npm install)
(cd packages/policy-core && npm install && npm run build)
(cd runtime && npm install)
npm install                    # the prototype UI
```

Open **three terminal tabs**. You'll leave two of them running.

## 1. Start the Control Plane (tab A, leave running)

```sh
cd ~/Music/wrapbox-prototype/control-plane
DB_PATH=/tmp/wrapbox-demo/cp.db PORT=4100 npm run dev
```

Wait for: `🔒 Wrapbox Control Plane running on http://localhost:4100`.

## 2. Enroll the daemon (tab B)

```sh
mkdir -p /tmp/wrapbox-demo
export WRAPBOX_HOME=/tmp/wrapbox-demo/home
export CP=http://localhost:4100
export A='X-Admin-Key: wbx-admin-dev'

# Create your test org.
ORG=$(curl -s -H "$A" -H 'content-type: application/json' \
  -d '{"name":"TestCo","domain":"testco.example"}' \
  $CP/v1/orgs | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
echo "ORG=$ORG" > /tmp/wrapbox-demo/env.sh

# Mint a single-use enrollment token.
TOK=$(curl -s -H "$A" -H 'content-type: application/json' \
  -d "{\"org_id\":\"$ORG\"}" $CP/v1/enroll-tokens \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

# Enroll this laptop.
cd ~/Music/wrapbox-prototype/runtime
npx tsx src/cli.ts enroll --server $CP --org "$ORG" --token "$TOK" --no-wrap

# Write starter rules: block .env reads, block openai.com egress, allow the rest.
curl -s -H "$A" -H 'content-type: application/json' \
  -d "{\"org_id\":\"$ORG\",\"name\":\"Block .env reads\",\"effect\":\"block\",\"priority\":100,\"condition\":{\"field\":\"tool_input.path\",\"op\":\"contains\",\"value\":\".env\"}}" \
  $CP/v1/rules >/dev/null
curl -s -H "$A" -H 'content-type: application/json' \
  -d "{\"org_id\":\"$ORG\",\"name\":\"Block openai.com egress\",\"effect\":\"block\",\"priority\":90,\"condition\":{\"field\":\"tool_input.host\",\"op\":\"contains\",\"value\":\"openai.com\"}}" \
  $CP/v1/rules >/dev/null
curl -s -H "$A" -H 'content-type: application/json' \
  -d "{\"org_id\":\"$ORG\",\"name\":\"Allow everything else\",\"effect\":\"allow\",\"priority\":10}" \
  $CP/v1/rules >/dev/null

# Pull the rules to this device.
npx tsx src/cli.ts pull
```

## 3. See every AI agent on your Mac (discovery)

```sh
cd ~/Music/wrapbox-prototype/runtime
npx tsx src/cli.ts discover
```

You'll get a table of registry-known agents actually installed on this machine
(claude-code, codex-cli, cursor, chatgpt-desktop, mcp-servers, etc.).

Push the inventory to the Control Plane:

```sh
npx tsx src/cli.ts scan
```

Verify the server has them:

```sh
curl -s -H "$A" "$CP/v1/devices?org_id=$ORG" | python3 -m json.tool
curl -s -H "$A" "$CP/v1/agents?org_id=$ORG" | python3 -m json.tool
```

## 4. Prove the kernel actually blocks `.env` (Seatbelt floor)

```sh
mkdir -p /tmp/wrapbox-demo/proj
echo "FAKE_KEY=only-for-testing" > /tmp/wrapbox-demo/proj/.env
echo "hello" > /tmp/wrapbox-demo/proj/normal.txt

cd /tmp/wrapbox-demo/proj

# Try to read .env from inside the sandbox — the KERNEL refuses.
npx tsx ~/Music/wrapbox-prototype/runtime/src/cli.ts run -- /bin/cat .env
# → cat: .env: Operation not permitted
# → wrapboxd: session ... exited 1; 1 violation receipt(s) written

# Same read outside the sandbox — succeeds (proves it's the sandbox, not perms).
/bin/cat .env

# Normal files still work inside the sandbox.
npx tsx ~/Music/wrapbox-prototype/runtime/src/cli.ts run -- /bin/cat normal.txt
# → hello

# Even python can't escape — this is the kernel, not a script check.
npx tsx ~/Music/wrapbox-prototype/runtime/src/cli.ts run -- python3 -c "open('.env').read()"
# → PermissionError: [Errno 1] Operation not permitted
```

## 5. Prove the universal proxy blocks by network destination (any agent)

```sh
cd ~/Music/wrapbox-prototype/runtime

# Start the daemon; it starts the proxy on 127.0.0.1:4180.
npx tsx src/cli.ts daemon &
DAEMON_PID=$!
sleep 2

# Unattributed process reaching a MODEL API is blocked even if there's no
# specific rule — the model-API guard fires. This is the "any agent" line.
curl -sx http://127.0.0.1:4180 -o /dev/null -w 'HTTP %{http_code}\n' \
  http://api.anthropic.com/
# → HTTP 403

# openai.com — the block rule fires; reason keeps the rule name AND the guard.
curl -sx http://127.0.0.1:4180 -o /dev/null -w 'HTTP %{http_code}\n' \
  http://api.openai.com/v1/models
# → HTTP 403

# HTTPS is inspected via CONNECT (no TLS interception).
curl -sx http://127.0.0.1:4180 -o /dev/null -w 'HTTP %{http_code}\n' \
  https://api.openai.com/
# → curl reports "CONNECT tunnel failed, response 403"

# Stop the daemon when you're done poking.
kill $DAEMON_PID
```

Every one of those attempts wrote a signed receipt:

```sh
tail -5 $WRAPBOX_HOME/receipts.jsonl | python3 -m json.tool
```

## 6. Prove the evidence chain is tamper-evident

```sh
cd ~/Music/wrapbox-prototype/runtime

# Local verify: recompute every signature + chain link.
npx tsx src/cli.ts verify
# → Chain OK: N receipt(s), verified through seq N.

# Ship the chain to the server.
npx tsx src/cli.ts sync

# Server auditor endpoint — this is what a customer's auditor would run.
DEV=$(python3 -c "import json;print(json.load(open('$WRAPBOX_HOME/config.json'))['device_id'])")
curl -s -H "$A" "$CP/v1/evidence/verify?org_id=$ORG&device_id=$DEV" \
  | python3 -m json.tool
# → { "chain_ok": true, "verified_through_seq": N, "breaks": [] }

# Tamper: change one byte in a middle receipt.
python3 -c "
import sys
p = '$WRAPBOX_HOME/receipts.jsonl'
lines = open(p).readlines()
if len(lines) >= 3:
    lines[len(lines)//2] = lines[len(lines)//2].replace('block', 'aLLoW', 1)
    open(p,'w').write(''.join(lines))
"
npx tsx src/cli.ts verify
# → Reports the break by seq number.
```

## 6b. Govern browser-based AI (ChatGPT web, Gemini web, Claude.ai)

A browser agent runs on the vendor's servers, so it can never read a file on
the laptop — the kernel test above does not apply to it. What Wrapbox governs
for browser agents is the **network**: which AI sites the browser may reach,
with every attempt recorded. (This is the "employees must not paste our code
into unapproved AI tools" control.)

Add website rules — block two AI sites, approve one:

```sh
for spec in "Block ChatGPT website|block|150|chatgpt.com" \
            "Block Gemini website|block|150|gemini.google.com" \
            "Allow Claude website (approved)|allow|140|claude.ai"; do
  IFS='|' read -r name eff pri host <<< "$spec"
  curl -s -H "$A" -H 'content-type: application/json' \
    -d "{\"org_id\":\"$ORG\",\"name\":\"$name\",\"effect\":\"$eff\",\"priority\":$pri,\"condition\":{\"field\":\"tool_input.host\",\"op\":\"contains\",\"value\":\"$host\"}}" \
    $CP/v1/rules >/dev/null && echo "+ $name"
done
cd ~/Music/wrapbox-prototype/runtime && npx tsx src/cli.ts pull
```

With the daemon running (step 5), open a Chrome window that routes through the
Wrapbox proxy. It uses its own profile folder, so your normal Chrome is untouched:

```sh
open -na "Google Chrome" --args \
  --proxy-server="http://127.0.0.1:4180" \
  --user-data-dir=/tmp/wrapbox-demo/chrome-profile \
  --no-first-run "https://chatgpt.com"
```

| Visit | Result |
|---|---|
| chatgpt.com | `ERR_TUNNEL_CONNECTION_FAILED` — Wrapbox refused the tunnel |
| gemini.google.com | same — blocked |
| claude.ai | loads normally — your rule approved it |
| google.com | loads normally — catch-all allow |

Every attempt is a signed receipt (`enforcement: "proxy"`). Chrome retries a
blocked site aggressively, so expect dozens of BLOCK receipts for one visit:

```sh
grep '"target":"chatgpt.com' $WRAPBOX_HOME/receipts.jsonl | wc -l
```

Honest limit: this is the browser you launched through the proxy. A browser the
employee opens by clicking its icon is not routed until the proxy is set
system-wide (an MDM-pushed network profile) — that is the production
deployment path, documented in `docs/runtime/WRAPBOXD.md`, not this test.

## 7. See it all in the browser (v2 workspace)

```sh
cd ~/Music/wrapbox-prototype
npm run dev
```

Open http://localhost:5173/ . In the v2 workspace you'll see an
"Connect a Control Plane" onboarding card. Go to **Settings → Control Plane**:

- Server URL: `http://localhost:4100`
- Admin key: `wbx-admin-dev`
- Org id: paste the `$ORG` value from tab B (`echo $ORG`)

Click **Test connection** → green. The Fleet and Evidence pages populate with
your device, the 11 discovered agents, the rules, and every block receipt from
steps 4–6.

## What each test is proving

| Step | What it proves |
|------|----------------|
| 3    | wrapboxd sees every known AI agent on your Mac and reports the inventory to the server. |
| 4    | The macOS kernel itself refuses the read — not a script that could be edited. |
| 5    | One local proxy governs the network for ANY agent by destination — the model-API guard blocks unattributed processes even under permissive policies. |
| 6    | Every decision is a signed receipt in a chain; tampering is named, not silent. |
| 7    | Admins see it live in the browser. |

## Clean up

```sh
rm -rf /tmp/wrapbox-demo
# (control-plane and vite tabs: Ctrl-C)
```

## What this build does NOT yet do (honestly)

- **GUI apps launched by double-click** aren't auto-wrapped — needs Apple's
  Endpoint Security entitlement (1–3 month application). The kernel sandbox +
  proxy still work when you launch them from a wrapped terminal.
- **Domain-level MITM inspection of TLS content** — we allow/deny by hostname,
  not by request body. Data-in-flight inspection is DLP, a separate product.
- **Linux and Windows** — Step 3 and Step 4.
- **Gateway** in front of your cloud data (for ChatGPT web, Copilot cloud,
  GitHub agents that never touch a laptop) — Step 6.

All four are on the roadmap in `docs/runtime/WRAPBOXD.md`.
