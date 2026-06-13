package acr_test

import (
	"testing"

	acr "github.com/agent-capability-runtime/acr-sdk-go"
	"github.com/stretchr/testify/assert"
)

func TestCanToGrantInput(t *testing.T) {
	input := acr.Can("gmail.send").
		OnlyDomain("company.com").
		Limit(5).
		MaxSpend(10_000).
		WhenIntent("customer_support").
		ExpiresIn("10m").
		ToGrantInput("agent_1")

	assert.Equal(t, "agent_1", input["agentId"])
	assert.Equal(t, "gmail.send", input["tool"])
	assert.Equal(t, "10m", input["expiresIn"])

	constraints := input["constraints"].(map[string]any)
	assert.Equal(t, []string{"company.com"}, constraints["allowedDomains"])
	assert.Equal(t, 5, constraints["maxActions"])
	assert.Equal(t, 10_000, constraints["spendingLimit"])
	assert.Equal(t, []string{"customer_support"}, constraints["allowedIntentCategories"])
}

func TestCanHttpConstraints(t *testing.T) {
	input := acr.Can("http.request").
		AllowedMethods("GET", "post").
		AllowedUrls("https://api.example.com").
		ToGrantInput("agent_http")

	constraints := input["constraints"].(map[string]any)
	assert.Equal(t, []string{"GET", "POST"}, constraints["allowedMethods"])
	assert.Equal(t, []string{"https://api.example.com"}, constraints["allowedUrls"])
}
