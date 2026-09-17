#!/usr/bin/env bash
# Vercel "Ignored Build Step" hook.
#   exit 1 → proceed with the build
#   exit 0 → skip the build
# Builds every branch, but skips when the commit only touched docs or markdown.
set -u

# First deploy / no previous commit → build.
if [ -z "${VERCEL_GIT_PREVIOUS_SHA:-}" ] || [ -z "${VERCEL_GIT_COMMIT_SHA:-}" ]; then
  echo "No previous deployment SHA — building."
  exit 1
fi

if ! git cat-file -e "${VERCEL_GIT_PREVIOUS_SHA}^{commit}" 2>/dev/null; then
  echo "Previous SHA not available in shallow clone — building."
  exit 1
fi

changed="$(git diff --name-only "${VERCEL_GIT_PREVIOUS_SHA}" "${VERCEL_GIT_COMMIT_SHA}" 2>/dev/null || true)"
if [ -z "$changed" ]; then
  echo "No changes detected — building to be safe."
  exit 1
fi

if echo "$changed" | grep -qvE '^(docs/|.*\.md$|LICENSE$)'; then
  echo "Source changes detected — building."
  exit 1
fi

echo "Only docs/markdown changed — skipping build."
exit 0
