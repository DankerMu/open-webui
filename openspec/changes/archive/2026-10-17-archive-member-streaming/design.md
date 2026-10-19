# Design

## Context

At OCU `860c51138e0ed0254b1ce97e156df2759a1161e8`, app.py744–810 enumerates visible files, obtains complete bytes from the shared reader and calls writestr. uploads.py495–524 already exposes an owned verified descriptor and retains the MCP bytes/MIME wrapper. No new reader abstraction or traversal implementation is needed. The canonical archive capability and archived containment design remain authoritative.

## Goals / Non-Goals

Invariant: each member's bytes come from one verified regular-file descriptor for the original requested chat; transfer buffers do not grow with the member's uncompressed size. A failed build never publishes a successful partial ZIP.

Must preserve: no-follow chat/output/ancestor/leaf acquisition, hidden filtering, ordinary relative names/bytes including empty files, original authorization/headers/missing/empty errors, best-effort leaf cleanup, MCP bytes/MIME, and complete ZIP construction before response publication. Read to EOF; concurrent same-inode edits are not snapshots.

Non-goals: bounded total ZIP memory, HTTP streaming redesign, asynchronous scheduling changes, temp spooling, capacities/discovery budgets, hard-link/bind-mount provenance, coherent file snapshots, generic descriptor consolidation, dependency/image changes or LAN deployment.

## Decisions

Use existing open_chat_upload with the sanitized chat and output-relative name, then a fixed1MiB os.read loop into a writable ZIP member. Close the owned leaf through close_fd in finally on success, source failure and ZIP open/write/close failure. Never reopen file_path, use ZipFile.write, cache a resolved root, or import MCP listing limits. Keep the source missing-file404 mapping and let other build failures abort before StreamingResponse; do not catch-and-continue. Remove the archive's unused read_chat_upload import, not the shared MCP implementation.

Supply a fresh ZipInfo per entry with current local time and ZIP_DEFLATED explicitly. Bare string open would date entries1980; bare ZipInfo would store uncompressed. Force ZIP64 deliberately: a size hint from fstat can become stale during allowed growth, and unknown-size writes otherwise fail above the format threshold. Small members consequently use valid ZIP64 local headers; byte-for-byte ZIP containers and filesystem metadata are not promised, but relative names and decoded payloads are. Preserve default compression level; do not introduce a configurable policy or extra path stat.

Extend the existing archive test surface, reusing its fixtures and the existing inode/FD observer pattern rather than copying traversal doubles. A read-size assertion alone is insufficient: the old reader already reads1MiB chunks. The RED oracle observes real source bytes outstanding before genuine ZIP writes, rejecting member-sized staging while still decoding exact multi-chunk, consecutive and empty payloads. Do not forbid a method name or assert source text. Keep the original failing oracle frozen through GREEN.

Preservation controls cover all existing containment/race cases, source failure and ZIP open/write/close cleanup, no partial successful response, and unknown/growing-size ZIP64 using a lowered test-only format threshold rather than a multi-GiB fixture. A mid-transfer pathname replacement must not redirect the pinned FD; this does not add same-inode snapshot guarantees. Do not broaden fixture repair into the known startup/root-isolation follow-ups.

## Verification

Parent baseline/candidate memory runs use the same frozen `/tmp/issue350-memory-probe.py`, fresh processes, generated on-disk benign fixtures and three repetitions per case: one64MiB compressible member, two consecutive64MiB compressible members, and two32MiB deterministic incompressible members. Fixture creation/imports precede tracemalloc; capture route-build peak before consuming the response. Decode and hash members afterward. Record compressed ZIP bytes separately; RSS is the process lifetime high-water before/after, not instantaneous or isolated route RSS. Report all samples and platform/interpreter, without a universal threshold or OOM/throughput claim.

Baseline traced peaks were134241172,201643743 and152929785bytes respectively across three repetitions; compressed ZIP sizes were65367,130712 and67129590bytes. The baseline receipts and script hashes precede production edits. Candidate evidence must show bounded staging behavior and report measured differences; total memory may still grow with compressed ZIP size and file enumeration.

Parent also runs actual loopback HTTP with owned temporary files, private synthetic credentials, no real Docker contact and complete server/root cleanup. Exercise benign multi-chunk/consecutive/empty files, hidden entries, authorization denial and containment failures; decode actual responses. Keep API smoke separate from memory measurement. Archive full programs, identities, outputs, frozen test sources and cleanup. Capture control-plane fixture/doc hashes at gate time as well as OCU source/test hashes.

## Risks / Trade-offs

- ZIP64 headers change small-member metadata → document the deliberate valid-format choice and verify decoded bytes and lowered-threshold/growth cases.
- Source/ZIP errors after partial work → unconditional descriptor cleanup and no successful partial ZIP; preserve existing error policies rather than add retries.
- In-memory compressed ZIP remains size-dependent → incompressible measurement control and explicit limit on claims.
- Test fixtures reload modules and share globals → reuse existing ownership fixtures, run the archive/security/download/MCP neighbors with documented root discovery; no test skipping to obtain green.

## Migration Plan

Atomic source/test update plus existing decision/documentation; no persistent migration or image-pin advance. Revert the focused member-transfer patch to restore the prior buffered implementation without reverting containment. Paired source/control-plane PRs, bounded three-seat review, authorized scoped CI, archive and manual issue closure complete delivery.
