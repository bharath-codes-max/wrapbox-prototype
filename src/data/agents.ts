export type Decision = "ALLOW" | "CONSTRAIN" | "REVIEW" | "BLOCK";
export type CategoryId = "ide" | "cli" | "cloud" | "custom" | "mcp" | "saas" | "browser" | "a2a";
export type Assurance =
  | "observe-only"
  | "hook-enforced"
  | "gateway-enforced"
  | "endpoint-enforced"
  | "resource-verified";

export type Adapter =
  | "claude"
  | "codex"
  | "gemini"
  | "copilot"
  | "cursor"
  | "runtime"
  | "mcp"
  | "sdk-py"
  | "sdk-ts"
  | "adk"
  | "cloud"
  | "connector"
  | "browser"
  | "a2a";

export type Surface = "terminal" | "ide" | "github" | "graph" | "chat" | "crm" | "browser" | "delegation";

export interface Category {
  id: CategoryId;
  n: number;
  name: string;
  plain: string;
  method: string;
  timing: "NOW" | "NEXT" | "LATER";
  why: string;
  scenario: string;
}

export interface Method {
  id: string;
  name: string;
  assurance: Assurance;
  desc: string;
  recommended?: boolean;
}

export interface Agent {
  id: string;
  name: string;
  vendor: string;
  category: CategoryId;
  logo: string;
  bleed?: boolean;
  adapter: Adapter;
  surface: Surface;
  file: string;
  fileNote: string;
  lang: "json" | "ts" | "py" | "yaml" | "bash" | "toml";
  snippet: string;
  install: string;
  hookEvents: string[];
  docs: string;
  scenario?: string;
  connected: boolean;
  owner: string;
  env: string;
}

export const ASSURANCE: Record<Assurance, { rank: number; label: string; desc: string }> = {
  "observe-only": { rank: 1, label: "Observe-only", desc: "Wrapbox sees actions but cannot stop them." },
  "hook-enforced": {
    rank: 2,
    label: "Hook-enforced",
    desc: "The agent's official pre-execution hook asks Wrapbox first. Strong UX; only as strong as the host's hook.",
  },
  "gateway-enforced": {
    rank: 3,
    label: "Gateway-enforced",
    desc: "Traffic must pass through the Wrapbox MCP / API gateway. Bypass requires a different network path.",
  },
  "endpoint-enforced": {
    rank: 4,
    label: "Endpoint-enforced",
    desc: "Wrapbox runtime mediates file, process and network primitives below the agent.",
  },
  "resource-verified": {
    rank: 5,
    label: "Resource-verified",
    desc: "The target service itself verifies a signed permit. Skipping every hook still cannot execute.",
  },
};

export const CATEGORIES: Category[] = [
  {
    id: "ide",
    n: 1,
    name: "IDE coding agents",
    plain: "An AI agent inside a code editor that can read files, edit code, run the terminal and call tools.",
    method: "Official hooks + endpoint runtime",
    timing: "NOW",
    why: "Sits next to source code, local credentials and the developer's terminal.",
    scenario: "ide",
  },
  {
    id: "cli",
    n: 2,
    name: "CLI coding agents",
    plain: "A coding agent that lives in the terminal, next to shell, Git and cloud CLIs.",
    method: "Pre-tool hook + process gate",
    timing: "NOW",
    why: "Highest local privilege. One wrong instruction becomes a real kubectl or rm.",
    scenario: "cli",
  },
  {
    id: "cloud",
    n: 3,
    name: "Cloud / background agents",
    plain: "Agents that work unattended in a hosted runner and open pull requests while nobody watches each step.",
    method: "MCP/API gateway + task-scoped identity",
    timing: "NEXT",
    why: "Unattended execution with repo tokens and tools. Separate code autonomy from production authority.",
    scenario: "cloud",
  },
  {
    id: "custom",
    n: 4,
    name: "Custom enterprise agents",
    plain: "Agents your company builds itself — claims, procurement, IT access — on an agent framework.",
    method: "Wrapbox SDK + service-side permit",
    timing: "NOW",
    why: "You own the code, so Wrapbox can be the mandatory call before every executor.",
    scenario: "custom",
  },
  {
    id: "mcp",
    n: 5,
    name: "MCP-enabled ecosystems",
    plain: "MCP is how agents call tools. Point every client at Wrapbox and it forwards only approved calls.",
    method: "Wrapbox MCP Gateway",
    timing: "NOW",
    why: "One chokepoint covers many agents and many tools — Stripe, GitHub, databases, internal servers.",
    scenario: "mcp-stripe",
  },
  {
    id: "saas",
    n: 6,
    name: "Enterprise SaaS / low-code",
    plain: "Agents built inside business platforms that update CRM records, issue credits and message customers.",
    method: "Custom connector / API proxy",
    timing: "NEXT",
    why: "Platforms govern themselves. Wrapbox brings one policy across all of them.",
    scenario: "saas",
  },
  {
    id: "browser",
    n: 7,
    name: "Browser / computer-use",
    plain: "Agents that click, type and submit forms in a real browser, often with a human's logged-in session.",
    method: "Controlled executor + semantic actions",
    timing: "NEXT",
    why: "A hidden line on a web page can turn into a real transfer unless the final click is authorized.",
    scenario: "browser",
  },
  {
    id: "a2a",
    n: 8,
    name: "Multi-agent / A2A",
    plain: "Agents that delegate work to other agents. The question is how much authority travels with the task.",
    method: "Delegation SDK + attenuated tokens",
    timing: "LATER",
    why: "A child agent must never receive more authority than its parent granted.",
    scenario: "a2a",
  },
];

export const METHODS: Record<CategoryId, Method[]> = {
  ide: [
    { id: "hook", name: "Official agent hooks", assurance: "hook-enforced", desc: "Commit a hooks file to the repo or push it via MDM. Fastest to roll out.", recommended: true },
    { id: "runtime", name: "Hooks + endpoint runtime", assurance: "endpoint-enforced", desc: "Also mediates file/process/network below the agent — catches python reading .env." },
    { id: "mcp", name: "MCP gateway only", assurance: "gateway-enforced", desc: "Route the IDE's MCP tools through Wrapbox. Doesn't cover local shell." },
  ],
  cli: [
    { id: "hook", name: "Pre-tool hook adapter", assurance: "hook-enforced", desc: "Managed hook fires before every tool call, including MCP and subagents.", recommended: true },
    { id: "runtime", name: "Hook + process/filesystem gate", assurance: "endpoint-enforced", desc: "Host-independent backstop for indirect commands." },
    { id: "launcher", name: "Enterprise launcher", assurance: "hook-enforced", desc: "Injects identity, workspace and managed policy at launch." },
  ],
  cloud: [
    { id: "gateway", name: "MCP / API gateway + task identity", assurance: "gateway-enforced", desc: "All tool egress of the hosted runner goes through Wrapbox with a task-scoped token.", recommended: true },
    { id: "app", name: "GitHub App + status checks", assurance: "observe-only", desc: "Attaches decisions and evidence to every PR." },
  ],
  custom: [
    { id: "sdk", name: "Wrapbox SDK guard", assurance: "hook-enforced", desc: "Wrap each tool executor. Richest context, best developer experience." },
    { id: "verified", name: "SDK + service-side permit", assurance: "resource-verified", desc: "The payment/API service verifies the permit. Bypassing the SDK grants nothing.", recommended: true },
    { id: "gateway", name: "API gateway", assurance: "gateway-enforced", desc: "Route outbound tool calls through a Wrapbox sidecar." },
  ],
  mcp: [
    { id: "gateway", name: "Wrapbox MCP Gateway", assurance: "gateway-enforced", desc: "Clients point at mcp.wrapbox.ai. Approved calls are forwarded to the real server.", recommended: true },
    { id: "middleware", name: "Server middleware", assurance: "resource-verified", desc: "If you own the MCP server, verify permits inside each tool handler." },
  ],
  saas: [
    { id: "connector", name: "Custom connector / action", assurance: "gateway-enforced", desc: "The platform's agent calls Wrapbox-authorized actions.", recommended: true },
    { id: "export", name: "Evidence export only", assurance: "observe-only", desc: "Mirror platform decisions into Wrapbox, SIEM and GRC." },
  ],
  browser: [
    { id: "executor", name: "Controlled executor", assurance: "endpoint-enforced", desc: "Every consequential click is re-normalized and authorized before dispatch.", recommended: true },
    { id: "wrapper", name: "Action wrapper", assurance: "hook-enforced", desc: "Wrap the framework's action registry." },
  ],
  a2a: [
    { id: "delegation", name: "Delegation SDK + A2A gateway", assurance: "gateway-enforced", desc: "Authority is attenuated on every handoff and the root human is always recoverable.", recommended: true },
  ],
};

const ORG = "wrapbox";

export const AGENTS: Agent[] = [
  // 1 · IDE
  {
    id: "cursor",
    name: "Cursor Agent",
    vendor: "Anysphere",
    category: "ide",
    logo: "cursor",
    adapter: "cursor",
    surface: "ide",
    file: ".cursor/hooks.json",
    fileNote: "Commit to the repo, or distribute via Cursor Team dashboard / MDM",
    lang: "json",
    install: `npx @wrapbox/cli install cursor --org ${ORG}`,
    hookEvents: ["preToolUse", "beforeReadFile", "beforeShellExecution", "beforeMCPExecution"],
    docs: "cursor.com/docs/hooks",
    snippet: `{
  "version": 1,
  "hooks": {
    "preToolUse":           [{ "command": "wrapbox hook cursor", "failClosed": true }],
    "beforeReadFile":       [{ "command": "wrapbox hook cursor", "failClosed": true }],
    "beforeShellExecution": [{ "command": "wrapbox hook cursor", "failClosed": true }],
    "beforeMCPExecution":   [{ "command": "wrapbox hook cursor", "failClosed": true }]
  }
}`,
    connected: true,
    owner: "Platform team",
    env: "dev workstations",
  },
  {
    id: "copilot-ide",
    name: "GitHub Copilot agent mode",
    vendor: "GitHub · VS Code",
    category: "ide",
    logo: "githubcopilot",
    adapter: "copilot",
    surface: "ide",
    file: ".github/hooks/wrapbox.json",
    fileNote: "Picked up by Copilot agent mode in VS Code and by Copilot CLI",
    lang: "json",
    install: `npx @wrapbox/cli install copilot --org ${ORG}`,
    hookEvents: ["preToolUse", "postToolUse"],
    docs: "docs.github.com/copilot/customizing-copilot/hooks",
    snippet: `{
  "version": 1,
  "hooks": {
    "preToolUse": [
      {
        "type": "command",
        "bash": "wrapbox hook copilot",
        "powershell": "wrapbox.exe hook copilot",
        "timeoutSec": 10
      }
    ]
  }
}`,
    connected: true,
    owner: "Platform team",
    env: "dev workstations",
  },
  {
    id: "junie",
    name: "JetBrains Junie",
    vendor: "JetBrains",
    category: "ide",
    logo: "junie",
    adapter: "runtime",
    surface: "ide",
    file: ".junie/mcp/mcp.json",
    fileNote: "Junie tools via the MCP gateway; local effects via the Wrapbox endpoint runtime",
    lang: "json",
    install: `brew install wrapbox/tap/wrapbox && wrapbox runtime enable --ide jetbrains --org ${ORG}`,
    hookEvents: ["file.open", "process.spawn", "net.connect", "tools/call"],
    docs: "jetbrains.com/help/junie/model-context-protocol-mcp.html",
    snippet: `{
  "mcpServers": {
    "wrapbox-gateway": {
      "url": "https://mcp.wrapbox.ai",
      "headers": { "Authorization": "Bearer \${WRAPBOX_TOKEN}" }
    }
  }
}`,
    connected: false,
    owner: "Platform team",
    env: "dev workstations",
  },
  // 2 · CLI
  {
    id: "claude-code",
    name: "Claude Code",
    vendor: "Anthropic",
    category: "cli",
    logo: "claudecode",
    adapter: "claude",
    surface: "terminal",
    file: ".claude/settings.json",
    fileNote: "Push org-wide as managed settings · 90s timeout lets a REVIEW hold while the approver decides",
    lang: "json",
    install: `npx @wrapbox/cli install claude-code --org ${ORG}`,
    hookEvents: ["PreToolUse", "UserPromptSubmit", "PostToolUse", "SessionStart"],
    docs: "code.claude.com/docs/en/hooks",
    snippet: `{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "wrapbox hook claude-code", "timeout": 15 }] }
    ],
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [{ "type": "command", "command": "wrapbox hook claude-code", "timeout": 90 }]
      }
    ]
  }
}`,
    connected: true,
    owner: "Platform team",
    env: "dev workstations",
  },
  {
    id: "codex-cli",
    name: "Codex CLI",
    vendor: "OpenAI",
    category: "cli",
    logo: "codex",
    adapter: "codex",
    surface: "terminal",
    file: "~/.codex/hooks.json",
    fileNote: "Per-user, or shipped by the Wrapbox installer on every laptop",
    lang: "json",
    install: `npx @wrapbox/cli install codex --org ${ORG}`,
    hookEvents: ["PreToolUse", "PostToolUse", "SessionStart"],
    docs: "developers.openai.com/codex/hooks",
    snippet: `{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [{ "type": "command", "command": "wrapbox hook codex", "timeout": 15 }]
      }
    ]
  }
}`,
    connected: true,
    owner: "Platform team",
    env: "dev workstations",
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    vendor: "Google",
    category: "cli",
    logo: "geminicli",
    adapter: "gemini",
    surface: "terminal",
    file: ".gemini/settings.json",
    fileNote: "Project or user settings; BeforeTool matches built-in and MCP tools",
    lang: "json",
    install: `npx @wrapbox/cli install gemini --org ${ORG}`,
    hookEvents: ["BeforeTool", "AfterTool"],
    docs: "geminicli.com/docs/hooks",
    snippet: `{
  "hooks": {
    "BeforeTool": [
      {
        "matcher": "*",
        "hooks": [{ "type": "command", "command": "wrapbox hook gemini", "timeout": 5000 }]
      }
    ]
  }
}`,
    connected: false,
    owner: "Platform team",
    env: "dev workstations",
  },
  {
    id: "copilot-cli",
    name: "GitHub Copilot CLI",
    vendor: "GitHub",
    category: "cli",
    logo: "githubcopilot",
    adapter: "copilot",
    surface: "terminal",
    file: ".github/hooks/wrapbox.json",
    fileNote: "Same file as Copilot agent mode — one install covers both",
    lang: "json",
    install: `npx @wrapbox/cli install copilot --org ${ORG}`,
    hookEvents: ["preToolUse", "postToolUse", "sessionStart"],
    docs: "docs.github.com/copilot/how-tos/copilot-cli",
    snippet: `{
  "version": 1,
  "hooks": {
    "preToolUse": [
      { "type": "command", "bash": "wrapbox hook copilot", "timeoutSec": 10 }
    ]
  }
}`,
    connected: false,
    owner: "Platform team",
    env: "dev workstations",
  },
  // 3 · Cloud
  {
    id: "copilot-cloud",
    name: "Copilot cloud agent",
    vendor: "GitHub",
    category: "cloud",
    logo: "githubcopilot",
    adapter: "cloud",
    surface: "github",
    file: "Repo → Settings → Copilot → Coding agent → MCP configuration",
    fileNote: "Secrets prefixed COPILOT_MCP_ are injected into the ephemeral runner only",
    lang: "json",
    install: `gh extension install wrapbox/gh-wrapbox && gh wrapbox connect --repo wrapbox/billing`,
    hookEvents: ["tools/call", "git push", "check_run"],
    docs: "docs.github.com/copilot/concepts/coding-agent",
    snippet: `{
  "mcpServers": {
    "wrapbox": {
      "type": "http",
      "url": "https://mcp.wrapbox.ai",
      "headers": { "Authorization": "Bearer $COPILOT_MCP_WRAPBOX_TOKEN" },
      "tools": ["*"]
    }
  }
}`,
    connected: true,
    owner: "Billing squad",
    env: "ephemeral runner",
  },
  {
    id: "codex-cloud",
    name: "Codex cloud tasks",
    vendor: "OpenAI",
    category: "cloud",
    logo: "codex",
    adapter: "cloud",
    surface: "github",
    file: "Codex → Environments → Setup script",
    fileNote: "Task-scoped token expires with the task; egress goes through Wrapbox",
    lang: "bash",
    install: `wrapbox tokens create --task-scoped --for codex-cloud`,
    hookEvents: ["PreToolUse", "egress", "tools/call"],
    docs: "developers.openai.com/codex/cloud",
    snippet: `# Codex cloud → Environment → Setup script
npm i -g @wrapbox/cli
wrapbox login --task-token "$WRAPBOX_TASK_TOKEN"   # expires with the task
wrapbox install codex --egress-via https://egress.wrapbox.ai`,
    connected: false,
    owner: "Billing squad",
    env: "ephemeral runner",
  },
  // 4 · Custom
  {
    id: "langgraph",
    name: "LangGraph claims agent",
    vendor: "LangChain",
    category: "custom",
    logo: "langgraph",
    adapter: "sdk-ts",
    surface: "graph",
    file: "src/claims/graph.ts",
    fileNote: "REVIEW decisions surface as a LangGraph interrupt() and resume on approval",
    lang: "ts",
    install: `npm i @wrapbox/sdk`,
    hookEvents: ["guard()", "interrupt", "resume"],
    docs: "langchain-ai.github.io/langgraph/concepts/human_in_the_loop",
    snippet: `import { wrapbox } from "@wrapbox/sdk";
import { ToolNode } from "@langchain/langgraph/prebuilt";

// Every call is checked against wrapbox.yaml before it executes.
const payClaim = wrapbox.guard("claims.payout", async (args) => {
  return paymentService.pay(args, { permit: args.permit }); // service verifies
});

export const tools = new ToolNode([payClaim, fetchPolicy, readClaimDocs]);`,
    connected: true,
    owner: "Claims engineering",
    env: "production",
  },
  {
    id: "openai-agents",
    name: "OpenAI Agents SDK",
    vendor: "OpenAI",
    category: "custom",
    logo: "openai",
    adapter: "sdk-py",
    surface: "graph",
    file: "agents/claims.py",
    fileNote: "Decorate the function tool; the executor runs only with a valid permit",
    lang: "py",
    install: `pip install wrapbox`,
    hookEvents: ["@guard", "tool_input_guardrail"],
    docs: "openai.github.io/openai-agents-python/guardrails",
    snippet: `from agents import Agent, function_tool
from wrapbox import guard

@function_tool
@guard("claims.payout", resource=lambda a: f"claim:{a['claim_id']}")
def pay_claim(claim_id: str, amount: int) -> str:
    return payments.pay(claim_id, amount)   # runs only with a valid permit

claims_agent = Agent(name="claims-agent-prod", tools=[pay_claim])`,
    connected: false,
    owner: "Claims engineering",
    env: "production",
  },
  {
    id: "google-adk",
    name: "Google ADK",
    vendor: "Google",
    category: "custom",
    logo: "gemini",
    adapter: "adk",
    surface: "graph",
    file: "procurement/agent.py",
    fileNote: "ADK's before_tool_callback returns Wrapbox's decision",
    lang: "py",
    install: `pip install "wrapbox[adk]"`,
    hookEvents: ["before_tool_callback"],
    docs: "google.github.io/adk-docs/callbacks",
    snippet: `from google.adk.agents import Agent
from wrapbox.adk import before_tool_callback

agent = Agent(
    name="claims-agent-prod",
    model="gemini-2.5-pro",
    tools=[pay_claim, fetch_policy],
    before_tool_callback=before_tool_callback(org="${ORG}"),  # ALLOW / REVIEW / BLOCK
)`,
    connected: false,
    owner: "Procurement",
    env: "production",
  },
  // 5 · MCP
  {
    id: "stripe-mcp",
    name: "Stripe MCP",
    vendor: "Stripe",
    category: "mcp",
    logo: "stripe",
    adapter: "mcp",
    surface: "chat",
    file: "mcp.json",
    fileNote: "Replace https://mcp.stripe.com with the Wrapbox URL — works in any MCP client",
    lang: "json",
    install: `wrapbox mcp add stripe --upstream https://mcp.stripe.com`,
    hookEvents: ["tools/call", "tools/list"],
    docs: "modelcontextprotocol.io/specification",
    scenario: "mcp-stripe",
    snippet: `{
  "mcpServers": {
    "stripe": {
      "url": "https://mcp.wrapbox.ai/stripe",
      "headers": { "Authorization": "Bearer \${WRAPBOX_TOKEN}" }
    }
  }
}`,
    connected: true,
    owner: "Payments",
    env: "production",
  },
  {
    id: "github-mcp",
    name: "GitHub MCP server",
    vendor: "GitHub",
    category: "mcp",
    logo: "github_light",
    adapter: "mcp",
    surface: "chat",
    file: "mcp.json",
    fileNote: "Replace api.githubcopilot.com/mcp with the Wrapbox URL",
    lang: "json",
    install: `wrapbox mcp add github --upstream https://api.githubcopilot.com/mcp/`,
    hookEvents: ["tools/call"],
    docs: "github.com/github/github-mcp-server",
    scenario: "mcp-github",
    snippet: `{
  "mcpServers": {
    "github": {
      "url": "https://mcp.wrapbox.ai/github",
      "headers": { "Authorization": "Bearer \${WRAPBOX_TOKEN}" }
    }
  }
}`,
    connected: true,
    owner: "Platform team",
    env: "production",
  },
  {
    id: "postgres-mcp",
    name: "Postgres MCP",
    vendor: "PostgreSQL",
    category: "mcp",
    logo: "postgresql",
    adapter: "mcp",
    surface: "chat",
    file: "mcp.json",
    fileNote: "Postgres MCP Pro behind Wrapbox · SQL is classified (SELECT / DML / DDL) and PII columns masked",
    lang: "json",
    install: `wrapbox mcp add postgres-prod --upstream stdio:"postgres-mcp --access-mode=unrestricted"`,
    hookEvents: ["tools/call"],
    docs: "github.com/crystaldba/postgres-mcp",
    scenario: "mcp-postgres",
    snippet: `{
  "mcpServers": {
    "postgres-prod": {
      "url": "https://mcp.wrapbox.ai/postgres-prod",
      "headers": { "Authorization": "Bearer \${WRAPBOX_TOKEN}" }
    }
  }
}`,
    connected: true,
    owner: "Data platform",
    env: "production",
  },
  {
    id: "razorpay-mcp",
    name: "Razorpay MCP",
    vendor: "Razorpay",
    category: "mcp",
    logo: "razorpay",
    adapter: "mcp",
    surface: "chat",
    file: "mcp.json",
    fileNote: "Payment gateway wrapped as an MCP server behind Wrapbox",
    lang: "json",
    install: `wrapbox mcp add razorpay --upstream https://mcp.razorpay.com/mcp`,
    hookEvents: ["tools/call"],
    docs: "razorpay.com/docs/mcp-server",
    scenario: "mcp-razorpay",
    snippet: `{
  "mcpServers": {
    "razorpay": {
      "url": "https://mcp.wrapbox.ai/razorpay",
      "headers": { "Authorization": "Bearer \${WRAPBOX_TOKEN}" }
    }
  }
}`,
    connected: false,
    owner: "Payments",
    env: "production",
  },
  // 6 · SaaS
  {
    id: "agentforce",
    name: "Salesforce Agentforce",
    vendor: "Salesforce",
    category: "saas",
    logo: "salesforce",
    adapter: "connector",
    surface: "crm",
    file: "Setup → Named Credential + Agent Action",
    fileNote: "Agentforce calls the Wrapbox-authorized action instead of writing directly",
    lang: "yaml",
    install: `wrapbox connectors add salesforce --org ${ORG}`,
    hookEvents: ["Agent Action", "External Service"],
    docs: "help.salesforce.com — Agentforce actions",
    snippet: `# Setup → Named Credentials → New
named_credential:
  label: Wrapbox
  url: https://api.wrapbox.ai/v1
  header: "Authorization: Bearer {!$Credential.Wrapbox.token}"

# Agentforce Builder → Topic: Renewals → Add Action
agent_action:
  type: external_service
  service: Wrapbox.authorize_and_execute
  effect: crm.apply_discount      # answers ALLOW / REVIEW / BLOCK`,
    connected: true,
    owner: "Revenue ops",
    env: "production",
  },
  {
    id: "copilot-studio",
    name: "Microsoft Copilot Studio",
    vendor: "Microsoft",
    category: "saas",
    logo: "copilotstudio",
    adapter: "connector",
    surface: "crm",
    file: "wrapbox-connector.swagger.yaml",
    fileNote: "Import as a custom connector; add the actions as agent tools",
    lang: "yaml",
    install: `wrapbox connectors export --format power-platform > wrapbox-connector.swagger.yaml`,
    hookEvents: ["Custom connector action"],
    docs: "learn.microsoft.com/microsoft-copilot-studio",
    snippet: `swagger: "2.0"
info: { title: Wrapbox Authorized Actions, version: "1.0" }
host: api.wrapbox.ai
basePath: /v1/actions
securityDefinitions:
  wrapbox: { type: apiKey, in: header, name: Authorization }
paths:
  /crm.apply_discount:
    post:
      operationId: ApplyDiscount
      summary: Apply a renewal discount (Wrapbox-authorized)`,
    connected: false,
    owner: "Revenue ops",
    env: "production",
  },
  {
    id: "servicenow",
    name: "ServiceNow AI Agents",
    vendor: "ServiceNow",
    category: "saas",
    logo: "servicenow",
    bleed: true,
    adapter: "connector",
    surface: "crm",
    file: "IntegrationHub → REST step",
    fileNote: "Consequential flow actions call Wrapbox first",
    lang: "yaml",
    install: `wrapbox connectors add servicenow --instance wrapbox.service-now.com`,
    hookEvents: ["Flow action", "REST step"],
    docs: "servicenow.com/docs — AI Agent Studio",
    snippet: `# Flow Designer → Action → REST step
endpoint: https://api.wrapbox.ai/v1/actions/{effect}
method: POST
auth: Connection alias "Wrapbox" (Bearer)
body:
  effect: itsm.grant_access
  subject_agent: \${agent.sys_id}
  on_behalf_of: \${requested_for.email}`,
    connected: false,
    owner: "IT",
    env: "production",
  },
  {
    id: "zapier",
    name: "Zapier Agents",
    vendor: "Zapier",
    category: "saas",
    logo: "zapier",
    adapter: "connector",
    surface: "crm",
    file: "Zap step · Webhooks by Zapier (POST)",
    fileNote: "Add as the step before any consequential action; continue only on ALLOW",
    lang: "json",
    install: `wrapbox connectors add zapier`,
    hookEvents: ["authorize step", "Paths"],
    docs: "zapier.com/apps/webhook",
    snippet: `{
  "action": "Webhooks by Zapier · POST",
  "url": "https://api.wrapbox.ai/v1/authorize",
  "headers": { "Authorization": "Bearer {{WRAPBOX_TOKEN}}" },
  "data": {
    "effect": "crm.apply_discount",
    "subject_agent": "zapier-renewals-agent",
    "args": "{{previous_step.output}}"
  },
  "next": "Paths → continue only when decision == ALLOW"
}`,
    connected: false,
    owner: "Ops",
    env: "production",
  },
  // 7 · Browser
  {
    id: "browser-use",
    name: "Browser Use",
    vendor: "Browser Use",
    category: "browser",
    logo: "browseruse",
    bleed: true,
    adapter: "browser",
    surface: "browser",
    file: "ap_agent.py",
    fileNote: "Wraps click, input, upload and submit before they reach the page",
    lang: "py",
    install: `pip install "wrapbox[browser-use]"`,
    hookEvents: ["click", "input", "upload", "submit"],
    docs: "docs.browser-use.com/customize/tools",
    snippet: `from browser_use import Agent, Tools
from wrapbox.browser_use import guard_actions

tools = guard_actions(Tools(), org="${ORG}")    # semantic: payment.submit, email.send
agent = Agent(task="Pay invoice INV-2291 on the vendor portal", llm=llm, tools=tools)
await agent.run()`,
    connected: true,
    owner: "Finance ops",
    env: "production",
  },
  {
    id: "computer-use",
    name: "Claude Computer Use",
    vendor: "Anthropic",
    category: "browser",
    logo: "claude",
    adapter: "browser",
    surface: "browser",
    file: "executor.py",
    fileNote: "The app that executes computer-use tool calls asks Wrapbox first",
    lang: "py",
    install: `pip install "wrapbox[computer]"`,
    hookEvents: ["computer tool_use"],
    docs: "docs.claude.com — computer use tool",
    snippet: `from wrapbox.computer import ControlledExecutor

executor = ControlledExecutor(org="${ORG}", semantic_actions={
    "Submit payment": "payment.submit",
    "Send": "email.send",
})
result = executor.run(tool_use_block)   # consequential clicks need a permit`,
    connected: false,
    owner: "Finance ops",
    env: "sandbox VM",
  },
  {
    id: "playwright",
    name: "Playwright agents",
    vendor: "Microsoft",
    category: "browser",
    logo: "playwright",
    adapter: "browser",
    surface: "browser",
    file: "pay.spec.ts",
    fileNote: "guardPage() authorizes semantic actions before dispatching the click",
    lang: "ts",
    install: `npm i @wrapbox/playwright`,
    hookEvents: ["page.click", "page.fill"],
    docs: "playwright.dev",
    snippet: `import { chromium } from "playwright";
import { guardPage } from "@wrapbox/playwright";

const page = guardPage(await (await chromium.launch()).newPage(), { org: "${ORG}" });
await page.getByRole("button", { name: "Submit payment" }).click();
// → payment.submit {amount, payee, origin} is authorized before the click`,
    connected: false,
    owner: "QA",
    env: "CI",
  },
  // 8 · A2A
  {
    id: "openai-handoffs",
    name: "OpenAI handoffs",
    vendor: "OpenAI",
    category: "a2a",
    logo: "openai",
    adapter: "a2a",
    surface: "delegation",
    file: "ops/supervisor.py",
    fileNote: "delegate() attaches an attenuated capability token to the handoff",
    lang: "py",
    install: `pip install wrapbox`,
    hookEvents: ["handoff", "tool call"],
    docs: "openai.github.io/openai-agents-python/handoffs",
    snippet: `from agents import Agent
from wrapbox import delegate

purchasing = Agent(name="purchasing-subagent", tools=[place_order])
supervisor = Agent(
    name="ops-supervisor",
    handoffs=[delegate(purchasing, budget_usd=10_000, ttl="30m", tools=["place_order"])],
)   # the child can never exceed what the parent granted`,
    connected: true,
    owner: "Ops",
    env: "production",
  },
  {
    id: "a2a",
    name: "A2A protocol peers",
    vendor: "Linux Foundation A2A",
    category: "a2a",
    logo: "a2a",
    bleed: true,
    adapter: "a2a",
    surface: "delegation",
    file: ".well-known/agent-card.json",
    fileNote: "Publish the peer's Agent Card at the Wrapbox A2A gateway URL",
    lang: "json",
    install: `wrapbox a2a register vendor-quotes --card https://vendor.example/.well-known/agent-card.json`,
    hookEvents: ["message/send", "tasks/get"],
    docs: "a2a-protocol.org",
    snippet: `{
  "name": "vendor-quotes-agent",
  "url": "https://a2a.wrapbox.ai/vendor-quotes",
  "capabilities": { "streaming": true },
  "securitySchemes": { "wrapbox": { "type": "http", "scheme": "bearer" } },
  "x-wrapbox": { "attenuate": true, "max_budget_usd": 10000, "delegation_ttl": "30m" }
}`,
    connected: false,
    owner: "Ops",
    env: "production",
  },
];

export const agentById = (id: string) => AGENTS.find((a) => a.id === id)!;
export const categoryById = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)!;
export const agentsIn = (c: CategoryId) => AGENTS.filter((a) => a.category === c);
