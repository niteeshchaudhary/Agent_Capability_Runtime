package acr

import "strings"

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

// AllowedMethods restricts http.request to HTTP methods.
func (p *PolicyBuilder) AllowedMethods(methods ...string) *PolicyBuilder {
	if p.tool != "http.request" {
		panic("AllowedMethods is only valid for http.request")
	}
	existing, _ := p.constraints["allowedMethods"].([]string)
	for _, m := range methods {
		existing = append(existing, strings.ToUpper(m))
	}
	p.constraints["allowedMethods"] = existing
	return p
}

// AllowedUrls restricts http.request to URL allowlist entries.
func (p *PolicyBuilder) AllowedUrls(urls ...string) *PolicyBuilder {
	if p.tool != "http.request" {
		panic("AllowedUrls is only valid for http.request")
	}
	existing, _ := p.constraints["allowedUrls"].([]string)
	p.constraints["allowedUrls"] = append(existing, urls...)
	return p
}

// AllowedHours restricts execution to a UTC hour window.
func (p *PolicyBuilder) AllowedHours(start, end int) *PolicyBuilder {
	p.constraints["allowedHours"] = map[string]any{"start": start, "end": end}
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

// SpendingLimit is an alias for MaxSpend.
func (p *PolicyBuilder) SpendingLimit(cents int) *PolicyBuilder {
	return p.MaxSpend(cents)
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

// RequireApprovalIfExternal requires approval for external recipients.
func (p *PolicyBuilder) RequireApprovalIfExternal() *PolicyBuilder {
	p.constraints["approvalRequiredIfExternal"] = true
	return p
}

// WhenIntent allows executions matching an intent category.
func (p *PolicyBuilder) WhenIntent(category string) *PolicyBuilder {
	existing, _ := p.constraints["allowedIntentCategories"].([]string)
	p.constraints["allowedIntentCategories"] = append(existing, category)
	return p
}

// WhenIntentAction allows a specific intent category + action pair.
func (p *PolicyBuilder) WhenIntentAction(category, action string) *PolicyBuilder {
	p.WhenIntent(category)
	existing, _ := p.constraints["allowedIntentActions"].([]string)
	p.constraints["allowedIntentActions"] = append(existing, action)
	return p
}

// NoAttachments disallows email attachments.
func (p *PolicyBuilder) NoAttachments() *PolicyBuilder {
	p.constraints["attachments"] = false
	return p
}

// WithConstraints merges raw constraint keys (escape hatch).
func (p *PolicyBuilder) WithConstraints(extra map[string]any) *PolicyBuilder {
	for k, v := range extra {
		p.constraints[k] = v
	}
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
