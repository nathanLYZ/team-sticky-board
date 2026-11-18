#!/bin/bash
# 把协作白板注册成 macOS 开机自启的后台服务（launchd）
# 用法：bash scripts/install-service.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.teamstickyboard.server"
PORT="${PORT:-8787}"
NODE_BIN="$(command -v node)"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
DOMAIN="gui/$(id -u)"

if [ -z "$NODE_BIN" ]; then
  echo "✗ 找不到 node，请先安装 Node.js" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$ROOT/data"

# 停掉手工启动的旧进程，否则新服务会撞端口
if pgrep -f "server/index.js" >/dev/null 2>&1; then
  echo "→ 停掉手工启动的旧服务进程"
  pkill -f "server/index.js" || true
  sleep 1
fi

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/caffeinate</string>
    <string>-i</string>
    <string>${NODE_BIN}</string>
    <string>${ROOT}/server/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key>
    <string>${PORT}</string>
    <key>HOST</key>
    <string>0.0.0.0</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${ROOT}/data/server.log</string>
  <key>StandardErrorPath</key>
  <string>${ROOT}/data/server-error.log</string>
</dict>
</plist>
EOF

launchctl bootout "${DOMAIN}/${LABEL}" 2>/dev/null || true
launchctl bootstrap "${DOMAIN}" "$PLIST"
sleep 2

if ! curl -s -m 3 -o /dev/null "http://127.0.0.1:${PORT}/api/boards"; then
  echo "✗ 服务未正常响应，查看日志：$ROOT/data/server-error.log" >&2
  tail -20 "$ROOT/data/server-error.log" 2>/dev/null || true
  exit 1
fi

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo '<本机IP>')"
echo "✓ 服务已注册为开机自启（${LABEL}）"
echo "  本机访问：http://localhost:${PORT}"
echo "  内网访问：http://${LAN_IP}:${PORT}"
echo "  日志：${ROOT}/data/server.log"
echo "  卸载：bash scripts/uninstall-service.sh"
