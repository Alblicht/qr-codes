// Rundlauf: jeden Typ erzeugen, mit jsQR zurücklesen und mit dem erwarteten Inhalt vergleichen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPayload } from '../js/payloads.js';
import { encode } from '../js/qr.js';
import { roundtripRaster, roundtripSvg, parseWifi } from './helpers.js';

const CASES = [
  {
    name: 'Webadresse ohne Schema',
    type: 'url',
    fields: { url: 'verein-musterstadt.de/termine?jahr=2026' },
    expected: 'https://verein-musterstadt.de/termine?jahr=2026',
  },
  {
    name: 'Text mit Umlauten, Zeilenumbruch und Emoji',
    type: 'text',
    fields: { text: 'Probe am Dienstag, 19:30 Uhr\r\nIm Vereinsheim – bitte Noten mitbringen! Grüße 🎺' },
    expected: 'Probe am Dienstag, 19:30 Uhr\nIm Vereinsheim – bitte Noten mitbringen! Grüße 🎺',
  },
  {
    name: 'E-Mail mit Betreff (Umlaut) und mehrzeiligem Text',
    type: 'email',
    fields: { to: 'info@verein-musterstadt.de', subject: 'Anmeldung Sommerfest & Grillen', body: 'Hallo,\nwir kommen zu zweit.\nGrüße' },
    expected: 'mailto:info@verein-musterstadt.de?subject=Anmeldung%20Sommerfest%20%26%20Grillen'
      + '&body=Hallo%2C%0D%0Awir%20kommen%20zu%20zweit.%0D%0AGr%C3%BC%C3%9Fe',
  },
  {
    name: 'Telefon mit Schrägstrich und Bindestrich',
    type: 'tel',
    fields: { tel: '0151 / 123 45-67' },
    expected: 'tel:01511234567',
  },
  {
    name: 'Telefon international mit (0)',
    type: 'tel',
    fields: { tel: '+49 (0) 7363 123-45' },
    expected: 'tel:+49736312345',
  },
  {
    name: 'WLAN mit allen Sonderzeichen',
    type: 'wifi',
    fields: { ssid: 'Café "Gäste";Netz', security: 'WPA', password: 'a\\b;c,d:e"f!', hidden: false },
    expected: String.raw`WIFI:T:WPA;S:Café \"Gäste\"\;Netz;P:a\\b\;c\,d\:e\"f!;;`,
  },
  {
    name: 'WLAN offen und versteckt',
    type: 'wifi',
    fields: { ssid: 'Gäste-WLAN', security: 'nopass', password: 'wird ignoriert', hidden: true },
    expected: 'WIFI:T:nopass;S:Gäste-WLAN;H:true;;',
  },
  {
    name: 'Kontakt mit Umlauten und Sonderzeichen',
    type: 'vcard',
    fields: {
      firstName: 'Jürgen',
      lastName: 'Müller',
      org: 'Musikverein Göppingen; Jugend, Bläser',
      title: 'Kassier',
      mobile: '0151 / 123 45-67',
      phone: '+49 (0) 7161 12345',
      email: 'kasse@mv-goeppingen.de',
      url: 'mv-goeppingen.de',
      street: 'Hauptstraße 5',
      zip: '73033',
      city: 'Göppingen',
      country: 'Deutschland',
      note: 'Sprechzeit:\nDienstags ab 18 Uhr\\Vereinsheim',
    },
    expected: [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Müller;Jürgen;;;',
      'FN:Jürgen Müller',
      String.raw`ORG:Musikverein Göppingen\; Jugend\, Bläser`,
      'TITLE:Kassier',
      'TEL;TYPE=CELL:01511234567',
      'TEL;TYPE=WORK,VOICE:+49716112345',
      'EMAIL;TYPE=INTERNET:kasse@mv-goeppingen.de',
      'URL:https://mv-goeppingen.de',
      'ADR;TYPE=WORK:;;Hauptstraße 5;Göppingen;;73033;Deutschland',
      String.raw`NOTE:Sprechzeit:\nDienstags ab 18 Uhr\\Vereinsheim`,
      'END:VCARD',
    ].join('\r\n'),
  },
  {
    name: 'Kontakt nur mit Organisation',
    type: 'vcard',
    fields: { org: 'Bäckerei Groß' },
    expected: 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:;;;;\r\nFN:Bäckerei Groß\r\nORG:Bäckerei Groß\r\nEND:VCARD',
  },
];

for (const c of CASES) {
  test(`${c.name}: Inhalt stimmt`, () => {
    const r = buildPayload(c.type, c.fields);
    assert.deepEqual(r.fieldErrors, {});
    assert.deepEqual(r.missing, []);
    assert.equal(r.payload, c.expected);
  });

  test(`${c.name}: PNG-Raster lässt sich zurücklesen`, () => {
    assert.equal(roundtripRaster(c.expected), c.expected);
  });

  test(`${c.name}: SVG-Datei lässt sich zurücklesen`, () => {
    assert.equal(roundtripSvg(c.expected), c.expected);
  });
}

test('WLAN-Maskierung lässt sich verlustfrei zurückrechnen', () => {
  const ssid = 'Café "Gäste";Netz\\:,';
  const password = 'a\\b;c,d:e"f';
  const { payload } = buildPayload('wifi', { ssid, security: 'WPA', password });
  const decoded = roundtripRaster(payload);
  assert.deepEqual(parseWifi(decoded), { T: 'WPA', S: ssid, P: password });
});

test('alle Fehlerkorrekturstufen lassen sich zurücklesen', () => {
  const text = 'https://verein-musterstadt.de/sommerfest-2026';
  const order = ['L', 'M', 'Q', 'H'];
  for (const ecl of order) {
    const { ecl: actual } = encode(text, ecl);
    assert.ok(order.indexOf(actual) >= order.indexOf(ecl), `Stufe ${actual} ist niedriger als ${ecl}`);
    assert.equal(roundtripRaster(text, { ecl }), text);
    assert.equal(roundtripSvg(text, { ecl }), text);
  }
});

test('Ruhezone 2, 4 und 8 lässt sich zurücklesen', () => {
  const text = 'WIFI:T:WPA;S:Gäste;P:sommerfest2026;;';
  for (const border of [2, 4, 8]) {
    assert.equal(roundtripRaster(text, { border }), text, `Ruhezone ${border}`);
    assert.equal(roundtripSvg(text, { border }), text, `Ruhezone ${border} (SVG)`);
  }
});

test('farbige Codes mit genug Kontrast lassen sich zurücklesen', () => {
  const text = 'https://alblicht.dev';
  for (const [fg, bg] of [['#1d2b6b', '#f3ead7'], ['#2d5bff', '#ffffff'], ['#0c0d10', '#eef0f2']]) {
    assert.equal(roundtripRaster(text, { fg, bg }), text, `${fg} auf ${bg}`);
    assert.equal(roundtripSvg(text, { fg, bg }), text, `${fg} auf ${bg} (SVG)`);
  }
});

test('großer Inhalt nahe der Grenze lässt sich zurücklesen', () => {
  const text = 'Ä'.repeat(600); // 1200 Byte, Fehlerkorrektur M → Version 27 oder höher
  const { version } = encode(text, 'M');
  assert.ok(version >= 25, `Version ${version}`);
  assert.equal(roundtripRaster(text, { scale: 3 }), text);
});
