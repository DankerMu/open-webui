# Private Office Hurl variables

## Why

Issue #229 identifies reusable run-owned session cookies in Office Hurl argv, including later requests that retain variables. Credentials already have a private-file channel in the smoke harness.

## Risk triage

Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent; credential transport and file lifetime trigger expanded.
Blast radius: Office smoke authentication and credential containment.
Selected risk packs: script entry; config; file ownership; secrets; ordering; compatibility; error cleanup; documentation.
Evidence floor: semantic argv RED/GREEN; private-mode and lifetime regressions; real Hurl precedence; unchanged permanent Office smoke matrix with a nonprinting argv audit.

## What Changes

- Send effective Office variables through a dedicated0600 per-request file under the owned0700 scratch directory.
- Remove the file after successful or failed child execution; preserve retained variables and explicit empty-cookie overrides.
- Leave generic Hurl callers, product authentication, templates and matrix assertions unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ocu-proxy-smoke`: private Office credential transport and request-file cleanup.

## Impact

`scripts/smoke_proxy_office.py` and paired behavioral regression tests. Existing `run_hurl_files` options accept the additional private-file argument; no helper API or dependency change is needed.
