## ADDED Requirements

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
