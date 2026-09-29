# Local material closure

## Ownership

The existing preparation script owns supported package selection, dependency closure, integrity verification and publication. The installed Pyodide package owns compiled runtime/distribution versions. A supplementary declarative manifest owns exact pure-Python wheel versions, filenames, source URLs, SHA256 and dependency/import names absent from the distribution. Existing runtime workers remain consumers of the standard Pyodide lock schema and local /pyodide index.

## Build algorithm

Read installed distribution metadata, not a caret-stripped package.json assumption. Resolve the current supported root set and its transitive dependencies from the distribution lock plus explicit supplements. Fail on absent nodes, unsafe filenames, missing/invalid hashes or contradictory definitions. Use fixed URLs/version-addressed sources, never unversioned PyPI latest metadata during normal preparation. Preserve existing package versions. Verify cached/downloaded bytes by SHA256; existence alone is insufficient. Hash and cache checks precede success publication.

Copy the distribution runtime before generating the final local lock. Stage generated output as an owned temporary build directory, validate all supported materials and then publish without leaving a success lock referencing unavailable bytes. On download/integrity/publication failure report nonzero, clean owned staging and preserve the prior valid bundle. Do not swallow exceptions. No separate parallel bundle implementation or compatibility alias.

Keep the existing proxy configuration capability without logging credential-bearing proxy values; invalid explicit proxy configuration must fail rather than silently disappear. No unrelated environment/secret reads in tests or evidence.

## Runtime compatibility

Keep standard Pyodide package names/normalization, imports, install directories, wheel hashes and dependency relationships. Workers continue calling micropip.install against the local index. Supported packages include the existing preparation list (micropip, packaging, requests, beautifulsoup4, numpy, pandas, matplotlib, scikit-learn, scipy, regex, sympy, tiktoken, seaborn, pytz, black, openai, openpyxl). Supplement dependencies must be explicit, not empty arrays where actual runtime imports require them.

No claim for arbitrary third-party packages outside this root closure. No claim that a locked image can be rebuilt without WAN. User-approved new supplementary versions are recorded with provenance; existing four supplemental versions are retained.

## Verification boundary

A native loopback HTTP server serves the produced real runtime and wheel files to pinned Playwright Chromium. The browser verifier rejects and records all non-loopback requests, loads local Pyodide, installs/imports every supported root and executes observable numerical/table, seaborn figure and openpyxl workbook round-trip operations. A missing-wheel mutation must fail the browser/material oracle; a corrupted cached wheel must fail integrity, not pass an existence check. Parent executes all verification; leaves never run tests/builds/formatters.

Sibling surfaces to audit: package.json dev/build entrypoints, scripts/prepare-pyodide.js, distribution and supplemental lock names, tracked generated lock, src/lib/workers/pyodide.worker.ts, src/lib/pyodide/pyodideSandboxHost.ts, CodeBlock package roots, Makefile and verifier discovery. Runtime consumers are intentionally unchanged unless an actual standard-lock incompatibility is proven; widening that scope requires explicit adjudication.
