"""UML diagram helpers for the Aegis technical documentation, in UML 2.5.1 notation and the black-and-white draw.io
style of the team's Sentra report (whose diagram scripts these classes come from):

  AD      activity diagrams: actions (partition in parentheses), decisions and merges with guards, initial and final nodes
  SD      sequence diagrams: lifelines, synchronous calls, replies, self calls, combined fragments ("break", "alt")
  Canvas  component diagrams (components, provided interfaces as balls, usage dependencies, ports) and deployment
          diagrams (nodes as 3D boxes with their keyword, artifacts, communication paths labelled with the protocol)

Every figure is saved as <slug>.drawio next to this module (editable in draw.io) and exported by export() as a 3840 px
PNG at a fixed scale: all diagrams share the canvas width FULL_W (or HALF_W), so they print at one scale.
"""
import math
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
from drawio import DRAWIO, MIN_WIDTH_PX, Diagram, style, text_width  # noqa: E402

STROKE, LINE = 2.5, 2

HERE = Path(__file__).resolve().parent
HALF_W, FULL_W = 600, 1282  # (FULL_W + 2 * 20) / (HALF_W + 2 * 20) = full / half column width, so both print at one scale
BORDER_UNITS = 20
FONT, PFONT, GFONT, TFONT = 22, 18, 18, 28  # action name (bold), partition, guard, title (bold)
LH = 1.2  # line height factor of draw.io labels
FLOW = 2
PAD_X, PAD_Y = 14, 10
DIAMOND = 40
GAP, GUARD_GAP = 32, 52  # space between nodes; below a decision whose downward flow carries a guard


def lines_of(label):
    return label.split("<br>")


def box_size(partition, name, call=False):
    w = max(text_width(n, FONT, bold=True) for n in lines_of(name))
    if partition:
        w = max(w, text_width(f"({partition})", PFONT))
    w += 2 * PAD_X + (26 if call else 0)
    h = len(lines_of(name)) * FONT * LH + (PFONT * LH if partition else 0) + 2 * PAD_Y + (6 if call else 0)
    return round(w), round(h)


class AD:
    """One activity diagram. Node positions are centres (cx, cy); flows are drawn with explicit waypoints."""

    def __init__(self, number, title, width=HALF_W):
        self.d = Diagram(title)
        self.number, self.width = number, width
        self.nodes = {}
        self.max_x = 0  # right edge of the drawing; must stay within the canvas width (same print scale for all)
        # white background of the full canvas: draw.io crops the export to the visible drawing, so this keeps the same
        # top edge and width (and therefore the same print scale) in every diagram; its height is set in save()
        self.d.vertex("", 0, 0, width, 1, style(rounded=0, fillColor="#FEFEFE", strokeColor="none"))
        self.bg = len(self.d.cells) - 1
        self.max_y = 0
        self.title_h = 40 if "<br>" not in title else 74
        self.top = 78 + self.title_h - 40  # y of the first node below the title
        self.text(title, 0, 0, width, self.title_h, TFONT, bold=True, align="left")

    # ---------- nodes ----------
    def text(self, label, x, y, w, h, size, bold=False, align="center"):
        st = "text;" + style(html=1, align=align, verticalAlign="middle", fontFamily="Helvetica", fontSize=size,
                             fontColor="#000000", fontStyle=1 if bold else 0, whiteSpace="nowrap", spacing=0)
        self.max_x = max(self.max_x, x + w)
        return self.d.vertex(label, x, y, w, h, st)

    def _add(self, key, cid, cx, cy, w, h):
        self.nodes[key] = dict(id=cid, cx=cx, cy=cy, w=w, h=h)
        self.max_y = max(self.max_y, cy + h / 2)
        self.max_x = max(self.max_x, cx + w / 2)
        return key

    def _cy(self, cy, below, gap, h):
        """Centre y: given directly, or `gap` below the bottom of node `below`."""
        if cy is not None:
            return cy
        n = self.nodes[below]
        return n["cy"] + n["h"] / 2 + gap + h / 2

    def action(self, key, partition, name, cx, cy=None, below=None, gap=GAP, w=None, call=False):
        bw, bh = box_size(partition, name, call)
        cy = self._cy(cy, below, gap, bh)
        w = max(w or 0, bw)
        label = (f'<span style="font-weight:normal;font-size:{PFONT}px">({partition})</span><br>' if partition else "") + name
        shape = dict(shape="mxgraph.sysml.callBehAct") if call else dict(rounded=1, absoluteArcSize=1, arcSize=24)
        st = style(**shape, whiteSpace="wrap", html=1, fillColor="#FFFFFF", strokeColor="#000000", strokeWidth=STROKE,
                   fontFamily="Helvetica", fontSize=FONT, fontColor="#000000", fontStyle=1, align="center",
                   verticalAlign="middle", spacingLeft=4, spacingRight=4 + (18 if call else 0),
                   spacingBottom=6 if call else 0)
        cid = self.d.vertex(label, cx - w / 2, cy - bh / 2, w, bh, st)
        return self._add(key, cid, cx, cy, w, bh)

    def signal(self, key, partition, name, cx, cy=None, below=None, gap=GAP, accept=False):
        """Send signal action (convex pentagon, a notification) or accept event action (concave pentagon, a wait)."""
        bw, bh = box_size(partition, name)
        bw += 30
        cy = self._cy(cy, below, gap, bh)
        label = (f'<span style="font-weight:normal;font-size:{PFONT}px">({partition})</span><br>' if partition else "") + name
        st = style(shape="mxgraph.sysml.accEvent" if accept else "mxgraph.sysml.sendSigAct", whiteSpace="wrap", html=1,
                   fillColor="#FFFFFF", strokeColor="#000000", strokeWidth=STROKE, fontFamily="Helvetica", fontSize=FONT,
                   fontColor="#000000", fontStyle=1, align="center", verticalAlign="middle",
                   spacingLeft=4 + (26 if accept else 0), spacingRight=4 + (0 if accept else 26))
        cid = self.d.vertex(label, cx - bw / 2, cy - bh / 2, bw, bh, st)
        return self._add(key, cid, cx, cy, bw, bh)

    def bar(self, key, x1, x2, cy):
        """Fork or join node: a thick black bar from x1 to x2."""
        st = style(rounded=0, html=1, fillColor="#000000", strokeColor="#000000", strokeWidth=1)
        return self._add(key, self.d.vertex("", x1, cy - 4, x2 - x1, 8, st), (x1 + x2) / 2, cy, x2 - x1, 8)

    def at(self, key, x):
        """Relative point (fx, fy) on the top (fy=0) of a bar at the absolute x; use (fx, 1) for its bottom."""
        n = self.nodes[key]
        return (x - (n["cx"] - n["w"] / 2)) / n["w"]

    def connector(self, key, letter, cx, cy=None, below=None, gap=GAP, r=16):
        """UML connector: a small circle with a letter; the flow continues at the circle with the same letter."""
        cy = self._cy(cy, below, gap, 2 * r)
        st = style(shape="ellipse", perimeter="ellipsePerimeter", html=1, fillColor="#FFFFFF", strokeColor="#000000",
                   strokeWidth=STROKE, fontFamily="Helvetica", fontSize=FONT - 2, fontStyle=1, fontColor="#000000")
        return self._add(key, self.d.vertex(letter, cx - r, cy - r, 2 * r, 2 * r, st), cx, cy, 2 * r, 2 * r)

    def time_event(self, key, label, cx, cy=None, below=None, gap=GAP, side="right"):
        """Accept time event action: an hourglass with its time expression beside it (right or left)."""
        w, h = 30, 40
        cy = self._cy(cy, below, gap, h)
        st = style(shape="mxgraph.sysml.timeEvent", html=1, fillColor="#FFFFFF", strokeColor="#000000", strokeWidth=STROKE)
        cid = self.d.vertex("", cx - w / 2, cy - h / 2, w, h, st)
        tw = text_width(label, PFONT) + 4
        if side == "right":
            self.text(label, cx + w / 2 + 8, cy - 14, tw, 28, PFONT, align="left")
        else:
            self.text(label, cx - w / 2 - 8 - tw, cy - 14, tw, 28, PFONT, align="right")
        return self._add(key, cid, cx, cy, w, h)

    def diamond(self, key, cx, cy=None, below=None, gap=GAP):
        cy = self._cy(cy, below, gap, DIAMOND)
        st = style(shape="rhombus", html=1, fillColor="#FFFFFF", strokeColor="#000000", strokeWidth=STROKE)
        return self._add(key, self.d.vertex("", cx - DIAMOND / 2, cy - DIAMOND / 2, DIAMOND, DIAMOND, st), cx, cy, DIAMOND, DIAMOND)

    def initial(self, key, cx, cy, r=16):
        st = style(shape="ellipse", perimeter="ellipsePerimeter", html=1, fillColor="#000000", strokeColor="#000000", strokeWidth=STROKE)
        return self._add(key, self.d.vertex("", cx - r, cy - r, 2 * r, 2 * r, st), cx, cy, 2 * r, 2 * r)

    def final(self, key, cx, cy=None, below=None, gap=GAP, r=18):
        cy = self._cy(cy, below, gap, 2 * r)
        outer = style(shape="ellipse", perimeter="ellipsePerimeter", html=1, fillColor="#FFFFFF", strokeColor="#000000", strokeWidth=STROKE)
        inner = style(shape="ellipse", html=1, fillColor="#000000", strokeColor="#000000", strokeWidth=1)
        cid = self.d.vertex("", cx - r, cy - r, 2 * r, 2 * r, outer)
        self.d.vertex("", cx - r + 7, cy - r + 7, 2 * r - 14, 2 * r - 14, inner)
        return self._add(key, cid, cx, cy, 2 * r, 2 * r)

    # ---------- flows ----------
    SIDES = dict(top=(0.5, 0), bottom=(0.5, 1), left=(0, 0.5), right=(1, 0.5))

    def point(self, key, side):
        n = self.nodes[key]
        fx, fy = self.SIDES[side]
        return n["cx"] + (fx - 0.5) * n["w"], n["cy"] + (fy - 0.5) * n["h"]

    def flow(self, src, dst, out="bottom", into="top", via=()):
        """Flow from src to dst; out/into = a side name or a relative point (fx, fy) on the shape, e.g. on a bar."""
        ox, oy = out if isinstance(out, tuple) else self.SIDES[out]
        ix, iy = into if isinstance(into, tuple) else self.SIDES[into]
        st = style(endArrow="open", endSize=14, html=1, rounded=0, strokeColor="#000000", strokeWidth=FLOW,
                   edgeStyle="none", exitX=ox, exitY=oy, exitDx=0, exitDy=0, entryX=ix, entryY=iy, entryDx=0, entryDy=0)
        pts = "".join(f'<mxPoint x="{x}" y="{y}"/>' for x, y in via)
        self.max_x = max([self.max_x] + [x for x, _ in via])
        geo = '<mxGeometry relative="1" as="geometry">' + (f'<Array as="points">{pts}</Array>' if pts else "") + "</mxGeometry>"
        cid = self.d._id()
        self.d.cells.append(f'<mxCell id="{cid}" value="" style="{st}" edge="1" parent="1" '
                            f'source="{self.nodes[src]["id"]}" target="{self.nodes[dst]["id"]}">{geo}</mxCell>')

    def guard(self, label, x, y, align="left"):
        """Guard text with its left edge (align=left), right edge (right) or centre (center) at x, centred on y."""
        w = text_width(label, GFONT) + 4
        x0 = {"left": x, "right": x - w, "center": x - w / 2}[align]
        self.text(label, x0, y - GFONT * 0.7, w, GFONT * 1.4, GFONT, align=align)

    def save(self, slug):
        if self.max_x > self.width:
            raise SystemExit(f"{self.number}: drawing reaches x = {self.max_x:.0f}, beyond the canvas width {self.width}")
        self.d.cells[self.bg] = self.d.cells[self.bg].replace('height="1"', f'height="{self.max_y + 4:.0f}"')
        path = HERE / f"{slug}.drawio"
        path.write_text(self.d.xml(), encoding="utf-8")
        return export(path, self.width)


def export(src, width):
    """Exports the diagram as a PNG of MIN_WIDTH_PX in which the canvas (0..width) always maps to the same pixels.

    draw.io's PNG export cuts tall images off, and its PDF export adds uneven margins, which would give each diagram
    a slightly different scale. So the PDF is rasterized larger than needed (tools/pdf_to_png.swift), cropped to the
    off-white canvas background, and scaled down onto a white image with a fixed border."""
    out = src.with_suffix(".png")
    with tempfile.TemporaryDirectory() as tmp:
        pdf, raw = Path(tmp) / "d.pdf", Path(tmp) / "raw.png"
        subprocess.run([DRAWIO, "--export", "--format", "pdf", "--crop", "--border", "0", "--output", str(pdf), str(src)],
                       check=True, capture_output=True, timeout=180)
        subprocess.run(["swift", str(HERE.parent / "tools" / "pdf_to_png.swift"), str(pdf), str(raw), "5200"],
                       check=True, capture_output=True, timeout=300)
        im = Image.open(raw).convert("RGB")
    bands = [b.point(lambda v: 255 if v == 254 else 0) for b in im.split()]
    mask = Image.composite(bands[0], Image.new("L", im.size, 0), Image.composite(bands[1], Image.new("L", im.size, 0), bands[2]))
    canvas = im.crop(mask.getbbox()).point(lambda v: 255 if v == 254 else v)
    inner = round(MIN_WIDTH_PX * width / (width + 2 * BORDER_UNITS))
    border = (MIN_WIDTH_PX - inner) // 2
    canvas = canvas.resize((inner, round(canvas.height * inner / canvas.width)), Image.LANCZOS)
    page = Image.new("RGB", (MIN_WIDTH_PX, canvas.height + 2 * border), "white")
    page.paste(canvas, (border, border))
    page.save(out, dpi=(300, 300))
    print(f"Wrote {out.name}: {page.width} x {page.height} px")
    return out


# ---------- sequence diagrams ----------
MFONT, HFONT, FFONT, OPFONT, SGFONT = 20, 20, 22, 20, 18  # message, lifeline head, frame name, operator, guard
STEP = 44          # vertical distance between messages
FIRST = 72         # from the top of a fragment to its first message (name box, guard and label)
OPERAND = 58       # from the dashed line between two operands of an "alt" to the first message of the next one
BAR = 14           # width of an activation bar
HEAD_TOP, HEAD_H = 64, 46


class SD:
    def __init__(self, number, name, width=FULL_W, part=""):
        self.d = Diagram(name)
        self.number, self.name, self.width, self.part = number, name, width, part
        self.layers = {k: [] for k in ("bg", "frags", "lines", "bars", "msgs", "labels", "heads")}
        self.lines = {}            # key -> dict(x, head_bottom)
        self.open = {}             # key -> list of [start_y, level] for activation bars still open
        self.bars = []             # (key, y1, y2, level)
        self.y = HEAD_TOP + HEAD_H + 50
        self._add("bg", "", 0, 0, width, 1, style(rounded=0, fillColor="#FEFEFE", strokeColor="none"))

    # ---------- primitives ----------
    def _add(self, layer, label, x, y, w, h, st):
        cid = self.d.vertex(label, x, y, w, h, st)
        self.layers[layer].append(self.d.cells.pop())
        return cid

    def _line(self, layer, pts, st):
        cid = self.d._id()
        (x1, y1), (x2, y2), mid = pts[0], pts[-1], pts[1:-1]
        arr = "".join(f'<mxPoint x="{x}" y="{y}"/>' for x, y in mid)
        geo = (f'<mxGeometry relative="1" as="geometry"><mxPoint x="{x1}" y="{y1}" as="sourcePoint"/>'
               f'<mxPoint x="{x2}" y="{y2}" as="targetPoint"/>' + (f'<Array as="points">{arr}</Array>' if mid else "")
               + "</mxGeometry>")
        self.layers[layer].append(f'<mxCell id="{cid}" value="" style="{st}" edge="1" parent="1">{geo}</mxCell>')

    def text(self, label, x, y, size, align="center", bold=False, layer="labels", bg=True):
        """Text centred vertically on y; x = left edge (align left), centre (center) or right edge (right)."""
        w = max(text_width(part, size, bold) for part in label.split("<br>")) + 6
        h = size * 1.25 * (label.count("<br>") + 1)
        x0 = {"left": x, "center": x - w / 2, "right": x - w}[align]
        st = "text;" + style(html=1, align=align, verticalAlign="middle", fontFamily="Helvetica", fontSize=size,
                             fontColor="#000000", fontStyle=1 if bold else 0, whiteSpace="nowrap", spacing=0,
                             labelBackgroundColor="#FEFEFE" if bg else "none")
        return self._add(layer, label, x0, y - h / 2, w, h, st)

    # ---------- lifelines ----------
    def lifeline(self, key, label, x, actor=False, at=None):
        """Lifeline head at the top, or (at=y) centred on y when the object is created by a message."""
        if actor:
            self._add("heads", "", x - 15, HEAD_TOP - 6, 30, 52, style(shape="umlActor", html=1, outlineConnect=0,
                      strokeColor="#000000", strokeWidth=LINE, fillColor="#FFFFFF"))
            extra = 12.5 * label.count("<br>")
            self.text(label, x, HEAD_TOP + 60 + extra, HFONT, bold=True, layer="heads", bg=False)
            bottom = HEAD_TOP + 74 + 2 * extra
        else:
            w = text_width(label, HFONT, bold=True) + 28
            top = HEAD_TOP if at is None else at - HEAD_H / 2
            self._add("heads", label, x - w / 2, top, w, HEAD_H, style(rounded=0, html=1, whiteSpace="wrap",
                      fillColor="#FFFFFF", strokeColor="#000000", strokeWidth=STROKE, fontFamily="Helvetica",
                      fontSize=HFONT, fontStyle=1, fontColor="#000000"))
            bottom = top + HEAD_H
        self.lines[key] = dict(x=x, head_bottom=bottom, w=0 if actor else w)
        self.open[key] = []

    # ---------- activation bars ----------
    def activate(self, key, y=None):
        self.open[key].append([self.y if y is None else y, len(self.open[key])])

    def deactivate(self, key, y=None):
        y1, level = self.open[key].pop()
        self.bars.append((key, y1, self.y if y is None else y, level))

    def edge_x(self, key, toward):
        """x where a message to or from the lifeline starts or ends: the side of its innermost open bar."""
        x = self.lines[key]["x"]
        n = len(self.open[key])
        if not n:
            return x
        right = x + BAR / 2 + (n - 1) * BAR / 2
        left = x - BAR / 2 + (n - 1) * BAR / 2
        return right if toward > x else left

    # ---------- messages ----------
    def _arrow(self, src, dst, label, kind, y, near=None):
        """near="src" or "dst" puts the label next to the sender or the receiver instead of centring it, so that it
        does not cover a lifeline that the arrow crosses."""
        xs, xd = self.lines[src]["x"], self.lines[dst]["x"]
        x1, x2 = self.edge_x(src, xd), self.edge_x(dst, xs)
        st = dict(html=1, strokeColor="#000000", strokeWidth=LINE, endSize=13, rounded=0)
        if kind == "call":
            st.update(endArrow="block", endFill=1)
        else:
            st.update(endArrow="open", endFill=0)
        if kind in ("reply", "create"):
            st.update(dashed=1, dashPattern="8 5")
        self._line("msgs", [(x1, y), (x2, y)], style(**st))
        ly = y - 14 - 12.5 * label.count("<br>")
        w = max([text_width(part, MFONT) for part in label.split("<br>")] + [0])
        if near is None and w <= abs(x2 - x1) - 24:
            self.text(label, (x1 + x2) / 2, ly, MFONT)
        elif near == "dst":
            self.text(label, x2 - 16, ly, MFONT, align="right") if x2 > x1 else self.text(label, x2 + 16, ly, MFONT,
                                                                                          align="left")
        elif x2 > x1:   # too long for its arrow: starts next to the sender and runs on past the receiver
            self.text(label, x1 + 10, ly, MFONT, align="left")
        else:
            self.text(label, x1 - 10, ly, MFONT, align="right")

    def call(self, src, dst, label, step=STEP, activate=True, near=None):
        """Synchronous call: filled arrowhead; starts an activation bar on the receiver (activate=False: the receiver
        is already executing, e.g. a person's input to a page that is open)."""
        self.y += step
        if activate:
            self.activate(dst)
        self._arrow(src, dst, label, "call", self.y, near)

    def send(self, src, dst, label, step=STEP, bar=0, near=None):
        """Asynchronous message: open arrowhead; the sender does not wait. bar > 0: the receiver executes briefly
        (a short activation bar of that height), e.g. a queue that stores the job."""
        self.y += step
        if bar:
            self.activate(dst)
        self._arrow(src, dst, label, "async", self.y, near)
        if bar:
            self.deactivate(dst, self.y + bar)

    def done(self, key, dy=24):
        """End of the receiver's execution without a drawn reply (the operation returns nothing that is used)."""
        self.y += dy
        self.deactivate(key)

    def reply(self, src, dst, label, step=STEP, end=True, near=None):
        """Reply: dashed line with an open arrowhead; ends the sender's activation bar (end=False keeps it open)."""
        self.y += step
        self._arrow(src, dst, label, "reply", self.y, near)
        if end:
            self.deactivate(src)

    def create(self, src, key, label, x, step=STEP + 10):
        """Creation: dashed arrow to the head of the new lifeline, which starts at this height."""
        self.y += step
        self.lifeline(key, label, x, at=self.y)
        xs = self.edge_x(src, x)
        xh = x - self.lines[key]["w"] / 2 if x > self.lines[src]["x"] else x + self.lines[key]["w"] / 2
        self._line("msgs", [(xs, self.y), (xh, self.y)], style(html=1, strokeColor="#000000", strokeWidth=LINE,
                   endArrow="open", endFill=0, endSize=13, dashed=1, dashPattern="8 5"))
        self.text("«create»", (xs + xh) / 2, self.y - 14, MFONT)
        self.y += HEAD_H / 2 - 10

    def self_call(self, key, label, step=STEP):
        """Call of an object to itself: a loop back onto a nested activation bar."""
        self.y += step
        x0 = self.edge_x(key, 10 ** 6)
        y1, y2 = self.y, self.y + 22
        self.activate(key, y2)
        x_in = self.edge_x(key, 10 ** 6)
        self._line("msgs", [(x0, y1), (x0 + 46, y1), (x0 + 46, y2), (x_in, y2)], style(html=1, strokeColor="#000000",
                   strokeWidth=LINE, endArrow="block", endFill=1, endSize=11, rounded=0, edgeStyle="none"))
        extra = 12.5 * label.count("<br>")     # further lines continue below the first one
        self.text(label, x0 + 54, y1 + 2 + extra, MFONT, align="left")
        self.y = y2 + 18 + 2 * extra
        self.deactivate(key)

    def gate(self, dst, label, step=STEP):
        """Asynchronous message from a gate on the left edge of the frame, e.g. a job taken from the Task Queue;
        starts an activation bar on the receiver."""
        self.y += step
        self.activate(dst)
        x2 = self.edge_x(dst, 0)
        self._line("msgs", [(6, self.y), (x2, self.y)], style(html=1, strokeColor="#000000", strokeWidth=LINE,
                   endArrow="open", endFill=0, endSize=13, rounded=0))
        self.text(label, (6 + x2) / 2, self.y - 14 - 12.5 * label.count("<br>"), MFONT)

    def ref(self, src, label, name, x1, x2, h=76, step=STEP + 16):
        """Interaction use ("ref" frame) that covers the lifelines between x1 and x2 and shows the interaction with this
        name; with src, an asynchronous message from src enters it through a gate on its left edge."""
        self.y += step
        top = self.y - 30
        if src:
            xs = self.edge_x(src, x1)
            self._line("msgs", [(xs, self.y), (x1, self.y)], style(html=1, strokeColor="#000000", strokeWidth=LINE,
                       endArrow="open", endFill=0, endSize=13, rounded=0))
            self.text(label, (xs + x1) / 2, self.y - 14, MFONT)
        self.fragment("ref", "", x1, x2, top, top + h, fill="#FFFFFF")
        self.text(name, (x1 + x2) / 2, top + h / 2 + 8, HFONT, layer="heads", bg=False)  # above the white frame
        self.y = top + h

    # ---------- fragments ----------
    def fragment(self, op, guard, x1, x2, y1, y2, fill="none", gx=None):
        """Combined fragment: operator in the name box, guard at the top left of its operand. fill="#FFFFFF" hides
        the lifelines behind the frame (an interaction use replaces their part of the scenario)."""
        w = text_width(op, OPFONT, bold=True) + 30
        self._add("frags" if fill == "none" else "heads", op, x1, y1, x2 - x1, y2 - y1, style(shape="umlFrame",
                  whiteSpace="wrap", html=1, width=w, height=30, boundedLbl=1, verticalAlign="top", align="left",
                  spacingLeft=6, spacingTop=-1, fontStyle=1, fontSize=OPFONT, fontFamily="Helvetica",
                  fontColor="#000000", strokeColor="#000000", strokeWidth=LINE, fillColor=fill, swimlaneFillColor=fill))
        if guard:   # gx: guard further right, e.g. clear of an activation bar that passes the name box
            self.text(guard, x1 + w + 10 if gx is None else gx, y1 + 15, SGFONT, align="left")

    def operand(self, guard, x1, x2, gap=18):
        """Dashed line that starts the next operand of an "alt" fragment, with its guard at the top left; the first
        message of the operand then needs step=OPERAND."""
        self.y += gap
        self._line("frags", [(x1, self.y), (x2, self.y)], style(html=1, endArrow="none", strokeColor="#000000",
                   strokeWidth=LINE, dashed=1, dashPattern="10 6"))
        self.text(guard, x1 + 10, self.y + 16, SGFONT, align="left")

    def begin(self):
        """Start of a fragment: returns its top; the first message inside then needs step=FIRST."""
        self.y += 18
        return self.y - 4

    # ---------- output ----------
    def save(self, slug):
        bottom = self.y + 40
        for key in list(self.open):
            while self.open[key]:
                self.deactivate(key, bottom - 14)
        for key, y1, y2, level in self.bars:
            x = self.lines[key]["x"] + level * BAR / 2
            self._add("bars", "", x - BAR / 2, y1, BAR, y2 - y1, style(rounded=0, html=1, fillColor="#FFFFFF",
                      strokeColor="#000000", strokeWidth=LINE))
        for key, ln in self.lines.items():
            self._line("lines", [(ln["x"], ln["head_bottom"]), (ln["x"], bottom)], style(html=1, endArrow="none",
                       strokeColor="#000000", strokeWidth=LINE, dashed=1, dashPattern="6 6"))
        name = f"sd {self.name}"
        nw = text_width(name, FFONT, bold=True) + 34
        self._add("frags", name, 6, 8, self.width - 12, bottom + 12 - 8, style(shape="umlFrame", whiteSpace="wrap",
                  html=1, width=nw, height=36, boundedLbl=1, verticalAlign="top", align="left", spacingLeft=8,
                  fontStyle=1, fontSize=FFONT, fontFamily="Helvetica", fontColor="#000000", strokeColor="#000000",
                  strokeWidth=STROKE, fillColor="none"))
        self.layers["bg"][0] = self.layers["bg"][0].replace('height="1"', f'height="{bottom + 16:.0f}"')
        self.d.cells = sum((self.layers[k] for k in ("bg", "frags", "lines", "bars", "msgs", "labels", "heads")), [])
        path = HERE / f"{slug}.drawio"
        path.write_text(self.d.xml(), encoding="utf-8")
        return export(path, self.width)


# ---------- component and deployment diagrams ----------
NAME, KEY, LABEL, TITLE = 20, 18, 18, 24    # component name (bold), keyword, interface label, diagram title (bold)
BALL = 22                                   # diameter of a provided-interface ball
STEM = 26                                   # length of the line between a component and its ball or socket
PORT = 16                                   # side of a port square
CH = 76                                     # height of a component box


class Canvas:
    LAYERS = ("bg", "frames", "lines", "shapes", "labels")

    def __init__(self, title, width=FULL_W):
        self.d = Diagram(title)
        self.title, self.width = title, width
        self.layers = {k: [] for k in self.LAYERS}
        self.boxes = {}
        self._add("bg", "", 0, 0, width, 1, style(rounded=0, fillColor="#FEFEFE", strokeColor="none"))
        self.text(title, width / 2, 34, TITLE, bold=True)

    # ---------- primitives ----------
    def _add(self, layer, label, x, y, w, h, st):
        cid = self.d.vertex(label, x, y, w, h, st)
        self.layers[layer].append(self.d.cells.pop())
        return cid

    def line(self, pts, dashed=False, arrow=False, layer="lines"):
        cid = self.d._id()
        (x1, y1), (x2, y2), mid = pts[0], pts[-1], pts[1:-1]
        arr = "".join(f'<mxPoint x="{x}" y="{y}"/>' for x, y in mid)
        geo = (f'<mxGeometry relative="1" as="geometry"><mxPoint x="{x1}" y="{y1}" as="sourcePoint"/>'
               f'<mxPoint x="{x2}" y="{y2}" as="targetPoint"/>' + (f'<Array as="points">{arr}</Array>' if mid else "")
               + "</mxGeometry>")
        st = dict(html=1, strokeColor="#000000", strokeWidth=LINE, rounded=0, endArrow="open" if arrow else "none",
                  endFill=0, endSize=13, edgeStyle="none")
        if dashed:
            st.update(dashed=1, dashPattern="8 5")
        self.layers[layer].append(f'<mxCell id="{cid}" value="" style="{style(**st)}" edge="1" parent="1">{geo}'
                                  f'</mxCell>')

    def text(self, label, x, y, size, align="center", bold=False, layer="labels"):
        """Text centred vertically on y; x = left edge (left), centre (center) or right edge (right)."""
        w = max(text_width(part, size, bold) for part in label.split("<br>")) + 6
        h = size * 1.25 * (label.count("<br>") + 1)
        x0 = {"left": x, "center": x - w / 2, "right": x - w}[align]
        st = "text;" + style(html=1, align=align, verticalAlign="middle", fontFamily="Helvetica", fontSize=size,
                             fontColor="#000000", fontStyle=1 if bold else 0, whiteSpace="nowrap", spacing=0,
                             labelBackgroundColor="#FEFEFE")
        return self._add(layer, label, x0, y - h / 2, w, h, st)

    # ---------- components ----------
    def icon(self, x, y):
        """UML component icon (top right corner of a component): a rectangle with two small tabs on its left side."""
        st = style(rounded=0, html=1, fillColor="#FFFFFF", strokeColor="#000000", strokeWidth=1.5)
        self._add("labels", "", x, y, 18, 22, st)
        self._add("labels", "", x - 5, y + 4, 10, 5, st)
        self._add("labels", "", x - 5, y + 13, 10, 5, st)

    def component(self, key, name, cx, y, w, h=CH, keyword="«component»"):
        x = cx - w / 2
        self._add("shapes", "", x, y, w, h, style(rounded=0, html=1, fillColor="#FFFFFF", strokeColor="#000000",
                                                 strokeWidth=STROKE))
        lines = name.count("<br>") + 1
        top = y + h / 2 - (KEY * 1.25 + NAME * 1.25 * lines) / 2
        tx = x + (w - 30) / 2 + 4           # text centred in the part left of the component icon
        self.text(keyword, tx, top + KEY * 0.62, KEY)
        self.text(name, tx, top + KEY * 1.25 + NAME * 0.62 * lines, NAME, bold=True)
        self.icon(x + w - 26, y + 8)
        self.boxes[key] = dict(x=x, y=y, w=w, h=h, cx=cx, cy=y + h / 2)
        return self.boxes[key]

    def frame(self, name, x, y, w, h, keyword="«subsystem»"):
        """White-box component (the subsystem), with its name centred at the top."""
        self._add("frames", "", x, y, w, h, style(rounded=0, html=1, fillColor="none", strokeColor="#000000",
                                                 strokeWidth=STROKE))
        self.text(keyword, x + 12, y + 22, KEY, align="left")
        self.text(name, x + 12, y + 46, NAME, align="left", bold=True)
        self.icon(x + w - 30, y + 10)

    # ---------- interfaces ----------
    def ball(self, key, side, at, label, lpos="right"):
        """Provided interface of a component: a stem from its side (top, bottom, left, right) at offset `at` along
        that side, ending in a ball; returns the ball centre."""
        b = self.boxes[key]
        if side in ("top", "bottom"):
            x0 = b["x"] + at
            y0 = b["y"] if side == "top" else b["y"] + b["h"]
            s = -1 if side == "top" else 1
            self.line([(x0, y0), (x0, y0 + s * STEM)])
            c = (x0, y0 + s * (STEM + BALL / 2))
        else:
            y0 = b["y"] + at
            x0 = b["x"] if side == "left" else b["x"] + b["w"]
            s = -1 if side == "left" else 1
            self.line([(x0, y0), (x0 + s * STEM, y0)])
            c = (x0 + s * (STEM + BALL / 2), y0)
        self._add("shapes", "", c[0] - BALL / 2, c[1] - BALL / 2, BALL, BALL, "ellipse;" + style(
            html=1, fillColor="#FFFFFF", strokeColor="#000000", strokeWidth=STROKE, aspect="fixed"))
        # aboveleft / aboveright: clear of lines that reach the ball from the side; belowleft: between the ball and
        # the component, left of the stem, clear of a line that passes at the height of the ball
        dx, dy = {"right": (BALL / 2 + 6, 0), "left": (-BALL / 2 - 6, 0), "above": (0, -BALL / 2 - 14),
                  "below": (0, BALL / 2 + 14), "aboveleft": (-16, -BALL / 2 - 12), "aboveright": (16, -BALL / 2 - 12),
                  "belowleft": (-8, BALL / 2 + 13)}[lpos]
        align = {"right": "left", "left": "right", "above": "center", "below": "center", "aboveleft": "right",
                 "aboveright": "left", "belowleft": "right"}[lpos]
        self.text(label, c[0] + dx, c[1] + dy, LABEL, align=align)
        return c

    def use(self, pts, ball):
        """Usage dependency: dashed line with an open arrowhead from the user (pts[0]) along pts to the ball edge;
        the last point may be the ball centre, which only gives the direction of the last segment."""
        pts = [p for p in pts if math.hypot(p[0] - ball[0], p[1] - ball[1]) > 1]
        (px, py), (cx, cy) = pts[-1], ball
        d = math.hypot(cx - px, cy - py)
        end = (cx - (cx - px) / d * (BALL / 2 + 1), cy - (cy - py) / d * (BALL / 2 + 1))
        self.line(list(pts) + [end], dashed=True, arrow=True)

    # ---------- ports of the subsystem ----------
    def port(self, x, y):
        self._add("shapes", "", x - PORT / 2, y - PORT / 2, PORT, PORT, style(
            rounded=0, html=1, fillColor="#FFFFFF", strokeColor="#000000", strokeWidth=STROKE))

    def provided_port(self, x, y, side, label, lpos=None):
        """Port on the border with a provided interface (ball) outside; side = direction from the border outward."""
        self.port(x, y)
        dx, dy = {"top": (0, -1), "bottom": (0, 1), "left": (-1, 0), "right": (1, 0)}[side]
        s0 = (x + dx * PORT / 2, y + dy * PORT / 2)
        c = (s0[0] + dx * (STEM + BALL / 2), s0[1] + dy * (STEM + BALL / 2))
        self.line([s0, (s0[0] + dx * STEM, s0[1] + dy * STEM)])
        self._add("shapes", "", c[0] - BALL / 2, c[1] - BALL / 2, BALL, BALL, "ellipse;" + style(
            html=1, fillColor="#FFFFFF", strokeColor="#000000", strokeWidth=STROKE, aspect="fixed"))
        self._port_label(c, BALL / 2, side, label, lpos)

    def required_port(self, x, y, side, label, lpos=None):
        """Port on the border with a required interface (socket) outside, open towards the provider."""
        self.port(x, y)
        dx, dy = {"top": (0, -1), "bottom": (0, 1), "left": (-1, 0), "right": (1, 0)}[side]
        s0 = (x + dx * PORT / 2, y + dy * PORT / 2)
        e = (s0[0] + dx * STEM, s0[1] + dy * STEM)
        self.line([s0, e])
        if side in ("left", "right"):
            sx = e[0] - 2 if side == "right" else e[0] - 13
            self._add("shapes", "", sx, e[1] - 15, 15, 30, style(shape="requiredInterface", html=1, strokeWidth=STROKE,
                      direction="west" if side == "right" else "east", fillColor="none"))
            c = (e[0] + dx * 8, e[1])
        else:
            sy = e[1] - 2 if side == "bottom" else e[1] - 13
            self._add("shapes", "", e[0] - 15, sy, 30, 15, style(shape="requiredInterface", html=1, strokeWidth=STROKE,
                      direction="north" if side == "bottom" else "south", fillColor="none"))
            c = (e[0], e[1] + dy * 8)
        self._port_label(c, 8, side, label, lpos)

    def _port_label(self, c, r, side, label, lpos):
        lpos = lpos or {"top": "above", "bottom": "below", "left": "above", "right": "right"}[side]
        n = label.count("<br>")
        if lpos == "above":
            self.text(label, c[0], c[1] - r - 14 - 11 * n, LABEL)
        elif lpos == "below":
            self.text(label, c[0], c[1] + r + 14 + 11 * n, LABEL)
        elif lpos == "right":
            self.text(label, c[0] + r + 8, c[1], LABEL, align="left")
        else:
            self.text(label, c[0] - r - 8, c[1], LABEL, align="right")

    def delegate(self, pts):
        """Delegation connector between a port of the subsystem and the component inside: a solid line."""
        self.line(pts)

    # ---------- deployment diagrams ----------
    def node(self, key, keyword, name, x, y, w, h, depth=12, artifacts=(), bold=18, layer="shapes"):
        """UML node: 3D box with its depth to the top right; keyword and name at the top left of the front face,
        deployed artifacts (Docker images) as small boxes with the document icon below the name."""
        self._add(layer, "", x, y, w, h, style(shape="cube", whiteSpace="wrap", html=1, size=depth, direction="south",
                  strokeWidth=STROKE, strokeColor="#000000", fillColor="#FFFFFF", darkOpacity=0, darkOpacity2=0))
        fx, fy, fw, fh = x, y + depth, w - depth, h - depth
        lay = "labels" if layer == "shapes" else "frames"
        lines = name.count("<br>") + 1
        if keyword:
            self.text(keyword, fx + 8, fy + 14, 16, align="left", layer=lay)
            self.text(name, fx + 8, fy + 28 + 11.25 * lines, bold, align="left", bold=True, layer=lay)
        else:                           # a node without keyword (external service): name only
            self.text(name, fx + 8, fy + 8 + 11.25 * lines, bold, align="left", bold=True, layer=lay)
        ay = fy + fh - 10 - 34 * len(artifacts) + 6      # artifacts aligned at the bottom of the node
        for a in artifacts:
            self.artifact(fx + 8, ay, fw - 16, a)
            ay += 34
        self.boxes[key] = dict(x=fx, y=fy, w=fw, h=fh, cx=fx + fw / 2, cy=fy + fh / 2, top=y, depth=depth)
        return self.boxes[key]

    def artifact(self, x, y, w, name, h=28):
        """Deployed artifact: rectangle with the artifact (document) icon at its right."""
        self._add("labels", "", x, y, w, h, style(rounded=0, html=1, fillColor="#FFFFFF", strokeColor="#000000",
                  strokeWidth=1.5))
        self.text(name, x + 7, y + h / 2, 16, align="left")
        self._add("labels", "", x + w - 19, y + 5, 13, 18, style(shape="note", size=5, html=1, strokeWidth=1.2,
                  fillColor="#FFFFFF", strokeColor="#000000"))

    def network(self, key, name, x, y, w, h, depth=8, vertical=False):
        """Network zone: a flat (or tall, vertical) node with the keyword «network»."""
        self._add("shapes", "", x, y, w, h, style(shape="cube", html=1, size=depth, direction="south",
                  strokeWidth=STROKE, strokeColor="#000000", fillColor="#FFFFFF", darkOpacity=0, darkOpacity2=0))
        fx, fy, fw, fh = x, y + depth, w - depth, h - depth
        if vertical:
            self._add("labels", f"«network» <b>{name}</b>", fx + fw / 2 - 120, fy + fh / 2 - 12, 240, 24,
                      "text;" + style(html=1, align="center", verticalAlign="middle", fontFamily="Helvetica",
                                      fontSize=16, fontColor="#000000", rotation=-90, whiteSpace="nowrap"))
        else:
            self.text(f"«network» <b>{name}</b>", fx + 10, fy + fh / 2, 16, align="left")
        self.boxes[key] = dict(x=fx, y=fy, w=fw, h=fh, cx=fx + fw / 2, cy=fy + fh / 2)
        return self.boxes[key]

    def path(self, pts, label=None, at=None, arrow=False):
        """Communication path: solid line; an open arrowhead shows the side that opens the connection."""
        self.line(pts, arrow=arrow)
        if label:
            self.text(label, at[0], at[1], 16, align="left")

    # ---------- output ----------
    def save(self, slug, height):
        self.layers["bg"][0] = self.layers["bg"][0].replace('height="1"', f'height="{height:.0f}"')
        self.d.cells = sum((self.layers[k] for k in self.LAYERS), [])
        path = HERE / f"{slug}.drawio"
        path.write_text(self.d.xml(), encoding="utf-8")
        return export(path, self.width)
