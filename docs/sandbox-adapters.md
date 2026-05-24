# Sandbox adapter framework (v1)

ACR wraps every adapter invocation in a **sandbox layer** after policy allows execution. This is defense-in-depth — not a VM or WASM isolate (those are future work).

## What v1 enforces

| Control | Applies to | Default |
|---------|------------|---------|
| Execution timeout | All tools | 30s |
| SSRF / private network block | `http.request` | On |
| Max HTTP response body | `http.request` | 1 MiB |
| Optional tool allowlist | All tools | Off (token scopes tool) |

Policy still governs domains, URLs, methods, and intent **before** the sandbox runs.

## Configuration

```typescript
const runtime = new AgentCapabilityRuntime({
  secret,
  sandbox: {
    enabled: true,
    executionTimeoutMs: 30_000,
    maxHttpResponseBytes: 1_048_576,
    blockPrivateNetworks: true,
  },
});
```

### Environment (gateway)

```bash
ACR_SANDBOX_ENABLED=true          # default true; set false to disable
ACR_SANDBOX_TIMEOUT_MS=30000
ACR_SANDBOX_MAX_HTTP_BYTES=1048576
ACR_SANDBOX_BLOCK_PRIVATE=true    # block 127.0.0.1, RFC1918, metadata hosts
```

## Deny semantics

Sandbox violations return `DENY` with `code: "sandbox_denied"` and audit reason prefixed with `sandbox:`.

Examples:

- `http://127.0.0.1/...` → network denied (even if policy `allowedUrls` were misconfigured)
- Adapter exceeds timeout → `timeout`
- Oversized HTTP body → `response_too_large`

## What is NOT in v1

- Firecracker / gVisor / WASM process isolation
- Per-adapter filesystem sandboxes
- DNS rebinding protection
- Automatic `SANDBOX` policy AST decision (reserved in RFC-0002)

## Related

- [THREAT_MODEL.md](../THREAT_MODEL.md) — adapter trust boundaries
- [RFC-0002](./rfc/RFC-0002-runtime-execution.md) — execute pipeline
