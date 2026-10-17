"""Writes draw.io diagrams (.drawio) and exports them as 4K PNG files (adapted from the team's Sentra report tools).

The diagrams are black on white, in Helvetica, with thin black borders. The diagram scripts in ../diagrams build their
diagrams with the Diagram class below, save the editable .drawio file and export a PNG of at least 3840 pixels in
width with the draw.io desktop app, so that the figures stay sharp in the .docx and the PDF.

Library use (see ../diagrams/d1_block_diagram.py):
    d = Diagram("System Block Diagram")
    a = d.box("Label", x, y, w, h)
    d.edge(a, b)
    d.save(Path("diagrams/d1-block-diagram.drawio"))   # writes the .drawio file and exports the PNG next to it

Command line: python3 drawio.py export <file.drawio>    re-exports a .drawio file edited by hand in draw.io
"""
import math
import subprocess
import sys
import tempfile
from pathlib import Path
from xml.sax.saxutils import escape

DRAWIO = "/Applications/draw.io.app/Contents/MacOS/draw.io"
MIN_WIDTH_PX = 3840  # 4K
MAX_PNG_HEIGHT_PX = 8000  # above this, draw.io's PNG export is incomplete (see _export_via_pdf)
BORDER = 20

# Helvetica and Helvetica-Bold character widths (Adobe AFM, 1/1000 em), used to size shapes around their labels.
_REG = dict(zip(" !\"#$%&'()*+,-./0123456789:;<=>?@", [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278] + [556] * 10 + [278, 278, 584, 584, 584, 556, 1015]))
_REG.update(dict(zip("ABCDEFGHIJKLMNOPQRSTUVWXYZ", [667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611])))
_REG.update(dict(zip("abcdefghijklmnopqrstuvwxyz", [556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500])))
_BOLD = dict(zip(" !\"#$%&'()*+,-./0123456789:;<=>?@", [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278] + [556] * 10 + [333, 333, 584, 584, 584, 611, 975]))
_BOLD.update(dict(zip("ABCDEFGHIJKLMNOPQRSTUVWXYZ", [722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611])))
_BOLD.update(dict(zip("abcdefghijklmnopqrstuvwxyz", [556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500])))


def text_width(text, size, bold=False):
    """Width in diagram units of the widest line of a label ("<br>" separates lines)."""
    table = _BOLD if bold else _REG
    return max(sum(table.get(c, 600) for c in line) for line in text.split("<br>")) * size / 1000


def style(**kw):
    return "".join(f"{k}={v};" for k, v in kw.items())


class Diagram:
    def __init__(self, name):
        self.name = name
        self.cells = []
        self.n = 1

    def _id(self):
        self.n += 1
        return f"c{self.n}"

    def vertex(self, label, x, y, w, h, st):
        cid = self._id()
        self.cells.append(f'<mxCell id="{cid}" value="{escape(label, {chr(34): "&quot;"})}" style="{st}" vertex="1" parent="1">'
                          f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')
        return cid

    def box(self, label, x, y, w, h, size=20, bold=True, align="left", stroke=3):
        """Rectangle with a label, as the module boxes of the reference block diagram."""
        st = style(rounded=0, whiteSpace="wrap", html=1, fillColor="#FFFFFF", strokeColor="#000000", fontColor="#000000",
                   fontFamily="Helvetica", fontSize=size, fontStyle=1 if bold else 0, align=align,
                   verticalAlign="middle", spacingLeft=12 if align == "left" else 4, spacingRight=4, strokeWidth=stroke)
        return self.vertex(label, x, y, w, h, st)

    def edge(self, src, dst, label="", orthogonal=False, exit=None, entry=None, points=(), stroke=3, dashed=False,
             end="classic", size=18):
        """Arrow from src to dst. exit/entry = (x, y) connection points relative to the shape (0..1)."""
        kw = dict(html=1, rounded=1 if orthogonal else 0, strokeColor="#000000", strokeWidth=stroke, endArrow=end,
                  endFill=1, fontFamily="Helvetica", fontSize=size, fontColor="#000000", labelBackgroundColor="#FFFFFF")
        kw["edgeStyle"] = "orthogonalEdgeStyle" if orthogonal else "none"
        if dashed:
            kw["dashed"] = 1
        if exit:
            kw.update(exitX=exit[0], exitY=exit[1], exitDx=0, exitDy=0)
        if entry:
            kw.update(entryX=entry[0], entryY=entry[1], entryDx=0, entryDy=0)
        pts = "".join(f'<mxPoint x="{px}" y="{py}"/>' for px, py in points)
        arr = '<Array as="points">' + pts + "</Array>" if pts else ""
        geo = '<mxGeometry relative="1" as="geometry">' + arr + "</mxGeometry>"
        cid = self._id()
        self.cells.append(f'<mxCell id="{cid}" value="{escape(label)}" style="{style(**kw)}" edge="1" parent="1" '
                          f'source="{src}" target="{dst}">{geo}</mxCell>')
        return cid

    def xml(self):
        body = "".join(self.cells)
        return ('<mxfile host="drawio"><diagram id="d" name="' + escape(self.name) + '">'
                '<mxGraphModel grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" '
                'pageScale="1" math="0" shadow="0" background="#FFFFFF"><root><mxCell id="0"/><mxCell id="1" parent="0"/>'
                + body + "</root></mxGraphModel></diagram></mxfile>")

    def save(self, path):
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(self.xml(), encoding="utf-8")
        return export(path)


def _png_size(png):
    data = png.read_bytes()[16:24]
    return int.from_bytes(data[:4], "big"), int.from_bytes(data[4:], "big")


def _export_via_pdf(src, out):
    """Tall diagrams: draw.io's PNG export cuts the image off at about 8,600 px in height, so the diagram is exported
    as vector PDF and rasterized to MIN_WIDTH_PX by tools/pdf_to_png.swift (CoreGraphics)."""
    with tempfile.TemporaryDirectory() as tmp:
        pdf = Path(tmp) / "diagram.pdf"
        subprocess.run([DRAWIO, "--export", "--format", "pdf", "--crop", "--border", str(BORDER), "--output", str(pdf),
                        str(src)], check=True, capture_output=True, timeout=180)
        subprocess.run(["swift", str(Path(__file__).with_name("pdf_to_png.swift")), str(pdf), str(out), str(MIN_WIDTH_PX)],
                       check=True, capture_output=True, timeout=300)
    w, h = _png_size(out)
    print(f"Wrote {out.name}: {w} x {h} px (via PDF)")
    return out


def export(drawio_file):
    """Exports <file>.drawio to <file>.png, scaled so that the image is at least 3840 pixels wide."""
    src = Path(drawio_file).resolve()
    out = src.with_suffix(".png")
    with tempfile.TemporaryDirectory() as tmp:
        probe = Path(tmp) / "probe.png"
        subprocess.run([DRAWIO, "--export", "--format", "png", "--scale", "1", "--border", str(BORDER),
                        "--output", str(probe), str(src)], check=True, capture_output=True, timeout=180)
        width, height = _png_size(probe)
    # the border is not scaled, so scale only the drawing itself up to the minimum width
    scale = math.ceil((MIN_WIDTH_PX - 2 * BORDER) / (width - 2 * BORDER) * 100) / 100
    if (height - 2 * BORDER) * scale + 2 * BORDER > MAX_PNG_HEIGHT_PX:
        return _export_via_pdf(src, out)
    while True:
        subprocess.run([DRAWIO, "--export", "--format", "png", "--scale", str(scale), "--border", str(BORDER),
                        "--output", str(out), str(src)], check=True, capture_output=True, timeout=180)
        w, h = _png_size(out)
        if w >= MIN_WIDTH_PX:
            break
        scale = round(scale + 0.05, 2)
    print(f"Wrote {out.name}: {w} x {h} px (scale {scale})")
    return out


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "export":
        export(sys.argv[2])
    else:
        sys.exit(__doc__)
