// Gemeinsame Hilfen für die Tests: QR-Code erzeugen, rastern und mit jsQR zurücklesen.
// jsQR ist nur eine Entwicklungs-Abhängigkeit und wird nicht mit der Seite ausgeliefert.

import jsQRModule from 'jsqr';
import { encode } from '../js/qr.js';
import { rasterize, toSvg } from '../js/render.js';

const jsQR = jsQRModule.default ?? jsQRModule;

/**
 * Liest ein RGBA-Raster mit jsQR und gibt den Inhalt als UTF-8-Text zurück (oder null).
 * Wir dekodieren die Rohbytes selbst, damit Umlaute exakt verglichen werden.
 */
export function decodeRaster({ data, width, height }) {
  const found = jsQR(data, width, height, { inversionAttempts: 'dontInvert' });
  if (!found) return null;
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(found.binaryData));
}

/** Inhalt → QR-Code → Pixelraster → jsQR → Text */
export function roundtripRaster(payload, { ecl = 'M', border = 4, fg, bg, scale = 4 } = {}) {
  const { modules } = encode(payload, ecl);
  const size = (modules.size + border * 2) * scale;
  return decodeRaster(rasterize(modules, { size, border, fg, bg }));
}

/**
 * Liest unsere SVG-Datei zurück in ein Modulraster (inklusive Ruhezone)
 * und die beiden Farben. So prüfen wir den echten SVG-Export.
 */
export function parseSvg(svg) {
  const total = Number(/viewBox="0 0 (\d+) \1"/.exec(svg)?.[1]);
  const bg = /<rect [^>]*fill="(#[0-9a-f]{6})"/.exec(svg)?.[1];
  const pathMatch = /<path d="([^"]*)" fill="(#[0-9a-f]{6})"\/>/.exec(svg);
  if (!total || !bg || !pathMatch) throw new Error('SVG hat nicht das erwartete Format');
  const [, d, fg] = pathMatch;

  const data = new Uint8Array(total * total);
  const runRe = /M(\d+) (\d+)h(\d+)v1h-(\d+)z/g;
  let consumed = 0;
  for (const m of d.matchAll(runRe)) {
    const [, x, y, len, back] = m.map(Number);
    if (len !== back) throw new Error('Pfad-Lauf nicht geschlossen');
    for (let i = 0; i < len; i++) data[y * total + x + i] = 1;
    consumed += m[0].length;
  }
  if (consumed !== d.length) throw new Error('Unerwartete Befehle im SVG-Pfad');
  return { modules: { size: total, data }, fg, bg };
}

/** Inhalt → QR-Code → SVG-Datei → zurückgelesenes Raster → jsQR → Text */
export function roundtripSvg(payload, { ecl = 'M', border = 4, fg, bg } = {}) {
  const { modules } = encode(payload, ecl);
  const svg = toSvg(modules, { border, fg, bg });
  const parsed = parseSvg(svg);
  const raster = rasterize(parsed.modules, { size: parsed.modules.size * 4, border: 0, fg: parsed.fg, bg: parsed.bg });
  return decodeRaster(raster);
}

/**
 * Kleiner Referenz-Parser für "WIFI:"-Inhalte, um die Maskierung zurückzurechnen.
 * @returns {Record<string, string>}
 */
export function parseWifi(payload) {
  if (!payload.startsWith('WIFI:')) throw new Error('Kein WIFI-Inhalt');
  const fields = {};
  let i = 5;
  while (i < payload.length && payload[i] !== ';') {
    const colon = payload.indexOf(':', i);
    const key = payload.slice(i, colon);
    let value = '';
    i = colon + 1;
    while (payload[i] !== ';') {
      if (payload[i] === '\\') i++;
      value += payload[i++];
      if (i >= payload.length) throw new Error('Feld nicht abgeschlossen');
    }
    fields[key] = value;
    i++;
  }
  return fields;
}
