# Example OPA/Rego policies for Agent Capability Runtime
#
# Load with:
#   ACR_OPA_BUNDLE_PATH=packages/policy-engine/examples/opa/acr.rego
# or serve via OPA server:
#   opa run --server packages/policy-engine/examples/opa/
#
# Query path (default): data.acr.decision

package acr

import rego.v1

# Default: allow when no org rule fires (additive layer on top of ACR JWT constraints).
default decision := {"decision": "ALLOW"}

# Block sensitive recipients on gmail.send
decision := {
	"decision": "DENY",
	"reason": sprintf("recipient %s blocked by org policy", [input.payload.to]),
} if {
	input.tool == "gmail.send"
	input.payload.to
	endswith(input.payload.to, "@blocked.example")
}

# Require approval for high-volume agents
decision := {
	"decision": "REQUIRE_APPROVAL",
	"reason": "action count exceeds org threshold — manager approval required",
} if {
	input.action_count >= 50
	not input.approval_granted
}

# Deny dangerous HTTP hosts even if JWT allows the tool
decision := {
	"decision": "DENY",
	"reason": sprintf("host %s blocked by org policy", [input.payload.url]),
} if {
	input.tool == "http.request"
	input.payload.url
	contains(input.payload.url, "evil.example")
}

# Block agents from running in simulate mode for payment tools (audit-only shops use shadow at gateway)
decision := {
	"decision": "DENY",
	"reason": "simulate not permitted for payment tools",
} if {
	input.simulate == true
	input.tool == "stripe.charge"
}
