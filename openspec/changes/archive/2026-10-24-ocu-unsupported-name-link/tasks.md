## 1. Fixture

- [x] 1.1 Compact fixture, read-only fixture review, `openspec validate ocu-unsupported-name-link --strict --no-interactive`.

## 2. Implement (fork, from `main` `87bae92e6`; `workspace-reconciliation.ts` is unchanged since `72121901d`)

- [x] 2.1 Tests first in `src/lib/components/chat/workspace-reconciliation.test.ts`, driving `clickFileLink` like the existing absent case (`:429-438`):
  - (a) red on `72121901d`: a listing with `{path: 'a\\b.html', url: null, unsupported_name: true}` and a click on `a%5Cb.html` selects that entry's `file_id`; no "Selected file was removed".
  - (b) red on `72121901d`: a three-page listing with the marked entry on page 2 (mount loads page 1 only, so `resolvePath`'s loaded-files shortcut cannot satisfy it): the click selects it and the page-3 cursor is never requested.
  - (c) guard, green before and after: a complete listing that holds a marked entry with a different display path; a click on `missing.html` still sets "Selected file was removed" (the new matcher is not too broad).
  - (d) guard, green before and after: a marked entry present and a click on `bad%B1.txt` (undecodable): "Selected file was removed" is set, no unhandled rejection (the `.then` at `:644` has no `.catch`, so a thrown `URIError` must not escape).
- [x] 2.2 `resolvePath` and the page reader's wanted-path check share one predicate over `files`: the URL equality each uses today (`resolvePath`: `workspaceFileUrl('/ocu', …)` against `encodedFileUrl('/ocu', …)`; the page reader: the server's `file.url` against `encodedFileUrl(current.baseUrl, …)`), else (marked entries only) display `path` equals the once-decoded link path; a decode error means no marked match. All three seen-set sites (`:292`, `:316`, `:336`) use it.
- [x] 2.3 Green: `make test-frontend`, `make typecheck`, `make lint-scoped`, `make anti-drift`, `make verify-ui-ocu` (existing link-click cases stay green). The optional Playwright link-click case from #631 is not added: the Vitest cases cover the resolution logic and the selected-entry fallback is already covered by the `unsupported_name` browser case in `e2e/ocu-tree.e2e.ts`.

## Risk packs

Selected:

- **Legacy compatibility:** URL matching for entries with URLs and the absent notice are unchanged, 2.1 (c).
- **Error handling:** `URIError` on decode leaves the link unmatched, 2.1 (d).

Not selected:

- **Auth / permissions:** no new request; selection uses the authorized listing already read.
- **File IO / path safety:** the decoded path is compared with listed display paths only and never builds a URL or request.
- **Public API, Schema, Documentation:** no API, field or operator-visible doc change.
