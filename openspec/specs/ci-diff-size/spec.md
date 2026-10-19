# ci-diff-size Specification

## Purpose
Apply the existing pull-request diff-size limit to countable changes from complete-file deletions as well as additions and modifications.

## Requirements

### Requirement: Whole-file deletions participate in PR size enforcement

The PR diff-size guard SHALL count deleted hunk lines from complete non-excluded files in its existing total. It SHALL retain the configured threshold, whitespace handling, hunk-line counting semantics, triple-dot BASE_SHA comparison, path exclusions and diff-limit-exempt label policy. An unexempted total above the threshold SHALL fail; a total equal to or below it SHALL pass.

#### Scenario: Deletion boundary

- **WHEN** an unexempted PR deletes an included file with400countable lines
- **THEN** the guard passes
- **AND** a deletion with401countable lines fails

#### Scenario: Mixed and modified deletions

- **WHEN** a PR combines complete-file deletion with other countable changes
- **THEN** the total includes all of them, including deleted lines within modified files

#### Scenario: Existing exclusions and exemption

- **WHEN** deleted files fall under existing lockfile, snapshot or i18n exclusions
- **THEN** they do not contribute to the size total
- **AND** the existing diff-limit-exempt event-label condition still skips enforcement while absent, unrelated or removed labels do not
