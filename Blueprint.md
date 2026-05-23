# Agent Capability Runtime

## Vision

A runtime-native authorization and governance layer for AI agents.

The system provides:

* capability-scoped permissions
* runtime policy enforcement
* execution interception
* auditability
* approval hooks
* temporary delegated access

The long-term goal is:

> Become the standard policy enforcement layer between AI agents and external actions.

---

# Core Concept

Traditional auth systems grant broad, static access.

Example:

* Gmail full access
* Slack workspace access
* Database admin access

AI agents require:

* temporary permissions
* scoped execution
* dynamic constraints
* runtime validation
* contextual approvals

Instead of:

```json
{
  "scope": "gmail.full_access"
}
```

We issue:

```json
{
  "tool": "gmail.send",
  "constraints": {
    "allowed_domains": ["company.com"],
    "max_actions": 5,
    "attachments": false
  },
  "expires_at": 1748200000
}
```

This transforms permissions from:

* identity-centric

into:

* capability-centric

---

# Initial Product Scope

## Product Name

Agent Capability Runtime (ACR)

## Initial Goal

Provide middleware that safely controls tool execution for AI agents.

## First Supported Use Cases

* sending emails
* Slack messaging
* HTTP requests
* internal API execution

## Explicitly Out of Scope (v1)

* full IAM system
* enterprise SSO
* multi-agent orchestration
* vector memory systems
* UI-heavy workflow builders
* custom LLMs

---

# MVP Architecture

```text
LLM / Agent
     ↓
Capability Token
     ↓
Runtime Gateway
     ↓
Policy Engine
     ↓
Tool Adapter
     ↓
External Service
```

Every action passes through the runtime.

The runtime decides:

* allow
* deny
* require approval
* redact
* sandbox
* limit

---

# Core Components

## 1. Capability Issuer

Responsible for generating scoped permissions.

### Responsibilities

* generate signed capability tokens
* embed constraints
* set expiration
* bind capabilities to agents/tasks
* attach metadata

### Example

```ts
const token = await grantCapability({
  agentId: "agent_1",
  tool: "gmail.send",
  constraints: {
    domains: ["company.com"],
    maxEmails: 5,
    attachments: false
  },
  expiresIn: "15m"
})
```

---

## 2. Runtime Gateway

The execution enforcement layer.

All agent actions flow through this component.

### Responsibilities

* validate tokens
* enforce policies
* intercept tool execution
* invoke approval hooks
* log actions
* return decisions

### Runtime Decisions

* ALLOW
* DENY
* REQUIRE_APPROVAL
* REDACT
* SANDBOX

---

## 3. Policy Engine

Evaluates constraints against runtime execution.

### Example Constraints

* allowed email domains
* max execution count
* allowed URLs
* HTTP method restrictions
* attachment restrictions
* monetary transfer limits
* allowed execution hours
* human approval triggers

### Example

```ts
policy({
  tool: "gmail.send",
  constraints: {
    domains: ["company.com"],
    maxEmails: 3
  }
})
```

---

## 4. Tool Adapters

Adapters normalize external services.

### v1 Adapters

* Gmail
* Slack
* Generic HTTP

### Future Adapters

* GitHub
* Notion
* Stripe
* AWS
* Kubernetes
* databases
* browser automation

---

## 5. Audit Layer

Stores:

* agent identity
* action attempted
* payload metadata
* decision
* timestamps
* reason for denial
* approval history

### Example Event

```json
{
  "agent": "agent_1",
  "tool": "gmail.send",
  "decision": "DENY",
  "reason": "external domain blocked",
  "timestamp": "2026-05-24T10:00:00Z"
}
```

---

# Recommended Tech Stack

## Language

TypeScript

Reason:

* MCP ecosystem compatibility
* AI SDK ecosystem dominance
* middleware friendliness
* rapid iteration

---

## Backend

### API Server

* Fastify
  or
* Hono

### Database

PostgreSQL

### Cache

Redis (optional)

### Token Format

* JWT
* JWE later

### Future Policy Layer

Open Policy Agent (OPA)

---

# Suggested Repository Structure

```text
/packages
  /sdk
  /runtime
  /policy-engine
  /capability-token
  /adapters
    /gmail
    /slack
    /http
  /audit
  /examples
/apps
  /playground
  /dashboard
/docs
```

---

# Capability Token Spec (v1)

## Structure

```json
{
  "iss": "acr-runtime",
  "sub": "agent_123",
  "task": "email_customer_support",
  "tool": "gmail.send",
  "constraints": {
    "allowed_domains": ["company.com"],
    "max_actions": 5,
    "attachments": false
  },
  "iat": 1748200000,
  "exp": 1748200900
}
```

---

# Initial Runtime API

## Grant Capability

```http
POST /capabilities/grant
```

### Request

```json
{
  "agentId": "agent_1",
  "tool": "gmail.send",
  "constraints": {
    "domains": ["company.com"]
  },
  "expiresIn": "15m"
}
```

---

## Execute Tool

```http
POST /runtime/execute
```

### Request

```json
{
  "token": "jwt_token_here",
  "tool": "gmail.send",
  "payload": {
    "to": "user@company.com",
    "subject": "Hello"
  }
}
```

---

# Initial SDK Design

## Example Usage

```ts
await runtime.execute({
  token,
  tool: "gmail.send",
  payload
})
```

---

# Developer Experience Goal

Eventually developers should write:

```ts
await agent.run({
  permissions: [
    can("gmail.send")
      .onlyDomain("company.com")
      .maxActions(5)
      .expiresIn("10m")
  ]
})
```

This should become the core abstraction.

---

# Open Source Strategy

## Open Source

* runtime
* SDK
* capability token spec
* adapters
* examples

## Hosted Cloud Product

* dashboard
* org governance
* approval workflows
* analytics
* observability
* audit search
* enterprise integrations

---

# Phase Roadmap

# Phase 1 — Foundation (Weeks 1–4)

## Deliverables

* token generator
* token validator
* runtime gateway
* policy engine
* Gmail adapter
* Slack adapter
* audit logs
* npm package
* GitHub repo

## Success Metric

A developer can safely restrict agent actions with runtime-enforced permissions.

---

# Phase 2 — Governance (Months 2–3)

## Features

* approval hooks
* policy DSL
* execution replay
* rate limiting
* execution quotas
* structured audit search
* org-level policies

---

# Phase 3 — Ecosystem Integrations (Months 3–5)

## Integrations

* MCP middleware
* OpenAI Agents SDK
* LangChain
* CrewAI
* Temporal
* AutoGen

Goal:
Become the default enforcement layer.

---

# Phase 4 — Enterprise Runtime (Months 6–12)

## Features

* multi-agent trust
* delegated execution
* risk scoring
* runtime anomaly detection
* sandbox execution
* policy simulation
* compliance tooling

---

# Long-Term Vision

The long-term opportunity is:

```text
LLM
 ↓
Agent Runtime
 ↓
Capability Enforcement Layer ← ACR
 ↓
Tools / APIs / Systems
```

Every autonomous action should pass through a secure capability runtime.

That becomes:

* the audit layer
* the governance layer
* the security layer
* the approval layer
* the runtime trust layer

for AI agents.

---

# Immediate Next Steps

## Day 1

Define:

* capability schema
* runtime API
* policy constraints
* repository structure

## Day 2–3

Build:

* token generator
* token validator

## Day 4–7

Build:

* runtime execution middleware
* policy enforcement layer

## Week 2

Implement:

* Gmail adapter
* Slack adapter

## Week 3

Add:

* audit logs
* approval hooks

## Week 4

Release:

* GitHub repository
* docs
* npm package
* examples

---

# Core Principle

Do not build:

* another chatbot
* another orchestration framework
* another workflow builder

Build:

# the runtime-native permission system for autonomous software.
