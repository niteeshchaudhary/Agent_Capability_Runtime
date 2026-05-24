export {
  type AdapterConfig,
  type AdapterMode,
  type GmailCredentials,
  loadAdapterConfigFromEnv,
  resolveAdapterConfig,
  type ResolvedAdapterConfig,
  type SlackCredentials,
} from "./config.js";
export { buildGmailRawMessage } from "./gmail-mime.js";
export { createGmailLiveAdapter } from "./gmail-live.js";
export { gmailStubAdapter } from "./gmail-stub.js";
export { createHttpAdapter, httpAdapter } from "./http.js";
export {
  createAdapterRegistry,
  getAdapter,
  getDefaultRegistry,
  listAdapters,
  resetDefaultRegistry,
  type AdapterRegistry,
} from "./registry.js";
export { createSlackLiveAdapter } from "./slack-live.js";
export { slackStubAdapter } from "./slack-stub.js";
export type {
  ExecutionContext,
  ExecutionContract,
  GmailSendResult,
  HttpRequestResult,
  SlackSendResult,
  ToolAdapter,
} from "./types.js";
export { claimsToExecutionCapability } from "./execution-contract.js";
