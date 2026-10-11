## Why

The browser relay inherits captured CLI output descriptors, keeping the reader's pipe open after the CLI exits. The issue's isolated-container red/green record identifies descriptor ownership as the cause.

## What Changes

Detach the background relay's standard descriptors and ignore hangup signals. Preserve the CDP endpoints, existing-relay guard, CLI arguments and HTTP navigation sequence. Add image-level behavioral coverage and a source changelog entry.

## Capabilities

- New `ocu-browser-cli`: bounded captured-command completion with an independently live CDP relay. The canonical inventory has no browser CLI contract.

## Impact

Issue: https://github.com/DankerMu/open-webui/issues/178

Issue type: bugfix. Fixture level: expanded. Upstream suggested level: absent.
Blast radius: the sandbox image's browser wrapper and its captured-output consumers.
Selected risk packs: public CLI; concurrency / process lifetime; error handling; release / packaging compatibility.
Evidence floor: the issue's saved semantic RED, exact fixed-Dockerfile image build, fresh-container bounded pipeline and live CDP forwarding; unchanged navigation/argument handling.

No dependency upgrade, navigation delay change, new relay supervision, or unrelated browser repair. No architectural decision record is required for descriptor redirection within the existing wrapper; the process ownership invariant is specified here.
