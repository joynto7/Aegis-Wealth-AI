#!/usr/bin/env python3
"""Replace a report's first page with the branded Aegis cover.

Usage: cover_pdf.py path/to/report.pdf [technical|security]   (default: technical)
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


TEAM = "NextWave"
MEMBERS = [
    "JOYNTO GHOSH - Daffodil International University",
    "MD. Rezwanul Islam - Daffodil International University",
    "Alif Uddin Nobin - Daffodil International University",
    "Most.Esrat Jhahan Nur - Daffodil International University",
]
EMAIL = "joynto241-35-127@diu.edu.bd"
SOURCE = "github.com/joynto7/Aegis-Wealth-AI"
DEMO = "aegis-wealth-ai.onrender.com"

# What differs between the covers of the reports built in docs/report.
DOCS = {
    "technical": {
        "deliverable": "01",
        "title": "Technical Documentation",
        "lines": [
            "System architecture, core algorithms and security design",
            "Risk-aware wealth guidance with human-confirmed simulated actions.",
        ],
        "strip": "Architecture, algorithms and security",
        "version": "Version 1.0  /  19 October 2026",
    },
    "security": {
        "deliverable": "05",
        "title": "Security Self-Assessment",
        "lines": [
            "Permission-tier implementation and known-risk list",
            "An agent that can propose but never execute, with every residual risk stated.",
        ],
        "strip": "Permission tiers and known risks",
        "version": "Version 1.0  /  19 October 2026",
    },
}

NAVY = colors.HexColor("#10172D")
INK = colors.HexColor("#18213A")
MUTED = colors.HexColor("#65708B")
PURPLE = colors.HexColor("#7857E8")
INDIGO = colors.HexColor("#5865E8")
PALE = colors.HexColor("#F5F4FF")
LINE = colors.HexColor("#E2E5F0")


def label(c: canvas.Canvas, text: str, x: float, y: float, color=PURPLE, size=8):
    c.setFillColor(color)
    c.setFont("Helvetica-Bold", size)
    c.drawString(x, y, text.upper())


def draw_logo(c: canvas.Canvas, x: float, y: float, size: float):
    """Draw the same shield and rising-line mark used by the Aegis web app."""
    scale = size / 32
    c.saveState()
    c.translate(x, y)
    c.scale(scale, scale)
    # SVG's y-axis points down; ReportLab's points up.
    sy = lambda value: 32 - value
    shield = c.beginPath()
    shield.moveTo(16, sy(2.5))
    shield.lineTo(4.5, sy(7))
    shield.lineTo(4.5, sy(15.2))
    shield.curveTo(4.5, sy(22.4), 9.4, sy(27.7), 16, sy(29.5))
    shield.curveTo(22.6, sy(27.7), 27.5, sy(22.4), 27.5, sy(15.2))
    shield.lineTo(27.5, sy(7))
    shield.close()
    c.setFillColor(PURPLE)
    c.drawPath(shield, fill=1, stroke=0)
    c.setStrokeColor(colors.white)
    c.setLineWidth(2.2)
    c.setLineCap(1)
    c.setLineJoin(1)
    trend = c.beginPath()
    trend.moveTo(9.5, sy(19.5))
    trend.lineTo(13.7, sy(15.2))
    trend.lineTo(16.8, sy(18.2))
    trend.lineTo(22.5, sy(12))
    c.drawPath(trend, stroke=1, fill=0)
    c.setFillColor(colors.white)
    c.circle(22.5, sy(12), 1.6, stroke=0, fill=1)
    c.restoreState()


def draw_cover(c: canvas.Canvas, doc: dict):
    width, height = A4
    c.setFillColor(colors.white)
    c.rect(0, 0, width, height, fill=1, stroke=0)

    # Restrained decorative shape keeps the white technical-report feel while
    # carrying the indigo and violet from the product identity.
    c.saveState()
    c.setFillColor(colors.HexColor("#FAF9FF"))
    c.circle(width + 6, height - 180, 172, fill=1, stroke=0)
    c.setStrokeColor(colors.HexColor("#F0EDFF"))
    c.setLineWidth(1)
    c.circle(width + 6, height - 180, 144, fill=0, stroke=1)
    c.restoreState()

    left, right = 56, width - 56
    label(c, "2026 Shenzhen International FinTech Competition", left, height - 46, MUTED, 7.5)
    c.setFillColor(MUTED)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawRightString(right, height - 46, f"SUBMISSION / DELIVERABLE {doc['deliverable']}")
    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.line(left, height - 58, right, height - 58)

    draw_logo(c, left, height - 132, 46)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 23)
    c.drawString(left + 58, height - 104, "Aegis")
    c.setFillColor(MUTED)
    c.setFont("Helvetica-Bold", 8.2)
    c.drawString(left + 59, height - 119, "W E A L T H   A I")

    label(c, "Topic B / Wealth Advisory Agent", left, height - 220, PURPLE, 8.5)
    # 34 pt, or smaller if a longer title would not fit between the margins.
    title_size = 34
    while stringWidth(doc["title"], "Helvetica-Bold", title_size) > right - left:
        title_size -= 1
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", title_size)
    c.drawString(left, height - 267, doc["title"])
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 17)
    c.drawString(left, height - 298, "Aegis Wealth AI")

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 10.3)
    c.drawString(left, height - 322, doc["lines"][0])
    c.drawString(left, height - 338, doc["lines"][1])

    # Theme strip.
    strip_y, strip_h = height - 432, 66
    c.setFillColor(PALE)
    c.roundRect(left, strip_y, right - left, strip_h, 10, fill=1, stroke=0)
    c.setFillColor(PURPLE)
    c.roundRect(left, strip_y, 5, strip_h, 2, fill=1, stroke=0)
    label(c, "Competition theme", left + 20, strip_y + 42, MUTED, 7)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(left + 20, strip_y + 23, "AI as a Financial Participant")
    c.setStrokeColor(colors.HexColor("#DDD9F6"))
    c.line(width / 2 + 10, strip_y + 13, width / 2 + 10, strip_y + strip_h - 13)
    label(c, "Deliverable", width / 2 + 28, strip_y + 42, MUTED, 7)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 10.2)
    c.drawString(width / 2 + 28, strip_y + 23, doc["strip"])

    # Team and handoff details.
    panel_y, panel_h = 108, 205
    c.setFillColor(colors.HexColor("#FCFCFE"))
    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.roundRect(left, panel_y, right - left, panel_h, 10, fill=1, stroke=1)
    label(c, "Project team", left + 18, panel_y + panel_h - 24, PURPLE, 7.3)
    label(c, "Submission links", width / 2 + 7, panel_y + panel_h - 24, PURPLE, 7.3)
    c.setStrokeColor(LINE)
    c.line(width / 2 - 10, panel_y + 16, width / 2 - 10, panel_y + panel_h - 16)

    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(left + 18, panel_y + panel_h - 47, TEAM)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8.8)
    for idx, member in enumerate(MEMBERS):
        name = member.split(" - ", 1)[0]
        c.drawString(left + 18, panel_y + panel_h - 69 - idx * 16, name)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.8)
    c.drawString(left + 18, panel_y + panel_h - 141, "Daffodil International University")

    rx = width / 2 + 7
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.5)
    c.drawString(rx, panel_y + panel_h - 48, "CONTACT")
    c.setFillColor(INK)
    c.setFont("Helvetica", 9)
    c.drawString(rx, panel_y + panel_h - 62, EMAIL)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.5)
    c.drawString(rx, panel_y + panel_h - 88, "SOURCE CODE")
    c.setFillColor(INDIGO)
    c.setFont("Helvetica", 8.8)
    c.drawString(rx, panel_y + panel_h - 102, SOURCE)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.5)
    c.drawString(rx, panel_y + panel_h - 128, "LIVE DEMO")
    c.setFillColor(INDIGO)
    c.setFont("Helvetica", 8.8)
    c.drawString(rx, panel_y + panel_h - 142, DEMO)

    c.setStrokeColor(LINE)
    c.line(left + 18, panel_y + 43, right - 18, panel_y + 43)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawString(left + 18, panel_y + 25, doc["version"])
    c.drawRightString(right - 18, panel_y + 25, "Prepared by NextWave")

    c.setStrokeColor(LINE)
    c.line(left, 70, right, 70)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.5)
    c.drawString(left, 54, "Aegis Wealth AI  /  International Track")
    c.drawRightString(right, 54, "NEXTWAVE  -  2026")
    c.showPage()


def main():
    if len(sys.argv) not in (2, 3) or (len(sys.argv) == 3 and sys.argv[2] not in DOCS):
        raise SystemExit(f"Usage: cover_pdf.py path/to/report.pdf [{'|'.join(DOCS)}]")
    doc = DOCS[sys.argv[2] if len(sys.argv) == 3 else "technical"]
    target = Path(sys.argv[1]).resolve()
    if not target.is_file():
        raise SystemExit(f"PDF not found: {target}")

    reader = PdfReader(str(target))
    if len(reader.pages) < 2:
        raise SystemExit("Expected a report with a cover page and body pages")

    with tempfile.TemporaryDirectory(prefix="aegis_cover_") as work:
        cover_path = Path(work) / "cover.pdf"
        cover_canvas = canvas.Canvas(str(cover_path), pagesize=A4, pageCompression=1)
        draw_cover(cover_canvas, doc)
        cover_canvas.save()

        cover_reader = PdfReader(str(cover_path))
        writer = PdfWriter()
        writer.add_page(cover_reader.pages[0])
        for page in reader.pages[1:]:
            writer.add_page(page)
        metadata = {k: v for k, v in (reader.metadata or {}).items() if k and v}
        metadata.update({
            "/Title": f"Aegis Wealth AI - {doc['title']}",
            "/Author": "NextWave",
            "/Subject": f"2026 Shenzhen International FinTech Competition - Deliverable {doc['deliverable']}",
        })
        writer.add_metadata(metadata)
        temp_output = Path(work) / "report.pdf"
        with temp_output.open("wb") as stream:
            writer.write(stream)
        os.replace(temp_output, target)

    print(f"Updated cover: {target}")


if __name__ == "__main__":
    main()
