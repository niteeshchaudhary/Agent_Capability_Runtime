# ACR Go SDK

**Go client for [Agent Capability Runtime](https://github.com/agent-capability-runtime/Agent_Capability_Runtime)** — runtime-enforced capability permissions for AI agents.

## Install

```bash
go get github.com/agent-capability-runtime/acr-sdk-go
```

Or from this monorepo:

```bash
cd packages/sdk-go
go test ./...
```

## Quick start

```go
package main

import (
	"context"
	"fmt"
	"log"

	acr "github.com/agent-capability-runtime/acr-sdk-go"
)

func main() {
	client := acr.NewClient("http://localhost:3000")

	grant, err := client.Grant(context.Background(), acr.Can("gmail.send").
		OnlyDomain("company.com").
		Limit(5).
		ExpiresIn("10m").
		ToGrantInput("support_agent"))
	if err != nil {
		log.Fatal(err)
	}

	result, err := client.Execute(context.Background(), acr.ExecuteInput{
		Token:   grant.Token,
		Tool:    "gmail.send",
		Payload: map[string]any{"to": "user@company.com", "subject": "Hello"},
	})
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println(result.Decision) // ALLOW
}
```

## API

| Method | Description |
|--------|-------------|
| `Grant` | Issue capability token |
| `Execute` | Run tool through runtime |
| `Delegate` | Delegate to child agent |
| `Revoke` | Revoke capability |
| `ListApprovals` | List approval requests |
| `Approve` / `Reject` | Resolve approvals |
| `ListAudit` | Query audit log |
| `VerifyAuditChain` | Verify tamper-evident audit hash chain |
| `Health` | Gateway health check |

## Fluent DSL

```go
acr.Can("gmail.send").
    OnlyDomain("company.com").
    MaxSpend(10_000).
    WhenIntent("customer_support").
    Limit(5).
    ExpiresIn("10m")

acr.Can("http.request").
    AllowedMethods("GET", "POST").
    AllowedUrls("https://api.example.com")
```

## Gateway e2e

```bash
ACR_RUN_E2E=1 go test ./... -v -run TestGateway
```

## Requirements

- Go 1.22+
- Running ACR gateway (`pnpm dev:gateway`)

## License

MIT — see [LICENSE](../../LICENSE)
