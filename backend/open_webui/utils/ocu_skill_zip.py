"""Validate an uploaded OCU skill ZIP before anything is written (design Decision 5).

Pure function over the request bytes: no DB, no filesystem. Every rejection raises SkillZipError
with the reason, which the upload route returns as a 400.
"""

from __future__ import annotations

import io
import re
import stat
import zipfile
import zlib

import yaml

MAX_ENTRIES = 2000
MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024
MAX_SKILL_MD_BYTES = 1024 * 1024
_CHUNK_BYTES = 64 * 1024
_NAME = re.compile(r'[a-z0-9][a-z0-9-]{0,63}')
_DRIVE = re.compile(r'[A-Za-z]:')
# zipfile only bounds the output of these two methods per read; BZIP2 and LZMA entries expand
# a whole compressed chunk at once, so a 2 KB archive can take gigabytes before any count runs.
_METHODS = (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
_FILE_TYPES = (0, stat.S_IFREG, stat.S_IFDIR)
_QUOTED_CHARS = 200
# zipfile and its decompressors report a corrupt archive or deflate stream (BadZipFile, zlib.error),
# an unsupported header feature (NotImplementedError) and an entry name that is not the UTF-8 its
# flag claims (UnicodeDecodeError) through these; each is the uploader's error, never the server's.
_STDLIB_READ_ERRORS = (zipfile.BadZipFile, zlib.error, NotImplementedError, UnicodeDecodeError)


class SkillZipError(Exception):
    """An upload that is not a valid skill ZIP; the message is the reason."""


def validate_skill_zip(body: bytes) -> tuple[str, str]:
    """Return the root SKILL.md frontmatter (name, description), or raise SkillZipError."""
    try:
        skill_md = _read_skill_md(body)
    except _STDLIB_READ_ERRORS as exc:
        raise SkillZipError(f'not a readable ZIP archive ({type(exc).__name__}: {_quoted(str(exc))})') from exc
    return _frontmatter(skill_md)


def _shared_prefix(names: list[str]) -> str:
    # The pinned OCU extractor's rule (computer-use-server/skill_manager.py): the first name's first
    # segment is stripped when every non-empty name starts with it plus '/'.
    if names and all(n.startswith(names[0].split('/')[0] + '/') for n in names if n):
        return names[0].split('/')[0] + '/'
    return ''


def _check_path(path: str) -> None:
    if '\\' in path:
        raise SkillZipError(f'backslash in entry path {_quoted(path)}')
    if path.startswith('/') or _DRIVE.match(path):
        raise SkillZipError(f'absolute path {_quoted(path)}')
    if '..' in path.split('/'):
        raise SkillZipError(f"'..' component in entry path {_quoted(path)}")


def _check_file_tree(files: list[str]) -> None:
    # OCU writes each file at its stripped path, so a file cannot also be a parent directory.
    known = set(files)
    for path in files:
        parts = path.split('/')
        for depth in range(1, len(parts)):
            parent = '/'.join(parts[:depth])
            if parent in known:
                raise SkillZipError(f'entry path {_quoted(path)} lies under file entry {_quoted(parent)}')


def _checked_entries(archive: zipfile.ZipFile) -> list[tuple[zipfile.ZipInfo, str]]:
    infos = archive.infolist()
    if len(infos) > MAX_ENTRIES:
        raise SkillZipError(f'{len(infos)} entries exceed the {MAX_ENTRIES}-entry limit')
    # The pinned OCU extractor refuses on the declared sizes too (skill_manager._check_zip_entries).
    if sum(info.file_size for info in infos) > MAX_UNCOMPRESSED_BYTES:
        raise SkillZipError('declared uncompressed size exceeds 200 MB')
    prefix = _shared_prefix(archive.namelist())
    entries = []
    for info in infos:
        stripped = info.filename.removeprefix(prefix)
        # The stripped path is what OCU joins onto its target directory, so both forms are checked.
        _check_path(info.filename)
        _check_path(stripped)
        file_type = stat.S_IFMT(info.external_attr >> 16)
        if file_type == stat.S_IFLNK:
            raise SkillZipError(f'symlink entry {_quoted(info.filename)}')
        if file_type not in _FILE_TYPES:
            raise SkillZipError(f'entry {_quoted(info.filename)} is not a regular file or directory')
        if info.flag_bits & 0x1:
            raise SkillZipError(f'encrypted entry {_quoted(info.filename)}')
        if info.compress_type not in _METHODS:
            method = zipfile.compressor_names.get(info.compress_type, str(info.compress_type))
            raise SkillZipError(
                f'entry {_quoted(info.filename)} uses compression method {method}; only stored and deflate'
            )
        entries.append((info, stripped))
    _check_file_tree([stripped for info, stripped in entries if not info.is_dir()])
    return entries


def _read_skill_md(body: bytes) -> bytes:
    """Read every file entry in bounded chunks, which CRC-checks it; keep only the root SKILL.md."""
    skill_md = None
    with zipfile.ZipFile(io.BytesIO(body)) as archive:
        for info, stripped in _checked_entries(archive):
            if info.is_dir():
                continue
            kept = bytearray() if stripped == 'SKILL.md' else None
            with archive.open(info) as stream:
                while chunk := stream.read(_CHUNK_BYTES):
                    if kept is not None:
                        kept += chunk
                        if len(kept) > MAX_SKILL_MD_BYTES:
                            raise SkillZipError('SKILL.md exceeds 1 MB')
            if kept is not None:
                skill_md = bytes(kept)
    if skill_md is None:
        raise SkillZipError('no root SKILL.md after stripping a single shared top-level directory')
    return skill_md


def _frontmatter(skill_md: bytes) -> tuple[str, str]:
    try:
        text = skill_md.decode('utf-8')
    except UnicodeDecodeError as exc:
        raise SkillZipError('SKILL.md is not UTF-8') from exc
    lines = text.removeprefix('\ufeff').replace('\r\n', '\n').split('\n')
    if lines[0] != '---' or '---' not in lines[1:]:
        raise SkillZipError('SKILL.md has no frontmatter between --- lines')
    try:
        meta = yaml.safe_load('\n'.join(lines[1 : lines.index('---', 1)]))
    except RecursionError as exc:
        raise SkillZipError('SKILL.md frontmatter is nested too deeply') from exc
    except yaml.YAMLError as exc:
        raise SkillZipError(f'SKILL.md frontmatter is not YAML: {_quoted(str(exc))}') from exc
    if not isinstance(meta, dict):
        raise SkillZipError('SKILL.md frontmatter is not a mapping')
    name, description = meta.get('name'), meta.get('description')
    if not isinstance(name, str) or not _NAME.fullmatch(name):
        raise SkillZipError(
            f'frontmatter name must be a string matching ^[a-z0-9][a-z0-9-]{{0,63}}$, got {_quoted(name)}'
        )
    if not isinstance(description, str) or not description.strip():
        raise SkillZipError('frontmatter description must be a non-empty string')
    return name, description


def _quoted(value: object) -> str:
    # Every reason stays near 1 KB: an entry name runs to 64 KB and a YAML anchor in a stdlib error
    # to 1 MB, so a string is cut after quoting; aliases make a list whose repr grows exponentially
    # with the frontmatter size, so any other type is named, never printed.
    if not isinstance(value, str):
        return type(value).__name__
    text = repr(value)
    return text if len(text) <= _QUOTED_CHARS else text[:_QUOTED_CHARS] + '...'
