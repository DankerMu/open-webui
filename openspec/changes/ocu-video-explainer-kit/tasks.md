# Tasks

## 1. Pin the workspace base image (OCU)

- [x] 1.1 Change the root `Dockerfile` line `FROM ubuntu:24.04` to `FROM ubuntu:24.04@sha256:78d4744ead1f5b19b04d0df558ab182a5300903900755e515b2ca4d10eb2044d`, the linux/amd64 image manifest of `noble-20261024.1`. Verify on the release host:
  - after a pull, `docker image inspect` of the pinned reference shows `RootFS.Layers` = [`sha256:bec87777bc2fb2edcdf9af11df1531469e7df911309c1413082b18fcb8610278`] (the layer diff_id; `imagetools inspect` shows only the compressed blob `7a48b8f0…`);
  - a cached rebuild of the workspace role yields configuration digest `3d0ceae2b7d5a6af582662a8de61c6bbf4791daf383d6ba42cd1141b208844b5`.

  A no-cache rebuild is not expected to reproduce it.

- [x] 1.2 Make `deploy/release.py` read the root recipe's `FROM` digest and record the workspace material `{"name": "base", "kind": "base-image", "requested": "ubuntu@sha256:<digest>"}`; a recipe without a digest fails the build before any image is built. Update the release-test fixture root recipes (`tests/deploy/test_offline_release.py`, now `FROM scratch`) to carry a digest. Verify with release tests:
  - a new inventory carries the material and passes `verify`;
  - an undigested root recipe fails the build naming the line, and writes no inventory;
  - an existing version-2 fixture inventory without the material still passes `verify` and import.
- [x] 1.3 Add a static test that fails, naming the line, when the root `Dockerfile`'s `FROM` has no `@sha256:`. Verify it fails on the old line and passes on the new one. Other Dockerfiles are out of scope.

  **Group 1 required evidence** (issue #815; authoritative where it is more specific than the bullets above):
  - Triage: feature; fixture level expanded, agreeing with upstream. Blast radius: every release build, and every import, verify and retarget of an existing release.
  - Governing invariant: every new inventory's workspace role carries exactly one base material. That material is read from the single digested `FROM` of the committed root recipe. Version-2 inventories without it still pass verify, import and retarget.
  - Risk packs:
    - Release / packaging — selected: the new material, and the refusal before any `docker` call.
    - Config / project setup — selected: the root `Dockerfile` is a production build input; its line 6 changes.
    - Legacy compatibility — selected: old inventories, covered by the preserved tests below.
    - Schema / field names — selected: the exact material shape.
    - Error handling / partial outputs — selected: a refused build leaves no inventory and no docker mutation.
    - Documentation — selected: one line under the first (`main`) Unreleased heading of `CHANGELOG.md`, and `docs/DOCKER.md` (~313), whose `FROM ubuntu:24.04  # Change to different base` example must say that the root `FROM` needs `@sha256:`.
    - Not selected: public API/CLI (no new flag), file IO (one tracked file through `require_tracked_regular_file`), auth, concurrency, resource limits.
  - Implementation facts:
    - One parser, `workspace_base(ocu_root)`, sits beside `documentserver_base`. It reads `ROLE_SPECS["workspace"]["dockerfile"]` through `require_tracked_regular_file` and ignores blank and `#` lines. It scans line by line, as `documentserver_base` does.
    - It requires exactly one `FROM` matching `FROM <image>[:<tag>]@sha256:<64 hex>`, with no `AS` alias and no `ARG` before it. It returns `<image>@sha256:<hex>`, dropping the tag.
    - `material_versions` appends `{"name": "base", "kind": "base-image", "requested": <that>}` to the workspace list after the build-arg items. This runs inside `plan_role`, before any docker call.
    - Every refusal is a `ReleaseError` starting `workspace recipe` (distinct from `documentserver recipe …`):
      - a missing digest, a digest under 64 hex characters, or `AS`: the message quotes that `FROM` line;
      - two `FROM` lines: it quotes the second;
      - `ARG` before `FROM`: it quotes that `ARG` line;
      - no `FROM`: it says `no FROM line`.
    - The static test lives in `tests/deploy/test_workspace_base_pin.py` (unittest, so CI's `unittest discover -s tests/deploy` runs it). It follows `tests/deploy/test_offline_release.py:63-64`: `from support import ROOT`, `sys.path.insert(0, str(ROOT / "deploy"))`, `import release`, then `release.workspace_base(ROOT)`. There is no second parser.
    - The release-test fixture root recipe (`write_committed_sources`, `FROM scratch`) becomes `FROM ubuntu:24.04@sha256:<64 hex>`. No existing test asserts workspace materials.
  - Must preserve:
    - `validate_inventory_schema` gains no workspace requirement; `FORMAT_VERSION` stays 2.
    - The documentserver strict check, `documentserver_base` and its tests are unchanged.
    - These pass unchanged and are not required to go red first: the verify, import and `recovery.py retarget` tests over the synthetic version-2 inventories of `tests/deploy/support.py` (`empty_build`, workspace materials without a base item).
    - The image build context is unaffected, because the Dockerfile `COPY` sources include neither `deploy/` nor `tests/`.
  - Sibling surfaces: `documentserver_base`, `material_versions`, `plan_role`, `validate_inventory_schema`, `cmd_bootstrap` (prints materials), `write_committed_sources`, `support.empty_build`, `docs/DOCKER.md`.
  - Required evidence (fake-docker release tests under `tests/deploy/`, and the static test):
    - Digested fixture root: the inventory's workspace materials equal the build-arg items plus exactly one `{"name": "base", "kind": "base-image", "requested": "ubuntu@sha256:<hex>"}`, and `verify` passes.
    - Each of the six refusals makes `build` exit non-zero, with stderr containing `workspace recipe` and the quoted line or `no FROM line` as listed above. In each case `recorded_builds()` is empty, there are no build, pull, tag or load ops, and there is no `release.json`.
    - The static test passes on the pinned root `Dockerfile`, and fails quoting the line on a temporary copy that says `FROM ubuntu:24.04`.
    - Red first applies to the new-material test, the six refusal tests and the static test.
    - The full OCU unit command passes, and CI is green.
    - Orchestrator on the release host (Phase 2): the `RootFS.Layers` check of task 1.1. Then a cached `release.py build` of the PR commit whose workspace configuration digest is `3d0ceae2b7d5…` (production built it from `01b7ef7`, which the PR branches from).
  - Non-goals: other Dockerfiles; apt pinning; a no-cache reproduction; line continuations in the parser.

Suggested fixture level: expanded - it changes the release inventory written by `release.py` and production build inputs.
Minimal mergeable slice: atomic - the pin, its inventory record and its guard prove one invariant together, and a pin without the record leaves provenance incomplete.

## 2. Evaluation stack and baseline (OCU tooling)

- [x] 2.1 Write the `ocu-eval` compose definition and the start script. The stack:
  - uses release images loaded from a package under `/home/nwm/ocu-eval/`, unmodified;
  - binds ports to 127.0.0.1;
  - sets `ENABLE_NETWORK=false`;
  - runs neither DocumentServer nor retention-guard;
  - reads the key from a 0600 file;
  - refuses to start below 15 GB free on Docker's root.

  Verify on 210.77.77.27:
  - `docker ps` shows only loopback ports for the project;
  - an inspected sandbox satisfies OCU's disabled-network predicate (`Config.NetworkDisabled` true or `HostConfig.NetworkMode` `none`), publishes no port, and an outbound connection attempt from inside it fails;
  - the start script, the image-load step and the driver's per-run check each refuse when the free-space check is pointed at a fake low value.

  **Task 2.1 required evidence** (issue #816):
  - Triage: feature (evaluation tooling). Fixture level expanded, agreeing with upstream. It starts services on a shared host, handles secrets and binds ports. Blast radius: other projects on 210.77.77.27, and the keys.
  - Governing invariant: the stack creates, binds and later removes only objects of project `ocu-eval`. No secret reaches a sandbox, a log or stdout.
  - Risk packs:
    - Config — selected: the compose merge.
    - Auth / secrets — selected: the key file and stack secrets.
    - Resource limits — selected: the 15 GB floor.
    - Error handling — selected: the refusals.
    - Legacy compatibility — selected: the production files are untouched.
    - Concurrency / shared state — selected: shared host names and objects.
    - Not selected: public API, schema, file publish.
  - Compose shape:
    - `deploy/eval/compose.eval.yml` is an override on the upstream `docker-compose.yml` and `docker-compose.webui.yml`.
    - It is run as `docker compose -p ocu-eval --project-directory <OCU checkout root> --env-file <empty file> -f docker-compose.yml -f docker-compose.webui.yml -f deploy/eval/compose.eval.yml`.
    - `workspace` and `cleanup` get `profiles: ["never"]`, and `computer-use-server` gets `depends_on: !reset {}`. The upstream `cleanup` would remove every orchestrator container and `chat-*-workspace` volume on the host.
    - Services started: `computer-use-server`, `open-webui`, `postgres`, and a one-shot `open-webui-init`.
    - Every `container_name` is set to `ocu-eval-<service>`.
    - Every started service takes `image:` from an `images.env` variable (`COMPUTER_USE_SERVER_IMAGE`, `OPENWEBUI_IMAGE` or `POSTGRES_IMAGE`) and has no `build`. `DOCKER_IMAGE` names the workspace image for sandboxes.
    - `EVAL_ROOT`, `EVAL_WEBUI_PORT`, the image variables and every stack secret use the fail-loud `${VAR:?…}` form, so an unset `EVAL_ROOT` cannot bind host `/data`.
    - `computer-use-server`:
      - `image: ${COMPUTER_USE_SERVER_IMAGE:?…}` and `ports: !override []`;
      - `volumes: !override` with only the docker socket and a same-path `${EVAL_ROOT}/data` bind;
      - `environment: !override` mapping: `ENABLE_NETWORK: "false"`, `BASE_DATA_DIR: ${EVAL_ROOT}/data`, `DOCKER_IMAGE`, `MCP_API_KEY`, `OCU_INTERNAL_TOKEN`, `CONTAINER_IDLE_TIMEOUT: "259200"` (production's value, so a three-day run is not reaped), and `TTS_BASE_URL` / `TTS_MODEL` / `TTS_VOICE` / `TTS_API_KEY` (left empty here; #817 sets them);
      - no `VISION_*`, no `ANTHROPIC_*`, and no dmxapi key.
    - `open-webui`:
      - `ports: !override ["127.0.0.1:${EVAL_WEBUI_PORT}:8080"]` and `image: ${OPENWEBUI_IMAGE}`;
      - `environment: !override` with `DATABASE_URL` to the eval postgres, `WEBUI_SECRET_KEY`, `OPENAI_API_BASE_URL=https://www.dmxapi.cn/v1`, `OPENAI_API_KEY` (the dmxapi key), `ENABLE_OLLAMA_API=false`, `OFFLINE_MODE=true`, `ENABLE_OCU_WORKSPACE=true`, `OCU_INTERNAL_URL=http://computer-use-server:8081`, `OCU_INTERNAL_TOKEN`, `ENABLE_OCU_OFFICE_EDIT=false`, and `WEBUI_ADMIN_EMAIL` / `WEBUI_ADMIN_PASSWORD` from the admin credentials, so the admin exists before the port accepts a first signup.
    - `postgres`: `image: ${POSTGRES_IMAGE}` and `POSTGRES_PASSWORD`.
    - `open-webui-init` follows `deploy/production-like-test/compose.webui.override.yml` (~110-140):
      - `image: ${OPENWEBUI_IMAGE}`, `user: "0:0"`, and the `run-init.sh` entrypoint;
      - the `open-webui-data` volume, `./openwebui:/app/source:ro` and `./deploy/production-like-test/init/run-init.sh:/bootstrap/run-init.sh:ro`;
      - `depends_on: open-webui: {condition: service_started}`;
      - env `WEBUI_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ORCHESTRATOR_URL=http://computer-use-server:8081`, `MCP_API_KEY` and `PRIMARY_CHAT_MODEL=qwen3.8-27b`;
      - `OCU_ORG_PROMPT_FILTER` unset, and `restart: "no"`.
  - Secrets:
    - `deploy/eval/secrets.sh init` generates values from `[A-Za-z0-9]` only, with an admin email of the form `eval-admin@ocu-eval.local`, because `POSTGRES_PASSWORD` goes into `DATABASE_URL` and `ADMIN_PASSWORD` into shell-built JSON in `openwebui/init.sh`. It generates `OCU_INTERNAL_TOKEN`, `MCP_API_KEY`, `WEBUI_SECRET_KEY`, `POSTGRES_PASSWORD` and the admin credentials. It writes them once, never overwriting, into `${EVAL_ROOT}/stack.env` with mode 0600; `MCP_API_KEY` must stay stable across restarts.
    - The dmxapi key is read from `${EVAL_KEY_FILE}` (default `$HOME/.ocu-eval-dmxapi.key`, outside `EVAL_ROOT`, so the key search under `EVAL_ROOT` in 2.3 can pass).
    - Both files are refused unless they are regular files owned by the caller with mode 0600.
    - The scripts export the values into the compose environment only, and never echo them.
    - Upstream defaults (`admin`, `openwebui`, empty token) are never used.
  - Images:
    - `load.sh <package dir>` reads `release.json` and verifies `images.<role>.archive.{path,sha256}` before any `docker load`. It loads only the computer-use-server, workspace, open-webui and postgres roles, and binds `images.<role>.reference` to the `RUNTIME_IMAGE_VARS` names in `${EVAL_ROOT}/images.env`.
    - It appends to `${EVAL_ROOT}/loaded-images.txt` only references that were absent before the load.
    - The free-space floor reuses `release.py`'s `DockerRootDir` lookup (~2765-2793) at 15 GB. It runs up front and in `start.sh`; before each load it requires the floor plus three times the archive size, for unpacking.
  - Source: the stack runs from an OCU checkout on the host at the PR's merge commit, under `${EVAL_ROOT}/src`. The images come from the package named on the command line.
  - Scripts: `start.sh` runs `compose … up -d --no-build --pull never`, then `docker wait ocu-eval-open-webui-init`, and fails unless that prints 0 (`compose wait` sees only running containers); `stop.sh` runs `compose … down`. Both export `stack.env` and `images.env` first, because the base files interpolate `${OCU_INTERNAL_TOKEN:?}` before `!override` applies. `stop.sh` does not need the dmxapi key file. `load.sh` refuses to load an archive whose reference already exists on the host with a different image id, so a production tag is never moved. Neither uses `--rmi`, `prune`, `system`, `-v`, or `rm` of anything outside the project.
  - Must preserve, unchanged:
    - `deploy/up.sh`, the production overlay files and `tests/deploy/test_overlay_structure.py`;
    - `docker-compose.yml`, `docker-compose.webui.yml` and `cron/cleanup.sh`;
    - `openwebui/init.sh` and `deploy/production-like-test/init/run-init.sh`;
    - the existing `tests/deploy` suite, which passes unchanged.
  - Sibling surfaces: the files above, plus `release.py` (free-space check, `RUNTIME_IMAGE_VARS`). Tests use their own recording stubs and do not extend `tests/deploy/fakebin`.
  - Required evidence: `tests/deploy/test_eval_stack.py` (unittest), running real `docker compose config --format json --no-env-resolution` with an empty env file, like `resolved_stacks()`.
    - Project `ocu-eval`, with exactly the four services.
    - No `workspace`, `cleanup`, `proxy`, `documentserver` or `retention-guard`.
    - Every `container_name` starts with `ocu-eval-`.
    - Every published port has `host_ip` `127.0.0.1`, and only `open-webui` publishes.
    - `ENABLE_NETWORK` is `"false"`.
    - Bind sources are only `/var/run/docker.sock`, `./openwebui`, `./deploy/production-like-test/init/run-init.sh` and paths under `${EVAL_ROOT}`.
    - Every started service has an `image` from the variables and no `build`.
    - The config test passes a fake environment, as `resolved_stacks()` does, and fails with `EVAL_ROOT` unset.
    - The `computer-use-server` environment has no `OPENAI_API_KEY`, `VISION_*` or `ANTHROPIC_*`.
    - There is no `env_file`.
    - Script tests with stubs, each red before the files exist:
      - With free space below 15 GB, `load.sh` and `start.sh` exit non-zero, stating the free space and the floor, with no `docker load` and no `compose up`.
      - A `release.json` sha256 mismatch refuses before `docker load`.
      - A key or stack file with mode 0644, a symlink, or a missing file is refused.
      - A planted secret never appears in captured stdout or stderr.
      - `secrets.sh init` never overwrites.
      - `load.sh`, `start.sh` and `stop.sh` never invoke `prune`, `system`, `--rmi`, `-v`, `volume rm` or `network rm`.
      - A pre-existing reference is not written to `loaded-images.txt`.
    - The full OCU unit command passes on the frozen head, run by the orchestrator (`build.yml` is `disabled_manually`, so OCU PRs have no CI).
  - Orchestrator on 210.77.77.27 (Phase 2):
    - Record `docker compose version`.
    - Snapshot the container, image, network and volume lists before `load.sh`.
    - Load the current production package, then start the stack. `open-webui-init` must exit 0 and write `.computer-use-initialized`.
    - Create one sandbox with one WebUI chat through the SSH tunnel, and record its chat id.
    - Check the sandbox: `Config.NetworkDisabled` is true (or `HostConfig.NetworkMode` is `none`), it publishes no port, and an outbound `curl` from inside it fails.
    - `docker ps` shows only `127.0.0.1` ports for the project.
    - Run `stop.sh`, then remove the recorded sandbox container and its volume by hand. Snapshot again.
    - The two snapshots, excluding project-labelled objects, the recorded chat's objects and `loaded-images.txt` entries, are identical.
    - Never print a resolved compose config or a container environment unredacted.
  - Non-goals: the adapter, the driver, and cleanup by chat id (#817, #853, #818).

- [ ] 2.2 Write the evaluation adapter with two routes:
  - **speech:** accepts OCU's request with `mp3`/`wav`, `voice` and `instructions`, calls dmxapi `chat/completions` with `mimo-v2.5-tts`, and returns 502 without the key on upstream failure;
  - **images:** accepts WebUI's `openai`-engine generation request (JSON `/images/generations`) and edit request (multipart `/images/edits`, files as `image` or `image[]`). It forwards both to dmxapi `/v1/responses` with `prompt` as `input`, edit files as `data:` URLs in `image`, without `n` and with `watermark` false. It rejects `n` other than 1 with 400, returns the OpenAI images shape, and returns 502 without the key on upstream failure.

  Verify each route with:
  - unit tests on recorded responses: success (both audio formats with the content types `speech.py` accepts; image `b64_json` and `url`), an upstream error, a timeout and a wrong-type response;
  - one live call in the stack (`generate_speech`; one WebUI image generation and one WebUI image edit).

  **Task 2.2 speech-route required evidence** (issue #817; the image routes are #853):
  - Triage: feature (evaluation tooling). Fixture level expanded, agreeing with upstream: a network service on a shared host that holds the provider key.
  - Governing invariant: the dmxapi key leaves the adapter only toward dmxapi, in the `Authorization` header, never through a redirect. No response or log line holds it, and no service's environment holds it except `open-webui` (2.1's `OPENAI_API_KEY`) and `adapter`. Only callers holding the adapter token can spend it through the adapter.
  - Risk packs:
    - Auth / secrets — selected: the provider key and the new adapter token.
    - Error handling — selected: the 502 contract.
    - Public API — selected: OCU's speech client (`computer-use-server/speech.py`) is the consumer; its content types, its 200-character error excerpt and its error handling fix the response contract.
    - Config — selected: a new compose service and the server's `TTS_*` values.
    - Resource limits — selected: the upstream timeout and the size caps.
    - File IO / overwrite — selected: `secrets.sh init` now appends to an existing `stack.env`.
    - Documentation — selected: `deploy/eval/README.md`.
    - Legacy compatibility — selected: production speech code and #816's stack invariants. The `stack.env` append is one-way: #816's parser refuses the new name, so after it a `src` checkout older than this PR cannot run `start.sh` or `stop.sh` on that `EVAL_ROOT`. The README says so.
    - Release / dependency — not selected: the adapter uses only the server image's direct requirements (`fastapi`, `uvicorn`, `aiohttp`); `httpx` is only transitive there and is not used. No requirement changes.
    - Not selected: schema, concurrency (the adapter is stateless), file publish (OCU writes the file).
  - Sibling surfaces: OCU's `speech.py` and `generate_speech` (consumers, unchanged); the image routes of #853, which reuse this module's token check, redactor, upstream client and service; WebUI's image engine key in 2.4, which is the adapter token.
  - Upstream contract, measured by the orchestrator on 2026-11-17 (recordings handed to the implementer, audio truncated to 1536 bytes, no key):
    - `POST https://www.dmxapi.cn/v1/chat/completions` with `{"model", "messages", "audio": {"format", "voice"?}}`. `messages` is an optional `{"role": "user", "content": <instructions>}` followed by `{"role": "assistant", "content": <input>}`.
    - Success: 200 `application/json`, the audio base64 in `choices[0].message.audio.data`, already in the requested format. `wav` starts `RIFF….WAVE`; `mp3` starts with an MPEG frame sync (`0xFF`, top three bits of the next byte set) or `ID3`. No transcoding is needed.
    - `voice` omitted uses `mimo_default`. An unknown voice gives 400 with `error.param` `Unknown voice: alloy. Available voices: [mimo_default, 冰糖, 茉莉, 苏打, 白桦, Mia, Chloe, Milo, Dean]`. An unknown model gives 503 `model_not_found`.
  - Shape:
    - `deploy/eval/adapter/eval_adapter.py`, one ASGI module (FastAPI, uvicorn, `aiohttp` for the upstream call). The name avoids the server image's own `/app/app.py` and `speech.py` and the test suite's server module names. No new image and no build.
    - `POST /v1/audio/speech`:
      - `Authorization: Bearer <ADAPTER_TOKEN>`, compared in constant time; otherwise 401 with no upstream call.
      - JSON body: non-empty string `model` and `input`, `response_format` `mp3` or `wav`, optional string `voice` and `instructions`. Anything else is 400 with no upstream call.
      - Forwards `model` as given; `voice` only when non-empty; the user message only when `instructions` is non-empty. The upstream call never follows a redirect.
      - Returns 200 with the decoded bytes and `Content-Type: audio/mpeg` for `mp3`, `audio/wav` for `wav`.
    - Caps: the upstream body is read in chunks and abandoned past `ceil(MAX_AUDIO_BYTES × 4/3) + 64 KiB`; decoded audio over `MAX_AUDIO_BYTES` (50 MiB, the adapter's own constant, equal to `speech.MAX_AUDIO_BYTES`) is refused.
    - 502 with a JSON `{"error": …}` body, UTF-8 without `\u` escapes, for:
      - an upstream non-2xx: `upstream HTTP <status>: <error.param, else error.message>`, redacted first, then cut to 160 characters, so the whole body fits inside `speech.py`'s 200-character excerpt and the model sees the voice list;
      - an upstream 3xx (not followed);
      - a timeout (90 s, below OCU's 120 s default);
      - a transport error (class name only);
      - a non-JSON body; missing, non-string or invalid base64 audio; empty audio; audio whose leading bytes do not match the requested format;
      - either cap exceeded.
    - Every response body and log line passes a redactor that removes the provider key and the adapter token. A log line holds the route, status, elapsed time and upstream status; never headers, bodies or input text.
  - Compose (`deploy/eval/compose.eval.yml`):
    - A new service `adapter`:
      - `container_name: ocu-eval-adapter`, `image: ${COMPUTER_USE_SERVER_IMAGE:?…}`, no `build`, no `ports`;
      - `user: "65534:65534"`, `security_opt: [no-new-privileges:true]`, `restart: unless-stopped`;
      - one bind, `./deploy/eval/adapter:/eval-adapter:ro` (the host checkout's files are world-readable under umask 022), and `working_dir: /eval-adapter`;
      - `entrypoint: ["python3", "-I", "-m", "uvicorn", "eval_adapter:app", "--app-dir", "/eval-adapter", "--host", "0.0.0.0", "--port", "8090"]` and `command: []`, replacing the image's server preflight and command;
      - `healthcheck` probing `http://127.0.0.1:8090/healthz` (unauthenticated, returns `{"ok": true}`), replacing the image's 8081 probe;
      - environment exactly `PROVIDER_KEY: ${EVAL_PROVIDER_KEY?}`, `ADAPTER_TOKEN: ${ADAPTER_TOKEN:?…}` and `UPSTREAM_BASE_URL: https://www.dmxapi.cn/v1`.
    - `computer-use-server` gets `TTS_BASE_URL: http://adapter:8090/v1`, `TTS_MODEL: mimo-v2.5-tts`, `TTS_VOICE: ""` and `TTS_API_KEY: ${ADAPTER_TOKEN:?…}`. It still holds no dmxapi key.
  - Secrets (`deploy/eval/secrets.sh init`):
    - `ADAPTER_TOKEN` joins the generated `[A-Za-z0-9]` names, and the env-file parsers accept it.
    - Without `stack.env`, `init` writes all names as before.
    - With an existing `stack.env`, `init` first applies `eval_require_private`, then checks every line is `NAME=value` with a known name and a well-formed value; otherwise it refuses without echoing a value.
    - If names are missing, it writes the original bytes plus one line per missing name to a 0600 temporary file in the same directory and renames it over `stack.env`; existing lines stay byte-identical. If none is missing, it changes nothing, prints `nothing to add` and exits 0.
  - Allowed changes to #816's files, each named in the PR:
    - `compose.eval.yml`: the `adapter` service and the four server `TTS_*` values.
    - `secrets.sh`: the append path above. `common.sh`: the new name in the accepted set.
    - `start.sh`: before `up`, it refuses, naming the path, when `deploy/eval/adapter` or a file in it is not readable by others (or a directory not searchable), because the adapter runs as uid 65534 and `start.sh` waits only for `open-webui-init`.
    - `README.md`: the adapter service, `ADAPTER_TOKEN`, the append semantics, the one-way note, and cloning `src` under umask 022.
    - `tests/deploy/test_eval_stack.py`:
      - `STARTED`, `STACK_NAMES`, `PLANTED` / `SECRET_VALUES` and `SERVICE_IMAGE_VARS` gain the new name and service (the four-service test may be renamed);
      - the empty-`TTS_*` assertion becomes the values above;
      - the admin-password leak loop covers `adapter`;
      - the second-`init` test becomes the no-op contract;
      - the bind-source allow-list admits `./deploy/eval/adapter`.
  - Must preserve, unchanged:
    - `computer-use-server/speech.py`, `generate_speech` in `mcp_tools.py`, and every production compose and overlay file;
    - #816's invariants: only `open-webui` publishes, on 127.0.0.1; no forbidden docker operation; every `container_name` starts with `ocu-eval-`;
    - every other `tests/deploy` test.
  - Required evidence, each test red before the change:
    - `tests/deploy/test_eval_adapter.py` (unittest) loads the module with `importlib.util.spec_from_file_location` under a unique name, never as `app` or `speech`. It replays the recordings, committed under `tests/deploy/fixtures/eval_adapter/`, through a fake upstream served on an ephemeral 127.0.0.1 port.
      - `mp3` with instructions and voice: the upstream request has exactly the two messages in order, `audio.format` `mp3`, the voice, and the provider key as Bearer. The response is 200 `audio/mpeg` with the decoded bytes.
      - `wav` without voice or instructions: no `voice` key and no user message upstream; 200 `audio/wav`.
      - Each returned content type is in `CONTENT_TYPES[fmt]` of `computer-use-server/speech.py`, and the adapter's `MAX_AUDIO_BYTES` equals `speech.MAX_AUDIO_BYTES`. `speech.py` is loaded by file location under a unique name too.
      - 502 for each failure above: the recorded 400 (body holds `Unknown voice`), the recorded 503, a 302 whose `Location` points at a second fake server (which receives 0 requests), a timeout, a transport error, a 200 non-JSON body, a 200 JSON body without audio, invalid base64, empty audio, `wav` bytes for an `mp3` request, an upstream body over the read cap, and decoded audio over `MAX_AUDIO_BYTES` (the caps patched small in the test).
      - 401 for a missing or wrong token and 400 for `response_format` `ogg` or an empty `input`, each with no upstream call.
      - A planted key and token never appear in any response body or captured log, including when the upstream error body echoes the key.
      - OCU's own client against the adapter: `synthesize()` from `speech.py`, against the adapter served by uvicorn on an ephemeral 127.0.0.1 port with the fake upstream, returns the bytes for `mp3`. For the recorded 400 it raises `SpeechError` whose text holds `Unknown voice`, `冰糖` and `Dean`, and no key.
    - `tests/deploy/test_eval_stack.py`, on the merged config with fake values:
      - `adapter` has no `ports` and no `build`, `image` from `COMPUTER_USE_SERVER_IMAGE`, the `user`, `security_opt`, `restart`, `entrypoint`, `working_dir` and `healthcheck` above, exactly the one read-only bind, and exactly the three environment keys;
      - the server's four `TTS_*` values equal the values above;
      - the fake provider key appears only in `open-webui` and `adapter`, and the fake adapter token only in `adapter` and the server's `TTS_API_KEY`;
      - the source uses `${ADAPTER_TOKEN:?`.
    - `secrets.sh init`:
      - on a `stack.env` holding the six earlier names, keeps those lines byte-identical and adds `ADAPTER_TOKEN`;
      - a second `init` prints `nothing to add`, exits 0 and changes no byte;
      - a `stack.env` that is a symlink, mode 0644, or holds an unknown name is refused and left byte-identical, and no value is echoed.
    - `start.sh` with an adapter file at mode 0600 exits non-zero naming it, with no `compose up`.
    - The orchestrator's full OCU unit run on the frozen head passes.
  - Orchestrator on 210.77.77.27 (Phase 2), with the `src` checkout at the PR head:
    - `secrets.sh init` adds the token. `start.sh` exits 0. `ocu-eval-adapter` is running and healthy with `RestartCount` 0, and publishes no port.
    - Through MCP in one chat:
      - `generate_speech` writes `line1.mp3` with instructions;
      - `generate_speech` writes `line2.wav` without;
      - `bash_tool` runs `ffprobe` on both inside the offline sandbox, which reports `mp3` and `pcm_s16le`, each longer than 1 s;
      - `generate_speech` with voice `alloy` returns an error text naming the unknown voice.
    - Counts only, never printing a value: the key and the token are each found 0 times in `docker logs` of `ocu-eval-adapter` and `ocu-eval-computer-use-server`, and the key 0 times in `docker inspect ocu-eval-computer-use-server`.
    - `stop.sh`, then remove the chat's sandbox container and volume. The snapshot diff is as in 2.1.
  - Non-goals: the image routes (#853), the driver, and any production speech change.

- [ ] 2.3 Write the driver and the cleanup script. The driver:
  - opens an SSH tunnel;
  - creates a chat with `qwen3.8-27b`, the video switch and image generation on;
  - sends one request with a 60-minute limit;
  - collects the transcript, the MP4 and a run manifest with every field the spec names.

  The stack keeps the orchestrator data directory under `/home/nwm/ocu-eval/`. Cleanup removes only project-loaded images, compose containers and networks, and the recorded chat ids' sandbox containers, volumes and data directories. Verify:
  - one explainer request end to end;
  - the container, image, network and volume lists of other projects are identical before and after cleanup;
  - a key search that never prints the key finds nothing under `/home/nwm/ocu-eval/` and in the project's container logs.

- [ ] 2.4 Configure WebUI image generation and image editing in the stack on the `openai` engine: base URL the adapter, the adapter token as key (the adapter holds the dmxapi key), model `doubao-seedream-5-0-flash-260915`, default size 2048×2048, the aspect-ratio table of Decision 15, editing on. No code changes. Verify:
  - the stored settings equal the values above, read back from WebUI's image config API;
  - the end-to-end smoke shows speech, a generated image and an MP4 output all working with sandbox networking disabled.

  If any of them fails, stop and ask the user.

- [ ] 2.5 Commit the request set: five science-explainer requests, plus one course, one promo and one report. Verify the commit precedes the first baseline manifest.

  **Task 2.5 required evidence** (issue #820):
  - Triage: test data. Fixture level compact, overriding the group's expanded: the slice is one data file, its shape test and one README line, with no runtime path, no secret and no host action.
  - Risk packs:
    - Schema / field names — selected: the file shape.
    - Documentation — selected: the README line.
    - Others not selected: nothing reads the file until the driver arrives (#818).
  - The data file is `deploy/eval/requests.json`, UTF-8 JSON: `{"version": 1, "requests": [{"id", "kind", "repetitions", "prompt"}]}`.
    - `id` matches `^[a-z0-9-]{3,40}$` and is unique.
    - `kind` is one of `explainer`, `course`, `promo` or `report`.
    - `repetitions` is 2 for explainers and 1 otherwise.
    - `prompt` is the Chinese request as an employee would type it, 20–200 characters. It names no tool, skill or path.
  - Content: five explainers on distinct everyday science topics, each answerable in 1–3 minutes; one course lesson; one product or department promo; and one work report whose figures are stated in the prompt.
  - `deploy/eval/README.md` (created by this PR if #816 has not created it yet) gains one line: the request set is fixed before the baseline, and changing it after the baseline voids the comparison.
  - Required evidence: `tests/deploy/test_eval_requests.py` (unittest, so CI's `unittest discover -s tests/deploy` runs it) asserts:
    - the counts (5 + 1 + 1 + 1) and 13 total runs;
    - unique ids and the field rules;
    - that no prompt contains `remotion`, `kit`, `skill`, `技能` or `/`.

    The test is red before the file exists and green in the orchestrator's full OCU unit run on the frozen head (`build.yml` is `disabled_manually`, so OCU PRs have no CI).

  - Orchestrator, before task 2.6 starts: record this PR's OCU merge commit and its commit time, and confirm that no baseline manifest under `/home/nwm/ocu-eval/` predates it.

  - Non-goals: running anything; the driver.

- [ ] 2.6 Run the baseline on release `01b7ef7a64a5` with WebUI `6b95a4995e91`: each explainer twice, the others once, `infra` failures rerun at most twice. Keep that package under `/home/nwm/ocu-eval/`. Verify that 13 final-outcome manifests, one per request and repetition, plus a manifest for every rerun attempt, record that release identity, the WebUI image digest and an outcome.
- [ ] 2.7 Record the render success-rate threshold, set from the baseline, and the a-priori kit check pass-rate threshold in this change, and get the user's confirmation. Verify that the change holds both values and a link to the confirmation, dated before any after-run manifest.

Suggested fixture level: expanded - it starts services on a shared host, handles a secret, and adds a network adapter.
Minimal mergeable slice: tasks 2.1–2.3, a working isolated stack with one request end to end. The rest uses that stack.

## 3. Kit core (OCU `remotion-template`)

- [ ] 3.1 Add the test runner: `node --test` over `remotion-template/tests/*.test.mjs`, plus a new OCU CI workflow that runs `npm ci` in the template and then the tests. Flag the CI change in the PR. Verify that the job runs a trivial test green on the PR.

  **Task 3.1 required evidence** (issue #823):
  - Triage: test infrastructure. Fixture level compact, overriding the group's expanded: the slice adds a CI workflow and one trivial test, with no runtime behavior.
  - Risk packs:
    - Release / packaging — selected: the CI workflow change, flagged in the PR, and keeping tests out of the image.
    - Legacy compatibility — selected: the `tests/test_remotion_image.py` guards stay green unchanged (no `scripts`, pinned deps, Dockerfile order, and `not (TEMPLATE / "node_modules").exists()`), as do `tests/test-project-structure.sh` and the exact template `COPY` line.
    - Others not selected.
  - Shape:
    - `remotion-template/tests/smoke.test.mjs` uses `node:test` and imports `zod` from the template's `node_modules`. It asserts that `z.object({a: z.string()})` parses, and that the template `package.json` has no `scripts`.
    - `.dockerignore` gains `remotion-template/tests/`, so tests ship neither into the image nor into user projects.
    - A new standalone workflow `.github/workflows/template-tests.yml` with one job `template-tests` (user decision 2026-11-16: `build.yml` is `disabled_manually` and pushes images to GHCR on `main`, so it stays off):
      - `on: pull_request: branches: [main]` only;
      - `permissions: contents: read`; no secrets, no image build or push;
      - checkout with `persist-credentials: false`;
      - `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` and `actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e  # v6.4.0` (40-character SHA pins, per `security.yml`);
      - `node-version: '22.23.2'`;
      - `npm ci` in `remotion-template`, then `node --test "remotion-template/tests/*.test.mjs"` (quoted glob; Node 22 does not expand directories).
    - Nothing is added to `package.json`.
  - Required evidence:
    - Locally, under Node 22, run `npm ci` and the test in a scratch copy of `remotion-template`, so the checkout gets no `node_modules`.
    - The test passes, and fails when the `zod` import is broken, which proves the file ran.
    - The PR's `template-tests` workflow run is green and its log shows one test passing.
    - `tests/test_remotion_image.py` passes unchanged.
    - The full OCU unit command passes.
  - Non-goals: kit code; TypeScript compilation.

- [ ] 3.2 Vendor Onda `lib/` into `src/kit/`, with its MIT header and its NOTICE entry in the same task:
  - fix the zod 4 call (`composition.ts:18`);
  - drop `adaptive-player.tsx`, `composition-json-schema.ts` and `registry-summary.ts`.

  Verify that `npx --no-install remotion bundle` of the template succeeds and the notice-coverage test passes.

- [ ] 3.3 Add the theme token module and the Chinese text helper:
  - punctuation and character-count segmentation;
  - no closing punctuation at line start;
  - letter spacing 0 and line height ≥1.25;
  - 万/亿 formatting.

  Probe `Intl.Segmenter('zh')` in the image's headless shell and record the result. Verify with `node --test` cases on long Chinese strings, line-start punctuation, and 9999, 12345 and 123456789.

- [ ] 3.4 Define the `script.json` schema in a `.mjs` module:
  - 1920×1080 at 30 fps;
  - the hook / 3–5 chapters / summary / end-card skeleton;
  - 1–4 scenes per chapter, 1–4 sentences per scene, 1–4 blocks per sentence, blocks ≤16 characters, chapter names ≤6;
  - the candidate kinds;
  - `custom` limited to one;
  - plain image names;
  - a music id or `none`.

  Export the JSON Schema. Add the PolyForm NC notice entries (anything2explainer, video-talkcraft) in this task. Verify with `node --test` fixtures that every invalid case in the spec fails with a message naming chapter, scene, field and limit.

- [ ] 3.5 Implement `kit new <name>`, `kit voice`, `kit voice-import` and `kit image`. Verify with `node --test`:
  - `new` refuses a non-empty directory;
  - `voice` stems carry the hash of text, voice and instructions, and change when any of them changes;
  - `voice-import` places a suffixed file under its stem;
  - `image` sanitizes a name with spaces and parentheses.
- [ ] 3.6 Implement `kit timeline`: silence trim, decoded durations, the gaps (0.06 s within a sentence, 10/20/45 frames, 40 lead-in, 90-frame tail as the end card's closing part), the 15-frame transition slots inside the post-narration gaps, narration normalized to -16 LUFS, recorded hashes, and the 60–180 s window. Verify with fixture audio:
  - block frames are within one frame;
  - every transition slot lies inside its gap, and an end card without narration lasts 90 frames;
  - a missing block fails, naming it;
  - an edited block's stale hash fails;
  - a 200-second fixture fails, stating its length.
- [ ] 3.7 Implement the shared probe composition, which records text boxes, overflow, font size, rendered text, line-start characters and mask boxes as JSON. Verify that a deliberately overflowing fixture scene is reported, and a fitting one is not.
- [ ] 3.8 Implement the renderer over the validated script and timeline, with captions paged per block and the `custom` loader (`src/custom/<File>.tsx` through a generated `src/custom/index.ts`). Verify with short fixture renders:
  - three blocks give three caption pages;
  - a fixture custom scene renders;
  - a missing custom file fails, naming the scene.

Suggested fixture level: expanded - it defines new file formats (`script.json`, `timeline.json`) and a CLI.
Minimal mergeable slice: tasks 3.1–3.4, the runner, vendored lib, text helper and schema, with their tests. No command consumes them yet, so they stay green on their own.

## 4. Scene components and the gallery (OCU `remotion-template`)

- [ ] 4.1 Build the gallery generator. It renders every registered candidate in both theme candidates inside the PR's workspace image on 210.77.77.27 (image labelled `ocu-eval`), probes every sample with 3.7, writes one static page, and lets the page export the user's decisions as JSON. Verify that one placeholder component renders with its probe result and that the export downloads.
- [ ] 4.2 Port the hook, question, concept card, definition, summary and end-card scenes, each with its NOTICE entry and a declared minimum length. The first remotion-bits primitive ported carries the remotion-bits notice. The user reviews this batch in the gallery and exports decisions; the export is committed into `gallery/approvals.json`, linking it, in the same PR, and only approved components of the batch are merged. Verify that every gallery sample at maximum text length has a clean probe, and that every merged component has an `approve` entry.
- [ ] 4.3 Port or write the process steps (with arrows), cause and effect, comparison and timeline scenes, with notices and minimum lengths. The user reviews this batch in the gallery and exports decisions; the export is committed into `gallery/approvals.json`, linking it, in the same PR, and only approved components of the batch are merged. Verify with the same probe and the same approval check.
- [ ] 4.4 Port or write the key number, chart (bar/line) and image-with-callouts scenes (callouts tracking the zoom), with notices and minimum lengths. The user reviews this batch in the gallery and exports decisions; the export is committed into `gallery/approvals.json`, linking it, in the same PR, and only approved components of the batch are merged. Verify with the same probe and the same approval check.
- [ ] 4.5 Add the 15-frame theme transitions into the timeline's transition slots. Verify with a fixture render that every transition's frames fall inside the gap after the outgoing scene's last block, and that the rendered length equals the timeline's total length.
- [ ] 4.6 The user picks the theme in the gallery and exports the pick; commit it into `gallery/approvals.json`, linking it. A `redo` component from 4.2–4.4 is redone and re-reviewed, or stays unshipped. Remove the unpicked theme and every candidate kind without an `approve` entry. Verify with a static test that the schema kinds, registry, JSON Schema and example script equal the approved set, and that hook, summary and end card are approved. Task 7.2 extends the test to the skill's kind list.

Suggested fixture level: expanded - it adds the components that the schema's kinds bind to, and a user approval gate.
Minimal mergeable slice: task 4.1 with a placeholder component only. No real component merges before its own approval entry, recorded in the same PR.

## 5. Kit check and render (OCU `remotion-template`)

- [ ] 5.1 Implement the mechanical stage of `kit check` as a background job reported by `kit status`. It covers the schema, the probe rules from 3.7, rest after reveals, unnarrated stretches outside lead-in, tail and end card, timeline agreement, image, font and voice assets, and the custom count. The music rules (unknown id, track length) are added in 6.5. Verify:
  - each rule has a failing and a passing fixture;
  - `check` returns at once;
  - `status` reports running, passed and failed with reasons.
- [ ] 5.2 Add the contact sheet and the fixed yes/no checklist after a passing mechanical stage, with the video-shotcraft (Apache-2.0) NOTICE entry, plus the passing-check hash over `script.json`, `timeline.json`, `src/` and the referenced `public/` files. Verify that a passing check writes exactly one four-tile sheet and prints the questions, that editing `src/` or a referenced `public/` file invalidates the hash, and that regenerating `src/custom/index.ts` without changes does not.
- [ ] 5.3 Implement `kit render`:
  - background launch;
  - render into `out/`, verify with ffprobe (H.264, yuv420p, AAC, duration), then move atomically to `/mnt/user-data/files/<name>.mp4`;
  - `status` distinguishes died-without-exit;
  - refuses to start after an unchecked edit.

  Verify the refusal, a successful fixture render, and a killed render that leaves the previous target intact.

- [ ] 5.4 Time `kit check` on the maximum-size fixture script in the workspace image with `--cpus=2 --memory=4g`, and record the time in the PR. Verify that it completes, and that `status` stays responsive throughout.

Suggested fixture level: expanded - it adds a CLI gate and publishes the user's output files.
Minimal mergeable slice: task 5.1 with its fixtures. It reads the script, timeline and probe output, and is testable without a final render.

## 6. CC0 music library (OCU)

- [x] 6.1 Collect per-track evidence for the candidates: a live CC0 statement, or an archived statement whose digest matches `source_sha256`, plus a search for other licences. Build the listening page, which exports the user's decisions as JSON. Verify that every candidate on the page links its evidence snapshot and its re-release search note.

  **Task 6.1 required evidence** (issue #841):
  - Triage: feature (release-side tooling; nothing enters the image). Fixture level expanded, agreeing with upstream: it downloads and verifies third-party files, and sets licence policy.
  - Risk packs:
    - File IO / path safety — selected: downloads into a fresh output directory.
    - Schema / field names — selected: the candidate, exclusion and export formats.
    - Error handling — selected: digest mismatches.
    - Documentation — selected: `deploy/music/README.md` states the evidence rule.
    - Not selected: auth, concurrency, the image.
  - Shape, following `deploy/fonts/prepare_fonts.py` and `fonts.json`.
  - `deploy/music/candidates.json`: `{"version": 1, "candidates": [...]}`. Each candidate has these fields:
    - `id`;
    - `mood`: one of `calm-curious`, `upbeat-corporate`, `neutral-serious` or `loop`;
    - `loop`, `title`, `author`, `licence_url`;
    - `source`: `{url, sha256, size}`, plus an optional `member: {name, sha256, size}` when the track sits inside a zip, as in `fonts.json`;
    - `evidence`: `{"kind": "live"|"archived", "snapshot": <path under deploy/music/evidence/>, "captured", "capture_url"}`. Archived evidence adds `wayback_capture` (`http://web.archive.org/web/<ts>id_/<original audio URL>`, linked on the page) and `wayback_sha1`, the CDX digest of that capture: 32 base32 characters `[A-Z2-7]`. Hex values from the research are converted to base32;
    - `rerelease_note`.
  - `deploy/music/excluded.json` holds `{"version": 1, "excluded": [{"title", "author", "source", "conflict", "reason"}]}`. There is one entry per work. `conflict` is the other licence or the ISRC, or `null` when the work is excluded only because its source needs a login or its terms forbid automated download. The file is seeded with the research's excluded works.
  - Sources must download anonymously over HTTPS. Sources that need a login, or whose terms forbid automated download (Freesound originals, FMA), are out and are recorded in `excluded.json` with that reason.
  - `deploy/music/listening_page.py --output <dir>` does the following:
    - It refuses an existing output directory.
    - It downloads each source, verifies `sha256` and `size` (and the member's, for zips), and, for archived evidence, verifies that the base32 SHA-1 of the downloaded `source` bytes equals `wayback_sha1`. When `member` is present, those bytes are the zip itself, never the member. Audio is written to the output directory as `<id>.<ext>`.
    - It writes `index.html` with:
      - a local `<audio>` per candidate;
      - the evidence link and re-release note;
      - approve/drop controls;
      - an export button producing `{"version": 1, "reviewer", "date", "decisions": [{"id", "decision"}]}`, where `decision` is exactly `approve` or `drop`.
    - `load_decisions` rejects any other `decision` value, an unknown id, a missing candidate and a duplicate id.
    - The manifest loader rejects duplicate ids, and ids not matching `^[a-z0-9-]+$`.
  - Candidate rules:
    - A live CC0 statement, or an archived one whose `wayback_sha1` matches.
    - Site-wide filters and uploader claims alone are excluded.
    - New candidates beyond the research shortlist (scratchpad `research/cc0-music.md`, provided in the brief) are allowed under the same rules.
    - The target is 6 per mood, so that 4 can be approved. Shortfalls are reported, not failed: the spec ships the approved subset.
  - Required evidence: `tests/deploy/test_music_listening.py` (unittest), with a local HTTP server like `serve_font_archive`:
    - The page is generated for two fake candidates (one direct file; one archived zip member, whose `wayback_sha1` is computed over the zip), each with an audio element, an evidence link and a re-release note. A `wayback_sha1` computed over the member instead fails.
    - A sha256 mismatch, a size mismatch, a member mismatch, a `wayback_sha1` mismatch and an existing output directory each fail, with nothing written.
    - The manifest loader rejects a missing field, an unknown mood, and an evidence path outside `deploy/music/evidence/`.
    - `load_decisions` rejects `yes`, an unknown id, a missing candidate and a duplicate id. The loader rejects a duplicate id, a non-slug id and a `wayback_sha1` that is not 32 base32 characters.
    - A static test over the real files checks that every evidence file exists and is under 500 KB, that every `excluded.json` entry has all fields, that no audio binary (`.mp3`, `.wav`, `.ogg`, `.flac`, `.zip`) is tracked under `deploy/music/`, and it prints the per-mood counts.
    - The full OCU unit command passes, and CI is green.
  - Orchestrator (Phase 2): generate the real page once, confirm that every download verifies, and record the per-mood counts.
  - Non-goals: normalization, the image install, approval (#842–#845).

- [ ] 6.2 The user listens and exports decisions. Commit the export as the tracked approval file, linking it. Verify that the file holds one decision per candidate, with the user as approver.
- [ ] 6.3 Write the tracked source manifest for the approved tracks (URL, `source_sha256`, evidence, mood, loop flag, approval link; no audio binaries) and the normalization script (MP3 for non-loop, WAV for loop, -16 LUFS / -1.5 dBTP) that writes the shipped manifest with `shipped_sha256`. Verify with a static test and fixture tracks:
  - approvers match the approval file;
  - the per-mood counts are reported against the target of four;
  - on short fixture tracks, the script's outputs measure within 0.5 LU of -16 LUFS and below -1.5 dBTP with `ffmpeg ebur128`, and a fixture with a wrong `source_sha256` fails naming the track.
- [ ] 6.4 Add the workspace `Dockerfile` step that downloads the sources, verifies `source_sha256`, runs the normalization script and installs the library and shipped manifest at `/opt/video-music/`. Verify in `tests/test-docker-image.sh` that every file exists and matches its manifest `shipped_sha256`, that every file measures within 0.5 LU of -16 LUFS, and that the manifest is readable by the sandbox user.
- [ ] 6.5 Add ducking, looping, the track-length rule and the unknown-id rule to the renderer and `kit check`, reading the manifest from `/opt/video-music/` and, in tests, from a fixture library of short normalized tracks. Verify with fixture renders and `node --test`:
  - narrated windows sit 15 ± 3 dB below the narration, with ramps of 0.5 ± 0.1 s;
  - music `none` gives narration only;
  - a short non-loop track fails the check, naming both lengths;
  - an unknown id fails, listing the valid ids.

Suggested fixture level: expanded - it changes the workspace `Dockerfile`, adds a build-time download, and adds `manifest.json`, a file format read by `kit check` and the renderer.
Minimal mergeable slice: task 6.1, the evidence tooling and the listening page. It ships nothing into the image.

## 7. Image end-to-end test and skill routing (OCU)

- [ ] 7.1 Extend `tests/test-docker-image.sh` with an offline `new` → `voice-import` (fixture audio) → `timeline` → `check` → `status` → `render` inside the built image, on a fixture script at the timeline's 60-second minimum. Verify that it passes in CI's sandbox-image smoke step on the PR's image.
- [ ] 7.2 On an integration branch, not merged before acceptance, rewrite `skills/public/remotion/SKILL.md` as a router of at most 80 lines:
  - explainers follow the kit steps in order, including image import and "fix and re-check on any no";
  - other types keep the existing workflow;
  - the vendored guidance is read only for `custom`.

  Move the render mechanics into a reference file. Update `tests/test_remotion_image.py` to pin the steps and the 80-line limit, and extend 4.6's static test so the skill's kind list equals the approved set. Verify with the updated test on the integration branch.

Suggested fixture level: compact - task 7.1 adds a test, and task 7.2 changes skill text that a static test pins; the runtime behavior is covered by groups 3–6.
Minimal mergeable slice: task 7.1 merges on its own. Task 7.2 merges only after task 8.2 passes.

## 8. After run and acceptance

- [ ] 8.1 Build the release candidate from `main` plus the integration branch, with the WebUI image unchanged. Run the request set on the evaluation stack, including 7.1's checks on the candidate image. Verify that 13 final-outcome manifests, one per request and repetition, are recorded with the same WebUI digest as the baseline.
- [ ] 8.2 Generate the blind judging page for the ten explainer pairs, with a sealed key, and collect the user's votes. Apply the missing-side rules, open the key, and compare against both thresholds. Record the votes and the result in this change. Verify the outcome:
  - acceptance: ≥8/10 wins, with void pairs counted as losses, and both thresholds met. Merge task 7.2.
  - otherwise: record the failure, and leave task 7.2 unmerged.
- [ ] 8.3 After acceptance, pin the merged OCU commit in WebUI `constraints.yaml` and add the decision record. Verify `make doc-gate` and `make decisions-verify`.

Suggested fixture level: compact - evaluation execution, a pin bump and a decision record.
Minimal mergeable slice: atomic - the pin bump is the only code change, and it lands only after acceptance passes.
