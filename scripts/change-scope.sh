#!/usr/bin/env bash
# scripts/change-scope.sh — deterministic list of files the fork changed vs the
# frozen baseline (constraints.yaml baseline.rev, upstream v0.11.3). Every scoped
# gate (lint, size, anti-drift, coverage) consumes this list. Includes committed,
# staged, unstaged and untracked (non-ignored) changes so a gate never runs on a
# guessed scope.
#
# usage: scripts/change-scope.sh [--status] [--ext py|ts|js|svelte ...] [BASE_REV]
#   --status  prefix each path with A (added since base) or M (modified)
set -u
repo_root="$(git rev-parse --show-toplevel)" || exit 2
cd "$repo_root" || exit 2

with_status=0
exts=""
base=""
while [ $# -gt 0 ]; do
  case "$1" in
    --status) with_status=1 ;;
    --ext) shift; exts="$1" ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) base="$1" ;;
  esac
  shift
done

if [ -z "$base" ]; then
  base="$(sed -n 's/^  rev: *"\([0-9a-f]*\)".*/\1/p' constraints.yaml | head -n 1)"
fi
if [ -z "$base" ] || ! git rev-parse --verify --quiet "$base^{commit}" >/dev/null; then
  echo "change-scope: baseline rev '$base' not found (set constraints.yaml baseline.rev or pass BASE_REV)" >&2
  exit 2
fi

# name-status vs base covers committed + staged + unstaged; untracked added separately.
{
  git diff --name-status --diff-filter=ACMR "$base" -- . ':(exclude).claude' ':(exclude).omp'
  git ls-files --others --exclude-standard | sed 's/^/A\t/'
} | awk -F'\t' '{ s=substr($1,1,1); p=$NF; if (s=="R"||s=="C") s="A"; if (!(p in seen)) { seen[p]=1; print s "\t" p } }' \
  | while IFS="$(printf '\t')" read -r st path; do
      [ -f "$path" ] || continue
      if [ -n "$exts" ]; then
        keep=0
        for e in $exts; do case "$path" in *."$e") keep=1 ;; esac; done
        [ "$keep" -eq 1 ] || continue
      fi
      if [ "$with_status" -eq 1 ]; then printf '%s\t%s\n' "$st" "$path"; else printf '%s\n' "$path"; fi
    done
