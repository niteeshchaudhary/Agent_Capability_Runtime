import type { SlackCredentials } from "./config.js";
import type { ToolAdapter, SlackSendResult } from "./types.js";

interface SlackApiResponse {
  ok: boolean;
  error?: string;
  ts?: string;
  channel?: string;
}

export function createSlackLiveAdapter(credentials: SlackCredentials): ToolAdapter {
  return {
    tool: "slack.send",

    async execute(payload: Record<string, unknown>): Promise<SlackSendResult> {
      const channel = String(payload.channel ?? "");
      const text = String(payload.text ?? "");

      if (!channel) throw new Error("slack.send requires payload.channel");
      if (!text) throw new Error("slack.send requires payload.text");

      const body: Record<string, string> = { channel, text };
      if (typeof payload.threadTs === "string") {
        body.thread_ts = payload.threadTs;
      }

      const response = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.botToken}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(body),
      });

      const data = (await response.json()) as SlackApiResponse;

      if (!response.ok) {
        throw new Error(`Slack API HTTP error (${response.status})`);
      }

      if (!data.ok || !data.ts || !data.channel) {
        throw new Error(`Slack API error: ${data.error ?? "unknown_error"}`);
      }

      return {
        messageTs: data.ts,
        channel: data.channel,
        status: "posted",
        mode: "live",
      };
    },
  };
}
