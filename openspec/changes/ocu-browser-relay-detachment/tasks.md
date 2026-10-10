## 1. Contract and baseline

- [x] 1.1 Independent expanded fixture review and `openspec validate ocu-browser-relay-detachment --strict --no-interactive` pass.
- [x] 1.2 Bind the issue's saved original-container timeout (124) and repaired-overlay success (0) as historical RED/causal evidence; do not claim overlay evidence certifies the source image.

## 2. Implementation

- [ ] 2.1 Extend the existing image test surface with a fresh-container captured-command and live-CDP regression; parent executes verification.
- [ ] 2.2 Detach all three relay descriptors with nohup in the existing Dockerfile wrapper; inspect unchanged navigation, guard, config and argument forwarding.
- [ ] 2.3 Update the source changelog to describe independent relay lifetime.

## 3. Acceptance and delivery

- [ ] 3.1 Build the complete fixed Dockerfile for linux/amd64 from tracked source, retaining image identity and build output; no runtime overlay substitute.
- [ ] 3.2 In a fresh container with no relay, the exact 15-second pipeline exits 0 and reports the opened about:blank page. After return, CDP responds through the all-interface 9222 listener and loopback 9223 target. Exercise the existing-relay path without replacing it.
- [ ] 3.3 Run owning image regression and changed-shell syntax checks, then expanded correctness, test-evidence and process-lifetime review; publish exact-head local CI evidence.
- [ ] 3.4 Merge source and central fixture PRs, close the issue, and archive the completed fixture only after both acceptance criteria pass.

## Risk packs

Selected: public API / CLI — captured completion, arguments and exit behavior (2.2, 3.2); concurrency / shared state — independent child lifetime and existing-relay guard (2.2, 3.2); error handling — no new retries or suppression of foreground errors (2.2); release / packaging — exact Dockerfile build and fresh-container proof (3.1–3.3).

Not selected: config / setup — config override unchanged; file IO / path safety — no new persisted files; schema — none; auth / secrets — no credentials required or changed; resource limits — no new discovery or limit policy; legacy compatibility — only existing dispatch preserved under CLI checks; documentation / migration notes — changelog and image recreation note suffice, no schema migration.

Non-goals: intentional three-second HTTP navigation window, VPS overlay modification, image dependency upgrades, unrelated browser/CDP repairs, LAN deployment. A blocked full build remains an explicit acceptance blocker.
