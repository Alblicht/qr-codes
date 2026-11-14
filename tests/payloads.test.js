// Prüfungen, Fehlermeldungen und Hinweise beim Zusammensetzen der Inhalte.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPayload, escapeWifi, escapeVCard, normalizeUrl, normalizePhone } from '../js/payloads.js';

test('leere Pflichtfelder: kein Inhalt, keine Fehlermeldung, nur "fehlt noch"', () => {
  const cases = {
    url: ['Webadresse'],
    text: ['Text'],
    email: ['E-Mail-Adresse'],
    tel: ['Telefonnummer'],
    wifi: ['Netzwerkname (SSID)', 'Passwort'],
    vcard: ['Name oder Organisation'],
  };
  for (const [type, missing] of Object.entries(cases)) {
    const r = buildPayload(type, {});
    assert.equal(r.payload, null, type);
    assert.deepEqual(r.missing, missing, type);
    assert.deepEqual(r.fieldErrors, {}, type);
  }
});

test('Text nur aus Leerzeichen gilt als leer', () => {
  assert.equal(buildPayload('text', { text: '   \n ' }).payload, null);
});

test('Webadresse: Schema, Endschrägstrich und Umlaut-Domain', () => {
  assert.equal(normalizeUrl('alblicht.dev').url, 'https://alblicht.dev');
  assert.equal(normalizeUrl('https://alblicht.dev/').url, 'https://alblicht.dev/');
  assert.equal(normalizeUrl('HTTPS://Alblicht.dev/Preise').url, 'https://alblicht.dev/Preise');
  assert.equal(normalizeUrl('  www.verein.de/mein verein  ').url, 'https://www.verein.de/mein%20verein');
  assert.match(normalizeUrl('müller-bäckerei.de').url, /^https:\/\/xn--/);
});

test('Webadresse: http ist erlaubt, aber mit Warnung', () => {
  const r = buildPayload('url', { url: 'http://verein.de' });
  assert.equal(r.payload, 'http://verein.de');
  assert.equal(r.notes.length, 1);
  assert.equal(r.notes[0].level, 'warn');
});

test('Webadresse: ungültige Eingaben werden abgelehnt', () => {
  for (const bad of ['verein', 'mailto:info@verein.de', 'tel:0151123', 'javascript:alert(1)', 'data:text/html,x', 'ftp://verein.de', 'info@verein.de', 'verein musterstadt.de']) {
    const r = buildPayload('url', { url: bad });
    assert.equal(r.payload, null, bad);
    assert.ok(r.fieldErrors.url, `keine Fehlermeldung für ${bad}`);
  }
});

test('E-Mail: ungültige Adresse, nur Adresse, Sonderzeichen in der Adresse', () => {
  assert.ok(buildPayload('email', { to: 'info@verein' }).fieldErrors.to);
  assert.equal(buildPayload('email', { to: 'info@verein.de' }).payload, 'mailto:info@verein.de');
  assert.equal(buildPayload('email', { to: 'a+b@verein.de' }).payload, 'mailto:a%2Bb@verein.de');
});

test('Telefon: Normalisierung und Fehler', () => {
  assert.deepEqual(normalizePhone('+49(0)151 123'), { phone: '+49151123' });
  assert.deepEqual(normalizePhone('0049 151 123'), { phone: '0049151123' });
  assert.deepEqual(normalizePhone('07363.123.45'), { phone: '0736312345' });
  assert.ok('error' in normalizePhone('0151 abc'));
  assert.ok('error' in normalizePhone('12'));
  assert.ok(buildPayload('tel', { tel: 'Hallo' }).fieldErrors.tel);
});

test('Telefon: Tipp bei führender 0, nicht bei +49 oder 0049', () => {
  assert.equal(buildPayload('tel', { tel: '0151 123456' }).notes.length, 1);
  assert.equal(buildPayload('tel', { tel: '+49 151 123456' }).notes.length, 0);
  assert.equal(buildPayload('tel', { tel: '0049 151 123456' }).notes.length, 0);
});

test('WLAN: Maskierung in der richtigen Reihenfolge', () => {
  assert.equal(escapeWifi('\\;'), '\\\\\\;');
  assert.equal(escapeWifi('a:b,c"d'), 'a\\:b\\,c\\"d');
  assert.equal(escapeWifi('normal'), 'normal');
});

test('WLAN: Warnungen zu Passwortlänge, langer SSID, Leerzeichen und WEP', () => {
  const short = buildPayload('wifi', { ssid: 'Gäste', security: 'WPA', password: 'kurz' });
  assert.ok(short.payload, 'zu kurzes Passwort erzeugt trotzdem einen Code');
  assert.ok(short.notes.some((n) => n.level === 'warn' && /8 bis 63/.test(n.text)));

  const hex64 = buildPayload('wifi', { ssid: 'Gäste', security: 'WPA', password: 'a'.repeat(64) });
  assert.ok(!hex64.notes.some((n) => /8 bis 63/.test(n.text)), '64 Hex-Zeichen sind gültig');

  const long = buildPayload('wifi', { ssid: 'Ü'.repeat(17), security: 'nopass' });
  assert.ok(long.notes.some((n) => /32 Byte/.test(n.text)));

  const spaced = buildPayload('wifi', { ssid: ' Gäste ', security: 'nopass' });
  assert.equal(spaced.payload, 'WIFI:T:nopass;S: Gäste ;;', 'Leerzeichen bleiben erhalten');
  assert.ok(spaced.notes.some((n) => /Leerzeichen/.test(n.text)));

  const wep = buildPayload('wifi', { ssid: 'Alt', security: 'WEP', password: '12345' });
  assert.ok(wep.notes.some((n) => /WEP ist veraltet/.test(n.text)));
});

test('WLAN: unbekannte Verschlüsselung fällt auf WPA zurück', () => {
  const r = buildPayload('wifi', { ssid: 'Gäste', security: 'XYZ', password: 'sommerfest2026' });
  assert.equal(r.payload, 'WIFI:T:WPA;S:Gäste;P:sommerfest2026;;');
});

test('vCard: Maskierung', () => {
  assert.equal(escapeVCard('a\\b'), 'a\\\\b');
  assert.equal(escapeVCard('a;b,c'), 'a\\;b\\,c');
  assert.equal(escapeVCard('Zeile 1\r\nZeile 2\nZeile 3'), 'Zeile 1\\nZeile 2\\nZeile 3');
});

test('vCard: Fehler in Telefon, E-Mail und Webadresse verhindern den Code', () => {
  const r = buildPayload('vcard', { firstName: 'Anna', mobile: 'abc', email: 'anna@', url: 'nix' });
  assert.equal(r.payload, null);
  assert.deepEqual(Object.keys(r.fieldErrors).sort(), ['email', 'mobile', 'url']);
});

test('unbekannter Typ wirft einen Fehler', () => {
  assert.throws(() => buildPayload('fax', {}), RangeError);
});
