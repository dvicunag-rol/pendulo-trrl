#!/usr/bin/env python3
"""Genera www/index.html (archivo único, sin internet) a partir de src/."""
import base64, json, pathlib
R = pathlib.Path(__file__).parent
A = R / 'src' / 'assets'
meta = json.loads((A / 'meta.json').read_text(encoding='utf8'))
b64 = lambda f: base64.b64encode((A / f).read_bytes()).decode()
txt = lambda f: (A / f).read_text(encoding='utf8')
assets = {
    'km': {'styles': txt('km_styles.xml'), 'theme': txt('km_theme.xml'), **meta['km']},
    'pu': {'styles': txt('pu_styles.xml'), 'theme': txt('pu_theme.xml'), **meta['pu']},
    'ositran': b64('ositran.png'), 'apsaPng': b64('apsa.png'), 'apsaJpg': b64('apsa.jpg'),
}
js_assets = 'const ASSETS = ' + json.dumps(assets, ensure_ascii=False).replace('</', '<\\/') + ';'
t = (R / 'src' / 'index.template.html').read_text(encoding='utf8')
out = (t.replace('/*CSS*/', (R / 'src' / 'style.css').read_text(encoding='utf8'))
        .replace('/*ASSETS*/', js_assets)
        .replace('/*XLSX*/', (R / 'src' / 'xlsx.js').read_text(encoding='utf8'))
        .replace('/*DOCX*/', (R / 'src' / 'docx.js').read_text(encoding='utf8'))
        .replace('/*APP*/', (R / 'src' / 'app.js').read_text(encoding='utf8')))
(R / 'www').mkdir(exist_ok=True)
(R / 'www' / 'index.html').write_text(out, encoding='utf8')
print('www/index.html', len(out) // 1024, 'KB')
