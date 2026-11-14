# Fremde Bestandteile und ihre Lizenzen

Der eigene Code dieses Projekts steht unter der MIT-Lizenz (siehe `LICENSE`).
Folgende fremde Bestandteile behalten ihre eigenen Lizenzen.

## Mit der Seite ausgeliefert

### QR Code generator library (Project Nayuki)

- Datei: `js/vendor/qrcodegen.js`
- Quelle: https://github.com/nayuki/QR-Code-generator, Tag v1.8.0
  (Commit `720f62bddb7226106071d4728c292cb1df519ceb`), Datei `typescript-javascript/qrcodegen.ts`
- Änderung: `namespace qrcodegen` → `export namespace qrcodegen`, danach einmalig mit
  TypeScript 5.9.3 nach JavaScript (ES2020, ES-Modul) übersetzt. Sonst unverändert.
- Lizenz: MIT, Copyright (c) Project Nayuki. Der vollständige Lizenztext steht im Kopf der Datei.

### Schriften Hanken Grotesk und Oswald

- Dateien: `fonts/hanken-grotesk-variable.woff2`, `fonts/oswald-variable.woff2`
- Copyright 2021 The Hanken Grotesk Project Authors (https://github.com/marcologous/hanken-grotesk)
- Copyright 2016 The Oswald Project Authors (https://github.com/googlefonts/OswaldFont)
- Lizenz: SIL Open Font License 1.1, vollständiger Text in `fonts/OFL.txt`

## Nur für die Entwicklung (nicht ausgeliefert)

### jsQR

- Paket: `jsqr` 1.4.0 (npm, `devDependencies`)
- Zweck: liest in den Tests die erzeugten QR-Codes zurück, um den Inhalt zu vergleichen
- Lizenz: Apache License 2.0, https://github.com/cozmo/jsQR
