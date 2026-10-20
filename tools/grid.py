import glob, os, sys
from PIL import Image, ImageDraw
fs = sorted(glob.glob('/tmp/grid/*.png')); S = .36; pad = 14; W = 2600
ims = [(os.path.basename(f)[3:-4].replace('_', ' ') + '%', Image.open(f).convert('RGB')) for f in fs]
ims = [(l, i.resize((int(i.width * S), int(i.height * S)), Image.LANCZOS)) for l, i in ims]
x = y = pad; rh = 0; pos = []
for l, i in ims:
    if x + i.width > W: x = pad; y += rh + 30; rh = 0
    pos.append((x, y)); x += i.width + pad; rh = max(rh, i.height)
G = Image.new('RGB', (W, y + rh + 34), (236, 230, 244)); d = ImageDraw.Draw(G)
for (l, i), (x, y) in zip(ims, pos): G.paste(i, (x, y)); d.text((x, y + i.height + 4), l, fill=(58, 26, 90))
G.save(sys.argv[1] if len(sys.argv) > 1 else '/workspace/shots/glp1life/device-grid.png'); print(len(ims), 'tiles')
