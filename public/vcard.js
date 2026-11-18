// vCard 3.0 builder (RFC 2426). Shared by the browser and the unit tests.
// Pure functions, no DOM.

const CRLF = '\r\n';

/** Escapes a vCard text value: backslash, comma, semicolon and newlines. */
export function escapeValue(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/**
 * Splits a display name into { given, family } for the N property.
 * "Bhargav Raj Dutta" -> given "Bhargav Raj", family "Dutta".
 * A single word is treated as the given name.
 */
export function splitName(fullName) {
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { given: '', family: '' };
  if (parts.length === 1) return { given: parts[0], family: '' };
  return { given: parts.slice(0, -1).join(' '), family: parts[parts.length - 1] };
}

/** UTF-8 byte length of a string. */
export function byteLength(str) {
  return new TextEncoder().encode(str).length;
}

/**
 * Folds a content line to at most 75 octets per physical line (RFC 2425 5.8.1),
 * never splitting a UTF-8 multi-byte sequence.
 */
export function foldLine(line) {
  if (byteLength(line) <= 75) return line;
  const out = [];
  let current = '';
  let currentBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = byteLength(ch);
    if (currentBytes + b > limit) {
      out.push(current);
      current = '';
      currentBytes = 0;
      limit = 74; // continuation lines start with a space
    }
    current += ch;
    currentBytes += b;
  }
  if (current) out.push(current);
  return out.join(`${CRLF} `);
}

/**
 * Builds a vCard 3.0 string.
 *
 * options.compact (default true): for the QR code. Omits PHOTO and NOTE (bio)
 *   and does not fold lines, to keep the payload small.
 * options.compact = false: for the downloadable .vcf. Includes the photo and
 *   bio, and folds long lines.
 */
export function buildVCard(card, { compact = true } = {}) {
  const c = card || {};
  const name = String(c.name ?? '').trim();
  const { given, family } = splitName(name);
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];

  lines.push(`N:${escapeValue(family)};${escapeValue(given)};;;`);
  lines.push(`FN:${escapeValue(name)}`);
  if (c.company) lines.push(`ORG:${escapeValue(c.company)}`);
  if (c.title) lines.push(`TITLE:${escapeValue(c.title)}`);
  if (c.phone) lines.push(`TEL;TYPE=CELL:${escapeValue(c.phone)}`);
  if (c.email) lines.push(`EMAIL;TYPE=INTERNET:${escapeValue(c.email)}`);
  if (c.website) lines.push(`URL:${escapeValue(c.website)}`);
  if (c.linkedin) lines.push(`URL;TYPE=LinkedIn:${escapeValue(c.linkedin)}`);
  // Free-text location goes in the locality component of ADR.
  if (c.location) lines.push(`ADR;TYPE=WORK:;;;${escapeValue(c.location)};;;`);

  if (!compact) {
    if (c.bio) lines.push(`NOTE:${escapeValue(c.bio)}`);
    const m = typeof c.photo === 'string' && /^data:image\/(jpeg|png);base64,([a-z0-9+/=]+)$/i.exec(c.photo);
    if (m) lines.push(`PHOTO;ENCODING=b;TYPE=${m[1].toUpperCase()}:${m[2]}`);
  }

  lines.push('END:VCARD');
  const out = compact ? lines : lines.map(foldLine);
  return out.join(CRLF) + CRLF;
}

/** Bytes above which the QR gets dense enough to be hard to scan across a table. */
export const QR_WARN_BYTES = 400;
