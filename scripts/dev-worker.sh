#!/usr/bin/env bash
set -u

# 프로젝트 루트 기준 절대경로 확정
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export MUSIC_GEN_DB_PATH="${MUSIC_GEN_DB_PATH:-$ROOT/data/music-gen.db}"
export NEXTJS_API_URL="${NEXTJS_API_URL:-http://localhost:3000}"

# Ctrl+C / SIGTERM: 자식 프로세스에 신호 전파 후 종료
trap 'kill -TERM "$child" 2>/dev/null; wait "$child" 2>/dev/null; exit 0' INT TERM

# venv 활성화 (있는 경우)
if [ -f "$ROOT/.venv/bin/activate" ]; then
  . "$ROOT/.venv/bin/activate"
  echo "[worker] venv 활성화: $ROOT/.venv"
fi

echo "[worker] DB: $MUSIC_GEN_DB_PATH"
echo "[worker] API: $NEXTJS_API_URL"
echo "[worker] Python: $(python3 --version 2>&1)"

RESTARTS=0
LAST=0

while true; do
  NOW=$(date +%s)

  # flapping 감지: 10초 내 재시작이면 카운터 증가
  if [ $((NOW - LAST)) -lt 10 ]; then
    RESTARTS=$((RESTARTS + 1))
  else
    RESTARTS=0
  fi

  if [ "$RESTARTS" -ge 5 ]; then
    echo "[worker] flapping 감지 (10초 내 5회 재시작). 종료합니다."
    exit 1
  fi

  LAST=$NOW

  cd "$ROOT"
  python3 -m workers.python.daemon &
  child=$!
  wait "$child"
  EXIT_CODE=$?

  if [ "$EXIT_CODE" -ne 0 ]; then
    echo "[worker] 비정상 종료 (exit=$EXIT_CODE), 재시작 중... ($RESTARTS/5)"
  fi

  sleep 2
done
