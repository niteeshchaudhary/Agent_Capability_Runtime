package acr_test

import (
	"context"
	"os"
	"testing"

	acr "github.com/agent-capability-runtime/acr-sdk-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func gatewayURL() string {
	if u := os.Getenv("ACR_GATEWAY_URL"); u != "" {
		return u
	}
	return "http://localhost:3000"
}

func skipUnlessE2E(t *testing.T) {
	t.Helper()
	if os.Getenv("ACR_RUN_E2E") != "1" {
		t.Skip("Set ACR_RUN_E2E=1 and start gateway (pnpm dev:gateway)")
	}
}

func TestGatewayGrantAllowDeny(t *testing.T) {
	skipUnlessE2E(t)

	ctx := context.Background()
	client := acr.NewClient(gatewayURL())

	health, err := client.Health(ctx)
	require.NoError(t, err)
	assert.Equal(t, "ok", health["status"])

	grant, err := client.Grant(ctx, acr.Can("gmail.send").
		OnlyDomain("company.com").
		Limit(3).
		ExpiresIn("15m").
		ToGrantInput("go_e2e_agent"))
	require.NoError(t, err)
	require.NotEmpty(t, grant.Token)

	allowed, err := client.Execute(ctx, acr.ExecuteInput{
		Token:   grant.Token,
		Tool:    "gmail.send",
		Payload: map[string]any{"to": "alice@company.com", "subject": "Hi", "body": "x"},
	})
	require.NoError(t, err)
	assert.True(t, allowed.OK)
	assert.Equal(t, "ALLOW", allowed.Decision)

	denied, err := client.Execute(ctx, acr.ExecuteInput{
		Token:   grant.Token,
		Tool:    "gmail.send",
		Payload: map[string]any{"to": "bob@gmail.com", "subject": "Hi", "body": "x"},
	})
	require.NoError(t, err)
	assert.False(t, denied.OK)
	assert.Equal(t, "DENY", denied.Decision)
}
