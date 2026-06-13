// Package acr provides a Go client for the Agent Capability Runtime gateway.
//
// Usage:
//
//	client := acr.NewClient("http://localhost:3000", acr.WithAdminAPIKey("secret"))
//
//	grant, err := client.Grant(ctx, acr.Can("gmail.send").
//		OnlyDomain("company.com").
//		Limit(5).
//		ExpiresIn("10m").
//		ToGrantInput("support_agent"))
//
//	result, err := client.Execute(ctx, acr.ExecuteInput{
//		Token:   grant.Token,
//		Tool:    "gmail.send",
//		Payload: map[string]any{"to": "attacker@gmail.com"},
//	})
//	// result.Decision == "DENY"
package acr

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Client is an HTTP client for the ACR gateway.
type Client struct {
	baseURL     string
	adminAPIKey string
	httpClient  *http.Client
	headers     map[string]string
}

// Option configures the Client.
type Option func(*Client)

// WithAdminAPIKey sets the Bearer token for grant/delegate endpoints.
func WithAdminAPIKey(key string) Option {
	return func(c *Client) { c.adminAPIKey = key }
}

// WithHTTPClient sets a custom http.Client.
func WithHTTPClient(hc *http.Client) Option {
	return func(c *Client) { c.httpClient = hc }
}

// WithHeaders sets extra headers sent with every request.
func WithHeaders(h map[string]string) Option {
	return func(c *Client) { c.headers = h }
}

// NewClient creates a new ACR gateway client.
func NewClient(baseURL string, opts ...Option) *Client {
	c := &Client{
		baseURL:    strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{Timeout: 30 * time.Second},
		headers:    map[string]string{},
	}
	for _, o := range opts {
		o(c)
	}
	return c
}

// ── Grant ───────────────────────────────────────────────────────────────────

// Grant issues a capability token.
func (c *Client) Grant(ctx context.Context, input map[string]any) (*GrantResponse, error) {
	resp, err := c.postJSON(ctx, "/capabilities/grant", input, true)
	if err != nil {
		return nil, fmt.Errorf("grant: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, parseError("grant", resp.StatusCode, body)
	}

	var gr GrantResponse
	if err := json.Unmarshal(body, &gr); err != nil {
		return nil, fmt.Errorf("grant: unmarshal: %w", err)
	}
	return &gr, nil
}

// ── Execute ─────────────────────────────────────────────────────────────────

// Execute sends a tool execution request through the ACR runtime.
func (c *Client) Execute(ctx context.Context, input ExecuteInput) (*ExecuteResult, error) {
	payload := map[string]any{
		"token":   input.Token,
		"tool":    input.Tool,
		"payload": input.Payload,
	}
	if input.ApprovalID != "" {
		payload["approvalId"] = input.ApprovalID
	}
	if input.RequestID != "" {
		payload["requestId"] = input.RequestID
	}
	if input.TraceID != "" {
		payload["traceId"] = input.TraceID
	}
	if input.SessionID != "" {
		payload["sessionId"] = input.SessionID
	}
	if input.Intent != nil {
		payload["intent"] = input.Intent
	}
	if input.Simulate {
		payload["simulate"] = true
	}

	resp, err := c.postJSON(ctx, "/runtime/execute", payload, false)
	if err != nil {
		return nil, fmt.Errorf("execute: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var data map[string]any
	if err := json.Unmarshal(body, &data); err != nil {
		return nil, fmt.Errorf("execute: unmarshal: %w", err)
	}

	return parseExecuteResult(resp.StatusCode, data), nil
}

// ── Delegate ────────────────────────────────────────────────────────────────

// Delegate creates a child capability token.
func (c *Client) Delegate(ctx context.Context, parentToken string, input map[string]any) (*GrantResponse, error) {
	payload := map[string]any{"parentToken": parentToken}
	for k, v := range input {
		payload[k] = v
	}

	resp, err := c.postJSON(ctx, "/capabilities/delegate", payload, true)
	if err != nil {
		return nil, fmt.Errorf("delegate: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, parseError("delegate", resp.StatusCode, body)
	}

	var gr GrantResponse
	if err := json.Unmarshal(body, &gr); err != nil {
		return nil, fmt.Errorf("delegate: unmarshal: %w", err)
	}
	return &gr, nil
}

// ── Revoke ──────────────────────────────────────────────────────────────────

// Revoke revokes a capability token.
func (c *Client) Revoke(ctx context.Context, capabilityID string, reason, revokedBy string) error {
	payload := map[string]any{"capabilityId": capabilityID}
	if reason != "" {
		payload["reason"] = reason
	}
	if revokedBy != "" {
		payload["revokedBy"] = revokedBy
	}

	resp, err := c.postJSON(ctx, "/capabilities/revoke", payload, true)
	if err != nil {
		return fmt.Errorf("revoke: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return parseError("revoke", resp.StatusCode, body)
	}
	return nil
}

// ── Approvals ───────────────────────────────────────────────────────────────

// ListApprovals lists approval requests.
func (c *Client) ListApprovals(ctx context.Context, status, agentID, tool string) ([]ApprovalRequest, error) {
	params := url.Values{}
	if status != "" {
		params.Set("status", status)
	}
	if agentID != "" {
		params.Set("agentId", agentID)
	}
	if tool != "" {
		params.Set("tool", tool)
	}

	resp, err := c.get(ctx, "/approvals", params)
	if err != nil {
		return nil, fmt.Errorf("list approvals: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var data struct {
		Approvals []ApprovalRequest `json:"approvals"`
	}
	if err := json.Unmarshal(body, &data); err != nil {
		return nil, fmt.Errorf("list approvals: unmarshal: %w", err)
	}
	return data.Approvals, nil
}

// Approve approves a pending approval request.
func (c *Client) Approve(ctx context.Context, approvalID, resolvedBy string) error {
	payload := map[string]any{}
	if resolvedBy != "" {
		payload["resolvedBy"] = resolvedBy
	}
	resp, err := c.postJSON(ctx, "/approvals/"+approvalID+"/approve", payload, false)
	if err != nil {
		return fmt.Errorf("approve: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return parseError("approve", resp.StatusCode, body)
	}
	return nil
}

// Reject rejects a pending approval request.
func (c *Client) Reject(ctx context.Context, approvalID, resolvedBy string) error {
	payload := map[string]any{}
	if resolvedBy != "" {
		payload["resolvedBy"] = resolvedBy
	}
	resp, err := c.postJSON(ctx, "/approvals/"+approvalID+"/reject", payload, false)
	if err != nil {
		return fmt.Errorf("reject: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return parseError("reject", resp.StatusCode, body)
	}
	return nil
}

// ── Audit ───────────────────────────────────────────────────────────────────

// ListAudit queries the audit log.
func (c *Client) ListAudit(ctx context.Context, query AuditQuery) ([]AuditEvent, error) {
	params := url.Values{}
	if query.AgentID != "" {
		params.Set("agentId", query.AgentID)
	}
	if query.Tool != "" {
		params.Set("tool", query.Tool)
	}
	if query.Decision != "" {
		params.Set("decision", query.Decision)
	}
	if query.Since != "" {
		params.Set("since", query.Since)
	}
	if query.Until != "" {
		params.Set("until", query.Until)
	}
	if query.Limit > 0 {
		params.Set("limit", fmt.Sprintf("%d", query.Limit))
	}

	resp, err := c.get(ctx, "/audit", params)
	if err != nil {
		return nil, fmt.Errorf("list audit: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var data struct {
		Events []AuditEvent `json:"events"`
	}
	if err := json.Unmarshal(body, &data); err != nil {
		return nil, fmt.Errorf("list audit: unmarshal: %w", err)
	}
	return data.Events, nil
}

// VerifyAuditChain checks the tamper-evident audit hash chain.
func (c *Client) VerifyAuditChain(ctx context.Context) (map[string]any, error) {
	resp, err := c.get(ctx, "/audit/verify", nil)
	if err != nil {
		return nil, fmt.Errorf("verify audit chain: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var data map[string]any
	if err := json.Unmarshal(body, &data); err != nil {
		return nil, fmt.Errorf("verify audit chain: unmarshal: %w", err)
	}
	return data, nil
}

// ── Health ──────────────────────────────────────────────────────────────────

// Health checks gateway health.
func (c *Client) Health(ctx context.Context) (map[string]any, error) {
	resp, err := c.get(ctx, "/health", nil)
	if err != nil {
		return nil, fmt.Errorf("health: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var data map[string]any
	if err := json.Unmarshal(body, &data); err != nil {
		return nil, fmt.Errorf("health: unmarshal: %w", err)
	}
	return data, nil
}

// ── Internal helpers ────────────────────────────────────────────────────────

func (c *Client) postJSON(ctx context.Context, path string, payload any, admin bool) (*http.Response, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if admin && c.adminAPIKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.adminAPIKey)
	}
	for k, v := range c.headers {
		req.Header.Set(k, v)
	}

	return c.httpClient.Do(req)
}

func (c *Client) get(ctx context.Context, path string, params url.Values) (*http.Response, error) {
	u := c.baseURL + path
	if len(params) > 0 {
		u += "?" + params.Encode()
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	for k, v := range c.headers {
		req.Header.Set(k, v)
	}

	return c.httpClient.Do(req)
}

func parseError(op string, status int, body []byte) error {
	var data struct {
		Message string `json:"message"`
	}
	if json.Unmarshal(body, &data) == nil && data.Message != "" {
		return fmt.Errorf("%s: %s (status %d)", op, data.Message, status)
	}
	return fmt.Errorf("%s: failed with status %d", op, status)
}

func parseExecuteResult(status int, data map[string]any) *ExecuteResult {
	decision, _ := data["decision"].(string)
	auditID, _ := data["auditId"].(string)

	r := &ExecuteResult{
		Decision: decision,
		AuditID:  auditID,
	}

	switch {
	case status == 200 && decision == "ALLOW":
		r.OK = true
		r.Result = data["result"]
	case status == 200 && decision == "SIMULATE":
		r.OK = true
		if reason, ok := data["reason"].(string); ok {
			r.Reason = reason
		}
	case status == 202 && decision == "REQUIRE_APPROVAL":
		r.OK = false
		if reason, ok := data["reason"].(string); ok {
			r.Reason = reason
		}
		if aid, ok := data["approvalId"].(string); ok {
			r.ApprovalID = aid
		}
	default:
		r.OK = false
		if reason, ok := data["reason"].(string); ok {
			r.Reason = reason
		}
		if code, ok := data["code"].(string); ok {
			r.Code = code
		}
	}

	return r
}
