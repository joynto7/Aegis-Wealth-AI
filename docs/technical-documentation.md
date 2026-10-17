# Aegis Wealth AI — Technical Documentation

Deliverable 01: system architecture, core algorithms and security design, as built. The requirements,
API contract and screen specifications are in the project documentation (Chapters 1 to 3); this
document describes the implementation and the decisions taken while building it.

## 1. System architecture

Aegis is a web application with two services and one database.

```mermaid
flowchart TB
  subgraph Browser
    UI["Next.js web app<br/>12 screens + Control Room<br/>+ Goal Planner, shadcn/ui, Recharts"]
  end
  subgraph Web container
    Next["Next.js server<br/>/api/* rewrite"]
  end
  subgraph API container
    Routers["FastAPI routers<br/>32 endpoints + 17 additions<br/>(streaming chat, oversight, planning)"]
    Services["Services<br/>profiles, proposals, execution,<br/>records, logs, chat, sandbox,<br/>controls, oversight, planning, reviews"]
    Engines["Pure engines<br/>scoring, contradictions, replay, allocation,<br/>metrics, stress, fees, gate, quiz, chain,<br/>projection, remedy"]
    Agent["Agent<br/>turn loop, permission broker,<br/>grounding check, fallback, prompts,<br/>threat scan, trace, fingerprint"]
    Data[("backend/data<br/>CSV + versioned JSON")]
    DB[("SQLite<br/>18 tables")]
  end
  Claude[("Claude API<br/>claude-opus-5-5")]

  UI -- "same-origin /api, httpOnly cookie" --> Next --> Routers
  Routers --> Services --> Engines
  Engines --> Data
  Routers --> Agent -- "tool calls" --> Services
  Agent -. "masked context" .-> Claude
  Services --> DB
```

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Web app | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui, TanStack Query, Recharts, Motion, NumberFlow | Screens S01 to S12 plus the AI Control Room and the Goal Planner, the shared design system, the chat drawer with cards, the What-if lab, client-side validation |
| API | Python 3.12, FastAPI, Pydantic 2 | The contract (Section 2.6): validation, roles, error envelope, OpenAPI |
| Services | SQLAlchemy 2 | Transactions, ownership, the operation log, orchestration of engines |
| Engines | Plain Python | Every number and every rule, as pure functions of versioned data files |
| Agent | Anthropic Python SDK | A manual tool-use loop behind a permission broker |
| Database | SQLite (WAL) | The 16 tables of Section 3.5, plus `controls` for the compliance switches and `goals` for saved goals; append-only triggers on records and the log |

**One origin.** The browser only talks to the web server; Next.js forwards `/api/*` to FastAPI
(`API_BASE_URL`), so there is no CORS, and the session cookie stays httpOnly and same-site.

**Contract-first.** The Pydantic schemas are the contract. FastAPI publishes them as OpenAPI
(`backend/openapi.json`), and the frontend's types are generated from that file
(`frontend/src/lib/api-types.ts`, NFR-5.2), so a backend change that breaks a screen fails the
frontend type check.

**Design system.** The interface follows a researched design language (docs/ui-redesign.md): an
ink-navy shell, an indigo action colour, a violet gradient reserved for the AI, colour-blind-safe
chart colours, and status colours kept for PASS, WARNING and REJECT. Version 2 adds motion tokens
(honouring reduced motion), figures that roll to their new value, one-hue probability bands for
projections and a table twin for every chart.

**Mock-first frontend.** With `NEXT_PUBLIC_API_MOCK=1`, the same screens run on an in-browser mock API
(MSW) whose engines are ports of the backend's. `scripts/verify.ts` checks the ports against the same
worked examples; the projection, How to fix and threat-signal ports give the backend's exact results
(a shared random generator and the same half-away-from-zero rounding).

## 2. Request flow: one advisory run

```mermaid
sequenceDiagram
  actor C as Client
  participant W as Web app
  participant A as API
  participant E as Engines
  participant D as Database
  C->>W: Answers, replay reaction
  W->>A: POST /profile, POST /profile/current/replay-reaction
  A->>E: score, contradictions, tier
  A->>D: profile version, log
  C->>W: Amount, horizon, near-term need
  W->>A: POST /proposals
  A->>E: allocation -> metrics -> stress -> gate
  A->>D: proposal, items, gate result, logs
  A-->>W: 201 proposal with every rule's result
  C->>W: Quiz answers, Confirm
  W->>A: POST /quiz, POST /confirm
  A->>D: token hash, expiry, items hash
  A-->>W: confirm_token (once)
  W->>A: POST /execute + X-Confirm-Token
  A->>D: claim token, orders, positions, cash, advice record (one transaction)
  A-->>W: orders, cash_after, record_id
```

## 3. Core algorithms

All engines live in `backend/app/engines/` and take every input as an argument: no file, database or
network access (NFR-5.1). Money and percentages round **half away from zero** (`numbers.py`), which the
worked examples in Section 2.6.5 require (Python's `round()` would give S2 as −6.72% instead of
−6.73%).

### 3.1 Risk profiling (`scoring.py`, `contradictions.py`, `replay.py`)

- Capacity (C1 to C5) and willingness (W1 to W5) each score points ÷ 20 × 100, a multiple of 5. Bands:
  0–20 → 1, 25–40 → 2, 45–60 → 3, 65–80 → 4, 85–100 → 5.
- Tier T = min(T_cap, max(1, T_will − a_replay)). Only a "sell everything" reaction in the historical
  replay sets a_replay = 1, and only once.
- Contradictions X1 to X3 save the profile as `needs_review`. Proposals then return
  409 CONTRADICTIONS_OPEN until an answer changes.
- Replay: V_t = V_{t−1}(1 + Σ_c w_c r_{c,t}) from CNY 100,000, using the tier's model portfolio over
  episode E1 (2007-11 to 2009-10), E2 (2020) or E3 (2022). It reports the series, maximum drawdown,
  lowest month and end value.
- **Replay as a time machine** (addition). The client may start from their own amount
  (`GET /api/replay/{id}?amount=`, CNY 10,000 to 10,000,000); the path scales with it, so the
  drawdown is the same. The screen plays the episode month by month next to the real events of those
  months (Lehman Brothers, the WHO pandemic declaration, the first Fed rate rise, ...; the events are
  real, the portfolio path is illustrative). It stops by itself at the lowest month and asks *"Your
  CNY 200,000 is now CNY 138,722. What do you do?"*, so the reaction is recorded at the worst moment,
  not after the recovery. After the answer it plays on and shows what selling at the bottom would
  have kept against holding to the end. With reduced motion, Play jumps to the end.

Worked example (AT-03): answers C1 b, C2 d, C3 c, C4 b, C5 d, W1 c, W2 c, W3 d, W4 c, W5 b give capacity
70, willingness 70, tier 4. "Sell everything" lowers it to 3.

### 3.2 Allocation (`allocation.py`)

The seven steps of Section 2.5.3, in order:

1. **Base weights** from the tier's model portfolio.
2. **Horizon cap.** Under 3 years, equity + gold ≤ 20%. The excess comes from equity first, then gold,
   and goes to bond (tier 1: cash).
3. **Liquidity floor.** Cash ≥ ⌈N / A × 100⌉%, with the shortfall taken pro rata. Computed with exact
   fractions: in floating point, 7,000 / 100,000 × 100 is 7.000000000000001, which a plain ceiling
   turns into 8.
4. **Rounding** to whole percents, half up. A positive remainder goes to cash. A negative remainder
   comes out of the largest non-cash class, so rounding can never break the floor or the cap; the
   horizon cap is re-checked after rounding. (Putting a negative remainder into cash, as the
   documentation literally says, gave 6% cash against a 7% floor for tier 5.)
5. **Product choice.** Keep products with risk ≤ T, lock-up ≤ H × 12 and minimum investment ≤ the
   slot; sort by fee, then liquidity days, then code. Cash with N > 0 is liquid products only.
6. **Split.** A non-cash class above 40% is split between its two cheapest products; the first takes
   the odd 1%.
7. **Empty class.** If no product qualifies, the class's weight moves into the cash item, and a note
   explains why.

Every item carries a **reason**, e.g. *"Bond is 50% of this mix, above the 40% limit for one product,
so it is split between the two lowest-fee bond products that suit tier 3. This one charges 0.30% a
year."* After a revision, the reason records the change.

Worked example (AT-06, Section 2.6.5): tier 3, CNY 200,000, 8 years, CNY 30,000 near-term need gives:

| Product | Weight | Amount (CNY) |
| --- | --- | --- |
| DEP-01 | 15% | 30,000 |
| SBF-01 | 25% | 50,000 |
| SBF-02 | 25% | 50,000 |
| GLD-01 | 10% | 20,000 |
| IDX-01 | 25% | 50,000 |

An exhaustive sweep (every tier, horizons 1–30, five amounts, needs 0–100%: 75,750 allocations)
found no case that breaks a total of 100%, the floor, the cap, suitability or the 40% limit.

### 3.3 Metrics, stress tests, fees (`metrics.py`, `stress.py`, `fees.py`)

- r_{p,t} = Σ w_c r_{c,t}; σ_annual = stdev(r_p) × √12, using the sample standard deviation over the
  whole history file.
- MDD = max_t (P_t − V_t) / P_t, where V_t = Π(1 + r_{p,s}) and P_t = max_{s≤t} V_s.
- Weighted fee = Σ w × fee. Liquid share = Σ w over liquid products (≤ 1 day, no lock-up). Largest
  single non-cash weight.
- Stress: loss_%(S) = Σ w_c shock_c(S); loss_CNY = A × loss_%, with each class's contribution
  reported. S1 equity crash, S2 rate rise of 2 points, S3 combined crisis. Hypothetical.
- Fee cost = A(1+g)^H − A(1+g−f)^H; end value after fees = A(1+g−f)^H, where g is an assumed gross
  return per class (cash 1.5%, bond 3%, gold 4%, equity 6%), for illustration only.

Worked examples (AT-08): stress −12,000 / −13,450 / −25,900 (−6.00% / −6.73% / −12.95%); fee costs for
SBF-01, SBF-02, BND-01 at CNY 50,000 over 8 years 1,460.89 / 1,941.26 / 2,418.36; weighted fee 0.25%,
liquid share 40%, largest product 25%.

### 3.4 Compliance gate (`gate.py`)

| Rule | Type | Check |
| --- | --- | --- |
| R-01 | Hard | Item weights total 100 ± 0.01 (over the items, so a weight that never reached a product can't pass) |
| R-02 | Hard | Every product's risk level ≤ the client's tier |
| R-03 | Hard | Every non-cash product ≤ 40% |
| R-04 | Hard | Liquid share × A ≥ N, compared in whole cents |
| R-05 | Hard | Under 3 years: equity + gold ≤ 20% |
| R-06 | Hard | Every lock-up ≤ H × 12 months |
| R-07 | Soft | Weighted fee ≤ 1.00% |
| R-08 | Soft | Historical max drawdown ≤ maximum acceptable loss |
| R-09 | Soft | Worst stress loss ≤ maximum acceptable loss |

The decision is REJECT if any hard rule fails, otherwise WARNING if any soft rule flags, otherwise PASS.
Every rule returns a **detail**, its measured value against its limit (e.g. *"Largest non-cash product
is 25%; the limit is 40%."*), so a PASS shows its reasons as clearly as a REJECT. Thresholds are data
(`backend/data/rules.json`).

**Regulatory basis** (addition, `backend/data/regulations.json`). Every rule names the requirement it
is designed to meet, shown as a chip on the gate panel, in the Console and in the chat's rule card:

| Rule | Basis |
| --- | --- |
| R-01 | Aegis integrity control |
| R-02 | China 2018 Guiding Opinions on asset management, Art. 23 (AI must follow the suitability rules); CSRC Suitability Measures (product-investor matching); MiFID II Art. 25(2) |
| R-03 | Aegis diversification limit |
| R-04, R-05, R-06 | Commission Delegated Regulation (EU) 2017/565, Art. 54(4) and 54(5): financial situation incl. liquid assets; holding period |
| R-07 | MiFID II Art. 24(4): costs and charges disclosed in good time; Aegis 1.00% fee ceiling |
| R-08, R-09 | MiFID II Art. 25(2): ability to bear losses; CSRC Suitability Measures: risk-tolerance assessment |

The mapping was prepared by the team for this sandbox and is labelled as not legal advice.

### 3.5 Quiz, tokens, execution, records (`quiz.py`, `execution.py`, `chain.py`)

- **Quiz.** Three questions built from the proposal: the worst stress loss, a statement about risk, and
  the amount withdrawable within a day. Option order rotates by proposal id mod 3. A wrong answer
  explains why it is wrong; the latest attempt decides.
- **Confirm.** Needs status `passed` or `acknowledged` and a passed quiz. It issues
  `secrets.token_urlsafe(32)`, stores its SHA-256 with a 5-minute expiry and the hash of the items, and
  returns it once.
- **Execute.** Checks in order: TOKEN_INVALID, TOKEN_EXPIRED, TOKEN_USED, STATE_CONFLICT (items changed,
  or the proposal is no longer open), INSUFFICIENT_CASH. It then claims the token with a
  compare-and-set update and, in one transaction, places orders with
  units = ⌊amount / NAV × 10,000⌋ / 10,000, updates positions and cash, marks the proposal executed,
  writes the advice record and logs it all.
- **Advice record.** h_n = SHA256(h_{n−1} ‖ canonical(content_n)), h_0 = 64 zeros, where canonical
  means `json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False)`. The content holds the
  profile, the full proposal, the gate result, the quiz attempt, the disclosures shown, the consent time
  and the orders. Verification names the first record whose hash differs.

### 3.6 Goal projection (`projection.py`, addition)

*"Will this reach my goal?"* is answered by a seeded Monte Carlo over the monthly history file
(`POST /api/projections`):

- **Block bootstrap.** 1,000 paths. Each simulated year is 12 consecutive months drawn from a random
  start, so crisis months stay together (drawing single months would scatter them and understate the
  falls). The portfolio's monthly return is Σ_c w_c r_{c,t} − f / 12, net of the weighted annual fee
  f; a monthly contribution m is paid in at the end of each month.
- **Fast and exact.** Each block is precomputed once: G = Π(1 + r) is the growth of money held
  through it and S = Σ_k Π_{j>k}(1 + r_j) the end value of 1 paid in each month, so one simulated year
  is V' = V × G + m × S. 1,000 paths of 30 years cost 30,000 multiply-adds.
- **Reproducible.** Path p draws its blocks from mulberry32 seeded with 20,261,016 + p. The same
  question always gets the same answer; a longer horizon extends each path instead of reshuffling it;
  alternatives (another tier, another contribution) are compared on the same draws. The mock API
  ports the generator and gets the same numbers.
- **Outputs.** P10, P25, P50, P75 and P90 for each year (linear interpolation), the chance of reaching
  the target, the chance of ending below the money paid in, the median shortfall in the paths that
  miss, and the monthly contribution needed for a 50%, 75% and 90% chance. Each path's end value is
  linear in the contribution, V_H = A + m × B, so that contribution is exact: the nearest-rank quantile
  of max(0, (target − A) / B) across the paths.
- **Basis.** A proposal, the live sandbox portfolio or a tier's model mix. Every answer also runs the
  same goal at all five tiers, with the tiers above the client's marked as not suitable: more risk can
  raise the typical outcome and deepen the bad one, and the gate still decides what the client may
  hold.
- **Goals.** `PUT /api/goals/current` saves a goal (name, target, horizon, monthly amount) as a new
  version and logs `goal_set`; the dashboard and the briefing then follow it.

Worked example (`tests/test_projection.py`): the tier 3 mix (cash 15%, bond 50%, gold 10%, equity 25%,
fee 0.25%), CNY 200,000 for 8 years against a CNY 260,000 target ends at P10 / P25 / P50 / P75 / P90 =
203,151.96 / 221,238.15 / 240,303.08 / 257,594.43 / 271,772.18. The chance of reaching the target is
22.5%, the chance of a loss 8.9%, the median shortfall CNY 27,265.66, and CNY 186 / 386 / 603 a month
would lift the chance to 50% / 75% / 90%. Every projection is labelled *"Illustrative: resampled from
synthetic history, not a forecast"*.

### 3.7 How to fix (`remedy.py`, addition)

When the gate rejects or warns, `GET /api/proposals/{id}/remedy` returns the smallest set of changes
that gets the proposal through: a counterfactual explanation computed by code. The repairs run in a
fixed order, each the way the allocation engine itself would do it:

1. **R-02, R-06.** A product above the tier, or locked beyond the horizon, is swapped for the lowest-fee
   eligible product of the same class (bonds, then cash, when the class has none).
2. **R-01.** The weights return to 100%: a shortfall goes to cash, an excess is trimmed from illiquid
   products first. This runs again at the end.
3. **R-05.** Under 3 years, equity and gold above 20% move to bonds, equity first.
4. **R-03.** A non-cash product above 40% sends its excess to the next eligible product of its class,
   then to bonds, then to cash.
5. **R-04.** Cash that can be withdrawn within a day rises one point at a time until it covers the
   near-term need.
6. **R-07 (soft).** The most expensive products are swapped for cheaper ones of the same class until
   the weighted fee is within the limit.
7. **R-08, R-09 (soft).** 5 points at a time move from equity (then gold) to bonds until the historical
   drawdown and the worst stress loss are within the client's limit.

Eligible means what step 5 of the allocation engine allows. Weight is taken first from products the
fix itself added, then from the most expensive. Every change records the rule it serves and why, and
the whole gate then runs again on the result: the response gives the decision and failed rules
before and after, each change, the new items and their metrics. **Applying the fix is an ordinary
revision**, so the gate runs once more and the version history keeps it. The fix is offered only on
open proposals and needs the same current profile as a revision.

Worked examples (`tests/test_remedy.py`): AT-07's 60% index ETF becomes DEP-01 9%, SBF-01 40%, SBF-02
21%, GLD-01 5%, IDX-01 25%, REJECT to PASS; Scenario 4's 100% HGF-01 becomes IDX-01 25%, DEP-01 15%,
SBF-01 40%, SBF-02 20%. A sweep of 8,000 random allocations left no REJECT after the fix.

### 3.8 What-if preview, the briefing and live analytics (additions)

- **Preview** (`POST /api/proposals/{id}/preview`). The same engines and the whole gate on draft
  weights, with nothing saved, under the same T2 preconditions as a revision. The What-if lab calls it
  as sliders move, so the client sees the verdict, the metrics and the stress losses change with each
  weight. *Save as version N+1* is an ordinary revision.
- **Briefing** (`GET /api/insights`). Up to seven insights computed by code from the client's own
  data, in a fixed order: the goal's chance, fees over the horizon, cash for the near-term need, the
  worst stress scenario against the client's limit, the rule closest to (or over) its limit, what the
  crisis replay taught, and uninvested cash. Each links to where its figure comes from, and the
  response says it was not written by the AI.
- **Live analytics** (`GET /api/sandbox/analytics`). The executed portfolio's class weights, weighted
  fee, largest position and stress losses, for the account's *Risk and goal* tab.

## 4. The advisor agent

**Model call** (`app/agent/llm.py`):
- `client.beta.messages.create` on `claude-opus-5-5`, with effort `medium` and `max_tokens` 16,000.
- Server-side refusal fallback: beta `server-side-fallback-2026-07-01`, `fallbacks="default"`.
- Nine strict tools, with tool choice left on auto.
- Prompt caching on the fixed system prompt (which also caches the tool list rendered before it).
- Client timeout 20 s, one retry. Thinking is always on for this model; thinking blocks are echoed
  back unchanged within a turn.

**Turn loop** (`app/agent/orchestrator.py`):
1. Send the last 10 chat messages, plus the new message with a system-written context block: tier,
   scores, maximum acceptable loss, current proposal. Names and emails are never sent.
2. On `tool_use`, the broker checks and runs each call. All results return in one user message;
   denied or invalid calls come back with `is_error`.
3. On `end_turn`, the reply goes through the grounding and wording check.
4. On failure, regenerate once. The operator note is a mid-conversation system message after the last
   user turn, so the history stays append-only.
5. A second failure, a refusal that survives the fallback, `max_tokens`, a timeout, an API error,
   more than 4 tool rounds, or more than 20 seconds all lead to the template fallback.

**Tools and tiers**:

| Tool | Tier |
| --- | --- |
| `search_products` | T0 |
| `compare_products` | T0 |
| `explain_rule` | T0 |
| `get_profile_summary` | T1 |
| `get_proposal` | T1 |
| `project_goal` (addition) | T1 |
| `suggest_fix` (addition) | T1 |
| `create_proposal` | T2 |
| `revise_proposal` | T2 |

There is no tool that confirms or executes. `project_goal` runs the projection of Section 3.6 on the
client's proposal or tier mix and is told to call the result illustrative and to mention the bad
case. `suggest_fix` runs How to fix on an open proposal; the agent cannot apply it, the client does
with *Apply* on the card.

**Grounding check** (`app/agent/grounding.py`):
- Extracts every number in the reply, ignoring identifiers such as R-03, S3, T2 and SBF-01.
- Accepts a number when it is a correct rounding of a value in this turn's tool results or in the
  client's message. Small integers up to 10 and years from 2000 to 2030 are also allowed.
- Blocks banned phrases.
- Each matched number becomes a **citation**: tool, JSON path and value.
- **Number sources** (addition): each figure's character span in the reply and its source (a tool
  field, the client's message or the profile). In the chat every such figure is underlined; hovering
  or focusing it shows where it came from, and a badge counts the figures traced. The check ran before
  the client saw the reply; the chat only shows its result.

**Chat cards** (addition, `app/agent/cards.py`). Each tool result behind a reply is drawn as a card
beside the text: a fee comparison table, a proposal with its allocation bar and gate result (failed
rules and their measured values, with an Open link), a rule with its regulatory basis, the risk
profile, the product list, or a **blocked** card when the permission broker refused a call. Cards are
built by code from the broker's own outcomes, never from the model's words, so they need no
grounding: they are the tool results. The system prompt tells the model the client sees the cards,
so its reply picks the figures that matter instead of reciting the table. In Scenario 4 the client
sees the rejected version as a REJECT card naming R-02 and R-03. Two cards are additions of version 2:
a **projection** card (a compact fan chart with the chance and the bad, typical and good cases) and a
**fix** card (each change with its rule, the gate before and after, and an *Apply as version N+1*
button).

**Fallback answers** (`app/agent/fallback.py`):
- The five intents of Section 2.5.8, plus answers to each red-team attack class. Execution requests
  and prompt extraction are declined.
- Requests for another client's data go through the broker, which denies them.
- Rule-breaking changes are attempted as a revision, so the gate rejects them in the open
  (Scenario 4).
- Fallback answers call the same tools through the same broker, so they are grounded and logged like
  model replies.
- Version 2 adds two intents, checked after the attack patterns so red-team routing is unchanged:
  *how do I fix this* (runs `suggest_fix`) and goal questions such as *"Can I reach CNY 300,000 in 8
  years?"* (parses the target and horizon and runs `project_goal`). An explanation of a rejection now
  ends with the fix.

**Streaming** (`POST /api/chat/stream`, P1): the same checked turn as server-sent events. `status` and
`tool` events arrive while it runs (each `tool` event carries its card, so results appear while the
agent works), then one `reply`. Reply text is never streamed before it passes the grounding check.

**Every turn is logged** as one `agent_turn` entry (addition): mode, grounding outcome, each tool with
its tier and the broker's decision, the proposals the agent made with the gate's verdict, and the
number of figures traced. Version 2 adds the threat signals, the trace, the latency, the token use,
the model that served the reply and the configuration fingerprint. The Control Room reads these
entries.

**AI labels and provenance** (addition, `app/services/chat.py`). China's measures for labelling
AI-generated content (in force since 1 September 2025) ask for an explicit label people can see and
an implicit one machines can read; Art. 50 of the EU AI Act asks that people know they are talking to
an AI system. Every reply carries:
- A visible label: *AI-generated* (the model answered), *Automated template (checked)* (a fallback)
  or *System notice* (the advisor is paused). The chat opens with a notice that the client is talking
  to an AI system.
- Machine-readable provenance: generator, provider, the model that served the reply, mode, the
  configuration fingerprint and the SHA-256 of the reply text exactly as shown. `POST /api/chat`
  sends the same facts as `X-AI-Generated`, `X-AI-Label`, `X-AI-Content-SHA256` and
  `X-AI-Config-Fingerprint` headers.

**Configuration fingerprint** (addition, `app/agent/fingerprint.py`). One SHA-256 over everything that
shapes an answer: the model and its settings, the system prompt, the tool list and tiers, the
grounding policy and the versions of the data files the engines read. Every turn records it, every
reply carries it and the model disclosure states it, so a filed disclosure can be matched to the
replies that configuration produced (FINRA's 2026 report asks firms to track which model version was
used and when).

**Threat signals** (addition, `app/agent/threats.py`). Twelve pattern rules tag each client message with
the attack it looks like, mapped to the OWASP Top 10 for Agentic Applications (2026): instruction
override (ASI01, high), another client's data (ASI03, high), prompt extraction, execution requests
(ASI02), unverified tier claims, role-play, claimed authority, dictated replies, waivers of
suitability (medium), and large single weights, pressure and promised returns (low); hidden
characters or encoded text add an obfuscation signal. Signals do not block anything: the broker and
the gate already stop the attack. They make the attempt visible, and a medium or high signal puts
the turn in the review queue. They flag 27 of the 30 red-team prompts and none of 30 ordinary
questions.

**Trace** (addition, `app/agent/trace.py`). Each turn is recorded as spans named after the
OpenTelemetry GenAI semantic conventions: `invoke_agent aegis-advisor` for the turn, `chat <model>` for
each model call (with `gen_ai.usage.*` token counts and the served model), `execute_tool <tool>` for
each tool call (with its tier, the broker's decision and the gate's verdict), plus `aegis.grounding`
and `aegis.template`. Prompts, replies and tool arguments are not captured, as the conventions
advise. The spans are stored with the turn and drawn as a waterfall in the Control Room; no collector
is needed.

**Client feedback** (addition, `POST /api/chat/feedback`). The client can mark a reply helpful or not,
with an optional reason, on their own messages only. Each rating is a `chat_feedback` log entry, and a
thumbs-down sends the turn to review.

## 5. Compliance oversight: the AI Control Room

The theme is *AI as a Financial Participant*: an AI that takes part in advice must stay supervised.
Art. 23 of China's 2018 Guiding Opinions on Regulating the Asset Management Business of Financial
Institutions (PBOC, CBIRC, CSRC, SAFE) sets the requirements for AI in asset management. The
compliance officer's **Control Room** (`/control-room`, the officer's landing page) implements them:

| Requirement (Art. 23 unless noted) | Aegis control |
| --- | --- |
| Report the AI model's main parameters and asset-allocation logic to the regulator | **Model disclosure** (`GET /api/compliance/model-card`): provider, model, effort, limits, SHA-256 fingerprints of the system prompt and tool list, the configuration fingerprint, the 9 tools and 4 tiers, the grounding policy, the model portfolios, the 7 allocation steps, assumed returns, stress scenarios, the 9 rules with their basis, the switches' state, the data versions and a governance section (labelling, threat signals, review triggers, tracing). The report carries its own SHA-256; each export is logged. |
| Open a separate account for each investor's AI-managed investing | Each client's own sandbox account |
| Make investors aware of the AI algorithm's inherent defects and risks | Disclosure **DISC-04**, "How the AI advisor works, and its limits", on the Confirm screen and in every advice record |
| Follow the suitability and disclosure rules | The gate checks the AI's proposals exactly as a client's |
| Do not exaggerate or mislead; no guaranteed principal or returns (Art. 19) | The grounding check and banned phrases on every reply |
| Step in by hand: adjust or stop the AI business when the model fails | **Two switches**: *Suspend AI advisor* (no chat turn runs; the broker refuses any tool call still under way) and *Halt execution* (no token is issued and no order fills, even with a token issued before). Each needs a reason of 5 to 300 characters; each change is logged with it. Clients see the state, never the reason. |
| Record events automatically (EU AI Act Art. 12, as good practice) | The append-only operation log |
| Human oversight (EU AI Act Art. 14, as good practice) | Only the client's Confirm click places orders; compliance can stop the advisor |
| Suitability statement before the transaction (MiFID II Art. 25(6)) | The hash-chained advice record |
| Label AI-generated content, explicitly and implicitly (CN labelling measures, 2025; EU AI Act Art. 50) | The visible label and machine-readable provenance on every reply, and the X-AI-* headers |
| Supervise AI output; keep a person accountable (HK SFC GenAI circular, 2024; FINRA 2026 report) | The **review queue**: flagged turns cleared or escalated by the officer, with a note |
| Track model versions and agent actions (FINRA 2026 report; CSRC FinTech plan 2026–2030) | The configuration fingerprint on every turn, the trace, and the model disclosure |
| Defend an agent against goal hijack, tool misuse and privilege abuse (OWASP Agentic Top 10) | The broker, the gate and the threat signals, mapped item by item |

Version 2 organises the page in three tabs:

- **Live** (refreshed every 3 seconds). **Alerts** derived from the log: three or more blocked calls by
  one client in 15 minutes, two or more AI proposals rejected in an hour, high threat signals in the
  last hour, more than 20% of replies failing the number check, turns awaiting review, and a stopped
  switch. The two switches. Eight counts: AI turns (Claude, template, paused), tool calls allowed per
  tier, calls the broker blocked, the AI's proposals the gate rejected, figures traced, messages with
  threat signals, turns awaiting review, and orders placed by the AI (always 0: no tool can). A live
  feed of each turn with its tools, tiers, decisions, gate results, flags and review status. Each row
  opens the **turn inspector**: the client's message and the reply, the AI label and provenance,
  the threat signals with their OWASP item, every tool call, the trace waterfall, the token use and
  latency, the client's feedback, and the review decision.
- **Review queue.** The turns a person should look at, with a severity and the reasons (the review
  triggers: a medium or high threat signal, a blocked call, an AI proposal the gate rejected, a reply
  rewritten or replaced after the number check, a thumbs-down). The officer clears or escalates each
  with a note of 5 to 300 characters (`POST /api/compliance/reviews/{log_id}`). Decisions are
  `review_decided` entries in the append-only log, so the queue's state is rebuilt from the log and
  no decision can be edited away.
- **Governance.** The model disclosure panel (the model, the system-prompt and configuration
  fingerprints, the tools and the JSON download), how the AI's output is governed (labelled,
  fingerprinted, screened, traced, reviewed, stoppable), and the regulatory checklist (20 controls
  across 8 frameworks, grouped by framework, each with its live status). The disclosure itself now has
  a governance section.

## 6. Security design

The permission tiers, controls, known-risk list and red-team results are in
[security-self-assessment.md](security-self-assessment.md). In short:

- Four tiers enforced in code, with no execution path for the agent.
- Suitability, concentration and liquidity enforced by hard rules inside the proposal service.
- bcrypt passwords and server-side sessions behind an httpOnly cookie.
- Ownership checks on every query.
- Single-use, hashed, item-bound confirmation tokens.
- Grounded agent replies with citations.
- An append-only, exportable operation log.
- Tamper-evident advice records.
- Manual intervention: compliance can suspend the advisor and halt execution at once, with a logged
  reason.
- Threat signals on every message, a supervisory review queue, alerts from the log, AI labels with
  content hashes, and a configuration fingerprint on every turn (version 2).

## 7. Quality and testing

| Check | Command | Result |
| --- | --- | --- |
| Backend tests | `docker compose run --rm api pytest -q` | 173 passed |
| Red-team | `python scripts/redteam.py` | 30/30, criteria met; 27 of 30 flagged for review by the threat signals |
| Performance | `python scripts/perf.py` | Every endpoint p95 under 5 ms except projections: 41 ms for a proposal with all five tiers, 130 ms for 30 years with all five tiers (target 2 s) |
| Scenario evidence | `python scripts/evidence.py` | 41 steps of Scenarios 1, 4, 5 and 3, all as specified, including How to fix, a goal projection, the briefing and a review decision |
| Frontend | `npm run lint`, `npm run typecheck`, `npm run build`, `npx tsx scripts/verify.ts` | Clean; 39 checks pass, including the mock data against `backend/data` and the projection, How to fix and threat-signal ports against the backend's results |
| Lint | `ruff check`, `ruff format --check` | Clean |

The backend tests include all 12 acceptance tests (AT-01 to AT-12), one file per engine (Section 2.9.2),
the agent with a scripted model (grounding, regeneration, fallback, broker denials, round limit,
refusals, timeouts), an end-to-end Scenario 1, and the additions: chat cards and number sources, the
column upgrade for older databases, both switches (including a suspension that lands mid-turn), the
Control Room counts, the model disclosure's own fingerprint, the regulatory map and the replay amount.
Version 2 adds the projection engine (the worked example, reproducibility, the exact required
contribution), How to fix (both worked examples, every rule, open proposals only), the planning API
(projections, goals, the briefing, live analytics, preview, with their permissions) and governance
(labels and headers, the fingerprint, threat signals on the red-team set and on ordinary questions,
traces, feedback, the review queue and its decisions, alerts).

## 8. Deployment

`docker compose up --build` starts two containers:
- `api`: Python 3.12, Uvicorn, SQLite in a named volume, seeded on first start, health-checked.
- `web`: a Next.js standalone server, built with `NEXT_PUBLIC_API_MOCK=0` and
  `API_BASE_URL=http://api:8000`.

The web app is on port 3000, and the API documentation is at <http://localhost:8000/docs>.
Configuration is environment-only (`.env.example`); the only secret is `ANTHROPIC_API_KEY`.
A database from an earlier version gets the new chat columns (cards, number sources, provenance) on
start-up (`add_missing_columns`) and the new `goals` table.

## 9. Decisions and deviations from the project documentation

| Item | Decision |
| --- | --- |
| Allocation rounding | A negative remainder comes out of the largest non-cash class, not cash, so the liquidity floor and horizon cap hold (AT-06 requires both). |
| Liquidity floor | Computed with exact fractions to avoid a float ceiling error. |
| R-01 | Checks the items' weights, not the class weights. |
| Grounding tolerance | Stricter than the documentation's \|x − round(y, d)\| ≤ 10^−d, which would let "10%" match 9. |
| Additions to the contract | `ProposalItem.rationale`, `GateRule.detail`, `POST /api/chat/stream`, chat cards and number sources, `Rule.basis`, the replay amount and events, the controls and oversight endpoints; see [api-contract-changes.md](api-contract-changes.md). |
| Compliance role | No longer read-only for the AI itself: it can suspend the advisor and halt execution (Art. 23 manual intervention). It still cannot change any client's data. |
| Disclosures | DISC-04 added on the AI's limits (Art. 23); records now list four disclosures. |
| FR-5.5 client-directed override (P1) | Not built: it would let a product above the client's tier pass, against the objective that no unsuitable product can pass. |
| Replay history | Synthetic and labelled "Illustrative" until licensed series replace it (decision D-1). |
| Goal projection | A block bootstrap of the same synthetic history rather than a parametric model, so crisis months keep their order and no return or volatility is assumed. Seeded, so answers are reproducible and auditable; labelled illustrative. |
| How to fix | Fixed repair order mirroring the allocation engine, rather than an optimiser, so each change can be explained by the rule it serves. Applying it is a normal revision through the gate. |
| Review decisions | Stored as append-only log entries, not a new table, so a decision cannot be edited or deleted. |
| Threat signals | Advisory, not blocking: the broker and the gate are the controls, and blocking on patterns would refuse legitimate questions. |
