# CHAPTER 5: AI SUPERVISION AND SECURITY DESIGN

An AI that takes part in advice must stay supervised. This chapter describes how a compliance officer watches and stops the advisor, how every AI output is labelled and traced, and how the system is secured at each of its trust boundaries. The permission tiers, the full list of controls with their code locations and tests, and the 25-item known-risk list are in the security self-assessment (deliverable 05).

## 5.1 The AI Control Room

Article 23 of China's 2018 Guiding Opinions on asset management sets out what firms that use AI in asset management must do [@cn-amgo]. The compliance officer's AI Control Room implements these requirements, together with comparable ones from other regulators ({@tbl:art23}).

Table: Regulatory requirements and the Aegis controls that meet them {#tbl:art23}
| Requirement (source) | Aegis control |
|------------------------------------|------------------------------------------------|
| Report the AI model's main parameters and allocation logic (Art. 23) | The model disclosure: provider, model and settings, SHA-256 fingerprints of the system prompt and tool list, the tools and tiers, the grounding policy, the model portfolios, the allocation steps, the stress scenarios and the nine rules with their basis; the report carries its own fingerprint and every export is logged |
| Open a separate account for each investor's AI-assisted investing (Art. 23) | Each client has their own sandbox account |
| Make investors aware of the algorithm's defects and risks (Art. 23) | Disclosure DISC-04, "How the AI advisor works, and its limits", on the Confirm screen and in every advice record |
| Follow the suitability and disclosure rules (Art. 23) | The gate checks the AI's proposals exactly as it checks the client's |
| No exaggeration and no promised returns (Art. 19) | The grounding check and banned phrases on every reply |
| Intervene by hand when the model fails (Art. 23) | Two switches: Suspend AI advisor and Halt execution, each with a logged reason |
| Label AI-generated content (CN labelling measures; EU AI Act Art. 50) | A visible label and machine-readable provenance on every reply [@cn-aigc-label; @eu-ai-act] |
| Supervise AI output and keep a person accountable (HK SFC, 2024; FINRA, 2026) | The review queue of flagged turns, cleared or escalated by the officer with a note [@hk-sfc-genai; @finra-2026] |
| Track model versions and agent actions (FINRA, 2026; CSRC FinTech plan) | The configuration fingerprint on every turn, the trace and the model disclosure [@csrc-fintech] |
| Defend against goal hijack, tool misuse and privilege abuse (OWASP) | The broker, the gate and the threat signals, mapped item by item (Section 5.6) [@owasp-asi] |
| Treat rebalancing as a recommendation under suitability (HK SFC, 2019) | A rebalancing is a proposal version that the gate checks against the current tier [@hk-sfc-odap] |
| Disclose drift thresholds and act predictably in a major market move (FINRA, 2016) | The 5-point band shown beside every drift figure; a rebalancing priced before the market moved cannot execute [@finra-dia] |

The Control Room is the officer's landing page and is organised in four tabs:

- **Live**, refreshed every three seconds, shows eight counts. They are AI turns by mode, tool calls allowed per tier, calls the broker blocked, AI proposals the gate rejected, figures traced, messages with threat signals, turns awaiting review, and orders placed by the AI, which is always 0 because no tool can place one. The tab also shows the two switches, the alerts and a live feed of every turn. Each row opens a turn inspector with the client's message and the reply, the AI label and provenance, the threat signals, every tool call, the trace, the token use and latency, the client's feedback and the review decision.
- **Review queue** lists the turns a person should look at, with a severity and the reasons.
- **Governance** holds the model disclosure, how the AI's output is governed, and a regulatory checklist of 22 controls across 10 frameworks, each with its live status.
- **Monitoring** holds the simulated market clock and every client's drift status (Section 3.10).

**The switches.** *Suspend AI advisor* stops every chat turn, and the broker refuses any tool call still under way, so a suspension also stops a turn in progress. *Halt execution* stops token issuing and order filling, even for a token issued before the halt. Each change needs the compliance role and a reason of 5 to 300 characters, and is logged with it. Clients see the state of the switches, never the reason. The officer cannot change any client's data: beyond reading and exporting, the officer's powers are the switches, the disclosure export, review decisions and the market clock.

## 5.2 Labels, Provenance and the Configuration Fingerprint

China's measures for labelling AI-generated content, in force since 1 September 2025, ask for an explicit label that people can see and an implicit one that machines can read [@cn-aigc-label]. Article 50 of the EU AI Act asks that people know they are talking to an AI system [@eu-ai-act]. Every reply in Aegis therefore carries:

- **A visible label:** "AI-generated" when the model answered, "Automated template (checked)" for a fallback answer, or "System notice" while the advisor is paused. The chat opens with a notice that the client is talking to an AI system.
- **Machine-readable provenance:** the generator, the provider, the model that served the reply, the mode, the configuration fingerprint and the SHA-256 hash of the reply text exactly as shown. `POST /api/chat` sends the same facts as the `X-AI-Generated`, `X-AI-Label`, `X-AI-Content-SHA256` and `X-AI-Config-Fingerprint` headers.

The **configuration fingerprint** is one SHA-256 hash over everything that shapes an answer: the model and its settings, the system prompt, the tool list and tiers, the grounding policy and the versions of the data files the engines read. Every turn records it, every reply carries it and the model disclosure states it, so a filed disclosure can be matched to the replies that configuration produced, and any change of configuration is visible in the log.

## 5.3 Threat Signals, Review Queue, Alerts and Traces

**Threat signals.** Twelve pattern rules tag each client message with the attack it resembles, mapped to the OWASP Top 10 for Agentic Applications [@owasp-asi]. Instruction overrides and requests for another client's data are high-severity signals. Prompt extraction, execution requests, unverified tier claims, role-play, claimed authority, dictated replies and waivers of suitability are medium. Large single weights, pressure and promised returns are low. Hidden characters or encoded text add an obfuscation signal. The signals block nothing, since the broker and the gate already stop the attack, and blocking on patterns would refuse legitimate questions. Their purpose is to make the attempt visible. On the red-team set they flag 27 of the 30 prompts at medium or high severity; on 30 ordinary questions they flag none.

**Review queue.** A turn enters the queue when it has a medium or high signal, a blocked call, an AI proposal the gate rejected, a reply rewritten or replaced after the number check, or a client's thumbs-down. The officer clears or escalates it with a note of 5 to 300 characters. Decisions are append-only log entries, so the state of the queue is rebuilt from the log and no decision can be edited away.

**Alerts** are derived from the log. They fire on three or more blocked calls by one client in 15 minutes, on two or more AI proposals rejected in an hour, and on high threat signals in the last hour. They also fire when more than 20% of replies fail the number check, when turns await review, when a switch is stopped, and on drift or a rule breach in a client's portfolio.

**Traces.** Each turn is recorded as spans named after the OpenTelemetry semantic conventions for generative AI [@otel-genai]. They are `invoke_agent` for the turn, `chat` for each model call with its token counts and served model, and `execute_tool` for each tool call with its tier, the broker's decision and the gate's verdict. Prompts, replies and tool arguments are not captured, so the trace adds no personal data. The spans are stored with the turn and drawn as a waterfall in the turn inspector.

## 5.4 Security Architecture

Because Aegis gives an AI a role in financial advice, its architecture is organised around trust boundaries: the points at which requests or data pass between parties with different levels of trust. Controls are applied at every boundary, so that the failure of a single control does not expose the system, a principle known as defence in depth. {@tbl:trust} summarises the boundaries, the main threats at each and the controls that address them.

Table: Trust boundaries and security controls {#tbl:trust}
| Trust boundary | Main threats | Controls | Requirements |
|--------------|----------------|--------------------------------------|----------|
| Internet and Aegis | Stolen credentials, session theft, cross-site requests | bcrypt passwords at cost 12; random 256-bit server-side sessions in an httpOnly, SameSite=Lax cookie; 10 log-in attempts a minute per address and a 5-minute lock-out after 5 failures; Origin check and JSON-only bodies; security headers; HTTPS on the hosted demo | NFR-3.1, NFR-3.2 |
| Between clients | Reading or changing another client's data | Role dependency on every route; ownership check on every query; 403 for another client's records | FR-1.3, NFR-3.3 |
| Client and the model | Prompt injection, personal data sent to the provider, invented figures | Masked context without names or e-mails; tool results passed as data; grounding check and banned phrases; labels on every reply | NFR-3.6, FR-6.3 |
| Model and the services | Tool misuse, privilege abuse, execution by the AI | Strict schemas validated twice; permission broker checking switches, ownership and tier; no execution tool; at most 4 tool rounds and 20 seconds a turn | FR-6.2 |
| Proposal and execution | Unsuitable advice, forged or replayed execution | The gate inside the only save path; quiz and Confirm; single-use, hashed, item-bound, 5-minute token claimed atomically; stale rebalancings refused | FR-5.1, FR-7.2, FR-7.3 |
| Application and stored history | Tampering with records or the log | Append-only triggers; hash-chained records with verification naming the first changed record | FR-8.1, FR-8.2, NFR-6.4 |
| Officer and clients | Misuse of oversight powers | The officer cannot change client data; every switch change and market move needs a reason and is logged | FR-8.4 |

Input validation applies at every boundary. Pydantic models bound every field and reject unknown fields, product codes are checked against the shelf, weights must lie between 0 and 100, and all database access goes through the ORM (NFR-3.4). Every error uses the one error envelope without stack traces (NFR-2.3). The API key exists only in the backend environment, is never logged and is never sent to the browser (NFR-3.5).

## 5.5 Permission Enforcement in Code

The tiers of {@tbl:tiers} are enforced in code, not by the model's instructions:

- **T0 and T1:** the broker passes the session's user into every tool. A request for another client's proposal returns 403 from the ownership check, which the broker turns into a logged `permission_denied`.
- **T2:** the broker and the proposal routes check the same preconditions (a complete profile, no open contradiction, a profile under 365 days old), and the gate runs inside `persist()`, which every proposal version, including a rebalancing, goes through.
- **T3:** no agent tool exists. Confirmation issues a token only for a passing or acknowledged proposal with a passed quiz, and execution accepts the token once, within five minutes, for the same items, while execution is not halted.
- **C:** the oversight endpoints require the compliance role, and each change is logged with its reason.

## 5.6 Coverage of the OWASP Top 10 for Agentic Applications

{@tbl:owasp} maps the OWASP list of agent-specific risks to the controls of Aegis [@owasp-asi].

Table: OWASP Top 10 for Agentic Applications and the Aegis controls {#tbl:owasp}
| Item | Aegis control | Status |
|------------------------|----------------------------------------------|------------|
| ASI01 Agent goal hijack | Rules live in code; an injection can at most attempt a revision, which the gate rejects; tool results are data; threat signals flag overrides and extraction | Mitigated |
| ASI02 Tool misuse | Eleven strict tools in tiers T0 to T2, validated again by the broker; no execution tool; at most 4 rounds and 20 seconds a turn | Mitigated |
| ASI03 Identity and privilege abuse | The session's user scopes every tool call; another client's data is denied at T1 and logged | Mitigated |
| ASI04 Supply chain | No plugins or remote tools loaded at run time; the tool list is fixed in code and fingerprinted; dependencies pinned | Partly mitigated |
| ASI05 Unexpected code execution | No shell, code or file tool exists; tool arguments are validated JSON, never evaluated | Not applicable by design |
| ASI06 Memory and context poisoning | No long-term memory; each turn sends the client's own last ten messages and a system-written context | Mitigated |
| ASI07 Inter-agent communication | One agent; no agent-to-agent messages | Not applicable |
| ASI08 Cascading failures | Every failure falls back to a checked template; orders need a separate client action; the switches stop the advisor or execution | Mitigated |
| ASI09 Human-agent trust exploitation | Confirm click and one-time token; grounding and banned phrases; AI labels; signals for waivers, authority claims and pressure | Mitigated |
| ASI10 Rogue agents | No autonomy beyond one turn and no scheduled or conditional actions; every action logged and traced; the fingerprint shows any change | Mitigated; relies on review |

## 5.7 Main Known Risks

The security self-assessment lists 25 known risks with their controls and what remains. {@tbl:risks} summarises the residual risks that matter most for the reviewers' assessment.

Table: Main residual risks {#tbl:risks}
| Risk | Control | What remains |
|----------------------|------------------------------|------------------------------|
| A new prompt-injection wording | Broker, gate and grounding are code, so an injection cannot pass them; threat signals flag known patterns | 3 of the 30 red-team prompts raise no medium signal (two still reach review through a block or a rejection) |
| Lock-out used against a demo account | Lock-out after 5 failures, for 5 minutes only | Anyone with the public demo link can lock a demo account for 5 minutes |
| Whole-database replacement | Append-only triggers and the record chain | Replacing the entire database goes undetected without an external anchor for the latest hash |
| Rate limits across instances | Limits and lock-out held in one process's memory | Several instances would need a shared store |
| Over-reliance on a projection | Every projection is labelled illustrative and shows the bad case and the chance of a loss | Resampled synthetic history; the past does not predict the future |
| No penetration test | Automated tests for every control, the red-team run, browser checks | An external penetration test has not been done |
