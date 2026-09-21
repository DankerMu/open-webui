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

echo
echo "guardrail self-test: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
