#!/usr/bin/env bash
# Builds the technical documentation (deliverable 01): diagrams -> Word file -> PDF.
#   ./build.sh            the whole document (skips the diagrams; their PNGs are committed)
#   ./build.sh diagrams   redraw every diagram first (needs the draw.io desktop app and Python with Pillow)
# Needs Node.js (cd tools && npm ci, once) and LibreOffice. Output: docs/Aegis_Technical_Documentation.pdf
set -euo pipefail
cd "$(dirname "$0")"
PY="${PYTHON:-python3}"
if [ "${1:-}" = "diagrams" ]; then
  "$PY" diagrams/figures.py
fi
node tools/build.js
"$PY" tools/export_pdf.py
