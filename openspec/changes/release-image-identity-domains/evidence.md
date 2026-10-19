# Release identity evidence

## Scope

The candidate is bound by the 949-file byte/mode manifest in the [ownership receipt](../../../docs/evidence/issue-337/ownership-and-oracles.json.gz). The source baseline is `e3fc0430bed88e6589e0b36f233bc25dcb4716c7`; the central baseline is `6e736a43564182ea3693a1ef4265f54ee32e023f`.

The [delivery binding](../../../docs/evidence/issue-337/delivery-binding.json.gz) binds these receipts to source commit `868f3364559cfbc174a2e21c3f89284b8a00a999`. Only the support-matrix documentation changed after the final regression; the other 948 tracked files, including all source, tests and configuration, remained byte/mode identical. Source commit hooks passed naming, merge-conflict, file-size, private-key, gitleaks and conventional-commit checks.

Two isolated local Docker Engine 29.1.3 daemons exercised classic `vfs` and containerd snapshotter stores. Daemon binaries ran arm64 under Docker Desktop's LinuxKit VM; every release image selected `linux/amd64`. This is not native-Linux portability evidence. The seven-role protocol fixture uses five small source image recipes, the actual qualified DocumentServer recipe/base/patch, and actual PostgreSQL. It does not certify production application images, WAN-free operation, the Viewer/download boundary, or LAN deployment.

## Qualified failures and repairs

[Baseline and contract receipts](../../../docs/evidence/issue-337/baseline-and-contract.json.gz) retain the fixture reviews, timestamped pre-edit strict validation, exact baseline sources and semantic red runs:

- The producer stored an engine manifest identity as `configuration_digest`, differing from the hash of saved configuration bytes. Loading that real archive did not make the identities equal.
- The classic seven-role baseline built successfully but refused its own archive because Docker `repositories` names the final layer rather than the configuration. The fixture extension was reviewed and validated before that correction.
- The containerd baseline encountered a raw multi-platform index without concrete platform fields. Selected inspection and export through API 1.49 distinguish the runtime manifest from the root index and unfetched platforms.

[Counterexamples and repairs](../../../docs/evidence/issue-337/counterexamples-and-repairs.json.gz) retain subsequent failures rather than discarding them:

- Fake-engine implicit-tag lookup did not model Docker's equivalent bare, `:latest`, and fully qualified references. Actual Docker qualified the correction; exact stored-key conflict simulations remain intact.
- Duplicate role references let a later record hide an earlier false descriptor claim. The original CLI counterexample loaded seven images and published an installation. Corrected validation refuses before load/publication; valid duplicate records and differing verified descriptor subsets remain covered.
- Docker's unnamed attestation uses `io.containerd.manifest.subject`. A misspelled marker, masked by dual-marker synthetic fixtures, caused real PostgreSQL export refusal. The unchanged captured archive passes after the spelling correction, without treating attachment identities as runtime identities or relaxing unnamed-image validation.

## Real release transport

[Seven-role protocol receipts](../../../docs/evidence/issue-337/real-release-protocol.json.gz) contain complete command exits/output, committed input manifests, inventories, raw configuration/descriptor metadata and independent hashes.

The actual `deploy/release.py build` → save → delivery verification → import/load → local-image verification → startup verification → identical re-import sequence passed on both stores. The containerd run selected PostgreSQL by immutable upstream digest, exercising temporary alias ownership and retirement. Before import, each private source daemon's named images were removed. Because build cache can retain blobs, those runs are not the cold-store oracle.

For all seven classic roles, raw and selected engine IDs equal the configuration hash. For all seven containerd roles, raw root-index IDs differ from configuration hashes; selected runtime manifest IDs belong to the archive-verified descriptor sets. Content-derived references end with the configuration hash, not either engine observation.

## Cold import and recovery boundaries

[Cold-store and recovery receipts](../../../docs/evidence/issue-337/cold-store-and-recovery.json.gz) cover separate newly created daemons. Immediately before import, image, container, volume and build-cache counts were all zero. The candidate and delivery mount was read-only; outputs used a separate owned writable root. A qualified transparent Docker witness logged argv and executed the real CLI unchanged.

Both stores passed:

- Forged descriptor refusal before any `docker load` attempt or installation publication.
- Independent archive/configuration/descriptor hashing and content-reference checks for all seven roles.
- Actual cold import, loaded/local identity checks, startup verification and identical re-import.
- Foreign occupied-reference refusal before load/publication, leaving that mapping unchanged.
- Seven real created stack containers accepted by the existing recovery guard. A server created from a foreign image while retaining the expected configured tag was rejected by `establish_quiescence` before any stop/kill/exec/start/remove command; all container identities and lifecycle states remained unchanged.

The classic store additionally imported the unchanged retained contract1 delivery using the new reader. Its installed old reader was byte-identical to the frozen baseline, and both readers passed image and startup verification. This is reader/inventory rollback compatibility, not a database or application rollback exercise. Stack containers were never started; workspace-sandbox attribution was not changed.

## Ownership

The [ownership receipt](../../../docs/evidence/issue-337/ownership-and-oracles.json.gz) retains exact before/after IDs and the temporary oracle sources. Cleanup removed five owned containers, five owned volumes and three owned outer image IDs. Unowned container IDs and stable lifecycle fields, image IDs, volumes and network IDs were unchanged across cleanup. Shared BuildKit and the pre-existing qualified DocumentServer base were preserved. No global prune or historical-host-restoration claim is made.

## Deployment regression

The [deployment regression receipt](../../../docs/evidence/issue-337/deployment-regression.json.gz) retains discovery IDs, starts, phase outcomes, JUnit output and complete command output for all three integrated runs. The final command was the qualified Python 3.12 interpreter running `pytest tests/deploy/ -q --import-mode=importlib` with the discovery witness: exit 0, **414 passed and 347 subtests passed**, 907.38 seconds. All 949 candidate source bytes and modes were unchanged across execution. One upstream `python_multipart` deprecation warning remained.

The initial integrated result was 410 passed / 3 failed; the fake-engine alias correction and removal of three implementation-string mutation tests produced 410 passed / 343 subtests. The final candidate adds four behavioral regression nodes and removes none from that passing discovery. Four implementation-string mutation tests were removed across the entire change rather than re-pinned; wrong-image, conflict/no-load, hidden-alias and dirty-source behavior checks remain active.

The [public evidence scan](../../../docs/evidence/issue-337/evidence-scan.json.gz) records gitleaks exit 1 with 13 generic-key matches. Each match was independently recomputed as a tracked frozen-source file's SHA-256; none was a credential. The scanner result is adjudicated, not reported as an unqualified zero-finding pass.

## First review repair

Repair source commit: `91eac185abb6828dc6c06155d92cd11ab9c6ef71`. The repaired 949-file manifest is retained in `review-repair-contract.json.gz`; no source bytes changed after its passing regression.

The preceding receipts bind the first reviewed source commit, not the subsequent repair. [Round-one reports and adjudication](https://github.com/DankerMu/open-webui/pull/524#issuecomment-6260161110) retained two confirmed P1 findings: attachment markers could hide selectable descendants from ancestor authority checks, and direct `deploy/up.sh` omitted the reader/inventory contract pairing check.

The repair's [counterexamples and regressions](../../../docs/evidence/issue-337/review-repair-contract.json.gz) retain both reviewers' findings, the invariant-seat correction and parent execution:

- An actual containerd import loaded all seven images before discovering that a subject-marked foreign manifest was selected. A second actual case retained the same configuration and layers but selected a different marked manifest ID, also changing an occupied reference before post-load refusal. Configuration uniqueness alone did not close the boundary.
- The parser qualifies marked manifest configuration/platform bytes and refuses attachments selectable for linux/amd64, independently of configuration equality or inventory claim selection. Unqualified marked indexes refuse. Genuine unknown/unknown metadata remains accepted but never supplies runtime identity authority.
- The shared synthetic attestation fixture was corrected from selectable runtime configuration bytes to independently hashed unknown/unknown configuration bytes. Its existing positive runtime/ancestor and negative attachment-authority assertions were preserved; the actual same-configuration counterexample supplies the reason for this fixture correction.
- Direct startup now uses the existing expected-contract helper before deployment mutation. The original actual-script mismatch case refuses without starting any stack. Matching contract2 coverage remains; byte-identical historical reader/up.sh entrypoints also start the three expected stacks in the deterministic external-system fixture.

[Fresh real-engine repair receipts](../../../docs/evidence/issue-337/review-repair-runtime.json.gz) show both marked-descendant cases refused before any image load, with the correct occupied mapping unchanged. The valid seven-role artifact still imports and verifies, including actual PostgreSQL attachments. The complete build/export/verify/import/local/startup/re-import protocol was rerun successfully on both containerd and classic stores: the captured classic exports also contain OCI metadata, so their affected parser path was not assumed unchanged. Retained contract1 import and the original reader's image/startup verification passed again on classic.

The repair runtime cleanup removed only its two recreated daemon containers, two volumes and the repulled Docker tooling image. Current unowned container identities/lifecycle, images, volumes and networks remained unchanged. The initial cleanup qualification expected an empty tag list after a digest-only pull; Docker exposed the identical owned digest reference in that field. The guarded attempt removed nothing, and the exact reference was verified before cleanup continued.

The [repair deployment regression](../../../docs/evidence/issue-337/review-repair-regression.json.gz) passed **419 tests and 410 subtests** in 897.85 seconds, exit 0. Discovery adds five behavioral nodes and removes none from the reviewed 414-node candidate. All 949 repaired source bytes/modes remained unchanged during execution. Gitleaks scanned the three additive repair payloads: exit 0, no findings.
