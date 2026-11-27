# Cloning 100LUCK

The project has **no repository yet**, so there is nothing to `git clone`. This is how you
create one, and how anyone (including future you) clones it afterwards.

A clone-ready archive is already prepared:

| | |
|---|---|
| File | `100luck-source.tar.gz` (5.6 MB, 879 files) |
| Drive id | `1f0jR9Vs--mxW6V2WtiTMlLq9kTJhZy6r` (public) |
| Contains | app source, `admin/`, `android-app/`, `db/`, `scripts/`, `public/` incl. all 570 game thumbnails |
| Excludes | `.env.local`, both keystores, `node_modules`, `.next`, `backups/` — verified clean |

---

## Step 1 — Get the code onto your machine

```bash
curl -sL "https://drive.google.com/uc?export=download&id=1f0jR9Vs--mxW6V2WtiTMlLq9kTJhZy6r" \
  -o 100luck-source.tar.gz
tar xzf 100luck-source.tar.gz
cd 100luck
```

You now have the whole project. Verify it looks right:

```bash
ls            # app components lib public db admin android-app scripts
cat .env.example
```

## Step 2 — Create the repository

Create an **empty private** repo on GitHub/GitLab (no README, no .gitignore — you already
have one), then:

```bash
cd 100luck
git init
git add -A

# IMPORTANT: confirm nothing secret is staged. Expect NO output.
git status --short | grep -E "\.env|\.jks|keystore|backups/"

git commit -m "Initial commit: 100LUCK player site, admin panel, Android app"
git branch -M main
git remote add origin git@github.com:YOURNAME/100luck.git
git push -u origin main
```

From this moment anyone can:

```bash
git clone git@github.com:YOURNAME/100luck.git
```

## Step 3 — Run it locally

```bash
npm install

cp .env.example .env.local
# fill in DATABASE_URL at minimum — the app boots and shows games in demo mode
# with SOFTAGG_API_LOGIN/PASSWORD empty, so you can run it before wiring payments

npm run dev          # http://localhost:3000
```

Useful while developing:

```bash
npm run lint         # tsc --noEmit
npm run build        # production build
npm start            # serve the production build
node scripts/gen-game-thumbs.js   # rebuild the 570 lobby thumbnails
```

The **admin panel** is a separate app:

```bash
cd admin
npm install
npm run dev          # Vite dev server
npm run build        # outputs admin/dist (static)
```

The **Android app**:

```bash
bash android-app/build.sh       # APK -> android-app/build/100LUCK-<ver>.apk
bash android-app/build-aab.sh   # Play bundle -> android-app/build-aab/
```

Both need `JAVA_HOME` (JDK 17+) and `ANDROID_HOME` with platform 36 + build-tools 36.

## Step 4 — Restore the database

The dump is **not** in the repo (it holds real player data). Take one:

```bash
pg_dump "$PROD_DATABASE_URL" --no-owner --no-privileges -Fc -f 100luck.dump
pg_restore --no-owner --no-privileges -d "$LOCAL_OR_NEW_DATABASE_URL" 100luck.dump
```

Or build an empty schema from `db/schema.sql` + `db/migrations/*` if you only need the
structure for development.

## Step 5 — What deliberately is NOT in the repo

| Not included | Why | Where it lives |
|---|---|---|
| `.env.local` | real API keys | Vercel dashboard; `.env.example` lists every variable |
| `android-app/keystore/*.jks` | APK + Play signing keys | **back these up separately** — losing them ends your ability to update the app |
| `backups/*.json` | game title snapshots | regenerate with the sync scripts |
| `node_modules`, `.next` | rebuilt by `npm install` / `npm run build` | — |
| the database dump | real player data | take a fresh `pg_dump` |

**Back up the keystores right now.** `100luck-release.jks` signs the APK you hand out;
`100luck-upload.jks` signs every future Play update. They exist in only two places today
(this workspace and the Drive tarball). Copy them somewhere encrypted and offline.

---

## If you clone onto a small machine

A full `next build` needs roughly **1.5–2 GB of free RAM** with Turbopack. On a 1 GB VPS or
a small CI box you will see the process killed with exit code `137`. Options:

```bash
NODE_OPTIONS="--max-old-space-size=1536" npm run build   # if you have the RAM headroom
```

or build on the host/CI rather than on the box. This is a build-machine constraint, not a
problem with the code — `npx tsc --noEmit` passes cleanly on a clone.

## Verify the clone is healthy

```bash
npx tsc --noEmit          # typecheck — should print nothing
npm run build             # should end with "Compiled successfully"
npm start                 # http://localhost:3000 should render the lobby
```

If `/api/games` returns games, your `DATABASE_URL` is right. If the lobby shows the 17
built-in demo games instead, you are in demo mode — set the `SOFTAGG_*` credentials.
