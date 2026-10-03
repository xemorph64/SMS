# Deploying MailSentinel

MailSentinel is three things in one repository — a React dashboard, a Spring
Boot API, and a Python analysis engine the API runs as a subprocess. A static
host such as Vercel can serve the first and nothing else: serverless functions
cannot run a JVM service that spawns Python processes, and they have no
filesystem for captures. The production shape is therefore:

```text
        browser
           │
           ▼
   Vercel ──────────────  frontend/  (static React build)
           │  fetch /api/*  (Bearer JWT, CORS)
           ▼
   Render ──────────────  Dockerfile (Spring Boot API + Python engine + trained model)
           │
           ▼
   PostgreSQL (Neon)
```

All three pieces are free to start on and run without a paid cloud account:
Vercel's hobby tier, Render's free tier (with the cold-start caveat below),
and Neon's free PostgreSQL tier.

---

## 1. PostgreSQL (Neon)

Any managed PostgreSQL works; [Neon](https://neon.tech) has a free tier that
suits a demo. Create a project, then copy the **connection string** — the
`postgresql://user:pass@host/db?sslmode=require` form, **not** the JDBC one.
The service translates it; see
`MailSentinelApplication.acceptConnectionStringForm()`.

No schema work is needed. Flyway runs migrations `V1`–`V6` on first boot, and
`DataInitializer` seeds the five demo accounts the login page lists
(`analyst`, `ir`, `forensics`, `auditor`, `admin` — password `password`).

---

## 2. Backend on Render

1. Push this repo to GitHub (or use an existing repo you own).
2. On Render, create a **Web Service** from the repo and its
   [`Dockerfile`](Dockerfile) — Render detects it, builds the image, and
   redeploys on every push.
3. Environment variables (Settings > Environment, or a Render secret):
   - `SMS_DB_URL` — the Neon connection string from §1
   - `SMS_JWT_SECRET` — HS256 signing key (`openssl rand -base64 48`); when
     unset Render generates one on first deploy and reuses it, so logins
     survive rebuilds.
   - `SMS_CORS_ORIGINS` — comma-separated origins allowed to call `/api`.
     Default: `http://localhost:5173,http://127.0.0.1:5173` (dev only), so on
     Render it must be set to the dashboard's URL, e.g.
     `https://<project>.vercel.app` — wildcards in the host work
     (`https://*.vercel.app`), and changing it triggers a redeploy by itself.
4. Render's free tier **sleeps after ~15 minutes of inactivity**; the first
   request after waking costs ~30-60s (JVM + engine import). For a live demo
   you can bump to a starter plan for always-ready instances.

### Verifying

```bash
curl https://<service-url>/api/health
```

`status: UP` means the API is up **and the engine imported cleanly**;
`DEGRADED` means the API is up but the interpreter cannot run the engine, and
the body carries the reason (`error` and `hint` explain which).

### Why the API cannot live on Vercel

Serverless functions have no JVM, no Python subprocesses, and no writable
filesystem for uploads — this service needs all three. Render's containers
have all three, and the same Dockerfile is what renders the whole thing.

---

## 3. Dashboard on Vercel

1. **Import the repository** at [vercel.com/new](https://vercel.com/new).
2. **Set Root Directory to `frontend`.** Vercel detects Vite, runs
   `npm ci && npm run build` and serves `dist/`. The `frontend/vercel.json`
   handles SPA routing, so a deep link such as `/report/3` reaches the app
   instead of a 404.
3. **Set an environment variable** (Production, Preview and Development):

   ```text
   VITE_API_BASE_URL = https://<service-url>
   ```

   No trailing slash. This is a *build-time* variable — changing it requires a
   redeploy, not just a restart.
4. **Deploy.** Sign in with any demo channel; every request now goes to the
   Render service directly. Vercel only fronts the dashboard (it never
   proxies `/api`), so a 2 GB upload does not hit Vercel's 4.5 MB body limit.

### Custom domains

Add the domain in Vercel, then widen CORS on the Render service:

```bash
export SMS_CORS_ORIGINS=https://mail.example.gov.in,https://*.vercel.app
# set it on the Render service and redeploy
```

The default `https://*.vercel.app` covers every preview deployment of every
project, which is convenient for a demo and too broad for anything else.
Replace it with your exact domain once one exists.

---

## 4. Limits of this deployment shape

- **Cold starts.** After ~15 minutes idle, Render's free instances sleep. The
  next request pays JVM + Python engine startup (~30-60s). For a live demo,
  bump to a starter plan, or accept the wake-up penalty.
- **Uploads are ephemeral.** Analyses are persisted in PostgreSQL and remain
  readable across redeploys and scale-to-zero; the *original capture file*
  lives on the container filesystem and does not. Opening a past report works
  forever; **re-analysing an uploaded capture after the instance has recycled
  fails** because the file is gone. Bundled demo captures are in the image and
  unaffected. For durable uploads, mount a storage bucket or run the compose
  deployment with a volume.
- **Build minutes.** Render's free plan limits concurrent builds; the first
  build also trains the model, so budget a few hours of initial setup, not 15-
  30 minutes like the old Cloud Build path.

## Cost sketch

- Vercel hobby tier: free for non-commercial use.
- Render free tier: 750 hours/month of always-on compute ≈ 0.28 months of a
  single instance; the first build uses additional free-demo minutes.
- Neon free tier: 0.5 GB of data, autosuspends when idle.
- Demo-day cost: a few cents on the free ranks, or ~$5-15/month if you keep
  the Render instance always ready.

## Security notes

- **The demo accounts are public by design** — the login page advertises them,
  and `password` is the password. That is appropriate for a demo and not for
  anything holding real data. For real use: remove `DataInitializer`'s seeding,
  add real users with real password hashes, and restrict `SMS_CORS_ORIGINS` to
  your domain.
- `SMS_JWT_SECRET` is generated once and reused across deploys, so sessions
  survive redeploys. Re-run with `SMS_JWT_SECRET=<new value>` to rotate it.
- `/api/health` is intentionally unauthenticated so a platform health check
  can reach it. Everything else under `/api` requires a token.
- For an internal deployment, restrict `SMS_CORS_ORIGINS` to your domain and
  consider a paid tier with always-ready instances.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `/api/health` says `DEGRADED` | The interpreter cannot import the engine. The body's `error` and `hint` name it; in the container this should never happen because `scripts/setup.sh` verified it at build time. |
| Browser console: CORS error | The dashboard's origin is not in `SMS_CORS_ORIGINS`. Update it on Render — no rebuild needed. |
| Every call 401s right after a redeploy | The JWT secret changed, so old tokens are invalid. Sign in again. |
| Login says "Connection failed" | The service is cold-starting or unreachable. Retry once; if it persists, watch the Render logs for the service. |
| Boot fails: "Connection to ... refused" | Wrong `SMS_DB_URL`. Check that `sslmode=require` survived and that you used Neon's connection string, not its pooled JDBC variant. |
| Upload returns 413 | The capture exceeds Render's request limit. Use a smaller capture or the compose deployment. |
