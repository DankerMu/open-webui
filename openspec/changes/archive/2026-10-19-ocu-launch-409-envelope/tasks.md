## 1. Fixture

- [x] 1.1 Expanded fixture, read-only fixture review and strict validation before implementation.

## 2. Implement

- [x] 2.1 Move the stub transport helpers into `ocu_harness.py`; client tests first (red) per design Seams: marked nested positive (only `reason` kept, no log leak); flat and other marked negative 409 bodies → `OcuUpstreamError(409)` with no marker leak; describe/refresh nested 409 still upstream errors.
- [x] 2.2 Route test first (red): real `OcuClient` over the harness stub session returning the envelope → 409 `{"reason": "never_created"}` and exactly one bearer POST to `/internal/launch/{chat.id}`; unrelated nested 409 → 502.
- [x] 2.3 `OcuClient._request`: recognize only `detail.reason == "never_created"` in a dict `detail`.
- [x] 2.4 `scripts/smoke-stub.sh` check first (red), then `scripts/ocu-stub.py` `_launch` returns the envelope.
- [x] 2.5 Decision `2026-09-27-ocu-consumer-failures.md`: name the nested location in the Decision sentence (allowed by `docs/decisions/README.md` rule 6: stale facts updated in place, decision unchanged).

## 3. Verify

- [x] 3.1 Targeted pytest (red before 2.3, green after), `make lint-scoped`, `make coverage-gate`, `make dev-bg` + `make smoke` + `make dev-stop`, `make smoke-stub`, `make decisions-verify`, `make doc-gate`.

## Risk packs

Selected:

- Public API / CLI / script entry: 2.2 route end-to-end outcome (409 vs 502).
- Schema / columns / units / field names: 2.1 exact nested field location and value.
- Error handling / rollback / partial outputs: 2.1 negatives stay `OcuUpstreamError`.
- Auth / permissions / secrets: 2.1 marker in positive and negative bodies never reaches the result, error or logs; route gates unchanged and precede the client.
- Legacy compatibility / examples: flat shape intentionally rejected (real OCU history evidence in design); repository stub moved to the envelope (2.4); describe/refresh unchanged.
- Documentation / migration notes: 2.5 decision sentence; MODIFIED `ocu-client` and `ocu-stub` requirements.

Not selected:

- File IO, concurrency, resource limits, config, release/packaging.
