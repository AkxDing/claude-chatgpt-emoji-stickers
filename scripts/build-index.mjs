// Build the candidate list the assistant reads when it wants to send a sticker.
//
//   node scripts/build-index.mjs          print the full list, grouped by emotion tag
//   node scripts/build-index.mjs --check  validate only; exit code 1 when problems exist
//   node scripts/build-index.mjs --hook   compact list for a SessionStart hook (see README)
//
// Why --hook matters: pasting the whole library into the system prompt costs context that
// grows with every sticker you add. In --hook mode each tag lists only the HOOK_TOP
// coldest stickers, so the injected text stays around 4 KB no matter how large the
// library grows, and it refreshes usage.json in the background so the next session
// rotates to different candidates automatically.

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STICKER_DIR, TAGS_FILE, USAGE_FILE, IMAGE_EXT, SKIP_DIRS } from './config.mjs';

if (!existsSync(STICKER_DIR)) {
  console.error(`Sticker library not found: ${STICKER_DIR}\nSet STICKER_DIR, or run this from the repository root.`);
  process.exit(1);
}
if (!existsSync(TAGS_FILE)) {
  console.error(`${TAGS_FILE} not found.\nCopy stickers/tags.json from the repository, or create one with a "_vocabulary" array.`);
  process.exit(1);
}

const checkOnly = process.argv.includes('--check');
const hookMode = process.argv.includes('--hook');
const HOOK_TOP = Number(process.env.STICKER_HOOK_TOP || 5);

const raw = JSON.parse(readFileSync(TAGS_FILE, 'utf8'));
const VOCAB = raw._vocabulary;
if (!Array.isArray(VOCAB) || !VOCAB.length) {
  console.error(`${TAGS_FILE} must contain a "_vocabulary" array of emotion tags.`);
  process.exit(1);
}
const tagMap = new Map(Object.entries(raw).filter(([k]) => !k.startsWith('_')));

// A half-written usage.json (two sessions starting at once) must not take the hook down
// with a parse error, which would be a miserable thing to debug at session start.
const usageMissing = !existsSync(USAGE_FILE);
let usage = {};
if (!usageMissing) {
  try { usage = JSON.parse(readFileSync(USAGE_FILE, 'utf8')); }
  catch { console.error(`Ignoring unreadable ${USAGE_FILE}; re-run count-usage.mjs.`); }
}

const problems = [];
const byTag = new Map(VOCAB.map((t) => [t, []]));
const onDisk = new Set();
let total = 0;

// Files the operating system leaves behind. They are not stickers and must not make
// --check fail, or people learn to ignore the check.
const JUNK = new Set(['thumbs.db', 'desktop.ini']);
const isJunk = (name) => name.startsWith('.') || JUNK.has(name.toLowerCase());

for (const entry of readdirSync(STICKER_DIR, { withFileTypes: true })) {
  const dir = entry.name;
  if (SKIP_DIRS.has(dir) || isJunk(dir)) continue;
  if (!entry.isDirectory()) {
    // The index key is "<folder>/<file>", so a sticker sitting at the library root can
    // never be addressed. Say so instead of ignoring it.
    const ext = dir.includes('.') ? dir.split('.').pop().toLowerCase() : '';
    if (IMAGE_EXT.has(ext)) problems.push(`${dir} sits at the library root; stickers must live in a folder`);
    continue;
  }

  for (const fileEntry of readdirSync(join(STICKER_DIR, dir), { withFileTypes: true })) {
    const file = fileEntry.name;
    if (isJunk(file)) continue;
    if (!fileEntry.isFile()) continue; // nested folders are not part of the "<folder>/<file>" scheme
    const ext = file.includes('.') ? file.split('.').pop().toLowerCase() : '';
    const key = `${dir}/${file}`;
    if (!IMAGE_EXT.has(ext)) { problems.push(`${key} is not a deliverable format (gif/png/jpg)`); continue; }

    onDisk.add(key);
    total++;

    const tags = tagMap.get(key);
    if (!tags || !tags.length) { problems.push(`${key} has no tags in tags.json`); continue; }

    const used = usage[key] || 0;
    for (const t of tags) {
      if (!byTag.has(t)) { problems.push(`${key} uses tag "${t}" which is not in _vocabulary`); continue; }
      byTag.get(t).push({ label: key, used });
    }
  }
}

// Tagged but missing on disk: delivery would fail at send time.
for (const key of tagMap.keys()) {
  if (!onDisk.has(key)) problems.push(`tags.json lists ${key} but the file does not exist`);
}
// An empty tag is worth reporting but is not an error: a young library legitimately has
// vocabulary it has not filled yet, and failing the check on that would train people to
// ignore the check.
const emptyTags = [...byTag].filter(([, list]) => !list.length).map(([t]) => t);

// Least used first. Ties break by name so the output is stable and reproducible.
for (const list of byTag.values()) {
  list.sort((a, b) => a.used - b.used || a.label.localeCompare(b.label));
}

const neverUsed = [...onDisk].filter((k) => !(usage[k] > 0)).length;

if (checkOnly) {
  if (problems.length) {
    console.error('Problems found:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exitCode = 1;
  } else {
    console.log(`OK: ${total} stickers / ${VOCAB.length} tags; naming, formats and tagging all valid.`);
    console.log(usageMissing
      ? 'Note: usage.json not found, falling back to name order. Run count-usage.mjs to enable cold-first rotation.'
      : `Note: ${neverUsed} stickers have never been sent; they sort first within their tags.`);
  }
  if (emptyTags.length) console.log(`Note: ${emptyTags.length} tags have no sticker yet: ${emptyTags.join(', ')}`);
} else if (hookMode) {
  // fileURLToPath, not URL.pathname: pathname keeps percent-encoding, so any path with a
  // space or a non-ASCII character (C:\Users\John Smith\, ~/文档/) would resolve to a file
  // that does not exist — and with stdio ignored the failure would be completely silent.
  const { spawn } = await import('node:child_process');
  const selfDir = dirname(fileURLToPath(import.meta.url));
  const child = spawn(process.execPath, [join(selfDir, 'count-usage.mjs')],
    { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', (e) => console.log(`(usage refresh could not start: ${e.message})`));
  child.unref();

  // Forward slashes everywhere: the path is copied verbatim into a tool call, and a mix
  // of separators is exactly how hand-typed paths end up pointing at nothing.
  const sendRoot = STICKER_DIR.replace(/\\/g, '/');
  console.log(`## Sticker candidates for this session (${total} in library; each tag lists the ${HOOK_TOP} least-used; send with the absolute path ${sendRoot}/<entry>)`);
  for (const t of VOCAB) {
    const list = byTag.get(t).slice(0, HOOK_TOP).map((x) => x.label);
    if (list.length) console.log(`- ${t}: ${list.join(' · ')}`);
  }
  if (problems.length) console.log(`(${problems.length} library problems; run build-index.mjs --check for details)`);
} else {
  console.log(`<!-- ${total} stickers, grouped by emotion tag; least-used first within each tag -->`);
  for (const t of VOCAB) {
    const list = byTag.get(t);
    if (list.length) console.log(`- **${t}**: ${list.map((x) => x.label).join(' · ')}`);
  }
  if (emptyTags.length) console.error(`\nNote: ${emptyTags.length} tags have no sticker yet: ${emptyTags.join(', ')}`);
  if (usageMissing) console.error('\nNote: usage.json not found, sorted by name instead of usage. Run count-usage.mjs first.');
  if (problems.length) {
    console.error('\nProblems found along the way:');
    for (const p of problems) console.error(`  - ${p}`);
  }
}
