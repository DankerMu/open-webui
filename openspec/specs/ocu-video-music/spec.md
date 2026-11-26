# ocu-video-music Specification

## Purpose

A small background-music library, baked into the workspace image, for offline explainer videos. Every track is CC0 with recorded evidence and is approved by the user by listening.

## Requirements

### Requirement: Every track has verified CC0 evidence and recorded user approval

The workspace image SHALL carry a music library with a manifest. Every entry SHALL record:

- the track id;
- the mood: calm-curious, upbeat-corporate, neutral-serious or loop;
- title and author;
- source URL and licence URL;
- an evidence snapshot of the licence statement;
- the SHA-256 of the source file as obtained (`source_sha256`);
- the SHA-256 of the shipped file (`shipped_sha256`), computed when the image is built;
- duration;
- a note of the search for other licences of the same work;
- the approver and the approval date.

A track SHALL be included only if:

- its CC0 or public-domain dedication is shown on the live source page, or in an archived statement whose file digest matches `source_sha256`;
- the search found it under no other licence;
- the user approved it after listening, as recorded in a tracked approval file that the manifest's approver fields must match.

The repository SHALL track the source manifest and SHALL NOT commit audio binaries. The image build SHALL download each source, fail on a `source_sha256` mismatch, and write the shipped manifest.

The target is 16 tracks, four per mood. The library ships the approved subset, and a mood with no approved track is not offered.

#### Scenario: Unverifiable track is excluded

- **WHEN** a candidate's licence rests only on a site-wide filter or an uploader's claim, without a matching evidence record
- **THEN** the track is not in the library

#### Scenario: Re-released under another licence

- **WHEN** the same work is also published under CC BY with an ISRC
- **THEN** the track is excluded and the reason is recorded

#### Scenario: Source digest mismatch

- **WHEN** a downloaded source's digest differs from its `source_sha256`
- **THEN** the image build fails, naming the track

#### Scenario: Manifest matches files and approvals

- **WHEN** the image is built
- **THEN** every manifest entry's file exists with `shipped_sha256`
- **AND** every audio file has a manifest entry whose approver matches the approval file

### Requirement: Tracks are loudness-normalized and ducked under narration

Every library track SHALL be normalized to -16 LUFS integrated, with a true peak at or below -1.5 dBTP. Non-loop tracks ship as MP3. Loop tracks ship as WAV and loop without a gap.

The narration track is normalized to -16 LUFS. In a rendered explainer with a selected track, the music SHALL:

- sit 15 ± 3 dB below the narration level while narration plays, measured over 400 ms windows;
- sit 6 ± 2 dB below its own normalized level without narration;
- ramp between the two levels over 0.5 ± 0.1 s;
- fade in at the start and out at the end.

A loop track SHALL repeat to cover the video. A non-loop track shorter than the video SHALL fail the kit check.

A music choice of `none` SHALL give narration only.

#### Scenario: Music under voice

- **WHEN** an explainer with a selected track is rendered
- **THEN** in narrated windows the music sits 15 ± 3 dB below the narration
- **AND** each level change ramps within 0.5 ± 0.1 s

#### Scenario: No music

- **WHEN** an explainer with music `none` is rendered
- **THEN** the audio track equals the narration track within the encoder's noise floor

#### Scenario: Short non-loop track

- **WHEN** a 150-second video selects a 120-second non-loop track
- **THEN** the kit check fails, naming the track, its length and the video length, and suggesting a loop track

#### Scenario: Unknown track id

- **WHEN** `script.json` names a track id that is not in the manifest
- **THEN** the kit check fails, naming the id and listing the valid ids
