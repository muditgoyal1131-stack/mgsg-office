/**
 * Run once with: node generate-icons.js
 * Requires: npm install -g canvas  (or: npm install canvas --save-dev in the client)
 *
 * Generates simple PNG icons for the PWA manifest.
 * Replace with your real brand logo PNGs when available.
 */

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

for (const size of sizes) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#1e3a5f';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.18);
  ctx.fill();

  // Text "M"
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(size * 0.55)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('M', size / 2, size / 2);

  const buffer = canvas.toBuffer('image/png');
  const outPath = path.join(__dirname, `icon-${size}.png`);
  fs.writeFileSync(outPath, buffer);
  console.log(`Generated icon-${size}.png`);
}

console.log('Done. Replace these placeholder icons with your real brand logo.');
