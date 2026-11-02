## 1. Fixture

- [x] 1.1 Proposal, design, tasks, spec deltas; fixture review (revise three times, applied; the owner approved applying the third without another pass); `openspec validate ocu-workspace-file-preview --strict --no-interactive`.

## 2. Risk packs

- **Auth / secrets (trust boundary)** — selected: evidence b, d.
- **Concurrency / ordering** — selected: `<img>` and `PDFViewer` do not use the generation protocol. Evidence c.
- **Legacy compatibility** — selected: Office and generated routes stay intact. Evidence a, c.
- **Error handling** — selected: load failures are visible. Evidence c, d.
- **Resource limits** — selected: `too_large` and `unsupported_name` never fetch; PDF renders one page; renderer truncation stays. Evidence a, c, d.
- **Release / packaging** — selected: a new WebUI against an older OCU gets `unsupported` for text files. Evidence c.
- **Documentation** — selected: evidence e.
- **Public API, Config, Schema, File IO** — not selected: the `ocu:preview-*` schema, config and file routes are unchanged; the `.webp` MIME registration is covered by evidence a.

## 3. Evidence

- a. Routing unit test, input to route:
  - `photo.png` `image/png`, `a.jpg` `image/jpeg`, `b.webp` `image/webp`, `c.gif` `image/gif`, `d.bmp` `image/bmp` to image;
  - `e.svg` `image/svg+xml`, `f.drawio` `application/xml` and `n.xml` `text/xml` with broker type code to generated;
  - `r.pdf` `application/pdf` to pdf;
  - `README.md`, `a.txt`, `t.csv`, `x.json`, `m.py`, `s.mp3`, `v.mp4` to embedded;
  - `feed.atom` `application/atom+xml` with broker type code, and `q.bin`, to download;
  - uppercase and `; charset=` MIME values normalize; `too_large` and `unsupported_name` on each route go to download.
  - OCU, isolated from the host `mime.types` and the interpreter's map: with `.webp` cleared from a clean `mimetypes` database, reimporting `app` through `_isolated_app` (`test_outputs_endpoint.py:104`) makes `classify_file('b.webp')` return `image` with `image/webp` and the file route serve `image/webp`, red without the import-time registration.
- b. OCU `preview_embedding_browser.cjs`, reusing the canary at `:1235-1239`:
  - a listing that explicitly gives type `code` to the file named `data:text/plain,a."><img src=x onerror=...>`: state `ready`, `<code>` exists, no canary fires, no injected element; the same in standalone mode;
  - a Markdown file with `<script>`, `<img onerror>`, `javascript:`, hostile Mermaid and KaTeX payloads, remote, root-absolute raw HTML (`<img src="/api/x">`), `../` traversal, and `//evil.example/<files base>/x.png` and `https://evil.example/<files base>/x.png` images, a valid relative image, and HTTP, mailto and relative links: no canary, no `.mermaid` or `.katex` element, every image request is on the page origin under the files base and the rest are absent from the DOM, clicking each link neither navigates the frame, selects a file nor opens a dialog, and a same-document fragment link still scrolls.
  - the static Markdown fixture also carries images resolving to the `archive` route directly, through dot segments and with a query string, an image with any query string, malformed URLs that normalise to a double slash, and 101 valid images: no `archive` request, those images absent, the document still `ready` with neighbouring content, and at most 100 images requested;
  - a file name containing a quote renders with its `alt` intact and no added attribute, in embedded and standalone mode; `renderPdfPreview` calls `getDocument` with `isEvalSupported: false`, and a valid PDF still renders standalone.
- c. `WorkspaceArtifact` component tests:
  - audit and update every test that treats these types as unsupported: `WorkspaceArtifact.preview.test.ts:59-62,429-433`, `WorkspaceArtifact.tree.test.ts` (`photo.png`, `notes.txt`), `WorkspaceArtifact.office.test.ts:95` (`brief.pdf`), `e2e/ocu-tree.e2e.ts:197,235`, moving them to a genuinely unsupported file with none deleted;
  - image renders `<img>` with the revision URL and no iframe; an error event shows the failure copy, not "Preview not supported", with a working download; selecting another image afterwards displays it;
  - PDF mounts `PDFViewer` in `singlePage` mode with the revision URL; selecting another PDF remounts it, and the first document cannot replace the second;
  - text mounts the frame with exactly the fixed sandbox, with neutral strings, no "Office", through connecting, rendering, ready, error, timeout and retry;
  - the frame's `unsupported` and `missing` states for a text file show a visible failure and a working download;
  - a revision change and a rename with the same revision each reload the text frame, `<img>` and PDF; a change to an unrelated file keeps each element's identity;
  - a PDF load failure leaves a visible failure and a working download;
  - switching Office to text to image to PDF to Office leaves no timer or stale state, and `officeEdit` stays false for text.
- d. OCU `preview_embedding_browser.cjs` and tests:
  - invert `:1633-1638`: `hostile-markdown` now fetches and reports `ready` with sanitized content;
  - each admitted type reports `ready` with visible content; the video fixture is WebM, because Playwright's Chromium has no H.264;
  - a network failure and a 404 for Markdown, code and CSV, and a sanitizer failure, report `error`;
  - corrupt mp3 and mp4 report `error`;
  - HTML, SVG, XML, `+xml`, drawio, pdf, image and other report `unsupported`;
  - audio and video have no `download` link in embedded mode and keep it standalone;
  - Markdown over 30,000 characters, including a shape of repeated unmatched delimiters, reports `ready` as plain text with a notice, and `marked` is not called; Markdown at 30,000 still renders;
  - Markdown over 200,000 characters shows the first 200,000 with a notice saying the view is truncated;
  - Markdown under 30,000 characters with a wide header and thousands of short rows reports `ready` in the plain-text view with a notice, no `td` or `th`, within a bound including forced layout; a table whose upper bound is exactly 200,000 still renders; bare-CR line endings count as lines; a realistic 12-by-200 table renders;
  - deeply nested quotes under 30,000 characters, with a table and without one, report `ready` in the plain-text view with `marked.parse` not called; 16 `>` on a line still renders; an ordinary quoted document renders;
  - a CSV cell of 200,001 mixed-direction characters reports `ready` within a bound including forced layout, showing 1,000 characters; a TSV likewise; a cell of 1,000 is shown whole; standalone keeps the full cell;
  - a CSV row of 500,000 delimiters reports `ready` promptly with 200 columns and a notice; a TSV likewise; 200 columns show no notice; standalone keeps every column;
  - code over 20,000 characters reports `ready` with no `.hljs` spans; code at 20,000 highlights; an unlabelled fence, one labelled only with hyphens, and an unknown label all have `no-highlight`;
  - text over 200k characters truncates and reports `ready`;
  - `too_large` and `unsupported_name` entries report `unsupported` with no file request.
- e. Docs by grep and `make decisions-verify`: `computer-use-server/README.md` no longer says only DOCX/XLSX/PPTX are eligible and states the admitted types, the static Markdown rule and the PDF route; both decision records record the widening; `CHANGELOG.md` has an Unreleased entry.
- f. `make test-frontend`, `make typecheck`, `make lint-scoped`, `make verify-ui-ocu` with screenshots in `.run/ui-evidence/` of image, PDF and text in the sidebar and no new console errors. `scripts/ocu_stub_nested.py` gains a PDF fixture. A multi-hundred-page PDF opens on page 1 and renders one page.

## 4. Implement

- [x] 4.1 OCU `preview.js` (including `escapeHtml` and the PDF loader option), `app.py` MIME, README, changelog and tests, merged first. Commit and PR text describes the change neutrally as preview hardening. Merged as DankerMu/open-computer-use#198 `1c378fa4343b41410d858b6bbe3108b2835ff44e`. Same-class residual after the owner's merge rule: #692.
- [x] 4.2 WebUI routing function, branches, failure copy, i18n, tests, stub PDF fixture, `constraints.yaml` OCU pin moved to the merged 4.1 commit. Merged as #694 `d8071a25ad532957dd655acc39afc99af076f6a6`, which also fixes PDFViewer single-page width, double load and toolbar in the sidebar.
- [x] 4.3 Decision records, `make decisions-verify`. Review moved the widening into a new record, `2026-11-02-ocu-sidebar-file-preview.md`; `2026-09-27-ocu-restricted-office-embedding.md` keeps its decision and links it (README rules 2 and 6). The drawio record needed no change.
