# Capability token signing (HS256 / RS256 / EdDSA)

RFC-0001 supports symmetric and asymmetric JWS algorithms. **HS256 remains the default** for local development; production deployments should use **RS256** or **EdDSA**.

## Algorithms

| Algorithm | When to use | Issuer holds | Runtime holds |
|-----------|-------------|--------------|---------------|
| `HS256` | Dev, single-tenant | Shared secret | Same secret |
| `RS256` | Production (common) | Private key | Public key only |
| `EdDSA` | Production (preferred for new deploys) | Private key | Public key only |

## HS256 (default)

```bash
ACR_SIGNING_ALGORITHM=HS256
ACR_SIGNING_SECRET=your-secret-min-32-characters
```

```typescript
new AgentCapabilityRuntime({ secret: process.env.ACR_SIGNING_SECRET! });
```

## RS256 / EdDSA

Generate keys (example with OpenSSL for RS256):

```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

```bash
ACR_SIGNING_ALGORITHM=RS256
ACR_SIGNING_PRIVATE_KEY_PATH=./keys/private.pem
ACR_SIGNING_PUBLIC_KEY_PATH=./keys/public.pem
```

Or inline PEM (use `\n` for newlines in env files):

```bash
ACR_SIGNING_ALGORITHM=EdDSA
ACR_SIGNING_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
ACR_SIGNING_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n..."
```

Gateway / async runtime:

```typescript
import { createAgentCapabilityRuntime } from "@acr/runtime";

const runtime = await createAgentCapabilityRuntime({
  signing: {
    algorithm: "RS256",
    privateKey: fs.readFileSync("private.pem", "utf8"),
    publicKey: fs.readFileSync("public.pem", "utf8"),
  },
});
```

Runtimes that **only execute** (no grant) can use **public key only** via a custom `SigningMaterial` with a stub sign key — typically use `createAgentCapabilityRuntime` with full config on the gateway.

## Security notes

- `"alg": "none"` is rejected by `jose`
- Only the configured algorithm is accepted at verify time
- Rotate asymmetric keys by publishing new public keys before switching issuers

## Related

- [RFC-0001](./rfc/RFC-0001-capability-token.md) §4.2
