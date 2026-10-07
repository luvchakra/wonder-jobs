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
#   3. Only docs/Markdown changed since the last deployment: skipped (production included). A preview
#      whose last deployment is gone from history (branch reset after a merge) compares with main.
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

prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
head="${VERCEL_GIT_COMMIT_SHA:-}"
if [ -z "$head" ]; then
  echo "No commit SHA — building."
  exit 1
fi
if [ -z "$prev" ] || ! git cat-file -e "$prev^{commit}" 2>/dev/null; then
  # Working branches are reset to main after each squash merge, so a preview's previous deployment is
  # usually gone from history. For previews only, diff from the newest squash-merge commit ("… (#123)")
  # below this one: that is main, and the diff is exactly what the branch adds. Production builds.
  base=""
  if [ "$env" = "preview" ]; then
    base="$(git log --format='%H %s' "$head~1" 2>/dev/null | grep -E '\(#[0-9]+\)[[:space:]]*$' | head -n 1 | cut -d' ' -f1)"
  fi
  if [ -z "$base" ]; then
    echo "Previous deployment's commit not in this clone — building."
    exit 1
  fi
  echo "Previous deployment's commit not in this clone — comparing with main at ${base:0:7}."
  prev="$base"
fi

changed="$(git diff --no-renames --name-only "$prev" "$head" 2>/dev/null || true)"
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
