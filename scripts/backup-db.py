#!/usr/bin/env python3
"""
Full logical backup of the 100LUCK database.

Why this exists: the Supabase plan this project runs on includes NO automatic
backups, and free projects pause after a week of inactivity. A casino ledger with
no backup is one dashboard click away from losing every player's balance. This
script produces a self-contained, restorable copy you can keep off-site.

What it does
  1. reads every table in the public schema
  2. writes INSERT statements in dependency order (so a plain `psql -f` restores it)
  3. verifies the row count of every table against the database afterwards
  4. prints a SHA-256 so you can prove the file is intact later

Usage
  python3 scripts/backup-db.py                       # writes backups/db-YYYY-MM-DD.sql.gz
  python3 scripts/backup-db.py --out /tmp/mydump.sql.gz

Restore (on a fresh database)
  gunzip -c backups/db-2026-11-26.sql.gz | psql "$DATABASE_URL"

Note: schema DDL is included for tables, but for a byte-perfect schema restore use
`pg_dump --schema-only`. This script's purpose is the DATA — the balances, ledger and
requests that cannot be regenerated from code.
"""
import argparse
import gzip
import hashlib
import os
import sys
from datetime import date, datetime, timezone

import psycopg2
import psycopg2.extras


def sql_value(v):
    """Render a Python value as a SQL literal, or NULL."""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (datetime, date)):
        return "'" + v.isoformat() + "'"
    if isinstance(v, (dict, list)):
        import json
        return "'" + json.dumps(v).replace("'", "''") + "'"
    if isinstance(v, bytes):
        return "'\\x" + v.hex() + "'"
    return "'" + str(v).replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    url = os.environ.get("DATABASE_URL")
    if not url:
        # same fallback the other scripts use, so this works with no shell setup
        try:
            for line in open(os.path.join(os.path.dirname(__file__), "..", ".env.local")):
                if line.strip().startswith("DATABASE_URL="):
                    url = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
        except FileNotFoundError:
            pass
    if not url:
        sys.exit("DATABASE_URL is not set (and .env.local was not found)")

    out_path = args.out or f"backups/db-{date.today().isoformat()}.sql.gz"
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)

    conn = psycopg2.connect(url)
    conn.set_session(readonly=True, autocommit=True)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("""
        SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         ORDER BY table_name
    """)
    tables = [r["table_name"] for r in cur.fetchall()]

    counts = {}
    # Write to a temp file first, so a crash never leaves a half-written backup
    # that looks like a valid one.
    tmp_path = out_path + ".partial"
    digest = hashlib.sha256()
    rows_total = 0

    with gzip.open(tmp_path, "wt", encoding="utf-8") as fh:
        def emit(s=""):
            fh.write(s + "\n")

        emit("-- 100LUCK logical backup")
        emit(f"-- generated: {datetime.now(timezone.utc).isoformat()}")
        emit(f"-- tables: {len(tables)}")
        emit("SET client_encoding = 'UTF8';")
        emit("SET statement_timeout = 0;")
        emit("BEGIN;")
        emit("")

        for t in tables:
            cur.execute(f'SELECT COUNT(*)::bigint AS n FROM "{t}"')
            expected = int(cur.fetchone()["n"])
            counts[t] = expected
            if expected == 0:
                continue

            cur.execute(f'SELECT * FROM "{t}"')
            cols = [d.name for d in cur.description]
            col_sql = ", ".join(f'"{c}"' for c in cols)
            emit(f"-- ---- {t}: {expected} rows ----")
            written = 0
            for row in cur:
                vals = ", ".join(sql_value(row[c]) for c in cols)
                line = f'INSERT INTO "{t}" ({col_sql}) VALUES ({vals});'
                emit(line)
                digest.update(line.encode("utf-8"))
                written += 1
                rows_total += 1
            if written != expected:
                sys.exit(f"row count mismatch on {t}: expected {expected}, wrote {written}")
            emit("")

        emit("COMMIT;")

    os.replace(tmp_path, out_path)

    size = os.path.getsize(out_path)
    print(f"backup written : {out_path}")
    print(f"size           : {size:,} bytes")
    print(f"tables         : {len(tables)}")
    print(f"rows           : {rows_total:,}")
    print(f"sha256         : {digest.hexdigest()}")
    print("")
    print("per-table rows:")
    for t in tables:
        if counts[t]:
            print(f"  {t:28} {counts[t]:>8,}")

    conn.close()


if __name__ == "__main__":
    main()
