#!/usr/bin/env bash
# scripts/anti-drift.sh — duplicate code (jscpd), dead code (vulture / knip) on
# the fork's change scope. BLIND SPOT (declared in AGENTS.md): jscpd only
# compares scoped files with each other, so duplication between new code and
# untouched upstream code is not detected — review owns that.
#
# usage: scripts/anti-drift.sh [--only knip]
#   --only knip  run only the scoped knip step and skip jscpd and vulture. It is
#                for the guardrail self-test: in its temp worktree vulture's
#                `uv run` would sync a fresh .venv. An argument, not an env var,
#                so a value left set in a shell or CI cannot skip the other steps.
#   Any other argument exits 2.
set -u
only=""
while [ $# -gt 0 ]; do
  case "$1" in
    --only)
      if [ "${2:-}" != knip ]; then echo "anti-drift: --only accepts only 'knip', got '${2:-}'" >&2; exit 2; fi
      only=knip; shift 2 ;;
    *) echo "anti-drift: unknown argument '$1'" >&2; exit 2 ;;
  esac
done
repo_root="$(git rev-parse --show-toplevel)" || exit 2
cd "$repo_root" || exit 2
threshold="$(sed -n '/^anti_drift:/,/^module_boundaries:/p' constraints.yaml | sed -n 's/^ *value: *\([0-9]*\).*/\1/p' | head -n 1)"
fail=0
py_files="$(bash scripts/change-scope.sh --ext py)"
web_files="$(bash scripts/change-scope.sh --ext "ts js svelte")"
all_files="$(printf '%s\n%s\n' "$py_files" "$web_files" | sed '/^$/d')"

if [ -z "$all_files" ]; then echo "anti-drift: no scoped source files, nothing to check."; exit 0; fi

if [ "$only" = knip ]; then
  echo "anti-drift: --only knip — jscpd and vulture skipped"
else
  echo "--- duplicate code (jscpd, threshold ${threshold}%)"
  # shellcheck disable=SC2086
  if ! npx --no-install jscpd --silent --threshold "$threshold" --min-tokens 50 --reporters console $all_files; then
    echo "anti-drift: jscpd found duplication above ${threshold}% in scoped files — unify, do not copy." >&2; fail=1
  fi
fi

if [ -z "$only" ] && [ -n "$py_files" ]; then
  echo "--- dead code (vulture, min-confidence 80)"
  # shellcheck disable=SC2086
  if ! uv run --quiet vulture $py_files --min-confidence 80; then
    echo "anti-drift: vulture reports unused code in scoped Python files — wire it up or delete it." >&2; fail=1
  fi
fi

if [ -n "$web_files" ]; then
  echo "--- dead exports (knip, scoped)"
  knip_tmp="$(mktemp -d "${TMPDIR:-/tmp}/anti-drift.XXXXXX")" || exit 2
  trap 'rm -rf "$knip_tmp"' EXIT
  # A (fork-added) files block on every finding; in M (modified upstream) files only findings on
  # lines the fork added or changed block, so upstream's own dead exports stay advisory.
  bash scripts/change-scope.sh --status --ext "ts js svelte" > "$knip_tmp/scope" || exit 2
  base="$(bash scripts/change-scope.sh --base)" || exit 2
  # knip's exit status is not the verdict: it is 1 on any finding, including out-of-scope
  # unused files and dependencies. The verdict comes from the report alone.
  npx --no-install knip --reporter json --no-progress > "$knip_tmp/report.json" 2> "$knip_tmp/knip.err"
  knip_rc=$?
  hits="$(python3 -c '
import json,re,subprocess,sys
def unreadable(reason):
    print(f"anti-drift: knip report unreadable: {reason}", file=sys.stderr); sys.exit(2)
scope={p: st for st, p in (l.rstrip("\n").split("\t",1) for l in open(sys.argv[1]) if l.strip())}
touched={}
def fork_lines(f):
    if f not in touched:
        diff=subprocess.run(["git","diff","--no-color","--no-ext-diff","-U0",sys.argv[2],"--",f],capture_output=True,text=True,check=True).stdout
        touched[f]=set()
        for m in re.finditer(r"^@@ -\S+ \+(\d+)(?:,(\d+))? @@",diff,re.M):
            start=int(m.group(1)); n=1 if m.group(2) is None else int(m.group(2))
            touched[f].update(range(start,start+n))
    return touched[f]
advisory=[]
raw=sys.stdin.read()
if not raw.strip(): unreadable("knip printed nothing")
try: data=json.loads(raw)
except ValueError as e: unreadable(f"not JSON ({e})")
issues=data.get("issues") if isinstance(data,dict) else None
if not isinstance(issues,list): unreadable("no issues list")
for item in issues:
    f=item.get("file","")
    if f in scope:
        for k in ("exports","types","unresolved","duplicates"):
            for e in item.get(k) or []:
                name=e.get("name") if isinstance(e,dict) else e
                line=e.get("line") if isinstance(e,dict) else None
                if scope[f]=="M" and isinstance(line,int) and line not in fork_lines(f):
                    advisory.append(f"  {f}  advisory (upstream): unused {k[:-1]}: {name}")
                else:
                    print(f"  {f}  unused {k[:-1]}: {name}")
if advisory:
    print("anti-drift: knip findings on upstream lines of modified files (advisory, not blocking):", file=sys.stderr)
    print("\n".join(advisory), file=sys.stderr)
' "$knip_tmp/scope" "$base" < "$knip_tmp/report.json")"
  filter_rc=$?
  knip_fail=0
  if [ "$filter_rc" -ne 0 ]; then
    # Exit 2 is the filter's own unreadable verdict, already printed; anything else is a crash.
    [ "$filter_rc" -eq 2 ] || echo "anti-drift: knip report unreadable: report filter failed (exit $filter_rc)" >&2
    knip_fail=1
  elif [ -n "$hits" ]; then
    echo "anti-drift: knip reports dead exports in scoped files:" >&2
    printf '%s\n' "$hits" >&2; knip_fail=1
  fi
  if [ "$knip_fail" -eq 1 ]; then
    echo "anti-drift: knip exited $knip_rc" >&2
    if [ -s "$knip_tmp/knip.err" ]; then echo "anti-drift: knip stderr:" >&2; sed 's/^/  /' "$knip_tmp/knip.err" >&2; fi
    fail=1
  fi
fi

[ "$fail" -eq 0 ] && echo "anti-drift: scoped duplicate/dead-code checks passed."
exit "$fail"
