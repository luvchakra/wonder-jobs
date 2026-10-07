#!/usr/bin/env bash
# Vercel "Ignored Build Step" hook.
#   exit 1 → proceed with the build
#   exit 0 → skip the build
#
# Vercel builds one deployment at a time for this project, so every build it skips is a production
# deploy that doesn't wait in the queue behind it. Rules, in order:
#   1. Previews of Dependabot branches: skipped. CI checks those PRs; nobody opens their previews, and
#      Dependabot rebases every open PR after each merge, which used to queue several builds right
#      behind production. (Also disabled in vercel.json `git.deploymentEnabled`; this is the backstop.)
#   2. Previews of a squash-merge commit ("… (#123)"): skipped. Production builds that exact commit.
#   3. Only docs/Markdown changed since the last deployment: skipped (production included).
# Production is never skipped by 1 or 2.
set -u

env="${VERCEL_ENV:-}"
ref="${VERCEL_GIT_COMMIT_REF:-}"
subject="$(printf '%s\n' "${VERCEL_GIT_COMMIT_MESSAGE:-}" | head -n 1)"

if [ "$env" = "preview" ]; then
  case "$ref" in
    dependabot/*)
      echo "Dependabot branch preview ($ref) — skipping; CI covers it."
      exit 0 ;;
  esac
  if printf '%s' "$subject" | grep -qE '\(#[0-9]+\)[[:space:]]*$'; then
    echo "Squash-merge commit on a preview branch — skipping; production builds it."
    exit 0
  fi
fi

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

if echo "$changed" | grep -qvE '^(docs/|apps/[^/]+/docs/|.*\.md$|LICENSE$)'; then
  echo "Source changes detected — building."
  exit 1
fi

echo "Only docs/markdown changed — skipping build."
exit 0
