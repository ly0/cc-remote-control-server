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

Claude Code's bridge mode has two `BASE_API_URL` configs: the **prod** config points to `https://api.anthropic.com`, and the **local/dev** config points to `http://localhost:3000`. To point it at your self-hosted server, you need to patch `cli.js`.

> **Note:** The function names and line numbers in `cli.js` change with every release (it is minified/obfuscated). The instructions below use **stable string constants** that survive across versions, so they work regardless of CLI version.

### Locating the Relevant Code

Use `grep` to find the code you need to patch. These strings are stable across CLI versions:

```bash
# 1. Find the hardcoded BASE_API_URL (prod config)
grep -n 'BASE_API_URL: "https://api.anthropic.com"' cli.js

# 2. Find the OAuth URL allowlist
grep -n 'beacon.claude-ai.staging.ant.dev' cli.js

# 3. Find the HTTP enforcement check (2.1.63+)
grep -n 'Remote Control base URL uses HTTP' cli.js

# 4. Find the WebSocket URL derivation (v1 vs v2 routing, 2.1.63+)
grep -n 'session_ingress/ws/' cli.js
```

### Patch Method

**Option A: Patch the hardcoded URL directly**

Replace `https://api.anthropic.com` in the prod config with your server's URL:

```bash
# Example: point to a remote server at 192.168.1.100:3000
sed -i '' 's|BASE_API_URL: "https://api.anthropic.com"|BASE_API_URL: "http://192.168.1.100:3000"|' cli.js
```

**Option B: Bypass the allowlist for `CLAUDE_CODE_CUSTOM_OAUTH_URL`**

The CLI supports `CLAUDE_CODE_CUSTOM_OAUTH_URL` but validates it against a hardcoded allowlist. Find the allowlist by searching for `beacon.claude-ai.staging.ant.dev` and add your URL:

```bash
# Find the allowlist array (contains "beacon.claude-ai.staging.ant.dev")
grep -n 'beacon.claude-ai.staging.ant.dev' cli.js

# Add your server URL to the allowlist array, then set the env var:
sed -i '' 's|"https://beacon.claude-ai.staging.ant.dev"|"https://beacon.claude-ai.staging.ant.dev","https://your-server.example.com"|' cli.js
export CLAUDE_CODE_CUSTOM_OAUTH_URL=https://your-server.example.com
```

### Important Notes

1. **HTTP vs HTTPS** (2.1.63+): The CLI enforces HTTPS for non-localhost URLs (search for `Remote Control base URL uses HTTP`). If your server uses plain HTTP on a non-localhost address, you must either:
   - Set up a reverse proxy with TLS (recommended)
   - Patch out the HTTP check:

   ```bash
   # Neutralize the HTTP enforcement check
   sed -i '' 's/v.startsWith("http:\/\/") && !v.includes("localhost") && !v.includes("127.0.0.1")/false/' cli.js
   ```

2. **WebSocket URL derivation** (2.1.63+): The function containing `session_ingress/ws/` automatically derives the WebSocket URL from `api_base_url`:
   - For `localhost` / `127.0.0.1`: uses `ws://` and `/v2/` prefix
   - For all other hosts: uses `wss://` and `/v1/` prefix

   If your self-hosted server only supports `/v2/` routes (like this project does), and is not on localhost, patch it to always use `v2`:

   ```bash
   # Force v2 routing for all hosts
   # The pattern: K ? "v2" : "v1" → always "v2"
   sed -i '' 's/z = K ? "v2" : "v1"/z = "v2"/' cli.js
   ```

3. **Work secret `api_base_url`**: The server embeds its own URL in the work secret. If your server is accessible at a different address than `localhost:${PORT}` (e.g., behind a reverse proxy), set the `API_BASE_URL` env var:

   ```bash
   # Set the externally-reachable address of your server
   export API_BASE_URL=http://your-external-address:3000
   ```

### One-Click Patch Script

Replace `YOUR_SERVER_URL` with your server address (e.g., `http://192.168.1.100:3000`):

```bash
#!/bin/bash
set -e

CLI_JS="cli.js"
SERVER_URL="${1:?Usage: $0 <server-url>}"  # e.g. http://192.168.1.100:3000

# Verify the file exists
[ -f "$CLI_JS" ] || { echo "Error: $CLI_JS not found"; exit 1; }

# Backup
cp "$CLI_JS" "$CLI_JS.bak"

# 1. Patch prod BASE_API_URL
sed -i '' "s|BASE_API_URL: \"https://api.anthropic.com\"|BASE_API_URL: \"${SERVER_URL}\"|" "$CLI_JS"

# 2. Force v2 WebSocket routing (2.1.63+, no-op on older versions)
sed -i '' 's/z = K ? "v2" : "v1"/z = "v2"/' "$CLI_JS"

# 3. Neutralize HTTP enforcement (2.1.63+, only needed if SERVER_URL uses http:// on non-localhost)
if echo "$SERVER_URL" | grep -q '^http://' && ! echo "$SERVER_URL" | grep -qE '(localhost|127\.0\.0\.1)'; then
    sed -i '' 's/v.startsWith("http:\/\/") \&\& !v.includes("localhost") \&\& !v.includes("127.0.0.1")/false/' "$CLI_JS"
fi

echo "Patched $CLI_JS to use $SERVER_URL (backup: $CLI_JS.bak)"
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
