# Remote Control Server for Claude Code

A self-hosted server that enables **real-time, bidirectional** web-based interaction with Claude Code CLI sessions.

**[中文文档](./README_zh.md)**

![Remote Control Server Screenshot](./eihei.jpg)

> **Important:** If you're on an official Claude subscription, the built-in Remote Control already works out of the box. But if you're using the API directly, or running **Deepseek / GLM / Kimi / Minimax on Claude Code**, this project will be a game-changer.

## Why Remote Control?

Claude Code stores conversation history as local JSONL files (`~/.claude/projects/.../`). Reading these files only gives you a static, after-the-fact view of what happened.

Remote Control mode is fundamentally different:

- **Real-time streaming** — See Claude's responses, tool calls, and reasoning as they happen, not after.
- **Bidirectional interaction** — Send messages, approve/deny tool permissions, and answer elicitations from the Web UI. You are a participant, not a spectator.
- **Multi-device access** — Open the Web UI from any browser on any device on your network.

## Architecture

```
Browser (Web UI)
    ↕  WebSocket /api/ws/:sessionId
Remote Control Server (this project)
    ↕  WebSocket /v2/session_ingress/ws/:sessionId
    ↕  HTTP POST /v2/session_ingress/session/:sessionId/events
Claude Code CLI (bridge mode)
```

The CLI runs in **bridge mode**, registering itself as an "environment" with the server. When a session is created via the Web UI, the server dispatches work to the CLI. The CLI spawns a subprocess that connects back to the server via WebSocket + HTTP POST (HybridTransport), streaming all events in real time.

## Quick Start

### 1. Install Dependencies

```bash
cd remote-control-server
npm install
```

### 2. Build & Run

```bash
npm run build
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

The server starts on `http://0.0.0.0:3000` by default. Open `http://localhost:3000` in your browser to access the Web UI.

### 3. Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `3000`  | Server listen port |
| `HOST`   | `0.0.0.0` | Server bind address |
| `DEBUG`  | (unset) | Set to any value to enable request logging |

## Patching Claude Code to Use a Self-Hosted Server

Claude Code's bridge mode has two `BASE_API_URL` configs: the **prod** config points to `https://api.anthropic.com`, and the **local/dev** config points to `http://localhost:3000`. To point it at your self-hosted server, you need to patch the CLI binary.

> **Note:** The CLI binary is minified/obfuscated — function names and line numbers change every release. All instructions below use **version-independent patterns** (stable string constants + regex with `[[:space:]]*` for optional whitespace) that work across CLI versions regardless of minification style.

> **Platform note:** `sed -i` syntax differs: Linux (GNU sed) uses `sed -i`, macOS (BSD sed) uses `sed -i ''`. The [one-click script](#one-click-patch-script) at the end handles this automatically.

### Auto-Detecting the CLI Path

The CLI path changes with Node.js version. Auto-detect instead of hardcoding:

```bash
CLI_JS="$(readlink -f "$(which claude)" 2>/dev/null)" \
    || CLI_JS="$(realpath "$(which claude)" 2>/dev/null)" \
    || CLI_JS="$(which claude)"
echo "CLI: $CLI_JS"
```

### Locating the Relevant Code

Use `grep` to find the code you need to patch. These patterns are version-independent:

```bash
# 1. Find the hardcoded BASE_API_URL (prod config)
grep -n 'BASE_API_URL.*api\.anthropic\.com' "$CLI_JS"

# 2. Find the OAuth URL allowlist
grep -n 'beacon.claude-ai.staging.ant.dev' "$CLI_JS"

# 3. Find the HTTP enforcement check (2.1.63+)
grep -n 'Remote Control base URL uses HTTP' "$CLI_JS"

# 4. Find the WebSocket URL derivation (v1 vs v2 routing, 2.1.63+)
grep -n 'session_ingress/ws/' "$CLI_JS"

# 5. Find the tengu_ccr_bridge feature flag
grep -n 'tengu_ccr_bridge' "$CLI_JS"
```

### Patch Method

**Option A: Patch the hardcoded URL directly**

Replace `https://api.anthropic.com` in the prod config with your server's URL:

```bash
# Example: point to a remote server at 192.168.1.100:3000
# [[:space:]]* handles both minified (no space) and pretty-printed (with space) JS
sed -E -i 's|BASE_API_URL:[[:space:]]*"https://api\.anthropic\.com"|BASE_API_URL:"http://192.168.1.100:3000"|' "$CLI_JS"
```

**Option B: Bypass the allowlist for `CLAUDE_CODE_CUSTOM_OAUTH_URL`**

The CLI supports `CLAUDE_CODE_CUSTOM_OAUTH_URL` but validates it against a hardcoded allowlist. Find the allowlist by searching for `beacon.claude-ai.staging.ant.dev` and add your URL:

```bash
# Find the allowlist array (contains "beacon.claude-ai.staging.ant.dev")
grep -n 'beacon.claude-ai.staging.ant.dev' "$CLI_JS"

# Add your server URL to the allowlist array, then set the env var:
sed -i 's|"https://beacon.claude-ai.staging.ant.dev"|"https://beacon.claude-ai.staging.ant.dev","https://your-server.example.com"|' "$CLI_JS"
export CLAUDE_CODE_CUSTOM_OAUTH_URL=https://your-server.example.com
```

### Important Notes

1. **HTTP vs HTTPS** (2.1.63+): The CLI enforces HTTPS for non-localhost URLs (search for `Remote Control base URL uses HTTP`). If your server uses plain HTTP on a non-localhost address, you must either:
   - Set up a reverse proxy with TLS (recommended)
   - Patch out the HTTP check:

   ```bash
   # Version-independent: matches any variable name and handles optional whitespace
   sed -E -i 's/[a-zA-Z_$]+\.startsWith\("http:\/\/"\)[[:space:]]*&&[[:space:]]*![a-zA-Z_$]+\.includes\("localhost"\)[[:space:]]*&&[[:space:]]*![a-zA-Z_$]+\.includes\("127\.0\.0\.1"\)/false/' "$CLI_JS"
   ```

2. **WebSocket URL derivation** (2.1.63+): The CLI automatically derives the WebSocket URL from `api_base_url`:
   - For `localhost` / `127.0.0.1`: uses `ws://` and `/v2/` prefix
   - For all other hosts: uses `wss://` and `/v1/` prefix

   If your self-hosted server only supports `/v2/` routes (like this project does), and is not on localhost, force both branches to return `v2`:

   ```bash
   # Version-independent: matches the ?"v2":"v1" ternary regardless of variable names
   sed -E -i 's/\?[[:space:]]*"v2"[[:space:]]*:[[:space:]]*"v1"/?"v2":"v2"/' "$CLI_JS"
   ```

3. **Work secret `api_base_url`**: The server embeds its own URL in the work secret. If your server is accessible at a different address than `localhost:${PORT}` (e.g., behind a reverse proxy), set the `API_BASE_URL` env var:

   ```bash
   # Set the externally-reachable address of your server
   export API_BASE_URL=http://your-external-address:3000
   ```

4. **Unlocking the `/remote-control` command** (2.1.63+): The `remote-control` (aka `claude remote-control`) command is gated behind the `tengu_ccr_bridge` feature flag. Even after patching `BASE_API_URL`, the command remains hidden and blocked. You need **3 code patches + 1 env var**:

   ```bash
   # Patch 1: Bypass feature flag entirely (makes command visible + sync check always passes)
   # Version-independent regex: matches any function name calling tengu_ccr_bridge
   sed -E -i 's/[A-Za-z0-9_]+\("tengu_ccr_bridge",[[:space:]]*!1\)/!0/g' "$CLI_JS"

   # Patch 2a: Neutralize async flag check (CLI command path)
   sed -i 's/console.error("Error: Remote Control is not yet enabled for your account."), process.exit(1)/void 0/' "$CLI_JS"

   # Patch 2b: Neutralize async flag check (interactive mode path)
   sed -i 's/return "Remote Control is not enabled. Wait for the feature flag rollout."/return null/' "$CLI_JS"

   # Patch 3: Neutralize async flag check in bridge init (REPL path)
   # Version-independent regex: matches any function name calling tengu_ccr_bridge
   # Note: On 2.1.68+ the async check is already hardcoded to return true, making this a no-op
   sed -E -i 's/return [A-Za-z0-9_]+\("tengu_ccr_bridge"\)/return !0/' "$CLI_JS"
   ```

   Additionally, the command requires OAuth credentials. If you don't have a claude.ai account (e.g., API-only or third-party model users), set this env var to bypass all OAuth checks:

   ```bash
   # The self-hosted server doesn't validate the Authorization header, so any value works
   export CLAUDE_CODE_OAUTH_TOKEN=self-hosted
   ```

   > **Note:** If you already have a claude.ai account and are logged in, you only need Patch 1-2 above. The `CLAUDE_CODE_OAUTH_TOKEN` env var is only needed for users without a claude.ai account.

### One-Click Patch Script

Save as `patch-claude.sh` and run: `./patch-claude.sh <server-url>`

```bash
#!/bin/bash
set -e

SERVER_URL="${1:?Usage: $0 <server-url>}"  # e.g. http://192.168.1.100:3000

# ---- Auto-detect Claude CLI path (version-independent) ----
if [ -n "$CLI_JS" ]; then
    : # User-specified via CLI_JS env var
elif command -v claude >/dev/null 2>&1; then
    CLI_JS="$(readlink -f "$(command -v claude)" 2>/dev/null)" \
        || CLI_JS="$(realpath "$(command -v claude)" 2>/dev/null)" \
        || CLI_JS="$(command -v claude)"
else
    echo "Error: 'claude' not found in PATH"
    echo "Set CLI_JS manually: CLI_JS=/path/to/claude $0 $*"
    exit 1
fi
echo "CLI: $CLI_JS"

# ---- Cross-platform sed -i (GNU vs BSD) ----
if sed --version 2>/dev/null | grep -q 'GNU'; then
    sedi() { sed -i "$@"; }
else
    sedi() { sed -i '' "$@"; }
fi

# Backup
cp "$CLI_JS" "$CLI_JS.bak"

# 1. Patch prod BASE_API_URL
#    [[:space:]]* handles both minified (no space) and pretty-printed (with space) JS
sedi -E "s|BASE_API_URL:[[:space:]]*\"https://api\.anthropic\.com\"|BASE_API_URL:\"${SERVER_URL}\"|" "$CLI_JS"

# 2. Force v2 WebSocket routing (both ternary branches → "v2")
#    Matches ?"v2":"v1" regardless of surrounding variable names or whitespace
sedi -E 's/\?[[:space:]]*"v2"[[:space:]]*:[[:space:]]*"v1"/?"v2":"v2"/' "$CLI_JS"

# 3. Neutralize HTTP enforcement (only needed for http:// on non-localhost)
if echo "$SERVER_URL" | grep -q '^http://' && ! echo "$SERVER_URL" | grep -qE '(localhost|127\.0\.0\.1)'; then
    sedi -E 's/[a-zA-Z_$]+\.startsWith\("http:\/\/"\)[[:space:]]*&&[[:space:]]*![a-zA-Z_$]+\.includes\("localhost"\)[[:space:]]*&&[[:space:]]*![a-zA-Z_$]+\.includes\("127\.0\.0\.1"\)/false/' "$CLI_JS"
fi

# 4. Bypass tengu_ccr_bridge feature flag (sync check)
sedi -E 's/[A-Za-z0-9_]+\("tengu_ccr_bridge",[[:space:]]*!1\)/!0/g' "$CLI_JS"

# 5. Neutralize async feature flag runtime checks
sedi 's/console.error("Error: Remote Control is not yet enabled for your account."), process.exit(1)/void 0/' "$CLI_JS"
sedi 's/return "Remote Control is not enabled. Wait for the feature flag rollout."/return null/' "$CLI_JS"

# 6. Bypass tengu_ccr_bridge async check in bridge init (no-op on 2.1.68+)
sedi -E 's/return [A-Za-z0-9_]+\("tengu_ccr_bridge"\)/return !0/' "$CLI_JS"

echo ""
echo "Patched $CLI_JS -> $SERVER_URL (backup: $CLI_JS.bak)"
echo ""
echo "If you don't have a claude.ai account, also set:"
echo "  export CLAUDE_CODE_OAUTH_TOKEN=self-hosted"
```

## API Endpoints

### CLI Protocol

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/environments/bridge` | Register a bridge environment |
| GET | `/v1/environments/:envId/work/poll` | Long-poll for work (8s timeout) |
| POST | `/v1/environments/:envId/work/:workId/ack` | Acknowledge work |
| POST | `/v1/environments/:envId/work/:workId/stop` | Stop work |
| DELETE | `/v1/environments/bridge/:envId` | Deregister environment |
| POST | `/v1/sessions` | Create a new session |
| GET | `/v1/sessions/:sessionId` | Get session info |

### Session Ingress (HybridTransport)

| Method | Path | Description |
|--------|------|-------------|
| WebSocket | `/v2/session_ingress/ws/:sessionId` | Bidirectional CLI connection |
| POST | `/v2/session_ingress/session/:sessionId/events` | Batch event ingestion |

### Web UI

| Method | Path | Description |
|--------|------|-------------|
| WebSocket | `/api/ws/:sessionId` | Web client real-time connection |
| GET | `/` | Web UI (static files) |

## Keep-Alive

| Path | Mechanism | Interval |
|------|-----------|----------|
| Server → CLI WS | `ws.ping()` | 30s |
| CLI → Server WS | `keep_alive` app-level message | 300s |
| CLI pong timeout | Disconnect if pong not received | 10s |

## License

Internal project.
