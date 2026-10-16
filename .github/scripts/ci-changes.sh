#!/usr/bin/env bash
# Decides how much of CI a pull request or push needs, from what it touched. Writes `code`, `full`,
# `lint_files`, `web_files`, `worker` and `reason` to $GITHUB_OUTPUT (or stdout when run by hand).
#
#   code        lint, typecheck, unit tests, build, dependency audit run at all
#   full        the whole lint and every unit test (otherwise: lint the changed files, run the unit
#               tests related to them)
#   lint_files  changed apps/web files ESLint checks, relative to apps/web, space separated
#   web_files   changed apps/web source files for `vitest related`, relative to apps/web, space separated
#   worker      apps/browser-worker changed (its small suite then runs in full)
#
# E2E never runs here: it runs nightly (.github/workflows/e2e-nightly.yml).
#
# Rules, in order:
#   push to main / unknown event                   → everything, full
#   the diff can't be computed (zero or missing base, base not in history, git error) → everything, full
#   only docs/Markdown changed                     → nothing
#   package.json, the lockfile, tsconfig, the test, lint or build config, or CI files changed
#                                                  → code, full
#   files unit tests read from disk rather than import (extension/, apps/web/supabase/, apps/web/public/),
#   anything else outside apps/web and apps/browser-worker, or a deleted apps/web file
#                                                  → code, full (`vitest related` follows imports only)
#   anything else                                  → code, changed-files lint and related unit tests
#
# Inputs (environment): EVENT_NAME, and for pull_request BASE_SHA + HEAD_SHA.
set -u

out="${GITHUB_OUTPUT:-/dev/stdout}"
emit() { # code full reason [lint_files] [web_files] [worker]
  {
    echo "code=$1"
    echo "full=$2"
    echo "lint_files=${4:-}"
    echo "web_files=${5:-}"
    echo "worker=${6:-true}"
    echo "reason=$3"
  } >> "$out"
  echo "code=$1 full=$2 — $3" >&2
  exit 0
}

zero='0000000000000000000000000000000000000000'
event="${EVENT_NAME:-}"
head="${HEAD_SHA:-}"

case "$event" in
  pull_request)
    base="${BASE_SHA:-}"
    if [ -z "$base" ] || [ "$base" = "$zero" ] || [ -z "$head" ]; then emit true true "pull request without a base: everything"; fi
    if ! git cat-file -e "$base^{commit}" 2>/dev/null || ! git cat-file -e "$head^{commit}" 2>/dev/null; then emit true true "base or head not in history: everything"; fi
    # What the PR changes relative to where it branched off, not what main gained since.
    if ! files="$(git diff --no-renames --name-only "$base...$head" 2>/dev/null)"; then emit true true "diff failed: everything"; fi
    ;;
  push) emit true true "push to main: everything" ;;
  *) emit true true "event '${event:-none}': everything" ;;
esac

if [ -z "$files" ]; then emit true true "no file changes: everything"; fi
if ! printf '%s\n' "$files" | grep -qvE '^(docs/|apps/[^/]+/docs/)|\.md$|^LICENSE$'; then
  emit false false "docs/Markdown only" "" "" false
fi

# Anything that changes how every file is linted, type-checked, tested or built.
config='^(\.github/|package\.json$|package-lock\.json$|apps/[^/]+/package\.json$|tsconfig[^/]*\.json$|apps/[^/]+/tsconfig[^/]*\.json$|apps/[^/]+/(eslint|vitest|next|postcss|playwright)\.config\.[cm]?[jt]s$|apps/web/vercel\.json$)'
if printf '%s\n' "$files" | grep -qE "$config"; then emit true true "package, lockfile, tsconfig, test/lint/build config or CI files changed: everything"; fi

# Unit tests read these through the filesystem (extension.test.ts, migrations/index.test.ts, the résumé
# font tests), so `vitest related` can't see the link; and anything outside the two apps has no import
# graph to follow. Either way, run everything.
if printf '%s\n' "$files" | grep -qE '^apps/web/(supabase|public)/'; then emit true true "files tests read from disk changed: everything"; fi
if printf '%s\n' "$files" | grep -vE '^(docs/|apps/[^/]+/docs/)|\.md$|^LICENSE$' | grep -qvE '^apps/(web|browser-worker)/'; then
  emit true true "files outside apps/web and apps/browser-worker changed: everything"
fi

# Files under apps/web that still exist at the head (a deleted file has nothing to lint).
web=""
lint=""
while IFS= read -r f; do
  case "$f" in
    apps/web/*) ;;
    *) continue ;;
  esac
  # A deleted file breaks whatever imported it, and nothing imports it any more: run everything.
  # ls-tree reads trees only, which the checkout has (blob:none): no blob is fetched to answer.
  [ -n "$(git ls-tree --name-only "$head" -- "$f" 2>/dev/null)" ] || emit true true "a file under apps/web was deleted or renamed: everything"
  rel="${f#apps/web/}"
  case "$rel" in
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) lint="$lint $rel"; web="$web $rel" ;;
    *) web="$web $rel" ;;
  esac
done <<< "$files"

worker=false
if printf '%s\n' "$files" | grep -q '^apps/browser-worker/'; then worker=true; fi

emit true false "code changed: changed-files lint, related unit tests" "${lint# }" "${web# }" "$worker"
