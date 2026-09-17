#!/usr/bin/env bash
# Vercel "Ignored Build Step" hook for the web app (Root Directory: apps/web).
# Delegates to the repo-root script so the logic lives in one place.
set -u
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
if [ -f "$root/scripts/vercel-should-build.sh" ]; then
  exec bash "$root/scripts/vercel-should-build.sh"
fi
echo "Root script not found — building."
exit 1
