// Generates the PWA icons from one SVG design using @resvg/resvg-js
// (a prebuilt renderer, no native build; Pillow and node-canvas were not available).
//
//   npm run icons
//
// Output (public/icons/):
//   icon-192.png, icon-512.png         purpose "any" (rounded tile)
//   maskable-192.png, maskable-512.png purpose "maskable" (full bleed, art in the 80% safe zone)
//   apple-touch-icon.png (180)         iOS home screen (full bleed; iOS rounds the corners)
//   favicon-32.png
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const BG = '#ffd23f'; // sunny yellow, matches the app
const INK = '#1f1a33';

// The mascot (same drawing as the <symbol id="mascot"> in index.html), on a 200 grid.
// `scale` shrinks the art around the centre (maskable icons need a safe zone).
function art(scale) {
  const s = (512 / 200) * scale;
  const t = (512 - 200 * s) / 2;
  return `
  <g transform="translate(${t} ${t + 14 * scale}) scale(${s})" stroke-linecap="round" stroke-linejoin="round">
    <path d="M82 138v22M118 138v22" fill="none" stroke="${INK}" stroke-width="5"/>
    <ellipse cx="78" cy="164" rx="11" ry="6" fill="${INK}"/>
    <ellipse cx="122" cy="164" rx="11" ry="6" fill="${INK}"/>
    <path d="M42 104c-12 4-20 12-24 22" fill="none" stroke="${INK}" stroke-width="5"/>
    <circle cx="17" cy="128" r="7" fill="#ffffff" stroke="${INK}" stroke-width="4"/>
    <path d="M158 98c12-6 18-16 20-30" fill="none" stroke="${INK}" stroke-width="5"/>
    <circle cx="178" cy="64" r="7" fill="#ffffff" stroke="${INK}" stroke-width="4"/>
    <rect x="40" y="48" width="120" height="92" rx="16" fill="#ffffff" stroke="${INK}" stroke-width="5"/>
    <path d="M40 70v-6a16 16 0 0 1 16-16h88a16 16 0 0 1 16 16v6z" fill="#ff7a59" stroke="${INK}" stroke-width="5"/>
    <rect x="132" y="116" width="18" height="18" rx="3" fill="${INK}"/>
    <rect x="135.5" y="119.5" width="5" height="5" fill="#ffffff"/>
    <rect x="142" y="126" width="4" height="4" fill="#ffffff"/>
    <ellipse cx="82" cy="94" rx="7" ry="9" fill="${INK}"/>
    <ellipse cx="118" cy="94" rx="7" ry="9" fill="${INK}"/>
    <circle cx="84.5" cy="90.5" r="2.5" fill="#ffffff"/>
    <circle cx="120.5" cy="90.5" r="2.5" fill="#ffffff"/>
    <ellipse cx="66" cy="108" rx="7" ry="4.5" fill="#ff6f91" opacity="0.5"/>
    <ellipse cx="134" cy="106" rx="7" ry="4.5" fill="#ff6f91" opacity="0.5"/>
    <path d="M90 108q10 10 20 0" fill="none" stroke="${INK}" stroke-width="4.5"/>
  </g>`;
}

const svgs = {
  any: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect x="6" y="6" width="500" height="500" rx="112" fill="${BG}" stroke="${INK}" stroke-width="12"/>${art(0.92)}</svg>`,
  maskable: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${BG}"/>${art(0.72)}</svg>`,
  apple: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${BG}"/>${art(0.86)}</svg>`,
};

function render(svg, size, file) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(path.join(outDir, file), png);
  console.log(`  ${file} (${size}x${size})`);
}

console.log('Writing icons to public/icons:');
render(svgs.any, 192, 'icon-192.png');
render(svgs.any, 512, 'icon-512.png');
render(svgs.maskable, 192, 'maskable-192.png');
render(svgs.maskable, 512, 'maskable-512.png');
render(svgs.apple, 180, 'apple-touch-icon.png');
render(svgs.any, 32, 'favicon-32.png');
