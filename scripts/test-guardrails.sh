#!/usr/bin/env bash
# scripts/test-guardrails.sh — proves each wired guard actually rejects what it
# claims to reject (dual assertion: clean tree accepted first, then one staged
# violation per guard must be rejected AND named). Exit 126/127 counts as FAIL.
set -u

repo_root="$(git rev-parse --show-toplevel)" || exit 1
tmp="$(mktemp -d "${TMPDIR:-/tmp}/guardrails.XXXXXX")"
wt="$tmp/wt"

cleanup() {
  cd "$repo_root" || exit 1
  # Case 10 stand-ins lead their own groups; kill fails only for a group already gone.
  for p in ${standins:-}; do kill -- "-$p" 2>/dev/null || true; done
  git worktree remove --force "$wt" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

git -C "$repo_root" worktree add --quiet --detach "$wt" || {
  echo "FATAL: could not create temp worktree (need at least one commit)" >&2
  exit 1
}
# Guards under test come from the working tree, not HEAD, so a not-yet-committed
# guard is exercised as written.
for f in .git-hooks/check-naming.sh .git-hooks/commit-msg .pre-commit-config.yaml constraints.yaml Makefile AGENTS.md CONTEXT.md; do
  [ -e "$repo_root/$f" ] && { mkdir -p "$wt/$(dirname "$f")"; cp "$repo_root/$f" "$wt/$f"; }
done
for d in scripts docs; do
  [ -d "$repo_root/$d" ] && { rm -rf "${wt:?}/$d"; cp -R "$repo_root/$d" "$wt/$d"; }
done
cd "$wt" || exit 1

pass=0
fail=0

expect_reject() {
  name="$1"; reason="$2"; shift 2
  out=$("$@" 2>&1); rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "FAIL  $name — guard ACCEPTED the violation (phantom enforcement)"; fail=$((fail + 1))
  elif [ "$rc" -eq 126 ] || [ "$rc" -eq 127 ]; then
    echo "FAIL  $name — guard not runnable (exit $rc): missing tool or non-executable hook"; fail=$((fail + 1))
  elif ! printf '%s\n' "$out" | grep -qF -- "$reason"; then
    echo "FAIL  $name — exited $rc without naming \"$reason\" — crash, not rejection:"
    printf '%s\n' "$out" | sed 's/^/        /'; fail=$((fail + 1))
  else
    echo "PASS  $name — guard rejected the violation and named it (exit $rc)"; pass=$((pass + 1))
  fi
}

skip() { echo "SKIP  $1 — $2 (a skipped guard is a readiness gap, not a pass)"; }

expect_accept() {
  name="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "PASS  $name — guard accepts the clean tree"; pass=$((pass + 1))
  else
    echo "FAIL  $name — guard REJECTED the clean tree (always-failing guard or broken setup)"; fail=$((fail + 1))
  fi
}

# 0. Clean-state baseline.
expect_accept "naming guard (clean tree)" bash .git-hooks/check-naming.sh
goodmsg="$tmp/goodmsg"; echo "feat(ocu): add workspace route" > "$goodmsg"
expect_accept "commit-msg guard (good message)" bash .git-hooks/commit-msg "$goodmsg"
expect_accept "doc-gate (clean tree)" bash scripts/doc-gate.sh
expect_accept "decisions-verify (clean tree)" python3 scripts/decisions-verify.py

# 1. Naming guard — forbidden suffix.
echo "guardrail self-test" > "foo_v2.py"
git add "foo_v2.py"
expect_reject "naming guard (foo_v2.py)" "forbidden naming suffix" bash .git-hooks/check-naming.sh
git reset --quiet -- "foo_v2.py"; rm -f "foo_v2.py"

# 2. Scratchpad guard — forbidden directory.
mkdir -p scratch; echo "guardrail self-test" > scratch/note.txt
git add scratch/note.txt
expect_reject "scratchpad guard (scratch/)" "scratchpad directory" bash .git-hooks/check-naming.sh
git reset --quiet -- scratch/note.txt; rm -rf scratch

# 2b. Scratchpad guard — OpenSpec frozen archive is exempt (constraints.yaml exemptions).
mkdir -p openspec/changes/archive/2026-01-01-sample; echo "guardrail self-test" > openspec/changes/archive/2026-01-01-sample/proposal.md
git add openspec/changes/archive/2026-01-01-sample/proposal.md
expect_accept "scratchpad guard (openspec archive exempt)" bash .git-hooks/check-naming.sh
git reset --quiet -- openspec/changes/archive/2026-01-01-sample/proposal.md; rm -rf openspec/changes

# 3. Write-time naming guard (path-argument mode, used by .claude hook).
expect_reject "naming guard write-time (src/lib/foo_new.ts)" "naming violation (write-time)" \
  bash .git-hooks/check-naming.sh "src/lib/foo_new.ts"

# 4. Commit-message guard.
badmsg="$tmp/badmsg"; echo "bad message" > "$badmsg"
expect_reject "commit-msg guard (\"bad message\")" "Commit message must use Conventional Commits" \
  bash .git-hooks/commit-msg "$badmsg"

# 5. doc-gate — AGENTS.md documents a make target that does not exist.
cp AGENTS.md "$tmp/AGENTS.bak"
printf '\n| Phantom | `make phantom-target-xyz` |\n' >> AGENTS.md
expect_reject "doc-gate (phantom make target)" "no target 'phantom-target-xyz'" bash scripts/doc-gate.sh
cp "$tmp/AGENTS.bak" AGENTS.md

# 6. decisions-verify — record with a kind outside the allowed set.
mkdir -p docs/decisions/proposed/bogus-kind
printf -- '---\nid: 2026-01-01-bogus\ntitle: bogus\nkind: bogus-kind\nstatus: proposed\ndate: 2026-01-01\n---\n# bogus\n' > docs/decisions/proposed/bogus-kind/2026-01-01-bogus.md
expect_reject "decisions-verify (bogus kind)" "not in architecture" python3 scripts/decisions-verify.py
rm -rf docs/decisions/proposed/bogus-kind

# 7. Large-file guard (pre-commit check-added-large-files, 500 KB ceiling).
dd if=/dev/zero of=generated.bin bs=1024 count=600 2>/dev/null
git add generated.bin
if [ -f .pre-commit-config.yaml ] && (cd "$repo_root" && uv run --quiet pre-commit --version >/dev/null 2>&1); then
  expect_reject "large-file guard (600 KB generated.bin)" "exceeds" \
    sh -c "cd '$wt' && uv run --project '$repo_root' --quiet pre-commit run check-added-large-files --files generated.bin"
else
  skip "large-file guard" "pre-commit not installed (run: make setup)"
fi
git reset --quiet -- generated.bin; rm -f generated.bin

# 8. Secret scan (gitleaks) — staged fake private key.
if command -v gitleaks >/dev/null 2>&1; then
  # Marker assembled at runtime so this script itself never contains a key literal.
  k="RSA PRIVATE KEY"
  printf -- '-----BEGIN %s-----\nMIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu\n-----END %s-----\n' "$k" "$k" > leaked_key.pem
  git add leaked_key.pem
  expect_reject "secret scan (gitleaks, staged private key)" "leaks found" gitleaks git --staged --no-banner --exit-code 1 .
  git reset --quiet -- leaked_key.pem; rm -f leaked_key.pem
else
  skip "secret scan" "gitleaks not on PATH"
fi

# 9. A bounded line ceiling changes only the exact file's size allowance.
size_fixture="$tmp/line-ceiling"
mkdir -p "$size_fixture/scripts" "$size_fixture/src/lib/components/chat"
cp "$repo_root/scripts/lint-scoped.sh" "$repo_root/scripts/change-scope.sh" "$size_fixture/scripts/"
cp "$repo_root/.eslintrc.cjs" "$repo_root/constraints.yaml" "$size_fixture/"
printf 'node_modules/\n' > "$size_fixture/.gitignore"
ln -s "$repo_root/node_modules" "$size_fixture/node_modules"
git -C "$size_fixture" init --quiet || exit 1
git -C "$size_fixture" config user.name "Guardrail fixture"
git -C "$size_fixture" config user.email "guardrail@example.invalid"
git -C "$size_fixture" config commit.gpgsign false
git -C "$size_fixture" config core.hooksPath "$size_fixture/.git/hooks"

sized_svelte() {
  local path="$1" lines="$2" i
  {
    printf '<script lang="ts">\nexport const title = "Scoped fixture";\n</script>\n'
    for ((i = 3; i < lines; i++)); do printf '\n'; done
  } > "$size_fixture/$path"
}

chat_path="src/lib/components/chat/Chat.svelte"
sized_svelte "$chat_path" 3
git -C "$size_fixture" add . || exit 1
git -C "$size_fixture" commit --quiet -m "test: freeze scoped gate fixture" || exit 1
size_base="$(git -C "$size_fixture" rev-parse HEAD)"
awk -v rev="$size_base" '
  /^  rev: / { print "  rev: \"" rev "\""; next }
  { print }
' "$repo_root/constraints.yaml" > "$size_fixture/constraints.yaml"
size_template="$tmp/line-ceiling-template.yaml"
cp "$size_fixture/constraints.yaml" "$size_template"

override_variant() {
  local style="$1" fragment="$tmp/bounded-stanza.yaml"
  (cd "$size_fixture" && node --input-type=module - "$size_template" "$fragment" "$style" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
import { parse, stringify } from 'yaml';

const [template, fragment, style] = process.argv.slice(2);
const config = parse(readFileSync(template, 'utf8'));
const styles = { double: 'QUOTE_DOUBLE', single: 'QUOTE_SINGLE', plain: 'PLAIN', formatted: 'QUOTE_DOUBLE' };
writeFileSync(fragment, stringify({
  bounded_overrides: config.size_limits.max_file_lines.bounded_overrides
}, { defaultKeyType: 'PLAIN', defaultStringType: styles[style] }));
NODE
  ) || return 1
  if [ "$style" = "formatted" ]; then
    (cd "$size_fixture" && npx --no-install prettier --config "$repo_root/.prettierrc" --parser yaml --write "$fragment") || return 1
  fi
  node --input-type=module - "$size_template" "$fragment" "$size_fixture/constraints.yaml" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';

const [template, fragment, output] = process.argv.slice(2);
const source = readFileSync(template, 'utf8');
const start = source.indexOf('    bounded_overrides:\n');
const end = source.indexOf('  max_complexity:', start);
if (start < 0 || end < 0) throw new Error('bounded stanza fixture boundaries missing');
const stanza = readFileSync(fragment, 'utf8').trimEnd().split('\n')
  .map((line) => `    ${line}`).join('\n') + '\n';
writeFileSync(output, source.slice(0, start) + stanza + source.slice(end));
NODE
}

scoped_size_gate() { (cd "$size_fixture" && bash scripts/lint-scoped.sh); }

sized_svelte "$chat_path" 4688
for style in double single plain formatted; do
  override_variant "$style" || exit 1
  expect_accept "bounded Chat ceiling ($style YAML, 4688 lines)" scoped_size_gate
done
sized_svelte "$chat_path" 4689
expect_reject "bounded Chat ceiling (4689 lines)" "4689 lines, expected <= 4688" scoped_size_gate
sized_svelte "$chat_path" 4688
other_path="src/lib/components/chat/Chat.svelte.extra.svelte"
sized_svelte "$other_path" 801
expect_reject "bounded ceiling exact-path isolation" "801 lines, expected <= 800" scoped_size_gate
rm -f "$size_fixture/$other_path"

{
  printf '<script lang="ts">\nexport function choose(value: number) {\n'
  for ((i = 0; i < 16; i++)); do printf '  if (value === %s) return %s;\n' "$i" "$i"; done
  printf '  return -1;\n}\n</script>\n'
  for ((i = 21; i < 4688; i++)); do printf '\n'; done
} > "$size_fixture/$chat_path"
complexity_output="$(cd "$size_fixture" && npx --no-install eslint --no-eslintrc -c .eslintrc.cjs -f unix "$chat_path" 2>&1)"
complexity_status=$?
if [ "$complexity_status" -eq 1 ] && printf '%s\n' "$complexity_output" | grep -qF '[Error/complexity]'; then
  expect_reject "bounded Chat ceiling retains complexity gate" "eslint violations rose 0 -> 1" scoped_size_gate
else
  echo "FAIL  bounded Chat complexity fixture — expected a real complexity violation, not another lint failure"
  printf '%s\n' "$complexity_output"
  fail=$((fail + 1))
fi

# 10. dev-bg touches only listeners this checkout owns (#667). Runs inside $wt on free
# high ports chosen at run time, never 8080/5173 or the real pidfiles. Every stand-in
# leads its own process group (os.setsid), and only stand-ins are signalled here.
standin="$tmp/listener-standin.py"
cat > "$standin" <<'PY'
import http.server
import os
import sys

cwd, portfile = sys.argv[1], sys.argv[2]
os.setsid()
os.chdir(cwd)
if len(sys.argv) > 3 and os.fork():
    os.wait()
    sys.exit(0)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=cwd, **kwargs)

    def log_message(self, *args):
        pass


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Quiet)
with open(portfile + ".tmp", "w") as f:
    f.write(f"{server.server_address[1]} {os.getpid()}\n")
os.rename(portfile + ".tmp", portfile)
server.serve_forever()
PY
standins=""
standin_seq=0

start_standin() { # start_standin CWD [fork] -> standin_pid (group leader), standin_port, standin_server
  local f i
  standin_seq=$((standin_seq + 1)); f="$tmp/standin.$standin_seq"
  mkdir -p "$1" && : > "$1/health"
  python3 "$standin" "$1" "$f" ${2:+fork} &
  standin_pid=$!; standins="$standins $standin_pid"
  for i in $(seq 1 100); do [ -s "$f" ] && break; sleep 0.1; done
  read -r standin_port standin_server < "$f" || { echo "FATAL: stand-in listener in $1 did not start" >&2; exit 1; }
}

stop_standins() {
  local p
  # kill fails for a group dev-bg already stopped (cases c, d); wait returns the signal status.
  for p in $standins; do kill -- "-$p" 2>/dev/null || true; wait "$p" 2>/dev/null || true; done
  standins=""
}

running() { local s; s="$(ps -o stat= -p "$1" 2>/dev/null | tr -d ' ')"; [ -n "$s" ] && [ "${s#Z}" = "$s" ]; }
free_port() { python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])'; }
idle_port() { local p; p="$(free_port)"; while [ "$p" = "$1" ]; do p="$(free_port)"; done; printf '%s' "$p"; }
names() { printf '%s\n' "$out" | grep -F -- "$1" | grep -F -- "$2" | grep -qF listener-standin.py; }
has() { printf '%s\n' "$out" | grep -qF -- "$1"; }

devbg() { # devbg BACKEND_PORT FRONTEND_PORT ARGS... -> out, rc, took (seconds)
  local backend="$1" frontend="$2" t0=$SECONDS; shift 2
  out="$( (unset DATA_DIR FRONTEND_BUILD_DIR; BACKEND_PORT="$backend" FRONTEND_PORT="$frontend" bash scripts/dev-bg.sh "$@") 2>&1)"; rc=$?
  took=$((SECONDS - t0))
}

verdict() { # verdict NAME FAILURES (empty = pass)
  if [ -z "$2" ]; then echo "PASS  $1 (${took}s)"; pass=$((pass + 1)); return; fi
  echo "FAIL  $1 —$2 (exit $rc, ${took}s):"; printf '%s\n' "$out" | sed 's/^/        /'; fail=$((fail + 1))
}

foreign_dir="$wt-foreign" # shares the string prefix of $wt; not in any repository
git init -q "$wt/.run/nested" || exit 1

foreign_stop_case() { # foreign_stop_case NAME CWD
  local pid port scan t0 why=""
  start_standin "$2"; pid=$standin_pid; port=$standin_port
  # One port-wide lsof scan is the unit of stop's cost; the 10 s sweep wait is what must vanish.
  t0=$SECONDS; lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; scan=$((SECONDS - t0))
  devbg "$(idle_port "$port")" "$port" stop
  running "$pid" || why="$why listener killed;"
  [ "$rc" -eq 0 ] || why="$why exit not 0;"
  names "$port" "$pid" || why="$why no line naming port $port, pid $pid and command;"
  [ "$took" -le $((3 * scan + 5)) ] || why="$why took ${took}s, bound $((3 * scan + 5))s (scan ${scan}s);"
  verdict "$1" "$why"
  stop_standins
}
foreign_stop_case "dev-bg stop leaves a foreign listener (10a)" "$foreign_dir"
foreign_stop_case "dev-bg stop leaves a nested-repository listener (10a2)" "$wt/.run/nested"

start_standin "$foreign_dir"; pid=$standin_pid; port=$standin_port
rm -rf .run/backend.pid .run/frontend.pid .run/frontend-build
devbg "$port" "$(idle_port "$port")" start
created=""
for f in .run/backend.pid .run/frontend.pid .run/frontend-build; do [ -e "$f" ] && created="$created $f"; done
# A dev-bg that ignores the foreign holder starts real servers in $wt; stop those fresh groups now.
for n in backend frontend; do [ -f ".run/$n.pid" ] && { kill -- "-$(cat ".run/$n.pid")" 2>/dev/null || true; rm -f ".run/$n.pid"; }; done
why=""
[ "$rc" -eq 1 ] || why="$why exit not 1;"
names "$port" "$pid" || why="$why no line naming port $port, pid $pid and command;"
[ -z "$created" ] || why="$why created$created;"
verdict "dev-bg start refuses a foreign listener before staging (10b)" "$why"
rm -rf .run/frontend-build
stop_standins

start_standin "$wt/.run/owned"; pid=$standin_pid; port=$standin_port
devbg "$port" "$(idle_port "$port")" stop
why=""
[ "$rc" -eq 0 ] || why="$why exit not 0;"
running "$pid" && why="$why owned orphan survived;"
curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$port/" && why="$why port $port still answers;"
verdict "dev-bg stop sweeps an owned orphan (10c)" "$why"
stop_standins

start_standin "$wt/.run/owned" fork; parent=$standin_pid; child=$standin_server; port=$standin_port
echo "$parent" > .run/frontend.pid
devbg "$(idle_port "$port")" "$port" stop
why=""
[ "$rc" -eq 0 ] || why="$why exit not 0;"
running "$parent" && why="$why group leader $parent survived;"
running "$child" && why="$why port-holding child $child survived;"
[ -f .run/frontend.pid ] && why="$why pidfile kept;"
verdict "dev-bg stop stops an owned process group (10d)" "$why"
stop_standins

start_standin "$foreign_dir"; port=$standin_port
devbg "$port" "$(idle_port "$port")" status
why=""
[ "$rc" -eq 1 ] || why="$why exit not 1;"
has "health: foreign listener on $port" || why="$why no 'health: foreign listener on $port';"
verdict "dev-bg status refuses a foreign backend answering /health (10e)" "$why"
stop_standins
start_standin "$foreign_dir"; port=$standin_port
devbg "$(idle_port "$port")" "$port" status
why=""
has "health: foreign listener on $port" || why="$why no 'health: foreign listener on $port';"
verdict "dev-bg status names a foreign frontend listener (10e)" "$why"
stop_standins

start_standin "$foreign_dir"; pid=$standin_pid; port=$standin_port
echo "$pid" > .run/backend.pid
devbg "$(idle_port "$port")" "$(idle_port "$port")" stop
why=""
[ "$rc" -eq 0 ] || why="$why exit not 0;"
running "$pid" || why="$why stale pid $pid signalled;"
[ -f .run/backend.pid ] && why="$why pidfile kept;"
has "stale" || why="$why not reported as stale;"
verdict "dev-bg stop removes a stale pidfile without signalling (10f)" "$why"
rm -f .run/backend.pid
stop_standins

no_lsof="$tmp/no-lsof-bin"; mkdir -p "$no_lsof"
for t in git ps cat mkdir rm cp tr seq sleep tail curl; do ln -s "$(command -v "$t")" "$no_lsof/$t"; done
bash_abs="$(command -v bash)"
start_standin "$wt/.run/owned"; pid=$standin_pid; port=$standin_port
other="$(idle_port "$port")"
echo "$pid" > .run/backend.pid
t0=$SECONDS
out="$( (unset DATA_DIR FRONTEND_BUILD_DIR; PATH="$no_lsof" BACKEND_PORT="$port" FRONTEND_PORT="$other" "$bash_abs" scripts/dev-bg.sh stop) 2>&1)"; rc=$?
took=$((SECONDS - t0))
why=""
[ "$rc" -eq 2 ] || why="$why exit not 2;"
has "lsof" || why="$why lsof not named;"
running "$pid" || why="$why owned pid $pid signalled;"
[ -f .run/backend.pid ] || why="$why pidfile removed;"
verdict "dev-bg stop without lsof fails loud and signals nothing (10g)" "$why"
rm -rf .run/backend.pid .run/frontend-build
t0=$SECONDS
out="$( (unset DATA_DIR FRONTEND_BUILD_DIR; PATH="$no_lsof" "$bash_abs" scripts/dev-bg.sh stage) 2>&1)"; rc=$?
took=$((SECONDS - t0))
why=""
[ "$rc" -eq 0 ] || why="$why exit not 0;"
[ -d .run/frontend-build/static ] || why="$why nothing staged;"
verdict "dev-bg stage without lsof still stages (10g)" "$why"
rm -rf .run/frontend-build
stop_standins

echo
echo "guardrail self-test: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
