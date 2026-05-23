# Adapter Setup (Gmail & Slack)

Week 2 adapters call real APIs when credentials are configured. Without tokens, ACR uses **stub** adapters (safe for local dev and tests).

## Mode

| `ACR_ADAPTER_MODE` | Behavior |
|--------------------|----------|
| `stub` | Always use stub adapters (no external API calls) |
| `live` | Use live adapters when credentials exist for each tool |
| `auto` (default) | Live if `GMAIL_ACCESS_TOKEN` or `SLACK_BOT_TOKEN` is set; otherwise stub |

## Gmail (`gmail.send`)

### Prerequisites

1. Google Cloud project with **Gmail API** enabled
2. OAuth 2.0 credentials (Desktop or Web app)
3. Access token with scope: `https://www.googleapis.com/auth/gmail.send`

### Environment variables

```env
GMAIL_ACCESS_TOKEN=ya29....
GMAIL_USER_ID=me          # optional, default me
GMAIL_FROM=agent@company.com   # optional From header
```

### Payload

```json
{
  "to": "user@company.com",
  "subject": "Hello",
  "body": "Message text"
}
```

Uses [Gmail API `users.messages.send`](https://developers.google.com/gmail/api/reference/rest/v1/users.messages/send).

### Getting a token (dev)

Use [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/) or your app's OAuth flow. For production, store refresh tokens securely and exchange for short-lived access tokens — do not commit tokens to git.

---

## Slack (`slack.send`)

### Prerequisites

1. Slack app with **Bot Token Scopes**: `chat:write`
2. Install app to workspace
3. Copy **Bot User OAuth Token** (`xoxb-...`)

### Environment variables

```env
SLACK_BOT_TOKEN=xoxb-...
```

### Payload

```json
{
  "channel": "#general",
  "text": "Hello from agent",
  "threadTs": "1234567890.123456"
}
```

Uses [`chat.postMessage`](https://api.slack.com/methods/chat.postMessage).

---

## HTTP (`http.request`)

Always uses **live** `fetch` (no stub). Policy constraints (`allowedUrls`, `allowedMethods`) are enforced by the runtime before the request is sent.

```json
{
  "url": "https://api.company.com/v1/status",
  "method": "GET",
  "headers": { "Accept": "application/json" }
}
```

---

## Programmatic configuration

```ts
import { AgentCapabilityRuntime } from "@acr/runtime";

const runtime = new AgentCapabilityRuntime({
  secret: process.env.ACR_SIGNING_SECRET!,
  adapters: {
    mode: "live",
    gmail: { accessToken: process.env.GMAIL_ACCESS_TOKEN! },
    slack: { botToken: process.env.SLACK_BOT_TOKEN! },
  },
});
```

---

## Security notes

- Capability tokens gate **who** may invoke tools; OAuth tokens gate **which Google/Slack account** is used
- Never forward end-user OAuth tokens through agent tool chains without token exchange (see [agent-identity-auth-synthesis.md](../agent-identity-auth-synthesis.md))
- Use least-privilege scopes (`gmail.send` only, not full mailbox)
- Rotate bot tokens and monitor audit logs at `GET /audit`
