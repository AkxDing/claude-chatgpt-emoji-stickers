# Resize every sticker to a uniform width so no single image dominates the chat.
# Originals are copied to stickers/_originals/ first, and every run reads from that copy,
# so the script is idempotent and the resize is always reversible.
#
#   python scripts/normalize-width.py                 all stickers
#   python scripts/normalize-width.py happy/wave.gif  just one
#   STICKER_WIDTH=320 python scripts/normalize-width.py
#
# Animation timing and transparency are preserved. Note that the output always loops
# forever: a GIF that was authored to play once has no loop flag at all, and there is no
# way to tell that apart from "not recorded" — looping is the wanted behaviour for
# stickers anyway.
#
# Swapping material: if you drop a NEW image at a path that has already been normalized,
# the backup in _originals/ is refreshed automatically (detected by width). Only if the
# new image happens to be exactly WIDTH pixels wide will the old backup be kept, in which
# case delete that backup by hand.
#
# Requires Pillow.

import os
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parent.parent
STICKER_DIR = Path(os.environ.get('STICKER_DIR', ROOT / 'stickers'))
ORIGINALS = STICKER_DIR / '_originals'
WIDTH = int(os.environ.get('STICKER_WIDTH', 250))
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


def normalize(path):
    rel = path.relative_to(STICKER_DIR)
    backup = ORIGINALS / rel
    current_width = Image.open(path).size[0]

    # Always reading from the backup is what makes this idempotent, but it also means a
    # stale backup would silently overwrite a NEW sticker dropped at the same path — the
    # most natural thing a user does when swapping material. If what is on disk is not the
    # output of a previous run (its width differs), treat it as new and refresh the backup.
    if not backup.exists() or current_width != WIDTH:
        backup.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, backup)

    before = backup.stat().st_size
    im = Image.open(backup)
    height = round(im.size[1] * WIDTH / im.size[0])

    if path.suffix.lower() == '.gif' and getattr(im, 'n_frames', 1) > 1:
        frames, durations = [], []
        for frame in ImageSequence.Iterator(im):
            frames.append(frame.convert('RGBA').resize((WIDTH, height), Image.LANCZOS))
            durations.append(frame.info.get('duration', 100) or 100)
        frames[0].save(path, save_all=True, append_images=frames[1:], duration=durations,
                       loop=im.info.get('loop', 0), disposal=2, optimize=False)
    else:
        # JPEG has no alpha channel; handing it an RGBA image raises OSError, and a
        # transparent PNG saved as .jpg is a common thing to find in a downloaded pack.
        if path.suffix.lower() in ('.jpg', '.jpeg'):
            mode = 'RGB'
        else:
            mode = 'RGBA' if im.mode in ('RGBA', 'P', 'LA') else 'RGB'
        im.convert(mode).resize((WIDTH, height), Image.LANCZOS).save(path)

    return rel.as_posix(), height, before, path.stat().st_size


if __name__ == '__main__':
    failed = 0
    for p in targets(sys.argv[1:]):
        try:
            rel, h, before, after = normalize(p)
            print(f'{rel}  ->  {WIDTH}x{h}  {before // 1024} KB -> {after // 1024} KB')
        except Exception as exc:  # one broken file must not abandon the rest half-done
            failed += 1
            print(f'{p.name}  SKIPPED: {exc}')
    if failed:
        sys.exit(f'{failed} sticker(s) could not be processed.')
