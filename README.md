<div align="right"><strong>English</strong> · <a href="README.zh-CN.md">简体中文</a></div>

# Sticker replies for Claude Code and ChatGPT

Give your AI assistant a sticker library it can actually use: it picks one by emotion and
sends it into the chat, the way a person drops a reaction GIF. This repo is the **plumbing
and the discipline**, not the artwork — a skill file, six maintenance scripts, and the
rules that came out of running this every day.

![A real Claude Code session in Chinese: the assistant sends an anime reaction sticker, writes a line of chat, then sends a second sticker as it starts working](docs/images/real-session.png)

*A real session (in Chinese). The stickers there come from the author's own private
library and are **not** included in this repo — see [bring your own stickers](#bring-your-own-stickers).*

Written in the portable [Agent Skills](https://github.com/anthropics/skills) `SKILL.md`
format, which Claude Code, Codex, ChatGPT, Cursor and Gemini CLI all read. **Delivery is
verified in both the Claude Code and the ChatGPT desktop apps** — each has a built-in tool
that puts a local image into the chat, so there is nothing to host and nothing to upload.
Other clients: see [will this work in my client?](#will-this-work-in-my-client).

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
git clone https://github.com/AkxDing/claude-chatgpt-emoji-stickers.git
cd claude-chatgpt-emoji-stickers
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

**A. A tool that puts a local file into the chat.** Two clients have one, and it is the
best route in both: the assistant passes a path, nothing is uploaded, nothing is hosted,
and it costs ~50 tokens because only the path travels.

- **Claude Code desktop** — `SendUserFile({ files: ["…/happy/wave.gif"] })`. Verified:
  GIF animates and loops, PNG and JPG render, SVG does not.
- **ChatGPT desktop** — `view_image({ path: "…/happy/wave.gif" })`, its built-in image
  viewer. Verified 2026-09-20: it reads the local file and shows it in the conversation,
  **GIFs loop just like they do in Claude Code**, and **no file-access permission has to
  be granted** — it just works. No dependency, no server, no Python or ImageMagick.

**B. Rendering a markdown image.** Most chat clients do this. Run the bundled loopback
server and the assistant just writes `![](http://127.0.0.1:8787/happy/wave.gif)`:

```bash
node scripts/serve-stickers.mjs
```

No account, no subscription, no public hosting, no dependencies — it binds to 127.0.0.1
and serves nothing but the sticker files.

**The one-minute check**, for a client with no file tool: start the server, then ask the assistant to
output this line verbatim, outside a code block —
`![](http://127.0.0.1:8787/celebrate/party-popper.png)`. If you see the image, that client
can do this. If you see a link, it cannot. Ask the *assistant* to print it rather than
pasting it yourself: many clients render markdown in replies but not in your own messages.

⚠️ **Web-based clients and `127.0.0.1`.** A client served over HTTPS will usually refuse
to load a plain-HTTP image (mixed content), so the loopback URL fails there even though
the client renders images perfectly well. If the check above fails but an `https://…`
image does render, serve the library over HTTPS instead — any tunnel or static host will
do — and point the skill at that base URL.

Known so far:

| Client | Result |
|---|---|
| **Claude Code desktop app** | **A works** (GIF animates and loops). B does not — it blocks image URLs in replies |
| **ChatGPT desktop app** | **A works** via its built-in `view_image` tool on a local path — verified 2026-09-20: GIFs loop, no permission needed. Use this. B also works, but only over HTTPS: an `https://` image printed by the assistant renders inline, `http://127.0.0.1` does not |
| A plain terminal | Expect a file card or a bare link |

Everything else is untested; please
[open an issue](https://github.com/AkxDing/claude-chatgpt-emoji-stickers/issues) with your client
and what you saw.

### If your client needs an HTTPS address

**Skip this whole section if your client has a file tool** — Claude Code and ChatGPT both
do, and delivery A needs no address, no server and no hosting at all.

**The library always lives on your disk** — collecting, tagging and rotating never involve
uploading anything. Only delivery B needs a URL, and a client served over HTTPS may refuse
`http://127.0.0.1` (mixed content; since Chrome 145 loopback access is also behind a
permission prompt). Work down this list and stop at the first one that works — it is
ordered from most private to least:

1. **Local server, as-is.** Try `http://127.0.0.1:8787` first; some clients allow it.
   Nothing leaves your machine.
2. **Local server behind a tunnel.** `cloudflared tunnel --url http://localhost:8787`
   (or any equivalent) gives you an HTTPS address without an account. **The files still
   sit on your disk**; only that address is reachable, and it changes each restart, so
   update the skill's base URL when it does.
3. **A public URL** — object storage, a static host, or a public GitHub repo whose raw
   URL you point at:
   `https://raw.githubusercontent.com/<you>/<repo>/main/stickers` (jsDelivr mirrors the
   same files at `https://cdn.jsdelivr.net/gh/<you>/<repo>@main/stickers`). Zero
   infrastructure, but ⚠️ **it publishes the material**, so this one is only for stickers
   you are entitled to distribute. This repo's own samples are reachable that way if you
   just want to try the flow before collecting your own.

> ChatGPT's MCP support is not a shortcut around this: it connects to remote HTTPS servers
> only (no local stdio) and needs a paid plan plus developer mode.

## Contributing

Telling us which clients can show a sticker is the most useful contribution: run the
one-minute check above and open an issue with the client, its version, whether animation
plays, and a screenshot. Bug reports that include your OS, Node and Pillow versions get
fixed faster.

---

MIT licensed. The numbers quoted above come from one real library of 136 stickers and
1,393 deliveries; your mileage will differ, but the failure modes will not.
