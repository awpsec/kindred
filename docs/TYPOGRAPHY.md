# Kindred typography

Kindred bundles Inter for interface text (variable 100–900, normal and italic), and Liberation Mono for code, logs and technical values (regular, bold, italic and bold italic). `ui/fonts.css` owns the shared font faces and `--font-sans` / `--font-mono` tokens. Both families load locally, including in standalone Accounts, permission and notch windows. System families remain fallback only for missing glyphs or load failures. Document previews retain document-specific formatting.

Font sources, hashes and redistribution licenses are included in `ui/fonts`. Liberation Mono is copied unmodified from the recorded Debian fonts-liberation package. The server embeds and serves every font; native packages must include fonts.css and the complete fonts directory. Exact-release UI parity includes the shared font stylesheet and mono binaries. `test-fonts-panels.cjs` verifies all eight family/weight/style combinations load and side panels match chat in dark and light themes.
