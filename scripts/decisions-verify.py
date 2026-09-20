#!/usr/bin/env python3
"""decisions-verify — machine check for docs/decisions (four-zone lifecycle).

Fails (exit 1) on: a record outside {proposed,implemented,rejected,archived}/<kind>/,
a kind outside the allowed set, duplicate ids, missing required frontmatter
fields, or an archived record whose content hash differs from the frozen
manifest (docs/decisions/archived/MANIFEST.txt). Exit 2 = usage error.
"""

from __future__ import annotations

import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1] / 'docs' / 'decisions'
ZONES = ('proposed', 'implemented', 'rejected', 'archived')
KINDS = ('architecture', 'process', 'testing', 'bug-fix', 'feature', 'simplification')
REQUIRED = ('id', 'title', 'kind', 'status', 'date')
ID_RE = re.compile(r'^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$')


def frontmatter(text: str) -> dict[str, str]:
    if not text.startswith('---\n'):
        return {}
    end = text.find('\n---', 4)
    if end < 0:
        return {}
    out: dict[str, str] = {}
    for line in text[4:end].splitlines():
        if ':' in line:
            key, value = line.split(':', 1)
            out[key.strip()] = value.strip().strip('"')
    return out


def check_record(path: pathlib.Path, ids: dict[str, str]) -> list[str]:
    """Layout, kind, frontmatter and id checks for one record."""
    rel = path.relative_to(ROOT)
    parts = rel.parts
    if len(parts) != 3 or parts[0] not in ZONES:
        return [f'  {rel}  must live at <zone>/<kind>/<id>.md, zones: {", ".join(ZONES)}']
    errors: list[str] = []
    if parts[1] not in KINDS:
        errors.append(f'  {rel}  kind directory "{parts[1]}" not in {", ".join(KINDS)}')
    meta = frontmatter(path.read_text(encoding='utf-8'))
    errors.extend(f'  {rel}  frontmatter missing required field "{key}"' for key in REQUIRED if key not in meta)
    rid = meta.get('id', path.stem)
    if not ID_RE.match(rid):
        errors.append(f'  {rel}  id "{rid}" must match YYYY-MM-DD-slug')
    if rid in ids:
        errors.append(f'  {rel}  duplicate id "{rid}" (also {ids[rid]})')
    ids[rid] = str(rel)
    if meta.get('kind') and meta['kind'] != parts[1]:
        errors.append(f'  {rel}  frontmatter kind "{meta["kind"]}" != directory "{parts[1]}"')
    return errors


def load_manifest() -> dict[str, str]:
    manifest = ROOT / 'archived' / 'MANIFEST.txt'
    frozen: dict[str, str] = {}
    if manifest.exists():
        for line in manifest.read_text(encoding='utf-8').splitlines():
            if line.strip() and not line.startswith('#'):
                digest, _, rel = line.partition('  ')
                frozen[rel.strip()] = digest.strip()
    return frozen


def check_archive(path: pathlib.Path, frozen: dict[str, str]) -> list[str]:
    rel = path.relative_to(ROOT)
    if rel.parts[0] != 'archived':
        return []
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    key = str(rel)
    if key not in frozen:
        return [f'  {rel}  archived record not in archived/MANIFEST.txt — archive by adding "{digest}  {key}"']
    if frozen[key] != digest:
        return [
            f'  {rel}  archived record was edited (hash mismatch) — archives are frozen; write a new proposed record'
        ]
    return []


def main() -> int:
    if not ROOT.is_dir():
        sys.stderr.write(f'decisions-verify: {ROOT} missing\n')
        return 2
    records = [p for p in ROOT.rglob('*.md') if p.name not in {'README.md', 'TEMPLATE.md'}]
    ids: dict[str, str] = {}
    frozen = load_manifest()
    errors: list[str] = []
    for record in records:
        errors.extend(check_record(record, ids))
        errors.extend(check_archive(record, frozen))
    if errors:
        sys.stderr.write(f'decisions-verify: {len(errors)} violation(s):\n' + '\n'.join(errors) + '\n')
        return 1
    sys.stdout.write(f'decisions-verify: {len(records)} record(s) checked, all conform.\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
