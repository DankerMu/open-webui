Change surface: `WorkspaceArtifact.svelte` preview branches and a new pure routing function with paired tests; OCU `preview.js` `embeddedFileDisposition`, `renderPreviewContent`, the text renderers.

Routing, decided once per selected file. Precedence as listed; every branch needs `servable(file)`, so `too_large` and `unsupported_name` still reach the fallback without a byte fetched:

| Route     | Condition                                                                                           | Display                                            |
| --------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| editor    | existing                                                                                            | Office editor                                      |
| office    | broker type docx/xlsx/pptx                                                                          | existing iframe                                    |
| generated | existing MIME list                                                                                  | existing opaque iframe                             |
| image     | MIME essence png, jpeg, gif, webp, bmp, x-ms-bmp                                                    | `<img>` with `?revision=`                          |
| pdf       | MIME essence application/pdf                                                                        | `PDFViewer` in `singlePage` mode with `?revision=` |
| embedded  | broker type markdown, code, text, spreadsheet, audio, video, and MIME not refused by the rule below | `embed=files` iframe                               |
| download  | otherwise                                                                                           | `WorkspaceDownloadFallback`                        |

`.drawio` (`application/xml`) and `.xml` (`text/xml`) match generated first, as today. The embedded route's refusal covers `+xml` MIME types that generated does not list; those reach download.

The image and PDF elements are remounted with `{#key file_id:path:revision}`, matching the Office key at `WorkspaceArtifact.svelte:164` and the refresh rule in `ocu-workspace-files` (path plus revision), because neither uses the generation protocol and `PDFViewer` assigns `pdfDoc` before its token check, so an old document could otherwise overwrite a new one.

The route uses MIME and broker type, never `workspaceFileKind` (spec: display kind does not change eligibility) and never a filename.

Must preserve:

- The `ocu:preview-*` message schema, source, origin, chat and generation checks. The iframe stays exactly `allow-scripts allow-same-origin allow-forms`, with no `allow-downloads`.
- Every Office behaviour, including `officeEdit`, which stays bound to Office types only.
- MIME refusal in `embeddedFileDisposition` for HTML, SVG, XHTML, XML and `+xml`, whatever the broker type. `drawio`, `html` and `other` stay unsupported.
- The polling reconcile rule: a revision change reloads the preview, an unrelated change does not.
- Standalone preview behaviour.

Must add/change:

- `embeddedFileDisposition` admits markdown, code, text, spreadsheet, audio, video.
- With `embedded` true, the markdown, code and spreadsheet renderers report failure on a fetch error, a non-OK response or a sanitizer failure, so state is `error`, not `ready`. Audio and video report `ready` on `loadedmetadata` and `error` on the element's `error` event, which covers formats the browser cannot decode (`.mkv`, `.avi`, `.wma`).
- With `embedded` true, Markdown is static: no Mermaid, no KaTeX (blocks stay as escaped code or text); an image stays only if it is inline raster data or its fully resolved URL has the page's origin and a path under `FILES_BASE/`, following the origin comparison at `preview.js:2410-2414`, because `FILES_BASE` alone is only a path; everything else, including root-absolute raw HTML, `../` traversal and `//host`, is removed before insertion; at most 100 images are kept, so a document cannot fan out requests; a URL with a query string, or the chat's `archive` route under `FILES_BASE/`, is removed, because that route builds a whole-workspace zip; a URL that does not parse is removed, not fatal; links keep their text, and only same-document fragments stay active. HTTP(S), mailto, relative-file and rejected links have no `href`, so nothing navigates the frame, selects a file, opens the external-link dialog or leaves through `mailto:`. Syntax highlighting stays, because hljs escapes its input.
- Parse-time limits, embedded only, because `marked` and `hljs` run on the thread shared with WebUI, where a hostile shape grows quadratically and would stall the tab past its watchdog:
  - Markdown over 30,000 characters displays as escaped plain text with a notice, and reports `ready`; that view stops at 200,000 characters and says so, because layout of mixed-direction text scales with length;
  - CSV and TSV show at most 200 columns with a notice, because a table's layout cost follows columns, and one row can hold hundreds of thousands; each shown cell stops at 1,000 characters, far past what the 400px cell displays, because a `nowrap` cell lays out in full;
  - Markdown under the parse limit gets an upper bound on table cells from the text alone, before any lexing: the highest count of `|` on a line plus one, times the number of lines, splitting lines as `marked` does (`\r\n`, `\n` and bare `\r`). Over 200,000, the size of the largest spreadsheet view, it uses the plain-text view, because `marked` pads short rows to the header width and materialises every cell. The bound can over-count, never under-count, and ordinary documents are far below it;
  - a line with more than 16 `>` characters anywhere also uses the plain-text view, because each nested quote level makes `marked` lex the rest again, and a few hundred levels exhaust memory under 30,000 characters;
  - code and text over 20,000 characters display without `hljs` and line numbers;
  - a Markdown fence keeps its language class only when `hljs.getLanguage` resolves it, and otherwise gets `no-highlight`, so nothing auto-detects across grammars.
    Standalone keeps its behaviour. A Worker would isolate the cost fully, but it needs the custom renderer moved across; the limits keep the worst case to seconds, and recoverable.
- `embeddedFileDisposition` reports `unsupported` for `too_large` and `unsupported_name`, so a listing race cannot show a dead link with `ready`.
- `app.py` registers `image/webp` for `.webp` at import, before `classify_file` and the file route use `mimetypes`. Python 3.13, which OCU's tests run on, already knows `.webp`; the server image is Python 3.12 without `/etc/mime.types` and does not. So the test clears `.webp` from a clean `mimetypes` database, reimports `app` with `_isolated_app` (`test_outputs_endpoint.py:104`), and asserts the result, which proves the import-time call.
- Audio and video omit their `download` link in embedded mode: the frame has no `allow-downloads`, and the parent owns download.
- `renderCodePreview` puts only a `[a-z0-9]+` extension into the `language-` class. Today `file.name` reaches `innerHTML` unescaped. Both modes get this.
- The non-Office embedded frame uses neutral strings (no "Office"), through i18n, with zh-CN text.
- The image route, on `<img>` error, shows the download view with failure copy distinct from "Preview not supported". The fixed frame's `unsupported`, `missing` and `error` states show the same kind of failure with a working download, which is what a new WebUI sees against an older OCU.

Governing invariant: model-controlled bytes and names never execute on the WebUI origin and cause no request off the workspace. Raster bytes go only through `<img>`, PDF only through pdfjs 5.5, and text only through escaped or DOMPurify-sanitized DOM with nothing writing to the DOM after sanitizing in embedded mode except hljs.

Sibling surfaces:

- Markdown renderer: `mermaid.run` (`preview.js:492`) and `renderMathInElement` (`:501`) write after DOMPurify, and `embed=files` has no CSP (`app.py:1464`); both are off in embedded mode. `handleLinkClick` (`:215`) opens a dialog whose Open button is dead without `allow-popups`, and `mailto:` skips `preventDefault` (`:468`). Remote images (`:438-441`) would leave from the employee's browser, past `OCU_SANDBOX_EGRESS_ALLOW` (`CONTEXT.md:34`). Root-absolute and traversing image URLs keep origin-root semantics (`:388`, `:440-441`) and would send cookies to any same-origin path, so embedded mode checks the resolved URL against `FILES_BASE/`.
- `constraints.yaml` pins the OCU SHA that WebUI CI builds against; it moves to the merged OCU commit in task 4.2.
- `docs/decisions/implemented/architecture/2026-09-30-ocu-local-drawio-materials.md:29` also says Office only.
- CSV renderer: escapes cells with `escapeHtml`.
- `renderDownloadFallback`, reached in embedded mode for `default`: only for types now refused.
- `FileItemModal` shares `PDFViewer`: no prop or behaviour changes there.
- `PDFViewer` renders every page by default (`:266`) with no page limit; `singlePage` renders one page with its navigation, which is the limit here.
- `escapeHtml` is the shared helper for text and attribute sinks in `preview.js`; it gains quote escaping, so every sink is covered. Its `getDocument` caller in `renderPdfPreview` passes `isEvalSupported: false`.
- `openspec/specs/ocu-preview-spa/spec.md:225` says Files-only embedding refuses Markdown without fetching it: replaced by the MODIFIED requirement in this change.
- `tests/orchestrator/preview_embedding_browser.cjs:1633-1638` asserts `hostile-markdown` is `unsupported` with no fetch: inverted, and its canary at `:1235-1239` is reused.

Seams under test: the routing function; `WorkspaceArtifact` component tests; real OCU child through `preview_embedding_browser.cjs`.

Required evidence: `tasks.md` §3.

Non-goals: as in the proposal.

Review focus:

- Every embedded image request stays under the files base.
- Any path where filename, file text or markdown reaches the DOM unescaped in the embedded frame.
- Office regressions from widening the frame's condition.
- Stale results and timers across switching between Office, embedded, image and PDF files.
- A corrupt file never shows blank success.
- Nothing in embedded Markdown writes to the DOM after sanitizing except hljs.
