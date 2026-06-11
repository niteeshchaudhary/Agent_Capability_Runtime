package acr

// PolicyBuilder builds capability constraints using a fluent API.
type PolicyBuilder struct {
	tool         string
	constraints  map[string]any
	grantExpires any
}

// Can starts building a policy for a tool.
func Can(tool string) *PolicyBuilder {
	return &PolicyBuilder{
		tool:        tool,
		constraints: map[string]any{},
	}
}

// OnlyDomain restricts gmail.send to a single recipient domain.
func (p *PolicyBuilder) OnlyDomain(domain string) *PolicyBuilder {
	return p.OnlyDomains(domain)
}

// OnlyDomains restricts gmail.send to allowed recipient domains.
func (p *PolicyBuilder) OnlyDomains(domains ...string) *PolicyBuilder {
	existing, _ := p.constraints["allowedDomains"].([]string)
	p.constraints["allowedDomains"] = append(existing, domains...)
	return p
}

// Limit sets maxActions (alias).
func (p *PolicyBuilder) Limit(maxActions int) *PolicyBuilder {
	p.constraints["maxActions"] = maxActions
	return p
}

// MaxSpend sets spendingLimit in USD cents.
func (p *PolicyBuilder) MaxSpend(cents int) *PolicyBuilder {
	p.constraints["spendingLimit"] = cents
	return p
}

// ExpiresIn sets token TTL for grant (e.g. "10m", "1h").
func (p *PolicyBuilder) ExpiresIn(duration any) *PolicyBuilder {
	p.grantExpires = duration
	return p
}

// RequireApproval requires human approval before execution.
func (p *PolicyBuilder) RequireApproval() *PolicyBuilder {
	p.constraints["approvalRequired"] = true
	return p
}

// NoAttachments disallows email attachments.
func (p *PolicyBuilder) NoAttachments() *PolicyBuilder {
	p.constraints["attachments"] = false
	return p
}

// Build returns the constraint map.
func (p *PolicyBuilder) Build() map[string]any {
	out := make(map[string]any, len(p.constraints))
	for k, v := range p.constraints {
		out[k] = v
	}
	return out
}

// ToGrantInput builds a grant request body for Client.Grant.
func (p *PolicyBuilder) ToGrantInput(agentID string) map[string]any {
	input := map[string]any{
		"agentId":     agentID,
		"tool":        p.tool,
		"constraints": p.Build(),
	}
	if p.grantExpires != nil {
		input["expiresIn"] = p.grantExpires
	}
	return input
}
