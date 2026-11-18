#!/bin/bash
# 备份白板数据（白板 JSON + 会话）
# 用法：bash scripts/backup.sh [目标目录]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$ROOT/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$DEST/board-backup-$STAMP"

mkdir -p "$OUT"
cp -R "$ROOT/data/boards" "$OUT/boards"
[ -f "$ROOT/data/sessions.json" ] && cp "$ROOT/data/sessions.json" "$OUT/"

echo "✓ 已备份到 $OUT"
echo "  恢复：把 boards/*.json 拷回 $ROOT/data/boards/ 即可"
