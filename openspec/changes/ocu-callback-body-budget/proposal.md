# Bounded callback admission

Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent (expanded: authenticated public parser and resource boundary)
Blast radius: DocumentServer callback authentication, memory admission and save acknowledgement.
Selected risk packs: Public API; File IO; Auth; Concurrency; Resource limits; Legacy compatibility; Error handling; Documentation.
Evidence floor: real application ASGI RED/GREEN, HTTP callback/control tests, bounded receive/parse observations, unchanged rejected state/files, scoped source checks, independent three-seat review and required CI.

## Why

The callback owner buffers the whole request before checking Authorization. Header authentication needs no body; the compatible body-token branch needs an approved raw-byte bound before buffering and parsing.

## What Changes

Apply the owner-approved fixed 1,048,576-byte budget only when Authorization is absent. Any present Authorization remains authoritative and is verified without body/stream reads or body JSON parsing. Reject overflow before appending its chunk with HTTP 413 and `{"error":1,"reason":"callback_body_too_large"}`. Preserve all authenticated processing and source delivery.

Authority: [issue 252 and approved policy](https://github.com/DankerMu/open-webui/issues/252#issuecomment-6094900704). Source lives in the existing `open-computer-use` checkout; this independent fixture remains in WebUI. Do not modify the historical Office change or archived specifications.

## Impact

`computer-use-server/office/control_plane.py`, owning HTTP/ASGI tests and source changelog; central decision and verification evidence. No new deployment configuration, dependency, gateway/image change or document-content limit.
