// Colour helpers shared by the server (contrast clamping) and the browser
// (live contrast hint). Pure functions, no DOM.

export const DEFAULT_COLORS = Object.freeze({
  background: '#0f172a',
  foreground: '#f8fafc',
  label: '#93c5fd',
});

/** One-tap looks for the editor. Every preset must pass AA (checked in tests). */
export const PRESETS = Object.freeze([
  { id: 'midnight', name: 'Midnight', background: '#0f172a', foreground: '#f8fafc', label: '#93c5fd' },
  { id: 'sunny', name: 'Sunny', background: '#ffd23f', foreground: '#1f1a33', label: '#8a3b12' },
  { id: 'mint', name: 'Mint', background: '#c9f5e4', foreground: '#0f3d2e', label: '#1f7a5a' },
  { id: 'coral', name: 'Coral', background: '#ff7a59', foreground: '#1f1a33', label: '#4a1608' },
  { id: 'grape', name: 'Grape', background: '#3b2a7a', foreground: '#fff8ec', label: '#ffd23f' },
  { id: 'paper', name: 'Paper', background: '#fff8ec', foreground: '#1f1a33', label: '#c0392b' },
  { id: 'forest', name: 'Forest', background: '#14532d', foreground: '#f0fdf4', label: '#86efac' },
  { id: 'ink', name: 'Ink', background: '#111111', foreground: '#ffffff', label: '#ff9ec7' },
]);

export const MIN_TEXT_CONTRAST = 4.5; // WCAG AA, normal text
export const MIN_LABEL_CONTRAST = 3; // WCAG AA, large text / UI labels

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Returns a normalised lowercase #rrggbb string, or null if the input is not a hex colour. */
export function normalizeHex(value) {
  if (typeof value !== 'string') return null;
  const m = HEX_RE.exec(value.trim());
  if (!m) return null;
  let hex = m[1].toLowerCase();
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  return `#${hex}`;
}

export function hexToRgb(hex) {
  const n = normalizeHex(hex);
  if (!n) throw new TypeError(`Not a hex colour: ${hex}`);
  return [1, 3, 5].map((i) => parseInt(n.slice(i, i + 2), 16));
}

export function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

/** WCAG 2.x relative luminance. */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function mix(fromRgb, toRgb, t) {
  return fromRgb.map((v, i) => v + (toRgb[i] - v) * t);
}

/**
 * Returns a colour that meets `minRatio` against `background`, changing `color`
 * as little as possible. It mixes toward black or white (whichever direction
 * can reach the target) and binary-searches the smallest mix amount, so the
 * hue is kept where it can be.
 */
export function ensureContrast(color, background, minRatio) {
  const fg = normalizeHex(color);
  const bg = normalizeHex(background);
  if (!fg || !bg) throw new TypeError('ensureContrast needs two hex colours');
  if (contrastRatio(fg, bg) >= minRatio) return fg;

  const fgRgb = hexToRgb(fg);
  const candidates = [
    [0, 0, 0],
    [255, 255, 255],
  ]
    .map((target) => ({ target, max: contrastRatio(rgbToHex(target), bg) }))
    .filter((c) => c.max >= minRatio)
    // Prefer the direction that can achieve the most contrast.
    .sort((a, b) => b.max - a.max);

  // One of black/white always reaches at least 4.58:1 against any colour,
  // so for WCAG thresholds candidates is never empty. Guard anyway.
  if (candidates.length === 0) {
    return luminance(bg) > 0.179 ? '#000000' : '#ffffff';
  }

  let best = null;
  for (const { target } of candidates) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (contrastRatio(rgbToHex(mix(fgRgb, target, mid)), bg) >= minRatio) hi = mid;
      else lo = mid;
    }
    let out = rgbToHex(mix(fgRgb, target, hi));
    // Rounding to 8-bit can land a hair under the threshold; step further if so.
    let t = hi;
    while (contrastRatio(out, bg) < minRatio && t < 1) {
      t = Math.min(1, t + 0.01);
      out = rgbToHex(mix(fgRgb, target, t));
    }
    if (contrastRatio(out, bg) >= minRatio && (!best || t < best.t)) best = { out, t };
  }
  return best ? best.out : rgbToHex(candidates[0].target);
}

/**
 * Validates and repairs a {background, foreground, label} palette.
 * Invalid hex values fall back to `fallback` (then DEFAULT_COLORS).
 * Returns { colors, adjusted: {foreground, label}, invalid: [keys] }.
 */
export function fixPalette(input, fallback = DEFAULT_COLORS) {
  const src = input && typeof input === 'object' ? input : {};
  const fb = fallback && typeof fallback === 'object' ? fallback : DEFAULT_COLORS;
  const invalid = [];
  const pick = (key) => {
    const v = normalizeHex(src[key]);
    if (v) return v;
    invalid.push(key);
    return normalizeHex(fb[key]) || DEFAULT_COLORS[key];
  };
  const background = pick('background');
  const rawFg = pick('foreground');
  const rawLabel = pick('label');
  const foreground = ensureContrast(rawFg, background, MIN_TEXT_CONTRAST);
  const label = ensureContrast(rawLabel, background, MIN_LABEL_CONTRAST);
  return {
    colors: { background, foreground, label },
    adjusted: { foreground: foreground !== rawFg, label: label !== rawLabel },
    invalid,
  };
}
