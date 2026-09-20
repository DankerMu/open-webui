#!/usr/bin/env bash
# scripts/anti-drift.sh — duplicate code (jscpd), dead code (vulture / knip) on
# the fork's change scope. BLIND SPOT (declared in AGENTS.md): jscpd only
# compares scoped files with each other, so duplication between new code and
# untouched upstream code is not detected — review owns that.
set -u
repo_root="$(git rev-parse --show-toplevel)" || exit 2
cd "$repo_root" || exit 2
threshold="$(sed -n '/^anti_drift:/,/^module_boundaries:/p' constraints.yaml | sed -n 's/^ *value: *\([0-9]*\).*/\1/p' | head -n 1)"
fail=0
py_files="$(bash scripts/change-scope.sh --ext py)"
web_files="$(bash scripts/change-scope.sh --ext "ts js svelte")"
all_files="$(printf '%s\n%s\n' "$py_files" "$web_files" | sed '/^$/d')"

if [ -z "$all_files" ]; then echo "anti-drift: no scoped source files, nothing to check."; exit 0; fi

echo "--- duplicate code (jscpd, threshold ${threshold}%)"
# shellcheck disable=SC2086
if ! npx --no-install jscpd --silent --threshold "$threshold" --min-tokens 50 --reporters console $all_files; then
  echo "anti-drift: jscpd found duplication above ${threshold}% in scoped files — unify, do not copy." >&2; fail=1
fi

if [ -n "$py_files" ]; then
  echo "--- dead code (vulture, min-confidence 80)"
  # shellcheck disable=SC2086
  if ! uv run --quiet vulture $py_files --min-confidence 80; then
    echo "anti-drift: vulture reports unused code in scoped Python files — wire it up or delete it." >&2; fail=1
  fi
fi

if [ -n "$web_files" ]; then
  echo "--- dead exports (knip, scoped)"
  knip_out="$(npx --no-install knip --reporter json --no-progress 2>/dev/null || true)"
  hits="$(printf '%s' "$knip_out" | python3 -c '
import json,sys
scope=set(l.strip() for l in open(sys.argv[1]) if l.strip())
try: data=json.load(sys.stdin)
except Exception: sys.exit(0)
for item in data.get("issues", []):
    f=item.get("file","")
    if f in scope:
        for k in ("exports","types","unresolved","duplicates"):
            for e in item.get(k) or []:
                name=e.get("name") if isinstance(e,dict) else e
                print(f"  {f}  unused {k[:-1]}: {name}")
' /dev/stdin <<<"$web_files")" 2>/dev/null || hits=""
  if [ -n "$hits" ]; then
    echo "anti-drift: knip reports dead exports in scoped files:" >&2
    printf '%s\n' "$hits" >&2; fail=1
  fi
fi

[ "$fail" -eq 0 ] && echo "anti-drift: scoped duplicate/dead-code checks passed."
exit "$fail"
