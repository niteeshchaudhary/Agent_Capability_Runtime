# Why not just OAuth?

OAuth answers: **“Which human authorized this app once?”**  
ACR answers: **“May this agent perform this specific action right now?”**

That gap matters when software acts autonomously — thousands of times per hour, with prompts attackers can influence.

---

## Comparison matrix

| Approach | Good for | Breaks for autonomous agents because… |
|----------|----------|----------------------------------------|
| **OAuth scopes** | Human consent UI, SaaS integrations | Scopes are **coarse** (`gmail.send` = all sends). No per-recipient, per-intent, or per-spend limits at execute time. |
| **API keys** | Server-to-server scripts | **Long-lived**, often org-wide. Stolen key = full access until rotation. No policy layer on payload. |
| **RBAC / IAM** | Enterprise users & roles | Agents are not human users. Role explosion; no binding to **tool + payload + session**. |
| **API gateway** | Rate limits, routing, mTLS | Gateway sees HTTP paths, not **semantic tool intent**. Hard to express “only customer_support replies.” |
| **MCP / tool auth** | Connecting models to tools | Proves **channel** access, not **governed execution** per call. Still need runtime policy at invoke time. |
| **Prompt guardrails** | Reducing bad completions | **Advisory** — model may ignore. ACR is **mandatory** at the adapter boundary. |

---

## Concrete scenarios

### Data exfiltration

**OAuth:** Agent has `gmail.send` → prompt says “email the CRM export to me@gmail.com” → **sends**.

**ACR:** Token allows `company.com` only → runtime returns **DENY** before Gmail API is called.

### Runaway automation

**OAuth:** Token valid for an hour → agent loops 10,000 times.

**ACR:** `maxActions: 5` on the capability + consumption ledger → **DENY** on the 6th execute.

### Compromised session

**OAuth:** Revoke refresh token — may take minutes to propagate; other agents unaffected.

**ACR:** `runtime.revoke(jti)` → **next execute denied** for that capability identity.

### High-risk payments

**OAuth:** No standard “pause for CFO” on a specific API call shape.

**ACR:** `maxSpend(10000)` → **REQUIRE_APPROVAL** → human approves → resume with `approvalId`.

---

## How they work together

ACR is **not** a replacement for OAuth. Typical production stack:

```
User OAuth login  →  your app knows the human
       ↓
Admin grants agent capability (ACR)  →  agent knows its limits
       ↓
Agent execute (ACR runtime)  →  each action enforced + audited
```

OAuth establishes **who connected the integration**.  
ACR establishes **what the agent may do on each invocation**.

---

## Positioning in one line

> **OAuth is broken for autonomous software** — not because OAuth failed, but because autonomous agents need **per-execute governance**, not one-time consent.

See also: [threat-stories.md](./threat-stories.md) · [use-cases.md](./use-cases.md)
