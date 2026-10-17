# CHAPTER 1: INTRODUCTION

This chapter states the problem Aegis Wealth AI addresses, its objectives and scope within the competition topic, its key features, the users it serves and the tools it is built with. The requirements are those of the project documentation [@project-doc]. Their identifiers (FR for functional, NFR for non-functional requirements, AT for acceptance tests) are cited throughout this document and traced in Appendix A.

## 1.1 Problem and Objectives

Personal wealth advice is expensive to deliver one adviser at a time, so most savers either receive none or receive a product sale. Robo-advisers lowered the cost, but their reasoning is opaque to the client. General-purpose chat assistants explain fluently, but they can state figures that no calculation produced, recommend products that do not suit the client, and be talked out of their limits. An AI that takes part in finance as a participant, the theme of the competition, has to do real advisory work while remaining suitable, explainable and supervised.

Regulators have already stated what they expect. Article 23 of China's 2018 Guiding Opinions on asset management requires firms that use artificial intelligence in investment advice to follow the suitability and disclosure rules. It also requires them to report the model's parameters and allocation logic, make investors aware of the algorithm's limits, and be able to intervene by hand when the model fails [@cn-amgo]. The CSRC suitability measures require products to match the investor's assessed risk tolerance [@cn-suit]. MiFID II requires suitability assessments and cost disclosure [@mifid2]. The EU AI Act and China's labelling measures require that people know when content comes from an AI system [@eu-ai-act; @cn-aigc-label].

Aegis turns these expectations into engineering objectives, listed in {@tbl:objectives}. Each objective is measured by an automated test or by the red-team run.

Table: Objectives of Aegis Wealth AI and how they are verified {#tbl:objectives}
| No. | Objective | How it is achieved | Verified by |
|------|----------------|------------------------------------|----------------|
| O1 | No unsuitable product can pass | A nine-rule compliance gate runs on every proposal version, inside the only save path | AT-07; red-team group 3 (suitability bypass) |
| O2 | Every figure can be traced | Engines compute all numbers; the grounding check rejects any number not found in the turn's tool results | AT-08, AT-09 |
| O3 | The AI can propose but never execute | No agent tool exists for execution; orders need the client's quiz, Confirm click and a one-time token | AT-10; red-team group 4 (0 orders) |
| O4 | Compliance can supervise and stop the AI | The AI Control Room: alerts, review queue, model disclosure and two switches | `test_oversight.py` |
| O5 | Every recommendation leaves a tamper-evident record | Hash-chained advice records and an append-only operation log | AT-11 |
| O6 | The service works without the model | Checked template answers call the same tools through the same broker | AT-12 |

## 1.2 Competition Topic and Scope

Topic B of the International Track asks for "an agent that mirrors a professional wealth-advisory workflow — product comparison, client risk profiling, and advisory dialogue — producing compliant and explainable asset-allocation suggestions" [@competition]. The three scoring dimensions are task completion (40%), security and compliance (30%) and innovation and interaction (30%). Aegis covers the whole advisory run from the first questionnaire to the executed, recorded recommendation. It adds supervision features that the topic's security dimension rewards. {@tbl:scope} lists what is in scope and what is excluded by design.

Table: Scope of the system {#tbl:scope}
| In scope | Out of scope by design |
|--------------------------------|--------------------------------|
| Risk profiling with contradiction checks and a historical crisis replay | Real money and real brokerage accounts |
| A shelf of 20 sample products with comparison and fee projections | Live market data (prices come from sample and synthetic data) |
| Rule-based asset allocation, risk metrics and stress tests | Self-registration (three seeded demo accounts) |
| A nine-rule compliance gate with How to fix and a What-if lab | Tax advice and tax-aware trading |
| An advisor agent with tools, citations and checked fallback answers | Automatic trading on a schedule or a condition |
| Quiz, confirmation and execution in a sandbox account | Connections to outside agents (planned, Section 7.3) |
| Advice records, the operation log and the compliance console | |
| Goal projections, a daily briefing and a monitoring loop with rebalancing | |
| The AI Control Room for the compliance officer | |

No code path exists for anything in the right-hand column, so no prompt can reach it. All products, prices and market history are sample or synthetic data and are labelled as such on every screen (NFR-6.2).

## 1.3 Key Features

{@tbl:features} summarises the features a reviewer meets when running the system. Chapters 3 to 5 describe how each one works.

Table: Key features {#tbl:features}
| Feature | What it does |
|----------------|--------------------------------------------|
| Advisory run | Profile, proposal, gate, quiz, Confirm, execution and record, in one guided journey |
| The AI shows its work | Each tool result appears as a card beside the reply, and every figure in the reply is underlined; hovering it names the tool field it came from |
| Crisis time machine | The client lives through 2008, 2020 or 2022 month by month with their own amount, beside the real events of those months; the replay stops at the lowest point and asks what they would do, and the answer can lower the risk tier |
| Rules that name their regulation | Each of the nine gate rules shows the requirement it implements, such as Article 23 of the Guiding Opinions, the CSRC suitability measures or MiFID II |
| What-if lab and How to fix | Sliders re-run the whole gate live without saving; when the gate rejects, How to fix computes the smallest change that passes, rule by rule |
| Goal planner | 1,000 seeded paths resampled from history give the chance of reaching a target and the monthly amount needed for a 50%, 75% or 90% chance |
| Supervised monitoring | The officer moves a simulated market; drift beyond a 5-point band raises an alert, and a rebalancing is a new proposal version through the gate |
| AI Control Room | Live feed of every AI action, alerts, a review queue, a model disclosure and two switches that stop the advisor or execution |
| AI labels and provenance | Every reply is labelled as AI-generated, a checked template or a system notice, with the model, a configuration fingerprint and a content hash |
| Tamper-evident records | Every execution writes a hash-chained advice record; verification names the first altered record |

## 1.4 Users of the System

Aegis has two human roles and one software actor, shown in {@tbl:actors}. The seeded demonstration accounts are Rina and Chen (clients) and Amara (compliance officer).

Table: Actors of Aegis Wealth AI {#tbl:actors}
| Actor | Kind | What the actor can do |
|------------|----------|-----------------------------------------------|
| Client | Primary (person) | Complete the risk profile, browse and compare products, create, revise and confirm proposals, chat with the advisor, view their sandbox account and records, set goals and propose rebalancing |
| Compliance officer | Primary (person) | Read every log and record, verify the record chain, supervise the AI in the Control Room, suspend the advisor or halt execution with a reason, review flagged turns and move the simulated market; never change a client's data |
| Advisor agent | Secondary (software) | Call the T0 to T2 tools for the logged-in client: read products, rules, the client's own profile and proposals, project goals, suggest fixes, check drift, and create or revise proposals for the gate |
| Claude model | External system | Write the advisor's replies and choose tools; it receives a masked context and never touches data directly |

## 1.5 Tools and Technologies

{@tbl:tools} lists the main technologies. The frontend and backend agree on one contract: the backend publishes OpenAPI, and the frontend's types are generated from it (NFR-5.2).

Table: Tools and technologies {#tbl:tools}
| Layer | Technology | Use |
|------------|--------------------------|------------------------------------|
| Web application | Next.js 16 (App Router), React 19, TypeScript | Screens, routing, the `/api` forwarding |
| Interface | Tailwind CSS 4, shadcn/ui, Recharts, Motion, NumberFlow | Design system, charts, motion, animated figures |
| Data fetching | TanStack Query, openapi-typescript, MSW | Server state, generated types, an in-browser mock API |
| API | Python 3.12, FastAPI, Pydantic 2, Uvicorn | REST endpoints, validation, OpenAPI |
| Persistence | SQLAlchemy 2, SQLite (WAL) | Tables, transactions, append-only triggers |
| Model access | Anthropic Python SDK, Claude (`claude-opus-5-5`) | The advisor's replies and tool choices [@anthropic-tools] |
| Quality | pytest, Ruff, ESLint, TypeScript compiler | Tests, lint and formatting |
| Delivery | Docker, Docker Compose, Render | One-command local run and the hosted demo |

## 1.6 Structure of This Document

Chapter 2 describes the system architecture: its drivers, modules, layers, components, the flow of an advisory run, deployment, data and API. Chapter 3 gives the core algorithms with their formulas and worked examples. Chapter 4 describes the advisor agent, and Chapter 5 the supervision features and the security design. Chapter 6 reports the tests and their results, and Chapter 7 concludes with limitations and future work. Appendix A traces the requirements to components and tests, Appendix B lists terms and abbreviations, and Appendix C records the design decisions that depart from the project documentation. The permission tiers and the full known-risk list are in the security self-assessment, submitted as deliverable 05.
