#!/bin/bash
set -e

# 设置 OAuth 环境变量
export CLAUDE_CODE_CUSTOM_OAUTH_URL=http://localhost:3000

# 启动服务器
echo "Starting Remote Control Server on http://localhost:3000..."
cd "$(dirname "$0")"
npm run dev
