#!/usr/bin/env node
/**
 * Pre-generates small WebP thumbnails for every game in games_catalog.
 *
 * WHY THIS EXISTS
 * ---------------
 * All 10,751 games point at cdn.imagesai.org, which serves the FULL-SIZE cover art
 * (~700 KB average) and cannot resize — its API ignores ?w= / ?width= / image-process
 * params and returns the immutable original every time.
 *
 * Next's image optimizer therefore had to download ~700 KB and run a PNG/JPEG decode
 * per tile. Measured cold cost on this box: 964 ms of CPU per thumbnail. On a 1-core
 * sandbox a lobby of 18 tiles paid ~15 s of server work before anything appeared, and
 * the /_next/image cache is ephemeral on Vercel, so every deploy re-paid it.
 *
 * Generating a 160px WebP once, into public/thumbs/, makes the browser fetch ~7 KB
 * straight from the static file layer. No optimizer, no server CPU, no cold cache.
 *
 * USAGE
 *   node scripts/gen-game-thumbs.js [--limit N] [--force] [--concurrency N]
 *
 * Writes  public/thumbs/games/<game_code>.webp
 * Leaves  games_catalog.thumbnail_url untouched, so nothing breaks if the job is
 *         only partially run — the site keeps using the CDN for anything missing.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const sharp = require("sharp");

const OUT = path.join(__dirname, "..", "public", "thumbs", "games");
const SIZE = 160;       // tile CSS box peaks at ~180px; 160 covers 1x with margin
const QUALITY = 70;
const UPLOAD_PREFIX = "/thumbs/games/";

const args = process.argv.slice(2);
const LIMIT = Number(args[args.indexOf("--limit") + 1]) || 0;
const FORCE = args.includes("--force");
const CONC = Number(args[args.indexOf("--concurrency") + 1]) || 10;

// minimal .env.local reader (the project does not depend on dotenv)
(function loadEnv() {
  const p = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
})();

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  fs.mkdirSync(OUT, { recursive: true });

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  // Only the games a player can actually reach need a local thumbnail:
  //   - the first 300 of the lobby query (ORDER BY is_hot DESC, sort_order, id)
  //   - the first 300 of every category tab
  //   That is 582 rows today, not 10,751. Covering the long tail would bloat the
  //   deployment for tiles nobody ever scrolls to.
  const { rows } = await db.query(
    `WITH top_all AS (
       SELECT id FROM games_catalog WHERE is_active = TRUE
       ORDER BY is_hot DESC, sort_order ASC, id ASC LIMIT 300
     ), per_cat AS (
       SELECT id FROM (
         SELECT id, ROW_NUMBER() OVER (
           PARTITION BY category ORDER BY is_hot DESC, sort_order ASC, id ASC
         ) rn FROM games_catalog WHERE is_active = TRUE
       ) t WHERE rn <= 300
     )
     SELECT g.game_code, g.thumbnail_url FROM games_catalog g
      WHERE g.id IN (SELECT id FROM top_all UNION SELECT id FROM per_cat)
        AND coalesce(g.thumbnail_url,'') <> ''
        AND g.thumbnail_url NOT LIKE '${UPLOAD_PREFIX}%'
      ORDER BY g.is_hot DESC, g.sort_order ASC, g.id ASC`
  );

  let todo = rows;
  if (!FORCE) {
    todo = rows.filter(r => !fs.existsSync(path.join(OUT, `${r.game_code}.webp`)));
  }
  if (LIMIT) todo = todo.slice(0, LIMIT);

  console.log(`catalog: ${rows.length} games with a CDN image`);
  console.log(`to build: ${todo.length}` + (LIMIT ? ` (limit ${LIMIT})` : ""));
  if (!todo.length) { await db.end(); return; }

  let done = 0, failed = 0, inBytes = 0, outBytes = 0;
  const started = Date.now();

  const queue = todo.slice();
  async function worker() {
    for (;;) {
      const row = queue.shift();
      if (!row) return;
      const dest = path.join(OUT, `${row.game_code}.webp`);
      try {
        const res = await fetch(row.thumbnail_url, { signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const out = await sharp(buf)
          .resize(SIZE, SIZE, { fit: "cover", position: "centre" })
          .webp({ quality: QUALITY, effort: 4 })
          .toBuffer();
        fs.writeFileSync(dest, out);
        inBytes += buf.length;
        outBytes += out.length;
        done++;
      } catch (e) {
        failed++;
        if (failed <= 10) console.log(`  ! ${row.game_code}: ${e.message}`);
      }
      const n = done + failed;
      if (n % 100 === 0) {
        const rate = n / ((Date.now() - started) / 1000);
        const eta = ((todo.length - n) / rate) / 60;
        console.log(
          `  ${n}/${todo.length}  ${rate.toFixed(1)}/s  ` +
          `in ${(inBytes / 1048576).toFixed(1)}MB -> out ${(outBytes / 1024).toFixed(0)}KB  ` +
          `eta ${eta.toFixed(0)}m`
        );
      }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));

  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`\ndone in ${secs}s — built ${done}, failed ${failed}`);
  console.log(`download ${(inBytes / 1048576).toFixed(1)} MB -> wrote ${(outBytes / 1048576).toFixed(2)} MB`);
  await db.end();
}

main().catch(e => { console.error(e); process.exit(1); });
