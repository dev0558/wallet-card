// Thin wrapper around the vendored `qrcode` library (window.QRCode).
// All encoding is done by the library; this file only picks options and
// turns its SVG output into a DOM node.
import { buildVCard, byteLength } from './vcard.js';

export const QR_OPTIONS = Object.freeze({ errorCorrectionLevel: 'M', margin: 4 });

function lib() {
  const q = globalThis.QRCode;
  if (!q || typeof q.create !== 'function') throw new Error('QR library failed to load');
  return q;
}

// Byte mode with UTF-8 (the library encodes byte-mode strings with TextEncoder),
// so Assamese, Hindi and Arabic names round-trip intact.
const segments = (text) => [{ data: text, mode: 'byte' }];

/** Returns the text the QR should encode for a card and mode. */
export function qrPayload(card, mode) {
  if (mode === 'website' && card.website) return card.website;
  if (mode === 'linkedin' && card.linkedin) return card.linkedin;
  return buildVCard(card, { compact: true });
}

export function payloadBytes(text) {
  return byteLength(text);
}

/** Returns an <svg> element for the text (black on white, for scanning). */
export async function qrSvgElement(text) {
  const markup = await lib().toString(segments(text), {
    ...QR_OPTIONS,
    type: 'svg',
    color: { dark: '#000000', light: '#ffffff' },
  });
  // Library-generated markup. Parsed as SVG, not HTML, then adopted.
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.nodeName.toLowerCase() !== 'svg') throw new Error('Unexpected QR output');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  return document.importNode(svg, true);
}

/** Returns { size, isDark(row, col), version } for drawing onto a canvas. */
export function qrMatrix(text) {
  const qr = lib().create(segments(text), { errorCorrectionLevel: QR_OPTIONS.errorCorrectionLevel });
  const { size } = qr.modules;
  return { size, version: qr.version, isDark: (r, c) => Boolean(qr.modules.get(r, c)) };
}
