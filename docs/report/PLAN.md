# Aegis Technical Documentation (deliverable 01): plan

**What:** deliverable 01 of the 2026 Shenzhen International FinTech Competition, "Technical documentation:
system architecture, core algorithm description, security design", rebuilt as a formal report PDF in the style
of the Sentra Capstone Report. It replaces handing in `docs/technical-documentation.md` as plain Markdown.

**Reference studied:** `Sentra_Capstone_Report.pdf` (288 pages), mainly Section 2.2 (block diagram) and Section
2.5 (system architecture, pages 78–93), and its build pipeline in `~/Projects/sentra/docs/report`.

## 1. Format (as in the Sentra report)

| Item | Rule |
| --- | --- |
| Page | A4 (the competition is in China), 2.5 cm margins, page number centred at the bottom |
| Body | Times New Roman 12 pt, justified, black only |
| Chapter title | Bold 16 pt, all caps, centred, rule underneath, new page |
| Headings | 1.1 bold 14 pt; 1.1.1 bold 12 pt |
| Tables | Thin black borders, bold header row on light grey; caption above: "Table 2.1 — Title" |
| Figures | Black-and-white draw.io diagrams in UML notation, exported as 4K PNG; caption below: "Figure 2.1 — Title" |
| Front matter | Cover page, table of contents, list of figures, list of tables, abstract |
| Traceability | Requirement IDs (FR, NFR, AT) from the project documentation cited beside each decision, as Sentra does |

## 2. Outline (target length: 45–60 pages)

Chapter 4 of the Markdown documentation is split into Chapters 4 and 5 here. The security self-assessment
stays a separate deliverable (05) and is cited, not copied.

- **Front matter:** cover · table of contents · list of figures · list of tables · abstract
- **Chapter 1: Introduction.** 1.1 Problem and objectives · 1.2 Competition topic and scope · 1.3 Key
  features · 1.4 Tools and technologies
- **Chapter 2: System Architecture.**
  - 2.1 Architectural drivers
  - 2.2 System block diagram
  - 2.3 Architectural style and layers
  - 2.4 System components (component diagram)
  - 2.5 Flow of an advisory run (sequence diagram)
  - 2.6 Deployment architecture (local, then hosted)
  - 2.7 Data architecture (ER diagram)
  - 2.8 API design overview
- **Chapter 3: Core Algorithms.**
  - 3.1 Risk profiling
  - 3.2 Allocation
  - 3.3 Metrics, stress tests and fees
  - 3.4 Compliance gate (activity diagram)
  - 3.5 Confirmation, execution and the record chain
  - 3.6 Goal projection
  - 3.7 How to fix
  - 3.8 The monitoring loop (activity diagram)
- **Chapter 4: The Advisor Agent.** 4.1 Turn loop · 4.2 Tools and permission tiers · 4.3 Grounding and
  fallback · 4.4 A tool call through the broker (sequence diagram)
- **Chapter 5: AI Supervision and Security Design.** 5.1 The AI Control Room · 5.2 Threat signals and the
  review queue · 5.3 Labels and provenance · 5.4 Security architecture (trust boundaries)
- **Chapter 6: Testing and Quality.** 6.1 Test strategy · 6.2 Results (tests, red team, performance, evidence)
- **Chapter 7: Conclusion.** 7.1 Conclusion · 7.2 Limitations · 7.3 Future work · 7.4 References
- **Appendix A:** requirements traceability · **Appendix B:** glossary

## 3. Figures (draw.io, Sentra style)

| No. | Figure | Kind |
| --- | --- | --- |
| 2.1 | Functional modules of Aegis | Block diagram |
| 2.2 | Components of the Aegis system | UML component diagram |
| 2.3 | One advisory run, from profile to record | UML sequence diagram |
| 2.4 | Local deployment (Docker Compose) | UML deployment diagram |
| 2.5 | Hosted deployment (one container on Render) | UML deployment diagram |
| 2.6 | Main data entities | ER diagram |
| 3.1 | The compliance gate | UML activity diagram |
| 3.2 | The monitoring loop | UML activity diagram |
| 4.1 | A tool call through the permission broker | UML sequence diagram |

## 4. Build

The Sentra pipeline is reused: Markdown sections in `docs/report/src` are turned into a .docx by `tools/build.js`
(the `docx` npm package). `tools/drawio.py` and the diagram scripts write the draw.io files and export the PNGs.
`tools/export_pdf.py` fills in the indexes with LibreOffice and exports the PDF. The output is
`docs/Aegis_Technical_Documentation.pdf`, with the .docx beside it.

## 5. Inputs needed

The team name, members and universities for the cover page. Placeholders are used until they are known.

## 6. Order of work

1. Copy and adapt the tools; build the cover and front matter.
2. Draw the nine figures.
3. Write Chapters 1–2, then 3–7, from `technical-documentation.md`, checking every figure against the code.
4. Export the PDF and check every page (numbering, captions, table breaks, figure sharpness).
5. Update the README to point at the PDF; record any deviations from this plan below.

## 7. As built (17 October 2026)

The document is built as planned: `docs/Aegis_Technical_Documentation.pdf`, 62 A4 pages, from eleven Markdown
sections in `src/` with `./build.sh`. Where the build differs from the plan:

- **Ten figures, not nine.** The entity-relationship diagram is split in two (clients, profiles and proposals; then
  execution, records and oversight), so that twenty tables stay legible on an A4 page. Both are drawn by hand in
  draw.io: a Graphviz layout was tried and gave crossing connectors around the busy tables.
- **62 pages, not 45 to 60.** The extra pages are the second ER diagram and Appendix C.
- **Appendix C added.** It records the design decisions and deviations from the project documentation, which the
  outline had left in Chapter 2.
- **Chapter 7 holds the references**, as "Conclusion and References", so that the appendices follow them.
- **Tables size their columns** to the longest word in each column (`shareWidths` in `tools/build.js`), so that no
  header or identifier is split inside a word. The Sentra builder sized columns by text length only.
- **Every figure was checked against the code** (table and column names from `backend/app/models`, tools and tiers
  from `backend/app/agent/tools.py`, endpoints from `backend/openapi.json`, results from `evidence/`).

To finish before submission: the team's name, members and contact on the cover page (`COVER` in `tools/build.js`).
