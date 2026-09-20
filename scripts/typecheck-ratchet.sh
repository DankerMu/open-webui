#!/usr/bin/env bash
# scripts/typecheck-ratchet.sh — svelte-check with a repo-wide error ceiling.
# Upstream Open WebUI does not pass `svelte-check` (thousands of pre-existing
# errors; upstream CI never runs it), so a plain pass/fail gate would be red
# forever. Baseline freeze (Q1.4b): the total error count may only go DOWN.
# Ceiling: constraints.yaml baseline.counts.typecheck_errors. Lower it in the
# same PR whenever the count drops. Remove this ratchet when it reaches 0.
set -u
cd "$(git rev-parse --show-toplevel)" || exit 2
ceiling="$(sed -n '/^baseline:/,/^rehabilitation:/p' constraints.yaml | sed -n 's/^ *typecheck_errors: *\([0-9]*\).*/\1/p' | head -n 1)"
[ -n "$ceiling" ] || { echo "typecheck-ratchet: baseline.counts.typecheck_errors missing from constraints.yaml" >&2; exit 2; }
out="$(npx --no-install svelte-kit sync >/dev/null 2>&1; npx --no-install svelte-check --tsconfig ./tsconfig.json --output machine 2>&1)"
summary="$(printf '%s\n' "$out" | grep -E ' COMPLETED ' | tail -n 1)"
current="$(printf '%s' "$summary" | sed -n 's/.* FILES \([0-9]*\) ERRORS .*/\1/p')"
if [ -z "$current" ]; then
  echo "typecheck-ratchet: could not parse svelte-check summary:" >&2
  printf '%s\n' "$out" | tail -n 5 >&2
  exit 2
fi
echo "typecheck-ratchet: $current errors (ceiling $ceiling)"
if [ "$current" -gt "$ceiling" ]; then
  echo "typecheck-ratchet: svelte-check errors rose above the frozen baseline ($current > $ceiling). New errors:" >&2
  printf '%s\n' "$out" | grep -E ' ERROR ' | grep -F -f <(bash scripts/change-scope.sh --ext "ts svelte" | sed 's/^/"/;s/$/"/') | head -n 40 >&2
  echo "Fix them; never raise the ceiling (that is a profile downgrade)." >&2
  exit 1
fi
if [ "$current" -lt "$ceiling" ]; then
  echo "typecheck-ratchet: count dropped — lower baseline.counts.typecheck_errors to $current in constraints.yaml in this PR."
fi
