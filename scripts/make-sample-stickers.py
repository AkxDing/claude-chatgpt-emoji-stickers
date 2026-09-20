# Draw the four placeholder stickers that ship with this repository.
#
#   python scripts/make-sample-stickers.py
#
# They exist so the pipeline can be run end to end before you bring your own material,
# and they are drawn here rather than downloaded so that the repository contains no
# third-party artwork at all — every file in it is covered by the repository's own
# licence. They are deliberately plain; replace them.
#
# Requires Pillow.

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'stickers'
SIZE = 250
FACE = (255, 205, 85)
INK = (120, 85, 55)
DROP = (95, 175, 235)
CONFETTI = [(240, 120, 120), (120, 200, 150), (140, 160, 240), (245, 190, 90)]


def canvas():
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def face(draw, cx=125, cy=125, r=95):
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=FACE)


def eyes(draw, openness=1.0, cx=125, cy=105, dx=35):
    h = max(2, int(16 * openness))
    for sign in (-1, 1):
        x = cx + sign * dx
        draw.ellipse([x - 11, cy - h, x + 11, cy + h], fill=INK)


def smile(draw, cy=150, width=60, depth=28):
    draw.arc([125 - width, cy - depth, 125 + width, cy + depth], start=20, end=160, fill=INK, width=9)


def save(frames, rel, duration):
    path = OUT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=duration, loop=0, disposal=2)
    print(f'{rel}  {len(frames)} frames  ->  {path.stat().st_size // 1024} KB')


def happy():
    frames = []
    for i in range(12):
        img, d = canvas()
        face(d)
        eyes(d, openness=0.15 if i in (6, 7) else 1.0)  # a blink two frames long
        smile(d)
        frames.append(img)
    save(frames, 'happy/smiling-face.gif', 120)


def thinking():
    frames = []
    for i in range(12):
        img, d = canvas()
        face(d)
        eyes(d, openness=0.55)
        d.line([95, 155, 155, 150], fill=INK, width=9)  # flat, unconvinced mouth
        for k in range(3):  # three dots orbiting the temple
            a = math.radians(i * 30 + k * 40)
            d.ellipse([205 + 14 * math.cos(a) - 7, 60 + 14 * math.sin(a) - 7,
                       205 + 14 * math.cos(a) + 7, 60 + 14 * math.sin(a) + 7], fill=INK)
        frames.append(img)
    save(frames, 'thinking/thinking-face.gif', 110)


def nervous():
    frames = []
    for i in range(14):
        img, d = canvas()
        face(d)
        for sign in (-1, 1):  # worried, slanted eyes
            x = 125 + sign * 35
            d.line([x - 14, 98 - sign * 6, x + 14, 104 + sign * 6], fill=INK, width=9)
        d.arc([80, 140, 170, 185], start=200, end=340, fill=INK, width=9)
        drop_y = 60 + i * 9  # a bead of sweat sliding down and fading out
        if drop_y < 170:
            d.ellipse([196, drop_y, 216, drop_y + 28], fill=DROP)
        frames.append(img)
    save(frames, 'nervous/nervous-smile.gif', 110)


def celebrate():
    frames = []
    for i in range(14):
        img, d = canvas()
        face(d, cy=140, r=80)
        eyes(d, openness=1.0, cy=125, dx=30)
        d.chord([85, 150, 165, 200], start=0, end=180, fill=INK)  # open, laughing mouth
        for k, colour in enumerate(CONFETTI * 3):  # confetti thrown outward
            a = math.radians(k * 30 + i * 4)
            dist = 85 + i * 9  # starts clear of the face so the burst reads as thrown, not stuck on
            x, y = 125 + dist * math.cos(a), 125 + dist * math.sin(a) * 0.8
            if 0 < x < SIZE and 0 < y < SIZE:
                d.rectangle([x - 6, y - 6, x + 6, y + 6], fill=colour)
        frames.append(img)
    save(frames, 'celebrate/partying-face.gif', 90)


if __name__ == '__main__':
    happy()
    thinking()
    nervous()
    celebrate()
