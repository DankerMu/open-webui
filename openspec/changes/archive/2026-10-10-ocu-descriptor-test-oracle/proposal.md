## Why

The authored broker cleanup regression assumes the iterator's descriptor number is near the descriptors opened by the broker. Under controlled descriptor occupancy, it scans numbers below16 while the real iterator owns43, so cleanup assertions are never reached.

## What Changes

Replace the numeric-window observation with a real open-descriptor inventory in the existing test. Cover both ordinary and pressured descriptor layouts for OSError and BaseException paths. Retain native iterators until cleanup assertions finish so garbage collection cannot stand in for explicit closure. Preserve borrowed-root survival, closure of current/frontier/iterator descriptors, and successful rescan.

## Capabilities

No production behavior or canonical requirement changes. `skip_specs: true`: this repairs the evidence for the existing broker ownership invariant.

## Impact

Issue: https://github.com/DankerMu/open-webui/issues/320

Corrective prerequisite for the original #68 work and #186 full-suite gate; not a general expansion to newly discovered follow-ups.

Issue type: test. Fixture level: compact. Upstream suggested level: absent.
Blast radius: one broker test. Selected risk packs: resource limits / descriptor ownership; error handling / cleanup.
Evidence floor: existing measured pressure RED, four ordinary/pressured exception cases GREEN, retained-iterator leak negative control RED, owning broker suite, and proxy-clean full orchestrator suite.

No production changes, threshold relaxation, deleted ownership assertion, new skip, unrelated test repair or arbitrary wider numeric scan. No design document: the existing test is repaired in place.
