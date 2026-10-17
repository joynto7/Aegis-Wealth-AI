# CHAPTER 2: SYSTEM ARCHITECTURE

The system architecture defines how Aegis is divided into modules and components, how they cooperate in an advisory run, and how the design satisfies the requirements of the project documentation. This chapter first identifies the architectural drivers. It then describes the functional modules, the architectural style and layers, the components, the flow of an advisory run, the deployment, the data architecture and the API.

## 2.1 Architectural Drivers

The architecture is shaped mainly by the quality attributes that are hardest to add to a system later: suitability, the separation of the AI from execution, traceable figures and supervision. {@tbl:drivers} lists these drivers and the architectural decisions taken to satisfy them.

Table: Architectural drivers and the decisions that address them {#tbl:drivers}
| Driver | Requirements | Architectural decision |
|--------------|-------------|------------------------------------------------|
| Suitability by construction | FR-5.1, FR-5.2, NFR-6.1 | The compliance gate runs inside the single save path of the proposal service (`persist()`), so every version is evaluated, whether it comes from the client, the agent, How to fix or a rebalancing. No code path skips it. |
| No execution by the AI | FR-6.2, FR-7.2, FR-7.3 | The agent reaches the system only through the permission broker, and no tool exists for execution. Orders need a one-time token, issued only after the client's own quiz and Confirm click. |
| Traceable figures | FR-6.3, NFR-6.1 | Deterministic engines compute every number. The grounding check accepts a number in a reply only when it is a correct rounding of a value in the turn's tool results or the client's message. |
| Determinism and testability | NFR-2.2, NFR-5.1, NFR-5.3 | Engines are pure functions of their arguments and of versioned data files. The one random process, the goal projection, is seeded, so the same question always gets the same answer. |
| Works without the model | NFR-2.1, FR-6.4 | Checked template answers call the same tools through the same broker, so every feature works with no API key, and an outage of the model only changes the wording. |
| Auditability | FR-8.1 to FR-8.3, NFR-6.4 | Every material action is written to an append-only operation log, and every execution writes a hash-chained advice record. Database triggers block updates and deletions of both. |
| Human oversight | FR-8.4; Guiding Opinions Art. 23 | Two compliance switches are checked at the start of every chat turn, before every tool call and at every execution step, so the officer can stop the AI at once. |
| Data minimisation | NFR-3.6 | The model receives a masked context of tier, scores, amounts and product data. Names and e-mail addresses are never sent. |
| Contract-first integration | NFR-5.2 | The Pydantic schemas are the contract: FastAPI publishes them as OpenAPI, and the frontend's types are generated from that file, so a breaking change fails the frontend's type check. |
| Portability | NFR-7.1 | One `docker compose up` runs the system on any machine with Docker; a single-container image serves the hosted demo. |

## 2.2 System Block Diagram

{@fig:modules} shows the eleven functional modules of Aegis. An arrow means that a module uses the results of the module it comes from. Every user enters through Module 1. The client's risk tier (Module 2) and the eligible products (Module 3) feed the proposal (Module 4). The advisor agent (Module 6) can create and revise proposals, but it reaches Module 4 only through the permission broker. Every proposal version passes the compliance gate (Module 5), and only a passing or acknowledged proposal can reach confirmation and execution (Module 7). Each execution writes an advice record (Module 8), and the executed holdings are monitored as the simulated market moves (Module 10), which can lead to a rebalancing: a new proposal version that goes through the gate again. The AI Control Room (Module 11) reads the operation log. Two kinds of connection are not drawn, so that the diagram stays readable: every module writes to the operation log of Module 8, and the switches of Module 11 can stop Modules 6 and 7.

![Functional modules of Aegis Wealth AI {#fig:modules}](diagrams/fig-2-1-modules.png)

{@tbl:modules} maps each module to its screens, its endpoints and its functional requirements. Screens S01 to S12 are those of the project documentation; the AI Control Room and the Goal Planner were added.

Table: Functional modules, their screens, endpoints and requirements {#tbl:modules}
| Module | Main screens | Main endpoints (prefix `/api`) | Requirements |
|----------------|----------------|----------------------|--------|
| 1. Access, Roles & Sessions | S01 Login, application shell | `/auth/login`, `/auth/logout`, `/auth/me` | FR-1.1 to FR-1.4 |
| 2. Risk Profiling & Crisis Replay | S03 Risk Profile, S04 Historical Replay | `/profile/...`, `/replay/...` | FR-2.1 to FR-2.5 |
| 3. Product Shelf & Comparison | S05 Product Shelf, S06 Comparison | `/products`, `/products/compare` | FR-3.1 to FR-3.4 |
| 4. Proposal & Allocation | S07 Proposal Workspace, What-if lab | `/proposals`, `.../revise`, `.../preview`, `.../remedy` | FR-4.1 to FR-4.5 |
| 5. Compliance Gate | Gate panel on S07 and S09 | Inside `POST /proposals` and `.../revise` | FR-5.1 to FR-5.3 |
| 6. Advisor Agent | S08 Advisor Chat | `/chat`, `/chat/stream`, `/chat/history` | FR-5.4, FR-6.1 to FR-6.5 |
| 7. Confirmation & Sandbox Execution | S09 Confirm, S10 Sandbox Account | `.../quiz`, `.../confirm`, `.../execute`, `/sandbox/...` | FR-7.1 to FR-7.4 |
| 8. Advice Records & Operation Log | S11 Advice Records, S12 Compliance Console | `/records/...`, `/logs`, `/logs/export` | FR-8.1 to FR-8.6 |
| 9. Goal Planning & Briefing | S02 Dashboard, Goal Planner | `/projections`, `/goals/current`, `/insights`, `/sandbox/analytics` | Addition |
| 10. Market Monitoring & Rebalancing | S10 Risk and goal tab, Control Room Monitoring tab | `/monitoring`, `/proposals/rebalance`, `/compliance/market/...` | Addition |
| 11. AI Control Room | Control Room (Live, Review queue, Governance, Monitoring) | `/compliance/...`, `/controls` | FR-8.4; addition |

## 2.3 Architectural Style and Layers

Aegis is a layered, modular application with two separately deployable parts: a web application and an API. Inside the API, each concern is a separate Python package with a defined interface: the routers, the services, the engines and the agent. This approach is commonly described as a modular monolith. A microservice architecture would add network calls, distributed transactions and operational effort without a benefit at the scale of a prototype. The package boundaries are enforced in the code, so a part can still be moved into its own service later.

The components are organised into the six layers of {@tbl:layers}. Requests flow downwards. The browser talks only to the web server, which forwards `/api/\*` to the API on the same origin, so there is no cross-origin traffic and the session cookie stays httpOnly and same-site. Only the LLM Client, in the agent layer, communicates with the outside world.

Table: Layers of the Aegis architecture {#tbl:layers}
| Layer | Components | Main technologies | Responsibility |
|------------|----------------|----------------|------------------------|
| Presentation | Web Application | Next.js, React, TypeScript, Tailwind CSS, shadcn/ui | Interaction with clients and the officer; hides controls by role but never decides access |
| Edge | Next.js server | Node.js | Serves the pages and forwards `/api/\*` to the API on the same origin |
| Application | API Routers, Services | FastAPI, Pydantic, SQLAlchemy | Authentication, roles, ownership, validation, transactions and the operation log |
| Agent | Advisor Agent, Permission Broker, Grounding Check, LLM Client | Python, Anthropic SDK | The turn loop, tool authorisation, reply checks and model access |
| Domain | Engines | Plain Python | Every number and every rule, as pure functions |
| Data | Database, Data Files | SQLite, CSV, JSON | Persistent state and versioned configuration |

## 2.4 System Components

{@tbl:components} describes the main components, their location in the code, their responsibilities and the requirements each one implements. These names are used consistently in the diagrams of this document.

Table: Main components of Aegis {#tbl:components}
| Component | Code | Responsibility | Requirements |
|------------|----------------|----------------------------------|-----------|
| Web Application | `frontend/src` | Screens S01 to S12, the Control Room, the Goal Planner and the What-if lab; the chat drawer with cards; client-side validation; an in-browser mock API for offline work | FR-3.1, FR-7.4, NFR-4.1 to NFR-4.5 |
| API Routers | `backend/app/routers` (nine routers) | The 54 operations of the API; role and ownership dependencies; validation; one error envelope | NFR-2.3, NFR-3.3, NFR-3.4 |
| Services | `backend/app/services` | Transactions, ownership checks, the operation log and the orchestration of engines; `persist()` saves every proposal version and runs the gate | NFR-2.4, NFR-6.4 |
| Engines | `backend/app/engines` (fifteen engines) | Scoring, contradictions, replay, allocation, metrics, stress, fees, gate, quiz, record chain, projection, How to fix, market clock, drift and rebalancing | NFR-2.2, NFR-5.1 |
| Advisor Agent | `backend/app/agent/orchestrator.py` | The turn loop: masked context, model calls, tool rounds, regeneration, fallback, logging and tracing | FR-6.1, FR-6.4, NFR-3.6 |
| Permission Broker | `backend/app/agent/broker.py` | Validates every tool call, checks the switches, the ownership and the tier, runs the tool and logs the decision | FR-6.2 |
| Grounding Check | `backend/app/agent/grounding.py` | Accepts each number in a reply only if it matches a tool result or the client's message; blocks banned phrases; builds citations and number sources | FR-5.4, FR-6.3 |
| LLM Client | `backend/app/agent/llm.py` | The only component that calls the Claude API: timeout, retry, refusal fallback and prompt caching | NFR-1.2, NFR-2.1 |
| Database | `backend/app/models`, `backend/app/core/database.py` | Twenty tables in SQLite (WAL mode); append-only triggers on records and the log | NFR-2.4, FR-8.1 |
| Data Files | `backend/data` | Versioned configuration and sample data: products, monthly history, questionnaire, model portfolios, rules, regulations, episodes, scenarios, market | NFR-5.3, FR-3.4 |

{@fig:components} shows these components as a component diagram in the notation of UML 2.5.1 [@uml], drawn according to the style guidelines of Ambler [@ambler]. A component is a rectangle with the keyword «component» and the component icon. A provided interface is a ball on a stem. A dashed line with an open arrowhead to a ball is a usage dependency: the component at the tail uses that interface. Aegis is drawn as a subsystem whose ports carry the interface it provides to its users (Web UI) and the one it requires from an external system (the Claude API). The diagram makes three drivers of {@tbl:drivers} visible. The Advisor Agent reaches the Services only through the Tool Calls of the Permission Broker, never directly. Only the LLM Client reaches the Claude API. And the Engines read nothing by themselves: the Services pass them the configuration data.

![Component diagram of Aegis Wealth AI {#fig:components}](diagrams/fig-2-2-components.png)

## 2.5 Flow of an Advisory Run

{@fig:advisory-run} traces Scenario 1 of the project documentation, a first-time client receiving a compliant portfolio, as a UML sequence diagram. The API Server stands for the routers and services together, and the Engines are called with every input as an argument. A REJECT ends the run, shown as a "break" fragment: the client sees the failed rules and How to fix, and no quiz or Confirm is possible. {@tbl:run-steps} describes each step.

![One advisory run, from the risk profile to the advice record {#fig:advisory-run}](diagrams/fig-2-3-advisory-run.png)

Table: Flow of an advisory run through the components {#tbl:run-steps}
| Step | Component | Action |
|-----|------------|------------------------------------------------|
| 1 | Web Application | The client answers the ten-question questionnaire and reacts to the crisis replay; the page sends `POST /api/profile` with the session cookie. |
| 2 | API Server | Checks the session and the client role, validates the answers and calls the scoring and contradiction engines. |
| 3 | Engines | Score capacity and willingness, derive the risk tier and check the contradiction rules X1 to X3. |
| 4 | API Server | Saves the profile as a new version and logs it. A "sell everything" reaction in the replay lowers the tier by one, once. |
| 5 | Web Application | The client enters the amount, the horizon and any near-term need; the page sends `POST /api/proposals`. |
| 6 | API Server | Checks the tier-2 preconditions: a complete profile, no open contradiction, and a profile under 365 days old. |
| 7 | Engines | Allocate the amount with a reason for every item, compute the risk metrics and stress losses, and evaluate rules R-01 to R-09. |
| 8 | API Server | Saves the proposal, its items and the gate result in one transaction and logs them. |
| 9 | Web Application | Shows the verdict. REJECT offers How to fix and blocks the quiz; WARNING requires each warning to be acknowledged. |
| 10 | API Server | Grades the three-question quiz; Confirm issues a one-time token, stores only its SHA-256 hash with a 5-minute expiry and the hash of the items, and returns it once. |
| 11 | API Server | Execute checks the token, the items and the switches, claims the token with a compare-and-set update, places the orders, updates positions and cash, and writes the hash-chained advice record, all in one transaction. |

## 2.6 Deployment Architecture

Every part of Aegis is packaged as a Docker image, and the same images are used for development, testing and the demonstration. Aegis is deployed in two ways: locally with Docker Compose, which is how reviewers run it, and as a hosted demo on Render. Configuration comes only from environment variables; the only secret is the Anthropic API key, and without it the advisor answers in fallback mode.

### 2.6.1 Local Deployment

`docker compose up --build` starts the two containers of {@tbl:containers} on the reviewer's computer. The database is created and seeded on first start, and a database from an earlier version receives the newer columns and tables at start-up. {@fig:deploy-local} shows this deployment as a UML deployment diagram [@uml]. Nodes are 3D boxes with their keyword (a device, an execution environment or a container), the deployed artifacts are rectangles with the document icon, and communication paths are labelled with their protocol, the open arrowhead pointing to the side that accepts the connection.

Table: Containers of the local deployment {#tbl:containers}
| Container | Runs | Port | Instances | State |
|----------|------------------------------|------|------|--------------------|
| web | The Next.js standalone server, built with the real API and `API_BASE_URL=http://api:8000` | 3000 | 1 | None |
| api | Uvicorn with the FastAPI application; health-checked at `/api/health` | 8000 | 1 | SQLite database in the named volume `api-data` |

![Local deployment with Docker Compose {#fig:deploy-local}](diagrams/fig-2-4-deploy-local.png)

Port 8000 is also published, so that a reviewer can open the interactive API documentation at `http://localhost:8000/docs`. The Claude API is called only when `ANTHROPIC_API_KEY` is set.

### 2.6.2 Hosted Demonstration

The hosted demo at https://aegis-wealth-ai.onrender.com runs the same application in one container on Render's free plan, in the Singapore region, the closest to Shenzhen ({@fig:deploy-hosted}). The image is built from the root `Dockerfile`: a Python 3.12 base with the Node.js runtime, the API and the standalone web build. Render terminates HTTPS at its edge and forwards requests to the web server on `$PORT`. The start script, `deploy/start.sh`, starts Uvicorn on 127.0.0.1:8000, waits until it answers, then starts the web server, and stops both if either exits, so that Render sees the failure and restarts the service. Only the web server is reachable from outside: the API is not exposed. The script also adds the service's public address to the origins that the API accepts. Render clones and builds the image from GitHub on every push to the main branch, as defined in `render.yaml`. Because the database is created and seeded at start, the demo resets whenever the instance restarts.

![Hosted demonstration on Render {#fig:deploy-hosted}](diagrams/fig-2-5-deploy-hosted.png)

### 2.6.3 Configuration

{@tbl:config} lists the configuration. Every setting has a working default except the API key.

Table: Configuration settings {#tbl:config}
| Variable | Read by | Default | Purpose |
|----------------|--------|----------------|----------------------------------|
| `ANTHROPIC_API_KEY` | API | Empty | The only secret; empty means fallback mode |
| `AEGIS_MODEL` | API | claude‑opus‑5‑5 | The model the advisor uses |
| `DATABASE_URL` | API | SQLite file | The database location |
| `SESSION_TTL_HOURS` | API | 8 | Session lifetime |
| `ALLOWED_ORIGINS` | API | Local addresses | Origins accepted by the cross-site request check |
| `COOKIE_SECURE` | API | 0 | Set to 1 behind HTTPS (the hosted demo) |
| `TRUST_PROXY_HEADERS` | API | 0 | Take the client address from `X-Forwarded-For` behind the web server |
| `LOGIN_ATTEMPTS_PER_MINUTE` | API | 10 | Log-in attempts allowed a minute from one address |
| `LOCKOUT_THRESHOLD` | API | 5 | Consecutive failures that lock an account |
| `LOCKOUT_MINUTES` | API | 5 | Length of the lock-out |
| `CHAT_MESSAGES_PER_MINUTE` | API | 20 | Chat rate limit |
| `NEXT_PUBLIC_API_MOCK` | Web (build) | 1 | 0 uses the real API; 1 the in-browser mock API |
| `API_BASE_URL` | Web (build) | None | Where the web server forwards `/api/\*` |
| `PUBLIC_URL` | Start script | None | Public address added to the allowed origins on any host |
| `RENDER_EXTERNAL_URL` | Start script | Set by Render | The same, set automatically by Render |

## 2.7 Data Architecture

Aegis keeps its data in the three stores of {@tbl:stores}, each chosen for the kind of data it holds.

Table: Data stores of Aegis {#tbl:stores}
| Store | Technology | Data held | Protection |
|----------|----------------|------------------------------|------------------------------|
| Database | SQLite in WAL mode, through SQLAlchemy 2 | Twenty tables: users, sessions, profiles, proposals, the gate results, the sandbox, records, chat, the log, goals, the market clock, rebalancing plans and the compliance switches | One transaction for each proposal write, execution and record (NFR-2.4); append-only triggers on records and the log; session identifiers and tokens stored only as SHA-256 hashes |
| Data files | Versioned CSV and JSON files in `backend/data` | Products, monthly history, questionnaire, model portfolios, rules, regulations, crisis episodes, stress scenarios, assumptions, disclosures, market settings | Read at start-up and never written; their versions appear in data labels and in the configuration fingerprint |
| Browser | Cookie and local storage | The httpOnly session cookie, and interface preferences such as the theme and privacy mode | No personal data or figures are stored in the browser |

The twenty tables are organised into the groups of {@tbl:entities}. {@fig:er-proposals} and {@fig:er-execution} show them as entity-relationship diagrams in crow's foot notation: a bar means one, a circle means optional and a crow's foot means many. Each entity lists its primary key (PK), its foreign keys (FK), its unique columns and the attributes the text refers to. Entities drawn dashed in {@fig:er-execution} are detailed in {@fig:er-proposals}.

Table: Main data entities by group {#tbl:entities}
| Group | Tables | Modules |
|--------------------|----------------------------------------|-------|
| Identity and access | `users`, `sessions` | 1 |
| Profiling and goals | `profiles`, `replay_reactions`, `goals` | 2, 9 |
| Products | `products` | 3 |
| Proposals and the gate | `proposals`, `proposal_items`, `gate_results`, `quiz_attempts`, `confirm_tokens`, `rebalance_plans` | 4, 5, 7, 10 |
| Sandbox | `sandbox_accounts`, `orders`, `positions` | 7 |
| Records and conversation | `advice_records`, `chat_messages` | 6, 8 |
| Oversight | `operation_logs`, `controls`, `market_clock` | 8, 10, 11 |

![Entity-relationship diagram 1: clients, profiles and proposals {#fig:er-proposals}](diagrams/fig-2-6-er-proposals.png)

![Entity-relationship diagram 2: execution, records and oversight {#fig:er-execution}](diagrams/fig-2-7-er-execution.png)

The data model follows six design rules:

- **Versions, not overwrites:** a new risk profile is a new version, and a revised proposal is a new row whose `parent_id` points to the version it replaced. A superseded version is kept for the record and cannot be changed (FR-2.5, FR-4.5).
- **Ownership on every row:** every client table carries the user it belongs to, and every query filters by the session's user, so a client can never load another client's data (NFR-3.3, AT-02).
- **Append-only history:** database triggers block updates and deletions of advice records and of the operation log, so the application itself cannot rewrite history (FR-8.1, FR-8.3).
- **Secrets as hashes:** passwords are stored with bcrypt at cost 12, and session identifiers and confirmation tokens only as SHA-256 hashes (NFR-3.1, NFR-3.2).
- **Integrity by chaining:** each advice record stores the hash of the previous one, so any later change is detected (Section 3.6).
- **Prices bound to plans:** a rebalancing plan stores the market month and a hash of the holdings its trades were priced on, so that it cannot execute at other prices (Section 3.10).

## 2.8 API Design Overview

The API Server provides one REST API, used by the Web Application and by the evidence, red-team and performance scripts. The advisor agent does not call the REST API: its tools call the services directly, through the permission broker. Its design follows these principles:

- **Contract-first:** the Pydantic schemas are the contract. FastAPI publishes them as OpenAPI with 54 operations, and the frontend's types are generated from that file, never written by hand (NFR-5.2).
- **Resource-oriented:** resources are addressed by nouns under `/api`, requests and responses use JSON, and form-encoded or plain-text bodies are refused, so an HTML form on another site cannot drive the API.
- **Authentication:** the browser holds an httpOnly, SameSite=Lax session cookie. Unsafe requests from an unknown origin are refused with 403 (defence in depth against cross-site request forgery).
- **Authorisation on every request:** each endpoint declares the role it requires, and each record is loaded through an ownership check. The frontend hides controls but never decides access.
- **One error format:** every error, including validation errors and unexpected exceptions, uses one envelope with a stable code and a message, and no stack trace reaches the browser (NFR-2.3). State conflicts are explicit 409 responses, such as `CONTRADICTIONS_OPEN`, `WARNINGS_NOT_ACKNOWLEDGED`, `QUIZ_REQUIRED`, `TOKEN_USED` and `STATE_CONFLICT`.
- **Labelled data:** every response that carries figures carries the date of its data and labels such as "Sample data", "Hypothetical", "Illustrative" or "Simulated" (FR-3.4, NFR-6.2).
- **Streaming:** the chat is also available as server-sent events, so that progress and tool cards appear while the agent works. Reply text is never streamed before it passes the grounding check.

The operations are grouped by resource as shown in {@tbl:api}. The complete list, with methods, schemas and error codes, is in the OpenAPI documentation that FastAPI generates from the code.

Table: Resource groups of the REST API {#tbl:api}
| Base path | Operations | Main resources | Module |
|----------------|:----:|------------------------------------------|--------|
| `/api/auth` | 3 | Log-in, log-out, the current user | 1 |
| `/api/profile`, `/api/replay` | 6 | Questionnaire, profile versions, replay episodes and reaction | 2 |
| `/api/products` | 3 | Shelf, product detail, comparison | 3 |
| `/api/proposals` | 12 | Proposals, revisions, What-if preview, How to fix, acknowledgement, quiz, confirmation, execution, rebalancing | 4, 5, 7, 10 |
| `/api/projections`, `/api/goals`, `/api/insights` | 4 | Goal projections, the saved goal, the daily briefing | 9 |
| `/api/sandbox` | 3 | Account, orders, live analytics | 7, 9 |
| `/api/chat` | 4 | Chat turn, streamed turn, history, feedback | 6 |
| `/api/records`, `/api/logs` | 5 | Advice records, chain verification, operation log and its export | 8 |
| `/api/monitoring` | 1 | The client's drift and rebalancing | 10 |
| `/api/compliance` | 11 | Rules, regulations, model disclosure, overview, review queue, turn inspector, switches, market clock, monitoring overview | 5, 10, 11 |
| `/api/controls`, `/api/health` | 2 | State of the switches, service health | 1, 11 |
