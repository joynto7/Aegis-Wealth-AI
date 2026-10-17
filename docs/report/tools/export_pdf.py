"""Export the report to PDF with LibreOffice, filling in the table of contents and page numbers.

The .docx built by build.js holds the table of contents as a field that only Word fills in
(on "update fields"). This script runs a headless LibreOffice with a throw-away profile whose
Basic library contains a small macro: it opens the .docx, updates every index (table of
contents, later also the lists of figures and tables) and exports a PDF.

Usage: python3 export_pdf.py [input.docx] [output.pdf]
Defaults: ../Aegis_Technical_Documentation.docx -> ../../Aegis_Technical_Documentation.pdf
"""
import subprocess
import sys
import tempfile
from pathlib import Path
from xml.sax.saxutils import escape

SOFFICE = "/Applications/LibreOffice.app/Contents/MacOS/soffice"
HERE = Path(__file__).resolve().parent

MACRO = """Sub ExportWithToc(inUrl As String, outUrl As String)
    REM Read-only: the .docx is never saved, and a lock file left by a crashed export cannot block the
    REM opening with an invisible "document in use" dialog.
    Dim openArgs(1) As New com.sun.star.beans.PropertyValue
    openArgs(0).Name = "Hidden"
    openArgs(0).Value = True
    openArgs(1).Name = "ReadOnly"
    openArgs(1).Value = True
    doc = StarDesktop.loadComponentFromURL(inUrl, "_blank", 0, openArgs())
    indexes = doc.getDocumentIndexes()
    REM Two passes: filling the table of contents can move pages, which changes its own page numbers.
    For pass = 1 To 2
        For i = 0 To indexes.getCount() - 1
            indexes.getByIndex(i).update()
        Next i
        doc.refresh()
    Next pass
    REM Diagrams are 4K PNGs: keep them lossless and at full resolution, so that they stay sharp.
    Dim filterData(1) As New com.sun.star.beans.PropertyValue
    filterData(0).Name = "UseLosslessCompression"
    filterData(0).Value = True
    filterData(1).Name = "ReduceImageResolution"
    filterData(1).Value = False
    Dim pdfArgs(1) As New com.sun.star.beans.PropertyValue
    pdfArgs(0).Name = "FilterName"
    pdfArgs(0).Value = "writer_pdf_Export"
    pdfArgs(1).Name = "FilterData"
    pdfArgs(1).Value = filterData()
    doc.storeToURL(outUrl, pdfArgs())
    doc.close(True)
    StarDesktop.terminate()
End Sub
"""

MODULE = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE script:module PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "module.dtd">
<script:module xmlns:script="http://openoffice.org/2000/script" script:name="Module1" script:language="StarBasic">{code}</script:module>
"""


def main():
    src = Path(sys.argv[1] if len(sys.argv) > 1 else HERE.parent / "Aegis_Technical_Documentation.docx").resolve()
    out = Path(sys.argv[2] if len(sys.argv) > 2 else HERE.parent.parent / "Aegis_Technical_Documentation.pdf").resolve()
    with tempfile.TemporaryDirectory(prefix="lo_profile_") as profile:
        base = [SOFFICE, "--headless", "--norestore", "--nologo", f"-env:UserInstallation={Path(profile).as_uri()}"]
        # First start only creates the profile, including the Standard Basic library.
        subprocess.run(base + ["--terminate_after_init"], check=True, capture_output=True, timeout=180)
        module = Path(profile) / "user" / "basic" / "Standard" / "Module1.xba"
        module.write_text(MODULE.format(code=escape(MACRO, {'"': "&quot;"})), encoding="utf-8")
        # Export to a temporary file and replace the old PDF only on success, so that a failed or
        # interrupted export never leaves the report without a PDF. A busy machine can need more
        # than ten minutes for the full report, hence the generous time limit.
        tmp = out.with_name(out.stem + ".exporting.pdf")
        tmp.unlink(missing_ok=True)
        call = f'macro:///Standard.Module1.ExportWithToc("{src.as_uri()}","{tmp.as_uri()}")'
        subprocess.run(base + [call], check=True, capture_output=True, timeout=1800)
    if not tmp.exists():
        sys.exit("PDF export failed: LibreOffice produced no output")
    tmp.replace(out)
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
