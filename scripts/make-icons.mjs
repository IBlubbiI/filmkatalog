// Erzeugt aus public/icon.svg alle PNG-Icons (PWA, Apple, Favicon).
// Aufruf: npm run icons
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'public', 'icon.svg');
const PUB = path.join(ROOT, 'public');
const ICONS = path.join(PUB, 'icons');
fs.mkdirSync(ICONS, { recursive: true });

const svg = fs.readFileSync(SRC);
const bg = { r: 14, g: 14, b: 20, alpha: 1 }; // #0e0e14

async function render(size, dest, { padding = 0 } = {}) {
  const inner = Math.round(size * (1 - padding));
  const logo = await sharp(svg).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(dest);
  console.log('  ✓', path.relative(ROOT, dest));
}

console.log('🎨 Icons erzeugen …');
await render(192, path.join(ICONS, 'icon-192.png'));
await render(512, path.join(ICONS, 'icon-512.png'));
await render(512, path.join(ICONS, 'icon-maskable-512.png'), { padding: 0.18 }); // Safe-Zone für Maskable
await render(180, path.join(PUB, 'apple-touch-icon.png'));
await render(32, path.join(PUB, 'favicon.ico')); // PNG-Daten mit .ico-Endung genügt modernen Browsern
console.log('Fertig.');
