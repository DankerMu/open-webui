# Design

## Boundary

- Change surface: the first pytest invocation in the existing orchestrator job, plus its tests README guidance.
- Governing invariant: the job resolves the repository's fixture namespace from the checkout root while executing the unchanged complete orchestrator selection and preserving failure propagation.
- Must preserve: `tests/orchestrator/ -v`, default import mode, all fixture/test bytes, Python3.13 declaration, all dependency installation commands, job environment, root-module/auth/deploy commands, integration jobs and triggers.
- Non-goals: root pytest configuration, package-marker/conftest/path-order changes, broad conversion of other invocations, dependency upgrades, #95 native Linux qualification, LAN/release or hosted-runner certification.

## Decision and evidence

- The local Ubuntu24.04/Python3.13.11 environment runs the three declared pip commands and exact console invocation without PYTHONPATH or PYTEST_ADDOPTS. It fails at the existing qualified fixture import before collection.
- Module entry supplies the checkout root using normal Python semantics. It collects2874orchestrator nodes; these raw IDs exactly equal the orchestrator subset of canonical root collection in the same environment.
- Choose the invocation-only correction rather than global `pythonpath=.`: only this job step needs a path correction; global configuration would change unrelated discovery.
- Preserve the initial failed cross-platform comparison: one errno.EOPNOTSUPP parameter is102 on Darwin and95 on Linux. Do not normalize those IDs; same-environment equality is the selection proof.
- Parent executes the exact corrected workflow command on a frozen candidate snapshot. Capture every result/skip and report unrelated failures separately; collection alone is not execution.
- No permanent test that parses or pins workflow source text. Exact CLI execution and configuration-diff review are the appropriate boundary evidence.

## Siblings and risks

- Sibling commands: the existing auth-guard, upload/tools and deploy invocations in the same job and the separate integration command. They remain byte-for-byte unchanged; no added PYTHONPATH or import-mode flag.
- Python/dependency/environment variance: retain interpreter/package/image identities. The local environment reproduces declared job inputs, not the entire GitHub-hosted runner image, kernel, UID or unspecified future patch resolution.
- Source snapshot comes from git archive, excluding user secrets/untracked files. Test processes run unprivileged in an owned disposable container; no host Docker socket or LAN access.
- Owned container/image cleanup is explicit. Shared retained acceptance images remain untouched.
- Rollback: revert the single invocation and documentation; no schema/data migration or production fallback.

## Review focus

Exact command and selection, unchanged sibling job surfaces, preserved failing exit status, honest local-versus-hosted environment scope.
