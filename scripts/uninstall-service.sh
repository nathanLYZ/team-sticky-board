#!/bin/bash
# 注销协作白板的后台服务（launchd）
# 用法：bash scripts/uninstall-service.sh
set -euo pipefail

LABEL="com.teamstickyboard.server"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
DOMAIN="gui/$(id -u)"

launchctl bootout "${DOMAIN}/${LABEL}" 2>/dev/null && echo "✓ 已停止服务" || echo "· 服务未在运行"
rm -f "$PLIST"
echo "✓ 已移除 ${PLIST}（开机自启已取消）"
echo "  白板数据仍在 data/boards/，不会丢失"
