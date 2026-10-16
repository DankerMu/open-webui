from zipfile import ZipFile

import pytest
from pypdf import PdfWriter
from pypdf.errors import PdfReadError
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
from smoke_proxy_support import Fail
from verify_office_documents import DocumentCheckError
from verify_office_libreoffice import observe_document_pdf, observe_pdf
from verify_office_samples import generate_samples


def _pdf(path, text, ordinary_text=None, *, probe_face='Helvetica', ordinary_face='Courier'):
    writer = PdfWriter()
    page = writer.add_blank_page(width=300, height=300)
    fonts = DictionaryObject()
    for identifier, face in (('F1', probe_face), ('F2', ordinary_face)):
        font = DictionaryObject(
            {
                NameObject('/Type'): NameObject('/Font'),
                NameObject('/Subtype'): NameObject('/Type1'),
                NameObject('/BaseFont'): NameObject('/' + face),
            }
        )
        fonts[NameObject('/' + identifier)] = writer._add_object(font)
    page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): fonts})
    contents = DecodedStreamObject()
    stream = f'BT /F1 12 Tf 20 200 Td ({text}) Tj ET'
    if ordinary_text is not None:
        stream += f'\nBT /F2 12 Tf 20 150 Td ({ordinary_text}) Tj ET'
    contents.set_data(stream.encode())
    page[NameObject('/Contents')] = writer._add_object(contents)
    writer.add_blank_page(width=300, height=300)
    writer.write(path)


def test_pdf_observation_associates_probe_with_rendered_font_and_actual_page_count(tmp_path):
    pdf = tmp_path / 'render.pdf'
    _pdf(pdf, 'OCU_FONT_PROBE_DOCX')
    observed = observe_pdf(pdf, marker='OCU_FONT_PROBE_DOCX', requested_font='MissingRequestedFont')
    assert observed['page_count'] == 2
    assert observed['substitutions'] == [
        {
            'page': 1,
            'text': 'OCU_FONT_PROBE_DOCX',
            'rendered_pdf_font': 'Helvetica',
            'raw_pdf_font': 'Helvetica',
            'requested_font': 'MissingRequestedFont',
            'rendered_font_family': 'Helvetica',
        }
    ]


def test_pdf_without_probe_cannot_report_empty_substitution_success(tmp_path):
    pdf = tmp_path / 'render.pdf'
    _pdf(pdf, 'Other text')
    with pytest.raises(Fail, match='ASCII font probe'):
        observe_pdf(pdf, marker='OCU_FONT_PROBE_DOCX', requested_font='MissingRequestedFont')


def test_nonprobe_rendered_font_is_included_in_full_text_fidelity_observation(tmp_path):
    pdf = tmp_path / 'two-fonts.pdf'
    _pdf(pdf, 'OCU_FONT_PROBE_DOCX', ordinary_text='Ordinary body text')
    observed = observe_pdf(pdf, marker='OCU_FONT_PROBE_DOCX', requested_font='MissingRequestedFont')
    assert observed['font_observations'] == [
        {
            'page': 1,
            'text': 'OCU_FONT_PROBE_DOCX',
            'rendered_pdf_font': 'Helvetica',
            'raw_pdf_font': 'Helvetica',
            'rendered_font_family': 'Helvetica',
        },
        {
            'page': 1,
            'text': 'Ordinary body text',
            'rendered_pdf_font': 'Courier',
            'raw_pdf_font': 'Courier',
            'rendered_font_family': 'Courier',
        },
    ]
    assert observed['substitutions'] == [
        {
            'page': 1,
            'text': 'OCU_FONT_PROBE_DOCX',
            'rendered_pdf_font': 'Helvetica',
            'raw_pdf_font': 'Helvetica',
            'requested_font': 'MissingRequestedFont',
            'rendered_font_family': 'Helvetica',
        },
        {
            'page': 1,
            'text': 'Ordinary body text',
            'rendered_pdf_font': 'Courier',
            'raw_pdf_font': 'Courier',
            'requested_font': 'MissingRequestedFont',
            'rendered_font_family': 'Courier',
        },
    ]


def test_published_font_declaration_change_is_not_reported_as_libreoffice_substitution(tmp_path):
    source = generate_samples(tmp_path / 'inputs')['docx']
    published = tmp_path / 'published.docx'
    with ZipFile(source) as original, ZipFile(published, 'w') as output:
        for info in original.infolist():
            content = original.read(info)
            if info.filename.endswith('.xml'):
                content = content.replace(b'OCURequiredMissingFont172', b'Helvetica')
            output.writestr(info, content)
    pdf = tmp_path / 'published.pdf'
    _pdf(pdf, 'OCU_FONT_PROBE_DOCX')
    observation = observe_document_pdf(published, pdf)
    assert observation['declared_font_policy']['font'] == 'Helvetica'
    assert observation['font_observations'][0]['rendered_pdf_font'] == 'Helvetica'
    assert observation['substitutions'] == []


def test_pdf_face_name_difference_with_same_family_is_not_a_substitution(tmp_path):
    pdf = tmp_path / 'bold-face.pdf'
    _pdf(pdf, 'OCU_FONT_PROBE_DOCX', probe_face='Helvetica-Bold')
    observed = observe_pdf(pdf, marker='OCU_FONT_PROBE_DOCX', requested_font='Helvetica')
    assert observed['substitutions'] == []
    assert [
        (row['rendered_pdf_font'], row['rendered_font_family'], row['requested_font'])
        for row in observed['name_differences']
    ] == [('Helvetica-Bold', 'Helvetica', 'Helvetica')]


def test_unidentified_nonprobe_font_family_is_a_concrete_measurement_blocker(tmp_path):
    pdf = tmp_path / 'unknown-family.pdf'
    _pdf(pdf, 'OCU_FONT_PROBE_DOCX', ordinary_text='Ordinary body text', ordinary_face='UnidentifiedCustomFace')
    with pytest.raises(Fail, match='rendered font family cannot be established'):
        observe_pdf(pdf, marker='OCU_FONT_PROBE_DOCX', requested_font='MissingRequestedFont')


@pytest.mark.parametrize('kind', ['docx', 'xlsx', 'pptx'])
def test_malformed_pdf_failure_names_owning_document_format_and_preserves_cause(tmp_path, kind):
    source = generate_samples(tmp_path / 'inputs')[kind]
    pdf = tmp_path / 'truncated.pdf'
    _pdf(pdf, 'OCU_FONT_PROBE_' + kind.upper())
    pdf.write_bytes(pdf.read_bytes()[:64])

    with pytest.raises(DocumentCheckError) as failure:
        observe_document_pdf(source, pdf)

    assert failure.value.format == kind.upper()
    assert failure.value.check == 'fidelity'
    assert kind.upper() in str(failure.value)
    assert isinstance(failure.value.__cause__, PdfReadError)
