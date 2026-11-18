// Bundles the `qrcode` npm package's own browser entry (lib/browser.js) into a
// single self-contained file at public/vendor/qrcode.js, exposed as window.QRCode.
// qrcode >= 1.5 no longer ships a prebuilt browser build, so we build one here.
// No code is changed: this is the library's source, bundled once, served from 'self'.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = path.dirname(require.resolve('qrcode/package.json'));
const { version } = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));

await build({
  entryPoints: [path.join(pkgDir, 'lib', 'browser.js')],
  outfile: path.join(root, 'public', 'vendor', 'qrcode.js'),
  bundle: true,
  format: 'iife',
  globalName: 'QRCode',
  platform: 'browser',
  target: ['es2019'],
  minify: true,
  legalComments: 'inline',
  banner: { js: `/*! qrcode ${version} (https://github.com/soldair/node-qrcode) MIT License. Bundled by scripts/vendor_qrcode.js */` },
});

console.log(`Wrote public/vendor/qrcode.js (qrcode ${version})`);
