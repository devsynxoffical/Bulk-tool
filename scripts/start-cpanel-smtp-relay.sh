#!/usr/bin/env bash
# Run the SMTP relay on your cPanel / iHosting VPS (same server as mail.devsynx.com).
# Railway sends email jobs here; this box delivers via local SMTP.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -z "${SMTP_RELAY_SECRET:-}" ]; then
  echo "ERROR: Set SMTP_RELAY_SECRET (same value as Railway)"
  exit 1
fi

export SMTP_RELAY_PORT="${SMTP_RELAY_PORT:-8789}"
# When relay runs on the same cPanel server as mail, use localhost for faster delivery:
export SMTP_RELAY_LOCAL_HOST="${SMTP_RELAY_LOCAL_HOST:-localhost}"

echo "Starting DEVSYNX SMTP relay on port $SMTP_RELAY_PORT ..."
exec npx tsx smtp-relay/server.ts
