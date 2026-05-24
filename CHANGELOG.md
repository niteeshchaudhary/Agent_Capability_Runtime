# Changelog

All notable changes to this project are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-05-24

### Added

- `@acr/capability-token` — HS256 capability JWT grant and validation
- `@acr/policy-engine` — constraint evaluation (`ALLOW`, `DENY`, `REQUIRE_APPROVAL`)
- `@acr/runtime` — execute orchestration, action counting, approval workflow
- `@acr/adapters` — Gmail, Slack (stub + live), HTTP adapters
- `@acr/audit` — in-memory and JSONL file audit logging with query filters
- `@acr/sdk` — HTTP and in-process `AcrClient`
- `@acr/gateway` — Hono server for grant, execute, audit, and approvals
- Policy constraints: domains, max actions, hours, HTTP method/URL, attachments, approval triggers
- Persistent audit (`ACR_AUDIT_PATH`) and approval store (`ACR_APPROVAL_PATH`)
- Documentation and runnable examples

[0.1.0]: https://github.com/agent-capability-runtime/Agent_Capability_Runtime/releases/tag/v0.1.0
