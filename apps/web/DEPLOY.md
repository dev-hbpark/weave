# weave — Vercel deployment guide

WI-025. The web app is preconfigured to deploy on Vercel with **Vercel KV** (designs + resource metadata) and **Vercel Blob** (image uploads). This guide walks through everything from "fresh clone" to "live URL on `*.vercel.app`".

Everything below assumes you have:

- A GitHub account and `git` CLI
- A Vercel account (free tier is fine)
- Node 22.x, pnpm 10.x locally

---

## 1. agocraft dependency — already vendored

The 16 `@agocraft/*` packages live as tarballs in `apps/web/vendor/agocraft/` and are referenced by `apps/web/package.json` via `file:vendor/agocraft/...tgz`. Workspace-level `pnpm.overrides` in `package.json` makes the transitive `@agocraft/*` resolutions point at the same tarballs so the install is fully self-contained (lockfile has **zero** `localhost:4873` references; Vercel CI installs offline-from-vendor).

When agocraft changes, re-vendor with:

```bash
cd workspace/agocraft && pnpm --filter './packages/*' build
cd ../weave
# Re-pack into apps/web/vendor/agocraft/ — the script in
# `apps/web/scripts/repack-vendor.sh` (see below) handles versioning and
# rewriting both apps/web/package.json + the root pnpm.overrides.
./apps/web/scripts/repack-vendor.sh   # or follow the steps manually
pnpm install
git add apps/web/vendor/agocraft pnpm-lock.yaml apps/web/package.json package.json
git commit -m "chore: re-vendor agocraft tarballs"
```

> The first vendor pass is already committed; you don't need to run this again unless agocraft changes.

---

## 2. Push to GitHub

```bash
cd workspace/weave
git init -b main                       # if not yet
gh repo create weave-app --private --source . --remote origin
git add .
git commit -m "feat: workspace + cloud sync"
git push -u origin main
```

(Or use the GitHub web UI — create a repo, push from your editor.)

---

## 3. Create the Vercel project

1. Go to <https://vercel.com/new>.
2. **Import Git Repository** → pick the `weave-app` repo.
3. **Configure Project** screen:
   - **Framework Preset**: Vite
   - **Root Directory**: `apps/web` (click "Edit" — important; the build needs to run from inside the monorepo subpath, but the build command itself filters through pnpm workspace so workspace deps like `@weave/design-system` still install)
   - **Build Command**: leave as the `vercel.json` default (`pnpm --filter @weave/web build`)
   - **Install Command**: `pnpm install --frozen-lockfile`
   - **Output Directory**: `dist`
4. Don't deploy yet — click **Environment Variables** first.

---

## 4. Add Redis (KV) + Blob (storage backends)

Vercel restructured the Storage UI in late 2024 — **"KV" is no longer a
direct option in the Storage tab**. The supported path is now Marketplace
→ Upstash → Redis, and the env vars it injects use `UPSTASH_REDIS_REST_*`
naming. Our `apps/web/api/_lib/kv.ts` accepts both old (`KV_REST_API_*`)
and new (`UPSTASH_REDIS_REST_*`) names automatically, so either path works.

In the new project's **Storage** tab:

1. **Add Redis (KV-equivalent)** — recommended new flow:
   - Click **Create Database** (or **Browse Marketplace**) → under
     **Marketplace Database Providers** pick **Upstash** → **Redis**.
   - Name it `weave-kv` → select region close to your function region →
     **Create**.
   - On the **Connect Project** step pick this project + Production /
     Preview / Development.
   - Vercel injects: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
     (and possibly `KV_URL` for direct Redis access). Our client reads
     both naming conventions.

   _Legacy projects:_ if your older Vercel project still shows
   "KV (Powered by Upstash)" in the Storage tab, that path also works —
   it produces the older `KV_REST_API_URL` / `KV_REST_API_TOKEN` vars,
   and the code accepts those too.

2. **Add Blob** — still a first-class Storage option:
   - **Create Database** → **Blob** → name `weave-blob` → **Create**.
   - Connect to this project + all three environments.
   - Auto-adds `BLOB_READ_WRITE_TOKEN`.

After both stores are connected, hit **Redeploy** so the running serverless
functions pick up the new env vars (env-var changes don't trigger an auto
redeploy on their own).

Verify env injection: **Project → Settings → Environment Variables**.
You should see one of these pairs for Redis:

| Variant | Vars present | Source |
| --- | --- | --- |
| New Marketplace path | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Upstash Marketplace integration |
| Legacy KV path | `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_URL` | Vercel KV (legacy) |

Plus `BLOB_READ_WRITE_TOKEN` from the Blob store.

---

## 5. Deploy

Click **Deploy** on the Vercel dashboard. The build runs `pnpm --filter @weave/web build`; it produces `apps/web/dist/`; Vercel hosts that as a static SPA + auto-discovers `apps/web/api/*.ts` as serverless functions.

After ~2 minutes you get a URL like `https://weave-app-XXX.vercel.app`. Open it — the workspace landing page appears. Create a design, upload an image, refresh the browser → the design + the resource are still there because they were synced to KV / Blob on save.

---

## 6. Verify

Sanity checks:

```bash
# 1. The SPA loads
curl -fsSL https://YOUR-PROJECT.vercel.app/ | grep -c "내 디자인"

# 2. The /api routes return JSON (and set the device-ID cookie)
curl -fsSL -i https://YOUR-PROJECT.vercel.app/api/designs | head -20
# expected: HTTP/2 200, Set-Cookie: weave_did=..., body: {"designs":[]}

# 3. Upload an image via the UI; check the Blob dashboard
# https://vercel.com/<team>/<project>/stores/blob/<id>/browser
```

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Build fails on `@agocraft/core` not found | agocraft not on npm yet | go back to step 1, pick Option A/B/C |
| Build OK but `/api/designs` returns 500 | KV/Redis not linked | Storage tab → Marketplace → Upstash → Redis, connect to project for *all* envs, then **Redeploy** |
| Storage tab only shows Blob, no KV | Vercel removed direct KV; use Marketplace → Upstash → Redis instead | See §4 above — both naming conventions are supported by the code |
| Image upload succeeds but reload loses it | Blob token missing in prod (running in dev mode) | Storage tab → confirm `BLOB_READ_WRITE_TOKEN` is set in Production |
| Designs not appearing across devices | This is by design — `weave_did` cookie is per-browser. **The MVP is anonymous, device-scoped, NOT multi-user.** | (Follow-up: real auth — Clerk / NextAuth — see §"Security model" below) |
| `Type 'StoredDesign' is not assignable...` at build | strict TS pulled a type from `@vercel/node` that doesn't match latest | bump to `@vercel/node@^5.0.0` |

---

## What's running in production

```
GET   /                   → static SPA (Vite build) — workspace listing
GET   /design/:id         → same SPA, client-side routed
GET   /api/designs        → list designs for this device-ID
POST  /api/designs        → upsert a design
GET   /api/designs/:id    → fetch a single design
DELETE /api/designs/:id   → remove
GET   /api/resources      → list uploaded resources
POST  /api/resources      → upload (dataUrl → Blob)
DELETE /api/resources/:id → remove
```

Data layout (KV keys):

```
did:<deviceId>:designs                 → ["d-abc", "d-def", ...]   (newest first)
did:<deviceId>:design:<id>             → full Design JSON
did:<deviceId>:resources               → ["img-abc", ...]
did:<deviceId>:resource:<id>           → MediaResource JSON
```

Blob layout:

```
<deviceId>/<resourceId>-<filename>     → public https URL
```

---

## Security model — explicit limitations

**weave is anonymous device-scoped, NOT multi-user.** The implications of
this MUST be understood before exposing a deployment to anyone outside the
operator's own machines:

- A `weave_did` cookie is the only identity. Anyone who can present this
  cookie sees every design + resource in that scope. There is no auth,
  no row-level permission, no audit log.
- Cookie theft = full takeover. Cookies are not signed; an attacker who
  replays a captured `weave_did` value reads and overwrites the victim's
  data at will.
- Two users on the same shared browser (kiosk, library, family iPad) share
  the same workspace.
- There is no quota or rate-limit. A malicious POST loop can fill the
  Vercel KV free-tier in minutes.
- API routes enforce payload size (800 KB design, 10 MB resource) but
  not total per-device storage. Vercel KV per-key cap is 1 MB; the
  per-tenant total cap is whatever the Upstash plan allows.

Treat the deployment as a **personal-use scratch space**, not a product
others can sign up for. Before sharing the URL publicly:

1. Add real auth (Clerk, NextAuth, or HMAC-signed cookies with a server
   secret).
2. Namespace KV keys under `user:<uid>:` instead of `did:<did>:`.
3. Add rate-limit middleware (Vercel Edge Middleware + Upstash ratelimit
   is the canonical Vercel stack).
4. Add a quota cap per user and a daily orphan-blob GC sweep.
5. Replace the `__weave*` dev-only globals with proper React Context
   already in progress; ensure `apps/web/src/document/interactions/*`
   doesn't read from `window` in production bundles.

## Future hardening

- **Real auth** — replace device-ID with Clerk / NextAuth. Migrate existing KV entries by namespacing under `user:<uid>:`.
- **Conflict resolution** — last-write-wins works for a single user across two tabs; for multi-user collaboration the agocraft `ChangeStream` patches would need cloud broadcast (Pusher / Vercel Edge Functions + KV pubsub).
- **Quota / GC** — Vercel KV free tier is 30k commands/day, 256 MB storage. Blob free tier is 1 GB. Add a soft per-user cap + a daily orphan-blob sweeper.
- **Multi-tenant** — the device-ID model collapses to a single tenant. For per-org workspaces, prefix keys with `org:<orgId>:`.
