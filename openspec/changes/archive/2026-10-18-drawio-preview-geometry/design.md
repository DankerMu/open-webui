# Design

## Diagnosis

The existing 120×60 rounded rectangle renders with a 1px stroke. The diagnostic loop reuses the canonical fixture HTTP server, captured production preview and actual pinned viewer; it does not construct a replacement renderer. Its first run exited 1 in about three seconds: painted right 716.5 exceeded effective clip right 712.5 by 4px. Actual host dimensions were 145×120, not the inline height85; the min-height was effective.

Three ranked hypotheses preceded single-variable experiments: host padding/box sizing, SVG viewport/transform, and outer viewport width. Padding0 restored full visibility while retaining the 145×120 host and intrinsic geometry. Local content-box also restored visibility but enlarged the outer host to185×160. SVG overflow-visible alone and a wider1600px viewport both retained the4px overrun. Restoring each baseline restored clipping; no browser errors occurred. Diagnostic records are retained with delivery evidence.

Diagnostic receipts: `/tmp/issue314-geometry-red.json`, `/tmp/issue314-geometry-experiments.json` and `/tmp/issue314-diagnosis.json`; screenshots: `/tmp/issue314-geometry-red/ordinary-geometry.png` and `/tmp/issue314-geometry-experiments/*.png`. Delivery retains these files with their source identities.

Cold initialization rejected padding removal: `/tmp/issue314-geometry-initial-size/probe-failure.json` records a 0×120 host with no SVG, successful asset responses and the renderer timeout. The pinned GraphViewer delays rendering while `container.offsetWidth == 0` (`GraphViewer.js:661–677`). Post-render style interventions did not exercise that initialization condition; the frozen full harness also rejected the padding-removal candidate.

## Decision

Set `box-sizing:content-box` only on the `.drawio-host` created by `renderDrawioPreview`, retaining its padding. GraphViewer's automatic dimensions then describe its content area instead of competing with decorative padding. Padding also keeps the empty flex item nonzero during viewer initialization. Preserve background, radius, minimum height, normal overflow and viewer configuration; the global border-box reset remains untouched.

This accepts a larger outer decorative box (185×160 for the diagnostic fixture) and content-box max-width semantics. Actual viewport containment remains part of acceptance for the supported fixtures. Removing padding is rejected because it produces a zero-width initial host; a new wrapper adds layout and toolbar-positioning ownership. No magic minimum width, transform offset, blanket scaling or overflow bypass is introduced.

## Must preserve

- Plain, compressed and multipage rendering; expected shape content and stroke geometry.
- Mounted selection of B and revision-driven replacement; page controls, Zoom In/Out, Fit, fullscreen open/close and complete fullscreen geometry.
- Existing stage retirement, deferred/newer fullscreen ownership and child theme subscription cleanup.
- Pinned assets, other preview types, sanitizers, public-prefix routing and Files embedding restrictions.

Governing invariant: the spec's otherwise-fitting geometry must not be clipped by the decorative host. Sibling owners: `renderDrawioPreview` creates `.drawio-host`; pinned GraphViewer assigns its automatic size; `preview.css` owns global box sizing and outer clipping. Ordinary selection/revision consumers rebuild that host; page/fullscreen guards and `failOwnedPreview` consume its renderer lifetime. Existing retirement/theme and failure scenarios remain the preservation oracle.

## Executable proof

Extend the existing `assertLocalShapeGeometry` browser boundary rather than introducing a parallel renderer or geometry-test owner. Keep its original shape-content assertion and add painted stroke bounds transformed to screen coordinates, intersected with real clipping ancestors and viewport. Check the rendered shape is visible; screenshots must show all four sides, rounded corners and stroke. Do not assert a CSS literal, mere SVG existence or text presence as the fix oracle.

Keep the default ordinary fixture's native-coordinate check. Intentional zoom and fullscreen may express scale in SVG attributes rather than its CTM: identify the same rounded rectangle, preserve its 2:1 aspect ratio, measure its screen-space painted bounds, and prove control transitions with before/after dimensions instead of requiring unchanged 120×60 rendered attributes.

Freeze one permanent ordinary-view regression before source changes and observe semantic RED. After the local source correction, prove that frozen regression and the independent fast probe GREEN without DOM style interventions. Then cover plain/compressed/Page-one inputs, ordinary B selection and revision replacement, Zoom In/Out/Fit and fullscreen geometry/return. Use actual controls and separate geometry evidence from lifecycle evidence.

Run OCU `tests/orchestrator/preview_embedding_browser.cjs` with the pinned Playwright launcher (`/tmp/issue313-browser.py`) and `uv run --offline --python 3.12 --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest tests/ --import-mode=importlib --ignore=tests/integration -k test_preview_prefix.py`. Preserve `broken.drawio` → visible `.dl-error` and recognized render error, with no unexpected errors. Retain all original assertions. Diagnostic A/B controls are historical cause evidence; final acceptance executes changed source without probe-applied styles.

## Delivery and limits

Update the existing local-Drawio-materials decision and OCU changelog after runtime proof. Rollback is the focused host-style/test change; no migration or dependency change. Local Chromium geometry evidence does not certify every possible diagram, other browser engines or LAN deployment. Parent evidence custody is not OS isolation.
