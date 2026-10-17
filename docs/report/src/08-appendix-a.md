# APPENDIX A: REQUIREMENTS TRACEABILITY

This appendix traces each requirement of the project documentation to the module and components that implement it and to the test that verifies it. Modules are numbered as in {@tbl:modules}. "Scenario evidence" means the requirement is checked by the scripted scenario run in the evidence pack.

Table: Traceability of the functional requirements
| Requirement | Summary | Module | Implemented in | Verified by |
|--------|--------------------|:----:|----------------------|------------|
| FR-1.1 | Log in, session cookie | 1 | API Routers (auth), Services | AT-01 |
| FR-1.2 | Log out | 1 | API Routers (auth) | AT-01 |
| FR-1.3 | Role and ownership checks | All | API Routers, Services | AT-01, AT-02 |
| FR-1.4 | Seeded demo accounts | 1 | Seed at start-up | AT-01 |
| FR-2.1 | Questionnaire from the backend | 2 | Data Files, API Routers | AT-03 |
| FR-2.2 | Capacity and willingness scores, tier | 2 | Engines (`scoring`) | AT-03 |
| FR-2.3 | Contradiction checks | 2 | Engines (`contradictions`) | AT-04 |
| FR-2.4 | Historical replay and reaction | 2 | Engines (`replay`) | AT-05 |
| FR-2.5 | Profile versions | 2 | Services (`profiles`) | AT-03 |
| FR-3.1 | Product list and filters | 3 | Web Application, Services | Scenario evidence |
| FR-3.2 | Product detail | 3 | Web Application, Services | Scenario evidence |
| FR-3.3 | Compare two or three products | 3 | Engines (`fees`) | AT-08 |
| FR-3.4 | Data labels | All | Services, Web Application | Scenario evidence |
| FR-4.1 | Generate proposal | 4 | Engines (`allocation`) | AT-06 |
| FR-4.2 | Risk metrics | 4 | Engines (`metrics`) | AT-08 |
| FR-4.3 | Stress tests | 4 | Engines (`stress`) | AT-08 |
| FR-4.4 | Revise proposal | 4 | Services (`persist()`) | AT-07 |
| FR-4.5 | Version comparison (P1) | 4 | Web Application | Scenario evidence |
| FR-5.1 | Evaluate rules R-01 to R-09 | 5 | Engines (`gate`) | AT-07 |
| FR-5.2 | PASS, WARNING or REJECT | 5 | Engines (`gate`) | AT-07 |
| FR-5.3 | Acknowledge warnings | 5 | Services (`proposals`) | AT-07 |
| FR-5.4 | Wording check on replies | 6 | Grounding Check | AT-09 |
| FR-5.5 | Client-directed override (P1) | — | Not built (Appendix C) | — |
| FR-6.1 | Chat with tool list and citations | 6 | Advisor Agent | AT-09 |
| FR-6.2 | Tools only through the broker | 6 | Permission Broker | AT-10, red team |
| FR-6.3 | Grounding check | 6 | Grounding Check | AT-09 |
| FR-6.4 | Fallback without the model | 6 | Advisor Agent (`fallback`) | AT-12 |
| FR-6.5 | Chat history | 6 | Services (`chat`) | Scenario evidence |
| FR-7.1 | Comprehension quiz | 7 | Engines (`quiz`) | AT-10 |
| FR-7.2 | Confirmation token | 7 | Services (`execution`) | AT-10 |
| FR-7.3 | Execute in the sandbox | 7 | Services (`execution`) | AT-10 |
| FR-7.4 | Sandbox account view | 7 | Web Application, Services (`sandbox`) | Scenario evidence |
| FR-8.1 | Advice record, hash chain | 8 | Engines (`chain`), Database | AT-11 |
| FR-8.2 | Verify chain | 8 | Services (`records`) | AT-11 |
| FR-8.3 | Operation log | 8 | Services (`logs`), Database | Red team |
| FR-8.4 | Compliance console | 8, 11 | Web Application, API Routers | AT-01 |
| FR-8.5 | Printable record (P1) | 8 | Web Application | Scenario evidence |
| FR-8.6 | Red-team run | — | `scripts/redteam.py` | Red team |

Table: Traceability of the non-functional requirements
| Requirement | Summary | How it is met | Status |
|--------|--------------------|------------------------------------|------|
| NFR-1.1 | Response time under 2 s | Deterministic endpoints at or below 5.1 ms at p95; projections at most 131 ms | Met |
| NFR-1.2 | Chat within 10 s, fallback at 20 s | 20-second budget per turn, then the template fallback | Met |
| NFR-1.3 | Ten simultaneous users | Single-process server; not load-tested | Not measured |
| NFR-2.1 | Works during a model outage | Template fallback (AT-12) | Met |
| NFR-2.2 | Deterministic numbers | Pure engines; the projection is seeded | Met |
| NFR-2.3 | One error envelope, no stack traces | Error handlers for every exception | Met |
| NFR-2.4 | One transaction per write | Proposal writes, execution and records in one transaction | Met |
| NFR-3.1 | bcrypt passwords, no secrets in Git | bcrypt cost 12; `.env` git-ignored | Met |
| NFR-3.2 | Secure session cookie | 256-bit id, httpOnly, SameSite=Lax, 8 hours | Met |
| NFR-3.3 | Server-side authorisation | Role and ownership on every request (AT-02) | Met |
| NFR-3.4 | Input validation | Pydantic bounds; ORM only; tool inputs validated twice | Met |
| NFR-3.5 | API key only in the backend | Backend environment only, never logged | Met |
| NFR-3.6 | Data minimisation | Masked context without names or e-mails | Met |
| NFR-4.1 | WCAG 2.2 AA [@wcag22] | Contrast, focus and keyboard use designed in and checked in the browser | Partly (no formal audit) |
| NFR-4.2 | No colour-only meaning | PASS, WARNING and REJECT always show an icon and a word | Met |
| NFR-4.3 | Plain language | Units and one-line meanings on every figure | Met |
| NFR-4.4 | Responsive layout | Checked at 375 px phone width and on desktop | Met |
| NFR-4.5 | Feedback on every action | Loading, success and specific error states | Met |
| NFR-5.1 | Pure engines | No file, database or network access in engines | Met |
| NFR-5.2 | Generated contract | OpenAPI from the schemas; generated frontend types | Met |
| NFR-5.3 | Configuration as data | Versioned JSON and CSV files | Met |
| NFR-5.4 | Lint and format | Ruff and ESLint clean | Met |
| NFR-6.1 | Traceable figures | Engines and the grounding check | Met |
| NFR-6.2 | Data labels | Labels on every figure that needs one | Met |
| NFR-6.3 | No promises of returns | Banned phrases | Met |
| NFR-6.4 | Audit trail | Append-only log and hash-chained records | Met |
| NFR-7.1 | One command | `docker compose up --build` | Met |
| NFR-7.2 | Current browsers | Checked in Chrome; others not systematically tested | Partly |
