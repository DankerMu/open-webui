# Verification evidence

Source head: `e4f42c738e84b88b05e6b0957272742c15eeb5ab`.

[Complete local packet](../../../../docs/evidence/issue-512/verification.json.gz) contains the frozen-source manifest, raw commands/stdout/stderr, all selected node IDs and outcomes, JUnit, temporary probe sources, fixture review, source diff and commit hooks.

- Decoded SHA-256: `10f5cc03e2ec307c25489bb2166ffb856bda2af254a16c33ca2c716cd9001e5f`.
- Gzip SHA-256: `48f4b2cd099cdaff3f0ba48b85e2570e80c877d616fc8deec6093027aabf082f`.
- Qualified retained image: Ubuntu24.04.5, Python3.13.11, Node22.23.3, 53 compatible packages; local LinuxKit/QEMU linux/amd64, uid501. Image identity is unchanged from the qualified invocation evidence.
- Before repair, the four actual stop functions expose an empty final marker at a controlled open-before-write seam; probe exit1. After repair, all four keep final absent until publication, then expose exact text; probe exit0. These are function-seam probes, supplemented by actual worker execution below.
- The new readiness regression under a temporary direct-final-write mutation fails both parameter rows at the premature-readiness assertion, not an import error. All seven unmutated regressions pass, including short writes, captured-hook isolation, mode/sync/close ordering and failed-stage cleanup.
- All 663 original selected nodes remain, plus seven regressions. Complete execution: **669 passed, 1 failed, 2211 deselected**, exit1, 664.82s. The sole failure is the unchanged pause/read identity case tracked in [issue513](https://github.com/DankerMu/open-webui/issues/513); no marker-readiness failure remains. This is not a whole-scope green result.
- The selection includes complete publication-recovery, save-as, resolution, shared-store and regression modules plus 16 transitive crash-helper cases in callback-publish, command-deadline, history and restore. All original tests, parent kill/recovery helpers and non-stop worker ASTs remain identical; runtime outcomes retain their assertions.
- Frozen source hashes remain unchanged after execution. Eight owned probe/run containers are independently confirmed absent; the qualified image is retained for the next diagnosis.
- Strict OpenSpec, doc-gate, decisions-verify (56), whitespace and source commit hooks pass. Decoded public packet gitleaks scan exits0 with no leaks; scan metadata and control hooks are published separately with the merge receipt.

The parent bounded the new regression's readiness pipe read before its first candidate run. The initial outcome parser omitted six IDs containing spaces; matching the outcome suffix preserves every raw ID and reconciles all670 without rerunning tests or normalizing names. The independent pause/read test is neither changed nor excluded. No production, dependency, environment or child-PYTHONPATH change; no hosted, native-Linux, LAN or release certification.
