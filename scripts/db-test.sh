#!/usr/bin/env bash
#
# Applies every migration to an empty database, loads the seed, and runs the
# SQL test suites against it.
#
# The point is not only the assertions. Building the schema from nothing every
# time is what catches a migration that only works because of what was already
# in the developer's database — the failure that otherwise appears for the
# first time in production.
#
#   ./scripts/db-test.sh                 # uses a local socket in /tmp
#   DATABASE_URL=postgres://… ./scripts/db-test.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_NAME="${DB_NAME:-housecontrol_test}"

if [[ -n "${DATABASE_URL:-}" ]]; then
  PSQL=(psql "$DATABASE_URL")
  ADMIN=(psql "$DATABASE_URL")
else
  HOST="${PGHOST:-/tmp}"
  PORT="${PGPORT:-5433}"
  USER="${PGUSER:-$(whoami)}"
  PSQL=(psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB_NAME")
  ADMIN=(psql -h "$HOST" -p "$PORT" -U "$USER" -d postgres)

  "${ADMIN[@]}" -q -c "drop database if exists $DB_NAME" -c "create database $DB_NAME"
fi

run() { "${PSQL[@]}" -v ON_ERROR_STOP=1 -q -f "$1"; }

echo "→ auth stub"
run "$ROOT/supabase/tests/auth-stub.sql"

echo "→ migrations"
for file in "$ROOT"/supabase/migrations/*.sql; do
  printf '   %s\n' "$(basename "$file")"
  run "$file"
done

echo "→ seed"
run "$ROOT/supabase/seed.sql"

echo "→ tests"
failures=0
for file in "$ROOT"/supabase/tests/[0-9]*.sql; do
  printf '\n%s\n' "$(basename "$file")"
  # psql prefixes notices with the file and line; strip that so the output
  # reads as a test report rather than a log.
  if "${PSQL[@]}" -t -A -v ON_ERROR_STOP=1 -q -f "$file" > /tmp/hc-db-test.out 2>&1; then
    sed -n 's/.*NOTICE:  /  /p' /tmp/hc-db-test.out
  else
    sed -n 's/.*NOTICE:  /  /p' /tmp/hc-db-test.out
    grep -E "FAILED|ERROR" /tmp/hc-db-test.out | head -3
    failures=$((failures + 1))
  fi
done

if [[ $failures -gt 0 ]]; then
  echo -e "\n$failures suite(s) failed"
  exit 1
fi

echo -e "\nschema builds from empty and every invariant holds"
