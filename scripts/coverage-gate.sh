#!/usr/bin/env bash
# scripts/coverage-gate.sh — per-file coverage gate on files the fork ADDED
# (constraints.yaml testing.min_line_coverage, L3 = 80%). Files the fork
# MODIFIED in upstream are reported advisory-only: upstream ships 0 backend
# tests, so a per-file gate there would freeze every upstream touch (baseline
# freeze, Q1.4b). Remove the advisory carve-out when baseline.counts.coverage_gap
# reaches 0.
set -u
repo_root="$(git rev-parse --show-toplevel)" || exit 2
cd "$repo_root" || exit 2
min="$(sed -n '/^testing:/,/^dependencies:/p' constraints.yaml | sed -n 's/^ *value: *\([0-9]*\).*/\1/p' | head -n 1)"
fail=0

# Scope: application code only — backend/open_webui/** and src/** (harness scripts,
# configs, e2e specs and tests are not coverage subjects).
added_py="$(bash scripts/change-scope.sh --status --ext py | awk -F'\t' '$1=="A"{print $2}' | grep '^backend/open_webui/' | grep -v '/test_' | grep -v '/tests/' || true)"
mod_py="$(bash scripts/change-scope.sh --status --ext py | awk -F'\t' '$1=="M"{print $2}' | grep '^backend/open_webui/' || true)"
added_web="$(bash scripts/change-scope.sh --status --ext "ts js svelte" | awk -F'\t' '$1=="A"{print $2}' | grep '^src/' | grep -v '\.test\.' || true)"

if [ -n "$added_py$mod_py" ]; then
  echo "--- backend coverage (pytest --cov)"
  (cd backend && uv run --quiet pytest -q --cov=open_webui --cov-report= -p no:cacheprovider open_webui 2>&1 | tail -n 3) || true
  if [ -n "$added_py" ]; then
    inc="$(printf '%s\n' "$added_py" | sed 's#^backend/##' | paste -sd',' -)"
    if ! (cd backend && uv run --quiet coverage report --include="$inc" --fail-under="$min"); then
      echo "coverage-gate: fork-added Python files below ${min}% line coverage (add tests; never an assertion-free test)." >&2; fail=1
    fi
  fi
  if [ -n "$mod_py" ]; then
    inc="$(printf '%s\n' "$mod_py" | sed 's#^backend/##' | paste -sd',' -)"
    echo "advisory (modified upstream files, not gated):"
    (cd backend && uv run --quiet coverage report --include="$inc" 2>/dev/null) || true
  fi
fi

if [ -n "$added_web" ]; then
  echo "--- frontend coverage (vitest --coverage)"
  inc_args=""
  for f in $added_web; do inc_args="$inc_args --coverage.include=$f"; done
  # shellcheck disable=SC2086
  if ! npx --no-install vitest run --passWithNoTests --exclude "e2e/**" --coverage --coverage.reporter=text --coverage.thresholds.lines="$min" --coverage.thresholds.perFile $inc_args; then
    echo "coverage-gate: fork-added frontend files below ${min}% line coverage." >&2; fail=1
  fi
fi

[ -z "$added_py$mod_py$added_web" ] && echo "coverage-gate: no scoped source files, nothing to gate."
[ "$fail" -eq 0 ] && echo "coverage-gate: passed."
exit "$fail"
