# Build a contact sheet for every animated sticker: 8 frames sampled evenly across the
# animation, laid out in a grid and labelled with their frame numbers.
#
#   python scripts/contact-sheet.py            all stickers -> contact-sheets/
#   python scripts/contact-sheet.py happy/wave.gif   just one
#
# Why this exists: an assistant reading a GIF only sees the FIRST FRAME, and the meaning
# of an animated sticker usually lives in where the motion goes and how it ends. Tagging
# from the first frame produces confident, wrong labels. In one real audit of a
# 126-sticker library, 30 tags were wrong this way — including a "moved to tears" sticker
# that had been sent 69 times as "smug" because it opens on a covered face.
#
# Requires Pillow:  pip install pillow

import os
import sys
from pathlib import Path

from PIL import Image, ImageSequence, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
STICKER_DIR = Path(os.environ.get('STICKER_DIR', ROOT / 'stickers'))
# Sheets always land in the repository, even when the library lives elsewhere.
OUT_DIR = ROOT / 'contact-sheets'
FRAMES = 8
THUMB_W = 200
LABEL_H = 18
SKIP_DIRS = {'_originals'}
EXTS = {'.gif', '.png', '.jpg', '.jpeg'}


def targets(argv):
    if not STICKER_DIR.is_dir():
        sys.exit(f'Sticker library not found: {STICKER_DIR}\n'
                 f'Set STICKER_DIR, or run this from the repository root.')
    if argv:
        picked = [STICKER_DIR / a for a in argv]
        for p in picked:
            if not p.is_file():
                sys.exit(f'No such sticker: {p}')
        return picked
    out = []
    for folder in sorted(p for p in STICKER_DIR.iterdir() if p.is_dir() and p.name not in SKIP_DIRS):
        out += sorted(p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in EXTS)
    return out


def contact_sheet(path):
    im = Image.open(path)
    n = getattr(im, 'n_frames', 1)
    wanted = sorted({round(i * (n - 1) / (FRAMES - 1)) for i in range(FRAMES)}) if n > 1 else [0]

    shots = []
    for i, frame in enumerate(ImageSequence.Iterator(im)):
        if i in wanted:
            rgba = frame.convert('RGBA')
            h = round(rgba.size[1] * THUMB_W / rgba.size[0])
            rgba = rgba.resize((THUMB_W, h))
            flat = Image.new('RGB', (THUMB_W, h), 'white')  # flatten so transparency stays readable
            flat.paste(rgba, mask=rgba)
            shots.append((i, flat))

    if not shots:  # truncated or corrupt file: n_frames lied, or the iterator gave nothing
        raise ValueError('no readable frames')

    cell_h = shots[0][1].size[1]
    cols = 4
    rows = (len(shots) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * (THUMB_W + 4), rows * (cell_h + LABEL_H)), '#dddddd')
    draw = ImageDraw.Draw(sheet)
    for k, (i, img) in enumerate(shots):
        x = (k % cols) * (THUMB_W + 4)
        y = (k // cols) * (cell_h + LABEL_H)
        sheet.paste(img, (x, y + LABEL_H - 2))
        draw.text((x + 2, y + 2), f'#{i + 1}/{n}', fill='black')

    out = OUT_DIR / (path.relative_to(STICKER_DIR).as_posix().replace('/', '__').rsplit('.', 1)[0] + '.png')
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    return out, n


if __name__ == '__main__':
    failed = 0
    for p in targets(sys.argv[1:]):
        try:
            out, n = contact_sheet(p)
            print(f'{p.relative_to(STICKER_DIR).as_posix()}  {n} frames  ->  {out.relative_to(ROOT).as_posix()}')
        except Exception as exc:  # one broken file must not stop the batch
            failed += 1
            print(f'{p.name}  SKIPPED: {exc}')
    if failed:
        sys.exit(f'{failed} sticker(s) could not be processed.')
