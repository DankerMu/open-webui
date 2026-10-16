"""Uniform synthetic font declarations and published-file attribution boundaries."""

from collections import Counter
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit
from zipfile import ZipFile

from lxml import etree
from smoke_proxy_support import Fail

FONT = 'OCURequiredMissingFont172'
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
WORD_SLOTS = (
    ('ascii', 'asciiTheme'),
    ('hAnsi', 'hAnsiTheme'),
    ('eastAsia', 'eastAsiaTheme'),
    ('cs', 'cstheme', 'csTheme'),
)


def _child(parent, tag):
    found = parent.find(tag)
    return etree.SubElement(parent, tag) if found is None else found


def _word_fonts(root):
    for run in root.iter(f'{{{W}}}r'):
        properties = run.find(f'{{{W}}}rPr')
        if properties is None:
            properties = etree.Element(f'{{{W}}}rPr')
            run.insert(0, properties)
        _child(properties, f'{{{W}}}rFonts')
    for declaration in root.iter(f'{{{W}}}rFonts'):
        for attribute in ('asciiTheme', 'hAnsiTheme', 'eastAsiaTheme', 'cstheme', 'csTheme'):
            declaration.attrib.pop(f'{{{W}}}{attribute}', None)
        for script in ('ascii', 'hAnsi', 'eastAsia', 'cs'):
            declaration.set(f'{{{W}}}{script}', FONT)


def _drawing_fonts(root):
    for run in root.iter(f'{{{A}}}r'):
        properties = run.find(f'{{{A}}}rPr')
        if properties is None:
            properties = etree.Element(f'{{{A}}}rPr')
            run.insert(0, properties)
        for script in ('latin', 'ea', 'cs'):
            _child(properties, f'{{{A}}}{script}')
    for tag in ('latin', 'ea', 'cs', 'font', 'buFont', 'sym'):
        for declaration in root.iter(f'{{{A}}}{tag}'):
            declaration.set('typeface', FONT)


def _spreadsheet_fonts(root):
    for declaration in root.iter(f'{{{S}}}font'):
        _child(declaration, f'{{{S}}}name').set('val', FONT)
        scheme = declaration.find(f'{{{S}}}scheme')
        if scheme is not None:
            declaration.remove(scheme)
    for declaration in root.iter(f'{{{S}}}rFont'):
        declaration.set('val', FONT)


def apply_font_policy(content: bytes) -> bytes:
    root = etree.fromstring(content)
    _word_fonts(root)
    _drawing_fonts(root)
    _spreadsheet_fonts(root)
    return etree.tostring(root, encoding='utf-8', xml_declaration=True)


def _collect_word(direct, default, literal, references):
    for attributes in WORD_SLOTS:
        selected = direct
        if selected is None or not any(selected.get(f'{{{W}}}{key}') for key in attributes):
            selected = default
        for index, key in enumerate(attributes):
            value = selected.get(f'{{{W}}}{key}')
            if value:
                (literal if index == 0 else references).add(value)


def _collect_drawing(root, literal, references):
    for tag in ('latin', 'ea', 'cs', 'font', 'buFont', 'sym'):
        for declaration in root.iter(f'{{{A}}}{tag}'):
            value = declaration.get('typeface')
            if value:
                (references if value.startswith('+') else literal).add(value)


def _collect_spreadsheet(root, literal, references):
    for tag in ('name', 'rFont'):
        for declaration in root.iter(f'{{{S}}}{tag}'):
            value = declaration.get('val')
            if value:
                literal.add(value)
    for scheme in root.iter(f'{{{S}}}scheme'):
        value = scheme.get('val')
        if value != 'none':
            references.add({'minor': '+mn-lt', 'major': '+mj-lt'}.get(value, 'unknown-scheme:' + str(value)))


def _theme_references(root, path):
    available = set()
    for scheme in root.iter(f'{{{A}}}fontScheme'):
        for role, prefix in (('majorFont', 'major'), ('minorFont', 'minor')):
            for script, code, word_scripts in (
                ('latin', 'lt', ('Ascii', 'HAnsi')),
                ('ea', 'ea', ('EastAsia',)),
                ('cs', 'cs', ('Bidi',)),
            ):
                declaration = scheme.find(f'{{{A}}}{role}/{{{A}}}{script}')
                if declaration is None or not declaration.get('typeface'):
                    raise Fail(f'{path.suffix[1:].upper()} fidelity attribution: unresolved {role}/{script} font slot')
                available.add(f'+m{"j" if prefix == "major" else "n"}-{code}')
                available.update(prefix + slot for slot in word_scripts)
    return available


def _word_font_complete(declaration):
    return declaration is not None and all(
        any(declaration.get(f'{{{W}}}{key}') for key in attributes) for attributes in WORD_SLOTS
    )


def _style_font_override(style):
    return any(
        style.find(element) is not None
        for element in (
            f'{{{W}}}basedOn',
            f'.//{{{W}}}rFonts',
            f'{{{W}}}pPr/{{{W}}}numPr',
        )
    )


def _active_word_override(run, styles):
    paragraph = next(run.iterancestors(f'{{{W}}}p'), None)
    if run.find(f'{{{W}}}rPr/{{{W}}}rStyle') is not None:
        return True
    if paragraph is not None and any(
        paragraph.find(element) is not None
        for element in (
            f'{{{W}}}pPr/{{{W}}}pStyle',
            f'{{{W}}}pPr/{{{W}}}numPr',
            f'{{{W}}}pPr/{{{W}}}rPr/{{{W}}}rFonts',
        )
    ):
        return True
    applicable = {'paragraph', 'character'}
    tables = list(run.iterancestors(f'{{{W}}}tbl'))
    if tables:
        applicable.add('table')
        if any(table.find(f'{{{W}}}tblPr/{{{W}}}tblStyle') is not None for table in tables):
            return True
    for kind in applicable:
        defaults = (
            []
            if styles is None
            else [
                style
                for style in styles.findall(f'{{{W}}}style')
                if style.get(f'{{{W}}}type') == kind and style.get(f'{{{W}}}default') in ('1', 'true', 'on')
            ]
        )
        if len(defaults) > 1 or any(_style_font_override(style) for style in defaults):
            return True
    return False


def _style_generates_labels(styles, style):
    visited = set()
    while True:
        identifier = style.get(f'{{{W}}}styleId')
        if not identifier or identifier in visited:
            return True
        visited.add(identifier)
        if style.find(f'.//{{{W}}}numPr') is not None:
            return True
        parent = style.find(f'{{{W}}}basedOn')
        if parent is None:
            return False
        candidates = [
            candidate
            for candidate in styles.findall(f'{{{W}}}style')
            if candidate.get(f'{{{W}}}styleId') == parent.get(f'{{{W}}}val')
            and candidate.get(f'{{{W}}}type') == style.get(f'{{{W}}}type')
        ]
        if len(candidates) != 1:
            return True
        style = candidates[0]


def _paragraph_generates_labels(paragraph, styles):
    direct = paragraph.find(f'{{{W}}}pPr/{{{W}}}numPr')
    if direct is not None:
        identifier = direct.find(f'{{{W}}}numId')
        return identifier is None or identifier.get(f'{{{W}}}val') != '0'
    owners = [(paragraph, 'paragraph', f'{{{W}}}pPr/{{{W}}}pStyle')]
    owners.extend((table, 'table', f'{{{W}}}tblPr/{{{W}}}tblStyle') for table in paragraph.iterancestors(f'{{{W}}}tbl'))
    defined = [] if styles is None else styles.findall(f'{{{W}}}style')
    for owner, kind, selector in owners:
        selected = owner.find(selector)
        if selected is None:
            candidates = [
                style
                for style in defined
                if style.get(f'{{{W}}}type') == kind and style.get(f'{{{W}}}default') in ('1', 'true', 'on')
            ]
        else:
            candidates = [
                style
                for style in defined
                if style.get(f'{{{W}}}type') == kind and style.get(f'{{{W}}}styleId') == selected.get(f'{{{W}}}val')
            ]
        if len(candidates) > 1 or (selected is not None and len(candidates) != 1):
            return True
        if any(_style_generates_labels(styles, style) for style in candidates):
            return True
    return False


def _effective_word_fonts(roots, styles, path, literal, references):
    default = None if styles is None else styles.find(f'{{{W}}}docDefaults/{{{W}}}rPrDefault/{{{W}}}rPr/{{{W}}}rFonts')
    if any(
        _paragraph_generates_labels(paragraph, styles)
        for root in roots.values()
        for paragraph in root.iter(f'{{{W}}}p')
    ):
        raise Fail(
            f'{path.suffix[1:].upper()} fidelity attribution: unresolved Word text/default fonts; '
            'generated numbering label attribution is unsupported'
        )
    for root in roots.values():
        for run in root.iter(f'{{{W}}}r'):
            if not any((text.text or '').strip() for text in run.iter(f'{{{W}}}t')):
                continue
            direct = run.find(f'{{{W}}}rPr/{{{W}}}rFonts')
            if not _word_font_complete(direct) and (
                not _word_font_complete(default) or _active_word_override(run, styles)
            ):
                raise Fail(
                    f'{path.suffix[1:].upper()} fidelity attribution: unresolved Word text/default fonts; '
                    'active style or numbering inheritance requires effective text-to-font attribution'
                )
            _collect_word(direct, default, literal, references)


def _drawing_font_complete(properties):
    if properties is None:
        return False
    return all(
        properties.find(f'{{{A}}}{script}') is not None and properties.find(f'{{{A}}}{script}').get('typeface')
        for script in ('latin', 'ea', 'cs')
    )


def _validate_drawing_defaults(roots, path, theme_available):
    for root in roots.values():
        for run in root.iter(f'{{{A}}}r'):
            text = run.find(f'{{{A}}}t')
            if text is not None and (text.text or '').strip():
                if not _drawing_font_complete(run.find(f'{{{A}}}rPr')) and not theme_available:
                    raise Fail(f'{path.suffix[1:].upper()} fidelity attribution: unresolved drawing text/default fonts')


def _validate_xlsx_defaults(roots, path, styles):
    if path.suffix.lower() != '.xlsx':
        return
    fonts = [] if styles is None else styles.findall(f'{{{S}}}fonts/{{{S}}}font')
    if not fonts:
        raise Fail('XLSX fidelity attribution: missing default cell fonts')
    for font in fonts:
        name = font.find(f'{{{S}}}name')
        if name is None or not name.get('val'):
            raise Fail('XLSX fidelity attribution: unresolved default cell font')
    formats = styles.findall(f'{{{S}}}cellXfs/{{{S}}}xf')
    if not formats or any(int(item.get('fontId', '0')) >= len(fonts) for item in formats):
        raise Fail('XLSX fidelity attribution: unresolved cell-format font index')
    if any(
        root.tag == '{http://schemas.openxmlformats.org/drawingml/2006/chart}chartSpace' for root in roots.values()
    ) and not any(root.find(f'.//{{{A}}}fontScheme') is not None for root in roots.values()):
        raise Fail('XLSX fidelity attribution: unresolved chart default font scheme')


def _validate_effective_defaults(roots, path, available, styles):
    _validate_drawing_defaults(roots, path, available)
    _validate_xlsx_defaults(roots, path, styles)


def _xml_part(package, counts, name, path):
    if counts[name] != 1:
        raise Fail(f'{path.suffix[1:].upper()} fidelity attribution: missing or ambiguous package part {name}')
    try:
        return etree.fromstring(package.read(name), parser=etree.XMLParser(resolve_entities=False, no_network=True))
    except etree.XMLSyntaxError as error:
        raise Fail(f'{path.suffix[1:].upper()} fidelity attribution: malformed reachable XML part {name}') from error


def _part_relationships(package, counts, owner, path):
    part = PurePosixPath(owner)
    name = str(part.parent / '_rels' / (part.name + '.rels')) if owner else '_rels/.rels'
    if owner and not counts[name]:
        return []
    root = _xml_part(package, counts, name, path)
    relationships = list(root.findall(f'{{{REL}}}Relationship'))
    identifiers = [row.get('Id') for row in relationships]
    if (
        root.tag != f'{{{REL}}}Relationships'
        or not all(identifiers)
        or len(set(identifiers)) != len(identifiers)
        or any(not row.get('Type') or not row.get('Target') for row in relationships)
    ):
        raise Fail(f'{path.suffix[1:].upper()} fidelity attribution: ambiguous or malformed relationships in {name}')
    if sum(row.get('Type') == R + 'styles' for row in relationships) > 1:
        raise Fail(f'{path.suffix[1:].upper()} fidelity attribution: ambiguous styles relationships in {name}')
    return relationships


def _relationship_target(owner, relationship, path):
    target = relationship.get('Target', '')
    try:
        uri = urlsplit(target)
        decoded = unquote(uri.path, errors='strict')
    except (ValueError, UnicodeError) as error:
        raise Fail(f'{path.suffix[1:].upper()} fidelity attribution: unsafe relationship target') from error
    if not target or uri.scheme or uri.netloc or uri.query or uri.fragment or '\\' in decoded or '\x00' in decoded:
        raise Fail(f'{path.suffix[1:].upper()} fidelity attribution: unsafe relationship target')
    parts = [] if decoded.startswith('/') else list(PurePosixPath(owner).parent.parts)
    for part in decoded.split('/'):
        if part in ('', '.'):
            continue
        if part == '..':
            if not parts:
                raise Fail(f'{path.suffix[1:].upper()} fidelity attribution: escaping relationship target')
            parts.pop()
        else:
            parts.append(part)
    if not parts:
        raise Fail(f'{path.suffix[1:].upper()} fidelity attribution: empty relationship target')
    return '/'.join(parts)


def _reachable_roots(package, path):
    counts = Counter(package.namelist())
    entries = [row for row in _part_relationships(package, counts, '', path) if row.get('Type') == R + 'officeDocument']
    if len(entries) != 1 or entries[0].get('TargetMode', 'Internal') != 'Internal':
        raise Fail(f'{path.suffix[1:].upper()} fidelity attribution: missing, external or ambiguous officeDocument')
    main = _relationship_target('', entries[0], path)
    pending = [main]
    visited = set()
    roots = {}
    styles = None
    while pending:
        name = pending.pop()
        if name in visited:
            continue
        visited.add(name)
        if counts[name] != 1:
            raise Fail(f'{path.suffix[1:].upper()} fidelity attribution: missing or ambiguous package part {name}')
        if name.endswith('.xml') or name == main:
            roots[name] = _xml_part(package, counts, name, path)
        for relationship in _part_relationships(package, counts, name, path):
            kind = relationship.get('Type')
            mode = relationship.get('TargetMode', 'Internal')
            if mode == 'External' and kind not in (R + 'theme', R + 'styles'):
                continue
            if mode != 'Internal':
                raise Fail(f'{path.suffix[1:].upper()} fidelity attribution: external or unknown font material')
            target = _relationship_target(name, relationship, path)
            pending.append(target)
            if name == main and kind == R + 'styles':
                styles = target
    return roots, roots.get(styles)


def declared_font_policy(path: Path) -> dict:
    literal = set()
    references = set()
    available = set()
    with ZipFile(path) as package:
        roots, styles = _reachable_roots(package, path)
    _effective_word_fonts(roots, styles, path, literal, references)
    for root in roots.values():
        available.update(_theme_references(root, path))
        _collect_drawing(root, literal, references)
        _collect_spreadsheet(root, literal, references)
    if len(literal) != 1:
        raise Fail(
            f'{path.suffix[1:].upper()} fidelity attribution: expected one declared font policy; '
            f'observed {sorted(literal)}; mixed policies require text-to-font attribution'
        )
    if not references.issubset(available):
        raise Fail(f'{path.suffix[1:].upper()} fidelity attribution: unresolved theme font references')
    _validate_effective_defaults(roots, path, available, styles)
    return {
        'font': next(iter(literal)),
        'theme_references': sorted(references),
        'method': 'relationship-reachable OOXML declarations and effective Word text fonts; uniform-policy attribution',
    }
