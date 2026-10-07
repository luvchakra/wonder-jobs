#!/usr/bin/env bash
# Decides which CI jobs a run needs, from what the change touched. Writes `code`, `e2e` and `reason`
# to $GITHUB_OUTPUT (or stdout when run by hand).
#
#   code  lint, typecheck, unit tests, build, dependency audit
#   e2e   the Playwright suite (off the merge gate: nightly, on dispatch, on PRs labelled `e2e`)
#
# Rules, in order:
#   schedule / workflow_dispatch / unknown event  → everything
#   the diff can't be computed (zero or missing base, base not in history, git error) → everything
#   a CI file changed (.github/workflows, .github/scripts) → everything, e2e included
#   only docs/Markdown changed                    → nothing (except e2e when the PR asks for it)
#   anything else                                 → code; e2e only with the `e2e` label
#
# Inputs (environment): EVENT_NAME, and for pull_request BASE_SHA + HEAD_SHA + PR_LABELS (newline or
# comma separated), for push BEFORE_SHA + HEAD_SHA.
set -u

out="${GITHUB_OUTPUT:-/dev/stdout}"
emit() { # code e2e reason
  { echo "code=$1"; echo "e2e=$2"; echo "reason=$3"; } >> "$out"
  echo "code=$1 e2e=$2 — $3" >&2
  exit 0
}

zero='0000000000000000000000000000000000000000'
event="${EVENT_NAME:-}"
head="${HEAD_SHA:-}"
labelled=false
if printf '%s\n' "${PR_LABELS:-}" | tr ',' '\n' | sed 's/^ *//; s/ *$//' | grep -qx 'e2e'; then labelled=true; fi

case "$event" in
  schedule) emit true true "scheduled run: everything" ;;
  workflow_dispatch) emit true true "manual run: everything" ;;
  pull_request)
    base="${BASE_SHA:-}"
    if [ -z "$base" ] || [ "$base" = "$zero" ] || [ -z "$head" ]; then emit true true "pull request without a base: everything"; fi
    if ! git cat-file -e "$base^{commit}" 2>/dev/null || ! git cat-file -e "$head^{commit}" 2>/dev/null; then emit true true "base or head not in history: everything"; fi
    # What the PR changes relative to where it branched off, not what main gained since.
    if ! files="$(git diff --no-renames --name-only "$base...$head" 2>/dev/null)"; then emit true true "diff failed: everything"; fi
    ;;
  push)
    before="${BEFORE_SHA:-}"
    if [ -z "$before" ] || [ "$before" = "$zero" ] || [ -z "$head" ]; then emit true true "push without a previous commit: everything"; fi
    if ! git cat-file -e "$before^{commit}" 2>/dev/null || ! git cat-file -e "$head^{commit}" 2>/dev/null; then emit true true "previous commit not in history: everything"; fi
    if ! files="$(git diff --no-renames --name-only "$before..$head" 2>/dev/null)"; then emit true true "diff failed: everything"; fi
    ;;
  *) emit true true "event '${event:-none}': everything" ;;
esac

if [ -z "$files" ]; then emit true "$labelled" "no file changes: everything on the gate"; fi
if printf '%s\n' "$files" | grep -qE '^\.github/(workflows|scripts)/'; then emit true true "CI files changed: everything"; fi
if ! printf '%s\n' "$files" | grep -qvE '^(docs/|apps/[^/]+/docs/)|\.md$|^LICENSE$'; then
  emit false "$labelled" "docs/Markdown only"
fi
emit true "$labelled" "code changed"
