#!/usr/bin/env bash
# scripts/lint-scoped.sh — L3 lint / size / complexity gate on the fork's change
# scope, with a per-file ratchet against the frozen baseline:
#   * files ADDED by the fork  -> zero violations, <= 800 lines (full L3 gate)
#   * files MODIFIED upstream  -> violation count and line count may not rise
#     above what the baseline revision already had (counts only go down)
# Thresholds: constraints.yaml size_limits (800 lines, complexity 15 via ruff
# C901 / eslint complexity). Exempted paths: constraints.yaml exemptions.
set -u
repo_root="$(git rev-parse --show-toplevel)" || exit 2
cd "$repo_root" || exit 2
max_lines="$(sed -n '/^size_limits:/,/^testing:/p' constraints.yaml | sed -n '/max_file_lines:/,/severity/p' | sed -n 's/^ *value: *\([0-9]*\).*/\1/p' | head -n 1)"
base="$(sed -n 's/^  rev: *"\([0-9a-f]*\)".*/\1/p' constraints.yaml | head -n 1)"
[ -n "$max_lines" ] || { echo "lint-scoped: cannot read size_limits.max_file_lines from constraints.yaml" >&2; exit 2; }

# Only the file-line ceiling is overridden; linter violation ratchets still run.
line_overrides="$(node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';

try {
  const { parse } = await import('yaml');
  const config = parse(readFileSync('constraints.yaml', 'utf8'));
  const entries = config?.size_limits?.max_file_lines?.bounded_overrides ?? [];
  if (!Array.isArray(entries)) throw new Error('bounded max_file_lines entries must be a list');
  const nonemptyText = (value) => typeof value === 'string' && value.trim().length > 0;
  const scopedPath = (path) => nonemptyText(path) && path.trim() === path &&
    !path.startsWith('/') && !/[\t\r\n\\]/.test(path) &&
    !path.split('/').some((part) => !part || part === '.' || part === '..');
  const seen = new Set();
  for (const entry of entries) {
    if (!entry || !scopedPath(entry.path) || !Number.isSafeInteger(entry.ceiling) ||
      entry.ceiling <= 0 || !nonemptyText(entry.reason) || !nonemptyText(entry.exit_condition)) {
      throw new Error('invalid bounded max_file_lines entry');
    }
    if (seen.has(entry.path)) throw new Error(`duplicate bounded max_file_lines path: ${entry.path}`);
    seen.add(entry.path);
    process.stdout.write(`${entry.path}\t${entry.ceiling}\n`);
  }
} catch (error) {
  console.error(`lint-scoped: ${error.message}`);
  process.exitCode = 2;
}
NODE
)" || exit 2

bounded_ceiling() {
  local target="$1" path ceiling
  while IFS="$(printf '\t')" read -r path ceiling; do
    if [ "$path" = "$target" ]; then printf '%s' "$ceiling"; return; fi
  done <<< "$line_overrides"
}

exempt_re="$(sed -n '/^exemptions:/,/^baseline:/p' constraints.yaml | sed -n 's/^ *- path: *"\([^"]*\)".*/\1/p' | sed 's/[.[\*^$]/\\&/g' | paste -sd'|' -)"
is_exempt() { [ -n "$exempt_re" ] && printf '%s' "$1" | grep -Eq "^($exempt_re)"; }

tmp="$(mktemp -d "${TMPDIR:-/tmp}/lint-scoped.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT
fail=0
checked=0

# count_violations TOOL FILE -> prints integer
count_violations() {
  tool="$1"; f="$2"
  case "$tool" in
    ruff) uv run --quiet ruff check --output-format concise --quiet "$f" 2>/dev/null | grep -c ':' ;;
    eslint) out="$(npx --no-install eslint --no-eslintrc -c .eslintrc.cjs -f unix "$f" 2>&1)"
            # A crashed linter is not a clean file: fail loud (extend the gate), never count it as 0.
            if printf '%s' "$out" | grep -q 'Oops! Something went wrong'; then echo "eslint crashed on $f — upstream @typescript-eslint bug; exclude or fix, do not skip" >&2; printf '999999'; else printf '%s' "$out" | grep -Ec '^[^ ].*:[0-9]+:[0-9]+:'; fi ;;
  esac
}

base_copy() { # base_copy PATH -> path of baseline version or empty when added
  f="$1"; out="$tmp/base/$f"
  mkdir -p "$(dirname "$out")"
  git show "$base:$f" > "$out" 2>/dev/null && printf '%s' "$out"
}

report() { printf '  %s  %s\n' "$1" "$2"; }

while IFS="$(printf '\t')" read -r st f; do
  is_exempt "$f" && continue
  case "$f" in
    *.py) tool=ruff ;;
    *.ts|*.js|*.cjs|*.mjs|*.svelte) tool=eslint ;;
    *) continue ;;
  esac
  checked=$((checked + 1))
  cur_v="$(count_violations "$tool" "$f")"; cur_v="${cur_v:-0}"
  cur_l="$(wc -l < "$f" | tr -d ' ')"
  bounded="$(bounded_ceiling "$f")"
  line_ceiling="${bounded:-$max_lines}"
  if [ "$st" = "A" ]; then
    if [ "$cur_v" -gt 0 ]; then fail=1; report "$f" "$cur_v $tool violation(s) in a fork-added file — expected 0 (run: uv run ruff check $f / npx eslint $f)"; fi
    if [ "$cur_l" -gt "$line_ceiling" ]; then fail=1; report "$f" "$cur_l lines, expected <= $line_ceiling (split by responsibility; see AGENTS.md § Conventions)"; fi
  else
    bc="$(base_copy "$f")"
    if [ -z "$bc" ]; then base_v=0; base_l=0; else
      cp "$bc" "$tmp/$(basename "$f")"
      base_v="$(count_violations "$tool" "$tmp/$(basename "$f")")"; base_v="${base_v:-0}"
      base_l="$(wc -l < "$bc" | tr -d ' ')"
    fi
    if [ "$cur_v" -gt "$base_v" ]; then fail=1; report "$f" "$tool violations rose $base_v -> $cur_v vs baseline $base (fix the new ones; never raise the ceiling)"; fi
    if [ -n "$bounded" ]; then
      if [ "$cur_l" -gt "$bounded" ]; then fail=1; report "$f" "$cur_l lines, expected <= $bounded (bounded max_file_lines ceiling; see constraints.yaml)"; fi
    elif [ "$cur_l" -gt "$max_lines" ] && [ "$cur_l" -gt "$base_l" ]; then
      fail=1; report "$f" "grew $base_l -> $cur_l lines while already over $max_lines (move new code into a new module)"
    fi
  fi
done <<EOF2
$(bash scripts/change-scope.sh --status)
EOF2

if [ "$fail" -ne 0 ]; then
  echo "lint-scoped: violations above (ratchet vs baseline $base). See AGENTS.md § Enforcement Index." >&2
  exit 1
fi
echo "lint-scoped: $checked scoped file(s) checked, all conform."
