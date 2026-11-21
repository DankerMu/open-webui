## 1. Keep credentials out of curl argv (OCU)

- [x] 1.1 In `openwebui/init.sh`, build the signin, signup and tool-valve bodies from the environment and pipe them to `curl --data-binary @-`. Write the admin token's header to a private `ocu-init-auth.*/auth` file named by `AUTH`, and remove that directory on every exit. `deploy/production-like-test/init/run-init.sh` stays byte-identical. Verify with the cases below and the OCU unit command.

- Done in OCU #259 (2026-11-20, merged `aa8a6ee`); review round 1 clean. Deviations: the fake API's token literal became the constant `FAKE_TOKEN`; the signin-path test also asserts that signup was not called. Docs drift found in review went to (#886).

Suggested fixture level: expanded - credentials on a shared host, every deployment's first boot, and new trap and file lifecycle code.
Minimal mergeable slice: atomic - the three bodies, the header file and its cleanup protect the same secrets and are tested together.

- Task 1.1 required evidence (2026-11-20, issue #855):
  - Triage: bugfix. Fixture level expanded.
  - **Risk packs:**
    - **Auth / secrets**, selected: the password, the MCP key and the session token.
    - **Subprocess**, selected: every child argv is checked.
    - **File IO**, selected: the token file, its mode and its removal.
    - **Error handling**, selected: the `EXIT` and signal traps.
    - **Legacy compatibility**, selected: requests, decoded bodies, marker and retry rules, and `run-init.sh` are unchanged.
    - Not selected: Public API, Config, Schema, Concurrency, Resource limits, Release, Documentation.
  - **Shape** (see design.md Decisions 1–3):
    - **Signin** sends `{"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}` from a `python3` that reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from its environment, prefixed as `ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD"`.
    - **Signup** adds `"name": ADMIN_NAME`.
    - **Tool valves** send `{"ORCHESTRATOR_URL": …, "MCP_API_KEY": …, "DEBUG_LOGGING": false}`, with the values from the environment.
    - **Encoding.** All three use `json.dumps` and `--data-binary @-`, keep `-H "Content-Type: application/json"` and keep their `-sf` flags and redirections.
    - **The auth directory.**
      - Immediately before signin, `init.sh` sets `AUTH_DIR=""`, installs the four traps from Decision 3 (the `EXIT` trap guarded as `[ -n "${AUTH_DIR:-}" ] && rm -rf "$AUTH_DIR"`), then runs `AUTH_DIR=$(mktemp -d "${TMPDIR:-/tmp}/ocu-init-auth.XXXXXX")`, so only the instant between `mktemp` creating the directory and the assignment is unguarded.
      - Once `TOKEN` is set, it runs `(umask 077; printf 'Authorization: Bearer %s\n' "$TOKEN" > "$AUTH_DIR/auth")` and sets `AUTH="@$AUTH_DIR/auth"`.
      - Every `-H "$AUTH"` line stays as it is.
    - **A comment** above the auth directory names #855 and the `-H @file` minimum of curl 7.55.
  - **Required evidence** in `tests/deploy/test_init_wrapper.py` (unittest). Red on `origin/main`, green after: the argv checks (no secret or token in any argument, the `@…/auth` argument), the post-token held-request check (exactly one `ocu-init-auth.*` directory, its modes and content), the direct-run return codes, and the JSON-metacharacter body. Pass before and after (behaviour that must not change): `assert_required_setup()`, the exact signin and signup bodies, the recorded `Authorization` headers, the record count matching `FakeWebUI.calls`, and the no-leftover cleanup checks, which hold vacuously on `origin/main` because no directory is created there:
    - **The argv shim.** A helper installs a `curl` shim directory first on `PATH` in `wrapper_env`. The shim's `exec` target is the real `curl`, found with `shutil.which` before the shim is installed. The shim is a `#!/bin/bash` script that appends one record per call, `printf '%s\0' "$#" "$@"` (the argument count, then each argument, NUL-terminated), to `$OCU_TEST_CURL_LOG`, then runs `exec <real curl> "$@"`. A newline separator would be ambiguous: the access-grant body (`init.sh:229-232`) is an argument with raw newlines.
    - **Signup path.** The test runs with `ADMIN_PASSWORD` = `SENTINEL`, `MCP_API_KEY` = `synthetic-mcp` (the `wrapper_env` value, which no shipped source contains, so `assert_required_setup` keeps its tool-valve assertion) and `PRIMARY_CHAT_MODEL` set, against an API with no admin. `FakeWebUI` gains a mode `signup-success`, which behaves like `success` except that signin answers 401 and signup answers 200 with `{"token": "admin-token"}`.
      - The run exits 0 and the marker is written.
      - The log has exactly as many records as `FakeWebUI.calls` has entries, so no request bypassed the shim. One of them has a URL ending in `/api/models`; that is the injected check.
      - At least one record has an argument starting with `@` and ending in `/auth`.
      - No argument contains `SENTINEL`, `synthetic-mcp` or the fake's token `admin-token`.
      - `assert_required_setup()` passes. The signin body is exactly `{"email": "admin@example.test", "password": SENTINEL}`; on the signup path the signup body is exactly `{"email": "admin@example.test", "password": SENTINEL, "name": "Test Admin"}`.
      - `FakeWebUI` records each request's `Authorization` header next to its call. `GET /api/version`, `POST /api/v1/auths/signin` and `POST /api/v1/auths/signup` carry none; every other recorded call, including `GET /api/models`, carries exactly `Bearer admin-token`.
    - **Signin path.** The same, in the existing `success` mode, where signin succeeds.
    - **Held request.** `_signal_during_held_http` gains the auth-directory check. With `hold_request=""` (held at `GET /api/version`, before signin) no `ocu-init-auth.*` directory exists under `TMPDIR`. With a hold after the token, `hold_request="GET /api/v1/tools/id/ai_computer_use"` (the first authenticated call, `init.sh:199`) or `"GET /api/models"`, exactly one exists. It has mode `0700`. Its only entry is `auth`, with mode `0600` and content `Authorization: Bearer admin-token\n`. The wrapper is started with `umask=0o022`, so the mode check does not depend on the runner's umask.
    - **Cleanup.** No `ocu-init-auth.*` directory remains after:
      - success;
      - the auth-failure test;
      - the config-post-failure test;
      - each of `TERM`, `HUP` and `INT` sent to the wrapper while `GET /api/v1/tools/id/ai_computer_use` is held: three new tests calling `_signal_during_held_http(sig, hold_request="GET /api/v1/tools/id/ai_computer_use")`. The helper asserts that no `ocu-init-auth.*` directory remains, so the existing default-hold tests and `test_term_during_held_model_lookup_leaves_no_lookup_tempfile` carry the assertion too.
    - **Direct run.** A test runs `bash <self.source>/init.sh` directly (no wrapper) with the `wrapper_env` values and `start_new_session=True`, holds `GET /api/v1/tools/id/ai_computer_use`, and sends `TERM`, `INT` and `HUP` to the process group with `os.killpg`. The return codes are `143`, `130` and `129`; no `ocu-init-auth.*` directory and no marker remain. Without the signal traps bash dies of the signal (`-15`, `-2`, `-1`) and usually still runs the `EXIT` trap, so the leftover check alone cannot prove the signal traps.
    - **JSON metacharacters.** In `signup-success` mode, an `ADMIN_PASSWORD` of `pa"ss\word-9f3c` reaches the fake's signup body as exactly that string.
    - **Unchanged.** Every existing test in the module stays green, with `run-init.sh` byte-identical: `git diff --quiet origin/main -- deploy/production-like-test/init/run-init.sh`.
    - **Mutations**, each red, recorded in the PR and reverted:

      | Mutation                                                    | Test that goes red                                                        |
      | ----------------------------------------------------------- | ------------------------------------------------------------------------- |
      | signin back to `-d "{…$ADMIN_PASSWORD…}"`                   | signin path                                                               |
      | `AUTH="Authorization: Bearer $TOKEN"`                       | both paths, on the token                                                  |
      | tool valves back to `-d`                                    | signup path, on the MCP key                                               |
      | no `EXIT` trap                                              | cleanup after success, auth failure and the post-token held-request tests |
      | no `TERM` trap                                              | direct-run `TERM` (return code `-15`, not `143`)                          |
      | auth file written as `Bearer %s`, without `Authorization: ` | both paths, on the recorded header                                        |
      | `umask 077` dropped                                         | held-request mode check                                                   |

  - **Image check.** The Open WebUI image's `curl --version` is at least 7.55. Run it with `docker run --rm --platform linux/amd64 --entrypoint curl <ocu-open-webui image> --version` and record the line in the PR.
  - **The OCU unit command**, from OCU `AGENTS.md`, passes on a clean clone: `uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest tests/ -q --import-mode=importlib --ignore=tests/integration` (OCU `AGENTS.md:35`; `-rs -p no:cacheprovider` may be added).
  - **Must preserve.** Every file stays as it is except `openwebui/init.sh` and `tests/deploy/test_init_wrapper.py`. In the test file, the existing tests change only by the new leftover assertion and the `PATH` shim in `wrapper_env`. In particular, `deploy/production-like-test/init/run-init.sh`, the compose files, `deploy/eval/` and the tool and filter sources are unchanged. `init.sh`'s `DEFAULT_MODELS` line and marker section, the two anchors `run-init.sh` edits, stay verbatim. The comment at `deploy/eval/secrets.sh:5-6` that justifies its alphanumeric secrets by `init.sh`'s shell-built JSON no longer holds; the PR names this and it is filed as a follow-up, not changed here. There are no dependency changes.
  - **Non-goals:** `docker inspect` and `/proc/<pid>/environ` visibility, `/proc` mount options, non-secret bodies in argv, other scripts, and `deploy/eval/secrets.sh`'s character set.
