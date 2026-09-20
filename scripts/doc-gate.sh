#!/usr/bin/env bash
# scripts/doc-gate.sh — documentation drift gate (Q6.11). Fails on:
#   1. AGENTS.md Development Workflow / Verification Matrix commands whose
#      `make <target>` has no Makefile target;
#   2. Makefile recipes that invoke a ./script path that does not exist;
#   3. relative markdown links in AGENTS.md, CONTEXT.md, docs/**/*.md that
#      point at a missing file.
set -u
cd "$(git rev-parse --show-toplevel)" || exit 2
fail=0
targets="$(grep -E '^[A-Za-z0-9_.-]+:' Makefile | sed -E 's/^([A-Za-z0-9_.-]+):.*/\1/' | sort -u)"

echo "--- 1. AGENTS.md make targets exist"
for t in $(grep -oE '`make [A-Za-z0-9_.-]+' AGENTS.md | sed 's/`make //' | sort -u); do
  printf '%s\n' "$targets" | grep -qx "$t" || { echo "  AGENTS.md  documents \`make $t\` but Makefile has no target '$t' (add the target or fix the doc)"; fail=1; }
done

echo "--- 2. Makefile script references exist"
for s in $(grep -oE '(bash|sh|python3) (scripts|\.git-hooks)/[A-Za-z0-9_./-]+' Makefile | awk '{print $2}' | sort -u); do
  [ -f "$s" ] || { echo "  Makefile  references $s which does not exist"; fail=1; }
done
for s in $(grep -oE '\./[A-Za-z0-9_-]+\.sh' Makefile | sort -u); do
  [ -f "$s" ] || { echo "  Makefile  references $s which does not exist"; fail=1; }
done

echo "--- 3. markdown relative links resolve"
files="AGENTS.md CONTEXT.md $(find docs -name '*.md' 2>/dev/null)"
broken="$(for f in $files; do
  [ -f "$f" ] || continue
  dir="$(dirname "$f")"
  grep -oE '\]\(([^)#: ]+)(#[^)]*)?\)' "$f" | sed -E 's/^\]\(//; s/#.*//; s/\)$//' | while read -r link; do
    case "$link" in http*|mailto:*|"") continue ;; esac
    if [ ! -e "$dir/$link" ] && [ ! -e "$link" ]; then echo "  $f  broken link -> $link"; fi
  done
done)"
if [ -n "$broken" ]; then printf '%s\n' "$broken"; fail=1; fi

if [ "$fail" -ne 0 ]; then echo "doc-gate: drift found above — docs change with code in the same PR (AGENTS.md § Conventions)." >&2; exit 1; fi
echo "doc-gate: AGENTS.md, Makefile and docs links conform."
