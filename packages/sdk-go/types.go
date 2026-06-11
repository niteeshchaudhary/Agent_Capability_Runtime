package acr

// GrantResponse is returned from grant and delegate operations.
type GrantResponse struct {
	Token     string         `json:"token"`
	Claims    map[string]any `json:"claims"`
	ExpiresAt string         `json:"expiresAt"`
}

// ExecuteInput is the input for a runtime execute call.
type ExecuteInput struct {
	Token      string
	Tool       string
	Payload    map[string]any
	ApprovalID string
	RequestID  string
	TraceID    string
	SessionID  string
	Intent     any
	Simulate   bool
}

// ExecuteResult is the parsed response from POST /runtime/execute.
type ExecuteResult struct {
	OK         bool
	Decision   string
	Result     any
	Reason     string
	AuditID    string
	ApprovalID string
	Code       string
}

// ApprovalRequest is a pending or resolved approval record.
type ApprovalRequest struct {
	ID        string         `json:"id"`
	AgentID   string         `json:"agentId"`
	Tool      string         `json:"tool"`
	Payload   map[string]any `json:"payload,omitempty"`
	Status    string         `json:"status"`
	CreatedAt string         `json:"createdAt,omitempty"`
}

// AuditQuery filters audit log queries.
type AuditQuery struct {
	AgentID  string
	Tool     string
	Decision string
	Since    string
	Until    string
	Limit    int
}

// AuditEvent is a single audit log entry.
type AuditEvent struct {
	ID        string         `json:"id,omitempty"`
	AgentID   string         `json:"agentId,omitempty"`
	Tool      string         `json:"tool,omitempty"`
	Decision  string         `json:"decision,omitempty"`
	Reason    string         `json:"reason,omitempty"`
	Timestamp string         `json:"timestamp,omitempty"`
	Payload   map[string]any `json:"payload,omitempty"`
}
