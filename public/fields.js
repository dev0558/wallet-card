// Card field definitions and normalisers, shared by the browser and the server
// so both apply exactly the same rules. Pure functions, no DOM.

export const FIELD_LIMITS = Object.freeze({
  name: 80,
  title: 80,
  company: 80,
  location: 80,
  email: 254,
  phone: 40,
  website: 200,
  linkedin: 200,
  tagline: 120,
  bio: 500,
  vibe: 200,
});

export const TEXT_FIELDS = Object.freeze(Object.keys(FIELD_LIMITS).filter((k) => k !== 'vibe'));

// C0/C1 control characters, plus Unicode bidi override/isolate controls that can
// be used to visually spoof text (Trojan Source style). Natural RTL text such as
// Arabic does not need them. \n is handled separately for multi-line fields.
const CONTROL_RE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g;
const NEWLINE_RE = /\r\n?|\u2028|\u2029/g;

/**
 * Trims, strips control characters and caps length (by code point, so a
 * multi-byte character is never cut in half).
 */
export function cleanText(value, max, { multiline = false } = {}) {
  if (value === undefined || value === null) return '';
  let s = String(value).replace(NEWLINE_RE, '\n').replace(CONTROL_RE, '');
  if (multiline) s = s.replace(/\n{3,}/g, '\n\n');
  else s = s.replace(/\n/g, ' ');
  s = s.replace(/[ \t]+/g, ' ').trim();
  const chars = Array.from(s);
  if (chars.length > max) s = chars.slice(0, max).join('').trim();
  return s;
}

// Deliberately simple: one @, no spaces, a dot in the domain, sane TLD.
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,63}$/i;

export function isValidEmail(value) {
  return typeof value === 'string' && value.length <= FIELD_LIMITS.email && EMAIL_RE.test(value);
}

// Digits, spaces and common phone punctuation only.
export function isValidPhone(value) {
  return typeof value === 'string' && /^\+?[0-9 ()./-]{3,40}$/.test(value) && /\d{3,}/.test(value.replace(/\D/g, ''));
}

/**
 * Normalises a website URL. Adds https:// to bare domains ("example.com/x").
 * Returns the normalised string, or null if it is not an http(s) URL with a
 * dotted hostname.
 */
export function normalizeUrl(value) {
  if (typeof value !== 'string') return null;
  let s = value.trim();
  if (!s) return null;
  if (/\s/.test(s)) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s.replace(/^\/+/, '')}`;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  if (!u.hostname.includes('.') || u.hostname.startsWith('.') || u.hostname.endsWith('.')) return null;
  // Drop a lone trailing slash on the root so "example.com" stays compact in the QR.
  const out = u.href;
  return u.pathname === '/' && !u.search && !u.hash ? out.replace(/\/$/, '') : out;
}

/**
 * Accepts a LinkedIn URL, a bare "linkedin.com/in/x", or just a handle "x".
 * Returns a normalised https URL or null.
 */
export function normalizeLinkedIn(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim().replace(/^@/, '');
  if (!s) return null;
  if (/^[a-z0-9-_%]{3,100}$/i.test(s)) return `https://www.linkedin.com/in/${s}`;
  return normalizeUrl(s);
}

/**
 * Cleans a whole card. Returns { card, errors } where errors maps field -> message.
 * Unknown keys are dropped. `photo` is kept only if `keepPhoto` and it is a
 * small JPEG/PNG/WebP data URL.
 */
export function sanitizeCard(input, { keepPhoto = false, requireName = true } = {}) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const card = {};
  const errors = {};
  for (const key of TEXT_FIELDS) {
    card[key] = cleanText(src[key], FIELD_LIMITS[key], { multiline: key === 'bio' });
  }
  if (requireName && !card.name) errors.name = 'Name is required';
  if (card.email && !isValidEmail(card.email)) errors.email = 'Enter a valid email address';
  if (card.phone && !isValidPhone(card.phone)) errors.phone = 'Enter a valid phone number';
  if (card.website) {
    const u = normalizeUrl(card.website);
    if (u) card.website = u;
    else errors.website = 'Enter a valid website, like example.com';
  }
  if (card.linkedin) {
    const u = normalizeLinkedIn(card.linkedin);
    if (u) card.linkedin = u;
    else errors.linkedin = 'Enter a LinkedIn URL or handle';
  }
  if (keepPhoto && typeof src.photo === 'string' && /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(src.photo) && src.photo.length <= 200_000) {
    card.photo = src.photo;
  }
  return { card, errors };
}
