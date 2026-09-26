# 下載官方卡圖並縮小為 webp，存到 img/cards/（讓 GitHub Pages 直接提供圖片）
# 用法: python3 tools/download-images.py   （需要 Pillow）
import io, json, re, subprocess, pathlib
from PIL import Image

root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'js/data/images.js').read_text()
ids = json.loads(re.search(r'IMAGE_IDS = (\{.*\});', src).group(1))
out = root / 'img/cards'
out.mkdir(parents=True, exist_ok=True)
for cid, num in ids.items():
    dst = out / f'{cid}.webp'
    if dst.exists():
        continue
    url = f'https://asia.pokemon-card.com/tw/card-img/tw{num:08d}.png'
    data = subprocess.run(['curl', '-sS', '--fail', '--retry', '3', url], capture_output=True, check=True).stdout
    im = Image.open(io.BytesIO(data)).convert('RGB')
    im = im.resize((400, round(im.height * 400 / im.width)), Image.LANCZOS)
    im.save(dst, 'WEBP', quality=78, method=6)
print('done', len(list(out.glob('*.webp'))))
