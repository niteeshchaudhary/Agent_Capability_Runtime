package acr

import (
	"encoding/json"
	"testing"
)

func burgerScopeInput() QueryScopeConfigInput {
	enabled := true
	return QueryScopeConfigInput{
		Enabled: &enabled,
		Purpose: "Burger shop assistant",
		AllowedTopics: mustRawMessages([]any{
			map[string]any{"id": "menu", "keywords": []string{"menu", "burger", "fries", "combo", "price"}},
			map[string]any{"id": "orders", "keywords": []string{"order", "delivery", "pickup", "catering"}},
			map[string]any{"id": "hours", "keywords": []string{"hours", "open", "close", "location", "address"}},
		}),
		DeniedTopics: mustRawMessages([]any{
			map[string]any{"id": "coding", "keywords": []string{"python", "javascript", "write code", "programming"}},
		}),
		DenyPatterns:   []string{`\b(homework|essay)\b`},
		RefusalMessage: "I only help with menu, orders, hours, and locations.",
	}
}

func mustRawMessages(items []any) []json.RawMessage {
	out := make([]json.RawMessage, len(items))
	for i, item := range items {
		b, err := json.Marshal(item)
		if err != nil {
			panic(err)
		}
		out[i] = b
	}
	return out
}

func TestDisabledScopeGuard(t *testing.T) {
	g := DisabledScopeGuard()
	if !g.Check("write python code").Allowed {
		t.Fatal("expected allowed when disabled")
	}
}

func TestScopeAllowsOnTopic(t *testing.T) {
	g, err := FromScopeConfig(burgerScopeInput())
	if err != nil {
		t.Fatal(err)
	}
	result := g.Check("What's on the lunch menu?")
	if !result.Allowed || result.MatchedTopic != "menu" {
		t.Fatalf("expected menu match, got %+v", result)
	}
}

func TestScopeDeniesCoding(t *testing.T) {
	g, err := FromScopeConfig(burgerScopeInput())
	if err != nil {
		t.Fatal(err)
	}
	result := g.Check("Write me a Python script to sort a list")
	if result.Allowed || result.BlockedBy != "coding" {
		t.Fatalf("expected coding deny, got %+v", result)
	}
}

func TestScopeDeniesOffTopic(t *testing.T) {
	g, err := FromScopeConfig(burgerScopeInput())
	if err != nil {
		t.Fatal(err)
	}
	result := g.Check("Explain quantum physics")
	if result.Allowed || result.BlockedBy != "out_of_scope" {
		t.Fatalf("expected out_of_scope, got %+v", result)
	}
}

func TestScopeDenyPattern(t *testing.T) {
	g, err := FromScopeConfig(burgerScopeInput())
	if err != nil {
		t.Fatal(err)
	}
	if g.Check("Help with my homework essay").Allowed {
		t.Fatal("expected deny pattern match")
	}
}

func TestScopeAllowsGreeting(t *testing.T) {
	g, err := FromScopeConfig(burgerScopeInput())
	if err != nil {
		t.Fatal(err)
	}
	if !g.Check("Hello!").Allowed || !g.Check("Hi there").Allowed {
		t.Fatal("expected greeting allowed")
	}
}

func TestScopeCheckOrRefuse(t *testing.T) {
	g, err := FromScopeConfig(burgerScopeInput())
	if err != nil {
		t.Fatal(err)
	}
	if g.CheckOrRefuse("What's the burger combo price?") != "" {
		t.Fatal("expected empty refusal for allowed query")
	}
	if g.CheckOrRefuse("Teach me JavaScript") != "I only help with menu, orders, hours, and locations." {
		t.Fatal("expected custom refusal message")
	}
}

func TestScopeDenyOnlyMode(t *testing.T) {
	enabled := true
	g, err := FromScopeConfig(QueryScopeConfigInput{
		Enabled:   &enabled,
		MatchMode: ScopeMatchDenyOnly,
		DeniedTopics: mustRawMessages([]any{
			map[string]any{"id": "coding", "keywords": []string{"python"}},
		}),
	})
	if err != nil {
		t.Fatal(err)
	}
	if !g.Check("Tell me about burgers").Allowed {
		t.Fatal("expected allow in deny_only mode")
	}
	if g.Check("Python tutorial").Allowed {
		t.Fatal("expected deny for python in deny_only mode")
	}
}

func TestScopeTopicShorthand(t *testing.T) {
	enabled := true
	g, err := FromScopeConfig(QueryScopeConfigInput{
		Enabled:       &enabled,
		AllowedTopics: mustRawMessages([]any{"pizza"}),
	})
	if err != nil {
		t.Fatal(err)
	}
	if !g.Check("Do you sell pizza?").Allowed {
		t.Fatal("expected pizza shorthand topic to match")
	}
}

func TestScopeInvalidMatchMode(t *testing.T) {
	_, err := FromScopeConfig(QueryScopeConfigInput{MatchMode: "invalid"})
	if err == nil {
		t.Fatal("expected invalid match_mode error")
	}
}
