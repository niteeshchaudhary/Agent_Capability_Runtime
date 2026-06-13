# Use cases — who should adopt ACR today?

If your agents call real tools (email, Slack, HTTP, payments, CRM) in production, you likely need **runtime enforcement** — not broader OAuth scopes.

---

## AI customer support agents

**Problem:** Support bot can email customers; prompt injection tries exfiltration to personal inboxes.

**ACR:**

```typescript
can("gmail.send")
  .onlyDomain("yourcompany.com")
  .whenIntent("customer_support")
  .limit(50)
  .expiresIn("1h")
```

**Outcome:** External domains denied; intent mismatch denied; audit trail per ticket.

---

## Autonomous finance / ops agents

**Problem:** Agent initiates transfers or vendor communications above policy thresholds.

**ACR:** `.maxSpend(100_00)` → payments over $100 require **human approval** before adapter runs.

---

## Browser & computer-use agents

**Problem:** Agent navigates arbitrary URLs; SSRF and data theft via internal endpoints.

**ACR:** `http.request` with `allowedUrls` + sandbox blocks `127.0.0.1`, RFC1918, metadata hosts.

---

## Coding copilots with tool use

**Problem:** Copilot triggers CI, deploy, or messaging tools with repo-wide credentials.

**ACR:** Short-lived capabilities per task; `maxActions`; revoke when session ends.

---

## Multi-agent systems (planner → executor)

**Problem:** Sub-agents must not exceed planner authority.

**ACR:** **Delegation** with constraint subset — executor cannot widen domains or action budget.

---

## Tool-using RAG pipelines

**Problem:** Retrieval agent shouldn't write to production systems.

**ACR:** Separate capabilities: read-only HTTP GET vs write tools; different tokens per stage.

---

## MCP servers & tool gateways

**Problem:** MCP proves tool connectivity, not per-call policy.

**ACR:** Wrap MCP tool invocation behind `runtime.execute` — same token + policy for every call.

---

## Enterprise AI governance

**Problem:** Security/compliance needs **prove** what each agent did and why.

**ACR:** Audit events with policy snapshot, optional **tamper-evident hash chain**, `traceId` / `sessionId` for SIEM.

---

## LangChain / Python agent frameworks

**Problem:** LangChain tools run locally; you need policy checks **before** side effects without rewriting every tool.

**ACR:**

```python
from acr import can
from acr_langchain import create_guard, wrap_tool

guard = create_guard(base_url="http://localhost:3000", agent_id="my_agent")
guard.ensure("http.request", can("http.request").where(method.in_(["GET"])).limit(20))

guarded = wrap_tool(my_tool, guard=guard, acr_tool="http.request", simulate=True)
```

**Outcome:** DENY returns to the agent as tool output; ALLOW proceeds to your local implementation.

See [packages/integrations/langchain](../packages/integrations/langchain).

---

## When ACR is not the first priority

- Single-user local scripts with no external tools
- Pure chat with no tool invocation
- Teams happy with manual human approval for every action (doesn't scale)

---

## Next step

```bash
pnpm demo:wow                              # TypeScript
python packages/sdk-python/examples/demo_wow.py   # Python (gateway required)
```

[why-not-oauth.md](./why-not-oauth.md) · [getting-started.md](./getting-started.md)
