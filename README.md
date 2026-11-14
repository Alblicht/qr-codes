# QR-Codes ohne Ablaufdatum

Ein kostenloser QR-Code-Generator von [Alblicht](https://alblicht.dev), der komplett im Browser läuft.
Kein Konto, keine Kurzlinks, kein Server, keine Datenübertragung.

## Warum?

Viele Gratis-Generatoren schreiben nicht deine Adresse in den Code, sondern einen eigenen Kurzlink.
Läuft die Testphase aus, schalten sie den Link ab, und gedruckte Flyer, Aushänge oder Visitenkarten
führen ins Leere. Hier enthält der Code direkt deine Angaben. Er funktioniert, solange es zum Beispiel
deine Webadresse gibt, ganz ohne uns.

Gedacht ist das Werkzeug für Vereine und kleine Betriebe, die keine Lust auf Technik haben.

## Was es kann

- **Typen:** Webadresse, Text, E-Mail, Telefon, WLAN-Zugang (z. B. Gäste-WLAN), Kontakt (vCard 3.0)
- **Live-Vorschau** beim Tippen, mit Größe des Codes und empfohlener Mindestbreite im Druck
- **Download** als SVG (für den Druck, beliebig skalierbar) und PNG in 512, 1024 oder 2048 px
- **Darstellung:** Fehlerkorrektur L/M/Q/H (Standard M), Farbe für Code und Hintergrund, Ruhezone
- **Warnungen** bei zu wenig Kontrast, bei hellem Code auf dunklem Grund, bei sehr feinen Codes
  und bei zu viel Inhalt
- **Korrektes Maskieren** von Sonderzeichen im WLAN-Format (`\ ; , : "`) und in der vCard
  (`\ , ;` und Zeilenumbrüche), Umlaute als UTF-8
- Mobil gut bedienbar, mit Tastatur und Screenreader nutzbar, komplett auf Deutsch

**Wichtig:** Teste jeden Code vor dem Druck mit dem Handy, am besten mit zwei verschiedenen Geräten
und aus dem Abstand, aus dem später gescannt wird.

## Datenschutz

Der Code entsteht ausschließlich in deinem Browser. Die Seite lädt nur ihre eigenen Dateien,
schickt nichts an einen Server, setzt keine Cookies, speichert nichts im Browser und zählt nichts mit.
Das ist technisch abgesichert: Die Seite läuft unter einer strengen Content Security Policy
(`default-src 'none'`), die Anfragen nach außen gar nicht erst zulässt.

## Lokal starten

Die Seite nutzt ES-Module. Browser laden diese nicht direkt aus einer Datei (`file://`), deshalb
braucht es einen kleinen Webserver. Ein passender liegt bei und kommt ohne Abhängigkeiten aus:

```bash
npm run serve
```

Danach läuft die Seite auf http://127.0.0.1:8080. Der Server sendet dieselbe strenge CSP wie im
Betrieb, Verstöße fallen also sofort in der Browser-Konsole auf. Ein Build-Schritt ist nicht nötig.

Voraussetzung: Node.js 20 oder neuer.

## Tests

```bash
npm install
```

```bash
npm test
```

Die Tests laufen mit dem eingebauten Test-Runner von Node.js. Für jeden Typ erzeugen sie einen
QR-Code, rastern ihn wie beim PNG-Export, lesen ihn mit [jsQR](https://github.com/cozmo/jsQR)
zurück und vergleichen den Inhalt Byte für Byte. Dasselbe passiert mit der SVG-Datei.
Dazu kommen Tests für Sonderzeichen, alle Fehlerkorrekturstufen, Ruhezonen, Farben, Bildgrößen
und Fehlermeldungen sowie eine statische Prüfung der CSP-Regeln und unserer Textregeln.

jsQR ist nur eine Entwicklungs-Abhängigkeit und wird nicht mit der Seite ausgeliefert.

## Aufbau

```
index.html               Seite (deutsch, mit Meta-CSP als Selbsttest)
css/basis.css            Grundlagen im Alblicht-Look: Schriften, Farben, Reset, Buttons
css/qr.css               Werkzeug-Styles, alle Klassen beginnen mit qr-
js/app.js                Verdrahtung der Seite (Eingaben, Vorschau, Downloads)
js/payloads.js           Inhalte je Typ zusammensetzen, maskieren und prüfen
js/qr.js                 Hülle um die QR-Bibliothek
js/render.js             SVG, Pixelraster für PNG, Kontrast und Größenhinweise
js/vendor/qrcodegen.js   QR Code generator library von Project Nayuki (MIT)
fonts/                   Hanken Grotesk und Oswald (SIL Open Font License)
tests/                   Tests für node --test
tools/serve.js           Kleiner Entwicklungsserver mit strenger CSP
```

Die QR-Kodierung haben wir bewusst nicht selbst geschrieben. Sie stammt aus der erprobten
Bibliothek von [Project Nayuki](https://www.nayuki.io/page/qr-code-generator-library).

## In eine eigene Webseite einbinden

Du willst das Werkzeug auf deiner Vereins- oder Firmenseite anbieten? Dafür braucht es keinen
Server-Code, ein paar Dateien auf dem Webspace reichen.

1. Die Ordner `css/`, `fonts/` und `js/` auf deinen Webspace kopieren.
2. Das Formular `<form class="qr-wrap qr-tool" id="qrForm">…</form>` aus `index.html` in deine Seite
   übernehmen. Die Abschnitte „Warum ohne Ablaufdatum?“ und „Gut zu wissen“ sind optional.
   IDs und Klassen bitte nicht ändern, das Skript findet die Felder darüber.
3. Im `<head>` die Styles laden:

   ```html
   <link rel="stylesheet" href="css/basis.css" />
   <link rel="stylesheet" href="css/qr.css" />
   ```

   `basis.css` bringt Schriften, Farben und Buttons mit, setzt aber auch Grundstyles für die ganze
   Seite (zum Beispiel die Hintergrundfarbe von `body`). Passt das nicht zu deiner Seite, übernimm
   daraus nur die `@font-face`-Regeln, die Variablen in `:root`, `.btn` und `.sr-only`.
4. Das Skript als Modul laden:

   ```html
   <script type="module" src="js/app.js"></script>
   ```

   Die Seite muss über http oder https ausgeliefert werden, als lokale Datei laden Browser keine Module.
5. Farben anpassen: über die Variablen in `:root`, zum Beispiel `--accent` für die Akzentfarbe.

Das Werkzeug läuft unter einer strengen Content Security Policy wie
`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'`.
Es braucht keine Inline-Skripte, keine Inline-Styles, keine externen Anfragen und kein `eval`.
`data:` bei `img-src` ist nur für die kleinen Pfeile der Auswahlfelder nötig.

## Bewusst nicht enthalten

Dynamische QR-Codes, Scan-Statistik, Konten und Kurzlinks. Genau das ist der Punkt.

## Mögliche Ausbaustufen

- Logo in der Mitte (dann mit Fehlerkorrektur H)
- Druckvorlagen, z. B. A6-Aushang oder Tischaufsteller „Gäste-WLAN“
- Offline-Nutzung per Service Worker
- Viele Codes auf einmal aus einer Tabelle

## Lizenz

MIT, Copyright (c) 2026 Daniel Maresch (Alblicht). Siehe `LICENSE`.
Fremde Bestandteile behalten ihre eigenen Lizenzen, siehe `THIRD-PARTY-NOTICES.md`.

Individuell programmiert von [Alblicht](https://alblicht.dev).
