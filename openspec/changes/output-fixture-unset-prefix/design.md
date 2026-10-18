# Design

## Context and Decision

The output fixture snapshots its environment and selected module objects, applies a copied environment, imports an isolated app and restores those snapshots in `finally`. The copied environment deliberately omits `OCU_PUBLIC_PREFIX` for `None`, but `os.environ.update` cannot remove the inherited live key. The sibling preview fixture already performs a targeted live pop for that input.

Add only the same targeted pop after the output fixture's environment update and before module eviction/app import. Keep explicit `""` as an explicitly configured root value, explicit `/ocu` as prefixed mode, and the default `/ocu` behavior. Do not replace the entire setup environment, create a new helper, alter module ownership lists or change the sibling preview fixture.

## Observable Proof

Start with an inherited `/ocu` and `prefix=None`. The first permanent regression uses the actual output fixture and FastAPI client to fetch real root static content and reconcile a seeded output. Assert generated API/file URLs use the root, and the returned file URL resolves to the seeded bytes through the matching gateway-prefix convention. Parent captures semantic RED before repair; a helper-field-only assertion is insufficient.

After the first GREEN, cover `None`, explicit empty string, explicit `/ocu` and the unchanged default, including an invalid inherited prefix that `None` must remove before import. Distinguish absence from explicit empty during the fixture lifetime. For normal and intentional-assertion exits, capture the full original environment and every selected pre-existing module object, then assert identical environment contents and selected module key/object identity after exit. Use real previously imported modules as the restoration canary, not a fake app response. Close each real client before fixture restoration. The original intentional exception remains visible.

Parent independently executes the same public static/output/file paths and restoration matrix with private data roots and absent Docker endpoints. Use canonical `tests/` discovery with `--import-mode=importlib --ignore=tests/integration` and a module-name `-k` selection covering `test_outputs_endpoint.py`, `test_preview_prefix.py`, `test_office_router.py`, `test_office_publish_recovery.py` and the unchanged explicit-empty-prefix security consumer `test_path_traversal_app.py`, plus the new regression module if separate. Record exact selected/executed nodes and skips; avoid mixed explicit-path collection. Existing security/recovery assertions are never removed or mocked to pass.

## Risks and Non-Goals

This is a latent fixture contract, not a production failure or currently failing consumer claim. Environment and module mutation are process-global; execute verification serially inside isolated child processes, not concurrently with another app-import fixture. Existing helper teardown mutates some restored Docker-manager internals; this issue promises the existing selected module object identities and environment restoration, not a new deep-object-state guarantee. No security fixture graph repair, production routing/parsing, real Docker/LAN access or whole-suite certification.

After runtime proof, update existing OCU test guidance/changelog and the canonical fixture documentation without a redundant decision record. Roll back the narrow test-helper pop and paired regression together; no runtime migration.
