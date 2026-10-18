// Builds the competition's formal reports from Markdown sections, in the format of a formal project report (see
// ../PLAN.md §1): docs/report/Aegis_Technical_Documentation.docx from docs/report/src (deliverable 01), and
// docs/report/Aegis_Security_Self_Assessment.docx from docs/report/src-security (deliverable 05).
// Adapted from the report builder of the team's Sentra project.
//
// Markdown subset:
//   # CHAPTER n: TITLE     chapter heading (new page, centered, rule below; resets table/figure numbers)
//   ## / ### / ####        section headings
//   text                   justified paragraph; **bold**, *italic*, `code`; \* = a literal asterisk
//   - item / 1. item       bullets (2-space nesting) / numbered list
//   Table: Caption         caption for the pipe table that follows -> "Table c.n — Caption"
//   | a | b |              pipe table (first row is the header, second row the |---| separator)
//   ![Caption](path)       image (path relative to docs/report) with "Figure c.n — Caption" below
//   ::: figrow             figures side by side: one ![Caption](path) line per figure, closed by ":::"
//   > text                 note paragraph
//   ---                    page break
//   [@key] or [@a; @b]     citation of entries in ../references.md, numbered in order of first use -> [1] or [2], [3]
//   {{REFERENCES}}         the numbered IEEE reference list of every cited entry
//   Table: Cap {#tbl:x}    labelled caption; "{@tbl:x}" in the text becomes "Table c.n" (same for {#fig:x} in ![Cap {#fig:x}](path))
//   Table: Cap {.keep}     keeps the caption and the whole table on one page
//   <!-- ... -->           comment, ignored
//
// Usage:
//   node build.js                         the technical documentation
//   node build.js --doc security          the security self-assessment report
//   node build.js --from "2.4" out.docx   preview starting at the first heading beginning with "2.4" (with --doc too)
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, LevelFormat, TableOfContents, Footer, PageNumber, ImageRun, LineRuleType,
  TableLayoutType, Tab, VerticalMergeType, StyleLevel,
} = require("docx");

const ROOT = path.join(__dirname, "..");
const TITLE = "Aegis Wealth AI";
const SUBTITLE = "An AI wealth-advisory agent that works the way a licensed advisor does, inside safe limits";
// The documents this builder makes: their Markdown folder, output file, name, cover lines and version.
const DOCS = {
  technical: {
    src: "src", out: "Aegis_Technical_Documentation.docx", name: "Technical Documentation",
    cover: ["TECHNICAL DOCUMENTATION", "Deliverable 01: System Architecture, Core Algorithms and Security Design"],
    version: "Version 1.0, 19 October 2026",
  },
  security: {
    src: "src-security", out: "Aegis_Security_Self_Assessment.docx", name: "Security Self-Assessment Report",
    cover: ["SECURITY SELF-ASSESSMENT REPORT", "Deliverable 05: Permission-Tier Implementation and Known-Risk List"],
    version: "Version 1.0, 19 October 2026",
  },
};
const docArg = process.argv.includes("--doc") ? process.argv[process.argv.indexOf("--doc") + 1] : "technical";
const DOC = DOCS[docArg];
if (!DOC) throw new Error(`Unknown document "${docArg}": use ${Object.keys(DOCS).join(" or ")}`);
const SRC = path.join(ROOT, DOC.src);
// Cover page details for the 2026 FinTechathon International Track submission.
const COVER = [
  ["Team", "NextWave"],
  ["Members", "JOYNTO GHOSH, Daffodil International University\nMD. Rezwanul Islam, Daffodil International University\nAlif Uddin Nobin, Daffodil International University\nMost.Esrat Jhahan Nur, Daffodil International University"],
  ["Contact", "joynto241-35-127@diu.edu.bd"],
  ["Source code", "https://github.com/joynto7/Aegis-Wealth-AI"],
  ["Live demo", "https://aegis-wealth-ai.onrender.com"],
  ["Version and date", DOC.version],
];
// Level-1 heading that starts a numbered chapter: "CHAPTER 3: ..." or "APPENDIX A: ...".
const chapterOf = (text) => { const m = /^(?:CHAPTER\s+(\d+)|APPENDIX\s+([A-Z])\b)/i.exec(text); return m && (m[1] || m[2]); };

const FONT = "Times New Roman";
const PAGE_W = 11906, PAGE_H = 16838, MARGIN = 1418; // A4, 2.5 cm margins
const CONTENT_W = PAGE_W - 2 * MARGIN;
const BLACK = "000000";

// ---------- inline formatting ----------
function runs(text, base = {}) {
  // Non-breaking hyphen inside IDs such as FR-10.3, NFR-2.1, UC-5.2 or SD-3, so that an ID never splits across lines.
  text = text.replace(/\b(N?FR|AT|R|DISC|ASI|T)-(?=\d)/g, "$1\u2011");
  // "\*" is a literal asterisk, e.g. the multiplicity 0..\* in Section 3.6; it is kept out of the italic/bold markup.
  text = text.replace(/\\\*/g, "\uE000");
  const lit = (s) => s.replace(/\uE000/g, "*");
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: lit(text.slice(last, m.index)), ...base }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: lit(t.slice(2, -2)), ...base, bold: true }));
    else if (t.startsWith("`")) out.push(new TextRun({ text: lit(t.slice(1, -1)), ...base, font: "Courier New", size: 20 }));
    else out.push(new TextRun({ text: lit(t.slice(1, -1)), ...base, italics: true }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: lit(text.slice(last)), ...base }));
  return out;
}

// ---------- numbering of tables and figures ----------
let chapter = 0, tableNo = 0, figureNo = 0;
// Captions get their own style ("Figure …" or "Table …"), from which the List of Figures and List of Tables are built.
const caption = (text, opts = {}) => new Paragraph({
  style: text.startsWith("Figure ") ? "FigureCaption" : text.startsWith("Table ") ? "TableCaption" : undefined,
  keepNext: opts.keepNext ?? true,
  pageBreakBefore: opts.pageBreakBefore || undefined,
  alignment: opts.align ?? AlignmentType.LEFT,
  spacing: { before: 120, after: 80 },
  children: [new TextRun({ text, size: opts.size ?? 24 })],
});

// ---------- column widths ----------
// Character widths of Times New Roman (1/1000 em, Adobe AFM metrics); Courier New is 600 for every character.
const TIMES_W = {};
"abcdefghijklmnopqrstuvwxyz".split("").forEach((c, i) => { TIMES_W[c] = [444, 500, 444, 500, 444, 333, 500, 500, 278, 278, 500, 278, 778, 500, 500, 500, 500, 333, 389, 278, 500, 500, 722, 500, 500, 444][i]; });
"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((c, i) => { TIMES_W[c] = [722, 667, 667, 722, 611, 556, 722, 722, 333, 389, 722, 611, 889, 722, 722, 556, 722, 667, 556, 611, 722, 722, 944, 722, 722, 611][i]; });
"0123456789".split("").forEach((c) => { TIMES_W[c] = 500; });
Object.assign(TIMES_W, { " ": 250, ".": 250, ",": 250, "-": 333, "‑": 333, "(": 333, ")": 333, "/": 278, ":": 278, ";": 278,
  "%": 833, '"': 408, "'": 180, "_": 500, "+": 564, "=": 564, "×": 564, "—": 1000, "–": 500, "[": 333, "]": 333 });
function wordTwips(word, { bold = false, code = false } = {}) {
  if (code) return word.length * 600 * 10 * 20 / 1000; // Courier New 10 pt
  const em = [...word].reduce((a, c) => a + (TIMES_W[c] ?? 556), 0) * (bold ? 1.1 : 1);
  return em * 11 * 20 / 1000; // Times New Roman 11 pt
}
// The widest piece of a cell that the layout cannot break: words split at spaces, after hyphens (not the non-breaking
// hyphens of identifiers such as FR-1.1) and after slashes.
function minCellWidth(text, isHead) {
  text = text.replace(/\b(N?FR|AT|R|DISC|ASI|T)-(?=\d)/g, "$1‑").replace(/\\\*/g, "*");
  let widest = 0;
  for (const m of text.matchAll(/(`[^`]+`)|(\*\*[^*]+\*\*)|([^`*]+|\*)/g)) {
    const code = !!m[1], bold = isHead || !!m[2];
    const t = (m[1] || m[2] || m[3]).replace(/^`|`$/g, "").replace(/^\*\*|\*\*$/g, "");
    for (const word of t.split(/[ \t\n]+/)) { // ordinary spaces only: a non-breaking space joins its words
      for (const piece of word.split(/(?<=[-/])/)) widest = Math.max(widest, wordTwips(piece, { bold, code }));
    }
  }
  return Math.ceil(widest + 200 + 80); // cell margins of 100 twips on each side, and a little air
}
// Shares the total width by the weights, but never below a column's minimum: columns that would fall below it are
// fixed at their minimum, and the rest is shared again among the others.
function shareWidths(weights, minW, total) {
  const n = weights.length;
  if (minW.reduce((a, b) => a + b, 0) >= total) {
    const sumMin = minW.reduce((a, b) => a + b, 0);
    const w = minW.map((m) => Math.floor((m / sumMin) * total));
    w[n - 1] += total - w.reduce((a, b) => a + b, 0);
    return w;
  }
  const fixed = new Array(n).fill(null);
  for (;;) {
    const free = [...Array(n).keys()].filter((i) => fixed[i] === null);
    const rest = total - fixed.reduce((a, b) => a + (b || 0), 0);
    const sumW = free.reduce((a, i) => a + weights[i], 0);
    const share = Object.fromEntries(free.map((i) => [i, (weights[i] / sumW) * rest]));
    const short = free.filter((i) => share[i] < minW[i]);
    if (!short.length) {
      const w = [...Array(n).keys()].map((i) => (fixed[i] !== null ? fixed[i] : Math.floor(share[i])));
      w[free[free.length - 1]] += total - w.reduce((a, b) => a + b, 0);
      return w;
    }
    short.forEach((i) => { fixed[i] = minW[i]; });
  }
}

// ---------- tables ----------
const line = { style: BorderStyle.SINGLE, size: 4, color: BLACK };
const borders = { top: line, bottom: line, left: line, right: line };
// The separator row controls layout: "|:--:|" centers a column, and unequal dash counts
// ("|---|----------|") set relative column widths. Equal dashes fall back to content-based widths.
function table(rows, keep = false) {
  const parse = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const header = parse(rows[0]);
  const sep = parse(rows[1]);
  const body = rows.slice(2).map(parse);
  const n = header.length;
  const align = sep.map((s) => (s.startsWith(":") && s.endsWith(":") ? AlignmentType.CENTER : AlignmentType.LEFT));
  const dashes = sep.map((s) => (s.match(/-/g) || []).length);
  let weights;
  if (new Set(dashes).size > 1) weights = dashes;
  else {
    // column width proportional to the longest cell text, clamped so no column dominates or vanishes
    const lens = header.map((h, i) => Math.max(h.length, ...body.map((r) => (r[i] || "").length)));
    weights = lens.map((l) => Math.max(8, Math.min(l, 60)));
  }
  // Every column is at least as wide as its longest unbreakable word, so that no header or identifier is split
  // inside a word; the rest of the width is shared by the weights.
  const minW = header.map((_, i) => Math.max(...[header, ...body].map((r, k) => minCellWidth(r[i] || "", k === 0))));
  const widths = shareWidths(weights, minW, CONTENT_W);
  // A body cell containing only "■" is drawn as a filled cell, e.g. a bar in a Gantt-chart table.
  const cell = (text, i, isHead, keepNext = false) => {
    const bar = !isHead && (text || "").trim() === "■";
    return new TableCell({
    width: { size: widths[i], type: WidthType.DXA },
    borders,
    shading: isHead ? { type: ShadingType.CLEAR, color: "auto", fill: "E7E6E6" }
      : bar ? { type: ShadingType.CLEAR, color: "auto", fill: "595959" } : undefined,
    margins: { top: 40, bottom: 40, left: 100, right: 100 },
    children: [new Paragraph({ alignment: align[i], keepNext: keepNext || undefined, spacing: { before: 0, after: 0, line: 240 },
      children: runs(bar ? "" : text || "", { size: 22, bold: isHead || undefined }) })],
    });
  };
  // Short tables (few rows, short cells) are kept on one page; long tables may continue on the next page.
  const keepTogether = keep || (body.length <= 15 && [header, ...body].every((r) => r.every((c) => (c || "").length <= 60)));
  const rowsOut = [header, ...body].map((r, k) => {
    const isHead = k === 0;
    const keep = keepTogether && k < body.length; // every row except the last keeps with the next one
    return new TableRow({
      tableHeader: isHead || undefined,
      cantSplit: true,
      children: header.map((_, i) => cell(r[i], i, isHead, keep)),
    });
  });
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    layout: TableLayoutType.FIXED, // keep the specified widths instead of auto-fitting to content
    columnWidths: widths,
    rows: rowsOut,
  });
}

// ---------- figures ----------
function imageSize(buf, ext) {
  if (ext === "png") return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  for (let i = 2; i < buf.length - 9;) { // JPEG: find the SOF0/1/2 marker
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xc2) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error("Unsupported image");
}
function figure(text, file) {
  const buf = fs.readFileSync(path.resolve(ROOT, file));
  const ext = path.extname(file).slice(1).toLowerCase().replace("jpeg", "jpg");
  let { w, h } = imageSize(buf, ext);
  const maxW = 605, maxH = 830; // 16 cm x 22 cm at 96 dpi (A4 content area less the caption)
  const scale = Math.min(1, maxW / w, maxH / h);
  w = Math.round(w * scale); h = Math.round(h * scale);
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 60 },
      children: [new ImageRun({ type: ext, data: buf, transformation: { width: w, height: h } })] }),
    caption(`Figure ${chapter}.${++figureNo} — ${text}`, { align: AlignmentType.CENTER, keepNext: false, size: 22 }),
  ];
}

// Figures side by side in a borderless table: the images in the first row, top-aligned, and their captions in the
// second row, so that the captions line up. Each image is scaled by the same factor as a full-width figure would be
// when its source is half as wide.
function figureRow(images) {
  const cols = 2; // a row with one figure keeps the left column, so that it lines up with later pages
  const colW = Math.floor(CONTENT_W / cols);
  const maxW = Math.floor(605 / cols) - 10, maxH = 790; // pixels at 96 dpi; leaves room for the caption on the page
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const noBorders = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
  const cell = (children) => new TableCell({ width: { size: colW, type: WidthType.DXA }, borders: noBorders,
    margins: { top: 0, bottom: 0, left: 60, right: 60 }, children });
  const pics = [], caps = [];
  for (const [text, file] of images) {
    const buf = fs.readFileSync(path.resolve(ROOT, file));
    const ext = path.extname(file).slice(1).toLowerCase().replace("jpeg", "jpg");
    let { w, h } = imageSize(buf, ext);
    const scale = Math.min(1, maxW / w, maxH / h);
    w = Math.round(w * scale); h = Math.round(h * scale);
    pics.push(cell([new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 60 },
      children: [new ImageRun({ type: ext, data: buf, transformation: { width: w, height: h } })] })]));
    caps.push(cell([caption(`Figure ${chapter}.${++figureNo} — ${text}`, { align: AlignmentType.CENTER, keepNext: false, size: 22 })]));
  }
  while (pics.length < cols) { pics.push(cell([new Paragraph({ children: [] })])); caps.push(cell([new Paragraph({ children: [] })])); }
  return [new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, layout: TableLayoutType.FIXED, borders: noBorders,
    columnWidths: Array(cols).fill(colW),
    rows: [new TableRow({ cantSplit: true, children: pics }), new TableRow({ cantSplit: true, children: caps })],
  })];
}

// ---------- markdown blocks ----------
const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];
// Set explicitly on every paragraph: some viewers (e.g. macOS Quick Look) ignore the document-wide default.
const BODY = { line: 276, lineRule: LineRuleType.AUTO, after: 80 }; // 1.15 line spacing, as in the reference
const LIST = { line: 276, lineRule: LineRuleType.AUTO, after: 40 };
let listInstance = 0;
let lastSpacer = null;
function convert(md) {
  const out = [];
  const lines = md.replace(/\r/g, "").split("\n");
  let para = [];
  let numberedActive = false;
  let pendingCaption = null;
  let pendingKeep = false;
  const flush = () => {
    if (para.length) out.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: BODY, children: runs(para.join(" ")) }));
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (t && !/^\d+\.\s/.test(t)) numberedActive = false; // blank lines inside a list do not restart it
    if (!t) { flush(); continue; }
    if (t.startsWith("<!--")) { while (!lines[i].includes("-->")) i++; continue; }

    const h = /^(#{1,4})\s+(.*)$/.exec(t);
    if (h) {
      flush();
      const lvl = h[1].length;
      const chap = lvl === 1 && chapterOf(h[2]);
      if (chap) { chapter = chap; tableNo = 0; figureNo = 0; }
      out.push(new Paragraph({
        heading: HEADINGS[lvl - 1],
        pageBreakBefore: lvl === 1,
        border: lvl === 1 ? { bottom: { style: BorderStyle.SINGLE, size: 8, color: BLACK, space: 4 } } : undefined,
        children: [new TextRun(h[2])],
      }));
      continue;
    }
    // page break: an empty paragraph of 1 pt, so that the page after the break does not start with a blank line
    if (t === "---") {
      flush();
      out.push(new Paragraph({ pageBreakBefore: true, spacing: { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT }, children: [] }));
      continue;
    }
    if (t === "{{REFERENCES}}") {
      flush();
      cited.forEach((key, k) => out.push(new Paragraph({
        alignment: AlignmentType.LEFT, spacing: LIST, indent: { left: 540, hanging: 540 },
        children: [new TextRun(`[${k + 1}]`), new TextRun({ children: [new Tab()] }), ...runs(references[key])],
      })));
      continue;
    }
    const cap = /^Table:\s+(.*)$/.exec(t);
    if (cap) {
      flush();
      pendingKeep = /\{\.keep\}/.test(cap[1]);
      pendingCaption = cap[1].replace(/\s*\{\.keep\}/, "");
      continue;
    }
    if (t.startsWith("|")) {
      flush();
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(lines[i++]);
      i--;
      if (pendingCaption) out.push(caption(`Table ${chapter}.${++tableNo} — ${pendingCaption}`));
      out.push(table(rows, pendingKeep));
      pendingCaption = null;
      pendingKeep = false;
      // Small fixed-height gap after a table; it must not spill onto a new page when a table ends at the page bottom.
      lastSpacer = new Paragraph({ spacing: { before: 0, after: 0, line: 200, lineRule: LineRuleType.EXACT }, children: [] });
      out.push(lastSpacer);
      continue;
    }
    if (/^:::\s*figrow$/.test(t)) {
      flush();
      const imgs = [];
      while (++i < lines.length && lines[i].trim() !== ":::") {
        const m = /^!\[(.*)\]\((.*)\)$/.exec(lines[i].trim());
        if (m) imgs.push([m[1], m[2]]);
        else if (lines[i].trim()) throw new Error(`figrow: not an image: "${lines[i].trim()}"`);
      }
      out.push(...figureRow(imgs));
      continue;
    }
    const img = /^!\[(.*)\]\((.*)\)$/.exec(t);
    if (img) { flush(); out.push(...figure(img[1], img[2])); continue; }
    if (t.startsWith("> ")) {
      flush();
      out.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: BODY, indent: { left: 360, right: 360 }, children: runs(t.slice(2), { italics: true }) }));
      continue;
    }
    const b = /^(\s*)- (.*)$/.exec(raw);
    if (b) {
      flush();
      out.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: LIST,
        numbering: { reference: "bullets", level: Math.min(Math.floor(b[1].length / 2), 2) }, children: runs(b[2]) }));
      continue;
    }
    const n = /^(\s*)\d+\.\s+(.*)$/.exec(raw);
    if (n) {
      flush();
      if (!numberedActive) { listInstance++; numberedActive = true; }
      out.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: LIST,
        numbering: { reference: "numbers", level: 0, instance: listInstance }, children: runs(n[2]) }));
      continue;
    }
    para.push(t);
  }
  flush();
  if (out.length && out[out.length - 1] === lastSpacer) out.pop();
  return out;
}

// ---------- document ----------
const args = process.argv.slice(2);
const fromIdx = args.indexOf("--from");
const from = fromIdx >= 0 ? args[fromIdx + 1] : null;
const OUT = from ? path.resolve(args[fromIdx + 2]) : path.join(ROOT, DOC.out);

const files = fs.readdirSync(SRC).filter((f) => f.endsWith(".md")).sort();
let md = files.map((f) => fs.readFileSync(path.join(SRC, f), "utf8")).join("\n\n");
if (from) {
  const at = md.split("\n").findIndex((l) => /^#{1,4}\s/.test(l) && l.replace(/^#+\s+/, "").startsWith(from));
  if (at < 0) throw new Error(`No heading starts with "${from}"`);
  md = md.split("\n").slice(at).join("\n");
}
// ---------- cross-references ----------
// Pre-scan the Markdown in reading order to number labelled tables and figures, so references work in both directions.
const labels = {};
{
  let ch = 0, tn = 0, fn = 0;
  for (const line of md.split("\n")) {
    const t = line.trim();
    const c = /^#\s/.test(t) && chapterOf(t.replace(/^#\s+/, ""));
    if (c) { ch = c; tn = 0; fn = 0; continue; }
    if (/^Table:\s+/.test(t)) {
      tn++;
      const m = /\{#(tbl:[a-z0-9-]+)\}/.exec(t);
      if (m) labels[m[1]] = `Table ${ch}.${tn}`;
    }
    if (/^!\[/.test(t)) {
      fn++;
      const m = /\{#(fig:[a-z0-9-]+)\}\]/.exec(t);
      if (m) labels[m[1]] = `Figure ${ch}.${fn}`;
    }
  }
}
md = md.replace(/\s*\{#(?:tbl|fig):[a-z0-9-]+\}/g, "").replace(/\{@((?:tbl|fig):[a-z0-9-]+)\}/g, (_, key) => {
  if (!labels[key]) throw new Error(`Unknown cross-reference: ${key}`);
  return labels[key];
});

// ---------- citations ----------
// references.md holds a table "| key | IEEE-formatted reference |"; citations are numbered by first use.
const references = Object.fromEntries(
  [...fs.readFileSync(path.join(ROOT, "references.md"), "utf8").matchAll(/^\| *([a-z0-9-]+) *\| *(.+?) *\|$/gm)]
    .filter(([, key]) => key !== "key").map(([, key, text]) => [key, text]),
);
const cited = [];
md = md.replace(/\[@([a-z0-9-]+(?:\s*;\s*@[a-z0-9-]+)*)\]/g, (_, group) => group.split(/\s*;\s*@/).map((key) => {
  if (!references[key]) throw new Error(`Unknown citation key: ${key}`);
  if (!cited.includes(key)) cited.push(key);
  return `[${cited.indexOf(key) + 1}]`;
}).join(", "));

const body = convert(md);

const heading = (id, name, size, lvl, paragraph) => ({
  id, name, basedOn: "Normal", next: "Normal", quickFormat: true,
  run: { font: FONT, size, bold: true, color: BLACK },
  paragraph: { keepNext: true, outlineLevel: lvl, ...paragraph },
});
const tocStyle = (lvl, extra) => ({
  id: `TOC${lvl}`, name: `toc ${lvl}`, basedOn: "Normal", next: "Normal",
  run: { font: FONT, size: 24, ...extra.run }, paragraph: { spacing: { before: extra.before ?? 0, after: 40 }, indent: { left: (lvl - 1) * 440 } },
});

const center = (text, size, opts = {}) => new Paragraph({ alignment: AlignmentType.CENTER,
  spacing: { before: opts.before ?? 0, after: opts.after ?? 120 },
  children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, size })] });
// Cover page: the competition, the project and the deliverable, then the team's details in a table.
const coverTable = () => {
  const W = [2600, CONTENT_W - 2600];
  const cell = (text, w, head) => new TableCell({ width: { size: w, type: WidthType.DXA }, borders,
    shading: head ? { type: ShadingType.CLEAR, color: "auto", fill: "E7E6E6" } : undefined,
    margins: { top: 80, bottom: 80, left: 140, right: 140 },
    children: text.split("\n").map((t) => new Paragraph({ spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: t, bold: head || undefined, size: 22 })] })) });
  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: W,
    rows: COVER.map(([k, v]) => new TableRow({ cantSplit: true, children: [cell(k, W[0], true), cell(v, W[1], false)] })) });
};
const cover = [
  center("2026 SHENZHEN INTERNATIONAL FINTECH COMPETITION", 26, { bold: true, before: 600, after: 80 }),
  center("International Track · Theme: AI as a Financial Participant", 24, { after: 80 }),
  center("Topic B: Wealth Advisory Agent", 24, { italics: true, after: 1300 }),
  center(TITLE, 60, { bold: true, after: 200 }),
  center(SUBTITLE, 26, { italics: true, after: 1100 }),
  center(DOC.cover[0], 36, { bold: true, after: 120 }),
  center(DOC.cover[1], 24, { after: 1300 }),
  coverTable(),
];

const front = from ? [] : [
  ...cover,
  new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.CENTER, spacing: { after: 360 }, children: [new TextRun({ text: "TABLE OF CONTENTS", bold: true, size: 36 })] }),
  new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
  ...["Figures", "Tables"].flatMap((kind) => [
    new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.CENTER, spacing: { after: 360 }, children: [new TextRun({ text: `LIST OF ${kind.toUpperCase()}`, bold: true, size: 36 })] }),
    new TableOfContents(`List of ${kind}`, { hyperlink: true, stylesWithLevels: [new StyleLevel(`${kind.slice(0, -1)}Caption`, 2)] }),
  ]),
];

const doc = new Document({
  creator: "Aegis Wealth AI team",
  title: `${TITLE} — ${DOC.name}`,
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: 24, color: BLACK }, paragraph: { spacing: BODY } } },
    paragraphStyles: [
      heading("Heading1", "Heading 1", 32, 0, { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 480 } }),
      heading("Heading2", "Heading 2", 28, 1, { spacing: { before: 360, after: 120 } }),
      heading("Heading3", "Heading 3", 24, 2, { spacing: { before: 240, after: 80 } }),
      heading("Heading4", "Heading 4", 24, 3, { spacing: { before: 200, after: 60 } }),
      { id: "FigureCaption", name: "FigureCaption", basedOn: "Normal", next: "Normal" },
      { id: "TableCaption", name: "TableCaption", basedOn: "Normal", next: "Normal" },
      tocStyle(1, { run: { bold: true }, before: 120 }),
      tocStyle(2, { run: {} }),
      tocStyle(3, { run: {} }),
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [0, 1, 2].map((l) => ({
        level: l, format: LevelFormat.BULLET, text: ["•", "◦", "▪"][l], alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720 + l * 360, hanging: 360 } } } })) },
      { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  sections: [{
    properties: { titlePage: !from, page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
    footers: { first: new Footer({ children: [new Paragraph({ children: [] })] }),
      default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 22 })] })] }) },
    children: [...front, ...body],
  }],
});

// docx writes the table-of-contents field as two paragraphs, the second holding only the field end.
// LibreOffice keeps that second paragraph as an empty line after the filled table, which produces a
// blank page whenever the table ends at the bottom of a page, so that paragraph is shrunk to 1 pt.
// (Merging it into the first paragraph stops LibreOffice from recognising the table of contents.)
const JSZip = require("jszip");
Packer.toBuffer(doc)
  .then((buf) => JSZip.loadAsync(buf))
  .then(async (zip) => {
    const xml = await zip.file("word/document.xml").async("string");
    const tiny = '<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>';
    const end = '<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:sdtContent>';
    zip.file("word/document.xml", xml.replace(end,
      `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>${tiny}</w:pPr>` +
      `<w:r>${tiny}<w:fldChar w:fldCharType="end"/></w:r></w:p></w:sdtContent>`));
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  })
  .then((buf) => {
    fs.writeFileSync(OUT, buf);
    console.log(`Wrote ${OUT} (${files.length} section file(s)${from ? `, from "${from}"` : ""})`);
  });
