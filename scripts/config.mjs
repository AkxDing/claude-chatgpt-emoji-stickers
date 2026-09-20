// Shared paths. Override the library location with STICKER_DIR when the stickers live
// outside this repository (the usual setup once you bring your own material).

import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const STICKER_DIR = resolve(process.env.STICKER_DIR || resolve(ROOT, 'stickers'));
export const STICKER_DIR_NAME = basename(STICKER_DIR);
export const TAGS_FILE = resolve(STICKER_DIR, 'tags.json');
export const USAGE_FILE = resolve(STICKER_DIR, 'usage.json');
export const ORIGINALS_DIR_NAME = '_originals';

// Formats verified to render in the Claude Code desktop app. SVG does not render.
export const IMAGE_EXT = new Set(['gif', 'png', 'jpg', 'jpeg']);

// Directories inside the library that are not sticker material.
export const SKIP_DIRS = new Set([ORIGINALS_DIR_NAME]);
