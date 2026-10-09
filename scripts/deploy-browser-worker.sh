#!/usr/bin/env bash
# Deploys the cloud browser (apps/browser-worker) to Fly.io — the piece that lets Apply with Wonder fill
# forms on a phone, where the Chrome extension can't run. Run from anywhere in the repository:
#
#   scripts/deploy-browser-worker.sh            first deploy, and every later one
#   ROTATE=1 scripts/deploy-browser-worker.sh   make a new shared secret (then update it in Vercel too)
#   FLY_APP=my-name FLY_ORG=my-org scripts/deploy-browser-worker.sh   another app name / organisation
#
# Needs flyctl, signed in (`fly auth login`). It creates the app if it doesn't exist, makes the shared
# secret the first time (never printed: it's written to a private file for you to paste into Vercel),
# deploys one machine, and checks /health. The secret is never committed or logged.
set -euo pipefail

root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$root"
config="apps/browser-worker/fly.toml"
app="${FLY_APP:-$(sed -n 's/^app *= *"\(.*\)"/\1/p' "$config")}"
fly="$(command -v fly || command -v flyctl || true)"
[ -n "$fly" ] || { echo "flyctl isn't installed: https://fly.io/docs/flyctl/install/" >&2; exit 1; }
"$fly" auth whoami >/dev/null 2>&1 || { echo "Sign in first: fly auth login" >&2; exit 1; }

if ! "$fly" status --app "$app" >/dev/null 2>&1; then
  echo "Creating Fly app $app…"
  "$fly" apps create "$app" ${FLY_ORG:+--org "$FLY_ORG"} || { echo "Couldn't create $app (the name may be taken): run again with FLY_APP=<another name>." >&2; exit 1; }
fi

secret_file=""
if [ "${ROTATE:-0}" = 1 ] || ! "$fly" secrets list --app "$app" --json 2>/dev/null | grep -q '"CLOUD_BROWSER_SECRET"'; then
  command -v openssl >/dev/null || { echo "openssl is needed to make the shared secret." >&2; exit 1; }
  secret="$(openssl rand -base64 48 | tr -d '\n')"
  printf 'CLOUD_BROWSER_SECRET=%s\n' "$secret" | "$fly" secrets import --app "$app" --stage >/dev/null
  secret_file="$HOME/.wonderjobs-cloud-browser-secret"
  (umask 077 && printf '%s\n' "$secret" > "$secret_file")
  unset secret
  echo "Shared secret set on Fly (staged for this deploy)."
fi

echo "Deploying $app (one machine, built on Fly's remote builder)…"
"$fly" deploy . --config "$config" --app "$app" --ha=false --remote-only

url="https://$app.fly.dev"
echo "Checking $url/health…"
for _ in $(seq 1 12); do
  if body="$(curl -fsS --max-time 10 "$url/health" 2>/dev/null)"; then echo "Healthy: $body"; break; fi
  sleep 5
done
[ -n "${body:-}" ] || echo "No answer from $url/health yet — see: fly logs --app $app" >&2

cat <<EOF

Last step, in Vercel (project wonderjobs → Settings → Environment Variables → Production):
  CLOUD_BROWSER_URL     $url
  CLOUD_BROWSER_SECRET  ${secret_file:+the value in $secret_file (paste it, mark it Sensitive, then delete the file)}${secret_file:-unchanged — it's already the one Fly has}
then redeploy production so the app picks them up. Until both are set, the apply page says the cloud
browser needs setup and offers Guide me.
EOF
