# Arma hojas de contacto con número y título debajo de cada pantalla
import sys
from PIL import Image, ImageDraw, ImageFont
out, title, items = sys.argv[1], sys.argv[2], sys.argv[3:]
W, H, PAD, CAP = 540, 960, 30, 90
font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 26)
tfont = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 40)
n = len(items) // 2
sheet = Image.new("RGB", (PAD + n * (W + PAD), 90 + H + CAP + PAD), (8, 9, 12))
d = ImageDraw.Draw(sheet)
d.text((PAD, 25), title, fill=(245, 166, 35), font=tfont)
for i in range(n):
    img = Image.open(items[2 * i]).convert("RGB").resize((W, H), Image.LANCZOS)
    x = PAD + i * (W + PAD)
    sheet.paste(img, (x, 90))
    d.rectangle([x - 1, 89, x + W, 90 + H], outline=(52, 58, 77), width=2)
    d.text((x, 90 + H + 18), items[2 * i + 1], fill=(232, 234, 242), font=font)
sheet.save(out)
