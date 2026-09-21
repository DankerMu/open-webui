---
id: 2026-09-20-ocu-path-grant-for-opaque-documents
title: Signed path grant so opaque-origin generated documents can load relative sub-resources
kind: architecture
status: proposed
date: 2026-09-20
supersedes: none
references: docs/plans/2026-09-20-workspace-artifact-integration.md (A-T01, § 2 "静态相对资源"); openspec/changes/ocu-workspace-integration design D19; DankerMu/open-webui#35 (follow-up, in epic #2)
---

# Signed path grant so opaque-origin generated documents can load relative sub-resources

## Problem

Model-generated HTML/SVG is shown with an opaque origin (sandboxed iframe without `allow-same-origin`, `Content-Security-Policy: sandbox` when opened top-level). Requests such a document makes for relative sub-resources (CSS, images, fonts, scripts, `fetch`) are cross-site for the browser, so the `SameSite=Lax` WebUI session cookie is not sent, the reverse proxy's `auth_request` answers 401, and the sub-resource does not load. On a cookie-only gateway, isolation and Plan 1 A-T01 "资源齐全" for relative resources exclude each other.

## Decision

Proposed, not adopted. On 2026-09-20 the user withdrew this design from the `ocu-workspace-integration` change; that change serves generated documents single-file (design D19) and narrows A-T01 to inline resources. This record keeps the design and its open items so a later OpenSpec change starts from them instead of rediscovering them.

Design as reviewed:

- The cookie path `/ocu/files/{chat_id}/{path}` (non-download GET) passes session-mode `auth_request`; the proxy answers `302` to `/ocu/f/{grant}/{chat_id}/{path}` using an `X-Ocu-Grant` header returned by `GET /api/v1/ocu/auth`. The document's base URL becomes the grant path, so relative references resolve under the same grant without cookies.
- The grant path passes grant-mode `auth_request` (no session; the endpoint verifies signature, expiry and chat binding and re-evaluates `Chats.is_chat_owner`) and is forwarded to OCU `/files/{chat_id}/{path}` with the internal token; the generated-content isolation headers apply, plus `Referrer-Policy: no-referrer`.
- Grant = `base64url(user_id | chat_id | exp) + "." + HMAC-SHA256(key, same)`, key derived from `WEBUI_SECRET_KEY` with a fixed label, TTL 10 min, GET/HEAD only, one chat's files only, not single-use, no server-side state. Grants never enter persisted text (listing and filter links stay on the cookie path); the access log masks the grant segment; `?download=1` stays on the cookie path.

Open items found by independent verification (round 4 of the change's review loop), each of which must be resolved by the change that adopts this record:

1. **Client-supplied `X-Ocu-Grant` is not stripped on session-mode rows.** `auth_request` subrequests inherit client headers, and the auth endpoint selects grant mode on header presence, so a grant plus the header on `/ocu/terminal/{chat_id}/*`, CDP/ttyd or uploads would pass authorization. The proxy must clear the header on every non-grant row and set it only from the path on `/ocu/f/*` rows; the proxy smoke must assert it. Decide whether `/api/v1/ocu/auth` itself may answer a browser-presented grant.
2. **The 401 matrix contradicts grant mode.** "No session → 401" versus "no session + grant → 200". State: 401 only when neither session nor grant is present; present but invalid, expired or mismatched grant → 403.
3. **Isolation headers are specified on a path that only redirects.** CSP + nosniff must be required and asserted on the final `/ocu/f/*` response, with the cookie path keeping them only for `?download=1`.
4. **CORS-mode sub-resources still fail.** `@font-face`, `fetch` of relative data and module scripts are CORS requests with `Origin: null`; OCU's CORS allows only the WebUI origin and the grant path sets no `Access-Control-Allow-Origin`. Define the grant-path CORS policy (for example `Access-Control-Allow-Origin: null` without credentials on GET/HEAD under `/ocu/f/*`) or record fonts and `fetch` as excluded.
5. Minor: HEAD on the cookie path; lazily loaded resources 404 after the 10 min TTL while the page stays open.

## Alternatives considered

- **Serve documents single-file; relative sub-resources are a recorded limitation** — adopted for the current change (design D19): zero new authorization surface; the model's usual single-file outputs are unaffected; pages that link `style.css` render unstyled.
- **Session cookie `SameSite=None`** — lost: opens a CSRF surface on every WebUI API for generated pages.
- **`allow-same-origin` on the generated-content iframe** — lost: violates AGENTS.md note 5 (generated content always runs in an opaque origin).
- **`srcdoc` with a WebUI-side fetch** — lost: gives a top-level open a different document than the sidebar and still cannot resolve relative references.
- **OCU-side bundling endpoint that inlines relative references into one document** — not designed: a candidate for the follow-up change; it needs the outputs broker and file paths from the current change to exist first.
- **Single-use or nonce tickets** — lost: on Plan 1's "不做" list for the LAN trust model.

## Consequences

- Until adopted, generated pages that reference relative resources render without them; A-T01 covers inline resources only.
- Adoption requires its own OpenSpec change after the proxy config, the OCU stub and `make smoke-proxy` (Plan 1 group 13) and the sidebar (group 16) exist, because the five open items above are verifiable only at the proxy smoke seam.
- The follow-up issue in the Plan 1 epic carries `Implementation Ready: no` and depends on the group 13 and 16 issues.
