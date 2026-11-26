## ADDED Requirements

### Requirement: CI jobs run on a pinned runner image

Every job in `.github/workflows/ci.yml` and `.github/workflows/agents-md-liveness.yml` SHALL declare `runs-on: ubuntu-24.04`, and none SHALL use `ubuntu-latest`. Each such line SHALL carry an inline comment naming why it is pinned:

- in ci.yml, the ubuntu-26.04 nginx/hurl apt failure;
- in the liveness workflow, the image-keyed uv cache it shares with ci.yml.

`constraints.yaml` `ci.matrix` SHALL name the same image. This rule is review-only: no script checks it.

#### Scenario: The moving alias changes

- **WHEN** GitHub resolves `ubuntu-latest` to a newer image whose apt archive cannot install the toolchain's `nginx-full` and hurl packages
- **THEN** the ci.yml jobs still run on ubuntu-24.04, and their toolchain install step succeeds

#### Scenario: A job is added without the pin

- **WHEN** a job in either workflow uses `ubuntu-latest`
- **THEN** `grep -n 'runs-on' .github/workflows/ci.yml .github/workflows/agents-md-liveness.yml` shows it, and review rejects it
