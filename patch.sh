#!/bin/bash
set -e

SERVER_URL="${1:?用法: $0 <server-url>}"  # 例如 http://192.168.1.100:3000

# ---- 自动检测 Claude CLI 路径（版本无关） ----
if [ -n "$CLI_JS" ]; then
    : # 用户通过 CLI_JS 环境变量指定
elif command -v claude >/dev/null 2>&1; then
    CLI_JS="$(readlink -f "$(command -v claude)" 2>/dev/null)" \
        || CLI_JS="$(realpath "$(command -v claude)" 2>/dev/null)" \
        || CLI_JS="$(command -v claude)"
else
    echo "错误: 在 PATH 中未找到 'claude'"
    echo "手动指定: CLI_JS=/path/to/claude $0 $*"
    exit 1
fi
echo "CLI: $CLI_JS"

# ---- 跨平台 sed -i（GNU vs BSD） ----
if sed --version 2>/dev/null | grep -q 'GNU'; then
    sedi() { sed -i "$@"; }
else
    sedi() { sed -i '' "$@"; }
fi

# 备份
cp "$CLI_JS" "$CLI_JS.bak"

# 1. 修补 prod BASE_API_URL
#    [[:space:]]* 同时兼容压缩（无空格）和非压缩（有空格）的 JS
sedi -E "s|BASE_API_URL:[[:space:]]*\"https://api\.anthropic\.com\"|BASE_API_URL:\"${SERVER_URL}\"|" "$CLI_JS"

# 2. 强制 v2 WebSocket 路由（三元表达式两个分支都返回 "v2"）
#    匹配 ?"v2":"v1"，不依赖变量名和空格
sedi -E 's/\?[[:space:]]*"v2"[[:space:]]*:[[:space:]]*"v1"/?"v2":"v2"/' "$CLI_JS"

# 3. 中和 HTTP 强制检查（仅当 SERVER_URL 在非 localhost 上使用 http:// 时需要）
if echo "$SERVER_URL" | grep -q '^http://' && ! echo "$SERVER_URL" | grep -qE '(localhost|127\.0\.0\.1)'; then
    sedi -E 's/[a-zA-Z_$]+\.startsWith\("http:\/\/"\)[[:space:]]*&&[[:space:]]*![a-zA-Z_$]+\.includes\("localhost"\)[[:space:]]*&&[[:space:]]*![a-zA-Z_$]+\.includes\("127\.0\.0\.1"\)/false/' "$CLI_JS"
fi

# 4. 绕过 tengu_ccr_bridge feature flag（sync 检查）
sedi -E 's/[A-Za-z0-9_]+\("tengu_ccr_bridge",[[:space:]]*!1\)/!0/g' "$CLI_JS"

# 5. 中和 async feature flag 运行时检查
sedi 's/console.error("Error: Remote Control is not yet enabled for your account."), process.exit(1)/void 0/' "$CLI_JS"
sedi 's/return "Remote Control is not enabled. Wait for the feature flag rollout."/return null/' "$CLI_JS"

# 6. 中和 bridge 初始化中的 async flag 检查（2.1.68+ 已内置为 true，此为空操作）
sedi -E 's/return [A-Za-z0-9_]+\("tengu_ccr_bridge"\)/return !0/' "$CLI_JS"

echo ""
echo "已修补 $CLI_JS，目标服务器: $SERVER_URL（备份: $CLI_JS.bak）"
echo ""
echo "如果你没有 claude.ai 账号，还需设置："
echo "  export CLAUDE_CODE_OAUTH_TOKEN=self-hosted"
