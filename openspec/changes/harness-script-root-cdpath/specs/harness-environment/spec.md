## ADDED Requirements

### Requirement: Harness entry scripts anchor to their own checkout

The OCU stub smoke, Office verification and proxy development entry scripts SHALL each resolve the checkout that contains them as a single-line absolute path, whatever the caller's working directory, exported `CDPATH`, or the availability of external `dirname` and `basename`. They SHALL NOT silently anchor at the filesystem root or at a directory outside that checkout. The proxy development script SHALL resolve its proxy configuration to an absolute path under the same conditions, including when the OCU checkout location is given as a relative path.

#### Scenario: Caller exports CDPATH

- **WHEN** one of these scripts is run by relative path with `CDPATH` set to `.` or to a foreign directory that contains a `scripts/` directory
- **THEN** the script operates from its own checkout root

#### Scenario: Relative OCU checkout under CDPATH

- **WHEN** the proxy development script runs with a relative OCU checkout location that has no `.` or `..` prefix, and with `CDPATH` set to `.` or to a foreign directory that contains a same-named checkout
- **THEN** the proxy binary receives the absolute path of the configuration under the OCU checkout that the relative location names from the caller's working directory

#### Scenario: Invoked from another working directory or by bare name

- **WHEN** one of these scripts is invoked by absolute path from a working directory outside its checkout, or by bare file name from its own `scripts/` directory
- **THEN** it operates from its own checkout root

#### Scenario: External dirname is unavailable

- **WHEN** one of these scripts runs with a `PATH` that provides no `dirname` or `basename`
- **THEN** it still resolves its own checkout root rather than the filesystem root
