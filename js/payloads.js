// Inhalte der QR-Codes je Typ: zusammensetzen, korrekt maskieren und prüfen.
// Reine Funktionen ohne DOM, damit wir sie in Node testen können.

/**
 * @typedef {{ level: 'info' | 'warn', text: string, code?: string }} Note
 * @typedef {{
 *   payload: string | null,      // fertiger Inhalt oder null, solange etwas fehlt oder falsch ist
 *   missing: string[],           // Bezeichnungen von Pflichtfeldern, die noch leer sind
 *   fieldErrors: Record<string, string>, // Fehlermeldung je Feldname
 *   notes: Note[],               // Hinweise und Warnungen zum Inhalt
 * }} BuildResult
 */

/** Typen mit Anzeigename und Teil des Dateinamens. */
export const TYPES = {
  url: { label: 'Webadresse', file: 'webadresse' },
  text: { label: 'Text', file: 'text' },
  email: { label: 'E-Mail', file: 'e-mail' },
  tel: { label: 'Telefon', file: 'telefon' },
  wifi: { label: 'WLAN', file: 'wlan' },
  vcard: { label: 'Kontakt', file: 'kontakt' },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Baut den Inhalt für einen Typ.
 * @param {keyof TYPES} type
 * @param {Record<string, string | boolean>} fields Werte der Formularfelder (Name → Wert)
 * @returns {BuildResult}
 */
export function buildPayload(type, fields) {
  switch (type) {
    case 'url': return buildUrl(fields);
    case 'text': return buildText(fields);
    case 'email': return buildEmail(fields);
    case 'tel': return buildTel(fields);
    case 'wifi': return buildWifi(fields);
    case 'vcard': return buildVCard(fields);
    default: throw new RangeError(`Unbekannter Typ: ${type}`);
  }
}

function result() {
  return { payload: null, missing: [], fieldErrors: {}, notes: [] };
}

const str = (v) => (typeof v === 'string' ? v : '');

// ---------- Webadresse ----------

/**
 * Prüft eine Webadresse und ergänzt https://, wenn kein Schema angegeben ist.
 * Umlaut-Domains werden in die technische Schreibweise (xn--…) umgewandelt,
 * Leerzeichen und Umlaute im Pfad prozentkodiert. So lesen alle Scanner die Adresse gleich.
 * @returns {{ url: string, notes: Note[] } | { error: string }}
 */
export function normalizeUrl(input) {
  const raw = str(input).trim();
  if (/^mailto:/i.test(raw)) return { error: 'Das ist eine E-Mail-Adresse. Bitte oben den Typ „E-Mail“ wählen.' };
  if (/^tel:/i.test(raw)) return { error: 'Das ist eine Telefonnummer. Bitte oben den Typ „Telefon“ wählen.' };

  let candidate = raw;
  if (!/^https?:\/\//i.test(candidate)) {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate) || /^(javascript|data|file|vbscript|blob):/i.test(candidate)) {
      return { error: 'Bitte nur Adressen mit http:// oder https:// verwenden.' };
    }
    if (EMAIL_RE.test(candidate) && !candidate.includes('/')) {
      return { error: 'Das sieht nach einer E-Mail-Adresse aus. Bitte oben den Typ „E-Mail“ wählen.' };
    }
    candidate = 'https://' + candidate.replace(/^\/+/, '');
  }

  let u;
  try {
    u = new URL(candidate);
  } catch {
    return { error: 'Bitte eine gültige Webadresse eingeben, zum Beispiel verein-musterstadt.de.' };
  }
  if (!u.hostname.includes('.')) {
    return { error: 'Die Adresse braucht eine Endung wie .de oder .com.' };
  }

  let url = u.href;
  // new URL() hängt an eine reine Domain ein "/" an. Das lassen wir weg, wenn es nicht eingegeben wurde.
  if (u.pathname === '/' && !u.search && !u.hash && !candidate.endsWith('/')) url = url.slice(0, -1);

  const notes = [];
  if (u.protocol === 'http:') {
    notes.push({ level: 'warn', text: 'Die Adresse ist unverschlüsselt (http). Wenn deine Seite https kann, nimm besser https://.' });
  }
  return { url, notes };
}

function buildUrl(fields) {
  const r = result();
  const raw = str(fields.url).trim();
  if (!raw) {
    r.missing.push('Webadresse');
    return r;
  }
  const n = normalizeUrl(raw);
  if ('error' in n) {
    r.fieldErrors.url = n.error;
    return r;
  }
  r.payload = n.url;
  r.notes.push(...n.notes);
  return r;
}

// ---------- Text ----------

function buildText(fields) {
  const r = result();
  const text = str(fields.text).replace(/\r\n?/g, '\n');
  if (!text.trim()) {
    r.missing.push('Text');
    return r;
  }
  r.payload = text;
  return r;
}

// ---------- E-Mail ----------

function buildEmail(fields) {
  const r = result();
  const to = str(fields.to).trim();
  const subject = str(fields.subject).trim();
  // RFC 6068: Zeilenumbrüche im Text als CRLF (%0D%0A)
  const body = str(fields.body).replace(/\r\n?|\n/g, '\r\n');

  if (!to) {
    r.missing.push('E-Mail-Adresse');
    return r;
  }
  if (!EMAIL_RE.test(to)) {
    r.fieldErrors.to = 'Bitte eine gültige E-Mail-Adresse eingeben, zum Beispiel info@verein-musterstadt.de.';
    return r;
  }

  const params = [];
  if (subject) params.push('subject=' + encodeURIComponent(subject));
  if (body.trim()) params.push('body=' + encodeURIComponent(body));
  // Das @ bleibt lesbar, alle anderen Sonderzeichen der Adresse werden kodiert.
  const addr = encodeURIComponent(to).replace(/%40/g, '@');
  r.payload = 'mailto:' + addr + (params.length ? '?' + params.join('&') : '');
  return r;
}

// ---------- Telefon ----------

/**
 * Entfernt Leerzeichen, Schrägstriche, Bindestriche, Klammern, Punkte
 * und die "(0)" nach einer Ländervorwahl (+49 (0) 151 … → +49151…).
 * @returns {{ phone: string } | { error: string }}
 */
export function normalizePhone(input) {
  let s = str(input).trim().replace(/[  ]/g, ' ');
  s = s.replace(/^(\+\d{1,3})\s*\(0\)/, '$1');
  s = s.replace(/[\s/().-]/g, '');
  if (!/^\+?\d{3,20}$/.test(s)) {
    return { error: 'Bitte nur Ziffern verwenden, am Anfang ist ein + erlaubt.' };
  }
  return { phone: s };
}

function buildTel(fields) {
  const r = result();
  const raw = str(fields.tel).trim();
  if (!raw) {
    r.missing.push('Telefonnummer');
    return r;
  }
  const n = normalizePhone(raw);
  if ('error' in n) {
    r.fieldErrors.tel = n.error;
    return r;
  }
  if (/^0(?!0)/.test(n.phone)) {
    r.notes.push({ level: 'info', text: 'Tipp: Mit +49 statt der ersten 0 klappt der Anruf auch von ausländischen Handys.' });
  }
  r.payload = 'tel:' + n.phone;
  return r;
}

// ---------- WLAN ----------

/** Maskiert \ ; , : " mit einem Backslash (Format "WIFI:" nach ZXing). */
export function escapeWifi(value) {
  return value.replace(/([\\;,:"])/g, '\\$1');
}

function buildWifi(fields) {
  const r = result();
  const ssid = str(fields.ssid);
  const security = ['WPA', 'WEP', 'nopass'].includes(fields.security) ? fields.security : 'WPA';
  const password = str(fields.password);
  const hidden = fields.hidden === true || fields.hidden === 'on';

  // Netzwerkname und Passwort werden nicht gekürzt: Leerzeichen können dazugehören.
  if (!ssid.trim()) r.missing.push('Netzwerkname (SSID)');
  if (security !== 'nopass' && !password) r.missing.push('Passwort');
  if (r.missing.length) return r;

  const ssidBytes = new TextEncoder().encode(ssid).length;
  if (ssidBytes > 32) {
    r.notes.push({ level: 'warn', text: `Netzwerknamen haben höchstens 32 Byte, dieser hat ${ssidBytes}. Bitte genau so abschreiben, wie er im Router steht.` });
  }
  if (ssid !== ssid.trim()) {
    r.notes.push({ level: 'warn', text: 'Der Netzwerkname beginnt oder endet mit einem Leerzeichen. Bitte prüfen, ob das stimmt.' });
  }
  if (security === 'WPA') {
    const isHex64 = /^[0-9a-f]{64}$/i.test(password);
    if (!isHex64 && (password.length < 8 || password.length > 63)) {
      r.notes.push({ level: 'warn', text: 'WPA-Passwörter haben 8 bis 63 Zeichen. Bitte das Passwort prüfen.' });
    }
  }
  if (security === 'WEP') {
    r.notes.push({ level: 'warn', text: 'WEP ist veraltet und unsicher. Wenn dein Router es kann, stell auf WPA2 oder WPA3 um.' });
  }
  if (security !== 'nopass') {
    r.notes.push({ level: 'info', text: 'Das Passwort steht lesbar im Code. Nutze das am besten für ein eigenes Gäste-WLAN.' });
  }

  let payload = `WIFI:T:${security};S:${escapeWifi(ssid)};`;
  if (security !== 'nopass') payload += `P:${escapeWifi(password)};`;
  if (hidden) payload += 'H:true;';
  r.payload = payload + ';';
  return r;
}

// ---------- Kontakt (vCard 3.0) ----------

/** Maskiert Text für vCard 3.0 (RFC 2426): \ , ; und Zeilenumbrüche. */
export function escapeVCard(value) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n?|\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');
}

function buildVCard(fields) {
  const r = result();
  const f = (name) => str(fields[name]).trim();
  const first = f('firstName');
  const last = f('lastName');
  const org = f('org');

  if (!first && !last && !org) {
    r.missing.push('Name oder Organisation');
    return r;
  }

  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  const e = escapeVCard;
  const fullName = [first, last].filter(Boolean).join(' ') || org;
  lines.push(`N:${e(last)};${e(first)};;;`);
  lines.push(`FN:${e(fullName)}`);
  if (org) lines.push(`ORG:${e(org)}`);
  if (f('title')) lines.push(`TITLE:${e(f('title'))}`);

  for (const [name, type] of [['mobile', 'CELL'], ['phone', 'WORK,VOICE']]) {
    if (!f(name)) continue;
    const n = normalizePhone(f(name));
    if ('error' in n) r.fieldErrors[name] = n.error;
    else lines.push(`TEL;TYPE=${type}:${n.phone}`);
  }

  const email = f('email');
  if (email) {
    if (EMAIL_RE.test(email)) lines.push(`EMAIL;TYPE=INTERNET:${e(email)}`);
    else r.fieldErrors.email = 'Bitte eine gültige E-Mail-Adresse eingeben.';
  }

  const url = f('url');
  if (url) {
    const n = normalizeUrl(url);
    if ('error' in n) r.fieldErrors.url = n.error;
    // URL hat in vCard 3.0 den Werttyp uri und wird nicht wie Text maskiert
    else lines.push(`URL:${n.url}`);
  }

  const street = f('street');
  const zip = f('zip');
  const city = f('city');
  const country = f('country');
  if (street || zip || city || country) {
    // ADR: Postfach;Adresszusatz;Straße;Ort;Region;PLZ;Land
    lines.push(`ADR;TYPE=WORK:;;${e(street)};${e(city)};;${e(zip)};${e(country)}`);
  }

  const note = str(fields.note).trim();
  if (note) lines.push(`NOTE:${e(note)}`);

  lines.push('END:VCARD');

  if (Object.keys(r.fieldErrors).length) return r;
  // Zeilenende CRLF nach Standard. Lange Zeilen falten wir bewusst nicht:
  // Scanner lesen sie problemlos, beim Falten könnten Umlaute zerschnitten werden.
  r.payload = lines.join('\r\n');
  return r;
}
