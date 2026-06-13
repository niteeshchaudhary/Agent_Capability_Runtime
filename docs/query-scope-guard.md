# Query scope guard

Block off-topic user prompts **before they reach the LLM** — zero LLM cost, fully configurable.

Use this when each agent has a narrow purpose (support bot, shop assistant, HR FAQ) and you want to:

- Refuse unrelated questions without paying for a model call
- Keep agents on-brand and on-task
- Complement **tool-level** ACR policies (`protect()`, `can()`, intent rules)

## How it fits

| Layer | When it runs | Blocks |
|-------|----------------|--------|
| **Query scope guard** | Before LLM | Off-topic chat ("write Python code" to a burger shop bot) |
| **ACR tool policies** | Before each tool call | Off-scope actions (wrong URL, intent, limits) |

## Quick start (Python)

```python
from acr.scope import QueryScopeGuard

guard = QueryScopeGuard.from_dict({
    "enabled": True,
    "purpose": "Burger shop customer assistant",
    "allowed_topics": [
        {"id": "menu", "keywords": ["menu", "burger", "fries", "price", "combo"]},
        {"id": "orders", "keywords": ["order", "delivery", "pickup"]},
        {"id": "hours", "keywords": ["hours", "open", "close", "location"]},
    ],
    "denied_topics": [
        {"id": "coding", "keywords": ["python", "javascript", "write code", "programming"]},
    ],
    "refusal_message": "I can only help with our menu, orders, hours, and locations.",
})

refusal = guard.check_or_refuse(user_message)
if refusal:
    return refusal  # skip LLM — saves cost

response = await llm.ainvoke(user_message)
```

## Quick start (TypeScript)

```typescript
import { QueryScopeGuard } from "@acr/sdk";

const guard = QueryScopeGuard.fromConfig({
  enabled: true,
  purpose: "Burger shop customer assistant",
  allowed_topics: [
    { id: "menu", keywords: ["menu", "burger", "fries", "price"] },
    { id: "orders", keywords: ["order", "delivery", "pickup"] },
  ],
  denied_topics: [{ id: "coding", keywords: ["python", "javascript", "write code"] }],
  refusal_message: "I can only help with our menu, orders, hours, and locations.",
});

const refusal = guard.checkOrRefuse(userMessage);
if (refusal) return refusal;

const response = await llm.invoke(userMessage);
```

Load from JSON: `await QueryScopeGuard.loadJson("policies/burgershop.scope.json")`

## Quick start (Go)

```go
guard, err := acr.FromScopeConfig(acr.QueryScopeConfigInput{
    Purpose: "Burger shop customer assistant",
    AllowedTopics: mustTopics(
        map[string]any{"id": "menu", "keywords": []string{"menu", "burger", "fries"}},
        map[string]any{"id": "orders", "keywords": []string{"order", "delivery"}},
    ),
    DeniedTopics: mustTopics(
        map[string]any{"id": "coding", "keywords": []string{"python", "javascript"}},
    ),
    RefusalMessage: "I can only help with menu, orders, hours, and locations.",
})
if err != nil { log.Fatal(err) }

if refusal := guard.CheckOrRefuse(userMessage); refusal != "" {
    return refusal
}
```

Load from JSON: `acr.LoadScopeJSON("policies/burgershop.scope.json")`

## YAML / JSON configuration

```yaml
scope:
  enabled: true
  purpose: Burger shop customer assistant
  match_mode: any_allowed   # or deny_only

  allowed_topics:
    - id: menu
      description: Menu and pricing questions
      keywords: [menu, burger, fries, combo, price, vegetarian]
    - id: orders
      keywords: [order, delivery, pickup, catering]

  denied_topics:
    - id: coding
      keywords: [python, javascript, programming, write code, script]

  deny_patterns:
    - "\\b(homework|essay)\\b"

  allow_greetings: true
  refusal_message: "I can only help with menu, orders, hours, and locations."
```

Load from file:

```python
guard = QueryScopeGuard.load("policies/burgershop.yaml")  # Python + PyYAML
```

```typescript
const guard = await QueryScopeGuard.loadJson("policies/burgershop.scope.json");
```

```go
guard, err := acr.LoadScopeJSON("policies/burgershop.scope.json")
```

Or embed `scope:` in your existing policy file and pass the dict to `from_dict()`.

## Configuration reference

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `true` | Set `false` to passthrough (no filtering) |
| `purpose` | — | Documentation string for your team |
| `allowed_topics` | `[]` | Query must match ≥1 topic (when `match_mode: any_allowed`) |
| `denied_topics` | `[]` | Always block if matched (checked first) |
| `deny_patterns` | `[]` | Regex patterns always blocked |
| `match_mode` | `any_allowed` | `deny_only` = allow unless denied |
| `allow_greetings` | `true` | Allow hi/hello/thanks without topic match |
| `allow_empty` | `true` | Allow blank messages |
| `refusal_message` | built-in | User-facing text when blocked |

### Topic rule fields

| Field | Description |
|-------|-------------|
| `id` | Stable identifier (audit / logs) |
| `description` | Human docs only |
| `keywords` | Substring match (case-insensitive) |
| `patterns` | Regex match on full query |

Shorthand: `allowed_topics: [pizza, delivery]` expands to single-keyword topics.

## FastAPI / LangChain pattern

```python
from acr.scope import QueryScopeGuard

guard = QueryScopeGuard.load("policies/scope.yaml")

@app.post("/chat")
def chat(body: ChatRequest):
    refusal = guard.check_or_refuse(body.message)
    if refusal:
        return {"response": refusal}
    return {"response": agent.invoke({"input": body.message})["output"]}
```

## Limitations

- **Keyword/regex only** — no semantic understanding by default (by design: zero cost).
- Does not replace **system prompts** — use both for defense in depth.
- Does not block **tool calls** — pair with `protect()` / `can()` for hard action enforcement.

For semantic classification, add your own classifier **before** `check()` or use `deny_only` mode with a custom pre-filter.

## Related

- [intent-aware-policy.md](./intent-aware-policy.md) — scope at **tool execute** time
- [plug-and-play.md](./plug-and-play.md) — tool wrapping with `protect()`
