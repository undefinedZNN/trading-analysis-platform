#!/usr/bin/env bash

set -euo pipefail

if [ "${DRY_RUN:-false}" = "true" ]; then
  echo "[dry-run] pm2 delete worker"
else
  if ! command -v pm2 >/dev/null 2>&1; then
    echo "pm2 is required. Install via 'npm install -g pm2'."
    exit 1
  fi

  pm2 delete worker >/dev/null 2>&1 || true
  pm2 save >/dev/null 2>&1 || true
  echo "Stopped worker instance(s) managed by PM2."
fi
