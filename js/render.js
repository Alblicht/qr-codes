// Darstellung der QR-Module: SVG-Pfad, SVG-Datei, Pixelraster für PNG sowie Farb- und Größenhinweise.
// Reine Funktionen ohne DOM, damit wir sie in Node testen können.

/** @typedef {{ size: number, data: Uint8Array }} Modules  (data[y * size + x] = 1 für dunkel) */
/** @typedef {import('./payloads.js').Note} Note */

const HEX_RE = /^#[0-9a-f]{6}$/i;

function checkColor(hex) {
  if (!HEX_RE.test(hex)) throw new RangeError(`Ungültige Farbe: ${hex}`);
  return hex.toLowerCase();
}

/**
 * SVG-Pfad aller dunklen Module, zeilenweise zu Läufen zusammengefasst
 * ("M x y h n v1 h-n z"). Koordinaten in Modulen, um die Ruhezone verschoben.
 * @param {Modules} modules
 * @param {number} border Ruhezone in Modulen
 */
export function toSvgPath(modules, border = 4) {
  const { size, data } = modules;
  let d = '';
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (!data[y * size + x]) { x++; continue; }
      const start = x;
      while (x < size && data[y * size + x]) x++;
      const len = x - start;
      d += `M${start + border} ${y + border}h${len}v1h-${len}z`;
    }
  }
  return d;
}

/**
 * Vollständige SVG-Datei zum Herunterladen (für den Druck, beliebig skalierbar).
 * @param {Modules} modules
 * @param {{ border?: number, fg?: string, bg?: string }} [options]
 */
export function toSvg(modules, { border = 4, fg = '#000000', bg = '#ffffff' } = {}) {
  const total = modules.size + border * 2;
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total * 10}" height="${total * 10}" shape-rendering="crispEdges">\n`
    + `<rect width="${total}" height="${total}" fill="${checkColor(bg)}"/>\n`
    + `<path d="${toSvgPath(modules, border)}" fill="${checkColor(fg)}"/>\n`
    + '</svg>\n';
}

/**
 * Pixelraster (RGBA) für den PNG-Export. Das Bild ist genau `size` × `size` Pixel groß.
 * Jedes Modul bekommt eine ganzzahlige Pixelgröße, damit die Kanten scharf bleiben;
 * was übrig bleibt, wird gleichmäßig als zusätzlicher Rand in Hintergrundfarbe verteilt.
 * @param {Modules} modules
 * @param {{ size: number, border?: number, fg?: string, bg?: string }} options
 * @returns {{ width: number, height: number, data: Uint8ClampedArray, moduleSize: number }}
 */
export function rasterize(modules, { size, border = 4, fg = '#000000', bg = '#ffffff' }) {
  const total = modules.size + border * 2;
  const moduleSize = Math.floor(size / total);
  if (moduleSize < 1) throw new RangeError(`Bild zu klein: ${size} px für ${total} Module`);

  const [fr, fgG, fb] = hexToRgb(checkColor(fg));
  const [br, bgG, bb] = hexToRgb(checkColor(bg));
  const data = new Uint8ClampedArray(size * size * 4);

  for (let i = 0; i < data.length; i += 4) {
    data[i] = br; data[i + 1] = bgG; data[i + 2] = bb; data[i + 3] = 255;
  }

  const offset = Math.floor((size - total * moduleSize) / 2) + border * moduleSize;
  const n = modules.size;
  for (let my = 0; my < n; my++) {
    for (let mx = 0; mx < n; mx++) {
      if (!modules.data[my * n + mx]) continue;
      const px0 = offset + mx * moduleSize;
      const py0 = offset + my * moduleSize;
      for (let py = py0; py < py0 + moduleSize; py++) {
        let i = (py * size + px0) * 4;
        for (let px = 0; px < moduleSize; px++, i += 4) {
          data[i] = fr; data[i + 1] = fgG; data[i + 2] = fb;
        }
      }
    }
  }
  return { width: size, height: size, data, moduleSize };
}

// ---------- Farben ----------

/** "#rrggbb" → [r, g, b] (0-255) */
export function hexToRgb(hex) {
  const v = parseInt(checkColor(hex).slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Relative Leuchtdichte nach WCAG 2 (0 = schwarz, 1 = weiß). */
export function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Kontrastverhältnis nach WCAG 2 (1 bis 21). */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Mindestkontrast, ab dem wir nicht mehr warnen. */
export const MIN_CONTRAST = 4.5;

/**
 * Hinweise zu den Farben.
 * @returns {Note[]}
 */
export function colorNotes(fg, bg) {
  const notes = [];
  const ratio = contrastRatio(fg, bg);
  if (relativeLuminance(fg) > relativeLuminance(bg)) {
    notes.push({
      level: 'warn',
      code: 'inverted',
      text: 'Heller Code auf dunklem Grund: Viele Handy-Kameras erkennen das nicht. Wähle für den Code die dunklere Farbe.',
    });
  } else if (ratio < MIN_CONTRAST) {
    notes.push({
      level: 'warn',
      code: 'contrast',
      text: `Zu wenig Kontrast (${formatRatio(ratio)}). Für sicheres Scannen mindestens ${formatRatio(MIN_CONTRAST)}, am besten dunkel auf Weiß.`,
    });
  }
  return notes;
}

function formatRatio(ratio) {
  return ratio.toFixed(1).replace('.', ',') + ' : 1';
}

// ---------- Größe und Ruhezone ----------

/**
 * Empfohlene Mindestbreite im Druck in Zentimetern:
 * 0,5 mm je Modul (inklusive Ruhezone), mindestens 2 cm, auf halbe Zentimeter aufgerundet.
 */
export function minPrintWidthCm(moduleCount, border = 4) {
  const cm = ((moduleCount + border * 2) * 0.5) / 10;
  return Math.max(2, Math.ceil(cm * 2) / 2);
}

/**
 * Hinweise zu Codegröße und Ruhezone.
 * @returns {Note[]}
 */
export function layoutNotes(version, border) {
  const notes = [];
  if (version >= 15) {
    notes.push({ level: 'warn', text: `Der Code ist sehr fein (Version ${version}). Kürze den Inhalt, wenn es geht, und druck ihn groß.` });
  } else if (version >= 10) {
    notes.push({ level: 'info', text: `Der Code wird recht fein (Version ${version}). Ein kürzerer Inhalt macht ihn gröber und leichter lesbar.` });
  }
  if (border < 4) {
    notes.push({ level: 'info', text: 'Weniger als 4 Module Ruhezone nur, wenn rund um den Code genug heller Rand bleibt.' });
  }
  return notes;
}
