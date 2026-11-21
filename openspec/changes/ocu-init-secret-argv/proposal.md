## Why

OCU's `openwebui/init.sh` puts three secrets on `curl`'s command line (#855). `ADMIN_PASSWORD` goes into the signin and signup bodies (`-d`, `:89-91`, `:98-100`). `MCP_API_KEY` goes into the tool-valve body (`:216-218`). The admin session token goes into the `Authorization` header (`-H "$AUTH"`, set at `:111`) of every later call. The model check that `deploy/production-like-test/init/run-init.sh:111-124` injects into it does the same.

A container process is an ordinary host process. While each `curl` runs, any host account can read its argv through `/proc/<pid>/cmdline` or `ps`, unless `/proc` is mounted with `hidepid`. On the shared `ocu-eval` host (DankerMu/open-computer-use#235), another account polling the process list during first boot can read the Open WebUI admin password, the MCP API key and an admin token. The window is short: init only runs on first boot or after a failed init. The `-d` signin, signup and valve calls date from OCU's initial release `e5d2908`.

## What Changes

- **Bodies.** The signin, signup and tool-valve bodies are built by a `python3` that reads the values from its environment. The JSON goes to `curl --data-binary @-` on stdin, so no secret is in any argv. This also JSON-encodes the values correctly; before, quotes and backslashes broke the JSON.
- **Header.** The admin token is written to a `0600` file, `auth`, in a `0700` directory made by `mktemp -d "${TMPDIR:-/tmp}/ocu-init-auth.XXXXXX"`. `AUTH` becomes `@<that file>`, so every existing `-H "$AUTH"`, including run-init.sh's injected check, reads the header from the file. curl has supported `-H @file` since 7.55; the Open WebUI image ships curl 7.88.1.
- **Cleanup.** `init.sh` removes the directory on every exit, through an `EXIT` trap. `INT`, `TERM` and `HUP` exit with 130, 143 and 129, which runs that trap.
- **Unchanged.** `run-init.sh` stays byte-identical. Every request's method, URL, headers and decoded body stay the same, and so do the marker and retry rules.

## Triage

```text
Issue type: bugfix (credential exposure on a shared host)
Fixture level: expanded
Upstream suggested level: absent (follow-up issue); size M
Blast radius: every first-boot init of every OCU deployment that runs init.sh (production-like test, ocu-eval, by hand); a wrong change can fail init, lose the admin login, or leave a token file behind
Selected risk packs: Auth / secrets; Subprocess; File IO; Error handling; Legacy compatibility
Evidence floor: a curl argv shim test red before and green after; init wrapper tests green; OCU unit command passes
```

Repository: `DankerMu/open-computer-use`. Like every `[ocu]` issue, this fixture lives in the WebUI control plane.
