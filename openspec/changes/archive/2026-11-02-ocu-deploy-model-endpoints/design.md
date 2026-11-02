Change surface: `compose.webui.override.yml` environment of `open-webui`; `bootstrap-test.sh` inputs and `runtime.env` output; `deploy/recovery.py` `PROVIDER_KEYS`; `deploy/recovery_resources.py` `_require_provider_precedence`; `tests/deploy/interpolation.py`; operator docs.

Must preserve:

- An existing `runtime.env` and provider file without the new names resolves byte-identically to today: embedding URL and key equal `DMXAPI_*`, reranker URL equals `${DMXAPI_BASE_URL}/rerank`.
- Chat keeps `OPENAI_API_BASE_URL` and `OPENAI_API_KEY` from `DMXAPI_*`.
- `DMX_ENV_FILE`, its 0600 check and its required `DMXAPI_API_KEY` stay as they are.
- `tests/deploy/test_overlay_structure.py` keeps proving no model id or provider host appears in the overlay. Its helper-based checks at :298 and :363 depend on `interpolation.py`, and the literal assertion at :362 changes to the new expressions.

Must add/change:

- Compose interpolation `${RAG_OPENAI_API_BASE_URL:-${DMXAPI_BASE_URL}}`, `${RAG_OPENAI_API_KEY:-${DMXAPI_API_KEY}}`, `${RAG_EXTERNAL_RERANKER_URL:-${DMXAPI_BASE_URL}/rerank}`, `${RAG_EXTERNAL_RERANKER_API_KEY:-${DMXAPI_API_KEY}}`. The `:-` form covers the empty line bootstrap writes.
- Two bootstrap inputs with the same read, check and write pattern as `DMXAPI_BASE_URL`.
- `tests/deploy/interpolation.py` resolves nested defaults. It silently misparses them today, and `tests/deploy/fakebin/docker:254,303` use it.
- `_require_provider_precedence` inspects every provider key and reports once.

Governing invariant: on a first boot with an empty database, each of chat, embedding and reranking reaches exactly the endpoint and key the operator gave it, and an operator who gave only `DMXAPI_*` sees no change. On any later boot the database holds these values (`main.py:363` seeds every default through `seed_defaults`), and the environment does not replace them.

Sibling surfaces:

- `deploy/recovery.py` `collect_secrets`, `redact_secrets`: no callers, so they protect nothing. The contract is that recovery prints no key, proved on real paths. `PROVIDER_KEYS` decides what `activation_env` copies.
- `deploy/recovery_resources.py` `_require_provider_precedence`: changed, see above. `:1666` prints subprocess errors as they are, so a failing `up.sh` is a path to prove.
- `tests/deploy/fakebin/docker:254,303`: consumers of the interpolation helper.
- `NETWORK-HARDENING.md:215` (input count), `:216-217` ("a value saved there" is too narrow), `:219` (residual risk), `:357` (rebuild input list: a rebuild has an empty database, so a missed URL silently falls back to `DMXAPI_*`, and values changed in the admin UI exist only in the database), and the upgrade section.
- `retrieval/models/external.py:49-50` posts to the reranker value as given: the docs state the full-URL shape, which bootstrap does not validate.
- `write-deployed-version.sh`, `deploy/check-ports.sh`: no provider variables; none.
- Runbook outside the repo (`DEPLOY-AGENT.md`, kept with the offline package): updated at packaging, task 5.1.
- `open-webui-init`: reads no RAG variable; none.

Seams under test: `resolved_stacks` real `docker compose config`; the bootstrap script; `activation_env`.

Required evidence: see `tasks.md` §3.

Non-goals: as in the proposal.

Review focus:

- The fallback is correct for absent and for empty values, for all four settings.
- No key reaches `runtime.env`, logs or test output.
- Recovery carries separate keys and prints neither.
- `_require_provider_precedence` does not depend on file order.
- The docs tell a running deployment to use the admin UI.
