## Design

Change surface: `scripts/anti-drift.sh`, the vulture step (`:43-49`); `scripts/test-guardrails.sh`, a new numbered section next to the knip one (`:585-616`); `docs/agents/enforcement-baseline.md`, the vulture row if one exists, otherwise a row added next to the knip row (`:16`).

Must preserve:

- vulture is still invoked once, on all scoped Python files together, with `--min-confidence 80`. The same file set matters: cross-file usage resolves findings. On `be6015ce5`, 13 findings appear when `middleware.py` is run alone and 4 when it runs with the full scope.
- Every finding in an A file blocks and is printed with its `path:line: message` text.
- jscpd and knip steps, `--only knip`, the exit codes of the script (0 pass, 1 fail, 2 usage/setup error) and the final pass line are unchanged.
- The M-file line set uses the same computation as knip: `git diff -U0 <base> -- <file>`, where `<base>` is `bash scripts/change-scope.sh --base`, and the `+start,count` ranges of each hunk.
  - Reuse the knip filter's code path or factor it into one shared helper inside `anti-drift.sh`. The knip step must not be copied: jscpd scope and the canonicality rules apply.

Must change:

- vulture exit codes: 0 means no findings, 3 means findings, and anything else (1 invalid input, 2 bad arguments, or a crash) blocks with `anti-drift: vulture failed (exit N)` and its output.
- With exit 3, each output line must match `^(?P<path>[^:]+):(?P<line>\d+): (?P<msg>.+)$`. A line that does not match blocks, with `anti-drift: vulture output unreadable: <line>`. An exit 3 with no parsable finding also blocks.
- A finding whose path is an M file in `change-scope.sh --status`, and whose line is not in that file's fork line set, prints under `anti-drift: vulture findings on upstream lines of modified files (advisory, not blocking):` as `  <path>:<line>: <msg>  advisory (upstream)`. Every other finding blocks and is printed under the existing `anti-drift: vulture reports unused code in scoped Python files` message.

Governing invariant: the gate never passes when vulture did not run to completion, and it never blocks on a finding that sits only on upstream lines of a modified upstream file.

Seams under test: `scripts/anti-drift.sh` run inside the guardrail self-test's temp worktree, with a stand-in `uv` first on `PATH`. The stand-in prints a chosen vulture output and exits with a chosen code when it is invoked as `uv run --quiet vulture …`. Any other invocation exits 99, so an unexpected call is visible. The jscpd step must not be what fails: the cases either reuse the clean tree or stub `npx` the same way the knip cases do, and each case asserts the vulture-specific message.

Required evidence (task 1.1). Each case is an `expect_reject` / `expect_accept` call in `scripts/test-guardrails.sh` and names the message it requires.

- **Red before, green after:**
  - (a) Stand-in exit 3, one finding on an upstream line of an M Python file in scope (pick the file as the knip M case does; fail the fixture loudly if it is not an M file): accepted, and the advisory line is printed. On `main` this rejects.
  - (b) Stand-in exit 2 with an error text: rejected with `vulture failed (exit 2)`. On `main` this rejects, but because "vulture reports unused code", so assert the new message.
  - (c) Stand-in exit 3 with an unparsable line: rejected with `vulture output unreadable`.
  - (d) Stand-in exit 3 and empty output: rejected with `vulture output unreadable`.
- **Rejects before and after:**
  - (e) A real line appended to that M file, with a stand-in finding pointing at the appended line number: rejected, with the finding text printed.
  - (f) Stand-in finding in an A Python file in scope: rejected.
- **Accepts before and after:** (g) stand-in exit 0 with no output: accepted.
- `make test-guardrails` passes, with the new cases counted in the pass total.
- `make anti-drift` passes on this branch.
- Rebasing `claude/issue-769-mention-regex-linear` onto this branch: `make anti-drift` passes there, printing the 4 `middleware.py` findings as advisory.

Non-goals:

- removing upstream's unused imports;
- vulture whitelists or the confidence threshold;
- jscpd;
- changing the knip step's behaviour.

Review focus:

- fail-closed on every vulture outcome other than exit 0 or a fully parsed exit 3;
- the line set is computed from the same base as the change scope;
- no copy of the knip filter;
- the stand-in cannot make a case pass vacuously, because each case asserts its own message.
