// QR-Kodierung: dünne Hülle um die Bibliothek von Project Nayuki (js/vendor/qrcodegen.js).
// Wir schreiben die Kodierung bewusst nicht selbst, sondern nutzen die erprobte Bibliothek.

import { qrcodegen } from './vendor/qrcodegen.js';

const { QrCode } = qrcodegen;

const LEVELS = {
  L: QrCode.Ecc.LOW,
  M: QrCode.Ecc.MEDIUM,
  Q: QrCode.Ecc.QUARTILE,
  H: QrCode.Ecc.HIGH,
};
// Reihenfolge entspricht ordinal der Bibliothek (0 = L … 3 = H)
const LEVEL_NAMES = ['L', 'M', 'Q', 'H'];

/** Inhalt passt nicht in einen QR-Code (auch nicht in Version 40). */
export class QrTooLongError extends Error {
  constructor() {
    super('Zu viel Inhalt für einen QR-Code. Bitte kürzen oder eine niedrigere Fehlerkorrektur wählen.');
    this.name = 'QrTooLongError';
  }
}

/** Inhalt enthält ein Zeichen, das sich nicht als UTF-8 kodieren lässt (z. B. ein halbes Emoji). */
export class QrInvalidTextError extends Error {
  constructor() {
    super('Der Inhalt enthält ein ungültiges Zeichen. Bitte die letzte Eingabe prüfen.');
    this.name = 'QrInvalidTextError';
  }
}

/**
 * Erzeugt einen QR-Code aus einem Text.
 * Text wird als UTF-8 kodiert (Byte-Modus, ohne ECI); reine Ziffern oder Großbuchstaben
 * wählt die Bibliothek automatisch platzsparender. Ist bei gleicher Codegröße eine höhere
 * Fehlerkorrektur möglich, nimmt die Bibliothek diese: `ecl` im Ergebnis ist die tatsächliche Stufe.
 *
 * @param {string} payload
 * @param {'L'|'M'|'Q'|'H'} [ecl='M']
 * @returns {{ modules: { size: number, data: Uint8Array }, version: number, size: number, ecl: string }}
 */
export function encode(payload, ecl = 'M') {
  const level = LEVELS[ecl];
  if (!level) throw new RangeError(`Unbekannte Fehlerkorrektur: ${ecl}`);

  let qr;
  try {
    qr = QrCode.encodeText(payload, level);
  } catch (err) {
    if (err instanceof RangeError && err.message === 'Data too long') throw new QrTooLongError();
    if (err instanceof URIError) throw new QrInvalidTextError();
    throw err;
  }

  // Module als flaches Raster (1 = dunkel), damit Darstellung und Tests
  // nicht von der Bibliothek abhängen.
  const size = qr.size;
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (qr.getModule(x, y)) data[y * size + x] = 1;
    }
  }

  return {
    modules: { size, data },
    version: qr.version,
    size,
    ecl: LEVEL_NAMES[qr.errorCorrectionLevel.ordinal],
  };
}

/** Anzahl Bytes eines Textes in UTF-8. */
export function byteLength(text) {
  return new TextEncoder().encode(text).length;
}
