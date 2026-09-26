# Design

## Context

`stop-overage.sh:20-36` already selects managed running containers and stops at age >= configured hours without removal. `bootstrap-test.sh:15,58-93` hard-codes historical source/images, direct-publication names and the control gateway. `deploy/up.sh:89-98` instead requires distinct control/sandbox networks, proxy/auth settings and explicit egress presence. The core override replaces the whole environment, so writing a runtime variable alone does not deliver it to OCU. `write-deployed-version.sh:60` still lists the obsolete patch. The current lifecycle already maps `OCU_SANDBOX_NO_AUTOSTART=1` to sandbox `NO_AUTOSTART=1` and strips service credentials.

## Goals / Non-Goals

Make generated configuration consumable by the existing deployment entrypoint and preserve stop-only retention. No new image builder, secret service, deployment launcher, retention scheduler, DNS implementation, terminal behavior rewrite or real-host operation.

## Decisions

- Require operator-provided `SOURCE_SHA` (full commit matching the selected source checkout), `OPENWEBUI_IMAGE`, `DOCKER_IMAGE`, `COMPUTER_USE_SERVER_IMAGE`, `RETENTION_GUARD_IMAGE`, `OCU_PROXY_IMAGE` and `OCU_WEBUI_ORIGIN`. Do not pin this script to its own unknown future merge hash or substitute an old checkout. Image references are explicit inputs here; reproducible fork build/digest evidence belongs to issue33. Preserve the workspace image-name convention needed for `/home/assistant` mounts.
- Require `OCU_SANDBOX_EGRESS_ALLOW` presence; preserve explicit empty. Validate with the existing production parser rather than duplicating CIDR rules. Never provide a broad default. DNS settings will be added by issue79, not silently claimed here.
- Provision distinct control/sandbox network names, subnets and gateways using the existing deployment defaults/patterns; derive sandbox bind identity from the sandbox gateway. Remove obsolete direct-publication names. Require a valid HTTP(S) origin with no path, credentials, query, fragment or trailing slash; emit `PUBLIC_BASE_URL=${OCU_WEBUI_ORIGIN}/ocu` and `OCU_WEBUI_AUTH_URL=http://open-webui:8080/api/v1/ocu/auth`. The public base includes the proxy prefix because prompt/file consumers use it verbatim. Provision the proxy port, supplied proxy image, `/ocu` prefix, no-autostart=1 and one generated token shared by WebUI/OCU/proxy. Core Compose environment must explicitly carry prefix and no-autostart.
- Keep root-only bootstrap, provider-file mode0600 requirement, cryptographic secret generation and refusal to overwrite either output. Add only a credentials-output-path override (default unchanged) for isolated testability. Reject unsupported line-breaking or executable dotenv input rather than emitting configuration injection; do not redesign dotenv consumers. Provider secret remains in its separate file, never copied or printed. Successful outputs remain0600; temporary files cleaned on failure.
- Retention keeps its established StartedAt continuous-runtime threshold, managed-running selection and stop timeout. Correct only the misleading restart statement; no automatic launch or deletion. Explicit launch remains the lifecycle owner's responsibility.
- Delete the historical patch and update its version-record caller atomically. Keep existing build provenance mechanics outside this slice.

## Verification and defeaters

Actual script subprocesses plus independent fake state prove 168h boundary/under-age/unmanaged/stopped cases and byte-preserved volume/directory sentinels. Fake tools reject unsupported destructive commands. Bootstrap success is judged by consumer-visible environment and overlay wiring, not source-string presence; missing/invalid required inputs, old SHA, insecure provider file and existing outputs fail before publishing configuration. Assert the exact public base (origin plus `/ocu`) and internal auth URL above, synthetic token equality across service peers, token exclusion from reports/logs and preserved explicit-empty egress. Source-fault qualification must reject a public base missing `/ocu`, missing prefix/no-autostart/token provisioning and destructive-retention mutants for semantic reasons; restoration green. Existing deployment and lifecycle regressions remain intact.

## Risks / Migration

Bootstrap only provisions new configuration and refuses existing outputs; operators migrate deployed configurations explicitly. A configuration change is not an image build or successful deployment. Real service startup, 168h retention and unchanged data mounts are mandatory issue36 evidence. Never roll back to direct OCU publications or a historical source patch. Test overrides never weaken production ownership checks.
