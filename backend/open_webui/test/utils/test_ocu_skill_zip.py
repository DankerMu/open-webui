"""Uploaded-skill ZIP validator: one case per rejection class, plus the accepted archive shapes."""

from __future__ import annotations

import stat
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
# id -> (entries, header patch, reason the error must name; None: rejected whatever the reason)
REJECTIONS = {
    'absolute-path': ([VALID, ('/etc/x', 'x')], {}, 'absolute path'),
    'drive-letter': ([VALID, ('C:/x', 'x')], {}, 'absolute path'),
    # Stripping the wrapper turns w//etc/x into /etc/x, which os.path.join in OCU would follow.
    'absolute-after-strip': ([('w/SKILL.md', SKILL_MD), ('w//etc/x', 'x')], {}, 'absolute path'),
    'dotdot-inner': ([VALID, ('a/../x', 'x')], {}, r"'\.\.' component"),
    'dotdot-escape': ([VALID, ('../../evil.sh', 'x')], {}, r"'\.\.' component"),
    'backslash': ([VALID, ('a\\x', 'x')], {}, 'backslash'),
    'symlink': ([VALID, (_info('link', mode=stat.S_IFLNK | 0o777), 'SKILL.md')], {}, 'symlink'),
    'encrypted': ([VALID, ('secret', 'x')], {'secret': {'flag_bits': 0x1}}, 'encrypted'),
    'too-many-entries': ([VALID, *((f'f{i}', '') for i in range(2000))], {}, '2001 entries'),
    'bomb-one-entry': ([VALID, ('zeros', 200 * MB + 1)], {}, '200 MB'),
    'bomb-sum': ([VALID, *((f'zeros{i}', 70 * MB) for i in range(3))], {}, '200 MB'),
    'forged-file-size': ([VALID, ('payload', 'x' * 1000)], {'payload': {'file_size': 10}}, None),
    'no-skill-md': ([('README.md', 'x')], {}, 'no root SKILL.md'),
    'nested-skill-md': ([('docs/SKILL.md', SKILL_MD), ('README.md', 'x')], {}, 'no root SKILL.md'),
    'mixed-top-level': ([('a/SKILL.md', SKILL_MD), ('b/x', 'x')], {}, 'no root SKILL.md'),
    'frontmatter-missing': ([('SKILL.md', 'name: invoice-builder\n')], {}, 'frontmatter'),
    'frontmatter-unclosed': ([('SKILL.md', '---\nname: invoice-builder\n')], {}, 'frontmatter'),
    'frontmatter-not-yaml': ([_md('name: [unclosed')], {}, 'not YAML'),
    'frontmatter-not-mapping': ([_md('- name\n- description')], {}, 'not a mapping'),
    'name-missing': ([_md('description: d')], {}, 'name None'),
    'name-not-string': ([_md('name: 123\ndescription: d')], {}, 'name 123'),
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
    'unsupported-method': ([VALID, ('payload', 'x')], {'payload': {'compress_type': SHRUNK}}, 'NotImplementedError'),
    'skill-md-not-utf8': ([('SKILL.md', b'---\nname: \xff\ndescription: d\n---\n')], {}, 'not UTF-8'),
    'skill-md-over-1mb': ([('SKILL.md', SKILL_MD + 'x' * MB)], {}, '1 MB'),
}


@pytest.mark.parametrize('case', list(REJECTIONS))
def test_rejects_each_class_with_its_reason(case):
    entries, patch, reason = REJECTIONS[case]

    with pytest.raises(SkillZipError, match=reason):
        validate_skill_zip(skill_zip(entries, patch=patch))


@pytest.mark.parametrize('body', [b'not a zip', b''], ids=['not-a-zip', 'empty'])
def test_rejects_a_body_that_is_not_a_zip(body):
    with pytest.raises(SkillZipError, match='not a readable ZIP'):
        validate_skill_zip(body)


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
}


@pytest.mark.parametrize('case', list(ACCEPTED))
def test_accepts_root_and_wrapped_skill_md(case):
    assert validate_skill_zip(skill_zip(ACCEPTED[case])) == ('invoice-builder', 'Builds invoices')
