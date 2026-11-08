## 1. Native skill mention from the `/` menu

- [ ] 1.1 Add the stub pytest cases and the Playwright case from design.md. Run them on `main` @ `e5da5be3b` first: the skill-block stub case and the browser case must fail.
- [ ] 1.2 Extend `scripts/ocu_stub_model.py` `chat_completion` with the ` Skills: …` suffix.
- [ ] 1.3 Backport upstream `c402acb404` at `src/lib/components/chat/MessageInput.svelte:1424`.
- [ ] 1.4 Replace the native-mention sentence in `openspec/changes/ocu-uploaded-skills/tasks.md` task 7.1 (`:764`). It should say that native mentions from the chat `/` menu serialize as `<${id}|{name}>` since #771.
- [ ] 1.5 Run the verification list in design.md. Every command passes.

Risk packs:

- Legacy compatibility — selected: the `/` command's other branches, the uploaded-skill branch, the `$` menu, and existing stub replies are unchanged. Covered by the unchanged suites listed in design.md.
- Public API / CLI, Config, Schema, Auth/secrets, Concurrency, File IO, Resource limits, Error handling, Release, Documentation — not selected: the change is one editor attribute plus a test stub, and it touches no interface, config, schema, credential, ordering, file path, limit, error path, packaging or user doc.

Suggested fixture level: standard
Minimal mergeable slice: atomic
