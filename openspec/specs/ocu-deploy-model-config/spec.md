# ocu-deploy-model-config Specification

## Purpose

Let the deployment operator choose the chat, embedding and reranking models and their endpoints and keys, with no model name or provider URL fixed in tracked deployment files, and state which source wins after the first boot.

## Requirements

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

### Requirement: Embedding and reranking endpoints are separately configurable

The production-like test deployment SHALL take the embedding endpoint from `RAG_OPENAI_API_BASE_URL` and `RAG_OPENAI_API_KEY`, and the reranking endpoint from `RAG_EXTERNAL_RERANKER_URL` (a complete endpoint URL) and `RAG_EXTERNAL_RERANKER_API_KEY`. When a name is unset or empty, its setting SHALL fall back to `DMXAPI_BASE_URL` or `DMXAPI_API_KEY`, and the reranker URL to `${DMXAPI_BASE_URL}/rerank`. Chat SHALL keep using `DMXAPI_BASE_URL` and `DMXAPI_API_KEY`. `bootstrap-test.sh` SHALL accept the two URLs as optional inputs under the existing dotenv safety check and write them to `runtime.env`. The two keys SHALL be read from the provider credential file and SHALL NOT be written to `runtime.env`. Recovery SHALL carry both keys into the activation environment and SHALL NOT print them. These settings SHALL apply from the environment on a first boot with an empty database; afterwards the database SHALL hold them, and changing the environment SHALL NOT replace them.

#### Scenario: Each model has its own endpoint

- **GIVEN** all four names are set to distinct values
- **WHEN** the overlay is resolved
- **THEN** Open WebUI's embedding and reranking settings carry those values and its chat settings carry `DMXAPI_BASE_URL` and `DMXAPI_API_KEY`

#### Scenario: Only the shared provider is configured

- **GIVEN** the four names are absent, or present and empty
- **WHEN** the overlay is resolved
- **THEN** embedding uses `DMXAPI_BASE_URL` and `DMXAPI_API_KEY`, reranking uses `${DMXAPI_BASE_URL}/rerank` and `DMXAPI_API_KEY`, and Compose prints no `is not set` warning

#### Scenario: One model is overridden

- **GIVEN** only the embedding pair is set
- **WHEN** the overlay is resolved
- **THEN** reranking stays on its fallback

#### Scenario: A URL or key is given alone

- **WHEN** only an embedding URL, or only an embedding key, is set
- **THEN** the other half falls back to `DMXAPI_API_KEY` or `DMXAPI_BASE_URL`

#### Scenario: A reranker URL or key is given alone

- **WHEN** only a reranker URL, or only a reranker key, is set
- **THEN** the other half falls back to `DMXAPI_API_KEY` or `${DMXAPI_BASE_URL}/rerank`

#### Scenario: A seeded database outranks the environment

- **GIVEN** a deployment that has already started
- **WHEN** the environment changes and it restarts
- **THEN** embedding and reranking keep the values stored in the database

#### Scenario: An unsafe URL is refused

- **WHEN** bootstrap gets either URL containing a space, quote, `$`, `=` or a line break
- **THEN** it exits non-zero naming the variable, and neither `runtime.env` nor the credential file exists afterwards

#### Scenario: Recovery keeps separate keys

- **GIVEN** a provider file with distinct embedding and reranking keys
- **WHEN** recovery builds the activation environment
- **THEN** both keys are present with their own values and neither appears in recovery output, including when `up.sh` fails
