"""Builds the subreddit icon and banners in docs/brand from the game's palette and sprite glyphs.

Run from the repo root:  python3 tools/brand/build.py
Needs rsvg-convert (brew install librsvg) for the PNG exports. The SVGs are the editable sources.
The landmark glyphs come from src/client/icons/icons.json (game-icons.net, CC BY 3.0; see ATTRIBUTION.md).
"""
import json, math, pathlib, subprocess
ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs' / 'brand'
ICONS = {k: v['path'] for k, v in json.load(open(ROOT / 'src' / 'client' / 'icons' / 'icons.json')).items()}
C = dict(water='#7fb3d5', deep='#5b93ba', sand='#f1e3c3', land='#d8c39a', ink='#2b2a28', lit='#29804e', paper='#fbf7ee', sheet='#f5ebd4')
MASK = ["001100", "011110", "111111", "111110", "011100", "001100"]

def outline(mask):
    land = {(r, c) for r, row in enumerate(mask) for c, ch in enumerate(row) if ch == '1'}
    edges = {}
    for (r, c) in land:
        if (r - 1, c) not in land: edges[(c, r)] = (c + 1, r)
        if (r, c + 1) not in land: edges[(c + 1, r)] = (c + 1, r + 1)
        if (r + 1, c) not in land: edges[(c + 1, r + 1)] = (c, r + 1)
        if (r, c - 1) not in land: edges[(c, r + 1)] = (c, r)
    start = next(iter(edges)); pts = [start]; cur = edges[start]
    while cur != start:
        pts.append(cur); cur = edges[cur]
    return pts

def island(x0, y0, cell, mask, marks, grid_alpha=0.10):
    pts = outline(mask)
    d = 'M' + ' L'.join(f'{x0 + px * cell:.1f},{y0 + py * cell:.1f}' for px, py in pts) + ' Z'
    s = [f'<path d="{d}" fill="{C["land"]}" stroke="{C["sand"]}" stroke-width="{cell * 0.16:.1f}" stroke-linejoin="round"/>']
    s.append(f'<path d="{d}" fill="none" stroke="{C["ink"]}" stroke-opacity="0.35" stroke-width="{cell * 0.03:.1f}" stroke-linejoin="round"/>')
    # inner cell lines, land only
    for r, row in enumerate(mask):
        for c, ch in enumerate(row):
            if ch == '1':
                s.append(f'<rect x="{x0 + c * cell:.1f}" y="{y0 + r * cell:.1f}" width="{cell}" height="{cell}" fill="none" stroke="{C["ink"]}" stroke-opacity="{grid_alpha}" stroke-width="{cell * 0.02:.1f}"/>')
    for name, (r, c) in marks.items():
        k = cell * 0.78 / 512
        tx = x0 + c * cell + cell * 0.11; ty = y0 + r * cell + cell * 0.11
        s.append(f'<path transform="translate({tx:.1f},{ty:.1f}) scale({k:.5f})" d="{ICONS[name]}" fill="{C["ink"]}"/>')
    return '\n'.join(s)

def water_grid(w, h, cell, alpha):
    s = []
    for x in range(0, w + 1, cell): s.append(f'<line x1="{x}" y1="0" x2="{x}" y2="{h}" stroke="#fff" stroke-opacity="{alpha}" stroke-width="2"/>')
    for y in range(0, h + 1, cell): s.append(f'<line x1="0" y1="{y}" x2="{w}" y2="{y}" stroke="#fff" stroke-opacity="{alpha}" stroke-width="2"/>')
    return '\n'.join(s)

def compass(cx, cy, r):
    pts = []
    for i in range(8):
        a = math.pi / 4 * i - math.pi / 2
        rr = r if i % 2 == 0 else r * 0.38
        pts.append(f'{cx + rr * math.cos(a):.1f},{cy + rr * math.sin(a):.1f}')
    return (f'<polygon points="{" ".join(pts)}" fill="{C["paper"]}" stroke="{C["ink"]}" stroke-width="{r*0.08:.1f}" stroke-linejoin="round"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r*0.14:.1f}" fill="{C["ink"]}"/>')

def icon():
    W = 1024; cell = 112; g = 6 * cell; x0 = (W - g) / 2; y0 = (W - g) / 2 + 8
    marks = {'lighthouse': (0, 3), 'fort': (2, 3), 'windmill': (3, 1)}
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{W}" viewBox="0 0 {W} {W}">
<defs><radialGradient id="sea" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="{C["water"]}"/><stop offset="1" stop-color="{C["deep"]}"/></radialGradient></defs>
<rect width="{W}" height="{W}" fill="url(#sea)"/>
{water_grid(W, W, cell, 0.16)}
{island(x0, y0, cell, MASK, marks)}
{compass(796, 226, 60)}
</svg>'''

def sheet(x, y, w, h, lines, font, rot=-2.5):
    s = [f'<g transform="rotate({rot} {x + w/2} {y + h/2})">',
         f'<rect x="{x+6}" y="{y+8}" width="{w}" height="{h}" rx="6" fill="{C["ink"]}" fill-opacity="0.18"/>',
         f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{C["sheet"]}" stroke="{C["ink"]}" stroke-opacity="0.5" stroke-width="2"/>']
    for i, text in enumerate(lines):
        ly = y + h * (0.36 + 0.34 * i)
        s.append(f'<path d="M{x + 22} {ly - 2} l 9 9 l 18 -20" fill="none" stroke="{C["lit"]}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>')
        s.append(f'<text x="{x + 60}" y="{ly + 8}" font-family="Georgia, serif" font-size="{font}" fill="{C["ink"]}">{text}</text>')
    s.append('</g>')
    return '\n'.join(s)

def banner(W, H, layout):
    L = layout
    marks = {'lighthouse': (0, 3), 'fort': (2, 3), 'windmill': (3, 1), 'temple': (4, 2)}
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
<defs><linearGradient id="sea" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{C["water"]}"/><stop offset="1" stop-color="{C["deep"]}"/></linearGradient></defs>
<rect width="{W}" height="{H}" fill="url(#sea)"/>
{water_grid(W, H, L['gcell'], 0.12)}
<text x="{L['tx']}" y="{L['ty']}" font-family="Georgia, serif" font-weight="bold" font-size="{L['tsize']}" fill="{C["ink"]}">Cartographer</text>
<text x="{L['tx'] + 4}" y="{L['ty'] + L['tsize'] * 0.62}" font-family="Georgia, serif" font-size="{L['tsize'] * 0.28:.0f}" letter-spacing="{L['tsize'] * 0.05:.1f}" fill="{C["ink"]}" fill-opacity="0.9">A DAILY ISLAND DEDUCTION PUZZLE</text>
{sheet(L['sx'], L['sy'], L['sw'], L['sh'], ['The lighthouse stands on the north shore', 'The windmill lies west of the fort'], L['sfont'])}
{island(L['ix'], L['iy'], L['icell'], MASK, marks, 0.12)}
{compass(L['cx'], L['cy'], L['cr'])}
</svg>'''

OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'icon.svg').write_text(icon())
(OUT / 'banner-1920x384.svg').write_text(banner(1920, 384, dict(gcell=64, tx=120, ty=186, tsize=104, sx=950, sy=112, sw=490, sh=160, sfont=21, ix=1500, iy=48, icell=48, cx=1830, cy=78, cr=30)))
(OUT / 'banner-1600x480.svg').write_text(banner(1600, 480, dict(gcell=64, tx=120, ty=214, tsize=100, sx=130, sy=300, sw=500, sh=150, sfont=21, ix=1150, iy=72, icell=56, cx=1520, cy=90, cr=34)))
for size in (1024, 512, 256):
    subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), OUT / 'icon.svg', '-o', OUT / f'icon-{size}.png'], check=True)
for name in ('banner-1920x384', 'banner-1600x480'):
    subprocess.run(['rsvg-convert', OUT / f'{name}.svg', '-o', OUT / f'{name}.png'], check=True)
print('wrote', sorted(p.name for p in OUT.iterdir()))
