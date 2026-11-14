// Verdrahtung der Seite: Eingaben lesen, Vorschau zeichnen, Hinweise zeigen, Dateien erzeugen.
// Alles passiert im Browser. Es gibt keine Anfragen, keinen Speicher, keine Cookies.
// Nutzereingaben landen nur per textContent oder als SVG-Attribut im Dokument, nie als HTML.

import { TYPES, buildPayload } from './payloads.js';
import { encode, QrTooLongError, QrInvalidTextError } from './qr.js';
import { toSvg, toSvgPath, rasterize, colorNotes, layoutNotes, minPrintWidthCm } from './render.js';

const $ = (id) => document.getElementById(id);

const form = $('qrForm');
const ui = {
  previewTitle: $('qr-preview-title'),
  frame: form.querySelector('.qr-preview__frame'),
  svg: $('qrSvg'),
  svgBg: $('qrSvgBg'),
  svgPath: $('qrSvgPath'),
  empty: $('qrEmpty'),
  facts: $('qrFacts'),
  factSize: $('qrFactSize'),
  factEcl: $('qrFactEcl'),
  factPrint: $('qrFactPrint'),
  notes: $('qrNotes'),
  dlSvg: $('dlSvg'),
  dlPng: $('dlPng'),
  pngSize: $('pngSize'),
  ecl: $('optEcl'),
  fg: $('optFg'),
  bg: $('optBg'),
  fgValue: $('v-optFg'),
  bgValue: $('v-optBg'),
  border: $('optBorder'),
  swap: $('swapColors'),
  reset: $('resetColors'),
};

const EMPTY_TEXT = ui.empty.textContent;
const NOTE_PREFIX = { info: 'Hinweis: ', warn: 'Achtung: ', error: 'Fehler: ' };

/** Felder, die schon einmal verlassen wurden. Erst dann zeigen wir Fehler an. */
const touched = new Set();
/** Zuletzt erfolgreich erzeugter Code, Grundlage für die Downloads. */
let current = null;
let notesKey = '';
let scheduled = false;

// ---------- Eingaben lesen ----------

function activeType() {
  return form.elements.namedItem('type').value;
}

function panelFor(type) {
  return form.querySelector(`[data-panel="${type}"]`);
}

function readFields(panel) {
  const fields = {};
  for (const el of panel.querySelectorAll('input[name], textarea[name], select[name]')) {
    fields[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return fields;
}

function panelHasInput(panel) {
  return [...panel.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], textarea')]
    .some((el) => el.value.trim() !== '');
}

// ---------- Anzeige ----------

function syncPanels(type) {
  for (const panel of form.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== type;
  const wifi = panelFor('wifi');
  wifi.querySelector('[data-requires-password]').hidden = wifi.querySelector('[name="security"]').value === 'nopass';
}

function showFieldErrors(type, panel, fieldErrors) {
  let visible = 0;
  for (const el of panel.querySelectorAll('input[name], textarea[name], select[name]')) {
    const msg = fieldErrors[el.name];
    const show = Boolean(msg) && touched.has(`${type}:${el.name}`);
    const errEl = $(`e-${type}-${el.name}`);
    if (errEl) {
      const text = show ? msg : '';
      if (errEl.textContent !== text) errEl.textContent = text;
    }
    if (show) {
      el.setAttribute('aria-invalid', 'true');
      visible++;
    } else {
      el.removeAttribute('aria-invalid');
    }
  }
  return visible;
}

function formatCm(cm) {
  return `${String(cm).replace('.', ',')} cm`;
}

function renderPreview(encoded, { border, fg, bg, type, ecl }) {
  const total = encoded.size + border * 2;
  ui.svg.setAttribute('viewBox', `0 0 ${total} ${total}`);
  ui.svgBg.setAttribute('width', String(total));
  ui.svgBg.setAttribute('height', String(total));
  ui.svgBg.setAttribute('fill', bg);
  ui.svgPath.setAttribute('d', toSvgPath(encoded.modules, border));
  ui.svgPath.setAttribute('fill', fg);
  ui.svg.setAttribute('aria-label', `QR-Code mit ${TYPES[type].label}`);
  // SVG-Elemente kennen die Eigenschaft .hidden nicht, daher das Attribut direkt setzen
  ui.svg.removeAttribute('hidden');
  ui.empty.hidden = true;
  ui.frame.classList.remove('is-empty');

  ui.factSize.textContent = `${encoded.size} × ${encoded.size} Module`;
  ui.factEcl.textContent = encoded.ecl === ecl ? encoded.ecl : `${encoded.ecl} (automatisch erhöht)`;
  ui.factPrint.textContent = formatCm(minPrintWidthCm(encoded.size, border));
  ui.facts.hidden = false;
}

function renderEmpty(text) {
  ui.svg.setAttribute('hidden', '');
  ui.empty.hidden = false;
  if (ui.empty.textContent !== text) ui.empty.textContent = text;
  ui.frame.classList.add('is-empty');
  ui.facts.hidden = true;
}

function noteItem(note) {
  const li = document.createElement('li');
  li.className = `qr-note qr-note--${note.level}`;
  const prefix = document.createElement('span');
  prefix.className = 'sr-only';
  prefix.textContent = NOTE_PREFIX[note.level] ?? '';
  li.append(prefix, note.text);
  if (note.code === 'inverted') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'qr-note__action';
    btn.textContent = 'Farben tauschen';
    btn.addEventListener('click', () => {
      swapColors();
      ui.previewTitle.focus();
    });
    li.append(document.createElement('br'), btn);
  }
  return li;
}

function renderNotes(notes) {
  // Nur neu aufbauen, wenn sich etwas geändert hat: sonst liest der Screenreader bei jedem Tastendruck vor.
  const key = notes.map((n) => `${n.level}:${n.text}`).join('|');
  if (key === notesKey) return;
  notesKey = key;
  ui.notes.replaceChildren(...notes.map(noteItem));
}

// ---------- Hauptablauf ----------

function update() {
  scheduled = false;
  const type = activeType();
  syncPanels(type);
  const panel = panelFor(type);
  const result = buildPayload(type, readFields(panel));
  const visibleErrors = showFieldErrors(type, panel, result.fieldErrors);

  const ecl = ui.ecl.value;
  const border = Number(ui.border.value);
  const fg = ui.fg.value;
  const bg = ui.bg.value;
  ui.fgValue.textContent = fg;
  ui.bgValue.textContent = bg;

  const notes = [...result.notes];
  let encoded = null;
  let emptyText = EMPTY_TEXT;

  if (result.payload !== null) {
    try {
      encoded = encode(result.payload, ecl);
    } catch (err) {
      if (!(err instanceof QrTooLongError || err instanceof QrInvalidTextError)) throw err;
      notes.unshift({ level: 'error', text: err.message });
      emptyText = err instanceof QrTooLongError ? 'Zu viel Inhalt für einen QR-Code.' : 'Ungültiges Zeichen im Inhalt.';
    }
  } else if (Object.keys(result.fieldErrors).length) {
    emptyText = visibleErrors ? 'Bitte die markierten Eingaben prüfen.' : 'Die Eingabe ist noch nicht vollständig.';
  } else if (result.missing.length && panelHasInput(panel)) {
    emptyText = `Noch ausfüllen: ${result.missing.join(', ')}`;
  }

  if (encoded) {
    notes.push(...layoutNotes(encoded.version, border));
    renderPreview(encoded, { border, fg, bg, type, ecl });
  } else {
    renderEmpty(emptyText);
  }
  notes.push(...colorNotes(fg, bg));
  renderNotes(notes);

  current = encoded ? { type, modules: encoded.modules, border, fg, bg } : null;
  ui.dlSvg.disabled = !current;
  ui.dlPng.disabled = !current;
}

// Mehrere Ereignisse derselben Eingabe (input + change) lösen nur eine Aktualisierung aus.
// Bewusst Microtask statt requestAnimationFrame: läuft auch in Hintergrund-Tabs sofort,
// damit Vorschau und Download-Daten immer zusammenpassen.
function schedule() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(update);
}

// ---------- Farben ----------

function swapColors() {
  const fg = ui.fg.value;
  ui.fg.value = ui.bg.value;
  ui.bg.value = fg;
  schedule();
}

function resetColors() {
  ui.fg.value = '#000000';
  ui.bg.value = '#ffffff';
  schedule();
}

// ---------- Downloads ----------

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function downloadSvg() {
  if (!current) return;
  const svg = toSvg(current.modules, current);
  saveBlob(new Blob([svg], { type: 'image/svg+xml' }), `qr-code-${TYPES[current.type].file}.svg`);
}

function downloadPng() {
  if (!current) return;
  const size = Number(ui.pngSize.value);
  const { data, width, height } = rasterize(current.modules, { size, border: current.border, fg: current.fg, bg: current.bg });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
  const filename = `qr-code-${TYPES[current.type].file}-${size}px.png`;
  canvas.toBlob((blob) => {
    if (blob) saveBlob(blob, filename);
  }, 'image/png');
}

// ---------- Ereignisse ----------

form.addEventListener('input', schedule);
form.addEventListener('change', schedule);
form.addEventListener('submit', (e) => e.preventDefault());
form.addEventListener('focusout', (e) => {
  const el = e.target;
  const panel = el.closest?.('[data-panel]');
  if (!panel || !el.name || typeof el.value !== 'string' || el.value.trim() === '') return;
  const key = `${panel.dataset.panel}:${el.name}`;
  if (!touched.has(key)) {
    touched.add(key);
    schedule();
  }
});
ui.swap.addEventListener('click', swapColors);
ui.reset.addEventListener('click', resetColors);
ui.dlSvg.addEventListener('click', downloadSvg);
ui.dlPng.addEventListener('click', downloadPng);
ui.previewTitle.tabIndex = -1;

// Beim Zurückblättern stellt der Browser Formularwerte wieder her: Vorschau neu zeichnen.
window.addEventListener('pageshow', schedule);
update();
