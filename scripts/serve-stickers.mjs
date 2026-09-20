// Serve the sticker library over local HTTP, so an assistant can reference a sticker as a
// plain markdown image and any client that renders images will show it.
//
//   node scripts/serve-stickers.mjs            http://127.0.0.1:8787/
//   STICKER_PORT=9000 node scripts/serve-stickers.mjs
//
// This is the delivery adapter for clients that have no file-send tool. It needs no
// dependencies, no account and no public hosting: it binds to the loopback interface only,
// so nothing outside this machine can reach it.
//
// The assistant then writes, in its reply:
//
//   ![](http://127.0.0.1:8787/celebrate/party-popper.png)
//
// Whether that renders is a property of your client, not of this server. Clients that
// display markdown images will show it; a plain terminal will print the link. Check once
// with the URL this script prints on startup before wiring it into a skill.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, normalize, extname } from 'node:path';
import { STICKER_DIR, IMAGE_EXT } from './config.mjs';

const PORT = Number(process.env.STICKER_PORT || 8787);

const TYPES = { gif: 'image/gif', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

if (!existsSync(STICKER_DIR)) {
  console.error(`Sticker library not found: ${STICKER_DIR}\nSet STICKER_DIR, or run this from the repository root.`);
  process.exit(1);
}

const server = createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  // normalize() collapses "..", and the prefix check then rejects anything that climbed
  // out of the library: without this, a request could read arbitrary files on the machine.
  const full = normalize(join(STICKER_DIR, rel));
  const ext = extname(full).slice(1).toLowerCase();

  if (!full.startsWith(STICKER_DIR) || !IMAGE_EXT.has(ext) || !existsSync(full) || !statSync(full).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not a sticker\n');
    return;
  }

  res.writeHead(200, { 'content-type': TYPES[ext], 'cache-control': 'no-store' });
  createReadStream(full).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Serving ${STICKER_DIR} at http://127.0.0.1:${PORT}/`);
  console.log(`Try it in your client:  ![](http://127.0.0.1:${PORT}/celebrate/party-popper.png)`);
  console.log('Loopback only — nothing outside this machine can reach it. Ctrl+C to stop.');
});
