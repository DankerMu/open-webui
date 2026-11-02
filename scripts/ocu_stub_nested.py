"""Deterministic ordinary-file and nested listing fixtures for the OCU stub."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path
from urllib.parse import quote


def _multi_page_pdf(pages: int) -> bytes:
    """A valid PDF whose page N reads "Workspace PDF page N of <pages>"; xref offsets are exact."""
    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [%s] /Count %d >>'
        % (b' '.join(b'%d 0 R' % (4 + 2 * index) for index in range(pages)), pages),
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ]
    for index in range(pages):
        text = b'BT /F1 36 Tf 72 700 Td (Workspace PDF page %d of %d) Tj ET' % (index + 1, pages)
        objects.append(
            b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
            b'/Resources << /Font << /F1 3 0 R >> >> /Contents %d 0 R >>' % (5 + 2 * index)
        )
        objects.append(b'<< /Length %d >>\nstream\n%s\nendstream' % (len(text), text))
    body = bytearray(b'%PDF-1.4\n')
    offsets = []
    for number, content in enumerate(objects, start=1):
        offsets.append(len(body))
        body += b'%d 0 obj\n%s\nendobj\n' % (number, content)
    xref = len(body)
    body += b'xref\n0 %d\n0000000000 65535 f \n' % (len(objects) + 1)
    body += b''.join(b'%010d 00000 n \n' % offset for offset in offsets)
    body += b'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objects) + 1, xref)
    return bytes(body)


def _banded_png(width: int, height: int) -> bytes:
    """An opaque RGB PNG of four vertical colour bands, large enough to see in a screenshot."""
    bands = (b'\x1f\x77\xb4', b'\xff\x7f\x0e', b'\x2c\xa0\x2c', b'\xd6\x27\x28')
    row = b'\x00' + b''.join(bands[x * len(bands) // width] for x in range(width))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

    header = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', header)
        + chunk(b'IDAT', zlib.compress(row * height))
        + chunk(b'IEND', b'')
    )


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
    'reports/chart.png': ('image', 'image/png', _banded_png(320, 200)),
    'reports/manual.pdf': ('pdf', 'application/pdf', _multi_page_pdf(300)),
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
<p id="styled">Relative stylesheet</p><img id="relative-image" src="relative.png" width="64" height="64">
<p id="font">Workspace resource WWW iii 012345</p>
<p id="font-control" style="font:32px monospace;width:max-content">Workspace resource WWW iii 012345</p>
<p id="classic">waiting</p><p id="module">waiting</p><p id="fetch">waiting</p><p id="font-loaded">waiting</p>
<button id="run" onclick="document.querySelector('#clicked').textContent='clicked'">Run</button>
<span id="clicked"></span><span id="proof"></span><span id="denials"></span><span id="expiry"></span>
<button id="deny" onclick="runDenialProbes()">Probe denied execution and writes</button>
<script src="classic.js"></script><script type="module" src="module.js"></script>
<script>
let storage='blocked', parentAccess='blocked', cookie='blocked';
try { localStorage.getItem('token'); storage='leaked' } catch {}
try { window.parent.localStorage.getItem('token'); parentAccess='leaked' } catch {}
try { void document.cookie; cookie='leaked' } catch {}
document.querySelector('#proof').textContent=[self.origin,storage,parentAccess,cookie].join('|');
window.__fixturePosted = Date.now();
window.parent.postMessage({type:'fixture-opaque',storage,parentAccess,cookie},'*');
fetch('data.json').then(response=>response.json()).then(data=>document.querySelector('#fetch').textContent=data.value);
document.fonts.load('32px ResourceFixture').then(faces=>{
  document.querySelector('#font-loaded').textContent=faces.length===1 && faces[0].status==='loaded'?'loaded':'missing';
});
const chat=location.pathname.split('/')[4], nonce='resource-'+Date.now()+'-'+Math.random().toString(16).slice(2);
window.denialProbes=[
  '/api/v1/utils/code/execute?probe='+nonce,
  '/ocu/api/uploads/'+chat+'/resource-proof-'+nonce+'.txt?probe='+nonce,
  '/ocu/terminal/'+chat+'/processes/2147483647/kill?probe='+nonce
];
window.runDenialProbes=()=>Promise.all(window.denialProbes.map((url,index)=>fetch(url,{
  method:'POST',credentials:'omit',headers:{'Content-Type':'text/plain'},
  body:JSON.stringify({code:'print("browser-denial-canary")',language:'python'})
}).then(response=>index===0 && response.status===401?'blocked':'unexpected',()=> 'blocked'))).then(results=>{
  document.querySelector('#denials').textContent=results.join('|');
});
window.probeExpiredResource=async nonce=>{
  const url=new URL('data.json?expiry='+nonce,location.href);
  try {
    await fetch(url,{cache:'no-store',credentials:'omit'});
    document.querySelector('#expiry').textContent='unexpected';
  }
  catch { document.querySelector('#expiry').textContent='blocked'; }
};
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
try { void document.cookie; cookie='leaked' } catch {}
document.getElementById('proof').textContent=[self.origin,storage,parentAccess,cookie].join('|');
window.__fixturePosted = Date.now();
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
    'style.css': (
        'text/css',
        b'#inline { color: rgb(0, 128, 0); }\n'
        b'#styled { color: rgb(17, 34, 51); }\n'
        b'@font-face { font-family: ResourceFixture; src: url("font.ttf") format("truetype"); }\n'
        b'#font { font: 32px ResourceFixture, monospace; width: max-content; }\n',
    ),
    'relative.png': ('image/png', NESTED_FILES['photo.png'][2]),
    'classic.js': ('text/javascript', b'document.querySelector("#classic").textContent="classic-loaded";\n'),
    'module.js': (
        'text/javascript',
        b'export const resourceProof = "ocu-stub-module";\n'
        b'document.querySelector("#module").textContent=resourceProof;\n',
    ),
    'data.json': ('application/json', b'{"value":"relative-fetch-loaded"}\n'),
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
