#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if [ -d "src/.git" ]; then
  echo "agent-desktop 已存在，拉取更新..."
  cd src && git pull --ff-only
else
  echo "正在 clone agent-desktop..."
  git clone --depth 1 https://github.com/vercel-labs/agent-desktop.git src
fi

cd src
echo "安装依赖..."
npm install
npm install -g . || true

echo "验证："
agent-desktop --version || npx agent-desktop --version || echo "请检查 PATH"
