import type { GmailCredentials } from "./config.js";
import { buildGmailRawMessage } from "./gmail-mime.js";
import type { ToolAdapter, GmailSendResult } from "./types.js";

export function createGmailLiveAdapter(credentials: GmailCredentials): ToolAdapter {
  const userId = credentials.userId ?? "me";

  return {
    tool: "gmail.send",

    async execute(payload: Record<string, unknown>): Promise<GmailSendResult> {
      const to = String(payload.to ?? "");
      const subject = String(payload.subject ?? "");
      const body = String(payload.body ?? payload.text ?? "");

      if (!to) throw new Error("gmail.send requires payload.to");
      if (!subject) throw new Error("gmail.send requires payload.subject");

      if (payload.attachments) {
        throw new Error("gmail.send live adapter does not support attachments in v1");
      }

      const raw = buildGmailRawMessage({
        to,
        subject,
        body,
        from: credentials.from,
      });

      const url = `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(userId)}/messages/send`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      });

      const data = (await response.json()) as { id?: string; error?: { message?: string } };

      if (!response.ok) {
        const detail = data.error?.message ?? response.statusText;
        throw new Error(`Gmail API error (${response.status}): ${detail}`);
      }

      if (!data.id) {
        throw new Error("Gmail API returned no message id");
      }

      return {
        messageId: data.id,
        status: "sent",
        to,
        mode: "live",
      };
    },
  };
}
