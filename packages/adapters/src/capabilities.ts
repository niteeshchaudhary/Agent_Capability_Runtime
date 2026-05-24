import type { ToolId } from "@acr/capability-token";

/** Constraint keys an adapter supports for policy validation / SDK discovery. */
export interface AdapterCapabilityDescriptor {
  tool: ToolId;
  description: string;
  constraints: readonly string[];
}

export const ADAPTER_CAPABILITIES: readonly AdapterCapabilityDescriptor[] = [
  {
    tool: "gmail.send",
    description: "Send email via Gmail-compatible adapter",
    constraints: [
      "allowedDomains",
      "maxActions",
      "attachments",
      "allowedHours",
      "approvalRequired",
      "approvalRequiredIfExternal",
    ],
  },
  {
    tool: "slack.send",
    description: "Post message to Slack channel",
    constraints: ["maxActions", "allowedHours", "approvalRequired"],
  },
  {
    tool: "http.request",
    description: "Outbound HTTP request (runtime sandbox: timeout, SSRF guard, response cap)",
    constraints: [
      "allowedMethods",
      "allowedUrls",
      "maxActions",
      "allowedHours",
      "approvalRequired",
    ],
  },
] as const;

export function getAdapterCapabilities(tool?: ToolId): AdapterCapabilityDescriptor[] {
  if (tool) {
    return ADAPTER_CAPABILITIES.filter((c) => c.tool === tool);
  }
  return [...ADAPTER_CAPABILITIES];
}

export function supportedCapabilities(): AdapterCapabilityDescriptor[] {
  return getAdapterCapabilities();
}
