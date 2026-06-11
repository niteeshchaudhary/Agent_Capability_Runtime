package acr_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	acr "github.com/agent-capability-runtime/acr-sdk-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGrant(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/capabilities/grant", r.URL.Path)
		assert.Equal(t, "Bearer admin-key", r.Header.Get("Authorization"))

		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"token":     "tok_123",
			"claims":    map[string]any{"sub": "agent_1", "tool": "gmail.send"},
			"expiresAt": "2026-12-31T23:59:59Z",
		})
	}))
	defer srv.Close()

	client := acr.NewClient(srv.URL, acr.WithAdminAPIKey("admin-key"))
	grant, err := client.Grant(context.Background(), acr.Can("gmail.send").
		OnlyDomain("company.com").
		Limit(5).
		ToGrantInput("agent_1"))

	require.NoError(t, err)
	assert.Equal(t, "tok_123", grant.Token)
}

func TestExecuteAllow(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/runtime/execute", r.URL.Path)
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"decision": "ALLOW",
			"result":   map[string]any{"status": "sent"},
			"auditId":  "aud_1",
		})
	}))
	defer srv.Close()

	client := acr.NewClient(srv.URL)
	result, err := client.Execute(context.Background(), acr.ExecuteInput{
		Token:   "tok",
		Tool:    "gmail.send",
		Payload: map[string]any{"to": "a@company.com"},
	})

	require.NoError(t, err)
	assert.True(t, result.OK)
	assert.Equal(t, "ALLOW", result.Decision)
}

func TestExecuteDeny(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"decision": "DENY",
			"reason":   "external domain blocked",
			"auditId":  "aud_2",
			"code":     "policy_denied",
		})
	}))
	defer srv.Close()

	client := acr.NewClient(srv.URL)
	result, err := client.Execute(context.Background(), acr.ExecuteInput{
		Token:   "tok",
		Tool:    "gmail.send",
		Payload: map[string]any{"to": "a@gmail.com"},
	})

	require.NoError(t, err)
	assert.False(t, result.OK)
	assert.Equal(t, "DENY", result.Decision)
	assert.Equal(t, "policy_denied", result.Code)
}

func TestHealth(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/health", r.URL.Path)
		_ = json.NewEncoder(w).Encode(map[string]any{"status": "ok", "version": "0.1.0"})
	}))
	defer srv.Close()

	client := acr.NewClient(srv.URL)
	health, err := client.Health(context.Background())

	require.NoError(t, err)
	assert.Equal(t, "ok", health["status"])
}
