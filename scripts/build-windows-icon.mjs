import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Standard Windows .ico builder from PNG buffers
// Multi-resolution: 16x16, 24x24, 32x32, 48x48, 64x64, 128x128, 256x256
const sizes = [
  { size: 16, path: '.runtime/icon.iconset/icon_16x16.png' },
  { size: 24, path: '.runtime/icon.iconset/icon_24x24.png' },
  { size: 32, path: '.runtime/icon.iconset/icon_32x32.png' },
  { size: 48, path: '.runtime/icon.iconset/icon_48x48.png' },
  { size: 64, path: '.runtime/icon.iconset/icon_32x32@2x.png' },
  { size: 128, path: '.runtime/icon.iconset/icon_128x128.png' },
  { size: 256, path: '.runtime/icon.iconset/icon_256x256.png' },
];

export async function createIcoFile(outPath = 'desktop/assets/icon.ico') {
  const images = [];
  for (const item of sizes) {
    const data = await readFile(resolve(item.path));
    images.push({ size: item.size, data });
  }

  // Header: 6 bytes
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type 1 = ICO
  header.writeUInt16LE(count, 4); // Number of images

  // Directory entries: count * 16 bytes
  const dirSize = count * 16;
  const dir = Buffer.alloc(dirSize);

  let currentOffset = 6 + dirSize;
  const chunks = [header, dir];

  for (let i = 0; i < count; i++) {
    const img = images[i];
    const offset = i * 16;
    const width = img.size >= 256 ? 0 : img.size;
    const height = img.size >= 256 ? 0 : img.size;

    dir.writeUInt8(width, offset + 0);
    dir.writeUInt8(height, offset + 1);
    dir.writeUInt8(0, offset + 2); // Colors
    dir.writeUInt8(0, offset + 3); // Reserved
    dir.writeUInt16LE(1, offset + 4); // Color planes
    dir.writeUInt16LE(32, offset + 6); // Bits per pixel
    dir.writeUInt32LE(img.data.length, offset + 8); // Size in bytes
    dir.writeUInt32LE(currentOffset, offset + 12); // Offset in file

    chunks.push(img.data);
    currentOffset += img.data.length;
  }

  const finalIco = Buffer.concat(chunks);
  await writeFile(resolve(outPath), finalIco);
  console.log(`Created multi-resolution icon ${outPath} (${finalIco.length} bytes, ${count} resolutions)`);
  return finalIco.length;
}

if (process.argv[1]?.endsWith('build-windows-icon.mjs')) {
  await createIcoFile();
}
