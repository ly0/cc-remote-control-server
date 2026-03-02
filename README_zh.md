# Claude Code Remote Control Server（远程控制服务器）

一个自建的服务器，为 Claude Code CLI 会话提供**实时、双向**的 Web 交互界面。

**[English](./README.md)**

![Remote Control Server 效果图](./eihei.jpg)

## 为什么需要 Remote Control？

Claude Code 将对话历史存储为本地 JSONL 文件（`~/.claude/projects/.../`）。读取这些文件只能得到一个静态的、事后的视图。

Remote Control 模式有本质区别：

- **实时流式传输** — Claude 的回复、工具调用、推理过程在发生时就能看到，而不是事后查看。
- **双向交互** — 在 Web UI 中发送消息、批准/拒绝工具权限请求、回答 elicitation 提问。你是参与者，不是旁观者。
- **多设备访问** — 在网络中的任何设备上打开浏览器即可访问 Web UI。

## 架构

```
浏览器 (Web UI)
    ↕  WebSocket /api/ws/:sessionId
Remote Control Server（本项目）
    ↕  WebSocket /v2/session_ingress/ws/:sessionId
    ↕  HTTP POST /v2/session_ingress/session/:sessionId/events
Claude Code CLI（bridge 模式）
```

CLI 以 **bridge 模式**运行，向服务器注册为一个 "environment"。当用户通过 Web UI 创建会话时，服务器将工作分派给 CLI。CLI 启动子进程，通过 WebSocket + HTTP POST（HybridTransport）连回服务器，实时传输所有事件。

## 快速开始

### 1. 安装依赖

```bash
cd remote-control-server
npm install
```

### 2. 构建并运行

```bash
npm run build
npm start
```

或使用开发模式：

```bash
npm run dev
```

服务器默认启动在 `http://0.0.0.0:3000`。在浏览器中打开 `http://localhost:3000` 访问 Web UI。

### 3. 配置

环境变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT`   | `3000`  | 服务器监听端口 |
| `HOST`   | `0.0.0.0` | 服务器绑定地址 |
| `DEBUG`  | （未设置） | 设为任意值启用请求日志 |

## 修补 Claude Code 以使用自建服务器

Claude Code 的 bridge 模式有两个 `BASE_API_URL` 配置：**prod** 配置指向 `https://api.anthropic.com`，**local/dev** 配置指向 `http://localhost:3000`。要将其指向自建服务器，需要修补 `cli.js`。

> **注意：** `cli.js` 中的函数名和行号每个版本都会变化（经过混淆压缩）。以下指引使用**稳定的字符串常量**来定位代码，不受 CLI 版本影响。

### 定位相关代码

使用 `grep` 搜索以下跨版本稳定的字符串来定位需要修补的代码：

```bash
# 1. 找到硬编码的 BASE_API_URL（prod 配置）
grep -n 'BASE_API_URL: "https://api.anthropic.com"' cli.js

# 2. 找到 OAuth URL 白名单
grep -n 'beacon.claude-ai.staging.ant.dev' cli.js

# 3. 找到 HTTP 强制检查（2.1.63+）
grep -n 'Remote Control base URL uses HTTP' cli.js

# 4. 找到 WebSocket URL 推导逻辑（v1 vs v2 路由，2.1.63+）
grep -n 'session_ingress/ws/' cli.js
```

### 修补方法

**方案 A：直接修改硬编码 URL**

将 prod 配置中的 `https://api.anthropic.com` 替换为你的服务器地址：

```bash
# 示例：指向 192.168.1.100:3000 上的服务器
sed -i '' 's|BASE_API_URL: "https://api.anthropic.com"|BASE_API_URL: "http://192.168.1.100:3000"|' cli.js
```

**方案 B：绕过 `CLAUDE_CODE_CUSTOM_OAUTH_URL` 的白名单**

CLI 支持 `CLAUDE_CODE_CUSTOM_OAUTH_URL` 环境变量，但会验证其是否在硬编码的白名单中。通过搜索 `beacon.claude-ai.staging.ant.dev` 找到白名单并添加你的 URL：

```bash
# 找到白名单数组（包含 "beacon.claude-ai.staging.ant.dev"）
grep -n 'beacon.claude-ai.staging.ant.dev' cli.js

# 将你的服务器 URL 添加到白名单数组，然后设置环境变量：
sed -i '' 's|"https://beacon.claude-ai.staging.ant.dev"|"https://beacon.claude-ai.staging.ant.dev","https://your-server.example.com"|' cli.js
export CLAUDE_CODE_CUSTOM_OAUTH_URL=https://your-server.example.com
```

### 重要注意事项

1. **HTTP 与 HTTPS**（2.1.63+）：CLI 强制要求非 localhost URL 使用 HTTPS（搜索 `Remote Control base URL uses HTTP`）。如果你的服务器在非 localhost 地址上使用明文 HTTP，你需要：
   - 配置带 TLS 的反向代理（推荐）
   - 或去掉 HTTP 检查：

   ```bash
   # 中和 HTTP 强制检查
   sed -i '' 's/v.startsWith("http:\/\/") && !v.includes("localhost") && !v.includes("127.0.0.1")/false/' cli.js
   ```

2. **WebSocket URL 推导**（2.1.63+）：包含 `session_ingress/ws/` 的函数从 `api_base_url` 自动推导 WebSocket URL：
   - `localhost` / `127.0.0.1`：使用 `ws://` 和 `/v2/` 前缀
   - 其他主机：使用 `wss://` 和 `/v1/` 前缀

   如果你的自建服务器只支持 `/v2/` 路由（如本项目），且不在 localhost 上，需要强制使用 `v2`：

   ```bash
   # 强制所有主机使用 v2 路由
   # 将 K ? "v2" : "v1" 改为始终 "v2"
   sed -i '' 's/z = K ? "v2" : "v1"/z = "v2"/' cli.js
   ```

3. **Work secret 中的 `api_base_url`**：服务器在 work secret 中嵌入自身 URL。如果你的服务器通过不同于 `localhost:${PORT}` 的地址对外提供服务（例如反向代理后），设置 `API_BASE_URL` 环境变量：

   ```bash
   # 设为服务器的外部可达地址
   export API_BASE_URL=http://your-external-address:3000
   ```

### 一键修补脚本

将 `YOUR_SERVER_URL` 替换为你的服务器地址（如 `http://192.168.1.100:3000`）：

```bash
#!/bin/bash
set -e

CLI_JS="cli.js"
SERVER_URL="${1:?用法: $0 <server-url>}"  # 例如 http://192.168.1.100:3000

# 验证文件存在
[ -f "$CLI_JS" ] || { echo "错误: 未找到 $CLI_JS"; exit 1; }

# 备份
cp "$CLI_JS" "$CLI_JS.bak"

# 1. 修补 prod BASE_API_URL
sed -i '' "s|BASE_API_URL: \"https://api.anthropic.com\"|BASE_API_URL: \"${SERVER_URL}\"|" "$CLI_JS"

# 2. 强制 v2 WebSocket 路由（2.1.63+，旧版本无影响）
sed -i '' 's/z = K ? "v2" : "v1"/z = "v2"/' "$CLI_JS"

# 3. 中和 HTTP 强制检查（2.1.63+，仅当 SERVER_URL 在非 localhost 上使用 http:// 时需要）
if echo "$SERVER_URL" | grep -q '^http://' && ! echo "$SERVER_URL" | grep -qE '(localhost|127\.0\.0\.1)'; then
    sed -i '' 's/v.startsWith("http:\/\/") \&\& !v.includes("localhost") \&\& !v.includes("127.0.0.1")/false/' "$CLI_JS"
fi

echo "已修补 $CLI_JS，目标服务器: $SERVER_URL（备份: $CLI_JS.bak）"
```

## API 端点

### CLI 协议

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/v1/environments/bridge` | 注册 bridge 环境 |
| GET | `/v1/environments/:envId/work/poll` | 长轮询等待工作（8 秒超时） |
| POST | `/v1/environments/:envId/work/:workId/ack` | 确认工作 |
| POST | `/v1/environments/:envId/work/:workId/stop` | 停止工作 |
| DELETE | `/v1/environments/bridge/:envId` | 注销环境 |
| POST | `/v1/sessions` | 创建新会话 |
| GET | `/v1/sessions/:sessionId` | 获取会话信息 |

### Session Ingress（HybridTransport）

| 方法 | 路径 | 说明 |
|------|------|------|
| WebSocket | `/v2/session_ingress/ws/:sessionId` | CLI 双向连接 |
| POST | `/v2/session_ingress/session/:sessionId/events` | 批量事件上报 |

### Web UI

| 方法 | 路径 | 说明 |
|------|------|------|
| WebSocket | `/api/ws/:sessionId` | Web 客户端实时连接 |
| GET | `/` | Web UI（静态文件） |

## 保活机制

| 路径 | 机制 | 间隔 |
|------|------|------|
| Server → CLI WS | `ws.ping()` | 30 秒 |
| CLI → Server WS | `keep_alive` 应用层消息 | 300 秒 |
| CLI pong 超时 | 未收到 pong 则断开 | 10 秒 |

## 许可证

内部项目。
