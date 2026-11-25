## 1. Pin the runner image (#917)

- [ ] 1.1 Change every `runs-on: ubuntu-latest` in `.github/workflows/ci.yml` (11 jobs) and `.github/workflows/agents-md-liveness.yml` (2 jobs) to `runs-on: ubuntu-24.04`, and change `constraints.yaml` `ci.matrix` to `"ubuntu-24.04, python 3.12, node 22"`. Verify that `grep -n 'runs-on' .github/workflows/ci.yml .github/workflows/agents-md-liveness.yml` shows only `ubuntu-24.04`.

  **Task 1.1 required evidence** (issue #917):
  - **Fixture level:** compact. This is a CI configuration change with no code.
  - **Risk packs:**
    - **CI:** selected. The required check "All checks passed" depends on these jobs.
    - Every other pack is not selected.
  - **Comments.**
    - Each ci.yml `runs-on` line gets an inline comment naming the ubuntu-26.04 nginx/hurl apt failure (#917).
    - Each liveness `runs-on` line gets an inline comment naming the image-keyed uv cache it shares with ci.yml. The liveness workflow installs neither nginx nor hurl.
  - **Must preserve:**
    - Every job's steps, `needs`, `if`, matrix and permissions are unchanged. `git diff` shows only the `runs-on` lines and their comments in the two workflows, and the one `ci.matrix` line in `constraints.yaml`.
    - The release workflows and the disabled upstream workflows are unchanged.
  - **Evidence:**
    - The grep above, and `git diff --stat` showing three files.
    - **On the PR's own CI run:**
      - every job passes, including Runtime smoke (migrations + API + proxy) and Browser verification shards 1–3;
      - their logs show `Image: ubuntu-24.04`;
      - `All checks passed` is green.
    - **The liveness workflow does not run on this PR.** Its `paths` filter does not include `.github/**`, and when it does run it fails on the `onnxruntime-node` 404 (#918). The PR says so.
    - The PR body flags the CI change, and cites the last green run 43447779019 (ubuntu-24.04) and the first red run 43862311473 (ubuntu-26.04).
  - **Non-goals:**
    - porting the toolchain install to ubuntu-26.04;
    - the release workflows and the disabled upstream workflows;
    - #918.

Suggested fixture level: compact - two workflow files and one constraints line.
Minimal mergeable slice: atomic - one pin.
