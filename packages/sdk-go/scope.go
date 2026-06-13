package acr

import (
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strings"
)

// ScopeMatchMode controls how allowed topics are evaluated.
type ScopeMatchMode string

const (
	ScopeMatchAnyAllowed ScopeMatchMode = "any_allowed"
	ScopeMatchDenyOnly   ScopeMatchMode = "deny_only"
)

const defaultScopeRefusal = "I can only help with topics related to my purpose. Please ask something within that scope."

var greetingPattern = regexp.MustCompile(`(?i)^(hi|hello|hey|thanks|thank you|ok|okay|bye|goodbye|good morning|good evening)(\s|!|\?|\.|$)`)

// TopicRule is one allowed or denied topic bucket.
type TopicRule struct {
	ID          string   `json:"id"`
	Description string   `json:"description,omitempty"`
	Keywords    []string `json:"keywords,omitempty"`
	Patterns    []string `json:"patterns,omitempty"`
}

// TopicRuleInput accepts YAML/JSON topic definitions (id or name, keywords or terms).
type TopicRuleInput struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Keywords    []string `json:"keywords"`
	Terms       []string `json:"terms"`
	Patterns    []string `json:"patterns"`
}

// QueryScopeConfigInput is the declarative scope configuration.
type QueryScopeConfigInput struct {
	Enabled         *bool            `json:"enabled"`
	Purpose         string           `json:"purpose"`
	AllowedTopics   []json.RawMessage `json:"allowed_topics"`
	DeniedTopics    []json.RawMessage `json:"denied_topics"`
	DenyPatterns    []string         `json:"deny_patterns"`
	AllowGreetings  *bool            `json:"allow_greetings"`
	AllowEmpty      *bool            `json:"allow_empty"`
	MatchMode       ScopeMatchMode   `json:"match_mode"`
	RefusalMessage  string           `json:"refusal_message"`
}

// QueryScopeConfig is the normalized scope configuration.
type QueryScopeConfig struct {
	Enabled        bool
	Purpose        string
	AllowedTopics  []TopicRule
	DeniedTopics   []TopicRule
	DenyPatterns   []string
	AllowGreetings bool
	AllowEmpty     bool
	MatchMode      ScopeMatchMode
	RefusalMessage string
}

// ScopeResult is the outcome of a scope check.
type ScopeResult struct {
	Allowed      bool
	Reason       string
	MatchedTopic string
	BlockedBy    string
}

type compiledTopic struct {
	rule            TopicRule
	keywordPatterns []*regexp.Regexp
	regexPatterns   []*regexp.Regexp
}

type compiledDenyPattern struct {
	pattern *regexp.Regexp
	label   string
}

// QueryScopeGuard filters user queries before they reach an LLM (zero LLM cost).
type QueryScopeGuard struct {
	config      QueryScopeConfig
	denyRegexes []compiledDenyPattern
	allowed     []compiledTopic
	denied      []compiledTopic
}

// DisabledScopeGuard returns a passthrough guard that always allows.
func DisabledScopeGuard() *QueryScopeGuard {
	return NewQueryScopeGuard(QueryScopeConfig{Enabled: false, RefusalMessage: defaultScopeRefusal})
}

// NewQueryScopeGuard builds a guard from normalized config.
func NewQueryScopeGuard(config QueryScopeConfig) *QueryScopeGuard {
	if config.RefusalMessage == "" {
		config.RefusalMessage = defaultScopeRefusal
	}
	if config.MatchMode == "" {
		config.MatchMode = ScopeMatchAnyAllowed
	}
	guard := &QueryScopeGuard{config: config}
	for _, p := range config.DenyPatterns {
		guard.denyRegexes = append(guard.denyRegexes, compiledDenyPattern{
			pattern: mustCompilePattern(p),
			label:   p,
		})
	}
	for _, rule := range config.AllowedTopics {
		guard.allowed = append(guard.allowed, compileTopicRule(rule))
	}
	for _, rule := range config.DeniedTopics {
		guard.denied = append(guard.denied, compileTopicRule(rule))
	}
	return guard
}

// FromScopeConfig parses declarative scope config (e.g. from JSON/YAML `scope` block).
func FromScopeConfig(input QueryScopeConfigInput) (*QueryScopeGuard, error) {
	enabled := true
	if input.Enabled != nil {
		enabled = *input.Enabled
	}
	allowGreetings := true
	if input.AllowGreetings != nil {
		allowGreetings = *input.AllowGreetings
	}
	allowEmpty := true
	if input.AllowEmpty != nil {
		allowEmpty = *input.AllowEmpty
	}
	matchMode := input.MatchMode
	if matchMode == "" {
		matchMode = ScopeMatchAnyAllowed
	}
	if matchMode != ScopeMatchAnyAllowed && matchMode != ScopeMatchDenyOnly {
		return nil, fmt.Errorf("match_mode must be 'any_allowed' or 'deny_only'")
	}

	allowed, err := parseTopicRules(input.AllowedTopics)
	if err != nil {
		return nil, err
	}
	denied, err := parseTopicRules(input.DeniedTopics)
	if err != nil {
		return nil, err
	}

	refusal := input.RefusalMessage
	if refusal == "" {
		refusal = defaultScopeRefusal
	}

	return NewQueryScopeGuard(QueryScopeConfig{
		Enabled:        enabled,
		Purpose:        input.Purpose,
		AllowedTopics:  allowed,
		DeniedTopics:   denied,
		DenyPatterns:   input.DenyPatterns,
		AllowGreetings: allowGreetings,
		AllowEmpty:     allowEmpty,
		MatchMode:      matchMode,
		RefusalMessage: refusal,
	}), nil
}

// LoadScopeJSON loads scope config from a JSON file (top-level `scope` or scope-only root).
func LoadScopeJSON(path string) (*QueryScopeGuard, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}
	block, ok := raw["scope"]
	if !ok {
		block = data
	}
	var input QueryScopeConfigInput
	if err := json.Unmarshal(block, &input); err != nil {
		return nil, err
	}
	return FromScopeConfig(input)
}

// Enabled reports whether scope checking is active.
func (g *QueryScopeGuard) Enabled() bool {
	return g.config.Enabled
}

// Purpose returns the documented agent purpose string.
func (g *QueryScopeGuard) Purpose() string {
	return g.config.Purpose
}

// RefusalMessage returns the user-facing refusal text.
func (g *QueryScopeGuard) RefusalMessage() string {
	return g.config.RefusalMessage
}

// Check returns whether the query may proceed to the LLM.
func (g *QueryScopeGuard) Check(query string) ScopeResult {
	if !g.config.Enabled {
		return ScopeResult{Allowed: true, Reason: "scope guard disabled"}
	}

	text := strings.TrimSpace(query)
	normalized := strings.ToLower(text)

	if text == "" {
		if g.config.AllowEmpty {
			return ScopeResult{Allowed: true, Reason: "empty query allowed"}
		}
		return ScopeResult{Allowed: false, Reason: "empty query not allowed", BlockedBy: "empty"}
	}

	if g.config.AllowGreetings && greetingPattern.MatchString(text) {
		return ScopeResult{Allowed: true, Reason: "greeting allowed", MatchedTopic: "greeting"}
	}

	for _, compiled := range g.denyRegexes {
		if compiled.pattern.MatchString(text) {
			return ScopeResult{
				Allowed:   false,
				Reason:    "matched deny pattern: " + compiled.label,
				BlockedBy: compiled.label,
			}
		}
	}

	for _, compiled := range g.denied {
		if topicMatches(compiled, normalized, text) {
			return ScopeResult{
				Allowed:   false,
				Reason:    "matched denied topic: " + compiled.rule.ID,
				BlockedBy: compiled.rule.ID,
			}
		}
	}

	if g.config.MatchMode == ScopeMatchDenyOnly {
		return ScopeResult{Allowed: true, Reason: "deny-only mode, no deny match"}
	}

	if len(g.allowed) == 0 {
		return ScopeResult{Allowed: true, Reason: "no allowed_topics configured"}
	}

	for _, compiled := range g.allowed {
		if topicMatches(compiled, normalized, text) {
			return ScopeResult{
				Allowed:      true,
				Reason:       "matched allowed topic: " + compiled.rule.ID,
				MatchedTopic: compiled.rule.ID,
			}
		}
	}

	return ScopeResult{
		Allowed:   false,
		Reason:    "query does not match any allowed topic",
		BlockedBy: "out_of_scope",
	}
}

// CheckOrRefuse returns refusal text if denied, else empty string (safe to call LLM).
func (g *QueryScopeGuard) CheckOrRefuse(query string) string {
	result := g.Check(query)
	if result.Allowed {
		return ""
	}
	return g.config.RefusalMessage
}

func parseTopicRules(raw []json.RawMessage) ([]TopicRule, error) {
	rules := make([]TopicRule, 0, len(raw))
	for _, item := range raw {
		var asString string
		if err := json.Unmarshal(item, &asString); err == nil {
			rules = append(rules, TopicRule{ID: asString, Keywords: []string{strings.ToLower(asString)}})
			continue
		}
		var input TopicRuleInput
		if err := json.Unmarshal(item, &input); err != nil {
			return nil, fmt.Errorf("invalid topic rule: %w", err)
		}
		id := input.ID
		if id == "" {
			id = input.Name
		}
		if id == "" {
			return nil, fmt.Errorf("topic rule requires 'id' or 'name'")
		}
		keywords := input.Keywords
		if len(keywords) == 0 {
			keywords = input.Terms
		}
		normalized := make([]string, 0, len(keywords))
		for _, kw := range keywords {
			normalized = append(normalized, strings.ToLower(kw))
		}
		rules = append(rules, TopicRule{
			ID:          id,
			Description: input.Description,
			Keywords:    normalized,
			Patterns:    input.Patterns,
		})
	}
	return rules, nil
}

func compileTopicRule(rule TopicRule) compiledTopic {
	keywords := make([]*regexp.Regexp, 0, len(rule.Keywords))
	for _, kw := range rule.Keywords {
		kw = strings.TrimSpace(kw)
		if kw == "" {
			continue
		}
		keywords = append(keywords, regexp.MustCompile("(?i)"+regexp.QuoteMeta(strings.ToLower(kw))))
	}
	regexPatterns := make([]*regexp.Regexp, 0, len(rule.Patterns))
	for _, p := range rule.Patterns {
		regexPatterns = append(regexPatterns, mustCompilePattern(p))
	}
	return compiledTopic{rule: rule, keywordPatterns: keywords, regexPatterns: regexPatterns}
}

func mustCompilePattern(pattern string) *regexp.Regexp {
	re, err := regexp.Compile("(?i)" + pattern)
	if err != nil {
		panic(fmt.Errorf("invalid pattern %q: %w", pattern, err))
	}
	return re
}

func topicMatches(compiled compiledTopic, normalized, original string) bool {
	for _, pattern := range compiled.keywordPatterns {
		if pattern.MatchString(normalized) {
			return true
		}
	}
	for _, pattern := range compiled.regexPatterns {
		if pattern.MatchString(original) {
			return true
		}
	}
	return false
}
