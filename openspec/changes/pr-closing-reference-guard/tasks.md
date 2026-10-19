## 1. Contract and fixture

- [x] 1.1 Confirm owner-selected tracked central script/metadata home and absence of an existing implementation; scope the canonical command and preserved branch/issue-state boundaries.
- [x] 1.2 Obtain expanded read-only fixture review and strict validation before production implementation.

## 2. Implement one guarded path

- [ ] 2.1 Add the first behavior test before implementation, then implement explicit metadata and complete GitHub-resolved comparison in one script. Cover empty/exact/extra/missing/cross-repository identities and negated prose through resolved references.
- [ ] 2.2 Bind reviewed head and target PR, complete pagination, and fail-closed acquisition/metadata errors, including missing/duplicate markers and non-open PRs; prove refusals invoke no merge or issue mutations. Add check-only and head-bound guarded merge behavior without retries/bypass.
- [ ] 2.3 Add thin Makefile check/merge/test commands, PR-template intent and distribution guidance, and the owning process decision. OCU uses the central implementation; do not add a copied guard or hosted workflow.

## 3. Verify and deliver

- [ ] 3.1 Run the owning behavior suite, actual CLI refusal/equality scenarios, relevant static and documentation gates; retain source-bound outputs and test discovery.
- [ ] 3.2 Exercise the live check against this PR with explicit empty metadata; complete expanded independent review and use the guarded command for normal exact-head merge under the existing local-CI choice.
- [ ] 3.3 Preserve public receipts, archive only this fixture and manually close #389 after delivery; leave unrelated issue states and the queue unchanged.

## Risk packs

Selected:

- Public API / CLI / script entry: 2.1/2.2/3.1/3.2, exact inputs, read-only check and gated merge outcomes.
- Config / project setup: 2.3, tracked script/template/Makefile distribution and one OCU invocation path.
- Schema / columns / units / field names: 2.1/3.1, explicit intended set and repository-qualified identity with no implicit empty default.
- Concurrency / shared state / ordering: 2.2/3.2, snapshot/head binding, pre-merge ordering, documented non-atomic remote metadata boundary.
- Resource limits / large input / discovery: 2.2/3.1, complete bounded pagination, API failure and non-progress refusal.
- Legacy compatibility / examples: 2.3, existing PRs add metadata; normal branch protection and local-CI policy remain unchanged.
- Error handling / rollback / partial outputs: 2.2/3.1, no mutation on refusal; failed merge propagates, no automatic issue correction.
- Documentation / migration notes: 2.3/3.1, exact metadata/commands, owner home and limitations.

Not selected:

- File IO / path safety / overwrite: the command reads GitHub metadata and emits diagnostics; no path publication, cleanup or file mutation is added.
- Auth / permissions / secrets: existing authenticated `gh` owns credentials/authorization; no new secret loading or permission change. Diagnostics omit PR bodies and credentials; process tests use synthetic data.
- Release / packaging / dependency compatibility: no application release, package, dependency or supported-runtime change; ordinary checkout distributes the script.
