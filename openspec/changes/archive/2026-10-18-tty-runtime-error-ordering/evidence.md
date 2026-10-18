# Verification evidence

Source head: `cc3f0a1582912c3b185e18d3fbd00ceb19f3e982`.

[Complete local receipt](../../../../docs/evidence/issue-502/verification.json.gz) contains raw commands, stdout/stderr, exact collected IDs, JUnit outcomes, probe sources, diagnosis, fixture review and commit hooks.

- Decoded SHA-256: `55a1226cb1d6348acee0e457d9a7766075c4d42e406857269d01a89a599af6f7`.
- Gzip SHA-256: `3477b8a39ee95587da65d9bdfd1ca77bdb84629915a69c06e8fcadffb7ab26db`.
- Environment: Darwin arm64, Python3.12.12, 52 pinned compatible packages; package check exit0. No dependency changes.
- Controlled unchanged-target failure: actual socket close → owner shutdown → real errno9 while stopping; same `OSError not raised` failure. Worker-first diagnostic control passes. This proves a reachable race, not the original uninstrumented interleaving.
- Fixed target under the same shutdown-first scheduling opportunity: exit0; owner stays running through actual errno9, exact error propagation and retirement assertions pass.
- Temporary no-error mutation: exit1 with operation-error diagnostic. Temporary swallowed-error mutation: exit1 with owner-propagation assertion. Probe scripts are not part of the acceptance selection or committed source.
- Exact selected inventory unchanged: 583 nodes. Full selected execution: 583 passed, 3435 deselected, 332 subtests passed, 38 warnings; exit0. Includes all deploy tests plus shared HTTP-origin, Office holder/command/router/callback/download and tool consumers.
- `make doc-gate`, `make decisions-verify` (56 records), strict OpenSpec validation and source commit hooks: exit0. Decoded public packet gitleaks scan: exit0, no leaks.

Two invalid diagnostic attempts misselected a client socket and raised IndexError; their receipts are retained and excluded from conclusions. No shared lifetime/production behavior changed, no tests removed, no retry/skip added. This is local selected evidence, not full-repository, hosted, native-Linux, LAN or release acceptance. Cross-review and merge receipts are posted separately against frozen heads.
