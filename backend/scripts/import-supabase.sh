#!/usr/bin/env bash
set -euo pipefail

DB_URL="${DB_URL:-postgres://neurelix:neurelix@localhost:5432/neurelix}"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <public.dump|public.sql> [auth_users.dump|auth_users.sql]" >&2
  exit 1
fi

PUBLIC_FILE="$1"
AUTH_FILE="${2:-}"

import_file() {
  local file="$1"
  if [[ -z "$file" ]]; then
    return 0
  fi

  if [[ "$file" == *.dump ]]; then
    echo "[import] pg_restore $file -> $DB_URL"
    pg_restore --no-owner --no-privileges --clean --if-exists --dbname "$DB_URL" "$file"
  elif [[ "$file" == *.sql ]]; then
    echo "[import] psql $file -> $DB_URL"
    psql "$DB_URL" -f "$file"
  else
    echo "Unsupported file extension: $file" >&2
    exit 2
  fi
}

import_file "$PUBLIC_FILE"
import_file "$AUTH_FILE"

if command -v psql >/dev/null 2>&1; then
  echo "[verify] basic row counts"
  psql "$DB_URL" -f "$(dirname "$0")/verify-db.sql" || true
fi
