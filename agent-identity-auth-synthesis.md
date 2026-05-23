# Agent Identity, Authentication & Authorization: Cross-Paper Synthesis

A consolidated analysis of six documents on securing AI agents, with shared conclusions, challenges, and proposed resolutions.

**Date:** May 24, 2026  
**Scope:** Identity, authentication, authorization, and security for LLM-based and multi-agent AI systems.

---

## Papers Reviewed

| # | Document | Focus |
|---|----------|-------|
| 1 | **A Novel Zero-Trust Identity Framework for Agentic AI** (Huang et al., arXiv:2505.19301v2) | Decentralized agent IAM using DIDs, VCs, ZKPs, ANS, and unified session enforcement |
| 2 | **Agentic JWT (A-JWT)** (Goswami, arXiv:2509.13597v1) | OAuth/JWT extension binding agent actions to user intent and delegation chains |
| 3 | **OpenID Connect for Agents (OIDC-A) 1.0** (Nagabhushanaradhya, arXiv:2509.25974v1) | OIDC extension with agent claims, attestation, and delegation chain validation |
| 4 | **MCPSHIELD** (Acharya & Gupta, arXiv:2604.05969v1) | Formal MCP security framework: threat taxonomy, verification model, defense-in-depth |
| 5 | **Identity Management for Agentic AI** (OpenID Foundation whitepaper, Oct 2025) | Strategic IAM agenda: near-term OAuth/MCP practices and long-term agent identity |
| 6 | **AI Agent Authentication and Authorization** (Kasselman et al., [IETF draft-klrc-aiagent-auth-00](https://www.ietf.org/archive/id/draft-klrc-aiagent-auth-00.html), March 2026) | Compositional framework using WIMSE/SPIFFE, OAuth, transaction tokens, and SSF — no new protocols |

---

## Common Conclusions

Across the readable papers, several conclusions recur consistently:

### 1. Traditional IAM is necessary but insufficient

OAuth 2.0, OIDC, and SAML work for **constrained, single-domain, human-tethered** scenarios (enterprise SSO, one agent acting for one user). They break down for **multi-agent systems (MAS)** with autonomy, ephemerality, recursive delegation, and cross-organizational trust.

> *"Merely adapting existing protocols is insufficient. Instead, a purpose-built approach is required."* — Huang et al.

### 2. The intent–execution gap is the core security failure mode

Bearer OAuth/JWT tokens assume the **client deterministically represents user intent**. LLM agents violate this: reasoning, tool selection, and parameters are **non-deterministic** and vulnerable to prompt injection, excessive agency, and co-resident agent impersonation.

> *"In the agentic world, a scope grants potential; an intent grants permission for exactly one concrete task."* — A-JWT paper

### 3. Agents must be first-class identities, not user proxies

Agents should not be indistinguishable from users. Accountability requires **distinct agent identity** plus **explicit delegated authority** (on-behalf-of), with auditable links from every action back to the delegating human or parent agent.

### 4. Zero Trust must be continuous, not issuance-time only

NIST Zero Trust ("never trust, always verify, assume breach") is undermined when possession of a long-lived bearer token is sufficient until expiry. All papers argue for **per-request verification**: proof-of-possession, attestation, context-aware policy, and runtime enforcement.

### 5. Delegation chains need cryptographic structure and scope attenuation

Multi-hop agent delegation (user → orchestrator → specialist agents) is foundational to agentic architectures. Without **verifiable delegation chains** and **monotonically narrowing scopes**, accountability blurs and privilege escalation becomes inevitable.

### 6. MCP/tool ecosystems dramatically expand the attack surface

MCP adoption (177,000+ tools, 97M+ monthly SDK downloads) has shifted tools from read-only to **action-capable** (27% → 65%). Tool descriptions consumed as natural language create inherent prompt-injection surfaces; no single existing defense covers more than ~34% of identified threats.

### 7. Standardization and interoperability are existential requirements

Proprietary agent identity silos (vendor-specific Agent IDs) will fragment security models and slow adoption. The ecosystem needs **open, backward-compatible extensions** to OAuth/OIDC rather than greenfield protocols—though some papers also propose richer decentralized identity (DIDs/VCs) for cross-domain trust.

### 8. Defense must be layered, not point-solution

Point defenses (ETDI, MCP-Guard, manifest signing, etc.) address slices of the problem. Integrated architectures—combining capability-based access, attestation, information-flow tracking, and runtime policy—are needed for comprehensive coverage (~91% theoretical in MCPSHIELD vs. ≤34% for any single mechanism).

### 9. The industry is at an inflection point, not starting from zero

OAuth 2.1 + PKCE, MCP auth integration, SCIM agent lifecycle extensions, CIBA for async consent, SPIFFE/SPIRE workload identity, and enterprise security profiles (IPSIE) provide **immediate, deployable foundations**. The work ahead is extending these for agent-native semantics.

### 10. Compose existing standards rather than invent new protocols

The IETF draft explicitly rejects greenfield protocol design. Agents are **workloads** that should use WIMSE/SPIFFE identifiers, OAuth 2.0 delegation, transaction tokens, and OpenID SSF eventing — composed into an **Agent Identity Management System (AIMS)** stack. Fragmented, isolated agent-auth efforts risk reinventing mechanisms that already exist.

> *"Rather than defining new protocols, this document describes how existing and widely deployed standards can be applied or extended."* — Kasselman et al. (draft-klrc-aiagent-auth-00)

---

## Shared Challenges

The papers converge on a common challenge taxonomy:

### Identity & Lifecycle

| Challenge | Description |
|-----------|-------------|
| **Ephemeral & forked agents** | Agents are created, cloned, and destroyed rapidly; persistent credentials are risky and inefficient |
| **Rich agent identity** | Identity must encode model, version, capabilities, provenance, behavioral scope—not just a client ID or API key |
| **NHI proliferation / secret sprawl** | Each agent may need credentials for many APIs, exponentially growing the attack surface |
| **Identity fragmentation** | Vendor-proprietary agent ID systems create incompatible security models |
| **Portable cross-domain identity** | SPIFFE/SPIRE and similar infra-bound identities don't extend across organizational boundaries |
| **Hybrid agent behavior** | Agents alternate between acting independently and on behalf of users; IAM must distinguish both modes |

### Authorization & Delegation

| Challenge | Description |
|-----------|-------------|
| **Coarse-grained static scopes** | Predefined OAuth scopes cannot express dynamic, task-specific, context-dependent permissions |
| **Recursive delegation** | Sub-agents spawned by parent agents create multi-hop chains without clear scope attenuation |
| **Intent vs. execution separation** | LLM decisions may diverge from user intent; tokens don't cryptographically bind actions to approved intent |
| **Multi-user / team agents** | OAuth assumes one user; shared chat/codebase agents need intersection of multiple users' permissions |
| **Consent fatigue** | High-velocity agents generate thousands of auth prompts; users reflexively approve |
| **Asynchronous authorization** | Long-running agents outlive initial tokens; real-time user approval for every action is impractical |
| **Autonomous privilege escalation** | Agents may probe for higher privileges or combine actions to exceed authorized scope |

### Protocol & Runtime Security (especially MCP)

| Challenge | Description |
|-----------|-------------|
| **Tool poisoning** | Malicious instructions embedded in tool descriptions/schemas/return values |
| **Rug pull / post-approval mutation** | Tool behavior changes after user grants permission |
| **Cross-server data leakage** | Data from one MCP server bleeds into requests to another via LLM context |
| **Capability chaining** | Individually benign tools composed to achieve unauthorized outcomes |
| **Cross-protocol confusion** | Bridging MCP, A2A, ACP, ANP creates semantic trust gaps |
| **Session/replay vulnerabilities** | MCP sessions lack mandatory cryptographic protection |
| **Supply chain / server trust** | Open MCP ecosystem enables impersonation, dependency hijacking |
| **Browser/computer-use agents** | Visual-interface agents bypass API-based authorization entirely |

### Governance, Scale & Operations

| Challenge | Description |
|-----------|-------------|
| **Global revocation complexity** | Revoking a compromised agent across all active sessions and services is operationally hard |
| **Scalability of token/session management** | Thousands of ephemeral agents overwhelm traditional IAM infrastructure |
| **Limited context awareness** | Static role/scope decisions ignore runtime risk, anomalous behavior, environmental conditions |
| **Audit trail ambiguity** | Agent actions logged indistinguishably from direct user actions |
| **Verifiable autonomy** | Scaling beyond human-in-the-loop requires programmatic alignment verification |
| **Ecosystem governance** | 177,000+ MCP tools lack reputation, certification, and threat-intelligence mechanisms |
| **Compositional security** | Security of individual tools does not guarantee security of composed workflows |
| **Transport identity breaks at intermediaries** | mTLS identity is lost when TLS terminates at proxies, gateways, or service meshes |
| **Token over-proliferation in microservices** | Passing OAuth access tokens between internal microservices enables theft, replay, and lateral movement |
| **Mid-execution user confirmation** | CIBA maps poorly to agent workflows that need approval partway through a task |
| **Local UI confirmation ≠ authorization** | MCP elicitation/tool-approval UI is not a substitute for a verifiable OAuth grant |

---

## Proposed Resolutions

Each paper offers complementary solutions. Grouped by theme:

### A. Extend OAuth/OIDC with Agent-Native Semantics

**Papers:** OIDC-A, A-JWT, OpenID Foundation whitepaper

| Resolution | Mechanism |
|------------|-----------|
| **Agent identity claims** | Standard claims: `agent_type`, `agent_model`, `agent_version`, `agent_provider`, `agent_instance_id` (OIDC-A) |
| **Delegation chain claims** | Ordered `delegation_chain` with scope reduction, constraints, chronological validation at each hop (OIDC-A) |
| **Intent tokens** (A-JWT) | JWT extensions cryptographically binding each API call to user intent and workflow step; new `agent_checksum` grant type |
| **Per-agent proof-of-possession** | Ed25519 PoP keys derived per agent; prevents replayed/stolen bearer token use (A-JWT) |
| **Client shim library** | Tamper-proof in-process library computing agent checksums (prompt + tools + config), minting intent tokens, enforcing inter-agent isolation (A-JWT) |
| **Attestation evidence** | JWT/EAT/TPM/SGX attestation in `agent_attestation` claim; dedicated attestation endpoints (OIDC-A) |
| **Capability-based authorization** | `agent_capabilities` arrays with namespaced taxonomies for fine-grained authZ (OIDC-A) |
| **On-behalf-of (OBO) flows** | Distinct `sub` (user) and `act`/`azp` (agent) claims for auditable delegation (OpenID Foundation) |
| **Async consent** | CIBA for out-of-band approval; MCP URL-mode elicitation for sensitive cross-domain auth (OpenID Foundation) |

### B. Decentralized Zero-Trust Agent IAM Architecture

**Paper:** Huang et al. (Zero-Trust Identity Framework)

| Resolution | Mechanism |
|------------|-----------|
| **Rich Agent IDs via DIDs** | Decentralized Identifiers as cryptographic anchor; DID Documents with keys, endpoints, metadata |
| **Verifiable Credentials (VCs)** | Attest capabilities, provenance, compliance, training data, toolset authorization |
| **Zero-Knowledge Proofs** | Privacy-preserving selective disclosure of agent attributes without revealing full identity |
| **Agent Naming Service (ANS)** | Capability-aware discovery—not just endpoint lookup but verified ability matching |
| **Dynamic access control** | ABAC/PBAC/JIT access with context-based policies adapting to runtime conditions |
| **Unified global session management** | Cross-protocol enforcement layer propagating revocation, policy changes, and session termination instantly across heterogeneous agent communication |
| **Lifecycle-aware IAM** | Identity creation → attestation → runtime authZ → logging → incident response → decommissioning |
| **Deployment models** | Centralized, decentralized (DLT), federated, and hybrid options with decision matrix guidance |

### C. MCP-Specific Formal Security (MCPSHIELD)

**Paper:** Acharya & Gupta

| Resolution | Mechanism |
|------------|-----------|
| **Unified threat taxonomy** | 7 categories, 23 attack vectors across 4 surfaces (tool, transport, server, composition) |
| **Formal verification model (MMCP)** | Labeled transition system with trust-boundary annotations; decidable properties: tool integrity, data confinement, privilege boundedness, context isolation |
| **Layer 1 — Capability-Based Access Control** | Unforgeable capability tokens restricting tool, params, scope, TTL; composition policies blocking dangerous tool sequences |
| **Layer 2 — Cryptographic Tool Attestation** | Signed tool attestation records (TAR); version pinning; dependency hash verification; transparency log |
| **Layer 3 — Information Flow Tracking** | Taint labels on MCP data; enforcement that data cannot flow to higher-clearance servers |
| **Layer 4 — Runtime Policy Enforcement** | Security automata monitoring traces; rate limiting, anomaly detection, consent enforcement, semantic injection stripping |
| **Protocol recommendations for AAIF** | Mandatory tool attestation, structured (non-NL) tool descriptions, built-in session signing and replay protection |

### D. Near-Term Operational Best Practices

**Paper:** OpenID Foundation whitepaper

| Resolution | Mechanism |
|------------|-----------|
| **OAuth 2.1 + PKCE** | Standard auth for MCP client-server; externalize authZ to IdP (PEP/PDP separation) |
| **Client ID Metadata Documents** | Replace anonymous dynamic client registration with URL-based accountable client identity |
| **SPIFFE/SPIRE workload identity** | Short-lived, auto-rotated SVIDs for agents within controlled infrastructure |
| **SCIM Agentic Identity Schema** | First-class agent lifecycle: provision, update, de-provision across enterprise systems |
| **Enterprise SSO + IGA** | Extend human identity governance patterns to agents; guardrails for PII masking, output filtering |
| **Enterprise security profiles (IPSIE)** | Interoperable, rigorous profiles of existing identity standards for AI adoption confidence |
| **Web Bot Auth** | Cryptographic proof of legitimate web agents vs. malicious bots |
| **Offline delegation tokens** | Biscuits/Macaroons for decentralized scope attenuation without central token exchange |

### E. Compositional IETF Framework (AIMS + WIMSE + OAuth)

**Paper:** Kasselman et al. (draft-klrc-aiagent-auth-00)

| Resolution | Mechanism |
|------------|-----------|
| **Agent Identity Management System (AIMS)** | Nine-layer conceptual stack: Identifier → Credentials → Attestation → Provisioning → Authentication → Authorization → Observability → Policy → Compliance |
| **WIMSE identifier (primary)** | Every agent MUST have exactly one WIMSE URI; MAY use SPIFFE ID (`spiffe://trust-domain/path`) as implementation |
| **Short-lived WIMSE/SPIFFE credentials** | WITs, JWT-SVIDs, X.509-SVIDs with explicit expiry; automated rotation replaces manual revocation |
| **Attestation-driven issuance** | TEE evidence, software integrity, supply-chain provenance, orchestration metadata feed credential provisioning |
| **Transport auth (mTLS)** | Mutual TLS with short-lived workload certs for service-mesh environments |
| **Application-layer auth (WPT + HTTP Sig)** | WIMSE Proof Tokens bind PoP to specific message context; HTTP Message Signatures preserve identity through proxies |
| **OAuth 2.0 as delegation framework** | Agent = OAuth client (`client_id`); user/system = `sub` when acting on-behalf-of; resource servers enforce with ABAC/RBAC/PBAC |
| **Transaction tokens** | Exchange broad access tokens for downscoped, transaction-bound tokens within microservice chains ([draft-ietf-oauth-transaction-tokens](https://datatracker.ietf.org/doc/draft-ietf-oauth-transaction-tokens/)) |
| **Cross-domain chaining** | OAuth Identity and Authorization Chaining Across Domains; Identity Assertion JWT Authorization Grant |
| **CIBA for step-up auth** | Out-of-band user approval; local MCP elicitation MUST translate to OAuth authorization event |
| **Tool token exchange (not forwarding)** | Tools MUST NOT forward agent access tokens to downstream services; use Token Exchange instead |
| **Dynamic OAuth discovery** | Authorization Server Metadata, Protected Resource Metadata, Client ID Metadata Documents |
| **Continuous monitoring via SSF** | OpenID Shared Signals Framework (CAEP/RISC) for session revocation, risk elevation, token replay detection |
| **Tamper-evident audit logs** | Record agent ID, delegated subject, resource, action, correlation ID, attestation/risk state, remediation events |
| **Reject static API keys** | Explicitly an antipattern — bearer, long-lived, not cryptographically bound to agent identity |

### F. Architectural Identity Models (Future)

**Paper:** OpenID Foundation whitepaper (Section 3)

| Model | Use Case |
|-------|----------|
| **Enhanced service account** | Near-term enterprise: workload identity + agent metadata (`agent_model`, etc.) |
| **Delegated user sub-identity** | OBO-linked identity inseparable from user's authority |
| **Federated trust fabric** | OpenID Federation, X.509 for cross-domain verification |
| **Sovereign portable identity** | DIDs for peer-to-peer accountability across open ecosystems |

---

## Resolution Comparison Matrix

| Problem | IETF (AIMS) | OIDC-A | A-JWT | Huang (DID/VC) | MCPSHIELD | OpenID WP |
|---------|-------------|--------|-------|----------------|-----------|-----------|
| Agent as distinct identity | WIMSE / SPIFFE ID | Claims | Checksum hash | DID + VC | Capability tokens | SPIFFE / Agent ID |
| Intent binding | Transaction tokens | `delegation_purpose` | Intent token | scopeOfBehavior | Runtime automaton | OBO + guardrails |
| Delegation chains | OAuth ID chaining | `delegation_chain` | Chained assertion | VC-linked hierarchy | Composition policies | Token Exchange / Biscuits |
| Cross-domain trust | OAuth ID chaining | Federation | OAuth compat | DIDs + ZKP | Trust domains | OpenID Federation |
| MCP tool security | OAuth + no token forward | Attestation | API-level only | ANS + toolset VC | Full 4-layer stack | OAuth for MCP |
| Async consent | CIBA + MCP elicitation→OAuth | — | — | Session mgmt | Consent automaton | CIBA + elicitation |
| Runtime enforcement | WPT + HTTP Sig + SSF | Token validation | Shim + RS middleware | Global session layer | L-RPE automata | PEP/PDP + guardrails |
| Revocation | SSF/CAEP/RISC + short-lived creds | Chain jti + introspection | Short-lived PoP tokens | Global session sync | Capability TTL | SCIM de-provision |

---

## Open Issues & Future Work (Cross-Paper)

Despite proposed solutions, all papers acknowledge unresolved gaps:

1. **Standardization velocity** — Multiple overlapping proposals (OIDC-A, A-JWT, AAP, Agent Auth Protocol, draft-klrc-aiagent-auth) need IETF/OpenID convergence; the IETF draft aims to be the consolidation layer
2. **Scalability of cryptographic overhead** — DIDs, VCs, ZKPs, per-request attestation at millions-of-agents scale
3. **Compositional security proofs** — No formal proof that secure tools compose securely through non-deterministic LLM orchestration
4. **Semantic integrity** — Cryptographic hashes verify syntax unchanged, not that tool behavior matches description
5. **LLM-internal attacks** — Protocol-level defenses cannot fully address sophisticated prompt injection via model reasoning
6. **Dynamic consent UX** — Context-sensitive, risk-adaptive consent without fatigue remains an HCI + security co-design problem
7. **Cross-protocol trust federation** — MCP + A2A + ACP + ANP interoperability without semantic gaps
8. **Ecosystem governance** — Server reputation, tool certification, threat intelligence at 177K+ tool scale
9. **Multi-user authorization** — No mature protocol for agents acting in shared contexts with permission intersection
10. **Browser/computer-use agents** — API authorization models don't apply; Web Bot Auth is nascent
11. **Governance & legal liability** — Who is accountable when delegated agent chains cross jurisdictions?
12. **TOCTOU in runtime identity** — A-JWT acknowledges prompt template substitution vs. injection is hard to distinguish
13. **Mid-execution CIBA mapping** — IETF draft notes CIBA's client-initiation model doesn't map cleanly to mid-task user confirmation (draft Section 10.6)
14. **Incomplete normative security/privacy** — draft-klrc-aiagent-auth-00 Sections 14–15 are marked TODO as of March 2026

---

## Recommended Reading Order

For practitioners building agent systems today:

1. **IETF draft-klrc-aiagent-auth-00** — Start here for the compositional baseline (WIMSE + OAuth + transaction tokens + SSF)
2. **OpenID Foundation whitepaper** — Strategic context and immediate OAuth/MCP/SCIM practices
3. **OIDC-A specification** — Standard agent claims and delegation chain format
4. **A-JWT paper** — Deep dive on intent–execution binding for multi-agent OAuth clients
5. **Huang et al.** — Long-term decentralized identity architecture for open MAS
6. **MCPSHIELD** — MCP-specific threat model and defense-in-depth when connecting agents to tools

---

## Summary

The papers collectively argue that **securing agentic AI is fundamentally an identity and authorization problem**, not merely an LLM safety problem. OAuth and OIDC provide the substrate, but agents require:

- **Distinct, verifiable identities** (not shared client credentials)
- **Cryptographic binding of actions to intent** (not bearer-token possession)
- **Structured, attenuating delegation chains** (not flat user impersonation)
- **Continuous, context-aware enforcement** (not issuance-time trust)
- **Layered defenses at the tool/protocol layer** (especially for MCP)
- **Open standards** to prevent proprietary identity fragmentation

The resolutions are complementary rather than competing:

- **IETF draft-klrc-aiagent-auth-00** provides the consolidation layer — composing WIMSE/SPIFFE, OAuth, transaction tokens, and SSF into the AIMS model without new protocols
- **OIDC-A and A-JWT** extend OAuth/OIDC with agent-specific claims and intent binding
- **OpenID Foundation whitepaper** operationalizes near-term deployment and strategic gaps
- **Huang et al.** address long-horizon decentralized trust for open MAS
- **MCPSHIELD** secures the MCP tool-invocation layer

None alone is sufficient; the industry needs convergence across all layers. The IETF draft explicitly positions itself as the framework within which extensions like OIDC-A and A-JWT should interoperate, while identifying remaining gaps (mid-execution consent, formal security/privacy sections) for future standardization.

---

## IETF Draft Deep Dive (draft-klrc-aiagent-auth-00)

*Source: [https://www.ietf.org/archive/id/draft-klrc-aiagent-auth-00.html](https://www.ietf.org/archive/id/draft-klrc-aiagent-auth-00.html)*  
*Authors: Pieter Kasselman (Defakto), Jean-François Lombardo (AWS), Yaroslav Rosomakho (Zscaler), Brian Campbell (Ping Identity)*

The local `AI Agent Authentication and Authorization.pdf` was a blank Print-to-PDF artifact; this IETF Internet-Draft is the authoritative source.

### Core thesis

Agents are **workloads** that iteratively interact with an LLM and external Tools/Services/Resources. They need the same identity primitives as any workload — but with additional delegation, attestation, and observability requirements. The answer is not a new protocol stack but a **compositional framework (AIMS)** built from:

| Layer | Standard |
|-------|----------|
| Identifier | WIMSE ID (SPIFFE-compatible) |
| Credentials | WIMSE WITs / SPIFFE SVIDs (JWT, X.509) |
| Attestation | SPIFFE, TEE, supply-chain, orchestration signals |
| Authentication | mTLS, WIMSE Proof Tokens, HTTP Message Signatures |
| Authorization | OAuth 2.0 (+ Token Exchange, Transaction Tokens, ID Chaining) |
| Observability | OpenID SSF (CAEP/RISC) |
| Discovery | OAuth AS Metadata, Protected Resource Metadata, Client ID Metadata |

### Key architectural decisions

1. **One WIMSE identifier per agent** — stable for the workload identity lifetime; used in authZ, delegation, and audit
2. **Short-lived credentials with auto-rotation** — reduces reliance on explicit revocation; SPIRE provides proven automation
3. **Application-layer auth when transport breaks** — WPTs and HTTP signatures preserve identity through proxies/gateways
4. **OAuth access token semantics** — `client_id` = agent; `sub` = delegating user/system when on-behalf-of
5. **Transaction tokens for internal chains** — downscope access tokens before passing through microservice call chains; prevents lateral movement
6. **Anti-pattern: forwarding access tokens** — Tools must exchange tokens, not pass agent credentials downstream
7. **CIBA + MCP elicitation** — user confirmation in agent UI must be bound to an OAuth authorization grant; local approval alone is insufficient
8. **SSF for continuous access evaluation** — subscribe to revocation/risk signals; cached tokens must not survive a revocation event

### Gaps the draft itself identifies

- **Mid-execution user confirmation** — CIBA is client-initiated; mapping to mid-task agent pauses needs additional specification
- **Security and privacy sections** — marked TODO in draft-00 (expires September 2026)
- **Policy format** — intentionally out of scope; implementations may use any policy-as-code format
- **Compliance criteria** — deployment-specific; framework provides observability primitives only
