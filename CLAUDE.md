# Wrapbox engineering standard

Wrapbox is a **prototype**, not a production system. Build the smallest implementation that creates
the most believable enterprise-grade product experience:

> **Prototype the infrastructure. Never prototype the correctness.**

Work at the level of a principal engineer presenting this product to engineering, security,
AI-platform and governance leaders at large technology and financial companies.

1. **Production-realistic UX** — every flow, screen, state and message behaves the way a real
   enterprise product would.
2. **Real logic where users can test it** — if a screen claims agent → action → policy → REVIEW, the
   simulator must genuinely evaluate those conditions and return REVIEW. Never hard-code a result to
   make a demo look successful.
3. **Simulate expensive integrations** — do not build real Stripe, GitHub, MCP, Kubernetes, database,
   SSO or enterprise integrations unless explicitly asked. Build realistic simulated flows with
   representative data and states.
4. **Never fake capability** — simulation (a realistic prototype of intended production behaviour) is
   allowed; a control whose result has no logical relationship to what the user did is not.
5. **Internally consistent** — Describe, Build, Code/YAML, Test, Replay and decisions must represent
   the same underlying rule through one shared model and one shared matcher. No screen may
   contradict another.
6. **Enterprise-first** — would a security leader understand it? Is the workflow believable? Are edge
   cases represented? Could anything shown create a false security claim?
7. **Authoritative documentation** — verify external behaviour against the vendor's or standards
   body's current official docs (OpenAI, Anthropic, GitHub, Stripe, HashiCorp, Kubernetes, Microsoft,
   Google, AWS, NIST, OWASP). Never invent behaviour from assumptions.
8. **Don't overbuild** — separate *prototype needs now* from *production implementation later*.
9. **Challenge bad requirements** — say briefly what is wrong and implement the stronger approach
   rather than silently building something misleading or insecure.
10. **Before saying "done"** — test the whole affected flow: happy paths, failure paths, boundary
    cases and cross-screen consistency. A polished screen is not evidence.

## Working notes

- The policy engine is the product. `src/lib/engine.ts` `checkRule()` is the single matcher used by
  the rule tester, the YAML view and runtime evaluation — never add a second, screen-local one.
- Verify with regression runs over every effect, agent category, tier boundary and a YAML round-trip,
  not with a single screenshot.
- Say plainly in any hand-off what is real and what is simulated.
- Secrets (for example `OPENAI_API_KEY`) live only in server environment variables, never in the
  browser, the bundle, logs, rules or YAML.
