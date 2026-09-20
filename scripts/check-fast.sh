#!/usr/bin/env bash
# scripts/check-fast.sh — iterate-loop check on files changed since HEAD only
# (format + lint). Full `make check` before a PR.
set -u
cd "$(git rev-parse --show-toplevel)" || exit 2
changed="$(git diff --name-only --diff-filter=ACMR HEAD; git ls-files --others --exclude-standard)"
py="$(printf '%s\n' "$changed" | grep -E '\.py$' | grep -v '^\.claude/\|^\.omp/' || true)"
web="$(printf '%s\n' "$changed" | grep -E '\.(ts|js|cjs|mjs|svelte)$' | grep -v '^\.claude/\|^\.omp/' || true)"
[ -z "$py$web" ] && { echo "check-fast: no changed source files"; exit 0; }
rc=0
# shellcheck disable=SC2086
if [ -n "$py" ]; then uv run --quiet ruff check $py && uv run --quiet ruff format --check $py || rc=1; fi
# shellcheck disable=SC2086
if [ -n "$web" ]; then npx --no-install eslint --max-warnings 0 $web && npx --no-install prettier --check $web || rc=1; fi
exit $rc
