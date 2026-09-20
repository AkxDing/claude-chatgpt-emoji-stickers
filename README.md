<div align="right"><strong>English</strong> · <a href="README.zh-CN.md">简体中文</a></div>

# Sticker replies for Claude Code

Give your AI assistant a sticker library it can actually use: it picks one by emotion and
sends it into the chat, the way a person drops a reaction GIF. This repo is the **plumbing
and the discipline**, not the artwork — a skill file, five maintenance scripts, and the
rules that came out of running this every day.

![A real Claude Code session in Chinese: the assistant sends an anime reaction sticker, writes a line of chat, then sends a second sticker as it starts working](docs/images/real-session.png)

*A real session (in Chinese). The stickers there come from the author's own private
library and are **not** included in this repo — see [bring your own stickers](#bring-your-own-stickers).*

Delivery is verified in the **Claude Code desktop app**. The skill itself is written in the
portable [Agent Skills](https://github.com/anthropics/skills) `SKILL.md` format that Codex,
ChatGPT, Cursor and Gemini CLI also read, but those harnesses have no equivalent file-send
tool — see [which harnesses can do this](#which-harnesses-can-do-this) before expecting it
to work everywhere.

## What is in here

```
skills/sticker-reply/SKILL.md      the skill: when to send, how many, how to curate
scripts/build-index.mjs            candidate list; --check validates; --hook bounds the size
scripts/count-usage.mjs            real delivery counts from local session transcripts
scripts/contact-sheet.py           8 frames per animated sticker, so you tag the whole motion
scripts/normalize-width.py         uniform width, reversible, animation-safe
scripts/serve-stickers.mjs         loopback HTTP server, for clients without a file-send tool
scripts/make-sample-stickers.py    draws the four placeholder stickers
stickers/tags.json                 emotion vocabulary + per-sticker tags
docs/findings.md                   measured rendering and cost results behind the rules
```

**Requirements**: Node 18+, Python 3.8+ with [Pillow](https://pillow.readthedocs.io/)
(image scripts only). No other dependencies, nothing to sign up for, nothing phones home.

## What is actually hard about this

Sending an image is one line. Everything that makes it *not annoying* is the hard part,
and it is what this repo encodes:

**Animated stickers cannot be tagged from their first frame.** An assistant reading a GIF
sees frame one only, while the meaning lives in where the motion goes and how it ends.
Auditing a library at 126 stickers this way corrected **30 wrong tags**, including one
that opens on a covered face and ends in starry eyes — tagged "smug", sent 69 times,
actually "moved to tears". `contact-sheet.py` samples 8 frames into one image so you tag
what the sticker really does:

![Eight frames of one animated sticker in a grid, each labelled with its frame number](docs/images/contact-sheet-example.png)

**Favourites get sent into the ground.** In that same library the top 7 stickers accounted
for **38% of 1,393 deliveries** while 36 stickers had never been sent once.
`count-usage.mjs` counts real deliveries straight out of the local session transcripts —
no runtime bookkeeping, nothing to reset — and every tag is sorted least-used first, so
neglected stickers surface and favourites sink.

**The index quietly eats your context window.** Pasting the library into a system prompt
or memory file costs tokens *that grow with every sticker you add*: 136 stickers came to
8.9 KB, and a few hundred would be unusable. `build-index.mjs --hook` injects only the
coldest few per tag at session start — **about 4 KB whatever the library size** — and
refreshes the counts in the background so the next session gets different candidates.

**One oversized sticker wrecks the reading flow.** `normalize-width.py` takes the whole
library to a uniform width, preserving animation timing and transparency, with originals
backed up so it stays reversible.

**Density is two different problems.** A single "one sticker every N lines" rule gets it
backwards: progress chatter scrolls past, the final report is what gets read. The skill
ships the split that survived real use — one or two for an entire working stretch, one at
the top and one at the end of the report.

## Install

```bash
git clone https://github.com/AkxDing/claude-emoji-stickers.git
cd claude-emoji-stickers
```

Pillow, in a virtual environment (recent macOS, Debian and Ubuntu refuse `pip install`
into the system Python under [PEP 668](https://peps.python.org/pep-0668/)):

```bash
python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install pillow
```

`pipx`, `uv`, `brew install pillow` or `apt install python3-pil` work just as well.

Install the skill:

```bash
# macOS / Linux
mkdir -p ~/.claude/skills && cp -r skills/sticker-reply ~/.claude/skills/
```

```powershell
# Windows PowerShell
New-Item -ItemType Directory -Force "$HOME\.claude\skills" | Out-Null
Copy-Item -Recurse skills\sticker-reply "$HOME\.claude\skills\"
```

Open `~/.claude/skills/sticker-reply/SKILL.md` and replace `<KIT>` at the top with the
path you cloned into — the skill is loaded from the skills directory but the scripts live
in the checkout, so the assistant needs to know where that is.

Check that it runs against the bundled placeholder stickers:

```bash
node scripts/build-index.mjs --check
```

Then bring your own material (below) and run:

```bash
python scripts/normalize-width.py       # one uniform width
node scripts/build-index.mjs --check    # validate tags, formats, dangling entries
node scripts/count-usage.mjs            # Claude Code only; enables cold-first rotation
```

### Keep the candidate list bounded (recommended)

Add a `SessionStart` hook so each session gets a fresh, size-capped candidate list. For
Claude Code, in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "node /path/to/scripts/build-index.mjs --hook", "timeout": 15 }] }
    ]
  }
}
```

The hook prints the list (a few KB, including the absolute path of your library) and
kicks off a usage refresh in the background — that refresh is asynchronous and can take
tens of seconds on a machine with a long history, but it never blocks the session.

A hook process does **not** inherit environment variables from your shell: if your library
lives outside the repo, set `STICKER_DIR` inside the `command` itself. On a harness without
hooks, run the same command by hand and paste its output into whatever file is loaded at
the start of a conversation.

## Bring your own stickers

The twelve samples in `stickers/` are [Fluent Emoji](https://github.com/microsoft/fluentui-emoji)
by Microsoft, MIT licensed (see `NOTICE`) — there to prove the pipeline runs end to end.
`make-sample-stickers.py` additionally draws a few plain animated GIFs if you want
something animated to try the contact-sheet workflow on.

Replace them: standard emoji make a poor sticker library, because the whole point is a
reaction with a face and a motion behind it. Reaction GIFs are easy to find on [giphy.com](https://giphy.com) and
[tenor.com](https://tenor.com); pick a look you like and keep it consistent, because a
library built around one coherent character reads far better than a pile of unrelated
memes. **Whatever you collect is yours to sort out licence-wise** — reaction GIFs are
usually derived from copyrighted works, which is fine for private use and is not something
to redistribute in a public repository.

Then, per sticker:

1. Drop the file into any folder under `stickers/` (folders are storage only).
2. `python scripts/contact-sheet.py <folder>/<file>` and look at the 8 frames.
3. Add `"<folder>/<file>": ["tag", "tag"]` to `stickers/tags.json`, using tags from
   `_vocabulary`.
4. `python scripts/normalize-width.py <folder>/<file>`
5. `node scripts/build-index.mjs --check`

Retrieval goes through tags, never folders, so one sticker can serve several emotions.

### Settings

| Variable | Default | What it does |
|---|---|---|
| `STICKER_DIR` | `<repo>/stickers` | Where the library lives. Set it when you keep stickers outside the repo — all five scripts read it |
| `STICKER_WIDTH` | `250` | Target width for `normalize-width.py` |
| `STICKER_HOOK_TOP` | `5` | How many stickers per tag `--hook` injects |
| `CLAUDE_PROJECTS_DIR` | `~/.claude/projects` | Where `count-usage.mjs` looks for transcripts |

### Privacy

`count-usage.mjs` reads your local Claude Code transcripts, but it only ever extracts the
image paths passed to `SendUserFile` and how often each occurred. No conversation text, no
other tool arguments, no file contents. Its output, `stickers/usage.json`, is a plain
`{path: count}` map and is gitignored.

## Will this work in my client?

The library, tagging and rotation are just files and scripts — they work anywhere. The
only thing a client has to provide is **a way to show an image**, and there are two:

**A. A file-send tool.** Claude Code's desktop app has `SendUserFile`. Verified: GIF
animates and loops, PNG and JPG render, SVG does not. Costs ~50 tokens per sticker
because only the path is sent.

**B. Rendering a markdown image.** Most chat clients do this. Run the bundled loopback
server and the assistant just writes `![](http://127.0.0.1:8787/happy/wave.gif)`:

```bash
node scripts/serve-stickers.mjs
```

No account, no subscription, no public hosting, no dependencies — it binds to 127.0.0.1
and serves nothing but the sticker files.

**The one-minute check** for any client: start the server, paste
`![](http://127.0.0.1:8787/celebrate/party-popper.png)` into a message yourself. If you
see the image, that client can do this. If you see a link, it cannot.

Known so far: **Claude Code desktop** — A works, B does not (it blocks external image
URLs in replies). **A plain terminal** — expect a file card or a bare link. Everything
else is untested; please
[open an issue](https://github.com/AkxDing/claude-emoji-stickers/issues) with your client
and what you saw, and this section will grow into a real table.

> ChatGPT specifically: it reads `SKILL.md`, but has no file-send tool, and its MCP
> support connects to **remote HTTPS** servers only — no local stdio — plus a paid plan
> and developer mode. So delivery B via a client that renders images is the realistic
> route there, not MCP.

## Contributing

Adding a harness to that table is the most useful contribution. Please say which harness
and version you tested, whether animation plays, and include a screenshot. Bug reports
that include your OS, Node and Pillow versions get fixed faster.

---

MIT licensed. The numbers quoted above come from one real library of 136 stickers and
1,393 deliveries; your mileage will differ, but the failure modes will not.
