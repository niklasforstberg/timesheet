#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

export DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-/home/deploy/.env.timesheet}"

if [ ! -f "$DEPLOY_ENV_FILE" ]; then
  echo "ERROR: env file not found: $DEPLOY_ENV_FILE"
  exit 1
fi

docker compose down --remove-orphans
docker compose build
docker compose up -d

# EF Core migrations run on app start (Program.cs)
echo "Deploy complete"
