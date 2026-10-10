## Purpose

Allow isolated generated documents to load relative workspace resources through short-lived read-only capabilities without gaining session or execution authority.

## ADDED Requirements

### Requirement: Session-bound single-chat read capability

A resource grant SHALL authorize only GET/HEAD reads of ordinary workspace files in exactly one chat. It SHALL bind the issuing verified user's session, expire within600seconds and not outlive a present session expiry; a session without expiry SHALL still produce a bounded grant. It SHALL NOT contain a login credential, authenticate as a WebUI session, or authorize another chat, private Office data, archive, listing, terminal, control-plane or write operation. Missing session-binding claims SHALL require a fresh sign-in rather than produce an unbound grant.

#### Scenario: Scope and bearer possession

- **WHEN** an eligible owner issues a grant and another browser holds its URL
- **THEN** the holder can read ordinary files of that chat without a cookie while the owner's authorization remains valid, but cannot use the grant to access another chat or any excluded operation

#### Scenario: Session confusion and malformed credentials

- **WHEN** a grant is presented as a WebUI login token, or a session token, oversized/malformed/altered grant or unsupported-purpose token is presented as a resource grant
- **THEN** the inappropriate credential is rejected without granting session or resource authority

#### Scenario: Bounded session expiry

- **WHEN** issuance occurs for sessions expiring sooner than600seconds, later than600seconds, or without an expiry
- **THEN** the grant ends respectively at the earlier session expiry, within600seconds, or within600seconds; already expired or unbindable sessions cannot issue

### Requirement: Authorization is re-evaluated per resource request

Every grant request SHALL verify scope/signature/time, current user eligibility, exact chat ownership and the issuing session's existing revocation state. Ownership loss, deleted/ineligible user, disabled workspace feature or effective revocation SHALL reject subsequent requests. Configured revocation storage failing SHALL fail closed; absent Redis SHALL retain the agreed TTL-bound logout limitation. Successful authorization SHALL identify the issuing user from current server state, never from caller identity headers or a holder's cookie.

#### Scenario: Revocation and changed ownership

- **WHEN** an issued grant is followed by a configured session/per-user revocation, ownership change, user deletion/demotion or workspace disable
- **THEN** the next resource request is refused before OCU contact, even when the grant signature and expiry remain valid

#### Scenario: No Redis and unavailable configured Redis

- **WHEN** logout occurs without Redis
- **THEN** the grant may remain usable only until expiry while current user/ownership checks still apply
- **WHEN** configured revocation storage cannot be checked
- **THEN** the resource request fails closed rather than behaving as a no-Redis deployment

### Requirement: Canonical entry and explicit expiry recovery

Listings, messages, filters and persisted workspace state SHALL retain canonical cookie file URLs. Authorized non-download file entry SHALL produce a non-cacheable short-lived resource URL without contacting OCU before authorization. Downloads SHALL retain their existing canonical behavior. Grants SHALL NOT renew automatically. Expiry SHALL reject new resource requests without claiming to revoke already delivered bytes; reopening the canonical URL with a valid session SHALL obtain fresh authorization.

#### Scenario: Canonical owner entry and denied entry

- **WHEN** the owner opens a canonical non-download file URL
- **THEN** authorization precedes the redirect to its granted resource URL and the document bytes remain unchanged
- **WHEN** the same canonical URL is opened anonymously or by a non-owner
- **THEN** the response remains401 or404 respectively, with no issued grant or OCU contact

#### Scenario: Expired page and reopen

- **WHEN** a loaded document's grant expires
- **THEN** subsequent resources fail, already loaded content is not forcibly closed, and no renewal request occurs
- **WHEN** the owner reopens the canonical message/sidebar URL with a valid session
- **THEN** fresh authorization permits resources again without persisting a grant URL

### Requirement: Relative resources preserve document isolation

Sidebar, direct top-level file navigation and message-link opening SHALL load relative CSS, images, fonts, classic scripts, module scripts and ordinary relative GET/HEAD fetch resources while generated documents remain opaque-origin. Browser previews that construct a document from fetched text SHALL use the final response resource base and retain canonical navigation separately. Credential-free opaque-origin CORS SHALL be limited to validated resource-grant responses. Login tokens/storage, parent origin and execution/write APIs SHALL remain inaccessible.

#### Scenario: Actual multi-resource rendering

- **WHEN** a deterministic generated HTML document is opened through each of the three entry modes
- **THEN** its stylesheet changes computed styling, its image and font render, classic/module scripts execute, relative data fetch returns the fixture data, and token/localStorage/parent access and write/execution probes remain denied

#### Scenario: Generated SVG and preview response base

- **WHEN** a generated SVG is opened or the trusted preview fetches a redirected HTML document
- **THEN** generated content retains opaque-origin sandbox/CSP isolation, relative resources use the final granted base, and navigation/state keeps canonical file URLs

#### Scenario: Unsigned and unsupported requests

- **WHEN** a cookie-less opaque document targets a canonical cookie file path, an unsupported grant method, credentialed/custom-header CORS, or a non-file API
- **THEN** no additional authority or global CORS permission is granted; unsupported gateway methods and paths do not contact OCU
