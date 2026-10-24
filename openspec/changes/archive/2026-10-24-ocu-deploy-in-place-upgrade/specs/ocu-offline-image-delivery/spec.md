## ADDED Requirements

### Requirement: An existing deployment can be pointed at a newly imported release

The deployment tooling SHALL rewrite an existing deployment's runtime configuration to a release imported into its own root: exactly the source, WebUI source, manifest and seven image identity keys change, every other line stays byte-identical, the previous file is kept as a private backup that is never overwritten, the file stays private, and no secret value is printed. A refused rewrite SHALL leave the configuration byte-identical with no backup or staging file. The deployment version writer SHALL take the source checkout from the selected manifest's root.

#### Scenario: Upgrade rewrite

- **WHEN** an operator runs the rewrite against a deployment's runtime configuration with a verified, newly imported release root
- **THEN** the ten identity keys name that release, every other key keeps its value, a private backup named after the new release exists, and the output lists only identity keys

#### Scenario: Refused rewrite changes nothing

- **WHEN** the release root's source is dirty or at another commit, an identity key is missing, the file has a comment or blank line, its backup name already exists, or the runtime file is a symbolic link
- **THEN** the command fails with a one-line error, the runtime configuration is byte-identical, and no backup or staging file is left

#### Scenario: Version record after an upgrade

- **WHEN** the version writer runs with the manifest of a release root separate from the deployment root
- **THEN** it records that release's source commit and succeeds

#### Scenario: Version record on a fresh install

- **WHEN** the version writer runs on a deployment whose manifest is the deployment root's own release manifest
- **THEN** it records that root's source commit as before
