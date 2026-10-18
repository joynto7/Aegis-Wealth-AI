# CHAPTER 3: SECURITY CONTROLS

Aegis applies controls at every trust boundary, the points at which requests or data pass between parties with different levels of trust, so that the failure of one control does not expose the system. {@tbl:boundaries} gives the overview, with the requirements of the project documentation that each group of controls meets. The sections that follow describe the controls with the code that enforces them.

Table: Trust boundaries and their controls {#tbl:boundaries}
| Trust boundary | Main threats | Controls | Requirements |
|--------------|----------------|--------------------------------------|----------|
| Internet and Aegis | Stolen credentials, session theft, cross-site requests | bcrypt passwords at cost 12; random 256-bit server-side sessions in an httpOnly, SameSite=Lax cookie; 10 log-in attempts a minute per address and a 5-minute lock-out after 5 failures; Origin check and JSON-only bodies; security headers; HTTPS on the hosted demo | NFR-3.1, NFR-3.2 |
| Between clients | Reading or changing another client's data | Role dependency on every route; ownership check on every query; 403 for another client's records | FR-1.3, NFR-3.3 |
| Client and the model | Prompt injection, personal data sent to the provider, invented figures | Masked context without names or e-mail addresses; tool results passed as data; grounding check and banned phrases; labels on every reply | NFR-3.6, FR-6.3 |
| Model and the services | Tool misuse, privilege abuse, execution by the AI | Strict schemas validated twice; the permission broker checking switches, ownership and tier; no execution tool; at most 4 tool rounds and 20 seconds a turn | FR-6.2 |
| Proposal and execution | Unsuitable advice, forged or replayed execution | The gate inside the only save path; quiz and Confirm; a single-use, hashed, item-bound, 5-minute token claimed atomically; stale rebalancings refused | FR-5.1, FR-7.2, FR-7.3 |
| Application and stored history | Tampering with records or the log | Append-only triggers; hash-chained records with verification naming the first changed record | FR-8.1, FR-8.2, NFR-6.4 |
| Officer and clients | Misuse of oversight powers | The officer cannot change client data; every switch change and market move needs a reason and is logged | FR-8.4 |

## 3.1 Authentication and Sessions

- **Passwords** are hashed with bcrypt at cost 12 (`app/core/security.py:12`). An unknown e-mail address costs the same bcrypt time as a known one, so the response time does not reveal which addresses exist (`security.py:28`).
- **Sessions** are held on the server, with random 256-bit identifiers (`security.py:37`). Only the SHA-256 hash of the cookie value is stored.
- **The session cookie** `aegis_session` is httpOnly and SameSite=Lax, and expires after 8 hours (`app/routers/auth.py:65`). Logging out deletes the session.
- **Log-in limits:** 10 attempts a minute per address (`auth.py:34`), and an account locks for 5 minutes after 5 consecutive failures (`auth.py:37` to `59`).

## 3.2 Authorisation

- Every route declares its role through a dependency, and every record is loaded through an ownership check.
- Another client's proposal or record returns 403 (AT-02).
- The web application only hides controls; it never decides access.

## 3.3 Input Validation

- Pydantic models bound every field, reject unknown fields and cap the length of strings.
- Product codes are checked against the shelf, and weights must lie between 0 and 100.
- All database access goes through the ORM.
- The agent's tool inputs are validated twice: by strict JSON schemas at the model, then on the server by the broker.
- Goal projections bound the horizon (1 to 30 years), the amount (up to CNY 10,000,000), the contribution and the target. Review notes and feedback reasons are capped at 300 characters.

## 3.4 Request Hardening, Errors and Secrets

- **Cross-site requests:** POST requests from other sites are refused by an Origin check, on top of the SameSite cookie (`app/main.py:60`). Form-encoded and text bodies are refused, so an HTML form cannot drive the API.
- **Security headers** on every response: `X-Content-Type-Options`, `X-Frame-Options: DENY` and `Referrer-Policy`, with `Cache-Control: no-store` on the API.
- **Errors:** every error, including validation errors and unexpected exceptions, uses the one error envelope, and no stack trace reaches the browser (`app/core/errors.py`).
- **Secrets:** `.env` is ignored by Git, and `.env.example` lists the names of the settings only. The API key exists only in the backend environment and is never logged, and the browser never calls the model.

## 3.5 Transport and Hosting

The local deployment serves the application over HTTP on localhost. The hosted demonstration runs the same application in one container on Render ({@fig:deploy-hosted}). Render terminates HTTPS at its edge, and the session cookie is marked Secure (`COOKIE_SECURE=1`). Only the web server is reachable from outside: it forwards `/api/*` to the API inside the container, so the API port is not exposed. The API accepts state-changing requests only from the origins it knows, and on Render the start script adds the service's own address to them.

![Hosted demonstration on Render {#fig:deploy-hosted}](diagrams/fig-2-5-deploy-hosted.png)

## 3.6 AI Safety

- Strict tool schemas, the permission broker on every call, and no execution tool (Chapter 2).
- Tool results and product descriptions are passed to the model as data, never as instructions (rule 6 of the system prompt).
- At most 4 tool rounds and 20 seconds per turn (`app/agent/orchestrator.py:52` and `53`).
- The model receives the tier, scores, amounts and product data only, never names or e-mail addresses (`orchestrator.py:140`).
- Server-side refusal fallback is enabled.

## 3.7 Grounding and Wording

- Every number in a reply must match a value from that turn's tool results or from the client's message, and banned phrases such as "guaranteed" or "risk-free" are blocked (`app/agent/grounding.py:157`).
- A failing reply is regenerated once with an operator note, then replaced by a checked template (AT-09).
- The client can see the source of every figure: it is underlined in the reply, and hovering over or focusing it names the tool field, the client's own message or the profile.
- The cards beside a reply are built from the tool results themselves, never from the model's text.

## 3.8 Compliance Controls

- The suitability rule R-02 and five more hard rules run inside the proposal service. Each of the nine rules names the regulatory requirement it is designed to meet (`backend/data/regulations.json`), such as the suitability requirements of the CSRC and of Article 25(2) of MiFID II [@cn-suit; @mifid2].
- Warnings must be acknowledged before Confirm.
- Disclosures are stored with their version, including DISC-04 on the AI's limits, and a three-question comprehension quiz is required.
- Data labels ("Sample data", "Hypothetical", "Illustrative", "Simulated") appear wherever they apply.

## 3.9 Manual Intervention and Disclosure

- **The switches:** *Suspend AI advisor* and *Halt execution* (Section 2.5) both need the compliance role and a logged reason. Clients see the state, never the reason.
- **The model disclosure** lists the model's parameters and the allocation logic, with SHA-256 fingerprints of the system prompt and the tool list, so that a filed report can be matched to the code that ran. The report carries its own fingerprint, and each export is logged.
- **The live feed** of the AI Control Room shows every agent turn with its tools, tiers, broker decisions and gate results.

## 3.10 AI Governance

- **Labels.** Every reply carries a visible label (AI-generated, Automated template (checked) or System notice) and machine-readable provenance: the serving model, the configuration fingerprint and the SHA-256 hash of the text. The provenance is stored with the message and sent as `X-AI-*` headers on `POST /api/chat`, as China's measures for labelling AI-generated content and Article 50 of the EU AI Act ask [@cn-aigc-label; @eu-ai-act]. The chat opens with a notice that the client is talking to an AI system.
- **Configuration fingerprint.** One SHA-256 hash over the model and its settings, the system prompt, the tool list and tiers, the grounding policy and the data versions (`app/agent/fingerprint.py`). Every turn and every reply records it, so any change of configuration is visible in the log.
- **Threat signals.** Twelve pattern rules and an obfuscation check tag each client message, mapped to the OWASP Top 10 for Agentic Applications (`app/agent/threats.py`) [@owasp-asi]. They are advisory: they never block a message, so they cannot be used to refuse service, and the broker and the gate remain the controls. On the red-team set they flag 27 of the 30 prompts at medium or high severity; on 30 ordinary questions they flag none.
- **Review queue.** A turn with a medium or high signal, a blocked call, a rejected AI proposal, a reply rewritten or replaced after the number check, or a client's thumbs-down waits for the officer, who clears or escalates it with a note [@hk-sfc-genai]. Decisions are `review_decided` entries under the same append-only trigger as the rest of the log.
- **Alerts** derived from the log: repeated blocked calls by one client, repeated gate rejections of AI proposals, high threat signals, a high rate of failed number checks, open reviews and a stopped switch.
- **Traces.** Each turn records its spans (model calls, tool calls, the number check and templates) with their durations, tiers, decisions and token counts, named after the OpenTelemetry conventions for generative AI [@otel-genai]. Prompts, replies and tool arguments are not captured, so the trace adds no personal data.
- **Feedback.** A client can rate only their own replies; any other returns 403.
- **What-if and How to fix.** The What-if preview saves and logs nothing, and needs the same T2 preconditions as a revision. How to fix only suggests: applying it is a revision by the client, so the gate runs again and the version history keeps it.

## 3.11 The Monitoring Loop

- **The clock.** Only the compliance role reads or moves the simulated market (`app/routers/monitoring.py`), 1 to 12 months at a time, with a reason of 5 to 300 characters logged as `market_advanced`. A client gets 403, and sees the clock's date and moves but never who moved it or why. Moving it reprices holdings and trades nothing.
- **No autonomous action.** Drift, the live gate and the alerts are computed when a screen or the officer asks: there is no background job, no schedule and no condition that acts. The agent has the read-only `check_drift` (T1) and `propose_rebalance` (T2), and still no execution tool, so a rebalancing it proposes waits for the client's quiz, Confirm click and one-time token, like any proposal.
- **Suitability on every rebalancing.** A rebalancing is a new proposal version saved through `persist()`, so the gate checks it against the client's current tier, as the Hong Kong SFC expects for rebalancing, which it treats as a recommendation [@hk-sfc-odap]. How to fix applies when it fails.
- **Priced once.** A rebalancing stores its trades with the market month and a hash of the holdings they were priced on, and `app/services/monitoring.py:177` (`is_stale`) detects any change. Once either changes, Confirm and Execute refuse it and log the denial, and revisions and How to fix refuse it too, so the client never executes trades other than those shown. A rebalancing already priced at today's prices is returned again rather than duplicated, and one with nothing to trade is refused.
- **Ownership.** The client routes use the session's user only, so another client's rebalancing returns 403 at every step, as for any proposal.

## 3.12 Tamper Evidence

- Advice records are chained by SHA-256, each to the client's previous record (`app/engines/chain.py`), following the linked-hash principle of digital time-stamping [@haber]. Verification names the first changed record (`app/services/records.py:56`).
- A database trigger blocks UPDATE and DELETE on the advice records and on the operation log (`app/models/__init__.py:345`), so the application cannot rewrite history.
- If someone with access to the database file edits a record anyway, the chain detects it: acceptance test AT-11 drops the trigger, edits a record and proves that verification fails at that record.
