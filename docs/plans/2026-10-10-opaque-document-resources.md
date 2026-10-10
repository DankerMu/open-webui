# Opaque-document relative resources

Status: approved direction; implementation and acceptance not delivered.
Source tracker: [#35](https://github.com/DankerMu/open-webui/issues/35). The user approved the mechanism, read scope, expiry, revocation boundary and Stage 1 handoff on 2026-10-10.

## Goal

Generated HTML/SVG documents load relative CSS, images, fonts, classic/module scripts and relative GET/HEAD data requests without acquiring WebUI login credentials or execution authority. Preserve interactive inline content and opaque-origin isolation in sidebar and top-level opening.

## Scope

A signed URL grants read-only access to ordinary workspace files in exactly one chat. Scope is the entire chat, not just the entry document's directory. The page and anyone holding the URL can read that scope while authorization remains valid.

Canonical cookie URLs remain the addresses stored in listings, messages, filters and preferences. The grant exists only in transient navigation/resource state. A browser's address/history can contain the temporary URL; it is not a private sharing mechanism.

## Not In Scope

- Other chats, private Office/control data, directory enumeration, archive endpoints, terminal/browser control, mutations or uploads through grants.
- Disabling generated-content isolation, changing cookie SameSite, accepting grants as WebUI sessions, or broadening global CORS.
- Automatic renewal, indefinite links, single-use tickets, a new revocation store, deployment services, dependency upgrades or schema migrations.
- Rewriting arbitrary generated source into a bundle; remote/root-absolute references or arbitrary custom-header fetch protocols. Relative GET/HEAD resources remain within the granted file namespace.
- Making real-DocumentServer, LAN deployment, capacity or #173 acceptance claims.

## What Already Exists

- `backend/open_webui/routers/ocu_workspaces.py` provides session-only owner authorization; `Chats.is_chat_owner` is the execution/workspace predicate.
- `backend/open_webui/utils/auth.py` validates sessions and existing Redis revocation; sign-out records revocation only when Redis is configured.
- OCU `deploy/proxy/` owns the reviewed route table, auth subrequests, header stripping and generated-content isolation. WebUI harnesses consume its full pinned SHA.
- OCU `/files/{chat}/{path}` serves ordinary workspace files; the separate `/files/{chat}/archive` route must not become reachable through a file grant.
- OCU HTML preview fetches text and installs a cookie-path base. It must preserve the final response resource base while keeping canonical navigation/state separate.
- `make smoke-proxy` and `make verify-ui-ocu` are the existing real-proxy and browser seams. OCU has a standalone preview browser harness.
- The earlier proposal remains historical input: [withdrawn candidate](../decisions/proposed/architecture/2026-09-20-ocu-path-grant-for-opaque-documents.md). Its header-mode switch is not an approved implementation contract.

## Constraints

1. Grants authorize GET/HEAD only, for a maximum600seconds and no later than the issuing session expires. A session without an expiry still produces a bounded grant. No background renewal.
2. Every request validates the grant, resolves current user eligibility and rechecks chat ownership. Reuse existing session-token and per-user revocation; do not silently bypass configured but unavailable revocation storage.
3. Without Redis, logout does not promise immediate grant revocation. Already delivered bytes cannot be recalled. Ownership loss, deleted/ineligible user or feature disable blocks subsequent requests.
4. Keep `/api/v1/ocu/auth` session-only. Client-supplied headers must not select grant authority on any existing non-grant route.
5. Signatures and credential encoding must be distinct from WebUI session JWTs. No grant is a login credential; no raw session credential or internal OCU secret is inside a grant.
6. Generated documents retain the existing sandbox/CSP/nosniff policy in every opening mode. Only validated grant responses get credential-free opaque-origin resource CORS. Unsupported methods and paths fail closed before OCU contact.
7. Reject ambiguous paths and archive aliases. Actual bytes must come from a validated descriptor within the authorized workspace, not a path reopened after checking. Activation depends on [#201](https://github.com/DankerMu/open-webui/issues/201).
8. Preserve canonical download behavior and ordinary binary/Office consumers. HEAD is explicit: an offline probe of FastAPI0.115.0 confirmed `@app.get` registers only GET.
9. Grants must not leak through server logs, persisted application state, unrelated headers or referrers. Browser-visible grant URLs themselves are intentional bearer capabilities.

## Success Criteria

- All declared resource types demonstrably load in the sidebar, direct top-level file navigation and message-link opening; origin remains opaque, token/localStorage access is blocked, and execution/write requests are denied.
- Valid session owner opens a canonical non-download file URL and reaches its short-lived resource URL. Anonymous/foreign canonical access remains401/404; forged or expired grant requests never contact OCU.
- Grant holders read only the approved single-chat ordinary-file scope; another chat, archive, private data, traversal and symlink-swap controls cannot escape it.
- GET/HEAD preserve bytes/metadata and relevant response policy; HEAD emits no body or leaked descriptor. Downloads and Office/Drawio consumers retain their established behavior.
- Existing session/per-user revocation, expiry, ownership changes, disabled feature and missing user have deterministic refusal evidence. No-Redis logout behavior is stated honestly.
- On expiry the loaded document is not forcibly closed, but further resource requests fail. Reopening the canonical link with a valid session obtains a fresh grant.
- Real proxy evidence covers the five old proposal gaps: header forgery, status matrix, final-response isolation, opaque-origin CORS and HEAD/expiry. Browser screenshots and console/error assertions prove rendering, not just successful HTTP responses.

## Assumptions and Open Decisions

The operator can deploy WebUI authorization before updating the gateway; no new service is required. No unresolved product/security-policy decisions remain after Stage 1. Technical contracts are specified and reviewed in the change before issue creation.

## Phases

| Phase                   | Ownership and outcome                                                                        | Dependencies                            | Primary proof                            |
| ----------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------- |
| Authorization           | WebUI issuer/verifier with bounded, session-bound read capability                            | approved policy                         | backend route tests using the harness DB |
| Ordinary-file transport | OCU explicit GET/HEAD parity over the confined reader                                        | #201                                    | existing file-header/transport suite     |
| Preview consumer        | OCU HTML preview uses final response resource base, canonical navigation remains unchanged   | approved URL contract                   | existing preview browser harness         |
| Gateway                 | OCU route-table/render/auth/CORS/redirect integration                                        | authorization and confined transport    | native proxy tests                       |
| Native integration      | WebUI stub, real-auth Hurl matrix and full OCU pin                                           | gateway, preview consumer, #76 and #229 | make smoke-proxy                         |
| Browser acceptance      | WebUI generated-document end-to-end resource/isolation coverage; widen A-T01 only with proof | native integration                      | make verify-ui-ocu                       |

Each phase is a module boundary, not a license for an oversized issue. Split further when a reviewed task has an independent mergeable verification path.

The native-integration pin may include the existing Office listener. Its already-defined renderer inputs must be supplied with that atomic pin update. Coordinate the overlapping pin/listener-input portion of #172 without duplicating implementation or claiming its real-editor target is delivered.

## Verification

Use the owning backend/OCU/native/browser seam for each phase. Preserve negative controls alongside positive resource loading. Hygienic docs/decision checks accompany the plan and implementation. Cross-repo pins and test evidence identify the actual source revision; fixture-level success is not deployment acceptance.

## Risks

A leaked grant exposes the current chat's ordinary files until expiry or an effective revocation/ownership change. Whole-chat scope is an explicit user choice. Redirect processing before authorization, shared-key session confusion, archive-route collisions, pathname races and raw-URI logging are release blockers, not documentation-only caveats.

## Rollback Or Containment

Deploy a matched rollback of the gateway, WebUI grant routes and harness pin: remove the grant route/redirect and restore the cookie-only file route. Outstanding grant URLs then fail closed. Do not retain unused grant helpers, widen cookies or change iframe permissions as a fallback. Rotate the existing signing secret only through established operator procedures if credential compromise requires it.

## Next Step

Create and review `ocu-resource-grants`, then use #35 as the tracking epic for small implementation issues. No new implementation starts while PR#293 remains at its required CI merge gate.
