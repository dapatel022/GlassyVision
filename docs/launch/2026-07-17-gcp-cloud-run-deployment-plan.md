# GlassyVision — GCP Cloud Run Deployment Plan (alternative to Vercel)

> **Status:** Draft plan (2026-07-17). Written for the **recommended** target —
> **Google Cloud Run + keep Supabase**. An Azure Container Apps mapping is in the
> appendix. This does **not** replace `2026-06-06-go-live-runbook.md`; it swaps
> only the *hosting + cron* layer of it. Steps 1–4 (Supabase, Shopify, Resend,
> Sentry, secrets) and Step 7 (subscription product) of that runbook are
> **unchanged** — do them exactly as written.
>
> **Owner key:** **[You]** = founder action · **[Claude]** = I do it in code/config · **[Joint]** = you provide a secret, I wire it.
>
> **Cost note:** dollar figures are order-of-magnitude for phase-1 (low) traffic.
> Verify against current GCP pricing before relying on them — cloud free-tier
> numbers drift.

---

## 0. What changes vs. the Vercel runbook

| Layer | Vercel path (runbook) | This plan (GCP) |
|---|---|---|
| Next.js host | Vercel project | **Cloud Run** service (container) |
| Cron ×4 | `vercel.json` `crons` | **Cloud Scheduler** → HTTPS GET to `/api/cron/*` |
| Secrets/env | Vercel env vars | **Secret Manager** → mounted into Cloud Run |
| Build/deploy | Vercel git integration | **GitHub Actions** → build → push → `gcloud run deploy` |
| Image registry | — | **Artifact Registry** |
| DB / Auth / Storage | Supabase | **Supabase — unchanged** |
| Email / Errors | Resend / Sentry | **unchanged** |

**Everything Supabase/Resend/Sentry stays identical.** The app's compliance
surface (customer RLS, magic-link auth, private `rx-files` bucket + 3-yr
retention) lives in Supabase and does not move.

---

## 1. Code changes (small, one-time)  **[Claude]**

### 1.1 Enable the standalone server output
Cloud Run runs a container, so Next must emit the self-contained server. Add to
`next.config.ts`:

```ts
const nextConfig: NextConfig = {
  output: "standalone",          // <-- add this
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.shopify.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};
```

### 1.2 Dockerfile (multi-stage, Node 22 LTS)
`sharp` is bundled so `next/image` optimization works on the server (Vercel did
this for us before).

```dockerfile
# ---- deps ----
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----
FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Sentry source-map upload is a no-op unless SENTRY_* are set (see next.config)
RUN npm run build

# ---- run ----
FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
# Cloud Run injects PORT (default 8080); Next standalone reads process.env.PORT
ENV PORT=8080
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 8080
CMD ["node", "server.js"]
```

### 1.3 `.dockerignore`
```
node_modules
.next
.git
.env*
npm-debug.log
docs
supabase/.branches
```

### 1.4 Keep `vercel.json`?
Harmless to leave (ignored off-Vercel), but the crons there are **not** what runs
on GCP — Cloud Scheduler (Step 5) is the source of truth. Add a comment or delete
to avoid confusion.

---

## 2. GCP project + Artifact Registry  **[You/Joint]**
1. **[You]** Create a GCP project (e.g. `glassyvision-prod`); enable billing.
2. **[You]** Enable APIs: Cloud Run, Artifact Registry, Cloud Scheduler, Secret Manager, Cloud Build (if used).
3. **[Joint]** Create an Artifact Registry Docker repo in your chosen region:
   ```bash
   gcloud artifacts repositories create glassyvision \
     --repository-format=docker --location=us-east1
   ```
   **Region:** pick the one **closest to your Supabase region** (US/CA customers →
   Supabase `us-east-1` → Cloud Run `us-east1`) to keep latency + Supabase egress low.

---

## 3. Secrets in Secret Manager  **[You/Joint]**
Store every env var from **runbook Step 5** (the ~16-var table) as a Secret
Manager secret — same values, same names. Cloud Run mounts them as env vars.

Public (`NEXT_PUBLIC_*`) values are baked at **build** time, so they must also be
available to the build (GitHub Actions env / build args), not just at runtime.
Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, `SHOPIFY_ADMIN_ACCESS_TOKEN`,
`SHOPIFY_WEBHOOK_SECRET`, `RX_TOKEN_SECRET`, `CLAIM_TOKEN_SECRET`, `CRON_SECRET`,
`RESEND_API_KEY`) are runtime-only → mount into Cloud Run.

Grant the Cloud Run runtime service account `roles/secretmanager.secretAccessor`.

---

## 4. Deploy to Cloud Run  **[Joint]**
```bash
# build + push
gcloud builds submit --tag us-east1-docker.pkg.dev/PROJECT/glassyvision/app:latest

# deploy
gcloud run deploy glassyvision \
  --image us-east1-docker.pkg.dev/PROJECT/glassyvision/app:latest \
  --region us-east1 \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 --memory 512Mi \
  --min-instances 0 \        # 0 = cheapest (cold starts); 1 ≈ $5–10/mo, no cold starts
  --max-instances 3 \
  --set-secrets "SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,SHOPIFY_ADMIN_ACCESS_TOKEN=...,CRON_SECRET=CRON_SECRET:latest, ...(all runtime secrets)"
```
- `--allow-unauthenticated`: the storefront + webhooks + cron endpoints are
  public URLs (webhooks self-verify via HMAC; crons self-verify via `CRON_SECRET`).
- Consider **min-instances=1** once the admin/lab team is using it daily — a
  1–3s cold start is annoying mid-review. Costs a few $/mo.

---

## 5. The 4 crons → Cloud Scheduler  **[Joint]**
Each cron route is a **GET** that checks `Authorization: Bearer $CRON_SECRET`
(fail-closed). Recreate the exact `vercel.json` schedules as Scheduler jobs that
send that header. Times are UTC.

```bash
BASE="https://<cloud-run-url>"      # or https://glassyvision.com once mapped
SECRET="<CRON_SECRET>"

gcloud scheduler jobs create http reconcile \
  --location us-east1 --schedule "0 5 * * *" \
  --uri "$BASE/api/cron/reconcile" --http-method GET \
  --headers "Authorization=Bearer $SECRET"

gcloud scheduler jobs create http rx-reminder \
  --location us-east1 --schedule "0 9 * * *" \
  --uri "$BASE/api/cron/rx-reminder" --http-method GET \
  --headers "Authorization=Bearer $SECRET"

gcloud scheduler jobs create http sweep-redemptions \
  --location us-east1 --schedule "*/15 * * * *" \
  --uri "$BASE/api/cron/sweep-redemptions" --http-method GET \
  --headers "Authorization=Bearer $SECRET"

gcloud scheduler jobs create http membership-expiry \
  --location us-east1 --schedule "0 6 * * *" \
  --uri "$BASE/api/cron/membership-expiry" --http-method GET \
  --headers "Authorization=Bearer $SECRET"
```
> **Better:** put `CRON_SECRET` in the header via a Secret Manager reference, or
> use OIDC + an authenticated Cloud Run invoker instead of a static bearer, so the
> secret isn't stored in the job definition. Static bearer matches the current
> code with zero changes; OIDC is the hardening upgrade.

First 3 Scheduler jobs are free tier; the 4th is ~$0.10/mo. Negligible.

---

## 6. CI/CD — GitHub Actions  **[Claude]**
Repo is already on GitHub (`dapatel022/GlassyVision`). Workflow on push to `main`:
1. Auth to GCP via **Workload Identity Federation** (no long-lived key) or a
   service-account JSON in repo secrets.
2. `docker build` (passing `NEXT_PUBLIC_*` as build args) → push to Artifact Registry.
3. `gcloud run deploy ... --image <new tag>`.

(Firebase App Hosting alternative — see §8 — replaces this whole step with a
git-connected auto-deploy, no workflow to maintain.)

---

## 7. Domain, TLS, webhooks  **[You/Joint]**
1. Map `glassyvision.com` to the Cloud Run service (Cloud Run domain mapping, or
   put **Cloud CDN + HTTPS Load Balancer** in front for edge caching + WAF later).
   Managed TLS is automatic.
2. Set `NEXT_PUBLIC_BASE_URL` to the final URL and redeploy.
3. Point the **10 Shopify webhooks** (runbook Step 2.5) at
   `https://glassyvision.com/api/shopify/webhooks`.
4. Update the Supabase Auth **redirect allow-list** to the new domain (magic-link
   callbacks) — easy to miss.

---

## 8. Simpler alternative: Firebase App Hosting  **[optional]**
If you'd rather not own a Dockerfile + GitHub Actions: **Firebase App Hosting** is
GCP's Vercel-like Next.js host (git-connected, auto-build, CDN included; runs on
Cloud Run underneath). You still keep Supabase and still wire the 4 crons via
Cloud Scheduler. Trade-off: less control over the container, but the closest DX to
what you have on Vercel today. Good default if solo-dev simplicity > control.

---

## 9. End-to-end test (the "ready" milestone)
Run **runbook Step 8 verbatim** against the Cloud Run URL — nothing about the test
changes, only the host. Confirm additionally:
- All 4 **Cloud Scheduler** jobs fire and return 200 (check Scheduler logs + Cloud Run logs).
- `next/image` serves optimized images (sharp present in container).
- Cold-start latency acceptable, or set `min-instances=1`.

---

## 10. Cost sketch (phase-1, low traffic — verify current pricing)
| Item | Est. / month |
|---|---|
| Cloud Run (`min-instances=0`) | **~$0–10** (within/near always-free) |
| Cloud Run (`min-instances=1`, no cold start) | ~$5–15 |
| Cloud Scheduler (4 jobs) | ~$0 (3 free + $0.10) |
| Artifact Registry storage | ~$0–1 |
| Secret Manager | ~$0 |
| Supabase | free tier (unchanged) |
| Resend / Sentry | free tier (unchanged) |
| **Total** | **well under the $100/mo phase-1 target** |

Basically a wash vs. Vercel Hobby (free). The reason to be here is a *driver*
(credits / one-cloud / residency), not raw cost.

---

## Appendix A — Azure Container Apps mapping
Same Dockerfile + `output: 'standalone'`. Swap services:
- **Host:** Azure Container Apps (scale-to-zero) — deploy image from **Azure Container Registry (ACR)**.
- **Cron ×4:** **Container Apps Jobs** with `cronExpression` (same 5 UTC schedules), each `curl`-ing `/api/cron/*` with the bearer header; *or* Azure Functions Timer / Logic Apps.
- **Secrets:** **Key Vault** or Container Apps secrets.
- **CI/CD:** GitHub Actions → `az containerapp up` / `az acr build`.
- **Domain/TLS/CDN:** custom domain + managed cert; **Front Door** for edge.
- Avoid **App Service B1** (~$13/mo always-on) unless you want a non-scaling PaaS.
- Skip **Static Web Apps** — its Next.js SSR / server-action support is limited.

Cost profile ≈ GCP (~$0–10/mo at low traffic).

## Appendix B — What I deliberately did NOT migrate
- **Supabase → Cloud SQL / Identity Platform / GCS:** rejected for phase 1. It's a
  large rewrite of working, compliance-audited auth + RLS + private-storage code,
  for higher run cost and more ops. Revisit only at scale, as its own spec.
```
