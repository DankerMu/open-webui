## Context

The code is OCU `openwebui/init.sh` at `origin/main` `3cf704a`. `init.sh` makes about 15 `curl` calls. Three of them carry a secret in a `-d` body. The admin token reaches every authenticated call through `-H "$AUTH"`, where `AUTH="Authorization: Bearer $TOKEN"` (`:111`).

The init wrapper `deploy/production-like-test/init/run-init.sh` copies `init.sh` into a `0700` `ocu-init.*` work directory and runs it in its own process group. When `PRIMARY_CHAT_MODEL` is set, it first inserts a model check that calls `curl … -H "$AUTH"`. On `INT`, `TERM` or `HUP`, the wrapper stops that group, first with `TERM` and then, after 2 s, with `KILL`.

`tests/deploy/test_init_wrapper.py` drives the wrapper against `FakeWebUI` (HTTP on localhost). It already asserts, for `TERM`, `HUP` and `INT` during a held request, that no `ocu-init.*` directory, model tempfile, marker or child process is left.

## Goals / Non-Goals

**Goals:**

- No secret appears in any child argv during init: not the password, not the MCP key, not the token.
- A secret file is private: mode `0600` in a `0700` directory. It is removed on success, on failure and on a catchable signal.
- Behaviour is otherwise unchanged. The requests and decoded bodies the API receives, the marker rules, the retry rules and `run-init.sh` all stay the same.

**Non-Goals:**

- Environment visibility through `docker inspect` or `/proc/<pid>/environ`. Only the same uid and root can read `environ`.
- `/proc` mount options.
- Other OCU scripts and `deploy/eval/secrets.sh`.
- Non-secret bodies (function and tool source, config) that stay in argv.

## Decisions

1. **Bodies on stdin from an environment-reading `python3`.**
   - Each of signin, signup and tool valves becomes `VAR="$VAR" … python3 -c '<static code>' | curl -sf … -H "Content-Type: application/json" --data-binary @- …`.
   - The static code writes `json.dumps({...})` with no trailing newline. A `VAR=value cmd` prefix sets the child's environment, not its argv.
   - Nothing is buffered in a file, and the encoder fixes the old interpolation bug for `"` and `\`.
   - Alternative rejected: body files. That means more lifecycle code, and stdin is free in these three calls.
2. **The header from a private file, with `AUTH` naming it.**
   - After the token is known, `init.sh` writes `Authorization: Bearer <token>` with the `printf` builtin, inside `(umask 077; …)`, to `$AUTH_DIR/auth`. It then sets `AUTH="@$AUTH_DIR/auth"`.
   - Every existing `-H "$AUTH"` stays textually the same and now passes a file reference. That includes run-init.sh's injected check, so `run-init.sh` needs no change.
   - curl has supported `-H @file` since 7.55. The Open WebUI image (`ocu-open-webui:8beb9283…`) ships curl 7.88.1.
   - Alternative rejected: `curl -K -`. stdin is already taken by the body in the valve call, and a config file would need its own quoting.
3. **The directory is owned by `init.sh`.**
   - `AUTH_DIR=$(mktemp -d "${TMPDIR:-/tmp}/ocu-init-auth.XXXXXX")` is created after the marker gate and before signin. `mktemp -d` makes it `0700`.
   - Just before creating it, with `AUTH_DIR=""`, `init.sh` installs:
     - `trap '[ -n "${AUTH_DIR:-}" ] && rm -rf "$AUTH_DIR"' EXIT`;
     - `trap 'exit 130' INT`, `trap 'exit 143' TERM` and `trap 'exit 129' HUP`.

     The exit inside each signal trap runs the `EXIT` trap. Bash usually runs the `EXIT` trap on an untrapped fatal signal too, but not always (bash 5.3 left the directory once in eight `HUP`s inside a command substitution); the signal traps make cleanup deterministic and give a direct run the exit codes 130/143/129.

   - Run by hand, `init.sh` still cleans up after itself. Under the wrapper, the `TERM` that the wrapper sends to the group runs the same trap.
   - The name prefix `ocu-init-auth.` does not match the wrapper's `ocu-init.*` glob, so the existing leftover checks keep their meaning. The tests gain a separate check.

4. **Accepted windows.**
   - A `KILL`, which the wrapper sends 2 s after `TERM` if the group is still alive, leaves the directory behind. It sits under `TMPDIR`, readable only by its owner.
   - The token lives in the shell's memory, as it does today.

## Risks / Trade-offs

- **Signal timing.** A `TERM` arriving while `curl` runs: bash runs the trap once the foreground `curl` returns. The group-wide `TERM` also ends that `curl`, so this is immediate. The existing default-hold signal tests hold `GET /api/version`, before the directory exists; the post-token held-request tests and the direct-run test (tasks.md) cover it.
- **JSON encoding change.** A password or MCP key containing `"` or `\` used to produce invalid JSON, which made init fail. It now works. No valid value changes its decoded body.

## Sketch seams under test

- **The argv recorder.** The test puts a `curl` shim first on `PATH`. The shim appends `$#` then `"$@"`, each NUL-terminated, to a log, then `exec`s the real `curl`, which it resolves before the shim is installed. That is the oracle for "no secret in argv".
- **`FakeWebUI` bodies, calls and `Authorization` headers.** These are the oracle for unchanged behaviour.
- **The held request.** It is the observation point for the auth directory's mode and content.

## Not yet specified

Nothing.
