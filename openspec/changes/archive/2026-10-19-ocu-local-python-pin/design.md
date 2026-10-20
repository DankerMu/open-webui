## Context

These paths are in the sibling `open-computer-use` checkout, at `origin/main` `56804d9`.

- **The documented command:** `AGENTS.md:35-36` (unit and integration variants), plus four `uv run --no-project` blocks in `tests/README.md` (`:24`, `:65`, `:146`, `:210`). None of them pins an interpreter.
- **CI:** `.github/workflows/build.yml:236-238` uses `actions/setup-python` with `python-version: '3.13'`. The deployed image is `python:3.12-slim` (`computer-use-server/Dockerfile:4`).
- **Failing oracle:** `tests/orchestrator/test_mcp_discovery.py:517`.
- **Production path:** the `asyncio.shield` at `computer-use-server/mcp_resources.py:161`. It is left untouched.

## Decisions

- **Use a repo-root `.python-version` containing `3.13`.** This is the issue's recommended pin, in the file form. Editing `AGENTS.md` instead was rejected for three reasons:
  - One file covers every documented `uv run --no-project` command without an explicit `--python`, in both `AGENTS.md` and `tests/README.md`, without editing six command lines.
  - It keeps the governance file unchanged. `AGENTS.md`'s baseline claim becomes true for the command exactly as written.
  - A future command added to the docs inherits the pin automatically.
- **Pin the minor version only** (`3.13`), not a patch, so that any discovered or uv-managed 3.13 qualifies. CI also pins only the minor.
- **Probe results (uv 0.9.18).** `uv run --no-project` honors the file from the root and from subdirectories, also with `--with` / `--with-requirements`. `uvx` / `uv tool run` ignore it, so `uvx pre-commit` is unaffected. An explicit `--python` or `UV_PYTHON` overrides it.
- **The file carries no inline comment.** `.python-version` readers differ on comment support. The rationale goes in `tests/README.md` instead: the pin matches CI and avoids the CPython 3.14.0–3.14.8 shield-logging regression (gh-134331, fixed by gh-156321).
- **Rejected alternatives:**
  - Replacing `asyncio.shield` in production. It works around an interpreter regression that upstream already fixed and that the deployed 3.12 image never reaches.
  - Adding `skipif`, version sniffing or message filtering to the test. The issue's acceptance criteria forbid these.
  - A CI-vs-pin drift test. Its value is low next to its brittleness, because it would have to parse workflow YAML. The README sentence names CI as the source of the version.

Must preserve:

- `assert errors == []` and the rest of `test_mcp_discovery.py`.
- `mcp_resources.py`.
- The CI workflow.
- The Dockerfile.
- `AGENTS.md`.
- Dependencies.
- The existing commit hooks, which must keep working with the pin present (run through `uvx pre-commit`).

Governing invariant: from the OCU checkout, the documented `uv run --no-project …` command runs on CPython 3.13.x.

## Seams and Evidence

The command, run from the OCU root:

```
env -u ALL_PROXY -u HTTPS_PROXY -u HTTP_PROXY -u all_proxy -u https_proxy -u http_proxy \
  uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest …
```

- **Clean checkout.** Run red and green in `git archive <ref> | tar -x` exports under the session scratchpad, not in the working tree, which has untracked `.run/`, `data/` and caches. Red uses `origin/main`. Green uses the committed branch head, which the orchestrator produces after committing. Record `ls -a` showing `.python-version` (green) or its absence (red).
- **Red, before adding the file:** `uv run --no-project … -- python --version` shows 3.14.x, and `tests/orchestrator/test_mcp_discovery.py -q --import-mode=importlib` shows 3 failed, 52 passed.
- **Green, after adding the file:**
  - The same `-- python --version` shows 3.13.x.
  - The same pytest run, without `-q` so the header shows `Python 3.13.x`, gives 55 passed.
- **Baseline (AC4):** the full documented unit command (`tests/ --import-mode=importlib --ignore=tests/integration`, without `-q` so the header names the interpreter) exits 0 with 0 failed under the pin. Record the pass and skip counts. Any failure, even one unrelated to the pin, means the baseline claim is unmet: stop, report it and file it separately. Do not claim completion.
- Run `./tests/test-project-structure.sh`.
- The commit hooks (`pre-commit`, `commit-msg`) pass with the file present.

Non-goals: production `asyncio.shield` usage; the CI interpreter; the image Python; other `asyncio.shield` call sites; a patch-level pin.

Review focus:

- Does uv actually select 3.13 for the documented command from the root?
- Does any tool read `.python-version` and change behavior unintentionally? The fixture review found none (Dockerfile contexts, CI `setup-python` with explicit versions, `uvx pre-commit`, `tests/test-project-structure.sh`); recheck against the diff.
- Residual risk: pyenv, asdf or mise shims also read `.python-version` and would route bare `python3` inside the checkout to 3.13, failing loudly where 3.13 is not installed. None is installed here.
- Is the README rationale accurate?
