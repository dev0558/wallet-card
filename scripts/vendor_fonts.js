// Copies the self-hosted fonts into public/fonts so the app needs no font CDN
// (the CSP only allows font-src 'self', and the app must work offline).
//   Fredoka (display) and Nunito (body), variable weight, Latin + Latin Extended.
//   Both are SIL Open Font License 1.1.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'fonts');
mkdirSync(outDir, { recursive: true });

const fonts = [
  ['@fontsource-variable/fredoka', ['fredoka-latin-wght-normal.woff2', 'fredoka-latin-ext-wght-normal.woff2']],
  ['@fontsource-variable/nunito', ['nunito-latin-wght-normal.woff2', 'nunito-latin-ext-wght-normal.woff2']],
];

const licences = [];
for (const [pkg, files] of fonts) {
  const dir = path.dirname(require.resolve(`${pkg}/package.json`));
  for (const f of files) {
    copyFileSync(path.join(dir, 'files', f), path.join(outDir, f));
    console.log(`  ${f}`);
  }
  const lic = path.join(dir, 'LICENSE');
  if (existsSync(lic)) licences.push(`==== ${pkg} ====\n${readFileSync(lic, 'utf8')}`);
}
writeFileSync(path.join(outDir, 'LICENSES.txt'), licences.join('\n\n'));
console.log('Wrote public/fonts (+ LICENSES.txt)');
