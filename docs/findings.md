# Measured results

Everything here was measured in the **Claude Code desktop app on Windows** during daily
use, not inferred. Where a result is untested it says so, and each section carries the
date it was measured. The app version was not recorded, which matters: rendering behaviour
and billing details can change between releases, so treat anything older than a few months
as worth re-checking.

## Rendering

Formats measured 2026-09-08; reply-body behaviour measured 2026-09-18.

| What | Result |
|---|---|
| `SendUserFile` with GIF | Renders and loops the animation |
| `SendUserFile` with PNG / JPG | Renders; oversized images are scaled down to fit |
| `SendUserFile` with SVG | Does not render |
| Markdown image with a `data:` URI in the reply body | Renders |
| Markdown image with an external URL in the reply body | Did not render in the version tested |
| Raw `<img>` HTML in the reply body | Shown as literal text |
| Any image in the reply body | **Always takes its own line**; it cannot be placed inline inside a sentence |
| WebP, APNG | Untested |

Consequence: in-sentence reactions have to be emoji or kaomoji. Images are for stickers
(cards) and for standalone figures, never for punctuation inside a line.

## Cost

Measured 2026-09-08 (base64 limits) and 2026-09-18 (per-turn cost).

| Path | Cost |
|---|---|
| `SendUserFile` delivery | ~50 tokens — only the path is sent; the image never enters the model context, so file size is irrelevant |
| A sticker bundled with another tool call | Free beyond those ~50 tokens |
| A sticker occupying its own turn | Adds one full turn: the conversation is re-read for that turn (cached, billed at a fraction of input). On a 100k-token conversation this is the dominant cost of sending stickers |
| Hand-drawn SVG inlined as base64 | 150–400 tokens |
| A real photo or sticker inlined as base64 | 7,000–17,000 tokens — never do this |

Base64 inlining is also fragile: it is generated character by character, and a single
wrong character corrupts everything after it. Measured: 500 and 780 characters fine,
2,732 characters corrupted. Keep inlined images under ~1,200 base64 characters.

## Library statistics that motivated the design

One library, counted from session transcripts on 2026-09-18: 136 stickers, 1,393
deliveries. (The tagging audit below was run the same day, when the library held 126
stickers; ten more were added afterwards.)

- The **top 7 stickers accounted for 38%** of all deliveries.
- **36 stickers had never been sent once.**
- The busiest emotion tag averaged **48 deliveries per sticker**; the quietest averaged 5.
- **~85 deliveries pointed at files that did not exist** — almost all typos in hand-typed
  paths, plus a few renamed files. Copy paths from the candidate list; do not retype them.
- Tagging animated stickers from their first frame produced **30 wrong tags out of 126**
  (24%), found by re-reviewing every sticker as an 8-frame contact sheet.

## Index size

Measured 2026-09-20 on the same 136-sticker library.

| Approach | Size | Grows with library? |
|---|---|---|
| Full list pasted into a prompt or memory file | 8.9 KB | Yes — linearly |
| `build-index.mjs --hook`, 5 coldest per tag | ~3.9 KB | No — bounded by tag count |

## Density

Settled 2026-09-20. A single global rule ("one sticker every N lines") was tried first and
produced the opposite of what was wanted: many stickers during tool calls, few in the
final report. The rule that replaced it splits the two phases — one or two stickers for an
entire working stretch (picking up the task, hitting something unexpected), and exactly
two in the report (opening, closing). An intermediate version also put one under every
section heading; it was dropped the same day, once the per-turn cost above was understood.
