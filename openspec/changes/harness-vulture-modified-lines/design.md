## Design

Change surface:

- `scripts/anti-drift.sh`:
  - the vulture step (`:43-49`);
  - the knip step's scope and line-set preamble (`:51-98`);
  - argument parsing (`:7-22`).
- `scripts/test-guardrails.sh`:
  - a new accept helper;
  - a new numbered section after the knip one (`:585-616`).
- `docs/agents/enforcement-baseline.md`: a vulture row next to the knip row (`:16`), and its blind spot.

Must preserve:

- vulture is still invoked once, as `uv run --quiet vulture <all scoped py files> --min-confidence 80`. The same file set matters: cross-file usage resolves findings. On `be6015ce5` there are 13 findings when `middleware.py` runs alone and 4 when it runs with the full scope.
- Every finding in an A file blocks. A renamed file is mapped to `A` by `change-scope.sh:43`, so it blocks on every finding too; this is fail-closed and intended.
- The jscpd and knip steps keep their findings, messages and verdicts.
- `--only knip` still runs only knip.
- The script's exit codes are unchanged (0 pass, 1 fail, 2 usage/setup error), and so is the final pass line.

Must change:

- **Arguments.** `--only` accepts `knip` or `vulture`; any other value still exits 2.
  - `--only vulture` runs only the vulture step.
  - The knip block is gated on `$only` too, so `--only vulture` skips it.
  - The usage text (`:7-12`) names both values.
- **One shared preamble.**
  - Before either step, compute once:
    - a single temp dir with one `trap … EXIT`;
    - `base` (`change-scope.sh --base`);
    - the `--status` scope file for each extension set.
  - The `fork_lines(file)` logic (`git diff --no-color --no-ext-diff -U0 <base> -- <file>`, the `+start[,count]` hunk ranges) lives in one bash variable holding the Python preamble. The knip filter and the vulture filter both run it through `python3 -c "$preamble…"`.
  - There is no second copy. jscpd does not scan `.sh`, so review enforces this.
- **vulture outcome.** stdout and stderr are captured separately.
  - Exit 0 with empty stdout passes the step.
  - Exit 3 means findings; every other code blocks with `anti-drift: vulture failed (exit N)` plus both streams.
  - With exit 3, every stdout line must match `^(?P<path>[^:]+):(?P<line>\d+): (?P<msg>.+) \((?P<conf>\d+)% confidence(?:, \d+ lines?)?\)$`. A non-matching line blocks with `anti-drift: vulture output unreadable: <line>`. Exit 3 with no stdout line also blocks with that message.
  - vulture overwrites an InvalidInput exit with 3 whenever it also prints a finding (`vulture/core.py:349-365`). So stderr blocks, under either exit code, when any of its lines:
    - matches `^<scoped path>:\d+: ` without a confidence suffix; or
    - contains `invalid source code` or `Could not read file`.

    Then the message is `anti-drift: vulture failed (input error)` plus stderr. Other stderr lines, such as Python's `SyntaxWarning` for upstream escapes, are printed and do not block.

- **Line of a finding.**
  - For `unused import 'NAME'` reported at line L, the filter parses the file with `ast`. It finds the `Import`/`ImportFrom` node whose `lineno` is L and the alias whose `asname or name` equals NAME, and uses that alias's own `lineno`. vulture reports a parenthesised multi-line import at the statement's first line (`vulture/core.py:405-420`; `middleware.py:104` is `from open_webui.utils.misc import (` while `extract_urls` sits on `:108`).
  - If no such alias is found, the finding blocks.
  - Every other finding uses its reported line.
- **Classification.**
  - A finding blocks when either holds:
    - its path is not an `M` entry of the Python scope;
    - its resolved line is in that file's fork line set.
  - A blocking finding prints under `anti-drift: vulture reports unused code in scoped Python files`, in vulture's own `path:line: msg (NN% confidence)` text.
  - Every other finding prints under `anti-drift: vulture findings on upstream lines of modified files (advisory, not blocking):` as `  <path>:<line>: <msg>  advisory (upstream)`.
  - Each finding is classified on its own, so one run can print both groups.

Governing invariant: the gate never passes unless vulture ran to completion, every finding it printed was parsed, and each finding was attributed to a line. It never blocks on a finding attributed only to upstream lines of a modified upstream file.

Seams under test:

- `bash scripts/anti-drift.sh --only vulture`, run in the guardrail self-test's temp worktree `$wt`, with a stand-in `uv` first on `PATH`.
- When invoked as `uv run --quiet vulture …`, the stand-in prints the case's stdout and stderr and exits with its code. Any other invocation exits 99.
- A new helper `expect_accept_with NAME REQUIRED_TEXT CMD…` captures the combined output. It passes only on exit 0 when the output contains REQUIRED_TEXT, and otherwise prints the output and fails.

Required evidence (task 1.1). Each case is an `expect_reject` or `expect_accept_with` call that names the text it requires. The M file is `backend/open_webui/main.py`; first assert that it is an `M` entry in `change-scope.sh --status --ext py`, and fail loudly if it is not, as the knip M case does. The A file is `backend/conftest.py`, asserted to be `A` the same way. The upstream line used in the advisory cases is checked with `git diff -U0 <base> -- backend/open_webui/main.py` to be outside the fork line set, failing loudly otherwise.

- **Red on `main`, green after:**
  - (a) Exit 3, one finding on an upstream line of the M file. Expect accept with `backend/open_webui/main.py:<L>: unused import 'x' (90% confidence)  advisory (upstream)`.
  - (b) Exit 2 with stderr `usage error`. Expect reject with `vulture failed (exit 2)`.
  - (c) Exit 3, stdout `garbage`. Expect reject with `vulture output unreadable: garbage`.
  - (d) Exit 3, empty stdout. Expect reject with `vulture output unreadable`.
  - (i) Exit 3, stdout one valid upstream-line finding, stderr `backend/open_webui/main.py:3: invalid syntax at "x"`. Expect reject with `vulture failed (input error)`.
  - (j) Exit 3, stdout one upstream-line finding in the M file plus one finding in the A file. Expect reject. The A finding appears under the blocking header; the M finding carries `advisory (upstream)`. Assert both strings.
- **Reject before and after:**
  - (e) Append the real line `import json as fork_probe_json` to the M file. The stand-in reports `unused import 'fork_probe_json'` at that appended line number. Expect reject with that finding text.
  - (f) A finding in the A file. Expect reject.
  - (h) Inside an existing parenthesised multi-line upstream import of the M file, insert the new line `    sep,`, with `sep` a name that the module does not import yet. The stand-in reports `unused import 'sep'` at the statement's first line, which is an upstream line. Expect reject with the finding text naming `sep`. It rejects on `main` as well. Its purpose is to be red against a filter that only checks reported lines, which would accept it.
- **Accept before and after:** (g) exit 0, empty output. Expect accept with `--- dead code (vulture`, which proves the step ran.
- Restore the M file after each case that edits it, as the knip case does.
- `make test-guardrails` passes, and its total includes the new cases.
- `make anti-drift` passes on this branch.
- On `claude/issue-769-mention-regex-linear` rebased onto this branch, `make anti-drift` passes and prints the 4 `middleware.py` findings as advisory.

Non-goals: removing upstream's unused imports; vulture whitelists or the confidence threshold; jscpd; changing knip's findings or verdicts.

Blind spot, to be stated in `docs/agents/enforcement-baseline.md`: a fork change that deletes the last use of an upstream name leaves a finding on an upstream line, so it stays advisory. knip has the same limitation.

Review focus:

- the gate fails closed on every vulture outcome other than exit 0, or exit 3 with stdout fully parsed and stderr free of input errors;
- the alias-line remap of import findings;
- the line set is computed from the same base as the change scope;
- there is exactly one copy of the line-set code;
- each accept case asserts its required text.
