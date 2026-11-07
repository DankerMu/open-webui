"""Uploaded-skill ZIP validator: one case per rejection class, plus the accepted archive shapes."""

from __future__ import annotations

import io
import stat
import struct
import time
import zipfile

import pytest
from open_webui.test.ocu_harness import skill_zip
from open_webui.utils.ocu_skill_zip import SkillZipError, validate_skill_zip

MB = 1024 * 1024
SKILL_MD = '---\nname: invoice-builder\ndescription: Builds invoices\n---\n# Invoice builder\n'
VALID = ('SKILL.md', SKILL_MD)


def _md(frontmatter: str) -> tuple[str, str]:
    return ('SKILL.md', f'---\n{frontmatter}\n---\nBody\n')


def _info(name: str, *, mode: int = 0) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(name)
    info.external_attr = mode << 16
    return info


DEFLATED, SHRUNK = zipfile.ZIP_DEFLATED, 1
DECLARED = 'declared uncompressed size exceeds 200 MB'
# Entry names run to 64 KB and YAML anchors to the 1 MB SKILL.md; a reason quotes neither whole.
LONG_NAME = 'p' * 5000
# Each anchor doubles the one before; a repr of `name` would be 2**20 'x' items long.
ALIASES = '\n'.join(['a0: &a0 [x, x]', *(f'a{i}: &a{i} [*a{i - 1}, *a{i - 1}]' for i in range(1, 20))])
# id -> (entries, header patch, reason the error must name; None: rejected whatever the reason)
REJECTIONS = {
    'absolute-path': ([VALID, ('/etc/x', 'x')], {}, 'absolute path'),
    'drive-letter': ([VALID, ('C:/x', 'x')], {}, 'absolute path'),
    # Stripping the wrapper turns w//etc/x into /etc/x, which os.path.join in OCU would follow.
    'absolute-after-strip': ([('w/SKILL.md', SKILL_MD), ('w//etc/x', 'x')], {}, 'absolute path'),
    'dotdot-inner': ([VALID, ('a/../x', 'x')], {}, r"'\.\.' component"),
    'dotdot-escape': ([VALID, ('../../evil.sh', 'x')], {}, r"'\.\.' component"),
    'backslash': ([VALID, ('a\\x', 'x')], {}, 'backslash'),
    'backslash-long-name': ([VALID, (f'{LONG_NAME}\\x', 'x')], {}, 'backslash'),
    'symlink': ([VALID, (_info('link', mode=stat.S_IFLNK | 0o777), 'SKILL.md')], {}, 'symlink'),
    'fifo': ([VALID, (_info('pipe', mode=stat.S_IFIFO | 0o644), '')], {}, 'not a regular file or directory'),
    # OCU extracts SKILL.md as a file and then needs it as the directory of SKILL.md/x.
    'file-then-path-under-it': ([VALID, ('SKILL.md/x', 'y')], {}, "under file entry 'SKILL.md'"),
    'path-under-file-then-file': ([('a/x', 'y'), VALID, ('a', 'z')], {}, "under file entry 'a'"),
    'path-under-file-after-strip': (
        [('s/SKILL.md', SKILL_MD), ('s/a', 'y'), ('s/a/b', 'z')],
        {},
        "'a/b' lies under file entry 'a'",
    ),
    # OCU joins the stripped path without normalizing it, so './a' and 'a' would be two entries.
    'dot-segment-leading': ([VALID, ('./a', 'y'), ('a/b', 'z')], {}, "non-canonical entry path '\\./a'"),
    'dot-segment-inner': ([VALID, ('a/./b', 'y')], {}, "non-canonical entry path 'a/\\./b'"),
    'empty-segment': ([VALID, ('a//b', 'y')], {}, "non-canonical entry path 'a//b'"),
    'empty-segment-directory': ([VALID, ('a//', b'')], {}, "non-canonical entry path 'a//'"),
    'encrypted': ([VALID, ('secret', 'x')], {'secret': {'flag_bits': 0x1}}, 'encrypted'),
    'too-many-entries': ([VALID, *((f'f{i}', '') for i in range(2000))], {}, '2001 entries'),
    'bomb-one-entry': ([VALID, ('zeros', 200 * MB + 1)], {}, DECLARED),
    'bomb-sum': ([VALID, *((f'zeros{i}', 70 * MB) for i in range(3))], {}, DECLARED),
    # One byte of data declaring 200 MB plus one: refused from the headers, before any entry is read.
    'declared-sum': ([VALID, ('payload', 'x')], {'payload': {'file_size': 200 * MB + 1}}, DECLARED),
    'forged-file-size': ([VALID, ('payload', 'x' * 1000)], {'payload': {'file_size': 10}}, None),
    'forged-file-size-long-name': ([VALID, (LONG_NAME, 'x' * 1000)], {LONG_NAME: {'file_size': 10}}, 'Bad CRC'),
    'no-skill-md': ([('README.md', 'x')], {}, 'no root SKILL.md'),
    'nested-skill-md': ([('docs/SKILL.md', SKILL_MD), ('README.md', 'x')], {}, 'no root SKILL.md'),
    'mixed-top-level': ([('a/SKILL.md', SKILL_MD), ('b/x', 'x')], {}, 'no root SKILL.md'),
    'frontmatter-missing': ([('SKILL.md', 'name: invoice-builder\n')], {}, 'no frontmatter'),
    'frontmatter-unclosed': ([('SKILL.md', '---\nname: invoice-builder\n')], {}, 'no frontmatter'),
    'frontmatter-not-yaml': ([_md('name: [unclosed')], {}, 'not YAML'),
    'frontmatter-long-undefined-alias': ([_md(f'name: *{"a" * 500_000}\ndescription: d')], {}, 'undefined alias'),
    'frontmatter-deep-nesting': ([_md(f'name: {"[" * 5000}{"]" * 5000}')], {}, 'nested too deeply'),
    'frontmatter-not-mapping': ([_md('- name\n- description')], {}, 'not a mapping'),
    'name-missing': ([_md('description: d')], {}, 'got NoneType'),
    'name-not-string': ([_md('name: 123\ndescription: d')], {}, 'got int'),
    'name-alias-expansion': ([_md(f'{ALIASES}\nname: *a19\ndescription: d')], {}, 'got list'),
    'name-long-string': ([_md(f'name: {"a" * 5000}\ndescription: d')], {}, r"got 'a{199}\.\.\.$"),
    'name-uppercase': ([_md('name: Invoice-Builder\ndescription: d')], {}, 'name'),
    'name-65-chars': ([_md(f'name: {"a" * 65}\ndescription: d')], {}, 'name'),
    'name-leading-dash': ([_md("name: '-invoice'\ndescription: d")], {}, 'name'),
    'name-trailing-newline': ([_md('name: "invoice\\n"\ndescription: d')], {}, 'name'),
    'description-missing': ([_md('name: invoice-builder')], {}, 'description'),
    'description-blank': ([_md("name: invoice-builder\ndescription: '  '")], {}, 'description'),
    'description-int': ([_md('name: invoice-builder\ndescription: 123')], {}, 'description'),
    'description-list': ([_md('name: invoice-builder\ndescription: [a, b]')], {}, 'description'),
    'corrupt-deflate': (
        [VALID, (_info('payload'), b'\xff' * 64)],
        {'payload': {'compress_type': DEFLATED}},
        'decompressing',
    ),
    'unsupported-method': ([VALID, ('payload', 'x')], {'payload': {'compress_type': SHRUNK}}, 'method shrink'),
    # zipfile hands BZIP2 and LZMA output to the caller without a size limit, so neither is opened.
    'bzip2-bomb': ([VALID, ('payload', 'x')], {'payload': {'compress_type': zipfile.ZIP_BZIP2}}, 'method bzip2'),
    'lzma-bomb': ([VALID, ('payload', 'x')], {'payload': {'compress_type': zipfile.ZIP_LZMA}}, 'method lzma'),
    'compressed-patched-flag': ([VALID, ('payload', 'x')], {'payload': {'flag_bits': 0x20}}, 'NotImplementedError'),
    'skill-md-not-utf8': ([('SKILL.md', b'---\nname: \xff\ndescription: d\n---\n')], {}, 'not UTF-8'),
    'skill-md-over-1mb': ([('SKILL.md', SKILL_MD + 'x' * MB)], {}, '1 MB'),
}


@pytest.mark.parametrize('case', list(REJECTIONS))
def test_rejects_each_class_with_its_reason(case):
    entries, patch, reason = REJECTIONS[case]

    with pytest.raises(SkillZipError, match=reason) as raised:
        validate_skill_zip(skill_zip(entries, patch=patch))
    assert len(str(raised.value)) < 1024


@pytest.mark.parametrize('body', [b'not a zip', b''], ids=['not-a-zip', 'empty'])
def test_rejects_a_body_that_is_not_a_zip(body):
    with pytest.raises(SkillZipError, match='not a readable ZIP'):
        validate_skill_zip(body)


def test_rejects_a_utf8_flagged_entry_name_that_is_not_utf8():
    # zipfile sets the UTF-8 flag (0x800) for the non-ASCII name; its bytes are then made invalid.
    body = skill_zip([VALID, ('\u00e9', 'x')]).replace('\u00e9'.encode(), b'\xff\xfe')

    with pytest.raises(SkillZipError, match='UnicodeDecodeError'):
        validate_skill_zip(body)


def _duplicate_central_record(body: bytes, name: str, size: int) -> bytes:
    # A second central-directory record for `name` points at the same local header and declares
    # `size` bytes; zipfile only warns about the overlap, then runs out of stored data reading it.
    eocd = body.rfind(b'PK\x05\x06')
    count, cd_size, cd_offset = struct.unpack_from('<HII', body, eocd + 10)
    record = cd_offset
    while body[record + 46 : record + 46 + len(name)] != name.encode():
        record = body.find(b'PK\x01\x02', record + 1)
    end = cd_offset + cd_size
    forged = bytearray(body[record:end])
    struct.pack_into('<II', forged, 20, size, size)
    tail = bytearray(body[eocd:])
    struct.pack_into('<HHI', tail, 8, count + 1, count + 1, cd_size + len(forged))
    return body[:record] + bytes(forged) + body[record:end] + bytes(tail)


def test_rejects_a_duplicated_central_record_that_overruns_the_archive():
    stored = io.BytesIO()
    with zipfile.ZipFile(stored, 'w', zipfile.ZIP_STORED) as archive:
        archive.writestr(*VALID)
        archive.writestr('payload', 'x' * 10)
    body = _duplicate_central_record(stored.getvalue(), 'payload', 10 * MB)

    with pytest.warns(UserWarning), pytest.raises(SkillZipError, match='EOFError'):
        validate_skill_zip(body)


def test_checks_a_deep_entry_path_in_linear_time():
    # 32,000 segments in a 64 KB name; a quadratic parent check spends seconds on each such entry.
    deep = '/'.join(['a'] * 32_000)
    body = skill_zip([VALID, (deep, ''), (deep[:-1] + 'b', '')])

    started = time.perf_counter()
    assert validate_skill_zip(body) == ('invoice-builder', 'Builds invoices')
    assert time.perf_counter() - started < 0.5


ACCEPTED = {
    'root': [VALID, ('scripts/run.py', 'print(1)')],
    'bom-crlf': [('SKILL.md', '\ufeff' + SKILL_MD.replace('\n', '\r\n'))],
    'wrapped': [('invoice-builder/SKILL.md', SKILL_MD), ('invoice-builder/run.py', 'x')],
    'wrapped-with-directory-entries': [
        ('invoice-builder/', b''),
        ('invoice-builder/SKILL.md', SKILL_MD),
        ('invoice-builder/scripts/', b''),
    ],
    'entry-limit': [VALID, *((f'f{i}', '') for i in range(1999))],
    # Every name starts with './', so './' is the stripped wrapper and no '.' segment remains.
    'dot-slash-wrapper': [('./', b''), ('./SKILL.md', SKILL_MD), ('./scripts/', b''), ('./scripts/run.py', 'x')],
}


@pytest.mark.parametrize('case', list(ACCEPTED))
def test_accepts_root_and_wrapped_skill_md(case):
    assert validate_skill_zip(skill_zip(ACCEPTED[case])) == ('invoice-builder', 'Builds invoices')
