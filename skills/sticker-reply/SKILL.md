---
name: sticker-reply
description: Send a reaction sticker from a local library during a conversation, and maintain that library — tag new material from its actual animation, keep one uniform width, rotate cold stickers in, and keep the candidate list from growing the context window. Use when setting up sticker replies, adding or tagging stickers, deciding how often to send them, or debugging a sticker that will not display.
---

# Sticker replies

Send an image from a local library at moments where a person would react, instead of
describing the reaction in words. This skill covers both halves: **sending** (when, how
often, which one) and **curating** (tagging, sizing, rotating, budgeting context).

> **Two placeholders to fill in when installing.** Replace `<KIT>` below with the path to the
> claude-chatgpt-emoji-stickers checkout (for example `~/src/claude-chatgpt-emoji-stickers`). The skill is
> loaded from the skills directory, but the scripts are not: running them relative to the
> current project will fail. If the library itself sits somewhere other than
> `<KIT>/stickers`, also set `STICKER_DIR`. If the client needs delivery B, replace
> `<STICKER_URL>` with the base address the library is served from.

## Sending

Everything below is independent of *how* the image reaches the chat. Use whichever of
these two the client supports — check once, then stick to it.

**A. A tool that puts a local file into the chat** — the best route wherever it exists,
because nothing is uploaded or hosted. Pass an **absolute path with forward slashes**:

```
Claude Code desktop:  SendUserFile({ files: ["C:/path/to/stickers/happy/wave.gif"], status: "normal" })
ChatGPT desktop:      view_image({ path: "C:/path/to/stickers/happy/wave.gif" })
```

Use whichever of these the client actually offers, and prefer it over B. Both were
verified on 2026-09-20: animated GIFs loop in each, and neither needs a file-access
permission to be granted first.

**B. A markdown image** — for clients with no such tool, but which render images in
replies. Write the link inline, on its own line:

```
![](<STICKER_URL>/happy/wave.gif)
```

`<STICKER_URL>` is the base address the library is served from — fill it in when
installing this skill:

- **locally**: run `node <KIT>/scripts/serve-stickers.mjs` and use `http://127.0.0.1:8787`.
  The server binds to loopback only and serves nothing but the sticker files.
- **over HTTPS**, when the client refuses the loopback address (clients served over HTTPS
  treat plain-HTTP images as mixed content; ChatGPT renders an `https://` image inline but
  not `http://127.0.0.1`). The files stay on disk either way — a tunnel such as
  `cloudflared tunnel --url http://localhost:8787` just gives that local server an HTTPS
  address. Publishing the library (object storage, a public repo's raw URL) also works, but
  only for stickers you are entitled to distribute. See the README for the full ladder.

Confirm once before relying on it: ask the assistant to print the line verbatim (not in a
code block) and see whether an image or a link appears.

Verified formats in the Claude Code desktop app: **GIF (animates and loops), PNG, JPG**;
SVG does not render. With a file-send tool, file size does not matter for cost — only the
path is sent, the image never enters the model's context, so one delivery costs roughly
50 tokens (see `docs/findings.md` for the numbers and when they were taken).

### Pick by tag, never by folder

Folders are storage; `stickers/tags.json` is the index. One sticker can carry several
emotions, so always resolve the emotion first and take a candidate from that tag's list.
**Within a tag the list is sorted least-used first**, so taking from the front rotates
the library automatically. Do not send the same sticker twice in one conversation; move
down the list instead.

### How many, and where

The default that survived real use:

- **While working** (running commands, reading files, waiting on results): **one or two
  for the entire stretch** — one when picking up the task, one when something unexpected
  happens. Everything else stays text; a sticker between every tool call is noise the
  reader scrolls past.
- **In the final report**: one at the top, one at the end. Nothing per section.

Tune these numbers for your own taste, but tune them **separately for the working phase
and the reporting phase** — a single global "one every N lines" rule gets the two exactly
backwards, because progress chatter scrolls by while the report is what gets read.

### Cost note that decides where you put them

Bundling a sticker call in the same batch as another tool call is free. A sticker that
occupies a turn by itself makes the model re-read the whole conversation for that turn
(cached, but still billed at a fraction of input). On a long conversation that is a real
cost, so **bundle the working-phase stickers with a tool call**, and accept the extra
turns only for the report's opening and closing ones.

## Curating the library

### Tag animated stickers from the whole animation, not the first frame

Reading a GIF shows only the **first frame**, and the meaning of an animated sticker
usually lives in where the motion goes and how it ends. Tagging from the first frame
produces confident, wrong labels.

```
python <KIT>/scripts/contact-sheet.py          # 8 frames per sticker, laid out in a grid
```

Read the contact sheet, then write the tags. In one 126-sticker audit this corrected 30
tags — including a sticker that opens on a covered face and ends in starry eyes, tagged
"smug" and sent 69 times before anyone looked past frame one.

### One uniform width

```
python <KIT>/scripts/normalize-width.py        # 250 px wide; STICKER_WIDTH=320 to change
```

Originals are copied to `stickers/_originals/` first and every run reads from that copy,
so this is idempotent and reversible. Animation timing and transparency are preserved; the
output always loops (a GIF authored to play once carries no loop flag at all, and looping
is the wanted behaviour for a sticker anyway).

### Rotation without bookkeeping

```
node <KIT>/scripts/count-usage.mjs             # counts real deliveries from session transcripts
node <KIT>/scripts/build-index.mjs             # full list, least-used first within each tag
node <KIT>/scripts/build-index.mjs --check     # validate tagging, formats, dangling entries
```

`count-usage.mjs` reads how many times each sticker was actually delivered out of the
local Claude Code transcripts, so there is no runtime state to keep and nothing to
reset. Sorting each tag by that count is what keeps favourites from being sent into the
ground: the ones you reach for sink, the neglected ones surface.

### Keep the candidate list from growing the context

Pasting the whole library into a system prompt or memory file costs context **that grows
with every sticker you add**. Instead, inject a bounded list at session start:

```
node <KIT>/scripts/build-index.mjs --hook      # only the N coldest per tag (default 5)
```

Wire it as a `SessionStart` hook (see the README). The injected text stays around 4 KB
whatever the library size, and the hook refreshes usage counts in the background so the
next session offers different candidates.

## Debugging

- **Nothing appears** — check the format (SVG never renders) and that the path is
  absolute. In a plain terminal, expect a file card rather than a rendered image. With
  delivery B, check that `serve-stickers.mjs` is still running and that the URL opens in a
  browser; if the link shows as text, the client does not render markdown images.
- **Delivery fails with "does not exist"** — almost always a typo in a hand-typed path.
  Copy entries from the candidate list verbatim instead of retyping them.
- **The same sticker keeps coming up** — usage counts are stale; run `count-usage.mjs`.
  If one sticker is the obvious best answer for a whole tag, that tag is too coarse:
  split it, or the rest of the tag will never get used.
- **"No such file or directory" running a script** — the commands above are relative to
  the kit checkout, not the current project. Use the absolute path filled in at the top.
- **A replaced sticker reverts to the old image** — `normalize-width.py` reads from the
  backup in `_originals/`. It refreshes that backup automatically when the new file is a
  different width; if the new file happens to be exactly the target width, delete its
  backup by hand first.
