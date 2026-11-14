// PNG-Raster, SVG, Farben, Größenhinweise und Fehler der Kodierung.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode, byteLength, QrTooLongError, QrInvalidTextError } from '../js/qr.js';
import {
  rasterize, toSvg, toSvgPath, contrastRatio, relativeLuminance, colorNotes,
  minPrintWidthCm, layoutNotes, hexToRgb,
} from '../js/render.js';
import { decodeRaster } from './helpers.js';

test('PNG-Raster ist exakt 512, 1024 und 2048 px groß, mit ganzzahliger Modulgröße', () => {
  const { modules } = encode('https://alblicht.dev', 'M');
  for (const size of [512, 1024, 2048]) {
    const r = rasterize(modules, { size, border: 4 });
    assert.equal(r.width, size);
    assert.equal(r.height, size);
    assert.equal(r.data.length, size * size * 4);
    assert.ok(Number.isInteger(r.moduleSize) && r.moduleSize >= 1);
    assert.equal(r.moduleSize, Math.floor(size / (modules.size + 8)));
  }
  assert.equal(decodeRaster(rasterize(modules, { size: 512, border: 4 })), 'https://alblicht.dev');
});

test('PNG-Raster: Ecken in Hintergrundfarbe, Finder-Muster in Codefarbe', () => {
  const { modules } = encode('Test', 'M');
  const r = rasterize(modules, { size: 512, border: 4, fg: '#112233', bg: '#ffeedd' });
  const px = (x, y) => Array.from(r.data.slice((y * 512 + x) * 4, (y * 512 + x) * 4 + 4));
  assert.deepEqual(px(0, 0), [0xff, 0xee, 0xdd, 255]);
  assert.deepEqual(px(511, 511), [0xff, 0xee, 0xdd, 255]);
  const offset = Math.floor((512 - (modules.size + 8) * r.moduleSize) / 2) + 4 * r.moduleSize;
  assert.deepEqual(px(offset, offset), [0x11, 0x22, 0x33, 255], 'linke obere Ecke des Finder-Musters');
});

test('auch Version 40 bekommt bei 512 px mindestens 2 px je Modul', () => {
  const { modules, version } = encode('a'.repeat(2900), 'L');
  assert.equal(version, 40);
  assert.ok(rasterize(modules, { size: 512, border: 4 }).moduleSize >= 2);
});

test('Ruhezone 0 ist möglich', () => {
  const { modules } = encode('Test', 'M');
  const svg = toSvg(modules, { border: 0 });
  assert.match(svg, new RegExp(`viewBox="0 0 ${modules.size} ${modules.size}"`));
  assert.ok(rasterize(modules, { size: 512, border: 0 }).moduleSize >= 1);
});

test('SVG: Aufbau und Pfad', () => {
  const modules = { size: 3, data: Uint8Array.from([1, 1, 0, 0, 1, 0, 1, 1, 1]) };
  assert.equal(toSvgPath(modules, 1), 'M1 1h2v1h-2zM2 2h1v1h-1zM1 3h3v1h-3z');
  const svg = toSvg(modules, { border: 1, fg: '#2D5BFF', bg: '#FFFFFF' });
  assert.match(svg, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(svg, /viewBox="0 0 5 5"/);
  assert.match(svg, /<rect width="5" height="5" fill="#ffffff"\/>/);
  assert.match(svg, /fill="#2d5bff"/);
  assert.match(svg, /shape-rendering="crispEdges"/);
});

test('ungültige Farben werden abgelehnt (kein Einschleusen in SVG)', () => {
  const { modules } = encode('Test', 'M');
  assert.throws(() => toSvg(modules, { fg: 'red"/><script>' }), RangeError);
  assert.throws(() => rasterize(modules, { size: 512, bg: 'blue' }), RangeError);
});

test('Kontrast nach WCAG', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
  assert.equal(contrastRatio('#2d5bff', '#2d5bff'), 1);
  assert.equal(relativeLuminance('#ffffff'), 1);
  assert.deepEqual(hexToRgb('#2d5bff'), [45, 91, 255]);
  assert.ok(contrastRatio('#2d5bff', '#ffffff') > 4.5, 'Alblicht-Blau auf Weiß reicht');
});

test('Farbhinweise: passend, zu wenig Kontrast, vertauscht', () => {
  assert.deepEqual(colorNotes('#000000', '#ffffff'), []);
  assert.equal(colorNotes('#9db4ff', '#ffffff')[0].code, 'contrast');
  assert.match(colorNotes('#9db4ff', '#ffffff')[0].text, /\d,\d : 1/);
  assert.equal(colorNotes('#ffffff', '#000000')[0].code, 'inverted');
});

test('Druckgröße und Hinweise zu Version und Ruhezone', () => {
  assert.equal(minPrintWidthCm(21, 4), 2);
  assert.equal(minPrintWidthCm(57, 4), 3.5);
  assert.deepEqual(layoutNotes(3, 4), []);
  assert.equal(layoutNotes(10, 4)[0].level, 'info');
  assert.equal(layoutNotes(20, 4)[0].level, 'warn');
  assert.equal(layoutNotes(3, 2).length, 1);
});

test('zu viel Inhalt ergibt eine deutsche Fehlermeldung', () => {
  for (const ecl of ['L', 'M', 'Q', 'H']) {
    assert.throws(() => encode('x'.repeat(3000), ecl), (err) => err instanceof QrTooLongError && /Zu viel Inhalt/.test(err.message));
  }
  // Bei H passen weniger Daten als bei L
  assert.doesNotThrow(() => encode('x'.repeat(2000), 'L'));
  assert.throws(() => encode('x'.repeat(2000), 'H'), QrTooLongError);
});

test('halbes Emoji (einzelnes Surrogat) ergibt eine verständliche Fehlermeldung', () => {
  assert.throws(() => encode('Hallo \uD83C', 'M'), QrInvalidTextError);
});

test('unbekannte Fehlerkorrektur wird abgelehnt', () => {
  assert.throws(() => encode('Test', 'X'), RangeError);
});

test('Byte-Zählung in UTF-8', () => {
  assert.equal(byteLength('abc'), 3);
  assert.equal(byteLength('äöü'), 6);
  assert.equal(byteLength('🎺'), 4);
});
