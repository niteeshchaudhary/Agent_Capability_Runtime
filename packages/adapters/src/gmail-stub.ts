import type { ToolAdapter, GmailSendResult } from "./types.js";

export const gmailStubAdapter: ToolAdapter = {
  tool: "gmail.send",

  async execute(payload: Record<string, unknown>): Promise<GmailSendResult> {
    const to = String(payload.to ?? "");
    if (!to) {
      throw new Error("gmail.send requires payload.to");
    }

    return {
      messageId: `msg_${crypto.randomUUID().slice(0, 8)}`,
      status: "sent",
      to,
      mode: "stub",
    };
  },
};
