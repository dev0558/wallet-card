import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHex, contrastRatio, ensureContrast, fixPalette, DEFAULT_COLORS } from '../public/colors.js';

test('normalizeHex accepts #rgb and #rrggbb, rejects everything else', () => {
  assert.equal(normalizeHex('#ABC'), '#aabbcc');
  assert.equal(normalizeHex('a1b2c3'), '#a1b2c3');
  assert.equal(normalizeHex(' #0F172A '), '#0f172a');
  for (const bad of ['red', '#12', '#12345', '#1234567', 'url(x)', 'javascript:alert(1)', '', null, 42, {}]) {
    assert.equal(normalizeHex(bad), null, String(bad));
  }
});

test('contrastRatio matches known WCAG values', () => {
  assert.equal(contrastRatio('#000000', '#ffffff').toFixed(2), '21.00');
  assert.equal(contrastRatio('#ffffff', '#ffffff').toFixed(2), '1.00');
  assert.equal(contrastRatio('#777777', '#ffffff').toFixed(2), '4.48');
});

test('ensureContrast leaves passing colours unchanged', () => {
  assert.equal(ensureContrast('#ffffff', '#0f172a', 4.5), '#ffffff');
});

test('ensureContrast repairs failing colours and keeps the change small', () => {
  const out = ensureContrast('#777777', '#ffffff', 4.5);
  assert.ok(contrastRatio(out, '#ffffff') >= 4.5);
  assert.notEqual(out, '#000000', 'should darken a little, not jump to black');
});

test('ensureContrast always reaches the target (fuzz, 2000 random pairs)', () => {
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const hex = () => `#${Math.floor(rnd() * 0xffffff).toString(16).padStart(6, '0')}`;
  for (let i = 0; i < 2000; i++) {
    const bg = hex();
    const fg = hex();
    assert.ok(contrastRatio(ensureContrast(fg, bg, 4.5), bg) >= 4.5, `${fg} on ${bg}`);
    assert.ok(contrastRatio(ensureContrast(fg, bg, 3), bg) >= 3, `${fg} on ${bg} (3:1)`);
  }
});

test('fixPalette validates, falls back and reports adjustments', () => {
  const r = fixPalette({ background: '#ffffff', foreground: '#eeeeee', label: 'not-a-colour' }, DEFAULT_COLORS);
  assert.equal(r.colors.background, '#ffffff');
  assert.ok(contrastRatio(r.colors.foreground, '#ffffff') >= 4.5);
  assert.ok(contrastRatio(r.colors.label, '#ffffff') >= 3);
  assert.equal(r.adjusted.foreground, true);
  assert.deepEqual(r.invalid, ['label']);
});

test('every one-tap preset passes WCAG AA (4.5:1 text, 3:1 labels)', async () => {
  const { PRESETS } = await import('../public/colors.js');
  assert.ok(PRESETS.length >= 6);
  for (const p of PRESETS) {
    assert.ok(contrastRatio(p.foreground, p.background) >= 4.5, `${p.name} text`);
    assert.ok(contrastRatio(p.label, p.background) >= 3, `${p.name} label`);
  }
});
