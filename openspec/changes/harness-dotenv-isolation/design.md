# Design

## Context

`dev-bg.sh` sources `dev-env.sh` before starting Python. The isolated UI harness also sources it in the backend command, but currently duplicates the disable flag in its explicit environment map. The application's import evaluates `find_dotenv` before `load_dotenv`; disabling the latter prevents content access, not discovery.

## Goals / Non-Goals

- Governing invariant: both backend launchers enter application Python with dotenv content loading disabled regardless of a false/unset parent flag.
- Preserve existing explicit environment values, launcher ownership/readiness/cleanup, normal non-harness imports and the application's dotenv implementation.
- Do not inspect or create any dotenv file, change production authentication/configuration, alter OCU sources, upgrade dependencies or edit AGENTS.
- Short-session signing and Office verifier child policies are separate existing boundaries; do not refactor them into this backend-launcher change.

## Decisions

Use an unconditional export in the existing shared script. Remove only the redundant UI-backend flag/comment; every current use of that environment that imports backend code already sources the shared script. Do not build another environment abstraction or duplicate launcher constants.

Place the behavioral regression under the existing backend pytest discovery tree, with a focused Makefile target following the existing scoped-test convention. The test executes a real shell-sourced application environment import in an isolated subprocess. Substitute only dotenv discovery/stream input with an in-memory sentinel, instrument real parser/stream entry, and preserve a non-harness positive control. No `.env` file is opened or created.

Keep the application import inside the isolated child, never pytest's parent. Both controls receive a private synthetic `WEBUI_SECRET_KEY` and explicit non-secret configuration through a minimal environment; record the supplied variable names without logging the synthetic secret. These are import prerequisites, not assertions or dotenv inputs.

## Risks and Evidence

- Conditional/default export would allow parent false: unset and false cases must both reject sentinel injection and parser/stream entry.
- Testing only a flag would miss library behavior: assert the actual import's observable loader/parser activity and unchanged explicit values.
- A dead oracle could pass every case: the normal non-harness import must parse the in-memory sentinel; retained pre-change harness runs do too.
- Explicit UI mapping could mask missing shared policy: source-policy regression stays independent; actual UI launcher runtime must retain healthy startup after removing its duplicate.
- Required runtime: `make dev-bg`, `make dev-status`, `make smoke`, `make verify-ui-ocu`, then `make dev-stop`, with safe synthetic harness configuration and no orphan processes. Parent false/unset launch cases must be observed without reading dotenv content.
- Verification ownership: parent retains baseline/oracles and runs checks; candidate worker edits only named source/test/Makefile paths. No source-text assertions or mocked backend import.

## Rollback

Revert the focused change. No persisted format or data migration exists. Review checks shared-policy timing, UI caller cutover, real parser evidence, preserved non-harness behavior and cleanup boundaries.
