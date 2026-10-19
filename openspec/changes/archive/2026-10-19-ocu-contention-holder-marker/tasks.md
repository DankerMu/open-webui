## 1. Fixture

- [x] 1.1 Standard fixture, read-only fixture review and strict validation before implementation.

## 2. Implement (in open-computer-use)

- [x] 2.1 Move only. Extract the holder source to a module-level `_PROCESS_HOLDER`, prefixed with `_MARKER_WRITER`, keeping the old `write_text` line, and make the owner test use it. The owner and startup tests stay green.
- [x] 2.2 Add the behavioral regression. Generalize `_HELD_IO` with the argv[1] path filter, which also passes non-path opens. Run the real `_PROCESS_HOLDER` with `ENTERED` in its own subdirectory. Assert in order: the final marker is absent while held; one empty `0600` stage; create `RELEASE`, then release; exit 0 with exact `held`, and no stage remains. Capture red: the failing assertion must be the not-exists check.
- [x] 2.3 Replace the holder's `write_text` line with `_publish_marker(Path(os.environ["ENTERED"]), "held")`. The regression turns green.
- [x] 2.4 Update the `tests/README.md` marker-protocol paragraph to include this contention marker.

## 3. Verify

- [x] 3.1 Run the regression (red then green), the contention, startup, crash-marker and store modules, the full `tests/orchestrator/` suite on Darwin, `./tests/test-project-structure.sh` and the commit hooks.

## Risk packs

Selected:

- Concurrency: the regression proves the readiness ordering (no final path before complete text). The startup oracle (`caught is injected` and the cleanup assertions) stays unchanged and green.
- File IO / path safety: the stage is a fixture-owned `0600` sibling, no stage remains after success, and the hold filter cannot touch lock-file opens.

Not selected:

- Production behavior, schema, dependencies, release/packaging, secrets: none of these change.
- Linux requalification: a non-goal (see design.md).
