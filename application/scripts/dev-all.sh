#!/usr/bin/env bash
# 同時啟動 Python epistemic 服務 + Node 後端，方便本機開發。
# 用法：npm run dev:all（在 application/ 底下執行）
#
# Ctrl+C 會透過 trap 把兩個 process 一起關掉，不會留下背景殭屍 process。

set -e
cd "$(dirname "$0")/.."   # 確保 CWD 是 application/

echo "[dev-all] 啟動 Epistemic 服務（Python, port ${EPISTEMIC_PORT:-8765}）..."
python3 ../integration/epistemic_adapter/http_server.py &
EPI_PID=$!

cleanup() {
  echo ""
  echo "[dev-all] 關閉服務..."
  kill "$EPI_PID" 2>/dev/null || true
  wait "$EPI_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# 等 Python 服務就緒再啟動 Node，避免 Node 啟動瞬間打到還沒起來的服務
for i in $(seq 1 20); do
  if curl -s -o /dev/null "http://127.0.0.1:${EPISTEMIC_PORT:-8765}/health" 2>/dev/null; then
    echo "[dev-all] Epistemic 服務就緒。"
    break
  fi
  sleep 0.5
done

echo "[dev-all] 啟動 Node 後端（port ${PORT:-3001}）..."
npm run dev
