import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildVCard, escapeValue, splitName, foldLine, byteLength } from '../public/vcard.js';

const lines = (v) => v.split('\r\n');

test('escapeValue escapes backslash, comma, semicolon and newlines', () => {
  assert.equal(escapeValue('a,b'), 'a\\,b');
  assert.equal(escapeValue('a;b'), 'a\\;b');
  assert.equal(escapeValue('a\\b'), 'a\\\\b');
  assert.equal(escapeValue('line1\nline2'), 'line1\\nline2');
  assert.equal(escapeValue('line1\r\nline2'), 'line1\\nline2');
  assert.equal(escapeValue('line1\rline2'), 'line1\\nline2');
  // Backslash must be escaped first so the escapes we add are not doubled.
  assert.equal(escapeValue('\\,;\n'), '\\\\\\,\\;\\n');
  assert.equal(escapeValue(undefined), '');
});

test('splitName splits into given and family', () => {
  assert.deepEqual(splitName('Bhargav Raj Dutta'), { given: 'Bhargav Raj', family: 'Dutta' });
  assert.deepEqual(splitName('  Ada   Lovelace '), { given: 'Ada', family: 'Lovelace' });
  assert.deepEqual(splitName('Cher'), { given: 'Cher', family: '' });
  assert.deepEqual(splitName(''), { given: '', family: '' });
});

test('buildVCard: structure, CRLF line endings and N/FN', () => {
  const v = buildVCard({ name: 'Ada Lovelace', title: 'Engineer', company: 'Analytical Engines' });
  assert.ok(v.endsWith('\r\n'));
  assert.equal(v.replace(/\r\n/g, '').includes('\n'), false, 'no bare LF');
  assert.equal(v.replace(/\r\n/g, '').includes('\r'), false, 'no bare CR');
  const l = lines(v);
  assert.equal(l[0], 'BEGIN:VCARD');
  assert.equal(l[1], 'VERSION:3.0');
  assert.ok(l.includes('N:Lovelace;Ada;;;'));
  assert.ok(l.includes('FN:Ada Lovelace'));
  assert.ok(l.includes('ORG:Analytical Engines'));
  assert.ok(l.includes('TITLE:Engineer'));
  assert.equal(l.at(-2), 'END:VCARD');
});

test('buildVCard escapes commas, semicolons and newlines in every field', () => {
  const v = buildVCard(
    {
      name: 'Smith, John',
      title: 'Lead; Security',
      company: 'Acme, Inc.; Labs',
      location: 'Dubai, UAE',
      bio: 'Line one\nLine two, with comma; and semicolon',
    },
    { compact: false },
  );
  const l = lines(v);
  assert.ok(l.includes('FN:Smith\\, John'));
  assert.ok(l.includes('N:John;Smith\\,;;;'));
  assert.ok(l.includes('TITLE:Lead\\; Security'));
  assert.ok(l.includes('ORG:Acme\\, Inc.\\; Labs'));
  assert.ok(l.includes('ADR;TYPE=WORK:;;;Dubai\\, UAE;;;'));
  assert.ok(l.includes('NOTE:Line one\\nLine two\\, with comma\\; and semicolon'));
});

test('buildVCard: contact fields and types', () => {
  const v = buildVCard({
    name: 'A B',
    email: 'a@example.com',
    phone: '+971 50 123 4567',
    website: 'https://example.com',
    linkedin: 'https://www.linkedin.com/in/ab',
  });
  const l = lines(v);
  assert.ok(l.includes('EMAIL;TYPE=INTERNET:a@example.com'));
  assert.ok(l.includes('TEL;TYPE=CELL:+971 50 123 4567'));
  assert.ok(l.includes('URL:https://example.com'));
  assert.ok(l.includes('URL;TYPE=LinkedIn:https://www.linkedin.com/in/ab'));
});

test('buildVCard: Unicode names (Assamese, Hindi, Arabic) are kept intact', () => {
  for (const name of ['ভাৰ্গৱ ৰাজ দত্ত', 'भार्गव राज दत्त', 'بهارجاف راج دوتا']) {
    const v = buildVCard({ name });
    const parts = name.split(' ');
    assert.ok(lines(v).includes(`FN:${name}`), name);
    assert.ok(lines(v).includes(`N:${parts.at(-1)};${parts.slice(0, -1).join(' ')};;;`), name);
  }
});

test('compact vCard (for the QR) omits photo and bio; full vCard includes them', () => {
  const card = {
    name: 'Ada Lovelace',
    bio: 'Wrote the first program.',
    photo: `data:image/jpeg;base64,${'A'.repeat(300)}`,
  };
  const compact = buildVCard(card);
  assert.ok(!compact.includes('PHOTO'));
  assert.ok(!compact.includes('NOTE'));

  const full = buildVCard(card, { compact: false });
  assert.ok(full.includes('NOTE:Wrote the first program.'));
  assert.ok(full.includes('PHOTO;ENCODING=b;TYPE=JPEG:'));
  // Folded: no physical line longer than 75 octets, continuation lines start with a space.
  for (const line of lines(full)) assert.ok(byteLength(line) <= 75, `line too long: ${line.length}`);
  const unfolded = full.replace(/\r\n /g, '');
  assert.ok(unfolded.includes(`PHOTO;ENCODING=b;TYPE=JPEG:${'A'.repeat(300)}`));
});

test('foldLine never splits a multi-byte UTF-8 character', () => {
  const line = `NOTE:${'দ'.repeat(60)}`; // 3 bytes each
  const folded = foldLine(line);
  for (const part of folded.split('\r\n')) {
    assert.ok(byteLength(part) <= 75);
    assert.ok(!part.includes('\uFFFD'));
  }
  assert.equal(folded.replace(/\r\n /g, ''), line);
});

test('empty optional fields are omitted', () => {
  const v = buildVCard({ name: 'Solo' });
  assert.deepEqual(lines(v).filter(Boolean), ['BEGIN:VCARD', 'VERSION:3.0', 'N:;Solo;;;', 'FN:Solo', 'END:VCARD']);
});
