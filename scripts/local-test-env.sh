# Environment for running the full test suite locally against `npm run db:start`.
# Usage: source scripts/local-test-env.sh
# The Turnstile values are Cloudflare's public always-pass test keys.
eval "$(npx supabase status -o env \
  --override-name api.url=NEXT_PUBLIC_SUPABASE_URL \
  --override-name auth.publishable_key=NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
  --override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY 2>/dev/null)"
export NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY
export NEXT_PUBLIC_TURNSTILE_SITE_KEY="1x00000000000000000000AA"
export TURNSTILE_SECRET_KEY="1x0000000000000000000000000000000AA"
