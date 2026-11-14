// Statische Regelprüfung: CSP-Tauglichkeit, keine Anfragen nach außen, Textregeln.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const html = read('index.html');
const ownJs = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`);
const vendorJs = readdirSync(join(ROOT, 'js/vendor')).filter((f) => f.endsWith('.js')).map((f) => `js/vendor/${f}`);
const css = readdirSync(join(ROOT, 'css')).filter((f) => f.endsWith('.css')).map((f) => `css/${f}`);

test('index.html: keine Inline-Skripte, keine style-Blöcke, keine style-Attribute, keine on*-Handler', () => {
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, 'Inline-Skript gefunden');
  assert.doesNotMatch(html, /<style[\s>]/i, '<style>-Block gefunden');
  assert.doesNotMatch(html, /\sstyle\s*=/i, 'style-Attribut gefunden');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'on*-Handler gefunden');
});

test('index.html: Skripte, Styles, Schriften und Icons nur aus eigenen Dateien', () => {
  for (const [, url] of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/gi)) {
    assert.doesNotMatch(url, /^(?:[a-z]+:)?\/\//i, `Externe Ressource: ${url}`);
  }
});

test('index.html: Meta-CSP ist gesetzt', () => {
  assert.match(html, /http-equiv="Content-Security-Policy"[^>]*default-src 'none'; script-src 'self'; style-src 'self'/);
});

test('JavaScript: kein eval, kein new Function, keine String-Timer', () => {
  for (const file of [...ownJs, ...vendorJs]) {
    const src = read(file);
    assert.doesNotMatch(src, /\beval\s*\(/, `${file}: eval`);
    assert.doesNotMatch(src, /\bnew\s+Function\s*\(/, `${file}: new Function`);
    assert.doesNotMatch(src, /\bset(?:Timeout|Interval)\s*\(\s*['"`]/, `${file}: Timer mit String`);
  }
});

test('eigenes JavaScript: kein innerHTML, keine Anfragen, kein Speicher, keine Cookies', () => {
  for (const file of ownJs) {
    const src = read(file);
    for (const [pattern, name] of [
      [/\b(?:inner|outer)HTML\b|insertAdjacentHTML|document\.write/, 'HTML aus Text'],
      [/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/, 'Netzwerk'],
      [/\blocalStorage\b|\bsessionStorage\b|indexedDB|document\.cookie/, 'Speicher/Cookies'],
      [/\bimport\s*\(\s*['"`]https?:/, 'Fremd-Import'],
      [/\.setAttribute\(\s*['"]style['"]/, 'style-Attribut'],
    ]) {
      assert.doesNotMatch(src, pattern, `${file}: ${name}`);
    }
  }
});

test('CSS: keine externen Adressen und kein @import', () => {
  for (const file of css) {
    const src = read(file);
    assert.doesNotMatch(src, /url\(\s*['"]?(?:[a-z]+:)?\/\//i, `${file}: externe url()`);
    assert.doesNotMatch(src, /@import/i, `${file}: @import`);
  }
});

test('Texte: "wir" statt "ich", gerades Apostroph, nie "handgebaut", keine Gedankenstriche auf der Seite', () => {
  const files = ['index.html', 'README.md', ...ownJs, ...css];
  for (const file of files) {
    let src;
    try { src = read(file); } catch { continue; }
    assert.doesNotMatch(src, /(?<!\p{L})ich(?!\p{L})/iu, `${file}: "ich"`);
    assert.doesNotMatch(src, /’/, `${file}: typografisches Apostroph`);
    assert.doesNotMatch(src, /handgebaut/i, `${file}: "handgebaut"`);
  }
  assert.doesNotMatch(html, /[–—]/, 'index.html: Gedankenstrich');
});
