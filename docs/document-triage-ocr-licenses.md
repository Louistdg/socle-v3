# Document triage OCR notices

SOCLE’s local document reader bundles these open-source components:

- Tesseract.js and tesseract.js-core 7.0.0 — Apache License 2.0. Their upstream license texts are in `node_modules/tesseract.js/LICENSE.md` and `node_modules/tesseract.js-core/LICENSE`.
- French OCR model from `@tesseract.js-data/fra` 1.0.0 — MIT License. Its upstream package metadata and notice are in `node_modules/@tesseract.js-data/fra/`.

The OCR worker, WebAssembly core, and French model are served by SOCLE itself. The browser does not send document contents to an OCR provider.
