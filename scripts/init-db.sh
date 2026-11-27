#!/usr/bin/env bash
# Initialises the local PostgreSQL database from db/schema.sql + db/seed.sql
set -euo pipefail
cd "$(dirname "$0")/.."
DB_URL="${DATABASE_URL:-postgres://postgres@localhost:5432/postgres}"
echo "▶ Applying schema to ${DB_URL}"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f db/schema.sql
echo "▶ Seeding"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f db/seed.sql
echo "✔ Database ready"
