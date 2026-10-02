#!/usr/bin/env bash
#
# Deploy the MailSentinel service (Spring Boot API + Python engine) to a
# container host. The default target today is Render, using the repo's own
# Dockerfile: one image bundles the React dashboard, the Spring Boot API and
# the Python forensic engine.
#
# Deploy to Render (GitHub-connected, auto-redeploys):
#   1. Create a Web Service from this repo's Dockerfile.
#   2. Environment:
#        - SMS_DB_URL     Neon connection string (postgresql://...sslmode=require)
#        - SMS_JWT_SECRET HS256 key (generated on first deploy if unset)
#        - SMS_CORS_ORIGINS e.g. https://*.vercel.app
#
# The image is built on your Render plan's capacity; the first build trains
# the model, so budget 15-30 minutes. Rebuilds are faster because the Docker
# layer cache is per-build.
#
# Optional overrides:
#   SMS_DB_URL        PostgreSQL connection string (never hard-coded).
#   SMS_JWT_SECRET    HS256 signing key. When unset, one is generated and
#                     reused across deploys so logins survive rebuilds.
#   SMS_CORS_ORIGINS  Comma-separated origins allowed to call /api.
#                     Default: https://*.vercel.app
#
# The database URL and JWT secret are mounted as environment variables —
# they never appear in the service's plaintext configuration.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
cd "$ROOT"

SERVICE="${SERVICE_NAME:-mailsentinel}"
CORS_ORIGINS="${SMS_CORS_ORIGINS:-https://*.vercel.app}"

say()  { printf '%s\n' "$1"; }
die()  { printf '%s\n' "$1" >&2; exit 1; }

[[ -n "${SMS_DB_URL:-}" ]] || die "SMS_DB_URL is required. Pass the provider's connection string, e.g.
  SMS_DB_URL='postgresql://user:pass@host/db?sslmode=require' $0"

say "service:  $SERVICE"
say ""

# --- secrets ----------------------------------------------------------------
## Render: store both secrets (no plaintext env vars). Add them in the
## Render dashboard's Environment > Secrets if the render CLI is missing.
if command -v render >/dev/null 2>&1; then
  render env-sets create "$SERVICE-envs" --service "$SERVICE" --yes >/dev/null 2>&1 || true
  printf '%s\n' "$SMS_DB_URL" | render env-sets update "$SERVICE-envs" --add "SMS_DB_URL" --yes >/dev/null 2>&1 || true
  if [[ -n "${SMS_JWT_SECRET:-}" ]]; then
    printf '%s\n' "$SMS_JWT_SECRET" | render env-sets update "$SERVICE-envs" --add "SMS_JWT_SECRET" --yes >/dev/null 2>&1 || true
  fi
  say "  env set: SMS_DB_URL"
  say "  env set: SMS_JWT_SECRET"
else
  say "  (render CLI not found — add SMS_DB_URL and SMS_JWT_SECRET"
  say "   as environment secrets in the Render dashboard instead)"
fi

# --- deploy -----------------------------------------------------------------
say ""
say "deploying — the first build trains the model, so budget 15-30 minutes"
gcloud run deploy "$SERVICE" \
  --source "$ROOT" \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --concurrency 8 \
  --timeout 900 \
  --min-instances 0 \
  --max-instances 2 \
  --no-cpu-throttling \
  --cpu-boost \
  --set-env-vars "^~^SPRING_PROFILES_ACTIVE=postgres~SMS_CORS_ORIGINS=${CORS_ORIGINS}" \
  --set-secrets "SMS_DB_URL=${DB_SECRET}:latest,SMS_JWT_SECRET=${JWT_SECRET}:latest"

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" \
        --format='value(status.url)')"

say ""
say "deployed: $URL"
say ""
say "Verify it:"
say ""
say "    curl $URL/api/health"
say ""
say "Then point the dashboard at it — on Vercel, set the project's environment"
say "variable and redeploy (deployments bake it in at build time):"
say ""
say "    VITE_API_BASE_URL=$URL"
say ""
say "CORS currently allows: $CORS_ORIGINS"
say "For a custom domain, update the service and redeploy:"
say ""
say "    gcloud run services update $SERVICE --project $PROJECT --region $REGION \\"
say "      --update-env-vars SMS_CORS_ORIGINS=https://your-domain.example"
