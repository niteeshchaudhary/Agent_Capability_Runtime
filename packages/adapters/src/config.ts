export type AdapterMode = "stub" | "live" | "auto";

export interface GmailCredentials {
  /** OAuth 2.0 access token with gmail.send scope */
  accessToken: string;
  /** Gmail user id; defaults to `me` */
  userId?: string;
  /** Optional From header (must be allowed for the token) */
  from?: string;
}

export interface SlackCredentials {
  /** Bot token (xoxb-...) with chat:write scope */
  botToken: string;
}

export interface AdapterConfig {
  mode?: AdapterMode;
  gmail?: GmailCredentials;
  slack?: SlackCredentials;
}

export interface ResolvedAdapterConfig {
  mode: "stub" | "live";
  gmail?: GmailCredentials;
  slack?: SlackCredentials;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === "" ? undefined : value;
}

/** Resolve adapter mode and credentials from environment (gateway / server use). */
export function loadAdapterConfigFromEnv(): ResolvedAdapterConfig {
  const modeEnv = readEnv("ACR_ADAPTER_MODE") as AdapterMode | undefined;
  const gmailToken = readEnv("GMAIL_ACCESS_TOKEN");
  const slackToken = readEnv("SLACK_BOT_TOKEN");

  const gmail: GmailCredentials | undefined = gmailToken
    ? {
        accessToken: gmailToken,
        userId: readEnv("GMAIL_USER_ID") ?? "me",
        from: readEnv("GMAIL_FROM"),
      }
    : undefined;

  const slack: SlackCredentials | undefined = slackToken
    ? { botToken: slackToken }
    : undefined;

  let mode: "stub" | "live";
  if (modeEnv === "stub") {
    mode = "stub";
  } else if (modeEnv === "live") {
    mode = "live";
  } else {
    // auto: live when at least one credential is set
    mode = gmail || slack ? "live" : "stub";
  }

  return { mode, gmail, slack };
}

export function resolveAdapterConfig(config?: AdapterConfig): ResolvedAdapterConfig {
  if (!config) {
    return loadAdapterConfigFromEnv();
  }

  const modeEnv = config.mode ?? "auto";
  let mode: "stub" | "live";
  if (modeEnv === "stub") mode = "stub";
  else if (modeEnv === "live") mode = "live";
  else mode = config.gmail || config.slack ? "live" : "stub";

  return {
    mode,
    gmail: config.gmail,
    slack: config.slack,
  };
}
