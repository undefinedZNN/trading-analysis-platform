#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_COUNT="${WORKER_COUNT:-1}"
PM2_CONFIG="${PM2_CONFIG:-$ROOT_DIR/pm2.config.js}"

cd "$ROOT_DIR"

if [ "${DRY_RUN:-false}" = "true" ]; then
  echo "[dry-run] pm2 start $PM2_CONFIG --only worker --instances $WORKER_COUNT"
else
  if ! command -v pm2 >/dev/null 2>&1; then
    echo "pm2 is required. Install via 'npm install -g pm2'."
    exit 1
  fi

  if [ ! -f "$PM2_CONFIG" ]; then
    echo "PM2 config not found at $PM2_CONFIG"
    exit 1
  fi

  pm2 start "$PM2_CONFIG" --only worker --instances "$WORKER_COUNT"
  pm2 save >/dev/null 2>&1 || true
  echo "Started $WORKER_COUNT worker instance(s) via PM2."
fi
