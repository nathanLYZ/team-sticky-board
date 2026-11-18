#!/bin/bash
# 显示同事该用什么地址访问，并做一次连通性自检
# 用法：bash scripts/lan-address.sh
set -uo pipefail

PORT="${PORT:-8787}"
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo '')"

echo "本机访问：http://localhost:${PORT}"
if [ -n "$IP" ]; then
  echo "内网访问：http://${IP}:${PORT}    ← 把这个链接发给同事"
else
  echo "内网访问：未取到局域网 IP（可能没连 Wi-Fi/网线）"
fi

if curl -s -m 3 -o /dev/null "http://127.0.0.1:${PORT}/api/boards"; then
  echo "服务状态：运行中 ✓"
else
  echo "服务状态：没响应 ✗（试试 bash scripts/install-service.sh）"
fi

IP_CHANGED="$(ipconfig getifaddr en0 2>/dev/null)"
echo
echo "提示：IP 由路由器分配，可能变。想固定就在路由器上给这台机器做 IP 保留，"
echo "      或者每次发链接前跑一次本脚本确认。"
