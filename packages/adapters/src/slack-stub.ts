import type { ToolAdapter, SlackSendResult } from "./types.js";

export const slackStubAdapter: ToolAdapter = {
  tool: "slack.send",

  async execute(payload: Record<string, unknown>): Promise<SlackSendResult> {
    const channel = String(payload.channel ?? "#general");
    const text = String(payload.text ?? "");

    if (!text) {
      throw new Error("slack.send requires payload.text");
    }

    return {
      messageTs: `${Date.now()}.000001`,
      channel,
      status: "posted",
      mode: "stub",
    };
  },
};
