# Pixela patentes y deja las fotos listas para las casillas del remito
import sys, os
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
def pix(im, box, blocks=7):
    reg = im.crop(box)
    w, h = reg.size
    small = reg.resize((blocks, max(2, round(blocks * h / w))), Image.BILINEAR)
    im.paste(small.resize((w, h), Image.NEAREST), box[:2])
jobs = [
    ("1.webp", "frente.jpg", [(72, 535, 180, 645)]),
    ("2.webp", "lateral.jpg", []),
    ("3.webp", "trasera.jpg", [(284, 312, 356, 384), (996, 82, 1050, 114)]),
    ("4.jpg", "odometro.jpg", []),
]
for s, d, boxes in jobs:
    im = Image.open(os.path.join(src, s)).convert("RGB")
    for b in boxes:
        pix(im, b)
    im.thumbnail((1000, 1000))
    im.save(os.path.join(dst, d), quality=88)
    print(d, im.size)
