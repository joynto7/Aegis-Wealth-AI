#!/usr/bin/env bash
# Builds the competition's formal reports: diagrams -> Word file -> PDF -> branded cover.
#   ./build.sh            the technical documentation (deliverable 01; skips the diagrams, their PNGs are committed)
#   ./build.sh security   the security self-assessment report (deliverable 05)
#   ./build.sh diagrams   redraw every diagram first (needs the draw.io desktop app and Python with Pillow), then
#                         build the technical documentation
# Needs Node.js (cd tools && npm ci, once), LibreOffice, and Python packages reportlab + pypdf for the cover.
# Output: docs/Aegis_Technical_Documentation.pdf or docs/Aegis_Security_Self_Assessment.pdf
set -euo pipefail
cd "$(dirname "$0")"
PY="${PYTHON:-python3}"
case "${1:-technical}" in
  diagrams) "$PY" diagrams/figures.py; doc=technical ;;
  technical) doc=technical ;;
  security) doc=security ;;
  *) echo "Usage: ./build.sh [technical|security|diagrams]" >&2; exit 2 ;;
esac
if [ "$doc" = security ]; then name=Aegis_Security_Self_Assessment; else name=Aegis_Technical_Documentation; fi
node tools/build.js --doc "$doc"
"$PY" tools/export_pdf.py "$name.docx" "../$name.pdf"
"$PY" tools/cover_pdf.py "../$name.pdf" "$doc"
