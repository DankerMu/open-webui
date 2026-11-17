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

- [x] 2.2 Write the evaluation adapter with two routes:
  - **speech:** accepts OCU's request with `mp3`/`wav`, `voice` and `instructions`, calls dmxapi `chat/completions` with `mimo-v2.5-tts`, and returns 502 without the key on upstream failure;
  - **images:** accepts WebUI's `openai`-engine generation request (JSON `/images/generations`) and edit request (multipart `/images/edits`, files as `image` or `image[]`). It forwards both to dmxapi `/v1/responses` with `prompt` as `input`, edit files as `data:` URLs in `image`, without `n` and with `watermark` false. It rejects `n` other than 1 with 400, returns the OpenAI images shape, and returns 502 without the key on upstream failure.

  Verify each route with:
  - unit tests on recorded responses: success (both audio formats with the content types `speech.py` accepts; image `b64_json`, returned also when the caller asks for `url`), an upstream error, a timeout and a wrong-type response;
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

  **Task 2.2 image-routes required evidence** (issue #853; extends #817's `deploy/eval/adapter/eval_adapter.py`):
  - Triage: feature (evaluation tooling). Fixture level expanded, agreeing with upstream: the adapter gains routes that accept uploads and spend the provider key.
  - Governing invariant: as in #817. The provider key leaves the adapter only toward dmxapi, never through a redirect, and no response or log line holds it. In addition, the adapter token never leaves the stack: WebUI fetches a returned `data[].url` with its image `Authorization` header (`backend/open_webui/routers/images.py` ~676-680 and ~1055-1059), which holds the adapter token. So the adapter never returns a `url`.
  - Risk packs:
    - Auth / secrets — selected: the token check on both routes, the provider key, the `url` leak path above.
    - Error handling — selected: 400 / 401 / 413 / 502, and an exception catch-all shared by every route.
    - Public API — selected: WebUI's `openai` image engine is the consumer. Generation sends `model`, `prompt`, `n` (int, default 1), `size`, `response_format: "b64_json"`, then the configured extras (`images.py` ~643-661; `openai_request_params` drops `aspect_ratio_sizes`). An edit sends multipart text fields as `str`, `n` only when set, no extras, and files under `image` (one) or `image[]` (a list) (`images.py` ~996-1043). The model's `edit_image` tool sends one `image[]` file without `n` or `background` (`backend/open_webui/tools/builtin.py` ~477, `utils/middleware.py` ~1825). WebUI reads `res['data'][*]['url']` or `['b64_json']` after `raise_for_status`.
    - Resource limits — selected: inbound body caps, upstream read and decoded-image caps, the timeout, a memory limit on the service.
    - Legacy compatibility — selected: #817's speech route and its tests.
    - Config — selected: `mem_limit` on `adapter`.
    - Release / dependency — not selected: multipart parsing uses `python-multipart`, already a direct requirement of the server image (`computer-use-server/requirements.txt`, `python-multipart==0.0.26`, also in the baseline release `01b7ef7a64a5`). No requirement changes.
    - File IO — not selected: the adapter writes no file. Starlette spools an upload over 1 MiB to `/tmp`, which uid 65534 can write in the `python:3.12-slim` image; nothing else is written.
    - Not selected: schema, concurrency (stateless), file publish (WebUI stores the image).
  - Sibling surfaces: #817's speech route (shares the token check, redactor, upstream client, caps and the new catch-all); WebUI's image settings in 2.4 (#819), which the orchestrator sets only minimally here.
  - Upstream contract, measured by the orchestrator on 2026-11-17 UTC (recordings handed to the implementer, `b64_json` truncated to 1536 decoded bytes, the signed CDN URL replaced, no key):
    - `POST https://www.dmxapi.cn/v1/responses` with `{"model", "input", "size", "watermark": false, "response_format": "b64_json"}`; an edit adds `"image": ["data:<type>;base64,…"]`. The recorded edit sent JPEG bytes declared as `image/png` and got 200.
    - Success: 200 `application/json` in the OpenAI images shape, `{"model", "created", "data": [{"b64_json", "size", "output_format": "jpeg", "background"}], "usage"}`, in 9–15 s at ¥0.12. Without `response_format` the item carries a signed `url` instead.
    - A size below 921600 pixels gives 502 with `error.message` `upstream API error (status 400): {"error":{"code":"InvalidParameter",…}}` and an empty `error.param`.
  - Shape (`deploy/eval/adapter/eval_adapter.py`):
    - Both routes check the adapter token first, before reading or parsing the body; otherwise 401 with no upstream call.
    - `POST /v1/images/generations`, JSON. Required non-empty string `model` and `prompt`. `n` absent or the integer 1; any other `n` (including `true` and `2`) is 400 with no upstream call. Optional string `size`, and `response_format` `b64_json` or `url`. Every other key is a configured extra parameter, forwarded unchanged, except `input`, `image` and `watermark`, which the adapter sets and which are 400.
    - `POST /v1/images/edits`, multipart. Text fields `model` and `prompt` (required), `size`, `response_format`, `n` (absent or `"1"`), `background` (accepted and not forwarded, since the upstream behavior is unmeasured); any other text field is 400. One or more files under `image` or `image[]`, each with a declared `image/png`, `image/jpeg` or `image/webp` content type and non-empty bytes; otherwise 400. The declared type is forwarded as given: the bytes are not sniffed, and bytes that disagree with the declared type are not refused, because WebUI labels a generated image stored from `b64_json` as `image/png` whatever its bytes (`images.py` ~520-522, ~964-967), and that image is what an edit sends back.
    - Upstream request: `{"model", "input": <prompt>, "size"?, <extras>, "watermark": false, "response_format": "b64_json"}`, plus for edits `"image"`: one `data:<declared type>;base64,<bytes>` URL per file in upload order. Never `n`, never `prompt`.
    - Response: 200 `{"created": <upstream created, else now>, "data": [{"b64_json": …}]}`, always `b64_json` whatever the caller's `response_format`; no upstream `url`, `usage` or other field is passed on.
    - 502, through #817's redact-then-cut error body, for: an upstream non-2xx or 3xx; a timeout (180 s: WebUI's image session has no total timeout when `AIOHTTP_CLIENT_TIMEOUT` is unset, as in the stack, so the adapter bounds the call, far above the measured 9–21 s); a transport error; a non-JSON body; `data` missing, empty or holding an item without a non-empty string `b64_json` (so a `url` item); invalid base64; decoded bytes that start like none of JPEG (`FF D8 FF`), PNG (`89 50 4E 47`) or WebP (`RIFF….WEBP`); an upstream body over `ceil(MAX_IMAGE_BYTES × 4/3) + 64 KiB`; a decoded image over `MAX_IMAGE_BYTES` (50 MiB).
    - Inbound caps, enforced while reading (a declared `Content-Length` over the cap, and a chunked body that crosses it, both give 413 with no upstream call): 1 MiB for the two JSON routes (speech included), 64 MiB for edits.
    - Shared layer, applied to every route including speech:
      - an exception handler or middleware turns any unexpected exception into a redacted 502 that names only the exception class, so a new route cannot bypass it;
      - the redacting filter also redacts `exc_text` and the formatted `exc_info` of a record (or replaces `exc_info` with its redacted text);
      - one upstream client with the cap and timeout as parameters, not a copy per route.
  - Allowed changes to #817's files, each named in the PR (a scope revision recorded on #853):
    - `eval_adapter.py`: the two routes, the shared layer above, speech's 1 MiB inbound cap and its move onto the shared catch-all and client. Speech's other behavior is unchanged.
    - `compose.eval.yml`: `mem_limit: 1g` on `adapter` (one 64 MiB edit holds a few copies of the image); nothing else.
    - `README.md`: one paragraph on the image routes, the `b64_json`-only response and why.
    - `tests/deploy/test_eval_adapter.py`: new tests; existing tests change only where the shared layer moves a symbol.
    - `tests/deploy/test_eval_stack.py`: the `mem_limit` assertion.
  - Must preserve: #817's speech contract and what its tests assert; `computer-use-server/speech.py`; every production file; WebUI code (user decision 2026-11-16: image-generation code is not touched).
  - Reading of #853's acceptance criteria: "`b64_json` and `url` responses" means a caller asking for `url` still gets `b64_json`, and an upstream `url` item is a 502.
  - Required evidence, each test red before the change, in `tests/deploy/test_eval_adapter.py` with the recordings committed under `tests/deploy/fixtures/eval_adapter/`:
    - 401 with no upstream call for a missing and for a wrong token on each image route; on the edit route, with a body over the edit cap, still 401, showing the token is checked before the body is read.
    - Generation, with the literal payload WebUI's `openai` engine builds (`model`, `prompt`, `n: 1`, `size: "2048x2048"`, `response_format: "b64_json"`, plus one extra key): the upstream request equals the recorded `gen_b64` request plus the extra key, with no `n` and no `prompt`, and the provider key as Bearer. The response is 200 with exactly `created` and `data: [{"b64_json"}]`, the recorded value.
    - A caller `response_format: "url"` still sends `b64_json` upstream and returns `b64_json`.
    - Edit, built with `aiohttp.FormData` the way WebUI builds it (text fields as `str`, files with filename and content type):
      - one `image` file;
      - two `image[]` files of different types;
      - the model tool's form: one `image[]` file of JPEG bytes declared `image/png`, no `n`, no `background`, forwarded as `data:image/png;base64,…` and answered with the recorded `edit_b64` response.

      The upstream `image` list holds exactly one `data:` URL per file, in order, with each declared type and exact base64. `n` `"1"` is accepted; `background` is not forwarded.

    - 400 with no upstream call: `n` 2, `n` `"2"` on an edit, `n` `true`, a missing or empty `prompt`, the extra key `watermark`, an unknown edit field, an edit without files, a file declared `text/plain`, an empty file.
    - 413 with no upstream call: a declared and a chunked body over each cap (the caps patched small).
    - 502 for each failure above, including the recorded `bad_size` response (the body holds `InvalidParameter`) and the recorded `gen_default_format` response (a `url` item without `b64_json`).
    - The catch-all: an injected exception whose text holds the planted key, raised inside a route, gives a 502 naming only the class; neither the key nor a traceback holding it appears in any captured log. A record logged with `exc_info` whose exception text holds the key comes out redacted.
    - #817's log-redaction tests extended to an image route's access line.
    - `tests/deploy/test_eval_stack.py`: `adapter` has `mem_limit` 1 GiB, and nothing else in its shape changes.
    - The orchestrator's full OCU unit run on the frozen head passes.

  - Orchestrator on 210.77.77.27 (Phase 2), with the `src` checkout at the PR head:
    - `start.sh` exits 0; `ocu-eval-adapter` is healthy with `RestartCount` 0.
    - On the host, `ADAPTER_TOKEN` is read from `${EVAL_ROOT}/stack.env` and passed to a script in `ocu-eval-open-webui` only on stdin (`docker exec -i`), never on argv or in output. `open-webui` holds no `ADAPTER_TOKEN` in its environment, and that stays so. The script signs in as the admin from the container's own `WEBUI_ADMIN_*`.
    - It sets the image config through WebUI's image config API, reading the full config first and posting it back whole, because every field of the update form is required:
      - `ENABLE_IMAGE_GENERATION` and `ENABLE_IMAGE_EDIT` true (both default false, and the routes return 403 while off);
      - both engines `openai`, both base URLs `http://adapter:8090/v1`, both keys the token (unset, they default to the provider key and dmxapi);
      - model `doubao-seedream-5-0-flash-260915` and size 2048×2048 for both.

      Read back: the engines, URLs, model and size equal those values, and both keys equal the token, compared and never printed.

    - Through WebUI's API: one image generation and one edit of the generated image each return a stored file whose bytes start like JPEG, PNG or WebP. The adapter's log shows each route with status 200.
    - Counts only: the key and the token are found 0 times in `docker logs` of `ocu-eval-adapter` and `ocu-eval-open-webui`.
    - After the edit, `ocu-eval-adapter` has `RestartCount` 0 and `State.OOMKilled` false.
    - `stop.sh`; the snapshot diff is as in 2.1.

  - Non-goals: the aspect-ratio table and the rest of 2.4's settings (#819), the driver, any WebUI code change.

- [x] 2.3 Write the driver and the cleanup script. The driver:
  - runs on the evaluation host, started detached by the orchestrator over SSH;
  - creates a chat with `qwen3.8-27b`, the video switch and image generation on;
  - sends one request with a 60-minute limit;
  - collects the transcript, the MP4 and a run manifest with every field the spec names.

  The stack keeps the orchestrator data directory under `/home/nwm/ocu-eval/`. Cleanup removes only project-loaded images, compose containers, networks and volumes, and the recorded chat ids' sandbox containers, volumes and data directories. Verify:
  - one explainer request end to end;
  - the container, image, network and volume lists of other projects are identical before and after cleanup;
  - a key search that never prints the key finds nothing under `/home/nwm/ocu-eval/` and in the project's container logs.

  **Task 2.3 required evidence** (issue #818):
  - Triage: feature (evaluation tooling). Fixture level expanded, agreeing with upstream: it drives the shared host's stack, handles the admin credentials and removes Docker objects.
  - Governing invariant: cleanup removes exactly the project's objects and nothing of another project; no run artifact, log or output holds the provider key, the adapter token or the admin password; every chat the driver may have created is in the ledger before it can be lost.
  - Precondition: #820 is merged (`deploy/eval/requests.json` on OCU main). The orchestrator checks this before Phase 1, and Phase 2 takes request ids from that file.
  - Deviation from the plan, settled here: the driver runs on the evaluation host, not on the Mac through an SSH tunnel (design Decision 15 amended; the spec names no tunnel, and issue #818's "opens an SSH tunnel" is superseded by this block). A run lasts up to 60 minutes, and during #816 an SSH session to the host hung with its remote command already finished. A detached host process survives that, and the admin credentials never leave the host. The orchestrator starts it over SSH and copies results back.
  - Risk packs:
    - Auth / secrets — selected: the admin credentials from `stack.env`, value redaction, the key search.
    - Concurrency / shared state — selected: shared-host Docker objects, cleanup's exact-name scope, the lock between driver and cleanup.
    - Resource limits — selected: the per-run 15 GiB floor, the 60-minute limit.
    - Error handling — selected: the outcome table, reruns, non-idempotent POST, refusals.
    - File IO / overwrite — selected: run directories, the ledger, root-owned data directories, copying from a sandbox-writable directory.
    - Schema — selected: `manifest.json` version 1 is a new file format that tasks 2.6, 2.7 and 8.1 and the judging page read.
    - Public API — selected: WebUI's chat, task, chat-list, model, function and config APIs, as consumed (read only).
    - Documentation — selected: the README section.
    - Legacy compatibility — selected: #816/#817/#853 scripts and tests stay green; `start.sh`, `stop.sh` and `load.sh` behave as before.
    - Not selected: config (the driver reads configuration and never writes it), release / dependency (standard library only).
  - Sibling surfaces: `common.sh` (env parsing, `eval_require_space`, compose wrapper), `stop.sh`, `load.sh`'s `loaded-images.txt` and `images.env`, `requests.json`, OCU `computer-use-server/docker_manager.py` (sandbox `owui-chat-<id>`, volume `chat-<id>-workspace`, data `${BASE_DATA_DIR}/<id>/outputs` mounted as `/mnt/user-data/files`, root-owned mode 0777), `computer-use-server/mcp_tools.py` and `speech.py` (speech error texts), WebUI 6b95a4995 `main.py`, `utils/middleware.py`, `tools/builtin.py` and `routers/images.py` (the contract below).
  - WebUI contract consumed (6b95a4995; read only):
    - `POST /api/chat/completions` with `parent_id: null` and no `chat_id` creates the chat server-side, saves the user message and an assistant placeholder, and answers at once with `{status, task_ids, chat_id}` when `session_id` is non-empty; the tool loop runs as a background task (`main.py` ~1190-1394, ~1776-1854). `session_id` also enables `generate_image` and `edit_image` (`utils/middleware.py` ~2769-2773). The prompt reaches the model only through the saved user message.
    - The tool loop runs only on the streaming path, so `DEFAULT_MODEL_PARAMS.stream_response` must be true.
    - `GET /api/tasks/chat/{chat_id}` lists live tasks, and also answers an empty list for an unknown or foreign chat. `POST /api/tasks/chat/{chat_id}/stop` cancels.
    - `GET /api/v1/chats/{chat_id}`: the assistant message has `done`, optional `error` (`{content}`), and `output` items `{"type": "function_call", "name", "call_id", "arguments", "status"}` and `{"type": "function_call_output", "call_id", "output": [{"type": "input_text", "text"}], "status"}`.
    - Result texts the outcome table reads: the tool-iteration cap writes the message error `Tool-call limit reached (<n> iterations).` (`utils/middleware.py` ~6036-6042); a failed speech synthesis returns text starting `Error: speech synthesis` (OCU `speech.py`, `mcp_tools.py` ~880-899); an image engine failure returns JSON whose `error` starts `400: [ERROR:` (`routers/images.py` ~848-852 and ~1207-1212 through `tools/builtin.py`). An image call that fails without an HTTP status (adapter unreachable, timeout, no image in the answer) gives `400: Something went wrong :/` (`constants.py` `_error_message`). The OCU tool wrapper reports its own transport faults with text starting `[CONFIG ERROR]`, `[NETWORK ERROR]`, `[MCP TRANSPORT ERROR]`, `[UNEXPECTED ERROR]` or `[Timeout`, or containing `wrapper crashed` after `[Error] ` (OCU `openwebui/tools/computer_use_tools.py` `_ERROR_PREFIXES` and ~866). Argument errors (text length, file name, aspect ratio) have other texts and are not infrastructure failures.
    - `GET /api/v1/chats/?page=1` lists the user's chats newest first.
  - Shape (`deploy/eval/`):
    - `run.sh --package <dir> --phase baseline|after|smoke [--request <id>] [--repetition <n>]`: checks the root and port, exports `stack.env` and `images.env` through `common.sh`, and runs `driver.py` with `python3 -I` (the host's Python 3.10, standard library only). `smoke` is for runs that are neither baseline nor after run. Without `--request` it runs the whole of `requests.json` in file order with each request's `repetitions`; with `--request` and no `--repetition`, repetition 1. It writes one line per attempt and a final line `eval: done <exit status>` to stdout, and exits 0 when every attempt ended with a manifest, whatever its outcome.
    - Lock: the driver holds an exclusive `flock` on `${EVAL_ROOT}/eval.lock` for the whole batch; `cleanup.sh` takes it with `flock -n` and refuses while a driver holds it.
    - Per run, before anything else: `eval_require_space 0` of `common.sh` through `bash`. A refusal names both values, and stops the batch with a non-zero exit before any further POST.
    - Preflight, once per batch, refusing with a named reason before any chat is created:
      - the running `ocu-eval-*` containers' image ids equal those of `images.env`, and each `images.env` reference equals the package's `release.json` `images.<role>.reference`;
      - `qwen3.8-27b` exists in `GET /api/models` and its `filters` hold `video_production_filter`;
      - functions `computer_use_filter` and `video_production_filter` are active and global;
      - the image config has generation and editing on, engine `openai`, base URL `http://adapter:8090/v1`;
      - `DEFAULT_MODEL_PARAMS.function_calling` is `native` and `stream_response` is true.
    - The request body, exactly: `stream: true`; `model: "qwen3.8-27b"`; `params: {}`; no `messages` (the frontend sends none without a system prompt); `files: []`; `filter_ids: ["video_production_filter"]`; `tool_ids: []`; `tool_servers: []`; `features: {"voice": false, "image_generation": true, "code_interpreter": false, "web_search": false}`; `variables` with the keys `{{USER_NAME}}`, `{{USER_EMAIL}}`, `{{USER_LOCATION}}` (`Unknown`), `{{CURRENT_DATETIME}}`, `{{CURRENT_DATE}}`, `{{CURRENT_TIME}}`, `{{CURRENT_WEEKDAY}}`, `{{CURRENT_TIMEZONE}}` (`Asia/Shanghai`), `{{USER_LANGUAGE}}` (`zh-CN`); `chat_variables: {}`; `session_id: "eval-<uuid4>"`; `id` and `message_ids: [{"model_id": "qwen3.8-27b", "message_id": <id>, "modelIdx": 0}]` for the assistant; `parent_id: null`; `user_message: {"id", "parentId": null, "childrenIds": [<assistant id>], "role": "user", "content": <prompt>, "timestamp": <unix seconds>, "models": ["qwen3.8-27b"]}`; `background_tasks: {"title_generation": true, "tags_generation": true, "follow_up_generation": true}`. All ids are fresh UUID4s.
    - Run directory `${EVAL_ROOT}/runs/<phase>/<request id>/r<repetition>-a<attempt>/`, where attempt is the next free number. It is created before the POST, and `pending.json` (`user_message_id`, `started_at`) is written into it first.
    - POST: retried up to 3 times only when the connection was refused before the request was sent. When the request was sent and the answer was lost (timeout, reset, non-JSON), the driver does not POST again: it lists `GET /api/v1/chats/?page=1`, fetches each chat updated since `started_at`, and takes the one whose history holds the user message id; none found means `infra` with reason `post lost`.
    - Ledger: the chat id is appended to `${EVAL_ROOT}/chats.txt` (under the lock, `O_APPEND`) and written to `pending.json` before the driver waits.
    - Waiting: polls the task list every 15 s, retrying a failed GET up to 3 times and signing in again on 401. When the list is empty, it fetches the chat; a 404 means `infra` (`chat missing`). At 60 minutes from the POST it calls the stop endpoint and waits up to 2 minutes for the list to empty.
    - Interrupted runs: a run directory without `manifest.json` from an earlier driver process gets a manifest with outcome `failed`, class `infra`, reason `driver interrupted`, and its chat id from `pending.json`, or, when `pending.json` holds none, from the chat-list lookup by `user_message_id` that a lost POST uses (appended to the ledger if missing); it counts as an attempt.
    - Run files, besides `pending.json`:
      - `transcript.json`: the chat from `GET /api/v1/chats/{id}`, with every string over 4096 characters starting `data:` replaced by `<data-uri sha256=… bytes=…>`;
      - the MP4 files: only regular files directly in `${EVAL_ROOT}/data/<chat id>/outputs/` whose names end `.mp4`, checked with `lstat` and opened with `O_NOFOLLOW`, no recursion; any other entry ending `.mp4` is not copied and is listed in the manifest's `skipped_outputs` with the reason;
      - `manifest.json`, written last through a temporary file and a rename.
    - Redaction by value: before anything is written to a run file, stdout or stderr, every value of `stack.env`, the provider key and the signed-in token are replaced by `[REDACTED]`. `run.sh` reads the key file `${EVAL_KEY_FILE:-$HOME/.ocu-eval-dmxapi.key}` after `eval_require_private`, as `start.sh` does, and hands it to the driver on stdin, never in argv or the environment. `failure_reason` is cut to 200 characters after redaction.
    - `manifest.json` (version 1): `phase`, `request_id`, `kind`, `repetition`, `attempt`, `chat_id`, `release` (`ocu_source_sha`, `webui_source_sha`, the package's `release.json` SHA-256, and per role the reference and the running image id), `webui_image_id`, `models` (`chat` `qwen3.8-27b`; `image` and `image_edit` from the image config; `speech` from `docker exec ocu-eval-computer-use-server printenv TTS_MODEL`), `started_at`, `elapsed_seconds`, `outcome` (`succeeded` or `failed`), `failure_class` (`null`, `infra`, `kit` or `model`), `failure_reason` (`null` or a string), `check` (`null` until the kit exists), `counts` (`tool_calls`, `image_calls`, `speech_calls`), `mp4` (per file: name, size, SHA-256, `ffprobe` duration and video codec, `valid`), `skipped_outputs`.
    - Counting, from the assistant message's `output`: every `function_call` is a tool call; `generate_image` and `edit_image` are image calls; `generate_speech` is a speech call. Result texts are the joined `text` of `output[*]` of the matching `function_call_output`.
    - MP4 check: `docker run --rm --network none --entrypoint ffprobe -v <run dir>:/run:ro <DOCKER_IMAGE of images.env> -v error -show_entries format=duration:stream=codec_type,codec_name -of json /run/<name>`, since the host has no ffmpeg. A valid MP4 has a video stream and a duration above 0.
    - Outcome, the first matching row wins:

      | #   | Condition                                                                                                                                                                                                                                 | Outcome     | Reason                                                                                      |
      | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
      | 1   | the run reached its end without a stop, the message is `done` with no `error`, and at least one valid MP4 exists                                                                                                                          | `succeeded` | —                                                                                           |
      | 2   | the driver called the stop endpoint                                                                                                                                                                                                       | `model`     | `time limit`                                                                                |
      | 3   | a `function_call` named `ask_user` has status `pending`                                                                                                                                                                                   | `model`     | `asked the user`                                                                            |
      | 4   | the message `error` starts `Tool-call limit reached`                                                                                                                                                                                      | `model`     | `tool-call limit`                                                                           |
      | 5   | the message holds any other `error`                                                                                                                                                                                                       | `infra`     | `model API: <error>`                                                                        |
      | 6   | the task list is empty and the message is not `done`                                                                                                                                                                                      | `infra`     | `task lost`                                                                                 |
      | 7   | the driver's WebUI calls failed after their retries, or the POST was lost                                                                                                                                                                 | `infra`     | the call                                                                                    |
      | 8   | no valid MP4, and a speech result starts `Error: speech synthesis`, an image result's JSON `error` starts `400: [ERROR:` or equals `400: Something went wrong :/`, or any OCU tool result carries a wrapper transport prefix listed above | `infra`     | `adapter: <tool>` for speech and image results, `orchestrator: <tool>` for wrapper prefixes |
      | 9   | anything else                                                                                                                                                                                                                             | `model`     | `no valid MP4`                                                                              |

      A failed run keeps its MP4 files and their `mp4` entries. `kit` is reserved: no run gets it until tasks 5.1 and 5.3 define the kit's failure output, but the schema accepts it.

    - Reruns: an `infra` outcome is rerun at most twice, each attempt in its own run directory and manifest.
    - `cleanup.sh [--runs-only]`, exiting 0 only when every target is gone:
      - takes the lock (refuses if held); reads `chats.txt` and refuses, naming the line, if any line is not a lowercase UUID;
      - for each id: `docker rm -f owui-chat-<id>` and `docker volume rm chat-<id>-workspace` when they exist; then `docker run --rm --network none --user 0:0 --entrypoint rm -v ${EVAL_ROOT}/data:/d <DOCKER_IMAGE> -rf -- /d/<id>`;
      - without `--runs-only`: first the compose down of `stop.sh`, then the per-id steps, then `docker volume rm` of each volume listed by `docker volume ls --filter label=com.docker.compose.project=ocu-eval` whose name starts `ocu-eval_` (WebUI keeps the provider settings and the adapter token in its database), then the images: each `loaded-images.txt` reference, and each `repo:tag` (or id when untagged) of the images listed by `docker image ls --filter label=ocu-eval`, with `docker image rm` and no `-f`, skipping absent ones. Every helper run comes before the first image removal, since the helper uses a project image. If any per-id step failed, image removal is skipped entirely, so the helper image stays for the next run, and the exit is non-zero. Only when all of these images are gone are `images.env` and `loaded-images.txt` removed; otherwise both stay and the exit is non-zero;
      - rewrites `chats.txt` through a temporary file and a rename, keeping the ids whose objects could not all be removed;
      - is idempotent: a second run after a partial failure finishes the rest;
      - never runs `prune`, `system`, `docker image rm -f`, or a removal of a name it did not compute; `runs/`, `stack.env`, `src/` and `packages/` stay.
    - `README.md`: a section on running a request, the run directory and manifest, the outcome table and reruns, cleanup and its two modes, the lock, and appending a chat id by hand for a chat made outside the driver.

  - Must preserve: `start.sh`, `stop.sh`, `load.sh`, `secrets.sh`, the adapter, `compose.eval.yml` and their tests unchanged in behavior (`common.sh` may gain shared helpers); every production file; WebUI code.
  - Required evidence, each test red before the change (`tests/deploy/test_eval_driver.py` and `tests/deploy/test_eval_cleanup.py`, unittest, own recording stubs for `docker` and `df` on `PATH`, and a fake WebUI HTTP server on 127.0.0.1; the lock tests use the real `flock(1)` and the real `fcntl` lock):
    - The completion request body equals the shape above, key for key.
    - The chat id is in `chats.txt` and `pending.json` when the first poll fails and the driver exits.
    - A POST whose answer is dropped after the server created the chat is not repeated, and the chat is found through the chat list and recorded; a refused connection is retried.
    - Each preflight failure, `stream_response` false included, refuses before any POST, naming the reason.
    - The free-space check below the floor (a fake `df`) refuses with both values and no POST, and stops the batch.
    - The time limit (patched to seconds) calls the stop endpoint and gives `model` with reason `time limit`.
    - Every row of the outcome table from a fake chat, including: a valid MP4 with the tool-call limit error gives `model`; an argument error from `generate_speech` without an MP4 gives `model` (row 9), and an `Error: speech synthesis` result gives `infra` (row 8); an image `400: [ERROR:` result gives `infra`; an empty task list with `done` false gives `infra` `task lost`; an invalid MP4 (fake `ffprobe` without a video stream) gives `model`.
    - An `infra` outcome reruns twice and stops, leaving three attempt directories and manifests; a success on the second attempt stops there.
    - A run directory without a manifest from an earlier process gets the `driver interrupted` manifest and counts as an attempt; the next attempt number is free. With no chat id in `pending.json`, the chat is found by its user message id and added to the ledger.
    - Row 8 from each source: an image `400: Something went wrong :/` result, and an OCU tool result starting `[MCP TRANSPORT ERROR]`, each without an MP4, give `infra`.
    - Counts from a fake `output` with mixed calls equal the hand count.
    - `manifest.json` holds every field above with the right types; `release` values come from the fake package and the fake running image ids, and a mismatch refuses in preflight.
    - A `data:` URI over 4096 characters in the fake chat is replaced in `transcript.json`.
    - An `.mp4` symlink in `outputs/` pointing at a planted secret file is not copied, and `skipped_outputs` names it.
    - The admin password, a planted provider key and the adapter token, planted by the fake WebUI in the image config answer and in the chat content, never appear in stdout, stderr, any run file or any command line.
    - The lock: cleanup refuses, with no Docker command, while a driver process holds it; it proceeds once that process exits.
    - Cleanup:
      - a malformed `chats.txt` line refuses with no Docker command;
      - `--runs-only` issues exactly the per-id removals and the helper (the argv above), and touches no compose object, volume or image;
      - the full mode issues compose down, the per-id removals, the helper before any image removal, the labelled-volume removals, and `docker image rm` without `-f` for each listed and labelled image, and nothing else;
      - absent objects are skipped without failing; `chats.txt` keeps the ids whose removal failed; a failed image removal keeps `images.env` and `loaded-images.txt` and exits non-zero; a failed helper removal issues no `docker image rm` and exits non-zero; a second run finishes;
      - no `prune`, `system`, `image rm -f`, or name outside the computed set appears in any recorded command.
    - The orchestrator's full OCU unit run on the frozen head passes.
  - Orchestrator on 210.77.77.27 (Phase 2), `EVAL_ROOT=/home/nwm/ocu-eval` and `EVAL_WEBUI_PORT=38080` (as in #816 and #853), its `src` checkout at the PR head, package `/home/nwm/ocu-eval/packages/ocu-0fc3c37-webui-6b95a49`, the stack started with `start.sh` (the image config of #853 is in the WebUI volume):
    - Append the probe chat ids left by #816 and #817 (`4c3f5b49-3291-4fdb-903a-7a1faf5a5160`, `24db1774-0670-4d5d-8408-07f9c3933c14`) to `chats.txt`.
    - Run `mkdir -p ${EVAL_ROOT}/snap/818-smoke`, then start `setsid nohup deploy/eval/run.sh --package <package> --phase smoke --request <the first explainer id> >${EVAL_ROOT}/snap/818-smoke/run.log 2>&1 &`, and poll that log with short SSH calls until its `eval: done` line.
    - The run directory holds `transcript.json`, `manifest.json` and an MP4, or a recorded failure with its class; every manifest field is present.
    - Counts only, with the values on stdin, never printed: the provider key is found 0 times in every file under `${EVAL_ROOT}`; the adapter token and the admin password are found 0 times under `${EVAL_ROOT}` outside `stack.env`; both searches run in a helper `docker run --rm -i --network none --user 0:0 --entrypoint grep -v ${EVAL_ROOT}:/r:ro <workspace image> -r -l -F -f /dev/stdin /r`, which reads files the host user cannot; and 0 times in `docker logs` of every `ocu-eval-*` container and every ledger sandbox.
    - Snapshot the container, image, network and volume lists, and copy `loaded-images.txt`; run `cleanup.sh`; snapshot again. Removed = exactly the project's objects (`ocu-eval-*` containers, the networks and volumes labelled `com.docker.compose.project=ocu-eval` (`ocu-eval_default`, `ocu-eval_*`), the ledger's sandboxes and volumes, the copied `loaded-images.txt` images and any `ocu-eval`-labelled image); added = nothing; any other difference is explained line by line as another project's. `${EVAL_ROOT}/data` holds no ledger id, and `chats.txt` is empty.
    - Then reload the package with `load.sh` and leave the stack stopped. The image config is gone with the WebUI volume; task 2.4 (#819), which runs next, writes it again.
  - Non-goals: the request set (#820), the image settings of 2.4 (#819), the baseline run (2.6), the `kit` failure markers (5.1, 5.3).
  - Amended after implementation and three review rounds (OCU #240, 2026-11-17). Where these differ from the bullets above, these bind:
    - WebUI 6b95a4995 answers an unknown chat with HTTP 401, not 404. The driver signs in once more, and a second 401 gives row 7 with reason `GET /api/v1/chats/<id>: HTTP 401`. The 404 `chat missing` branch stays as a defensive branch only.
    - A POST answered with an HTTP error status is also looked up by its user message id. When no chat is found, the reason is `POST /api/chat/completions: HTTP <status>`.
    - When the answer was lost and the lookup itself fails, the driver writes no manifest. It keeps `pending.json` without a chat id, stops the batch with a non-zero exit and a named reason, and the next run's recovery repeats the lookup.
    - When a WebUI call fails after the chat id is known and the driver has not called stop, it makes one best-effort stop call before collecting.
    - The first sign-in of a batch retries a refused or reset connection, 5 tries 3 s apart. Wrong credentials fail at once.
    - A second driver refuses on the held lock instead of waiting. `chats.txt` must be a regular file, not a symlink. It holds only ids, so mode 0600 is not required.
    - Rerun budget: a (phase, request, repetition) slot gets 3 minus the number of consecutive `infra` manifests at the end of its attempts on disk. Recovered `driver interrupted` manifests are `infra`. A slot whose latest attempt is not `infra` starts fresh. A slot with no attempt left is skipped with a `no attempt left` line, which does not change the exit status. A repetition above the request's `repetitions` is refused.
    - An interrupted attempt's manifest holds `release`, `webui_image_id`, `models`, `counts`, `elapsed_seconds` and `check` as `null`, and `mp4` as `[]`. Its stack may have differed from the current one.
    - Collection:
      - only the first 20 `.mp4` entries are considered, and the rest become one entry `{"name": "outputs", "reason": "<n> more .mp4 entries"}`;
      - names that vanish, are not UTF-8, or fail mid-copy are skipped with a reason;
      - a file over 4 GiB is skipped as `too large`, a model fault;
      - a file larger than the run directory's free space, or a write that hits ENOSPC or EDQUOT, is skipped as `no space`, and the partial copy is deleted;
      - the 15 GiB floor applies to Docker's root filesystem only, before each attempt, not to the copy.
    - Outcome table row 7a, between rows 7 and 8: no valid MP4, and a `no space` skip or a collection fault, gives `infra` with reason `disk: no space for <name>` or `driver: collect failed: <class>`. An `unreadable` skip (a permission or I/O error) stays row 9 `model`.
    - stdout carries, besides one line per attempt and `eval: done <status>`, a line per recovered attempt and per skipped slot. A newline inside a reason is folded to a space. stderr may carry `could not stop chat`.
    - Cleanup: a failed compose down skips image removal, keeps `images.env` and `loaded-images.txt`, and exits non-zero. Without `images.env`, a remaining project-labelled container or network makes it exit non-zero.

- [x] 2.4 Configure WebUI image generation and image editing in the stack on the `openai` engine: base URL the adapter, the adapter token as key (the adapter holds the dmxapi key), model `doubao-seedream-5-0-flash-260915`, default size 2048×2048, the aspect-ratio table of Decision 15, editing on. No code changes. Verify:
  - the stored settings equal the values above, read back from WebUI's image config API;
  - the end-to-end smoke shows speech, a generated image and an MP4 output all working with sandbox networking disabled.

  If any of them fails, stop and ask the user.

- [x] 2.5 Commit the request set: five science-explainer requests, plus one course, one promo and one report. Verify the commit precedes the first baseline manifest.

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
      **Task 2.6 required evidence** (issue #821):
  - Triage: evaluation run (operations, no code PR). Fixture level expanded, agreeing with upstream: it runs the shared host's stack for hours, with the provider key and the adapter token in play.
  - Governing invariant:
    - every baseline video comes from production's images and production's tool, filter, init and compose sources;
    - every attempt has a manifest;
    - no secret reaches a run file or log;
    - the request set is the one merged in #820.
  - Risk packs:
    - Auth / secrets — selected: the count-only key search.
    - Concurrency / shared state — selected: one driver at a time (lock); orphan chats are stopped before a resume; only computed names are cleaned.
    - Resource limits — selected: the Docker-root floor, recorded free space, and the sandboxes alive at the end.
    - Error handling — selected: the resume procedure, interrupted manifests, reruns.
    - File IO — selected: the run directories are kept; cleanup comes after the key search.
    - Not selected: schema, public API, release / dependency (no code changes).
  - Release identity, settled here:
    - **Package.** The host holds the package `/home/nwm/ocu-eval/packages/ocu-0fc3c37-webui-6b95a49`, built at OCU `0fc3c37` by the cached rebuild of #815. Its `release.json` has SHA-256 `a2d592aeb7ab…`.
    - **Equal to production.** Compared with production release `01b7ef7a64a5`'s `release.json` (SHA-256 `5f43f4a5d77e…`), every role's `reference`, `configuration_digest`, `descriptor_digests` and `archive.sha256` are equal, and so is `font_bundle.sha256`. A `reference` is `<repo>:<configuration digest>`, so equal references mean byte-identical images.
    - **Where the two files differ:** `ocu_source_sha`, `source_bundle.sha256`, the builder's local `registry_digests` names, and the workspace `build` record, where #815 pinned the base image by digest. The evaluation stack does not consume `source.bundle`: `load.sh` loads only images, and compose comes from `src`.
    - **The other runtime inputs** come from the `src` checkout, not the images:
      - the Computer Use tool and the filters (`openwebui/`), installed by `open-webui-init`;
      - `deploy/production-like-test/init/`;
      - the compose files;
      - `deploy/eval/requests.json`.
    - **What this task verifies:** the release identity is the four running roles' images (`EVAL_ROLES`: workspace, computer-use-server, open-webui, postgres), plus those sources being unchanged from `01b7ef7a64a5`.
    - Production's `release.json` is copied to `/home/nwm/ocu-eval/packages/production-01b7ef7a64a5/release.json`, and both packages are kept until acceptance ends.
  - Preconditions, checked on the host and recorded in the comment before the batch starts:
    - #820 merged at 2026-11-17T07:24:31Z (OCU `1a2650e`).
    - The `src` HEAD of the last `start.sh` (#819: `5e6089a`) and the `src` HEAD at batch start satisfy both:
      - `git diff --quiet 01b7ef7a64a5 <sha> -- openwebui docker-compose.yml docker-compose.webui.yml deploy/production-like-test/init`;
      - `git diff --quiet 1a2650e <sha> -- deploy/eval/requests.json`.
    - The stack runs the package above with the image settings of task 2.4, as read back for #819. The four `ocu-eval-*` containers' `{{.Image}} {{.State.StartedAt}}` are recorded.
    - `runs/baseline/` does not exist. Docker root free space is recorded.
  - Run, on the host:
    - `mkdir -p /home/nwm/ocu-eval/snap/s821`;
    - then, from `/home/nwm/ocu-eval/src`: `EVAL_ROOT=/home/nwm/ocu-eval EVAL_WEBUI_PORT=38080 setsid -f deploy/eval/run.sh --package /home/nwm/ocu-eval/packages/ocu-0fc3c37-webui-6b95a49 --phase baseline >/home/nwm/ocu-eval/snap/s821/run.log 2>&1 </dev/null`.
    - This one batch covers the eight requests of `requests.json` in file order with their repetitions: 13 slots.
    - The orchestrator polls the log with short SSH calls until its `eval: done` line.
  - Resume, if the batch stops (a refusal, the floor, a failed lookup, a killed driver):
    1. For each ledger chat, and each chat in `GET /api/v1/chats/?page=1` updated after the batch's earliest `started_at` (a failed lookup leaves its chat out of the ledger), whose task list is not empty, call `POST /api/tasks/chat/<id>/stop` on the host. Use `python3 -I` with the `stack.env` admin credentials and print no secret. Then confirm the list is empty.
    2. If the stop was the floor: run the key search over the ledger sandboxes' logs (counts only), then `cleanup.sh --runs-only`. The MP4 and the transcript are already in the run directories.
    3. Record the four containers' `{{.Image}} {{.State.StartedAt}}` again; they must be unchanged.
    4. Resume each slot without a final manifest with its own `--request <id> --repetition <n>` call. The full command would start the completed slots afresh.
  - Verify, posted as a comment on #821:
    - **Slots.** Each of the 13 slots has at most 3 attempts, every one with a `manifest.json`. All but the last are `infra`, and at most one is not `infra`. A slot's final outcome is its last non-`infra` manifest, or three `infra` attempts.
    - **Identity.** Every manifest whose `failure_reason` is not `driver interrupted` has:
      - `release.release_json_sha256` `a2d592aeb7ab…` and `release.ocu_source_sha` `0fc3c378…`;
      - `release.images.<role>.reference` equal to production's `reference`, and `image_id` equal to production's `configuration_digest` or one of its `descriptor_digests` (the identities `release.accepted_image_identities()` accepts; the #818 smoke manifests show the configuration digest on this host), for each of the four roles;
      - one `webui_image_id` shared by all of them;
      - `models` `qwen3.8-27b`, `doubao-seedream-5-0-flash-260915` (image and edit) and `mimo-v2.5-tts`.
    - **Interrupted manifests.** A `driver interrupted` manifest holds `null` identity fields by design. It is listed separately, and the unchanged container records of the resume steps show the stack did not change during it. A slot whose final manifest is of this kind is named.
    - **Timing.** The earliest `started_at` comes after #820's merge time.
    - **Table.** One row per attempt: slot, attempt, outcome, class and reason, elapsed time, tool, image and speech calls, and MP4 duration.
    - **Key search.** Counts only, with the #818 script, before any cleanup: nothing under `${EVAL_ROOT}`, in the `ocu-eval-*` logs, or in the logs of every ledger sandbox. The counts of every search made in a resume's step 2 are posted too, with the time and the number of sandboxes searched.
    - **Resources.** Docker root free space at the start and at the end, and a `docker stats --no-stream` snapshot of the project's containers at the end.
  - After the key search: `cleanup.sh --runs-only`. `runs/baseline/` and both packages stay; the stack keeps running for task 8.1's comparison setup.
  - Non-goals: the thresholds (2.7, #822), any kit slice, the after run (8.1).

- [ ] 2.7 Record the render success-rate threshold, set from the baseline, and the a-priori kit check pass-rate threshold in this change, and get the user's confirmation. Verify that the change holds both values and a link to the confirmation, dated before any after-run manifest.

Suggested fixture level: expanded - it starts services on a shared host, handles a secret, and adds a network adapter.
Minimal mergeable slice: tasks 2.1–2.3, a working isolated stack with one request end to end. The rest uses that stack.

## 3. Kit core (OCU `remotion-template`)

- [x] 3.1 Add the test runner: `node --test` over `remotion-template/tests/*.test.mjs`, plus a new OCU CI workflow that runs `npm ci` in the template and then the tests. Flag the CI change in the PR. Verify that the job runs a trivial test green on the PR.

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

- [x] 3.2 Vendor Onda `lib/` into `src/kit/`, with its MIT header and its NOTICE entry in the same task:
  - fix the zod 4 call (`composition.ts:18`);
  - drop `adaptive-player.tsx`, `composition-json-schema.ts` and `registry-summary.ts`.

  Verify that `npx --no-install remotion bundle` of the template succeeds and the notice-coverage test passes.

  **Task 3.2 required evidence** (issue #824):
  - Triage: feature (vendored third-party source). Fixture level compact, overriding the group's expanded: this slice adds no file format or CLI. It adds vendored library code, its notices and a notice test.
  - Governing invariant: every kit file that comes from a third-party source names that source, its commit and its licence in a header, and the repository's notices list the same source with the same licence. The licence text ships with the code.
  - Risk packs:
    - Release / packaging — selected: the kit ships into the workspace image with the template; the MIT text ships beside it.
    - Legacy compatibility — selected: `tests/test_remotion_image.py`, `tests/test-project-structure.sh`, the template's `package.json` and lock (no new dependency), and the existing `Root.tsx` and `index.ts` behaviour are unchanged.
    - Documentation — selected: the OCU `CLAUDE.md` header rule gains the third-party exception.
    - Not selected: schema, CLI, runtime behaviour (nothing imports the kit yet).
  - Source: `degueba/onda` commit `3c814051269597b31fee1603bef7ccfb93d091b6` (2026-06-17), `lib/`, MIT, "Copyright (c) 2026 Rodrigo Botelho". Fetch it by that full SHA, for example `gh api repos/degueba/onda/tarball/<sha>`.
  - Shape (OCU repository):
    - Destination `remotion-template/src/kit/onda/`. It gets every file of `lib/` and `lib/primitives/`, keeping their relative paths, except `adaptive-player.tsx`, `composition-json-schema.ts` and `registry-summary.ts`.
    - `index.ts` loses the three export blocks of the dropped files and nothing else. No other file references a dropped file except in comments.
    - The zod 4 fix in `composition.ts`: `z.record(z.unknown())` becomes `z.record(z.string(), z.unknown())`. zod 4.5.4 still accepts the one-argument form at run time, so the fix is for the zod 4 signature, and no red test exists for it. No other code change.
    - The vendored files keep only these external imports, all already in the template's `package.json`: `react`, `remotion`, `zod` and `@remotion/motion-blur`. Nothing is added to `package.json` or the lock.
    - Header: each vendored file starts with these three lines, in place of the repository's FSL header, followed by the original content:

      ```
      // SPDX-License-Identifier: MIT
      // Source: degueba/onda 3c814051269597b31fee1603bef7ccfb93d091b6 lib/<path> MIT
      // Copyright (c) 2026 Rodrigo Botelho. <"Unmodified." | "Modified: <what>.">
      ```

      The last token of the `Source:` line is the source's licence. A later task that borrows only a format into code the repository writes itself keeps its FSL SPDX line and names the source's licence there. Tasks 3.4 (PolyForm) and 5.2 (Apache-2.0) are such cases.

    - `remotion-template/src/kit/onda/LICENSE` holds Onda's MIT text verbatim from that commit.
    - `NOTICE` gains a section for third-party sources in the explainer kit (`remotion-template/src/kit/`), with an entry naming Onda: `degueba/onda`, the commit, MIT, the copyright line and the path. `THIRD-PARTY-LICENSES.md` gains a table row in the same form as its other rows.
    - `remotion-template/tests/notice-coverage.test.mjs` is the notice test. It uses `node:test` and the standard library only, so it runs in `template-tests`. It resolves every path from `import.meta.url`, so it gives the same result from the repository root (CI) and from the template directory.
      - It scans `remotion-template/src/kit/` and `remotion-template/bin/`, the latter as empty when absent.
      - Every `.ts`, `.tsx`, `.mjs` or `.js` file carries an `// SPDX-License-Identifier: <id>` line within its first 3 lines. Any other file fails, unless its basename is `LICENSE`.
      - A `// Source: <owner>/<repo> <sha> <path> <licence>` line within the first 3 lines must have a 40-character lowercase hex `<sha>`.
      - A file whose SPDX id is not `FSL-1.1-Apache-2.0` must carry a `Source:` line, and its SPDX id must equal that line's licence.
      - For each distinct triple of `<owner>/<repo>`, the first 8 characters of `<sha>`, and the licence found in `Source:` lines:
        - in `NOTICE`, exactly one blank-line-separated paragraph contains `<owner>/<repo>`, and it also contains the sha prefix and the licence;
        - in `THIRD-PARTY-LICENSES.md`, exactly one table row contains `<owner>/<repo>`, and that row also contains the sha prefix and the licence.

        A licence matches only as a whole token: not preceded or followed by `[A-Za-z0-9.-]`. So `FSL-1.1-Apache-2.0` does not match `Apache-2.0`.

      - Every file whose SPDX id is not `FSL-1.1-Apache-2.0` must have a `LICENSE` in its own directory or in the nearest ancestor directory below `src/kit/` or `bin/`. Files in `src/kit/onda/primitives/` therefore find `src/kit/onda/LICENSE`. That `LICENSE` must contain the file's copyright: header line 3 without its `// ` prefix and without everything from the first `. ` onward, for example `Copyright (c) 2026 Rodrigo Botelho`. When the licence is `MIT`, it must also contain `Permission is hereby granted`.
      - The test fails when no file carries a `Source:` line, since a pass over nothing would prove nothing.

    - OCU `CLAUDE.md` gains one sentence after its existing header rules: third-party files under `remotion-template/src/kit/` keep their source's SPDX licence and a `Source:` line, and carry no Open Computer Use copyright. The sentence must not contain the literal `SPDX-License-Identifier: MIT`, because `tests/test_remotion_image.py` `test_claude_md_lists_skill_md_as_mit` reads the first line that does.

  - Must preserve: `remotion-template/src/Root.tsx`, `remotion-template/src/index.ts`, `package.json`, `package-lock.json`, the Dockerfile and the `.dockerignore` rules of task 3.1; the existing smoke test; every production file outside the template, `NOTICE`, `THIRD-PARTY-LICENSES.md` and `CLAUDE.md`.
  - Required evidence:
    - **Red.** The notice test fails before the vendoring, because no file carries a `Source:` line. With the kit in place it also fails in each of these cases, each restored afterwards:
      - the Onda `NOTICE` paragraph removed;
      - the `THIRD-PARTY-LICENSES.md` row removed;
      - one header's `Source:` line removed;
      - one header's SPDX and `Source:` licence changed to `Apache-2.0`, which the same-entry rule must catch;
      - `src/kit/onda/LICENSE` removed.
    - **Green.** In a scratch copy of the template outside the repository, under Node 22.23.2, `npm ci` and then `node --test "tests/*.test.mjs"` pass. The scratch directory mirrors the repository layout: `NOTICE` and `THIRD-PARTY-LICENSES.md` sit beside the template copy, so the test's `../../NOTICE` path resolves.
    - **Bundle.** `npx --no-install remotion bundle` of the template succeeds. A second bundle of a scratch entry, in the scratch copy only and not committed, that imports `* as kit from './kit/onda'` and registers one composition using `CompositionRenderer` also succeeds. Then `npx --no-install remotion still` of that composition renders one frame, which evaluates the kit's modules under React 19. The scratch composition's `defaultProps` holds one valid entry for a registered scratch component that renders a fixed text, and the evidence shows that text in the frame, not `ErrorPlaceholder`. The scratch copy has no headless browser after `npm ci`, so `npx --no-install remotion browser ensure` runs there once beforehand; that one download is the only network use. The plain bundle never reaches `src/kit/`, so alone it proves nothing about the kit.
    - **Upstream comparison.** A byte comparison of each vendored file with upstream, after its three header lines, shows only the documented changes: `index.ts` (three export blocks) and `composition.ts` (the record call). `LICENSE` is compared whole with upstream's root `LICENSE`.
    - **Unchanged guards.** `tests/test_remotion_image.py` and `tests/test-project-structure.sh` pass unchanged.
    - **PR checks.** The PR's `template-tests` run is green, and its log shows both test files passing.
    - **Full unit.** The full OCU unit command passes.
  - Non-goals: theme tokens (3.3), the schema (3.4), any scene component, wiring the kit into `Root.tsx`.

- [ ] 3.3 Add the theme token module and the Chinese text helper:
  - punctuation and character-count segmentation;
  - no closing punctuation at line start;
  - letter spacing 0 and line height ≥1.25;
  - 万/亿 formatting.

  Probe `Intl.Segmenter('zh')` in the image's headless shell and record the result. Verify with `node --test` cases on long Chinese strings, line-start punctuation, and 9999, 12345 and 123456789.

  **Task 3.3 required evidence** (issue #825):
  - Triage: feature (pure library code). Fixture level compact, overriding the issue's "expanded", which names `script.json`, `timeline.json` and a CLI. Those belong to 3.4–3.6. This slice adds two pure modules with no file format, CLI, IO or dependency. Legacy compatibility is only kept, not extended: no existing file changes.
  - Governing invariant: the helper never changes the input text. Joining its lines gives the input string exactly. No line starts with a closing punctuation mark, and no line ends with an opening one. A line exceeds its width only by trailing closing punctuation, by at most `HANG` (2 em).
  - Line contract, which tasks 3.7, 4.x, 5.1 and 3.8 follow:
    - `maxWidth` is in em of the text's font size. A consumer computes it as `floor(boxWidthPx / fontSizePx) - HANG`.
    - The helper's lines are authoritative. A component renders each line returned by `wrapLines` as its own block element, inside a box of `(maxWidth + HANG)` em.
    - CSS wrapping from `textStyle` is only a fallback. A re-wrapped line is detected by counting its rendered lines: wrap the line's text in an inline `<span>` and count `span.getClientRects()`, or count the distinct `top` values of a `Range` over the line's contents. The probe of 3.7 uses the same method. A block element's own `getClientRects()` and `scrollWidth` cannot show a wrap.
  - Shape (OCU `remotion-template/src/kit/`):
    - **Both files.** Each is TypeScript with only erasable syntax: no `enum`, no `namespace`, no parameter properties, and no type-only imports. That lets Node 22.23.2 run it directly. Each carries the two-line FSL header.
    - **`text.ts`** imports nothing.
    - **`theme.ts`** imports only `SPRING_SMOOTH` and `SPRING_SNAPPY` from `./onda/motion.ts` (that file imports nothing), so the springs are not copied.
    - `theme.ts` exports `themes`, which holds exactly two candidates, `light` and `dark`. Task 4.6 keeps one. Each candidate holds:
      - `canvas`: `{width: 1920, height: 1080, fps: 30}`;
      - `safeArea`: `{top, right, bottom, left}` in pixels, with the inner box at least 80% of the width and of the height;
      - `brand`: all 12 slots of Onda's `Brand` (`bg`, `surface`, `surface2`, `border`, `borderLit`, `text`, `dim`, `faint`, `accent`, `accentSoft`, `fontDisplay`, `fontBody`). The kit's colours live here and nowhere else, so 3.8 can apply them with Onda's `brandToCssVars` and the Onda primitives re-skin.
        - `bg`, `surface`, `surface2`, `text`, `dim` and `accent` are `#rrggbb`.
        - The other colour slots are `#rrggbb` or `rgba(r, g, b, a)`.
        - Both font slots are exactly `'"Noto Sans CJK SC"'`, the font the image installs, with no generic or system fallback.
      - `type`:
        - `weights`: `{regular: 400, bold: 700}`;
        - `sizes`: `{title, heading, body, caption, minimum}` in pixels, with `minimum` at least 32 and every size at or above it;
        - `lineHeight` at least 1.25, and `letterSpacing` 0.
      - `spacing`: a strictly increasing array of pixel values.
      - `motion`: `{transitionFrames: 15, springs: {smooth: SPRING_SMOOTH, snappy: SPRING_SNAPPY}}`.
    - `text.ts` exports:
      - `CLOSING_PUNCTUATION`: `，。！？、；：）」』”’》】…%.,!?;:)]}`.
      - `OPENING_PUNCTUATION`: `（「『“‘《【([{`.
      - `HANG`: 2.
      - `USE_INTL_SEGMENTER`: a boolean, set from the probe below.
      - `width(ch)`: 0.5 for printable ASCII (U+0020–U+007E), 1 for every other character. It may be calibrated after the bundle measurement below.
      - `units(text, {segmenter})` splits `text` into unbreakable units. It throws `RangeError` on any control character, including `\n` and tab, and works in this order:
        1. **ASCII runs.** A run of ASCII letters and digits is one atom. `.`, `,`, `%` and `-` may sit between two such characters, and a `-` or `+` directly before a digit joins it. `万` or `亿` directly after a digit joins that atom, so `30万`, `3.5亿`, `COVID-19` and `2024-11-17` stay whole.
        2. **Han runs.** A maximal run of Han characters becomes atoms: one per character, or, when `segmenter` is true, one per word segment of `Intl.Segmenter('zh', {granularity: 'word'})`. The segmenter is applied to the Han run only.
        3. **Other characters.** Each remaining character is its own atom, except the characters of `CLOSING_PUNCTUATION` and `OPENING_PUNCTUATION` and U+0020.
        4. **Attachment.** The gap between two atoms is cut at its first opening mark. The part before that mark joins the atom before it: closing marks and spaces (U+0020 only). The part from that mark on joins the atom after it. A gap before the first atom joins the first atom, and a gap after the last atom joins the last. A non-empty text without any atom is one unit; `units('')` and `wrapLines('')` return `[]`.
      - `wrapLines(text, maxWidth, {segmenter = USE_INTL_SEGMENTER} = {})`:
        - **Width of a unit.** A unit's trailing run of closing marks and spaces gives a hang of `min(width of the closing marks in it, HANG)`. The core width is the unit's total width minus that hang and minus its trailing spaces.
        - **Line width** (used by the final assertion): the sum of `width()` over every character on the line, excluding only the last unit's hang and trailing spaces.
        - **Fitting.** A unit goes on the current line when the sum of `width()` over every character already on the line, including the previous unit's hang and spaces (they sit mid-line once the new unit follows), plus the new unit's core width, is at most `maxWidth`. Otherwise it starts a new line. So every line is at most `maxWidth + HANG` wide.
        - **Oversized units.** A unit whose core width exceeds `maxWidth` starts a new line, unless the current line is empty. It is then split by character, with opening marks bound to the character after them and closing marks to the character before.
        - **Errors.** `RangeError` is thrown when `maxWidth` is below 2 or not an integer, or when an oversized unit's leading opening marks alone reach `maxWidth`.
      - `formatCount(n)`, for a finite number:
        - `|n| < 10000` gives `String(n)`.
        - Otherwise it divides by 1e4 (万) or, from 1e8, by 1e8 (亿), truncates toward zero to one decimal, and drops a trailing `.0`. A minus sign is kept, and -0 gives `0`.
        - A non-finite input throws `TypeError`.
        - Examples: 9999 → `9999`, 12345 → `1.2万`, 20000 → `2万`, 99999999 → `9999.9万`, 123456789 → `1.2亿`, -12345 → `-1.2万`.
      - `textStyle(theme)` returns `{fontFamily, lineHeight, letterSpacing: 0, whiteSpace: 'normal', wordBreak: 'normal', overflowWrap: 'anywhere', lineBreak: 'strict'}` from the theme. It sets no `nowrap`.
  - The `Intl.Segmenter` probe and width measurement, recorded verbatim in the PR:
    - **Where.** The local production workspace image `open-computer-use:3d0ceae2b7d5a6af582662a8de61c6bbf4791daf383d6ba42cd1141b208844b5` holds the same Remotion 4.0.537 headless shell and the font. Run it with `--rm --platform linux/amd64 --network none`.
    - **Project.** A scratch project laid out as `skills/public/remotion/SKILL.md` describes: a copy of the template without `node_modules`, `node_modules` linked to `/opt/remotion-template/node_modules`, and the template's `remotion.config.ts` kept. Commands run from that directory.
    - **What it renders.** A scratch composition draws these into the frame, which is the primary evidence (console output only supports it):
      - `typeof Intl.Segmenter`;
      - the word segments of `我们今天学习光的折射现象，速度是每秒30万公里。`;
      - for a sample wrapped by `wrapLines` at width 12 in a `(12 + HANG)` em box, the rendered line count of each line, by the method in the line contract. The sample includes a line of only capitals, digits and `%`, measured after the font has loaded.
    - **Segmenter result.** `USE_INTL_SEGMENTER` is `true` only when the shell returns multi-character word segments such as `折射`. It is `false` when the segmenter is missing, throws, or returns one segment per character.
    - **Width result.** If any line renders as more than one line, the ASCII width in `width` is raised to the measured largest advance of `[A-Z0-9%]` at 1 em, rounded up to 0.05. The measurement is then repeated until no line re-wraps. The final value goes into the PR.
    - **If emulation cannot start the shell,** the implementer stops and reports. The orchestrator then runs the same probe on 210.77.77.27.
    - No probe composition is committed.
  - Must preserve: every existing file. The PR's changed-file list holds only `src/kit/theme.ts`, `src/kit/text.ts`, `tests/theme.test.mjs` and `tests/text.test.mjs` under `remotion-template/`.
  - Required evidence, red first (`remotion-template/tests/theme.test.mjs` and `remotion-template/tests/text.test.mjs`, `node:test`, importing the `.ts` files directly):
    - **Theme.** Checked for both candidates:
      - the same keys, with the `brand` key set equal to the literal list of the 12 slots;
      - the colour formats;
      - canvas 1920×1080 at 30 fps;
      - a safe area of at least 80% by 80%;
      - both font slots exactly `"Noto Sans CJK SC"`;
      - `lineHeight` ≥ 1.25 and `letterSpacing` 0;
      - every size ≥ `minimum` ≥ 32;
      - `spacing` strictly increasing;
      - `transitionFrames` 15, and the springs identical (`===`) to Onda's;
      - WCAG contrast computed in the test: `text` and `dim` on `bg`, on `surface` and on `surface2` at ≥ 4.5, and `accent` and `faint` on `bg` and on `surface` at ≥ 3.
    - **Table of inputs to expected lines.** Each row is tested with and without the segmenter, unless the row names one mode:
      - `30万公里`, `3.5亿年前`, `COVID-19 疫苗`, `2024-11-17`, `e.g. 例如` and `CO2` keep their ASCII runs and `万`/`亿` whole;
      - `“光”（折射）……。」` keeps each opening mark with the character after it and the closing run with the character before it; at width 4 its closing run hangs at most 2 em and the rest counts as core width;
      - `他说：“……”` wraps without error;
      - `我们光……是。」` at width 4 without the segmenter gives the two lines `我们光……` and `是。」`;
      - `空（）字`, `「 」` and `……` give units whose joined text equals the input, and the empty string gives `[]`;
      - `-12345` formatted and wrapped keeps `-1.2万` whole;
      - a leading space joins the first unit;
      - a string where a naive character-count break would put `，` and then `。」` at a line start keeps them on the line before;
      - a 20-letter English word in quotes at width 8, after a line already 7/8 full, starts a new line and splits without leaving `“` at a line end.
    - **Long strings.** A string of more than 200 characters mixing Han text, ASCII words, numbers and every closing mark is wrapped at widths 8, 12 and 16 in both modes. The joined lines equal the input. No line starts with a closing mark or ends with an opening mark, and every line width, as defined above, is within `maxWidth`, while the full line is within `maxWidth + HANG`.
    - **Numbers.** 9999, 12345 and 123456789 give `9999`, `1.2万` and `1.2亿`, and so do the other examples. `NaN` and `Infinity` throw.
    - **Errors.** `wrapLines('文字', 1)`, `wrapLines('文字', 2.5)` and `units('a\nb')` throw `RangeError`.
    - **Green.**
      - In a scratch layout like task 3.2's, under Node 22.23.2, `npm ci` and then `node --test "tests/*.test.mjs"` pass from the template.
      - `node --test "remotion-template/tests/*.test.mjs"` passes from the repository root.
      - The `MODULE_TYPELESS_PACKAGE_JSON` warning is accepted, because `package.json` stays unchanged.
    - **Bundle.** `npx --no-install remotion bundle` succeeds for the probe's scratch entry, which imports both modules. That entry uses an explicit `.ts` import of `./onda/motion.ts`, which also shows that webpack accepts that import.
    - **PR checks.** The PR's `template-tests` run is green, and its log shows the theme and text tests passing.
    - **Full unit.** The full OCU unit command passes.
  - Non-goals:
    - scene components;
    - the probe composition of 3.7;
    - fonts beyond the installed family;
    - picking the theme (4.6);
    - applying `brand` at the root (3.8);
    - a TypeScript type check. The template has none; `tsconfig` `lib: ES2018` lacks `Intl.Segmenter`, so the helper reaches it through a local type declaration.

- [ ] 3.4 Define the `script.json` schema in a `.mjs` module:
  - 1920×1080 at 30 fps;
  - the hook / 3–5 chapters / summary / end-card skeleton;
  - 1–4 scenes per chapter, 1–4 sentences per scene, 1–4 blocks per sentence, blocks ≤16 characters, chapter names ≤6;
  - the candidate kinds;
  - `custom` limited to one;
  - plain image names;
  - a music id or `none`.

  Export the JSON Schema. Add the PolyForm NC notice entries (anything2explainer, video-talkcraft) in this task. Verify with `node --test` fixtures that every invalid case in the spec fails with a message naming chapter, scene, field and limit.

  **Task 3.4 required evidence** (issue #826):
  - Triage: feature (file format). Fixture level expanded: `script.json` is the format the model writes and tasks 3.5–3.8, 5.x and 7.x read.
  - Governing invariant:
    - every script that `validateScript` accepts has the fixed skeleton and stays within every limit;
    - every rejection names the chapter, the scene, the field and the limit;
    - the JSON Schema the model reads is generated from the same zod schema, so the two cannot drift.
    - `validateScript` is the only entry point for checking a script. Tasks 3.5–3.8 and 5.x call it, not `scriptSchema.parse`.
  - Risk packs:
    - Schema — selected: version 1, below.
    - Error handling — selected: empty, non-JSON and invalid input, each with a located message.
    - Release / packaging — selected: the JSON Schema file ships in the template, so the image carries it at `/opt/remotion-template/script.schema.json`.
    - Legacy compatibility — selected: the notice test of 3.2 and the image guards stay green.
    - Documentation — selected: design Decision 3 now limits `.default` to component props. `NOTICE` section 6 is reworded to cover borrowed formats.
    - Not selected: CLI (3.5 reads the module), file IO beyond the text passed in, auth.
  - Sources and notices:
    - `Vincentwei1021/anything2explainer` at `4f738189d866a8a1d1abd008456303617279a2c2`: the narration shape (short chapter names, caption blocks of at most 16 characters, a few sentences per scene).
    - `Vincentwei1021/video-talkcraft` at `e19acbd958e45dbe0773817cffdf5b0e7646bf1c`: the idea of a typed parameter table per scene kind.
    - Both are `PolyForm-Noncommercial-1.0.0`; the user approved their use on 2026-11-16. Only formats and ideas are taken, no code.
    - **`NOTICE` section 6.** Its heading and introduction are reworded to cover `remotion-template/src/kit/` and `remotion-template/bin/`. Section 6 then distinguishes two kinds of source:
      - vendored files, which keep their licence and ship its text;
      - formats or ideas, which the repository's own FSL code borrows and which are listed with their notices.
    - **One `NOTICE` paragraph per project.** Each holds, in one paragraph:
      - the repository and the full commit;
      - `PolyForm-Noncommercial-1.0.0`, never directly followed by `.`, because the notice test's whole-token match then fails;
      - the licence URL `https://polyformproject.org/licenses/noncommercial/1.0.0`;
      - what was taken;
      - the project's `Required Notice:` line, verbatim on its own line:
        - `Required Notice: Copyright (c) 2026 Vincent Wei (https://github.com/Vincentwei1021/anything2explainer)`
        - `Required Notice: Copyright (c) 2026 Vincent Wei (https://github.com/Vincentwei1021/video-talkcraft)`

      The Required Notice line contains the repository name, so it must sit in the same paragraph as the entry. That keeps the "exactly one paragraph" count at one.

    - **`THIRD-PARTY-LICENSES.md`** gains one row per project. Each row holds the repository, the commit, the licence token and the Required Notice.
    - **Schema module header.** The FSL header plus a third line: `// Source: Vincentwei1021/anything2explainer 4f738189d866a8a1d1abd008456303617279a2c2 reference/narration-storyboard.md PolyForm-Noncommercial-1.0.0`. This is the borrowed-format pattern of task 3.2.
    - **Notice test.** `tests/notice-coverage.test.mjs` gains a literal list `REQUIRED_NOTICES` holding the two lines above. Each must appear exactly once in `NOTICE` as a whole trimmed line. Its repository must have exactly one `THIRD-PARTY-LICENSES.md` row, containing the first 8 characters of its commit and the licence token. This protects talkcraft, which has no `Source:` line.

  - Shape (OCU `remotion-template/`):
    - **`bin/script-schema.mjs`**, zod 4 in plain JavaScript, importing only `zod`. It exports:
      - `VIDEO`: `{width: 1920, height: 1080, fps: 30}`, which 3.6 and 3.8 read;
      - `LIMITS`: the numbers below, used in messages;
      - `BODY_KINDS`: the body kinds without `custom`;
      - `IMAGE_NAME`;
      - `scriptSchema`;
      - `validateScript(text)`;
      - `scriptJsonSchema()`, which returns `z.toJSONSchema(scriptSchema)`.
    - **Structure of version 1.** `{version: 1, title, music, hook, chapters, summary, endCard}`, using strict objects throughout:
      - `title`: 1–24 characters;
      - `music`: `none`, or a track id matching `^[a-z0-9-]+$`. Whether the track exists is checked by 6.5.
      - `hook`, `summary` and `endCard`: scenes of kind `hook`, `summary` and `end-card`;
      - `chapters`: 3–5 entries of `{name, scenes}`, where `name` has 1–6 characters and `scenes` holds 1–4 body scenes.
      - The root schema's `description` states that a script holds at most one `custom` scene, because JSON Schema cannot express that.
    - **Every scene** is `{kind, narration, image?, content}`, or `{kind: "custom", narration, image?, component}`.
      - `kind` is a plain `z.literal`, per design Decision 3.
      - `narration` is an array of 1–4 sentences, each an array of 1–4 caption blocks of 1–16 characters.
      - On `end-card`, `narration` holds 0–4 sentences and is `.optional()`, so the JSON Schema does not require it. `validateScript` returns it as `[]` when absent, so 3.5 and 3.6 always receive an array.
    - **Characters.** Every character limit uses zod's own `.min()` and `.max()` on strings. In zod 4.5.4 these count code points (`zod/v4/core/checks.js:331`, `util.codePointLength`), and they keep `minLength` and `maxLength` in the JSON Schema. `refine` and `superRefine` are not used for lengths, because `z.toJSONSchema` drops them.
    - **`IMAGE_NAME`** is `^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.(png|jpg|jpeg|webp)$`. It rejects `/`, `\` and any `..`. `image`, when present, must match it.
    - **Content by kind.** These are the candidate kinds. The gallery (4.2–4.4) may remove unapproved kinds from `BODY_KINDS` and may adjust these limits within version 1, regenerating `script.schema.json` in the same PR.
      - `hook`: `{title ≤16, subtitle? ≤24}`;
      - `question`: `{question ≤24}`;
      - `concept-card`: `{kicker? ≤8, title ≤12, points 1–4 × ≤16, conclusion? ≤20}`;
      - `process-steps`: `{steps 2–5 × {label ≤8, detail? ≤16}}`;
      - `cause-effect`: `{cause ≤16, effect ≤16, link? ≤8}`;
      - `comparison`: `{left, right}`, each `{title ≤8, points 1–4 × ≤12}`;
      - `timeline`: `{events 2–6 × {year ≤8, label ≤12, detail? ≤16}}`;
      - `key-number`: `{value: finite number, unit? ≤4, label ≤12}`;
      - `chart`: `{type: "bar" | "line", title ≤12, unit? ≤4, points 2–8 × {label ≤6, value: finite number}}`;
      - `image-callouts`: requires `image`, and `{callouts 1–3 × {x 0–1, y 0–1, label ≤10}}`;
      - `definition-quote`: `{term ≤10, text ≤40, source? ≤16}`;
      - `summary`: `{points 1–4 × ≤16}`;
      - `end-card`: `{title ≤16, subtitle? ≤24}`;
      - `custom`: `component` matching `^[A-Z][A-Za-z0-9]{0,39}$`, naming `src/custom/<component>.tsx`.
    - **`validateScript(text)`** returns `{ok: true, script}` or `{ok: false, errors}`. Each error is `{chapter, scene, field, limit, message}`. Errors map as follows:

      | Case                                                                                                      | `chapter`                                                         | `scene`                         | `field`                                                                         | `limit`                                                                       |
      | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
      | empty or whitespace-only text                                                                             | `null`                                                            | `null`                          | `script.json`                                                                   | `non-empty`                                                                   |
      | text that is not JSON                                                                                     | `null`                                                            | `null`                          | `script.json`                                                                   | `JSON`                                                                        |
      | root not an object                                                                                        | `null`                                                            | `null`                          | `script.json`                                                                   | `object`                                                                      |
      | top-level field (`version`, `title`, `music`, `chapters` count, a missing `hook`, `summary` or `endCard`) | `null`                                                            | `null`                          | the key                                                                         | e.g. `required`, `3–5 chapters`, `24 characters`                              |
      | unknown key at any level, one error per key                                                               | as for its parent                                                 | as for its parent               | path to the key                                                                 | `unknown key`                                                                 |
      | chapter field (`name`, `scenes` count)                                                                    | `"<n> <name>"`, or `"<n>"` when `name` is missing or not a string | `null`                          | `name` or `scenes`                                                              | e.g. `6 characters`, `1–4 scenes`                                             |
      | inside a chapter scene, including a missing or unknown `kind`                                             | `"<n> <name>"`                                                    | the 1-based scene number        | path inside the scene, e.g. `narration[0][1]`, `content.left.points[1]`, `kind` | the bound, `required`, or, for a missing or unknown `kind`, the allowed kinds |
      | inside the hook, summary or end card                                                                      | `null`                                                            | `hook`, `summary` or `end-card` | path inside the scene                                                           | the bound                                                                     |
      | each `custom` scene after the first                                                                       | its chapter                                                       | its scene                       | `kind`                                                                          | `1 custom scene`                                                              |
      - **Parsing.** Empty or whitespace-only text, and text that is not JSON, give that single error.
      - **Custom count.** It runs over the parsed value whenever `chapters` is an array, even when other errors exist. Its message names the first custom scene's chapter and scene.
      - **`message`.** It reads `<where>: <field> <problem> (limit <limit>)`. `<where>` is one of:
        - `chapter 2 原理, scene 3 (comparison)`, where the kind is shown as `unknown kind` when it is not a known string;
        - `hook`, `summary` or `end-card`;
        - `chapter 2 原理`;
        - `script`.

    - **`script.schema.json`**, at the template root, is `scriptJsonSchema()` written with two-space indentation and a final newline.

  - Must preserve: all files of tasks 3.1–3.3 except `NOTICE`, `THIRD-PARTY-LICENSES.md` and `tests/notice-coverage.test.mjs`, which only gain entries and the `REQUIRED_NOTICES` check. Also unchanged: `package.json`, `package-lock.json`, `Root.tsx` and `src/index.ts`.
  - Required evidence, red first (`remotion-template/tests/script-schema.test.mjs`, `node:test`):
    - **Valid fixtures.**
      - A minimal script passes: 3 chapters of 1 scene each, and an end card without `narration`, which `validateScript` returns as `narration: []`.
      - A maximal script passes: 5 chapters of 4 scenes, every body kind and one `custom`, and 4 sentences of 4 blocks of 16 characters.
      - `VIDEO` equals `{width: 1920, height: 1080, fps: 30}`.
    - **Invalid cases from the spec.** Each fails, with `chapter`, `scene`, `field` and `limit` asserted exactly as in the table:
      - empty text;
      - text that is not JSON;
      - `[]` as the root;
      - 0 and 6 chapters;
      - a chapter with no scene;
      - a sentence with no block;
      - a missing hook, a missing summary and a missing end card;
      - an unknown kind and a missing kind;
      - a missing content field;
      - a 17-character block;
      - a 7-character chapter name;
      - a body scene without narration, both with the key missing and with `[]`;
      - `../x.png`, `a/b.png` and `a..b.png` as `image`;
      - two `custom` scenes, plus a type error elsewhere in the same script, which still yields the custom error naming both scenes;
      - three `custom` scenes, which yield two custom errors.
    - **Edge cases.**
      - A `hook` without narration fails.
      - A 16-code-point block of 15 Han characters and one emoji (17 UTF-16 units) passes, and 17 code points fail.
      - An `image-callouts` scene without `image` fails.
      - An unknown top-level key and an unknown scene key each fail with `limit` `unknown key`.
    - **Schema file.**
      - The committed `script.schema.json` equals `scriptJsonSchema()`.
      - Its root requires `version`, `title`, `music`, `hook`, `chapters`, `summary` and `endCard`.
      - Its caption block carries `maxLength` 16, and the end card's `required` list does not contain `narration`.
      - Its root `description` mentions the one-`custom` rule.
    - **Notices.**
      - The notice test passes with the new `Source:` line and the `REQUIRED_NOTICES` check.
      - It fails, and is then restored, in each of these cases:
        - the anything2explainer `NOTICE` paragraph is removed;
        - the talkcraft `Required Notice:` line is removed from `NOTICE`;
        - the talkcraft `THIRD-PARTY-LICENSES.md` row is removed.
    - **Green.**
      - In a scratch layout like 3.2's, under Node 22.23.2, `npm ci` and then `node --test "tests/*.test.mjs"` pass from the template.
      - `node --test "remotion-template/tests/*.test.mjs"` passes from the repository root.
    - **Bundle and run.**
      - The scratch entry imports `../bin/script-schema.mjs`.
      - It registers a composition that calls `validateScript` on the minimal fixture. The composition throws on failure and otherwise renders a fixed text.
      - `npx --no-install remotion bundle` and `npx --no-install remotion still` of it succeed, and the frame shows that text.
    - **Unchanged guards.** `tests/test_remotion_image.py` and `tests/test-project-structure.sh` pass.
    - **PR checks.** The PR's `template-tests` run is green, and its log shows the schema tests passing.
    - **Full unit.** The full OCU unit command passes.
  - Non-goals:
    - the voice fields and commands (3.5, which may add a top-level `voice` object in its own fixture);
    - timeline fields (3.6);
    - rendering;
    - checking that a music id exists (6.5);
    - removing unapproved kinds (4.2–4.4).

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

- [x] 6.2 The user listens and exports decisions. Commit the export as the tracked approval file, linking it. Verify that the file holds one decision per candidate, with the user as approver.

  **Task 6.2 required evidence** (issue #842, human-gated: the PR is reviewed but never merged by an agent):
  - Triage: test data (a recorded human decision). Fixture level compact, overriding the issue's expanded: the slice commits one JSON file, one README paragraph and one static test. It changes no Dockerfile, no download and no manifest format.
  - Risk packs:
    - Schema / field names — selected: the file must load through the existing `music_candidates.load_decisions`, unchanged.
    - Documentation — selected: the README paragraph.
    - Others not selected: nothing reads the file at build or run time until 6.3.
  - The user's export, handed to the orchestrator on 2026-11-17 UTC from the listening page built in #841: `version` 1, `reviewer` `Danker`, `date` `2026-11-16`, 24 decisions (15 `approve`, 9 `drop`), SHA-256 `207fcbd170d914cb96135e30fb03a6a2e9b7fccde5873d0e6b96ab1b45c99b6b`. The orchestrator hands the file to the implementer.
  - Shape:
    - `deploy/music/approvals.json` is the export byte for byte. No reformatting, no added field (`load_decisions` accepts exactly four keys).
    - "Linking it" is met without a new field: the committed file is the export itself, pinned by SHA-256 in the test and the README; the PR body records its origin (the #841 listening page, handed over by the user) and its SHA-256; 6.3's manifest `approval link` points at `deploy/music/approvals.json`.
    - `deploy/music/README.md` gains a short "Approval" section: the file is the user's unmodified listening export, its SHA-256, and the approval date, which is the export's `date` field `2026-11-16`; the approved count per mood (calm-curious 6, upbeat-corporate 2, neutral-serious 3, loop 4), below the target of four for two moods, which the spec reports rather than fails; and 6.3's manifest takes its approver and approval date from this file. The line "the tracked approval file come[s] later" is updated.
  - Must preserve: `music_candidates.py`, `listening_page.py`, `candidates.json`, `excluded.json`, `evidence/` and every existing test, unchanged.
  - Required evidence: a new test in `tests/deploy/test_music_listening.py` (`RealMusicFilesTests`), red before the file exists:
    - `load_decisions(deploy/music/approvals.json, candidates)` returns one decision for each of the 24 tracked candidates;
    - `reviewer` is `Danker` and `date` is `2026-11-16`;
    - the file's SHA-256 equals the value above, so an edit after the export fails;
    - the approved count per mood equals `{"calm-curious": 6, "upbeat-corporate": 2, "neutral-serious": 3, "loop": 4}`, the numbers the README states.
    - The orchestrator's full OCU unit run on the frozen head passes.
  - Orchestrator: before opening the PR, `cmp` the committed file with the user's export. Leave the PR open for the user to merge.
  - Non-goals: the source manifest, normalization and the image step. The `observing-the-star` re-release note is extended in 6.3 (see there), not here.

- [x] 6.3 Write the tracked source manifest for the approved tracks (URL, `source_sha256`, evidence, mood, loop flag, approval link; no audio binaries) and the normalization script (MP3 for non-loop, WAV for loop, -16 LUFS / -1.5 dBTP) that writes the shipped manifest with `shipped_sha256`. Verify with a static test and fixture tracks:
  - approvers match the approval file;
  - the per-mood counts are reported against the target of four;
  - on short fixture tracks, the script's outputs measure within 0.5 LU of -16 LUFS and below -1.5 dBTP with `ffmpeg ebur128`, and a fixture with a wrong `source_sha256` fails naming the track.

  Before 6.3's manifest is written, extend `observing-the-star`'s `rerelease_note`, which searched only its file title, with the search under its OpenGameArt page title (PR #234 review). The orchestrator ran it on 2026-11-17 UTC: the iTunes Search API (term "Another space background track", with and without "yd") returned no track of that title or by that author, and MusicBrainz recording searches for "Another space background track" and "Observing The Star" (any artist) returned 0 recordings. The track was approved in 6.2, so 6.3 ships it only with this note recorded.

  **Task 6.3 required evidence** (issue #843):
  - Triage: feature (build-time tooling and a file format). Fixture level expanded, agreeing with upstream. It defines `manifest.json`, which task 6.4 installs and tasks 6.5 and 5.x read, and the script that 6.4's `Dockerfile` step runs.
  - Governing invariant:
    - only tracks the user approved ship;
    - every shipped file comes from a source whose bytes match the pinned digest;
    - every shipped file measures -16 LUFS ± 0.5 LU, with a true peak at or below -1.5 dBTP;
    - the manifest names the approver and date of the tracked approval file.
  - Deviation from the task text, settled here: no per-track source manifest is added.
    - `deploy/music/candidates.json` already holds, per track, the source URL, size, `sha256`, the zip member, licence evidence, mood, loop flag and re-release note.
    - `deploy/music/approvals.json` is the tracked approval file.
    - The "tracked source manifest for the approved tracks" is therefore the approved subset of `candidates.json`, read together with `approvals.json`. A second copy of those fields would break the repository's one-implementation rule and could drift.
  - Data change first: `observing-the-star`'s `rerelease_note` in `candidates.json` is extended with the page-title search the orchestrator ran on 2026-11-17 UTC (PR #234 review). The appended sentence: "Searched 2026-11-17 under the OpenGameArt page title: the iTunes Search API (term "Another space background track", with and without "yd") found no track of that title or by that author, and MusicBrainz recording searches for "Another space background track" and "Observing The Star" (any artist) returned 0 recordings." No other candidate changes.
  - Risk packs:
    - Schema — selected: `manifest.json` version 1, below.
    - Release / packaging — selected: the output directory is self-contained, so 6.4 can install it either from a host release step (the font pattern: `release.py` prepares, the `Dockerfile` copies) or from a `Dockerfile` step. 6.4's fixture decides which. The script uses only the standard library, `ffmpeg` and `ffprobe`.
    - File IO — selected: `fetch` and `build` refuse an existing output directory, work in a temporary sibling, and rename it into place only after every track passed. A failure leaves no partial output.
    - Error handling — selected: a digest mismatch, a missing source, an infeasible gain or an out-of-tolerance output each fail and name the track.
    - Legacy compatibility — selected: `music_candidates.py`, `listening_page.py`, their tests and the committed `approvals.json` stay unchanged in behaviour. The approvals export's SHA-256 stays `207fcbd1…`.
    - Not selected: auth, concurrency, public API.
  - Shape (OCU repository, `deploy/music/`):
    - `music_library.py`: standard library only. It imports `music_candidates`, whose `load_candidates`, `load_decisions` and `fetch_candidate` are reused, not copied.
      - `approved_library(candidates_path, approvals_path, root)` is a pure function. It returns the approved candidates in `candidates.json` order and the manifest's `approvals` block: `sha256` of the approvals file, `reviewer`, `date`. Every command uses it.
      - Every command takes `--candidates`, `--approvals` and `--root`, defaulting to the repository's files, as `listening_page.py` does.
      - `fetch --out <dir>` downloads each approved source with `fetch_candidate` into a temporary sibling of `<dir>`, then renames it to `<dir>`. Dropped candidates are not downloaded. A mismatch fails, naming the track id.
      - `build --sources <dir> --out <dir>`:
        - **Inputs.** It reads each approved source from `<sources>/<id><suffix>`, the files `fetch` writes. Before decoding, it re-verifies the file's pin: the member's `sha256` and `size` for zip tracks, the source's otherwise. A missing file or a differing digest fails, naming the track.
        - **Measurement.** `ffmpeg -af ebur128=peak=true` gives the source's integrated loudness `I` and true peak `TP`. The gain is `-16 - I` dB.
        - **Linear path.** When `TP + gain <= -1.5`, the output is `volume=<gain>dB` alone. `loudnorm` is not used: its linear mode also depends on the loudness range, and its dynamic mode misses the target on peaky material.
        - **Infeasible gain.** Otherwise, the build fails, naming the track and its `I`, `TP` and the gain it needs. No limiter or compressor is applied: a single limiter pass lands below the target, because the gain is computed before it removes the loudest peaks, and `alimiter` limits sample peaks, not true peaks. A loop also needs a constant gain to stay seamless.
        - **Encoding.** Non-loop tracks become stereo MP3 at a constant 320 kb/s with `libmp3lame`. Loop tracks become stereo 16-bit WAV. Both keep the source's sample rate, so a loop's sample count is unchanged.
        - **Check after encoding.** Each output is measured again with `ebur128=peak=true`, and its summary values are parsed. `abs(I + 16) <= 0.5` and `TP <= -1.5` must hold, or the build fails, naming the track and the measured values.
        - **Output.** Outputs are named `<id>.mp3` or `<id>.wav`. The evidence snapshots of the approved tracks are copied to `evidence/` and the approvals file to `approvals.json`, all inside the output, and `manifest.json` is written last.
      - `report` prints the approved count per mood against the target of four, for example `calm-curious 6/4`. A shortfall is printed, not an error.
    - `manifest.json`, version 1: `{"version": 1, "approvals": {"file": "approvals.json", "sha256", "reviewer", "date"}, "tracks": [...]}`. Every path in it is relative to the manifest's directory.
      - Each track entry holds:
        - `id`, `mood`, `loop`, `title`, `author`;
        - `file`, `format` (`mp3` or `wav`), `sample_rate`, `duration_seconds` (from `ffprobe`);
        - `source_url`, `licence_url`, `evidence` (the copied snapshot);
        - `source_sha256` (the downloaded file's digest, the zip for zip tracks), and `member` (`{name, sha256}`) only for zip tracks;
        - `shipped_sha256`;
        - `integrated_lufs`, `true_peak_dbtp` (the after-encoding values);
        - `rerelease_note`, `approver`, `approval_date`.
      - `approver` and `approval_date` equal `approvals.reviewer` and `approvals.date`.
      - The tracks appear in `candidates.json` order.
    - `README.md` gains a "Library" section covering the approved subset as the source manifest, the three commands, the manifest format and the linear-gain rule.
  - Must preserve: `candidates.json` apart from the one note, `approvals.json` byte-identical, `excluded.json`, `evidence/`, `music_candidates.py`, `listening_page.py`, `tests/deploy/test_music_listening.py`, and every production file. No audio file is committed.
  - Required evidence, each test red before the change (`tests/deploy/test_music_library.py`, unittest):
    - **Real files.** `approved_library` on the repository's files returns:
      - 15 tracks in `candidates.json` order;
      - approvals `sha256` `207fcbd170d914cb96135e30fb03a6a2e9b7fccde5873d0e6b96ab1b45c99b6b`, reviewer `Danker`, date `2026-11-16`;
      - no dropped id.

      `report` on the same files prints the four moods with their counts against four. `observing-the-star`'s note contains "Another space background track".

    - **Fixture tracks.** These are generated at test time with `ffmpeg -f lavfi`; no audio is committed. Each is at least 10 seconds long, with amplitude changes, at 44.1 kHz, with fixture `candidates.json` and `approvals.json` in a temporary directory:
      - a quiet non-loop track;
      - a non-loop track whose source is a zip holding it as a member;
      - a loop track.

      `build` gives:
      - two MP3 files and a WAV, each measured by the test's own `ebur128` parse at `abs(I + 16) <= 0.5` and `TP <= -1.5`;
      - a WAV sample count equal to its source's;
      - `shipped_sha256` equal to each file's digest and `source_sha256` equal to each fixture source's: the zip's for the zip track, whose `member.sha256` equals the member's digest;
      - `approver` and `approval_date` equal to the fixture approvals;
      - every manifest field with its type, and the copied evidence and approvals present at their manifest paths.

    - **Refusals.** Each of these fails, names the track, and leaves no output directory:
      - a fixture `sha256` that differs from its source;
      - a zip-member fixture whose member differs from its pin;
      - a missing source file;
      - a non-loop track and a loop track whose peaks make the gain infeasible, each with its `I`, `TP` and needed gain in the message;
      - an output that measures out of tolerance after encoding, forced by replacing the module-level function that wraps the one encoding `ffmpeg` call (for example `_encode`) with `unittest.mock.patch.object`, so that it writes a quieter file. The test calls `build` in process. The measurement after encoding stays real. No environment variable or CLI switch is added for this.

      An existing `--out` is refused, names the directory and leaves it untouched, as in `listening_page.py`'s `test_existing_output_directory_is_refused_and_preserved`.

    - **fetch.** It runs against a local server built on `OriginRequestHandler` (`tests/orchestrator/_http_origin.py`), which `tests/deploy/support.py` already uses for the music and font tests. No second test server is added. Only approved candidates are downloaded. A zip-member fixture yields `<id><suffix>`. A served byte change fails, naming the track.
    - **ffmpeg.** The ffmpeg tests skip only when `ffmpeg` is absent from `PATH`, with that reason. Repository CI has no ffmpeg, so they skip there. The orchestrator's full unit run on the Mac (ffmpeg 9.0.1 with `libmp3lame`) must run them, not skip them. 6.4's image test is the first run on the image's ffmpeg.
    - **Real sources, orchestrator, Phase 2, a hard gate before the PR is frozen.** `fetch` and `build` run over the real 15 approved sources in a scratch directory. Every output is within tolerance by the same check. The per-mood report and each track's `I`, `TP` and gain are posted.
      - When a real track cannot meet the tolerance, the orchestrator stops and reports to the user with the track id and its measured `I`, `TP` and loudness range. The user decides.
      - Lowering the target, widening the tolerance, or changing the approved set without the user is forbidden.
    - **Full unit.** The full OCU unit command passes.

  - Non-goals: the install into the image and image tests (6.4), ducking and renderer use (6.5), any change to the candidate set.
  - Amended after Phase 2 (user decision, 2026-11-17):
    - **Measurement.** The real 15 sources were measured with `ebur128`. Five were infeasible under the strict rule `gain = -16 - I`:
      - `and-just-like-that`: true peak -1.0 dBTP after gain;
      - `beat-one`: -1.2 dBTP;
      - `infinite-wonder`: -0.3 dBTP;
      - `space-ranger-loop`: -0.4 dBTP;
      - `observing-the-star`: +5.8 dBTP.
    - **Gain rule.** The gain is now `min(-16 - I, -1.5 - TP)`. A track is feasible when the predicted `I + gain` rounds to -16.5 or above, which keeps it within the -16 ± 0.5 LU tolerance. The check after encoding is unchanged. This recovers `and-just-like-that` (-16.5) and `beat-one` (-16.3).
    - **Exclusions.** `deploy/music/library-excluded.json` (version 1) lists the three tracks still outside tolerance:
      - `infinite-wonder`, which the peak cap leaves at -17.2 LUFS;
      - `space-ranger-loop`, at -17.1 LUFS, which as a loop takes no limiter;
      - `observing-the-star`, at -23.3 LUFS.

      Each entry carries its measured `I`, `TP` and LRA, `decided_by: "user"` and the date. `approved_library` subtracts these ids. An id that is not an approved candidate fails, naming it.

    - **Result.** The library ships 12 tracks: calm-curious 4, upbeat-corporate 2, neutral-serious 3, loop 3. `report` prints the shortfalls and the exclusions. The approval file stays unchanged.
    - **Evidence added:**
      - a peak-capped fixture builds within tolerance;
      - a fixture beyond tolerance fails;
      - `approved_library` on the repository files returns those 12 tracks;
      - the validation of the exclusion file;
      - a fresh orchestrator Phase 2 run over the real sources, in which all 12 pass.

  - Amended after the second Phase 2 run (user decision, 2026-11-17):
    - **Fourth exclusion.** `and-just-like-that` (I -14.6 LUFS, TP 0.4 dBTP, LRA 4.7 LU) fails the check after encoding. It is not a gain-rule failure: 320 kb/s MP3 encoding raises its true peak, and no constant gain meets both limits. A gain of -1.9 dB gives -16.6 LUFS at -1.4 dBTP, and -2.0 dB gives -16.7 LUFS at -1.6 dBTP. The user excluded it, and `library-excluded.json` lists it as a fourth entry in the same shape.
    - **Result.** The library ships 11 tracks: calm-curious 4, upbeat-corporate 1, neutral-serious 3, loop 3. Where the amendment above says 12 tracks, 11 binds. The approval file stays unchanged.
    - **Evidence.** `approved_library` on the repository files returns those 11 tracks. A fresh orchestrator Phase 2 run over the real sources passes all 11, with 0 failures in the independent re-measurement. Merged as OCU #243 (`a3b9b31`).

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
