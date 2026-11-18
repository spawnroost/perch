// Rasterize public/icon.svg into the PNG app icons. Run: pnpm icons
/* global URL, console */
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';

const svg = await readFile(new URL('../public/icon.svg', import.meta.url));
const out = { 'icon-192.png': 192, 'icon-512.png': 512, 'apple-touch-icon.png': 180 };
for (const [name, size] of Object.entries(out)) {
  await sharp(svg, { density: Math.ceil((72 * size) / 120) }).resize(size, size).png().toFile(new URL(`../public/${name}`, import.meta.url).pathname);
}
console.log('wrote', Object.keys(out).join(', '));
