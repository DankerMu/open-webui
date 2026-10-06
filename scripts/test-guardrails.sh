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

echo
echo "guardrail self-test: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
