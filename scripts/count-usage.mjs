// Scan local Claude Code session transcripts and count how many times each sticker
// has actually been delivered. Writes usage.json next to the sticker library.
//
// Privacy: this reads your local session transcripts, but it only ever extracts the image
// paths passed to SendUserFile and how often each occurred. No conversation text, no other
// tool arguments and no file contents are read out or written anywhere. The output is a
// plain {path: count} map, and it is gitignored.
//
//   node scripts/count-usage.mjs          count and write usage.json
//   node scripts/count-usage.mjs --dry    print only, write nothing
//
// build-index.mjs reads usage.json to sort each emotion tag "least used first", so
// cold stickers float to the top of the candidate list and overused ones sink.
// No runtime bookkeeping is required: the transcripts are the source of truth.
//
// Implementation notes:
//   1. Transcripts can total gigabytes across hundreds of files. Parsing every line as
//      JSON is far too slow, so lines are pre-filtered by a plain substring test first.
//   2. Paths appear in many shapes (relative, absolute, forward or back slashes); they
//      are normalised to "<folder>/<file>" relative to the sticker library.
//   3. Only tool_use blocks named SendUserFile are counted, so paths merely mentioned
//      in prose (documentation examples, placeholders) never inflate the numbers.

import { createReadStream, existsSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { STICKER_DIR, STICKER_DIR_NAME, USAGE_FILE, IMAGE_EXT } from './config.mjs';

const TRANSCRIPT_ROOT = process.env.CLAUDE_PROJECTS_DIR || join(homedir(), '.claude', 'projects');
const dryRun = process.argv.includes('--dry');
const MARKER = 'SendUserFile';

const counts = new Map();
let linesScanned = 0;
let callsFound = 0;
let parseErrors = 0;

// "…/stickers/happy/wave.gif" -> "happy/wave.gif"; anything else -> null.
// The marker is bracketed with slashes so it matches a whole path segment: without the
// leading slash, an unrelated "client-stickers/" folder elsewhere on the machine would be
// counted as part of this library, polluting the rotation and writing a stranger's folder
// names into usage.json.
function normalize(p) {
  if (typeof p !== 'string') return null;
  const unified = p.replace(/\\/g, '/');
  const marker = `/${STICKER_DIR_NAME}/`;
  const idx = unified.lastIndexOf(marker);
  if (idx === -1) return null;
  const parts = unified.slice(idx + marker.length).split('/').filter(Boolean);
  if (parts.length !== 2) return null; // only "<folder>/<file>"; placeholders and deeper paths are dropped
  const [dir, file] = parts;
  if (dir.includes('<') || file.includes('<')) return null;
  if (!IMAGE_EXT.has(file.split('.').pop().toLowerCase())) return null;
  return `${dir}/${file}`;
}

function collect(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const x of node) collect(x); return; }
  if (node.type === 'tool_use' && node.name === MARKER) {
    const files = node.input?.files;
    if (Array.isArray(files)) {
      for (const f of files) {
        const key = normalize(f);
        if (key) { counts.set(key, (counts.get(key) || 0) + 1); callsFound++; }
      }
    }
  }
  for (const v of Object.values(node)) collect(v);
}

function walk(dir) {
  let out = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(full));
    else if (e.name.endsWith('.jsonl')) out.push(full);
  }
  return out;
}

if (!existsSync(TRANSCRIPT_ROOT)) {
  console.error(`No transcripts at ${TRANSCRIPT_ROOT}.\nThis script is specific to Claude Code; on other harnesses skip it and the rotation falls back to name order.\nSet CLAUDE_PROJECTS_DIR if your transcripts live elsewhere.`);
  process.exit(1);
}

const files = walk(TRANSCRIPT_ROOT);
console.error(`Scanning ${files.length} transcript files under ${TRANSCRIPT_ROOT} …`);

for (const file of files) {
  if (statSync(file).size === 0) continue;
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    linesScanned++;
    if (!line.includes(MARKER)) continue; // cheap pre-filter; JSON.parse only on candidates
    try { collect(JSON.parse(line)); } catch { parseErrors++; }
  }
}

const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
const total = sorted.reduce((sum, [, n]) => sum + n, 0);
console.error(`Done: ${linesScanned} lines, ${total} deliveries across ${sorted.length} stickers, ${parseErrors} unparsable lines.`);

if (dryRun) {
  for (const [key, n] of sorted) console.log(String(n).padStart(4), key);
} else {
  // Write-then-rename: another session's build-index.mjs may be reading this file right
  // now, and a torn read would blow up inside its SessionStart hook.
  const tmp = `${USAGE_FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(Object.fromEntries(sorted), null, 2) + '\n');
  renameSync(tmp, USAGE_FILE);
  console.error(`Wrote ${USAGE_FILE}`);
}

// Keys that no longer exist on disk are kept on purpose: they record deliveries that
// failed (typo in the path) or stickers that were renamed, which is useful when auditing.
void STICKER_DIR;
