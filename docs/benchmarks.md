# Performance benchmarks

Rough **median (p50)** latencies from a single Node.js process on a developer machine. Your numbers will vary by CPU, Node version, and adapter mode (`stub` vs live APIs).

Regenerate:

```bash
pnpm build
pnpm benchmark
```

Last run: Windows / Node 22, `stub` adapters, `n=500` per operation.

| Operation | p50 (ms) | Notes |
|-----------|----------|--------|
| JWT grant | ~0.24 | HS256, single tool |
| JWT validate | ~0.21 | Signature + claims |
| Policy evaluate | ~0.005 | Compiled AST, domain check |
| Revoke lookup | ~0.001 | In-memory store (default) |
| Runtime execute ALLOW | ~0.28 | Validate + policy + stub adapter |
| Runtime execute DENY | ~0.31 | Fails at policy before adapter |

## What this means

- **Hot path overhead** for an allowed execute is sub-millisecond policy + low single-digit ms total in-process with stub adapters.
- **Live adapters** (Gmail, Slack, HTTP) dominate latency — network RTT is orders of magnitude larger than ACR core.
- **Redis revocation** adds one network round-trip per execute when `ACR_REVOCATION_MODE=redis` (see [distributed-revocation.md](./distributed-revocation.md)).

## Not benchmarked here

- Distributed consumption ledger (Redis)
- Signed audit hash chain signing
- RS256 / EdDSA vs HS256 (see [signing-algorithms.md](./signing-algorithms.md))
- Gateway HTTP serialization

Treat these as integration benchmarks in your deployment environment.
