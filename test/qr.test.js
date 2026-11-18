// QR round-trip: encode with the vendored browser build (the exact file the
// app serves), rasterise, decode with jsQR, and compare byte-for-byte.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Resvg } from '@resvg/resvg-js';
import jsQR from 'jsqr';
import { buildVCard, byteLength } from '../public/vcard.js';

let QRCode;
let qr; // ../public/qr.js, which reads globalThis.QRCode

before(async () => {
  const code = readFileSync(new URL('../public/vendor/qrcode.js', import.meta.url), 'utf8');
  const sandbox = { TextEncoder, Uint8Array, Uint8ClampedArray, Promise, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'vendor/qrcode.js' });
  QRCode = sandbox.QRCode;
  assert.equal(typeof QRCode?.create, 'function', 'vendored build exposes QRCode.create');
  globalThis.QRCode = QRCode;
  qr = await import('../public/qr.js');
});

const OPTS = { errorCorrectionLevel: 'M', margin: 4 };
const seg = (text) => [{ data: text, mode: 'byte' }];

/** Path 1: the SVG the My Card view shows, rasterised with resvg. */
async function decodeSvg(text) {
  const svg = await QRCode.toString(seg(text), { ...OPTS, type: 'svg', color: { dark: '#000000', light: '#ffffff' } });
  const { size } = QRCode.create(seg(text), OPTS).modules;
  const px = (size + 8) * 6; // 6 px per module
  const img = new Resvg(svg, { fitTo: { mode: 'width', value: px }, shapeRendering: 0 }).render();
  return jsQR(new Uint8ClampedArray(img.pixels), img.width, img.height);
}

/** Path 2: the module matrix the 1080x1350 image export draws, rasterised by hand. */
function decodeMatrix(text) {
  const m = qr.qrMatrix(text);
  const scale = 5;
  const quiet = 4;
  const n = (m.size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(n * n * 4).fill(255);
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (!m.isDark(r, c)) continue;
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          const i = (((r + quiet) * scale + y) * n + (c + quiet) * scale + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
      }
    }
  }
  return { result: jsQR(data, n, n), version: m.version };
}

function assertExact(result, text, label) {
  assert.ok(result, `${label}: jsQR could not decode`);
  assert.equal(result.data, text, `${label}: decoded text differs`);
  assert.deepEqual(Buffer.from(result.binaryData), Buffer.from(text, 'utf8'), `${label}: decoded bytes differ`);
}

const fullCard = {
  name: 'Bhargav Raj Dutta',
  title: 'Senior Security Engineer, Red Team; AppSec',
  company: 'Example Holdings, Inc.',
  location: 'Dubai, United Arab Emirates',
  email: 'bhargav.dutta@example.com',
  phone: '+971 50 123 4567',
  website: 'https://www.example.com/about/team',
  linkedin: 'https://www.linkedin.com/in/example-profile-123',
  tagline: 'Breaking things so they stay safe',
  bio: 'Not in the QR',
  photo: 'data:image/jpeg;base64,AAAA',
};

function makeAround400Bytes() {
  // Mixed-script card, then pad the title one 3-byte character at a time
  // until the payload lands in 395..400 bytes.
  const base = {
    name: 'ভাৰ্গৱ ৰাজ দত্ত',
    company: 'Example, Inc.',
    email: 'bhargav@example.com',
    phone: '+971 50 123 4567',
    website: 'https://example.com',
  };
  let title = 'मुख्य सुरक्षा अभियंता';
  let text = buildVCard({ ...base, title });
  assert.ok(byteLength(text) < 395, `base payload already ${byteLength(text)} bytes`);
  while (byteLength(text) < 395) {
    title += 'क';
    text = buildVCard({ ...base, title });
  }
  return text;
}

const cases = () => [
  { label: 'short URL', text: 'https://example.com', minVersion: 1 },
  { label: 'full vCard, every field', text: buildVCard(fullCard), minVersion: 7 },
  { label: 'Assamese name vCard', text: buildVCard({ name: 'ভাৰ্গৱ ৰাজ দত্ত', company: 'উদাহৰণ', location: 'গুৱাহাটী, অসম' }), minVersion: 1 },
  { label: 'Hindi name vCard', text: buildVCard({ name: 'भार्गव राज दत्त', title: 'सुरक्षा अभियंता' }), minVersion: 1 },
  { label: 'Arabic name vCard', text: buildVCard({ name: 'بهارجاف راج دوتا', location: 'دبي، الإمارات' }), minVersion: 1 },
  { label: '~400-byte vCard (mixed scripts)', text: makeAround400Bytes(), minVersion: 10 },
  {
    label: '~1.1 KB payload (version 20+)',
    text: `${buildVCard(fullCard)}${'NOTE:'.padEnd(5)}${'Ünïcødé → ✓ مرحبا नमस्ते '.repeat(28)}`,
    minVersion: 20,
  },
];

test('payload sizes cover small and large QR versions', () => {
  const c = cases();
  const four = c.find((x) => x.label.startsWith('~400'));
  const bytes = byteLength(four.text);
  assert.ok(bytes >= 395 && bytes <= 400, `~400-byte case is ${bytes} bytes`);
  const versions = c.map((x) => QRCode.create(seg(x.text), OPTS).version);
  assert.ok(versions.some((v) => v >= 7), 'at least one payload needs version >= 7');
  assert.ok(versions.some((v) => v >= 20), 'at least one payload needs version >= 20');
});

for (const { label, text, minVersion } of cases()) {
  test(`round-trip (SVG path): ${label}`, async () => {
    const version = QRCode.create(seg(text), OPTS).version;
    assert.ok(version >= minVersion, `${label}: expected version >= ${minVersion}, got ${version}`);
    assertExact(await decodeSvg(text), text, `${label} [v${version}]`);
  });

  test(`round-trip (canvas matrix path): ${label}`, () => {
    const { result, version } = decodeMatrix(text);
    assertExact(result, text, `${label} [v${version}]`);
  });
}

test('error correction level M is used', () => {
  const code = QRCode.create(seg('https://example.com'), OPTS);
  assert.equal(code.errorCorrectionLevel.bit, 0); // M = 0b00
});

test('qrPayload picks the vCard, website or LinkedIn text', () => {
  assert.equal(qr.qrPayload(fullCard, 'website'), fullCard.website);
  assert.equal(qr.qrPayload(fullCard, 'linkedin'), fullCard.linkedin);
  const contact = qr.qrPayload(fullCard, 'contact');
  assert.ok(contact.startsWith('BEGIN:VCARD'));
  assert.ok(!contact.includes('PHOTO') && !contact.includes('NOTE'));
  // Falls back to the contact when the chosen link is missing.
  assert.ok(qr.qrPayload({ name: 'X' }, 'website').startsWith('BEGIN:VCARD'));
});
