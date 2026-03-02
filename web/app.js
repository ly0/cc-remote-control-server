// ─── State ───────────────────────────────────────────────

const state = {
  environments: [],
  sessions: [],
  currentSessionId: null,
  ws: null,
  cliConnected: false,
  // Store pending AskUserQuestion data keyed by requestId for permission submission
  pendingAskQuestions: {},
  // Track seen message uuids to prevent duplicate rendering
  seenUuids: new Set(),
};

// ─── DOM Refs ────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ─── API ─────────────────────────────────────────────────

async function api(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ─── Data Loading ────────────────────────────────────────

async function loadEnvironments() {
  state.environments = await api("GET", "/api/environments");
  renderSidebar();
}

async function loadSessions() {
  state.sessions = await api("GET", "/api/sessions");
  renderSidebar();
}

async function refreshData() {
  await Promise.all([loadEnvironments(), loadSessions()]);
}

// ─── Session Management ──────────────────────────────────

async function createSession(envId, title, prompt) {
  const result = await api("POST", "/api/sessions", {
    environment_id: envId,
    title: title || "Remote Session",
    prompt: prompt || undefined,
  });
  await loadSessions();
  selectSession(result.id);
  return result;
}

function selectSession(sessionId) {
  state.currentSessionId = sessionId;

  // Disconnect existing WebSocket
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }

  // Connect to session WebSocket
  connectWebSocket(sessionId);
  renderSidebar();
  renderMain();
}

// ─── WebSocket ───────────────────────────────────────────

function connectWebSocket(sessionId) {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const wsUrl = `${protocol}://${location.host}/api/ws/${sessionId}`;

  const ws = new WebSocket(wsUrl);
  state.ws = ws;

  ws.onopen = () => {
    console.log("[ws] Connected to session", sessionId);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleWsMessage(data);
    } catch (err) {
      console.error("[ws] Parse error:", err);
    }
  };

  ws.onclose = () => {
    console.log("[ws] Disconnected");
    if (state.currentSessionId === sessionId) {
      state.cliConnected = false;
      updateConnectionStatus();
    }
  };

  ws.onerror = (err) => {
    console.error("[ws] Error:", err);
  };
}

function handleWsMessage(data) {
  // Connection status
  if (data.type === "connection_status") {
    state.cliConnected = data.cli_connected;
    updateConnectionStatus();
    return;
  }

  // History replay
  if (data.type === "history") {
    const messages = $("#messages");
    messages.innerHTML = "";
    state.seenUuids.clear();
    for (const event of data.events) {
      appendMessage(event);
    }
    scrollToBottom();
    return;
  }

  // Batch events from CLI
  if (data.events) {
    for (const event of data.events) {
      appendMessage(event);
    }
    scrollToBottom();
    return;
  }

  // Single event
  if (data.type) {
    appendMessage(data);
    scrollToBottom();
  }
}

// ─── Message Rendering ───────────────────────────────────

function appendMessage(event) {
  const messages = $("#messages");
  if (!messages) return;

  // Deduplicate by uuid to prevent showing the same message multiple times
  if (event.uuid) {
    if (state.seenUuids.has(event.uuid)) return;
    state.seenUuids.add(event.uuid);
  }

  // Remove streaming indicator if present
  const indicator = messages.querySelector(".stream-indicator");
  if (indicator && event.type !== "stream_event") {
    indicator.remove();
  }

  const div = document.createElement("div");

  switch (event.type) {
    case "user":
      const userText = extractText(event);
      if (userText) {
        div.className = "message user";
        div.innerHTML = `
          <div class="message-label">You</div>
          <div class="message-content">${escapeHtml(userText)}</div>
          <div class="message-time">${formatTime(event.timestamp)}</div>
        `;
      } else {
        const toolResultText = extractToolResultText(event);
        if (!toolResultText) return;
        div.className = "message user";
        div.innerHTML = `
          <div class="message-label">You</div>
          <div class="message-content" style="color: var(--text-secondary); font-style: italic;">${escapeHtml(toolResultText)}</div>
          <div class="message-time">${formatTime(event.timestamp)}</div>
        `;
      }
      break;

    case "assistant":
      div.className = "message assistant";
      const content = renderAssistantContent(event);
      div.innerHTML = `
        <div class="message-label">Claude</div>
        <div class="message-content">${content}</div>
        <div class="message-time">${formatTime(event.timestamp)}</div>
      `;
      break;

    case "system":
      if (event.subtype === "cli_disconnected") {
        state.cliConnected = false;
        updateConnectionStatus();
      }
      if (event.subtype === "bridge_state") {
        if (event.state === "connected") {
          state.cliConnected = true;
          updateConnectionStatus();
        }
      }
      div.className = "message system";
      div.innerHTML = `
        <div class="message-label">System${event.subtype ? ` / ${event.subtype}` : ""}</div>
        <div class="message-content">${escapeHtml(JSON.stringify(event, null, 2))}</div>
      `;
      break;

    case "result":
      if (!event.is_error) return; // successful turn completion, don't render
      div.className = "message result error";
      div.innerHTML = `
        <div class="message-label">Error</div>
        <div class="message-content">${escapeHtml(event.result || event.subtype || "Error")}</div>
        <div class="message-time">${formatTime(event.timestamp)}</div>
      `;
      break;

    case "control_request":
      if (event.request && event.request.subtype === "can_use_tool") {
        div.className = "message";
        div.innerHTML = renderPermissionRequest(event);
      } else if (event.request && event.request.subtype === "elicitation") {
        div.className = "message";
        div.innerHTML = renderElicitation(event);
      } else {
        return; // Don't render other control requests
      }
      break;

    case "control_response":
      return; // Don't render control responses

    case "stream_event":
      // Show streaming indicator
      if (!messages.querySelector(".stream-indicator")) {
        div.className = "stream-indicator";
        div.innerHTML = `<span class="dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span> Claude is thinking...`;
      } else {
        return;
      }
      break;

    case "keep_alive":
      return; // Don't render keep_alive

    default:
      div.className = "message system";
      div.innerHTML = `
        <div class="message-label">${escapeHtml(event.type || "unknown")}</div>
        <div class="message-content">${escapeHtml(JSON.stringify(event, null, 2))}</div>
      `;
  }

  messages.appendChild(div);
}

function renderAssistantContent(event) {
  if (!event.message) return escapeHtml(JSON.stringify(event));

  const content = event.message.content;
  if (!content) return "";

  if (typeof content === "string") return escapeHtml(content);
  if (!Array.isArray(content)) return escapeHtml(JSON.stringify(content));

  let html = "";
  for (const block of content) {
    if (block.type === "text") {
      html += escapeHtml(block.text);
    } else if (block.type === "tool_use" && block.name === "AskUserQuestion") {
      // Skip — interactive form is rendered from the control_request event
      continue;
    } else if (block.type === "tool_use") {
      html += `<div class="tool-call">
        <div class="tool-call-name">${escapeHtml(block.name || "tool")}</div>
        <div class="tool-call-input">${escapeHtml(JSON.stringify(block.input, null, 2))}</div>
      </div>`;
    } else if (block.type === "tool_result") {
      html += `<div class="tool-call">
        <div class="tool-call-name">Tool Result</div>
        <div class="tool-call-input">${escapeHtml(typeof block.content === "string" ? block.content : JSON.stringify(block.content, null, 2))}</div>
      </div>`;
    }
  }
  return html;
}

function renderPermissionRequest(event) {
  const req = event.request;
  const requestId = event.request_id || req.request_id;
  const toolName = req.tool_name || "unknown tool";

  // AskUserQuestion — render interactive question form instead of generic Allow/Deny
  if (toolName === "AskUserQuestion" && req.input && req.input.questions) {
    return renderAskUserPermission(requestId, req.input);
  }

  // Other tools — generic Allow/Deny dialog
  const description = req.description || "";
  const input = req.input ? JSON.stringify(req.input, null, 2) : "";
  const elemId = `perm-${requestId}`;

  return `<div class="permission-request" id="${elemId}">
    <div class="perm-title">Permission Required</div>
    <div class="perm-tool-name">${escapeHtml(toolName)}</div>
    ${description ? `<div class="perm-description">${escapeHtml(description)}</div>` : ""}
    ${input ? `<div class="perm-input-preview">${escapeHtml(input)}</div>` : ""}
    <div class="perm-actions">
      <button class="btn btn-sm btn-primary" onclick="respondPermission('${requestId}', true)">Allow</button>
      <button class="btn btn-sm btn-danger" onclick="respondPermission('${requestId}', false)">Deny</button>
    </div>
  </div>`;
}

// ─── Actions ─────────────────────────────────────────────

function sendMessage() {
  const input = $("#message-input");
  const text = input.value.trim();
  if (!text || !state.currentSessionId) return;

  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(
      JSON.stringify({
        type: "user_message",
        message: text,
      })
    );
    input.value = "";
    input.style.height = "auto";
  }
}

async function respondPermission(requestId, approved) {
  if (!state.currentSessionId) return;
  const behavior = approved ? "allow" : "deny";
  await api("POST", `/api/sessions/${state.currentSessionId}/permission`, {
    request_id: requestId,
    behavior,
  });

  // Mark as answered
  const elem = document.getElementById(`perm-${requestId}`);
  if (elem) {
    elem.classList.add("answered");
    const badge = document.createElement("div");
    badge.className = "answered-badge";
    badge.textContent = approved ? "Allowed" : "Denied";
    elem.appendChild(badge);
  }
}

/**
 * Read-only display of AskUserQuestion in assistant message content.
 * The interactive form comes from the control_request (permission) event.
 */
function renderAskUserQuestionReadonly(block) {
  const questions = block.input && block.input.questions ? block.input.questions : [];

  let html = `<div class="question-card" style="opacity: 0.7;">`;
  html += `<div class="perm-title" style="color: var(--text-secondary); margin-bottom: 10px;">Question Preview</div>`;

  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi];
    if (q.header) {
      html += `<div class="question-header">${escapeHtml(q.header)}</div>`;
    }
    html += `<div class="question-text">${escapeHtml(q.question)}</div>`;

    const options = q.options || [];
    for (const opt of options) {
      html += `<div class="option-item" style="cursor: default;">
        <div>
          <div class="option-label">${escapeHtml(opt.label)}</div>
          ${opt.description ? `<div class="option-description">${escapeHtml(opt.description)}</div>` : ""}
        </div>
      </div>`;
    }
  }

  html += `<div style="color: var(--text-secondary); font-size: 12px; margin-top: 8px;">Answer using the interactive form below.</div>`;
  html += `</div>`;
  return html;
}

/**
 * Interactive AskUserQuestion form rendered from a control_request (permission event).
 * Uses requestId to submit via the permission API endpoint.
 */
function renderAskUserPermission(requestId, input) {
  const questions = input.questions || [];
  const elemId = `ask-perm-${requestId}`;

  // Store the full input for submission
  state.pendingAskQuestions[requestId] = input;

  let html = `<div class="question-card" id="${elemId}">`;
  html += `<div class="perm-title" style="color: var(--accent); margin-bottom: 10px;">User Input Required</div>`;

  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi];
    const inputType = q.multiSelect ? "checkbox" : "radio";
    const inputName = `q-${requestId}-${qi}`;

    if (q.header) {
      html += `<div class="question-header">${escapeHtml(q.header)}</div>`;
    }
    html += `<div class="question-text">${escapeHtml(q.question)}</div>`;

    const options = q.options || [];
    for (let oi = 0; oi < options.length; oi++) {
      const opt = options[oi];
      html += `<div class="option-item" onclick="toggleOption(this, '${inputType}')">
        <input type="${inputType}" name="${inputName}" value="${escapeHtml(opt.label)}" data-qi="${qi}">
        <div>
          <div class="option-label">${escapeHtml(opt.label)}</div>
          ${opt.description ? `<div class="option-description">${escapeHtml(opt.description)}</div>` : ""}
        </div>
      </div>`;
    }

    // "Other" option with text input
    html += `<div class="option-item" onclick="toggleOption(this, '${inputType}')">
      <input type="${inputType}" name="${inputName}" value="__other__" data-qi="${qi}">
      <div style="flex:1">
        <div class="option-label">Other</div>
        <input type="text" class="other-input" placeholder="Type your answer..." data-qi="${qi}"
               onclick="event.stopPropagation()" onfocus="selectOtherOption(this)">
      </div>
    </div>`;
  }

  html += `<button class="submit-btn" onclick="submitAskUserPermission('${requestId}', ${questions.length})">Submit</button>`;
  html += `</div>`;
  return html;
}

/**
 * Submit AskUserQuestion answer via the permission API (control_response path).
 * This sends updatedInput containing the original questions + collected answers.
 */
async function submitAskUserPermission(requestId, questionCount) {
  if (!state.currentSessionId) return;

  const elem = document.getElementById(`ask-perm-${requestId}`);
  if (!elem) return;

  const answers = {};
  for (let qi = 0; qi < questionCount; qi++) {
    const checked = elem.querySelectorAll(`input[data-qi="${qi}"]:checked`);
    const questionTextEl = elem.querySelectorAll(".question-text")[qi];
    const questionText = questionTextEl ? questionTextEl.textContent : `question_${qi}`;

    const selectedValues = [];
    checked.forEach((input) => {
      if (input.value === "__other__") {
        const otherInput = input.closest(".option-item").querySelector(".other-input");
        if (otherInput && otherInput.value.trim()) {
          selectedValues.push(otherInput.value.trim());
        }
      } else {
        selectedValues.push(input.value);
      }
    });

    answers[questionText] = selectedValues.join(",") || "";
  }

  // Retrieve the original input (questions) stored when the form was rendered
  const originalInput = state.pendingAskQuestions[requestId] || {};

  try {
    await api("POST", `/api/sessions/${state.currentSessionId}/permission`, {
      request_id: requestId,
      behavior: "allow",
      updatedInput: { ...originalInput, answers },
    });

    // Mark as answered
    elem.classList.add("answered");
    const badge = document.createElement("div");
    badge.className = "answered-badge";
    badge.textContent = "Answered";
    elem.appendChild(badge);

    // Clean up stored questions
    delete state.pendingAskQuestions[requestId];
  } catch (err) {
    console.error("[ask] Error submitting answer:", err);
  }
}

function toggleOption(item, inputType) {
  const input = item.querySelector(`input[type="${inputType}"]`);
  if (!input) return;

  if (inputType === "radio") {
    // Deselect siblings
    const parent = item.parentElement;
    parent.querySelectorAll(`.option-item`).forEach((el) => el.classList.remove("selected"));
    input.checked = true;
    item.classList.add("selected");
  } else {
    input.checked = !input.checked;
    item.classList.toggle("selected", input.checked);
  }
}

function selectOtherOption(textInput) {
  const optionItem = textInput.closest(".option-item");
  if (optionItem) {
    const radio = optionItem.querySelector("input[type='radio'], input[type='checkbox']");
    if (radio) {
      radio.checked = true;
      // For radio, deselect others
      if (radio.type === "radio") {
        optionItem.parentElement.querySelectorAll(".option-item").forEach((el) => el.classList.remove("selected"));
      }
      optionItem.classList.add("selected");
    }
  }
}

// submitAskUserQuestion removed — AskUserQuestion answers now go through
// submitAskUserPermission() via the permission API (control_response path).

function renderElicitation(event) {
  const req = event.request;
  const requestId = event.request_id || req.request_id;
  const elemId = `elicit-${requestId}`;
  const serverName = req.mcp_server_name || "MCP Server";
  const message = req.message || "Input required";
  const schema = req.requested_schema || {};

  let fieldsHtml = "";
  if (schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      const label = prop.title || key;
      const type = prop.type || "string";
      const desc = prop.description || "";

      if (type === "boolean") {
        fieldsHtml += `<div class="elicitation-field">
          <label><input type="checkbox" data-field="${escapeHtml(key)}"> ${escapeHtml(label)}</label>
          ${desc ? `<div class="option-description">${escapeHtml(desc)}</div>` : ""}
        </div>`;
      } else if (prop.enum) {
        let optionsHtml = prop.enum.map((v) => `<option value="${escapeHtml(String(v))}">${escapeHtml(String(v))}</option>`).join("");
        fieldsHtml += `<div class="elicitation-field">
          <label>${escapeHtml(label)}</label>
          ${desc ? `<div class="option-description">${escapeHtml(desc)}</div>` : ""}
          <select data-field="${escapeHtml(key)}">${optionsHtml}</select>
        </div>`;
      } else if (type === "number" || type === "integer") {
        fieldsHtml += `<div class="elicitation-field">
          <label>${escapeHtml(label)}</label>
          ${desc ? `<div class="option-description">${escapeHtml(desc)}</div>` : ""}
          <input type="number" data-field="${escapeHtml(key)}" placeholder="${escapeHtml(desc || label)}">
        </div>`;
      } else {
        fieldsHtml += `<div class="elicitation-field">
          <label>${escapeHtml(label)}</label>
          ${desc ? `<div class="option-description">${escapeHtml(desc)}</div>` : ""}
          <input type="text" data-field="${escapeHtml(key)}" placeholder="${escapeHtml(desc || label)}">
        </div>`;
      }
    }
  } else {
    // No schema — single text input
    fieldsHtml = `<div class="elicitation-field">
      <label>Response</label>
      <input type="text" data-field="value" placeholder="Enter your response...">
    </div>`;
  }

  return `<div class="elicitation-card" id="${elemId}">
    <div class="elicitation-title">MCP Input Request</div>
    <div class="elicitation-server">${escapeHtml(serverName)}</div>
    <div class="elicitation-message">${escapeHtml(message)}</div>
    ${fieldsHtml}
    <div class="elicitation-actions">
      <button class="btn btn-sm btn-primary" onclick="respondElicitation('${requestId}', 'accept')">Accept</button>
      <button class="btn btn-sm btn-danger" onclick="respondElicitation('${requestId}', 'decline')">Decline</button>
    </div>
  </div>`;
}

function respondElicitation(requestId, action) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;

  const elem = document.getElementById(`elicit-${requestId}`);
  if (!elem) return;

  let content = {};
  if (action === "accept") {
    elem.querySelectorAll("[data-field]").forEach((input) => {
      const field = input.getAttribute("data-field");
      if (input.type === "checkbox") {
        content[field] = input.checked;
      } else if (input.type === "number") {
        content[field] = input.value ? Number(input.value) : undefined;
      } else {
        content[field] = input.value || undefined;
      }
    });
  }

  state.ws.send(JSON.stringify({
    type: "elicitation_response",
    request_id: requestId,
    action,
    content,
  }));

  // Mark as answered
  elem.classList.add("answered");
  const badge = document.createElement("div");
  badge.className = "answered-badge";
  badge.textContent = action === "accept" ? "Accepted" : "Declined";
  elem.appendChild(badge);
}

async function interruptSession() {
  if (!state.currentSessionId) return;
  await api("POST", `/api/sessions/${state.currentSessionId}/interrupt`);
}

// ─── Rendering ───────────────────────────────────────────

function renderSidebar() {
  const content = $(".sidebar-content");
  let html = "";

  // Environments section
  html += `<div class="sidebar-section">Environments (${state.environments.length})</div>`;
  if (state.environments.length === 0) {
    html += `<div style="padding: 12px 16px; color: var(--text-secondary); font-size: 13px;">
      No CLI connected. Run <code style="background:var(--bg-tertiary);padding:2px 5px;border-radius:3px;">claude remote-control</code> to connect.
    </div>`;
  }
  for (const env of state.environments) {
    const isOnline = env.last_poll_at && (Date.now() - env.last_poll_at < 30000);
    html += `<div class="env-item" onclick="showNewSessionModal('${env.id}')">
      <div class="env-name">
        <span class="status-dot ${isOnline ? "online" : "offline"}"></span>
        ${escapeHtml(env.machine_name)}
      </div>
      <div class="env-detail">${escapeHtml(env.directory)}</div>
      ${env.branch ? `<div class="env-detail">Branch: ${escapeHtml(env.branch)}</div>` : ""}
    </div>`;
  }

  // Sessions section
  const activeSessions = state.sessions.filter((s) => s.status === "active");
  html += `<div class="sidebar-section">Sessions (${activeSessions.length})</div>`;
  for (const s of activeSessions) {
    const selected = s.id === state.currentSessionId;
    html += `<div class="session-item ${selected ? "selected" : ""}" onclick="selectSession('${s.id}')">
      <div class="session-title">
        <span class="status-dot active"></span>
        ${escapeHtml(s.title)}
      </div>
      <div class="session-meta">${formatTime(s.created_at)} &middot; ${s.message_count} messages</div>
    </div>`;
  }

  content.innerHTML = html;
}

function renderMain() {
  const main = $("#main");
  if (!state.currentSessionId) {
    main.innerHTML = `<div class="empty-state">
      <h3>Remote Control Server</h3>
      <p>Select an environment from the sidebar and create a session to start interacting with your CLI.</p>
    </div>`;
    return;
  }

  const session = state.sessions.find((s) => s.id === state.currentSessionId);
  const title = session ? session.title : "Session";

  main.innerHTML = `
    <div class="main-header">
      <h2>${escapeHtml(title)}</h2>
      <div class="header-actions">
        <span id="connection-badge" class="connection-badge disconnected">
          <span class="status-dot offline"></span> Disconnected
        </span>
        <button class="btn btn-sm btn-danger" onclick="interruptSession()">Interrupt</button>
      </div>
    </div>
    <div id="messages"></div>
    <div id="input-area">
      <div class="input-container">
        <textarea id="message-input" placeholder="Type a message..." rows="1"></textarea>
        <button id="send-btn" class="btn btn-primary" onclick="sendMessage()">&#9654;</button>
      </div>
    </div>
  `;

  // Auto-resize textarea
  const input = $("#message-input");
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 200) + "px";
  });

  // Enter to send (Shift+Enter for newline)
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  updateConnectionStatus();
}

function updateConnectionStatus() {
  const badge = $("#connection-badge");
  if (!badge) return;

  if (state.cliConnected) {
    badge.className = "connection-badge connected";
    badge.innerHTML = `<span class="status-dot online"></span> CLI Connected`;
  } else {
    badge.className = "connection-badge disconnected";
    badge.innerHTML = `<span class="status-dot offline"></span> CLI Disconnected`;
  }
}

function scrollToBottom() {
  const messages = $("#messages");
  if (messages) {
    messages.scrollTop = messages.scrollHeight;
  }
}

// ─── New Session Modal ───────────────────────────────────

function showNewSessionModal(envId) {
  const env = state.environments.find((e) => e.id === envId);
  if (!env) return;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };

  overlay.innerHTML = `<div class="modal">
    <h3>New Session</h3>
    <div class="form-group">
      <label>Environment</label>
      <input type="text" value="${escapeHtml(env.machine_name)} — ${escapeHtml(env.directory)}" disabled>
    </div>
    <div class="form-group">
      <label>Session Title</label>
      <input type="text" id="modal-title" placeholder="Remote Session" value="Remote Session">
    </div>
    <div class="form-group">
      <label>Initial Prompt (optional)</label>
      <textarea id="modal-prompt" rows="3" placeholder="Enter an initial message..."></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
      <button class="btn btn-primary" onclick="submitNewSession('${envId}')">Create Session</button>
    </div>
  </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector("#modal-title").focus();
}

async function submitNewSession(envId) {
  const title = $("#modal-title").value.trim();
  const prompt = $("#modal-prompt").value.trim();

  try {
    await createSession(envId, title, prompt);
    $(".modal-overlay").remove();
  } catch (err) {
    alert("Error creating session: " + err.message);
  }
}

// ─── Utilities ───────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function extractToolResultText(event) {
  if (!event.message) return "";
  const content = event.message.content;
  if (!Array.isArray(content)) return "";
  const results = content.filter((b) => b.type === "tool_result");
  if (results.length === 0) return "";
  return results
    .map((b) => (typeof b.content === "string" ? b.content : ""))
    .filter(Boolean)
    .join("\n");
}

function extractText(event) {
  if (!event.message) return JSON.stringify(event);
  const content = event.message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  }
  return JSON.stringify(content);
}

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString();
}

// ─── Init ────────────────────────────────────────────────

async function init() {
  renderMain();
  await refreshData();

  // Poll for updates every 5 seconds
  setInterval(refreshData, 5000);
}

init();
