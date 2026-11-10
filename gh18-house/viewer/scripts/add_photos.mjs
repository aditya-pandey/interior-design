// Her photos: put new pictures (JPEG or PNG) in play/deepti/photos/, then run `npm run add-photos`: each one not yet
// in her album is added to pack.json (album.photos) with its size, at the end. Captions: add "caption" to an entry.
import fs from 'node:fs';
import path from 'node:path';
const dir = path.resolve('play/deepti/photos'), packFile = path.resolve('play/deepti/pack.json');
const pack = JSON.parse(fs.readFileSync(packFile, 'utf8'));
pack.album ||= { title: 'Her photos', photos: [] };
const have = new Set(pack.album.photos.map((p) => p.file));
function size(f) {
  const b = fs.readFileSync(f);
  if (b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  for (let i = 2; i < b.length - 9;) {                              // JPEG: the frame header (SOF) has the size
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}
let added = 0;
for (const name of fs.readdirSync(dir).sort()) {
  if (!/\.(jpe?g|png)$/i.test(name) || have.has('photos/' + name)) continue;
  const s = size(path.join(dir, name));
  if (!s) { console.log('skipped (not a JPEG/PNG?)', name); continue; }
  pack.album.photos.push({ file: 'photos/' + name, ...s }); added++;
  console.log('added', name, `${s.w}×${s.h}`);
}
fs.writeFileSync(packFile, JSON.stringify(pack, null, 1) + '\n');
console.log(`${added} added · ${pack.album.photos.length} photos in her album`);
