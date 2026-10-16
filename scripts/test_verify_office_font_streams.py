from io import BytesIO

import pytest
from fontTools.encodings.StandardEncoding import StandardEncoding
from fontTools.fontBuilder import FontBuilder
from fontTools.misc.psCharStrings import T1CharString
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.t1Lib import T1Font, findEncryptedChunks
from pypdf import PdfWriter
from pypdf.generic import ArrayObject, DecodedStreamObject, DictionaryObject, NameObject, NumberObject
from smoke_proxy_support import Fail
from verify_office_libreoffice import observe_pdf

FACE = 'OCUFixtureFace'
GLYPHS = ['.notdef', *sorted(set(StandardEncoding[32:127]))]


def _type1_program():
    font = T1Font.__new__(T1Font)
    font.encoding = 'ascii'
    font.font = {
        'FontName': FACE,
        'FontType': 1,
        'PaintType': 0,
        'FontMatrix': [0.001, 0, 0, 0.001, 0, 0],
        'FontBBox': [0, 0, 500, 700],
        'Encoding': StandardEncoding,
        'FontInfo': {'FamilyName': 'Synthetic PostScript Family', 'FullName': 'Synthetic Fixture Typeface'},
        'Private': {
            'RD': ('string', 'currentfile', 'exch', 'readstring', 'pop'),
            'ND': ('noaccess', 'def'),
            'NP': ('noaccess', 'put'),
            'lenIV': 4,
            'Subrs': [],
            'BlueValues': [],
            'password': 5839,
        },
        'CharStrings': {
            glyph: T1CharString(
                program=[
                    0,
                    600,
                    'hsbw',
                    0,
                    0,
                    'rmoveto',
                    500,
                    0,
                    0,
                    700,
                    -500,
                    0,
                    'rlineto',
                    'closepath',
                    'endchar',
                ],
                subrs=[],
            )
            for glyph in GLYPHS
        },
    }
    chunks = findEncryptedChunks(font.getData())
    data = b''.join(content for _, content in chunks)
    lengths = {f'/Length{index}': len(content) for index, (_, content) in enumerate(chunks, 1)}
    return data, lengths


def _outline(pen):
    pen.moveTo((0, 0))
    pen.lineTo((500, 0))
    pen.lineTo((500, 700))
    pen.lineTo((0, 700))
    pen.closePath()


def _sfnt_program(*, cff=False, raw_cff=False):
    builder = FontBuilder(1000, isTTF=not cff)
    builder.setupGlyphOrder(GLYPHS)
    builder.setupCharacterMap({point: StandardEncoding[point] for point in range(32, 127)})
    glyphs = {}
    for name in GLYPHS:
        pen = T2CharStringPen(600, None) if cff else TTGlyphPen(None)
        _outline(pen)
        glyphs[name] = pen.getCharString() if cff else pen.glyph()
    if cff:
        builder.setupCFF(
            FACE, {'FamilyName': 'Synthetic CFF Family', 'FullName': 'Synthetic Fixture Typeface'}, glyphs, {}
        )
    else:
        builder.setupGlyf(glyphs)
    builder.setupHorizontalMetrics({name: (600, 0) for name in GLYPHS})
    builder.setupHorizontalHeader(ascent=800, descent=-200)
    builder.setupNameTable(
        {
            'familyName': 'Synthetic SFNT Family',
            'styleName': 'Regular',
            'uniqueFontIdentifier': 'OCU172SyntheticFont',
            'fullName': 'Synthetic Fixture Typeface',
            'psName': FACE,
        }
    )
    builder.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
    builder.setupPost()
    try:
        if raw_cff:
            return builder.font['CFF '].compile(builder.font)
        output = BytesIO()
        builder.save(output)
        return output.getvalue()
    finally:
        builder.font.close()


def _embedded_pdf(path, data, key, *, subtype=None, lengths=None, extra_key=None):
    writer = PdfWriter()
    page = writer.add_blank_page(width=300, height=300)
    program = DecodedStreamObject()
    program.set_data(data)
    if subtype is not None:
        program[NameObject('/Subtype')] = NameObject(subtype)
    for name, value in (lengths or {}).items():
        program[NameObject(name)] = NumberObject(value)
    embedded = writer._add_object(program)
    descriptor = DictionaryObject(
        {
            NameObject('/Type'): NameObject('/FontDescriptor'),
            NameObject('/FontName'): NameObject('/' + FACE),
            NameObject('/Flags'): NumberObject(32),
            NameObject('/ItalicAngle'): NumberObject(0),
            NameObject('/Ascent'): NumberObject(800),
            NameObject('/Descent'): NumberObject(-200),
            NameObject('/CapHeight'): NumberObject(700),
            NameObject('/StemV'): NumberObject(80),
            NameObject('/FontBBox'): ArrayObject([NumberObject(value) for value in (0, 0, 500, 700)]),
            NameObject(key): embedded,
        }
    )
    if extra_key:
        descriptor[NameObject(extra_key)] = embedded
    font = DictionaryObject(
        {
            NameObject('/Type'): NameObject('/Font'),
            NameObject('/Subtype'): NameObject('/TrueType' if key == '/FontFile2' else '/Type1'),
            NameObject('/BaseFont'): NameObject('/' + FACE),
            NameObject('/Encoding'): NameObject('/WinAnsiEncoding'),
            NameObject('/FirstChar'): NumberObject(32),
            NameObject('/LastChar'): NumberObject(126),
            NameObject('/Widths'): ArrayObject([NumberObject(600) for _ in range(95)]),
            NameObject('/FontDescriptor'): writer._add_object(descriptor),
        }
    )
    page[NameObject('/Resources')] = DictionaryObject(
        {
            NameObject('/Font'): DictionaryObject({NameObject('/F1'): writer._add_object(font)}),
        }
    )
    content = DecodedStreamObject()
    content.set_data(b'BT /F1 12 Tf 20 200 Td (OCU_FONT_PROBE_DOCX) Tj ET')
    page[NameObject('/Contents')] = writer._add_object(content)
    writer.write(path)


def test_type1_fontfile_family_comes_from_authored_embedded_postscript_metadata(tmp_path):
    pdf = tmp_path / 'type1.pdf'
    data, lengths = _type1_program()
    _embedded_pdf(pdf, data, '/FontFile', lengths=lengths)
    observed = observe_pdf(pdf, marker='OCU_FONT_PROBE_DOCX', requested_font='Synthetic PostScript Family')
    assert [(row['rendered_pdf_font'], row['rendered_font_family']) for row in observed['font_observations']] == [
        (FACE, 'Synthetic PostScript Family')
    ]
    assert observed['substitutions'] == []
    assert observed['name_differences'][0]['requested_font'] == 'Synthetic PostScript Family'


@pytest.mark.parametrize(
    ('key', 'subtype', 'cff', 'raw_cff', 'expected'),
    [
        ('/FontFile2', None, False, False, 'Synthetic SFNT Family'),
        ('/FontFile3', '/OpenType', True, False, 'Synthetic SFNT Family'),
        ('/FontFile3', '/Type1C', True, True, 'Synthetic CFF Family'),
    ],
)
def test_sfnt_and_compact_streams_use_their_actual_family_metadata(tmp_path, key, subtype, cff, raw_cff, expected):
    pdf = tmp_path / 'embedded.pdf'
    data = _sfnt_program(cff=cff, raw_cff=raw_cff)
    _embedded_pdf(pdf, data, key, subtype=subtype)
    observed = observe_pdf(pdf, marker='OCU_FONT_PROBE_DOCX', requested_font=expected)
    assert [(row['rendered_pdf_font'], row['rendered_font_family']) for row in observed['font_observations']] == [
        (FACE, expected)
    ]
    assert observed['substitutions'] == []


def test_unknown_fontfile3_subtype_is_not_guessed_from_a_parseable_sfnt_stream(tmp_path):
    pdf = tmp_path / 'unknown-subtype.pdf'
    _embedded_pdf(pdf, _sfnt_program(), '/FontFile3', subtype='/UnsupportedFixtureFormat')
    with pytest.raises(Fail, match='unsupported FontFile3 subtype'):
        observe_pdf(pdf, marker='OCU_FONT_PROBE_DOCX', requested_font='Synthetic SFNT Family')


def test_multiple_embedded_stream_keys_are_an_attribution_error(tmp_path):
    pdf = tmp_path / 'ambiguous.pdf'
    data, lengths = _type1_program()
    _embedded_pdf(pdf, data, '/FontFile', lengths=lengths, extra_key='/FontFile2')
    with pytest.raises(Fail, match='ambiguous embedded PDF font streams'):
        observe_pdf(pdf, marker='OCU_FONT_PROBE_DOCX', requested_font='Synthetic PostScript Family')
