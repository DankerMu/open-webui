# Canonical pytest selection guidance

Issue type: test
Fixture level: none
Upstream suggested level: absent (documentation-only invocation guidance; no executable repository changes)
Blast radius: selected-suite verification scope and fixture-discovery evidence, not application behavior.
Selected risk packs: Legacy compatibility; Documentation.
Evidence floor: exact historical 864-node set equality under pytest 9.1.1, canonical world-fixture availability, separately recorded selected execution, current-corpus equality without trimming growth, documentation checks and independent evidence review.

## Why

Mixed explicit paths spanning root tests and orchestrator tests produced distinct pytest collector identities for the same logical directory. The approved invocation uses a single `tests/` discovery root and the equivalent module-name `-k` expression; changing fixtures or dependency policy is outside this issue.

## What Changes

Document and use the canonical invocation in the existing OCU test README. Retain an independently inspectable record of selected node IDs and execution outcomes. The exact 864 count belongs to source `d670ce86af53fa1c4636a55875e7d4b72ae53ff0`; the same sixteen-module selection at current source `2e3425f1222541c4b88909cc677e0287af2a7d21` contains 950 nodes, which must not be trimmed to imitate the historical count.

No production, test, conftest, fixture, pytest version, dependency manifest or lockfile changes. No wrapper or permanent test runner is needed. Design document omitted for this documentation-only fixture.

Authority: [issue 255](https://github.com/DankerMu/open-webui/issues/255), including its original execution record. Central OpenSpec and evidence remain in WebUI; the invocation guidance belongs in the existing OCU checkout.
