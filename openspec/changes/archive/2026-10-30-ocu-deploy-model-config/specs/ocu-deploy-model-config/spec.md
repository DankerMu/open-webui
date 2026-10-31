## ADDED Requirements

### Requirement: Deployment models and provider URL come from the operator

The production-like test deployment SHALL take the chat default model (`PRIMARY_CHAT_MODEL`), the RAG embedding model (`RAG_EMBEDDING_MODEL`), the RAG reranking model (`RAG_RERANKING_MODEL`) and the OpenAI-compatible provider base URL (`DMXAPI_BASE_URL`) only from the runtime environment. No tracked deployment file SHALL name a model id or a provider URL as a value or default. `bootstrap-test.sh` SHALL accept each of the four as an optional input, write it to `runtime.env` as given or as an empty value when absent, and refuse before publishing anything when a value fails the existing dotenv safety check. A missing or empty model name SHALL resolve to an empty setting without a Compose warning.

#### Scenario: Operator supplies models at bootstrap

- **GIVEN** bootstrap runs with `DMXAPI_BASE_URL=http://lan-model:8000/v1`, `PRIMARY_CHAT_MODEL=chat-a`, `RAG_EMBEDDING_MODEL=embed-a` and `RAG_RERANKING_MODEL=rerank-a`
- **WHEN** the overlay is resolved with the generated `runtime.env`
- **THEN** Open WebUI receives `embed-a`, `rerank-a` and the LAN base URL for chat, embedding and `<base>/rerank`, and `open-webui-init` receives `chat-a`

#### Scenario: Operator leaves models for the admin UI

- **GIVEN** bootstrap runs without any of the four inputs
- **WHEN** it finishes
- **THEN** `runtime.env` contains the four names with empty values, no line names `dmxapi.cn` or any model id, and the overlay resolves the three model settings to empty values

#### Scenario: An unsafe value is refused

- **WHEN** bootstrap gets a model name or base URL containing a space, quote, `$`, `=` or a line break
- **THEN** it exits non-zero naming the variable, and neither `runtime.env` nor the credential file exists afterwards

#### Scenario: A runtime file from before this change

- **GIVEN** a `runtime.env` without `PRIMARY_CHAT_MODEL`, `RAG_EMBEDDING_MODEL` or `RAG_RERANKING_MODEL`
- **WHEN** the overlay is resolved
- **THEN** the three settings resolve to empty values and resolution does not fail

### Requirement: The initializer selects a default model only when one is configured

`open-webui-init`'s wrapper SHALL, when `PRIMARY_CHAT_MODEL` is non-empty, set it as Open WebUI's default model and refuse to write the initialization marker unless `/api/models` offers it, generating the same initializer as before this change. When `PRIMARY_CHAT_MODEL` is empty or whitespace, the wrapper SHALL leave the stored default model unchanged, perform no model check, and complete tool, filter, valve and marker setup as it otherwise would. It SHALL keep refusing when the upstream initializer no longer contains the expected default-model line or marker section.

#### Scenario: Configured model is offered

- **GIVEN** `PRIMARY_CHAT_MODEL=chat-a` and `/api/models` lists `chat-a`
- **WHEN** the initializer runs
- **THEN** `DEFAULT_MODELS` is posted as `chat-a` and the marker is written

#### Scenario: Configured model is missing

- **GIVEN** `PRIMARY_CHAT_MODEL=chat-a` and `/api/models` does not list it
- **WHEN** the initializer runs
- **THEN** it logs `PRIMARY_CHAT_MODEL is unavailable: chat-a`, exits non-zero and writes no marker

#### Scenario: No model configured

- **GIVEN** `PRIMARY_CHAT_MODEL` is empty and the stored models configuration already has `DEFAULT_MODELS` set by an admin
- **WHEN** the initializer runs
- **THEN** it logs that the default model is left to the admin UI, posts the models configuration with that `DEFAULT_MODELS` unchanged, never requires a model in `/api/models`, and writes the marker
