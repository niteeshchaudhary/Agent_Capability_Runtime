import {
  GatewayClient,
  SUPPORTED_TOOLS,
  loadSettings,
  saveSettings,
  type ApprovalRecord,
  type AuditEvent,
} from "./api.js";
import "./styles.css";

const state = {
  lastToken: "",
  client: new GatewayClient(loadSettings()),
};

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

function setStatus(text: string, ok = true): void {
  const el = $("status");
  el.textContent = text;
  el.className = ok ? "status ok" : "status err";
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function refreshClient(): void {
  const baseUrl = ($("gateway-url") as HTMLInputElement).value.trim();
  const adminKey = ($("admin-key") as HTMLInputElement).value;
  saveSettings(baseUrl, adminKey);
  state.client = new GatewayClient({ baseUrl, adminKey });
}

async function pingHealth(): Promise<void> {
  refreshClient();
  try {
    const h = await state.client.health();
    setStatus(`Connected — gateway ${h.version ?? "ok"}`);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Connection failed", false);
  }
}

function showPanel(name: string): void {
  document.querySelectorAll<HTMLElement>(".panel").forEach((p) => {
    p.hidden = p.dataset.panel !== name;
  });
  document.querySelectorAll<HTMLElement>(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === name);
  });
}

function renderAudit(events: AuditEvent[]): void {
  const tbody = $("audit-body");
  tbody.innerHTML = "";
  if (events.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">No audit events</td></tr>`;
    return;
  }
  for (const e of events.slice().reverse()) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><code>${e.decision}</code></td>
      <td>${e.agentId ?? ""}</td>
      <td>${e.tool ?? ""}</td>
      <td>${e.reason ?? ""}</td>
      <td>${e.createdAt ?? e.id ?? ""}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderApprovals(rows: ApprovalRecord[]): void {
  const tbody = $("approvals-body");
  tbody.innerHTML = "";
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">No approvals</td></tr>`;
    return;
  }
  for (const a of rows) {
    const tr = document.createElement("tr");
    const actions =
      a.status === "pending"
        ? `<button type="button" data-approve="${a.id}">Approve</button>
           <button type="button" class="danger" data-reject="${a.id}">Reject</button>`
        : `<span class="muted">${a.status}</span>`;
    tr.innerHTML = `
      <td>${a.id}</td>
      <td>${a.agentId}</td>
      <td>${a.tool}</td>
      <td>${a.reason ?? ""}</td>
      <td class="actions">${actions}</td>
    `;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll<HTMLButtonElement>("[data-approve]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await state.client.approve(btn.dataset.approve!);
      await loadApprovals();
    });
  });
  tbody.querySelectorAll<HTMLButtonElement>("[data-reject]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await state.client.reject(btn.dataset.reject!);
      await loadApprovals();
    });
  });
}

async function loadAudit(): Promise<void> {
  const { events } = await state.client.listAudit({ limit: 50 });
  renderAudit(events);
}

async function loadApprovals(): Promise<void> {
  const status = ($("approval-filter") as HTMLSelectElement).value;
  const { approvals } = await state.client.listApprovals(
    status ? { status } : undefined,
  );
  renderApprovals(approvals);
}

function initToolSelects(): void {
  for (const id of ["grant-tool", "exec-tool"]) {
    const sel = $(id) as HTMLSelectElement;
    sel.innerHTML = SUPPORTED_TOOLS.map((t) => `<option value="${t}">${t}</option>`).join("");
  }
}

function wireForms(): void {
  $("save-settings").addEventListener("click", () => void pingHealth());

  document.querySelectorAll<HTMLElement>(".tab").forEach((tab) => {
    tab.addEventListener("click", () => showPanel(tab.dataset.tab!));
  });

  $("grant-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    refreshClient();
    const agentId = ($("grant-agent") as HTMLInputElement).value.trim();
    const tool = ($("grant-tool") as HTMLSelectElement).value as (typeof SUPPORTED_TOOLS)[number];
    let constraints: Record<string, unknown> = {};
    const raw = ($("grant-constraints") as HTMLTextAreaElement).value.trim();
    if (raw) constraints = JSON.parse(raw) as Record<string, unknown>;
    try {
      const result = await state.client.grant({ agentId, tool, constraints });
      state.lastToken = result.token;
      ($("exec-token") as HTMLTextAreaElement).value = result.token;
      ($("grant-output") as HTMLPreElement).textContent = pretty(result);
      setStatus("Capability granted");
      showPanel("execute");
    } catch (err) {
      ($("grant-output") as HTMLPreElement).textContent = String(err);
      setStatus(err instanceof Error ? err.message : "Grant failed", false);
    }
  });

  $("exec-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    refreshClient();
    const token = ($("exec-token") as HTMLTextAreaElement).value.trim();
    const tool = ($("exec-tool") as HTMLSelectElement).value as (typeof SUPPORTED_TOOLS)[number];
    const payload = JSON.parse(
      ($("exec-payload") as HTMLTextAreaElement).value,
    ) as Record<string, unknown>;
    const simulate = ($("exec-simulate") as HTMLInputElement).checked;
    try {
      const result = await state.client.execute({ token, tool, payload, simulate });
      ($("exec-output") as HTMLPreElement).textContent = pretty(result);
      setStatus("Execute completed");
      await loadAudit();
      await loadApprovals();
    } catch (err) {
      ($("exec-output") as HTMLPreElement).textContent = String(err);
      setStatus(err instanceof Error ? err.message : "Execute failed", false);
    }
  });

  $("refresh-audit").addEventListener("click", () => void loadAudit());
  $("refresh-approvals").addEventListener("click", () => void loadApprovals());
  $("approval-filter").addEventListener("change", () => void loadApprovals());
}

function loadDefaults(): void {
  const { baseUrl, adminKey } = loadSettings();
  ($("gateway-url") as HTMLInputElement).value = baseUrl;
  ($("admin-key") as HTMLInputElement).value = adminKey;
  ($("grant-constraints") as HTMLTextAreaElement).value = pretty({
    allowedDomains: ["company.com"],
    maxActions: 10,
  });
  ($("exec-payload") as HTMLTextAreaElement).value = pretty({
    to: "user@company.com",
    subject: "Hello",
    body: "From ACR dashboard",
  });
  if (state.lastToken) {
    ($("exec-token") as HTMLTextAreaElement).value = state.lastToken;
  }
}

initToolSelects();
wireForms();
loadDefaults();
void pingHealth();
showPanel("grant");
