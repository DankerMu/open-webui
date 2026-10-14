"""Deterministic ordinary-file and nested listing fixtures for the OCU stub."""

from __future__ import annotations

from pathlib import Path
from urllib.parse import quote

# Advertised bytes are independently specified so HTTP proof can compare them
# without reconstructing listing fiction.
NESTED_FILES: dict[str, tuple[str, str, bytes]] = {
    'packages/core/src/index.py': (
        'code',
        'text/x-python',
        b'print("ocu-stub nested index")\n',
    ),
    **{
        f'packages/core/src/mod-{index:02d}.py': (
            'code',
            'text/x-python',
            f'# ocu-stub nested module {index:02d}\n'.encode(),
        )
        for index in range(24)
    },
    'reports/summary.docx': (
        'docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        b'PK\x03\x04nested-summary-document',
    ),
    'reports/notes.txt': (
        'text',
        'text/plain',
        b'ocu-stub nested notes\n',
    ),
    'photo.png': (
        'image',
        'image/png',
        bytes.fromhex(
            '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4'
            '890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082'
        ),
    ),
    'page.html': (
        'html',
        'text/html',
        b'<!doctype html><html><body>ocu-stub nested page</body></html>',
    ),
    'notes.bin': ('binary', 'application/octet-stream', b'\x00\x01nested-bin'),
}


FILES = {
    'page.html': (
        'text/html; charset=utf-8',
        b"""<!doctype html><html><head><title>ocu-stub page</title>
<link rel="stylesheet" href="style.css"><style>#inline{color:rgb(0,128,0)}</style></head><body>
<p id="inline">ocu-stub page</p><img id="image" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=">
<button id="run" onclick="document.querySelector('#clicked').textContent='clicked'">Run</button>
<span id="clicked"></span><span id="proof"></span>
<script>
let storage='blocked', parentAccess='blocked', cookie='blocked';
try { localStorage.getItem('token'); storage='leaked' } catch {}
try { window.parent.localStorage.getItem('token'); parentAccess='leaked' } catch {}
try { cookie=document.cookie || 'blocked' } catch {}
document.querySelector('#proof').textContent=[self.origin,storage,parentAccess,cookie].join('|');
window.parent.postMessage({type:'fixture-opaque',storage,parentAccess,cookie},'*');
</script></body></html>""",
    ),
    'report.html': ('text/html; charset=utf-8', b'<!doctype html><html><body>ocu-stub report</body></html>'),
    'final.html': ('text/html; charset=utf-8', b'<!doctype html><html><body>ocu-stub final report</body></html>'),
    'diagram.svg': (
        'image/svg+xml',
        b"""<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40">
<text id="proof" y="20">waiting</text><script><![CDATA[
let storage='blocked', parentAccess='blocked', cookie='blocked';
try { localStorage.getItem('token'); storage='leaked' } catch {}
try { window.parent.localStorage.getItem('token'); parentAccess='leaked' } catch {}
try { cookie=document.cookie || 'blocked' } catch {}
document.getElementById('proof').textContent=[self.origin,storage,parentAccess,cookie].join('|');
window.parent.postMessage({type:'fixture-svg',storage,parentAccess,cookie},'*');
]]></script></svg>""",
    ),
    'report.svg': ('image/svg+xml', b'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>'),
    'data.xml': ('application/xml', b'<?xml version="1.0"?><root>ocu-stub</root>'),
    'report.xml': ('application/xml', b'<?xml version="1.0"?><root>ocu-stub-report</root>'),
    'plain.xml': ('text/xml; charset=utf-8', b'<?xml version="1.0"?><root>plain-xml</root>'),
    'page.xhtml': (
        'application/xhtml+xml; charset=UTF-8',
        b'<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body>x</body></html>',
    ),
    'report.xhtml': (
        'application/xhtml+xml; charset=UTF-8',
        b'<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body>r</body></html>',
    ),
    'blob.bin': ('application/octet-stream', b'\x00\x01\x02\x03'),
    'sub/archive': ('text/plain', b'ordinary nested archive filename'),
    'office/source/file': ('text/plain', b'ordinary control-like filename'),
    'style.css': ('text/css', b'#inline { color: rgb(0, 128, 0); }\n'),
    'module.js': ('text/javascript', b'export const resourceProof = "ocu-stub-module";\n'),
    'font.ttf': (
        'font/ttf',
        (Path(__file__).resolve().parent.parent / 'static/assets/fonts/Inter-Variable.ttf').read_bytes(),
    ),
    'report.bin': ('application/octet-stream', b'\x00\x01\x02\x03'),
    'sub/report.bin': ('application/octet-stream', b'nested-bin'),
    'sub/space hash#plus+percent%.html': (
        'text/html; charset=utf-8',
        b'<!doctype html><html><body>encoded</body></html>',
    ),
    'sub/report.html': ('text/html; charset=utf-8', b'<!doctype html><html><body>nested</body></html>'),
    'backend-html403.html': ('TEXT/HTML; charset=utf-8', b'upstream error'),
    'diagram.drawio': (
        'application/xml',
        b"""<mxfile>
<diagram id="combined" name="Combined">
<mxGraphModel math="1">
<root>
<mxCell id="0"/>
<mxCell id="1" parent="0"/>
<mxCell id="ordinary" value="Page one" style="whiteSpace=wrap;" vertex="1" parent="1">
<mxGeometry x="40" y="40" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="and" value="AND"
style="shape=mxgraph.electrical.logic_gates.and;whiteSpace=wrap;"
vertex="1" parent="1">
<mxGeometry x="200" y="40" width="100" height="60" as="geometry"/>
</mxCell>
<mxCell id="phone" value=""
style="shape=image;image=img/telecommunication/Cellphone_128x128.png;aspect=fixed;"
vertex="1" parent="1">
<mxGeometry x="40" y="140" width="80" height="80" as="geometry"/>
</mxCell>
<mxCell id="math" value="$$E=mc^2$$" style="html=1;" vertex="1" parent="1">
<mxGeometry x="160" y="140" width="120" height="40" as="geometry"/>
</mxCell>
</root>
</mxGraphModel>
</diagram>
</mxfile>""",
    ),
}


def nested_names() -> list[str]:
    return list(NESTED_FILES)


def nested_payload(name: str) -> tuple[bytes, str] | None:
    entry = NESTED_FILES.get(name)
    if entry is None:
        return None
    return entry[2], entry[1]


def nested_listing_entry(chat_id: str, name: str, prefix: str, revision: int, fixture_file) -> dict:
    kind, mime, payload = NESTED_FILES[name]
    entry = fixture_file(chat_id, name, revision)
    entry.update(
        file_id=f'fixture-{name}',
        path=name,
        name=name,
        url=f'{prefix}/files/{chat_id}/{quote(name, safe="/")}',
        type=kind,
        mime=mime,
        size=len(payload),
        hash='nested',
    )
    return entry
