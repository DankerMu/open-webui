# Decision records

One file per non-trivial decision, written **in the same PR** as the change it explains (the note-required rule — mechanical or local edits are exempt). Folder state is the lifecycle; `python3 scripts/decisions-verify.py` (`make decisions-verify`) is the machine check.

## Zones

```
docs/decisions/
├── proposed/<kind>/      drafts awaiting a decision
├── implemented/<kind>/   accepted decisions, cited by later work
├── rejected/<kind>/      explicitly declined — kept while the decline still prevents a tempting mistake
└── archived/<kind>/      frozen — never edited (hash-pinned in archived/MANIFEST.txt)
```

Kinds: `architecture`, `process`, `testing`, `bug-fix`, `feature`, `simplification`. Classify by what the record decides, not by its size.

## Rules

1. **Note-required**: a non-trivial change ships its record in the same PR.
2. **Supersession at write time**: search active records first. Fully superseded → fold the old rationale into the new record and move the old one to `archived/`; partially superseded → keep both, cross-link. A record is never edited into a different decision. Procedure: `.omp/skills/decision-record-lifecycle/SKILL.md`.
3. **Archive freeze**: archived records are frozen. Add the record's SHA-256 to `archived/MANIFEST.txt` when archiving (`shasum -a 256 <file>`); the verifier fails on any later edit. Need to change one? Write a new proposed record.
4. **GC by future decision value**, never by age or count: keep any record whose alternatives, negative guarantees, ownership boundaries, security rules or reintroduction conditions can still steer work.
5. `## Alternatives considered` is mandatory. A decision without what it beat invites re-debate.
6. Stale facts (paths, names, defaults) are updated in place; the decision and its rationale stay as written.

## File format

`<zone>/<kind>/YYYY-MM-DD-slug.md`, frontmatter required (see `TEMPLATE.md`): `id`, `title`, `kind`, `status`, `date`. The `id` equals the filename stem.

Related: plans live in `docs/plans/` (what we intend to build); postmortems in `docs/postmortem/` (what escaped and why). The OCU repo keeps its own `docs/decisions/` for deployment decisions.
