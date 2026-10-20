# Adaptive / maskable icons for GLP1 Life. Leaf sits inside the 66% safe zone (~56% of canvas).
import cairosvg, io
from PIL import Image, ImageDraw
LEAF = open('logo-white.svg').read()
MONO = LEAF.replace('#e9d8ff', '#fff').replace('#7be0a3', '#fff')
def svg(s, px): return Image.open(io.BytesIO(cairosvg.svg2png(bytestring=s.encode(), output_width=px, output_height=px))).convert('RGBA')
def gradient(px):
    a, b = (91, 42, 134), (46, 157, 91); im = Image.new('RGBA', (px, px)); d = ImageDraw.Draw(im)
    for y in range(px):
        for_t = y / (px - 1); t = max(0, for_t - .35) / .65 * .8  # mostly purple, green glow at the bottom
        d.line([(0, y), (px, y)], fill=tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3)) + (255,))
    return im
def compose(px, leaf_frac=.6, bg=True, mono=False):
    im = gradient(px) if bg else Image.new('RGBA', (px, px), (0, 0, 0, 0))
    s = int(px * leaf_frac); lf = svg(MONO if mono else LEAF, s); im.alpha_composite(lf, ((px - s) // 2, (px - s) // 2)); return im
# PWA: maskable (safe zone) + any
for px in (192, 512):
    compose(px).save(f'icon-{px}.png'); compose(px).save(f'icons/maskable-{px}.png')
    a = compose(px, .64); m = Image.new('L', (px, px), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, px - 1, px - 1], radius=px // 5, fill=255); a.putalpha(m); a.save(f'icons/any-{px}.png')
compose(180).convert('RGB').save('icons/apple-touch-icon.png')
# Android adaptive layers at 108dp per density
for name, dp in {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}.items():
    c = int(108 * dp)
    import os; os.makedirs(f'icons/android/mipmap-{name}', exist_ok=True)
    gradient(c).save(f'icons/android/mipmap-{name}/ic_launcher_background.png')
    compose(c, .6, bg=False).save(f'icons/android/mipmap-{name}/ic_launcher_foreground.png')
    compose(c, .6, bg=False, mono=True).save(f'icons/android/mipmap-{name}/ic_launcher_monochrome.png')
    L = int(48 * dp); full = compose(c, .6).resize((L, L), Image.LANCZOS)  # legacy (pre-Android 8) square + round
    full.save(f'icons/android/mipmap-{name}/ic_launcher.png')
    r = full.copy(); mk = Image.new('L', (L, L), 0); ImageDraw.Draw(mk).ellipse([0, 0, L - 1, L - 1], fill=255); r.putalpha(mk); r.save(f'icons/android/mipmap-{name}/ic_launcher_round.png')
# preview grid: full-bleed, circle, squircle, rounded square, teardrop, themed mono
P = 220; base = compose(P * 2, .6).resize((P, P), Image.LANCZOS); mono = compose(P * 2, .6, bg=False, mono=True).resize((P, P), Image.LANCZOS)
def mask(kind):
    m = Image.new('L', (P, P), 0); d = ImageDraw.Draw(m)
    if kind == 'circle': d.ellipse([0, 0, P - 1, P - 1], fill=255)
    elif kind == 'squircle': d.rounded_rectangle([0, 0, P - 1, P - 1], radius=int(P * .38), fill=255)
    elif kind == 'rounded': d.rounded_rectangle([0, 0, P - 1, P - 1], radius=int(P * .18), fill=255)
    elif kind == 'teardrop': d.rounded_rectangle([0, 0, P - 1, P - 1], radius=int(P * .5), fill=255); d.rectangle([P // 2, P // 2, P, P], fill=255)
    else: d.rectangle([0, 0, P, P], fill=255)
    return m
from PIL import ImageFont
g = Image.new('RGB', (4 * (P + 40) + 40, 2 * (P + 70) + 40), (247, 244, 251)); dr = ImageDraw.Draw(g)
items = [('full canvas', None, base), ('circle', 'circle', base), ('squircle', 'squircle', base), ('rounded square', 'rounded', base), ('teardrop', 'teardrop', base), ('themed (mono)', 'circle', None), ('safe zone 66%', None, base), ('small 48px', 'circle', base)]
for i, (lab, k, im) in enumerate(items):
    x, y = 40 + (i % 4) * (P + 40), 30 + (i // 4) * (P + 70)
    if lab.startswith('themed'): tile = Image.new('RGBA', (P, P), (225, 232, 210, 255)); mm = mono.copy(); px = mm.load()
    if lab.startswith('themed'):
        for yy in range(P):
            for xx in range(P):
                if px[xx, yy][3]: px[xx, yy] = (60, 80, 30, px[xx, yy][3])
        tile.alpha_composite(mm); im2 = tile
    else: im2 = im.copy()
    if lab == 'small 48px': im2 = im2.resize((48, 48), Image.LANCZOS).resize((P, P), Image.NEAREST)
    if lab.startswith('safe'): im2 = im2.copy(); ImageDraw.Draw(im2).ellipse([P * .17, P * .17, P * .83, P * .83], outline=(255, 255, 0, 255), width=3)
    if k: im2.putalpha(mask(k))
    g.paste(im2, (x, y), im2); dr.text((x, y + P + 10), lab, fill=(60, 30, 90))
g.save('/workspace/shots/glp1life/icon-preview.png'); print('ok')
