# Tasks

## 1. Revocation supervisor

- [ ] 1.1 Approve expanded fixture and strict validation; record credential-header precedence and shutdown ownership decision.
- [ ] 1.2 Add validated OCU_WEBUI_AUTH_URL and captured-cookie initial/periodic checks; tests prove exact headers, perconnection isolation, missingconfig/cookie denial, invalidurl startup rejection and no redirects.
- [ ] 1.3 Integrate both CDP and ttyd pumps with shared revocation/cleanup supervision; mocked-clock route tests prove healthy multi-tick traffic,401/403/error4401 within60s and no postdecisioninput, awaited cancellation and bounded close.
- [ ] 1.4 Preserve existing auth and backend failure semantics; update affected test fixtures, Dockerfile packaging and .env.example/README/changelog without CI/deploy edits.

## 2. Acceptance

- [ ] 2.1 Preserve behavioral RED/GREEN; parent pinned Python3.12 non-Docker suite and actual local HTTP/WS smoke for both routes, with timing acceleration explicitly identified.
- [ ] 2.2 Expanded correctness/state, security/credentials and evidence/integration review; bounded repairs, CI/merge, fixture archive.

## Risk packs

Auth/secrets:1.2 capturedcookie andheaderprecedence. Network/config:1.2 explicitendpoint/noredirect/5sdeadline. Concurrency/state/cleanup:1.3 terminalrevocation closes once and awaitsownedtasks. Compatibility:1.3–1.4 CDPtext/ttybinary/subprotocol/normalfailure. Packaging/docs:1.1/1.4. No schema, WebUIauthsource, deploymentgateway orDockeracceptance; later#22/#24/#36 own those.
