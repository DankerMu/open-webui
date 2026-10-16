"""LibreOffice observations describe LibreOffice, never DocumentServer layout."""

import hashlib
import re
import shutil
from io import BytesIO
from pathlib import Path

from fontTools.cffLib import CFFFontSet
from fontTools.misc.psLib import suckfont
from fontTools.ttLib import TTFont
from openpyxl import load_workbook
from pypdf import PdfReader
from smoke_proxy_support import Fail
from verify_office_fonts import declared_font_policy


def _font_descriptor(font):
    descendants = font.get('/DescendantFonts')
    physical = descendants[0].get_object() if descendants else font
    descriptor = physical.get('/FontDescriptor')
    return None if descriptor is None else descriptor.get_object()


def _sfnt_family(data):
    font = TTFont(BytesIO(data))
    try:
        return font['name'].getDebugName(16) or font['name'].getDebugName(1)
    finally:
        font.close()


def _type1_family(data):
    return suckfont(data, 'ascii').get('FontInfo', {}).get('FamilyName')


def _cff_family(data):
    fonts = CFFFontSet()
    fonts.decompile(BytesIO(data), None, isCFF2=False)
    if len(fonts) != 1:
        raise Fail('fidelity attribution: embedded CFF has ambiguous font-family membership')
    return getattr(fonts[0], 'FamilyName', None)


def _embedded_reader(key, stream):
    if key == '/FontFile':
        return _type1_family
    if key == '/FontFile2':
        return _sfnt_family
    subtype = str(stream.get('/Subtype'))
    readers = {'/OpenType': _sfnt_family, '/Type1C': _cff_family, '/CIDFontType0C': _cff_family}
    if subtype not in readers:
        raise Fail(f'fidelity attribution: unsupported FontFile3 subtype {subtype}')
    return readers[subtype]


def _embedded_family(descriptor):
    keys = [key for key in ('/FontFile', '/FontFile2', '/FontFile3') if key in descriptor]
    if not keys:
        raise Fail('fidelity attribution: PDF font has no physical family metadata or supported embedded font')
    if len(keys) != 1:
        raise Fail('fidelity attribution: ambiguous embedded PDF font streams')
    stream = descriptor[keys[0]].get_object()
    reader = _embedded_reader(keys[0], stream)
    try:
        family = reader(stream.get_data())
    except Fail:
        raise
    except Exception as exc:
        raise Fail(
            'fidelity attribution: embedded font family metadata unavailable (' + type(exc).__name__ + ')'
        ) from exc
    if not isinstance(family, str) or not family.strip():
        raise Fail('fidelity attribution: embedded font family name is absent')
    return family


def _rendered_family(font, face):
    descriptor = _font_descriptor(font)
    if descriptor is not None:
        family = descriptor.get('/FontFamily')
        return str(family) if family else _embedded_family(descriptor)
    standard = {
        'Helvetica': 'Helvetica',
        'Helvetica-Bold': 'Helvetica',
        'Helvetica-Oblique': 'Helvetica',
        'Helvetica-BoldOblique': 'Helvetica',
        'Courier': 'Courier',
        'Courier-Bold': 'Courier',
        'Courier-Oblique': 'Courier',
        'Courier-BoldOblique': 'Courier',
        'Times-Roman': 'Times',
        'Times-Bold': 'Times',
        'Times-Italic': 'Times',
        'Times-BoldItalic': 'Times',
        'Symbol': 'Symbol',
        'ZapfDingbats': 'ZapfDingbats',
    }
    if font.get('/Subtype') == '/Type1' and face in standard:
        return standard[face]
    raise Fail('fidelity attribution: rendered font family cannot be established from PDF metadata')


def observe_pdf(path: Path, *, marker: str, requested_font: str) -> dict:
    reader = PdfReader(path)
    observations = []
    probe_seen = False
    for number, page in enumerate(reader.pages, 1):
        families = {}

        def visit(text, _cm, _tm, font, _size):
            nonlocal probe_seen
            if not text.strip():
                return
            if font is None or not font.get('/BaseFont'):
                raise Fail(f'fidelity: page {number} rendered text span has no observable PDF font')
            raw = str(font['/BaseFont']).lstrip('/')
            face = re.sub(r'^[A-Z]{6}\+', '', raw)
            if raw not in families:
                families[raw] = _rendered_family(font, face)
            observations.append(
                {
                    'page': number,
                    'text': text.strip(),
                    'rendered_pdf_font': face,
                    'raw_pdf_font': raw,
                    'rendered_font_family': families[raw],
                }
            )
            probe_seen |= marker in text

        page.extract_text(visitor_text=visit)
    if not probe_seen:
        raise Fail('fidelity: ASCII font probe not associated with any rendered PDF font')
    return {
        'page_count': len(reader.pages),
        'pdf_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'font_comparison': 'Requested OOXML family versus rendered physical family from PDF FontDescriptor, '
        'embedded font name metadata or standard PDF Type1 identity; not per-glyph fidelity',
        'font_observations': observations,
        'name_differences': [
            dict(row, requested_font=requested_font)
            for row in observations
            if row['rendered_pdf_font'] != requested_font
        ],
        'substitutions': [
            dict(row, requested_font=requested_font)
            for row in observations
            if row['rendered_font_family'].casefold() != requested_font.casefold()
        ],
    }


def observe_document_pdf(source: Path, pdf: Path) -> dict:
    from verify_office_documents import DocumentCheckError

    kind = source.suffix.lstrip('.').upper()
    try:
        declaration = declared_font_policy(source)
        result = observe_pdf(pdf, marker=f'OCU_FONT_PROBE_{kind}', requested_font=declaration['font'])
        result['declared_font_policy'] = declaration
        return result
    except Exception as exc:
        raise DocumentCheckError(kind, 'fidelity', str(exc)) from exc


class LibreOffice:
    def __init__(self, executable: str, directory: Path, processes, env: dict):
        self.executable = executable
        self.directory = directory
        self.processes = processes
        self.env = env
        self.version = processes.command([executable, '--version'], env=env, label='LibreOffice-version').strip()
        self.profile = directory / 'profile'

    def convert(self, source: Path, phase: str, extension: str) -> Path:
        work = self.directory / phase / source.suffix.lstrip('.') / extension
        incoming = work / 'input'
        output = work / 'output'
        incoming.mkdir(parents=True)
        output.mkdir()
        copy = incoming / source.name
        shutil.copyfile(source, copy)
        self.processes.command(
            [
                self.executable,
                '-env:UserInstallation=' + self.profile.as_uri(),
                '--headless',
                '--convert-to',
                extension,
                '--outdir',
                str(output),
                str(copy),
            ],
            env=self.env,
            timeout=120,
            label=f'LibreOffice-{source.suffix[1:]}-{phase}-{extension}',
        )
        result = output / (source.stem + '.' + extension)
        if not result.is_file() or result.stat().st_size == 0:
            raise Fail(f'{source.suffix[1:].upper()} LibreOffice reopen: no {extension} output')
        return result

    def observe(self, source: Path, phase: str) -> dict:
        from verify_office_documents import DocumentCheckError

        try:
            pdf = self.convert(source, phase, 'pdf')
            result = observe_document_pdf(source, pdf)
            result.update(
                renderer=self.version,
                method='LibreOffice PDF export + pypdf all-text visitor',
                scope='All observed non-whitespace PDF text spans against the inspected uniform '
                'OOXML policy; PDF names are font-face identities, not inferred family names. '
                'Not DocumentServer layout, per-glyph fidelity or Chinese text preservation.',
            )
            return result
        except DocumentCheckError:
            raise
        except Exception as exc:
            raise DocumentCheckError(source.suffix.lstrip('.').upper(), 'LibreOffice/fidelity', str(exc)) from exc

    def reopened_values(self, source: Path) -> dict:
        converted = self.convert(source, 'reopened', 'xlsx')
        book = load_workbook(converted, data_only=True, read_only=True)
        try:
            values = {'Main!B2': book['Main']['B2'].value, 'Second!A2': book['Second']['A2'].value}
            if values != {'Main!B2': 12, 'Second!A2': 15}:
                raise Fail(f'XLSX LibreOffice reopened values: unexpected values {values}')
            return values
        finally:
            book.close()
