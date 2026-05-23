export interface GmailMessageInput {
  to: string;
  subject: string;
  body: string;
  from?: string;
}

/** Build a base64url-encoded RFC 2822 message for Gmail API `messages.send`. */
export function buildGmailRawMessage(input: GmailMessageInput): string {
  const lines = [
    `To: ${input.to}`,
    input.from ? `From: ${input.from}` : undefined,
    `Subject: ${input.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    input.body,
  ].filter((line): line is string => line !== undefined);

  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}
