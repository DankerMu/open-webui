# Read-only resource grants for generated documents

## Why

Opaque-origin generated documents cannot load relative resources through the cookie-only gateway. Restoring CSS, images, fonts, scripts and relative data fetches must not give those documents WebUI session credentials, execution authority or access to another chat.

## What Changes

- Add short-lived, session-bound, read-only resource grants for the current chat's ordinary workspace files. A grant is a bearer capability: the generated page and anyone holding its URL can read that scope.
- Keep canonical cookie URLs in listings, messages and persisted state; authorized non-download file entry redirects to a grant URL. Keep the existing session-only auth endpoint and all non-file authorization unchanged.
- Limit grants to GET/HEAD, at most 600 seconds and no later than the issuing session expires. Recheck user eligibility, ownership and existing session revocation on every request. Do not renew in the background.
- Preserve opaque origins in sidebar and top-level documents; allow credential-free `Origin: null` resource CORS only on validated grant routes. Reject archive, listing, control-plane, execution and write routes.
- Require the descriptor-pinned file-serving repair tracked in #201 before grant activation. Explicitly support HEAD using the same confined file reader.
- Update native proxy smoke and browser acceptance independently, including the HTML preview consumer's final-response base URL. Do not weaken the existing token/storage/API isolation checks.

## Capabilities

### New Capabilities

- `ocu-resource-grants`: issuer, verifier, lifetime, scope, session revocation, browser resource loading and expiry behavior.

### Modified Capabilities

- `ocu-reverse-proxy`: separate grant authentication/rewrite and canonical-file redirect behavior, without changing session-only rows.
- `ocu-file-headers`: confined ordinary-file GET/HEAD parity, preserving bytes and existing MIME/download behavior.
- `ocu-proxy-smoke`: real session/grant request matrix, credential containment and exact-source pin integration.

## Impact

WebUI owns grant authorization and its harness; OCU owns ordinary file transport, the trusted preview consumer and the gateway renderer. The OpenSpec change and stage issues remain in the WebUI repository. No login API change, new deployment service, dependency upgrade, database migration, global CORS widening or generated-iframe permission widening is planned.

Source tracker: #35. Existing prerequisites #23 and #29 are closed. This is design preparation, not a claim that grants or their acceptance checks are delivered.
