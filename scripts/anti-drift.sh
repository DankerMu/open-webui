#!/usr/bin/env bash
# scripts/anti-drift.sh — duplicate code (jscpd), dead code (vulture / knip) on
# the fork's change scope. BLIND SPOT (declared in AGENTS.md): jscpd only
# compares scoped files with each other, so duplication between new code and
# untouched upstream code is not detected — review owns that.
#
# usage: scripts/anti-drift.sh [--only knip|vulture]
#   --only knip     run only the scoped knip step and skip jscpd and vulture.
#   --only vulture  run only the scoped vulture step and skip jscpd and knip.
#                   Both are for the guardrail self-test: in its temp worktree
#                   vulture's `uv run` would sync a fresh .venv, so it runs knip
#                   alone and vulture against a stand-in `uv`. An argument, not an
#                   env var, so a value left set in a shell or CI cannot skip steps.
#   Any other argument exits 2.
set -u
only=""
while [ $# -gt 0 ]; do
  case "$1" in
    --only)
      case "${2:-}" in
        knip|vulture) only="$2"; shift 2 ;;
        *) echo "anti-drift: --only accepts 'knip' or 'vulture', got '${2:-}'" >&2; exit 2 ;;
      esac ;;
    *) echo "anti-drift: unknown argument '$1'" >&2; exit 2 ;;
  esac
done
repo_root="$(git rev-parse --show-toplevel)" || exit 2
cd "$repo_root" || exit 2
threshold="$(sed -n '/^anti_drift:/,/^module_boundaries:/p' constraints.yaml | sed -n 's/^ *value: *\([0-9]*\).*/\1/p' | head -n 1)"
fail=0
# Shared by the vulture and knip steps: one temp dir, one base, one --status scope per extension
# set. The file lists come from the scope files, so a change-scope failure exits 2 instead of
# reading as an empty scope.
tmp="$(mktemp -d "${TMPDIR:-/tmp}/anti-drift.XXXXXX")" || exit 2
trap 'rm -rf "$tmp"' EXIT
base="$(bash scripts/change-scope.sh --base)" || exit 2
bash scripts/change-scope.sh --status --ext py > "$tmp/py.scope" || exit 2
bash scripts/change-scope.sh --status --ext "ts js svelte" > "$tmp/web.scope" || exit 2
py_files="$(cut -f2 "$tmp/py.scope")"
web_files="$(cut -f2 "$tmp/web.scope")"
all_files="$(printf '%s\n%s\n' "$py_files" "$web_files" | sed '/^$/d')"

if [ -z "$all_files" ]; then echo "anti-drift: no scoped source files, nothing to check."; exit 0; fi

# The one copy of the fork line set, prepended to each step's filter (`python3 -c "$fork_lines_py…"
# SCOPE BASE …`). A (fork-added) files block on every finding; in M (modified upstream) files only
# findings on lines the fork added or changed against the change-scope base block, so upstream's
# own dead code stays advisory.
fork_lines_py='
import re,subprocess,sys
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
'

if [ "$only" = knip ]; then
  echo "anti-drift: --only knip — jscpd and vulture skipped"
elif [ "$only" = vulture ]; then
  echo "anti-drift: --only vulture — jscpd and knip skipped"
else
  echo "--- duplicate code (jscpd, threshold ${threshold}%)"
  # shellcheck disable=SC2086
  if ! npx --no-install jscpd --silent --threshold "$threshold" --min-tokens 50 --reporters console $all_files; then
    echo "anti-drift: jscpd found duplication above ${threshold}% in scoped files — unify, do not copy." >&2; fail=1
  fi
fi

if { [ -z "$only" ] || [ "$only" = vulture ]; } && [ -n "$py_files" ]; then
  echo "--- dead code (vulture, min-confidence 80)"
  # One run over the whole Python scope: cross-file usage resolves findings.
  # shellcheck disable=SC2086
  uv run --quiet vulture $py_files --min-confidence 80 > "$tmp/vulture.out" 2> "$tmp/vulture.err"
  vulture_rc=$?
  # The verdict passes only when vulture exited 0 with no output, or exited 3 (findings) with
  # every stdout line parsed as a finding and no input error on stderr; it then blocks on
  # findings in A files and on fork lines of M files.
  # shellcheck disable=SC2016 # the single-quoted part is Python; its `$` are regex anchors
  python3 -c "$fork_lines_py"'
import ast
rc=int(sys.argv[3])
out=open(sys.argv[4]).read().splitlines()
err=open(sys.argv[5]).read().splitlines()
def stop(msg, streams=(("stdout",out),("stderr",err))):
    print(f"anti-drift: {msg}", file=sys.stderr)
    for label, lines in streams:
        if lines:
            print(f"anti-drift: vulture {label}:", file=sys.stderr)
            print("\n".join("  "+l for l in lines), file=sys.stderr)
    sys.exit(2)
if rc not in (0,3): stop(f"vulture failed (exit {rc})")
# vulture reports exit 3 instead of its input-error exit 1 when it also prints a finding, so input
# errors are read from stderr under either exit code. Python warnings share the path:line prefix.
# A SyntaxError without a line (null bytes on Python 3.12) prints as path:None.
paths="|".join(re.escape(p) for p in scope)
syntax_error=re.compile(rf"^(?:{paths}):(?:\d+|None): ")
warning=re.compile(rf"^(?:{paths}):\d+: \w*Warning: ")
def input_error(l):
    return (bool(paths) and syntax_error.match(l) and not warning.match(l)) or ": invalid source code \"" in l or l.startswith("Error: Could not read file ")
if any(input_error(l) for l in err): stop("vulture failed (input error)", (("stderr",err),))
if rc==0 and out: stop(f"vulture output unreadable: exit 0 with output: {out[0]}")
if rc==3 and not out: stop("vulture output unreadable: exit 3 without a finding")
finding=re.compile(r"^(?P<path>[^:]+):(?P<line>\d+): (?P<msg>.+) \((?P<conf>\d+)% confidence(?:, \d+ lines?)?\)$")
parsed=[]
for l in out:
    m=finding.match(l)
    if not m: stop(f"vulture output unreadable: {l}")
    parsed.append((l,m))
if err: print("\n".join(err), file=sys.stderr)
trees={}
def import_line(path, line, name):
    # vulture reports an import at its statement first line and names `import a.b` as `a`; the
    # verdict uses the line of the imported name itself. None (unresolved) blocks.
    if path not in trees:
        try: trees[path]=ast.parse(open(path,"rb").read(), filename=path)
        except (OSError, SyntaxError, ValueError): trees[path]=None
    if trees[path] is None: return None
    for node in ast.walk(trees[path]):
        if isinstance(node,(ast.Import,ast.ImportFrom)) and node.lineno==line:
            for a in node.names:
                if (a.asname or a.name.partition(".")[0])==name: return getattr(a,"lineno",None)
    return None
blocking=[]; advisory=[]
for l,m in parsed:
    path=m["path"]; line=int(m["line"])
    if scope.get(path)!="M": blocking.append(l); continue
    imp=re.fullmatch(r"unused import \x27(.+)\x27", m["msg"])
    if imp: line=import_line(path, line, imp.group(1))
    if line is None or line in fork_lines(path): blocking.append(l)
    else: advisory.append(f"  {l}  advisory (upstream)")
if advisory:
    print("anti-drift: vulture findings on upstream lines of modified files (advisory, not blocking):", file=sys.stderr)
    print("\n".join(advisory), file=sys.stderr)
if blocking:
    print("anti-drift: vulture reports unused code in scoped Python files — wire it up or delete it:", file=sys.stderr)
    print("\n".join(blocking), file=sys.stderr)
    sys.exit(2)
' "$tmp/py.scope" "$base" "$vulture_rc" "$tmp/vulture.out" "$tmp/vulture.err"
  filter_rc=$?
  if [ "$filter_rc" -ne 0 ]; then
    # Exit 2 is the filter's own verdict, already printed; anything else is a crash.
    [ "$filter_rc" -eq 2 ] || echo "anti-drift: vulture filter failed (exit $filter_rc)" >&2
    fail=1
  fi
fi

if { [ -z "$only" ] || [ "$only" = knip ]; } && [ -n "$web_files" ]; then
  echo "--- dead exports (knip, scoped)"
  # knip's exit status is not the verdict: it is 1 on any finding, including out-of-scope
  # unused files and dependencies. The verdict comes from the report alone.
  npx --no-install knip --reporter json --no-progress > "$tmp/report.json" 2> "$tmp/knip.err"
  knip_rc=$?
  hits="$(python3 -c "$fork_lines_py"'
import json
def unreadable(reason):
    print(f"anti-drift: knip report unreadable: {reason}", file=sys.stderr); sys.exit(2)
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
' "$tmp/web.scope" "$base" < "$tmp/report.json")"
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
    if [ -s "$tmp/knip.err" ]; then echo "anti-drift: knip stderr:" >&2; sed 's/^/  /' "$tmp/knip.err" >&2; fi
    fail=1
  fi
fi

[ "$fail" -eq 0 ] && echo "anti-drift: scoped duplicate/dead-code checks passed."
exit "$fail"
