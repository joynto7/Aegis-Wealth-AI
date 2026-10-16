# API contract changes

Section 2.10.4 of the project documentation: only the backend lead changes the contract. A change means
four steps on the same day:

1. Update Section 2.6.
2. Update the Pydantic schema.
3. Regenerate the frontend types.
4. Post "CONTRACT CHANGE: endpoint" in the team chat.

Steps 2 and 3 are done for the changes below (`backend/app/schemas`, `frontend/src/lib/api-types.ts`);
steps 1 and 4 are for the backend lead.

## Additions (backwards compatible)

| Change | Where | Why |
| --- | --- | --- |
| `rationale: string` on every proposal item | `ProposalItem` in `GET/POST /api/proposals`, `/revise`, records | The engine's plain-language reason for choosing each product, and any revision. Topic B asks for *explainable* allocation suggestions. |
| `detail: string` on every gate rule | `GateRule` | The rule's measured value against its limit, pass or fail. Design principle 3: "every decision shows its reason". |
| `POST /api/chat/stream` | New endpoint | P1 streaming chat. Same request body and rate limit as `POST /api/chat`. Responds with `text/event-stream`: `status` and `tool` events while the turn runs, then one `reply` (the `ChatReply`) or `error` (the error envelope). |
| `GET /` on the API | Redirects to `/docs` | Convenience for reviewers who open port 8000. |

## Additions for the AI oversight upgrade (backwards compatible)

| Change | Where | Why |
| --- | --- | --- |
| `cards: ChatCard[]` | `ChatReply`, `ChatMessage` (history) | The tool results behind a reply, drawn beside it. A discriminated union on `type`: `products`, `comparison`, `proposal` (with `gate_decision` and `failed_rules`), `rule` (with `rule_type` and `basis`), `profile`, `blocked` (a call the broker refused). |
| `number_sources: NumberSource[]` | `ChatReply`, `ChatMessage` | Each figure's span in the reply (`start`, `end`, `text`) and its source (`kind`: `tool`, `message` or `context`; `tool`, `path`, `value`). |
| `card` on streamed `tool` events | `POST /api/chat/stream` | Results appear while the agent works. |
| `ChatMode` value `suspended` | `ChatReply.mode` | The reply while compliance has the advisor suspended. |
| `basis: RuleBasis[]` | `Rule` in `GET /api/compliance/rules` | The regulatory requirement each rule is designed to meet (`framework`, `title`, `ref`, `requirement`). |
| `?amount=` (CNY 10,000 to 10,000,000, default 100,000) | `GET /api/replay/{episode_id}` | The replay from the client's own amount. |
| `events`, `events_label` | `ReplayResult` | The real-world events of the episode's months. |
| `GET /api/controls` | New, any signed-in user | The two switches' state (`advisor`: active/suspended, `execution`: open/halted). The reason and who changed it are filled in for compliance only. |
| `POST /api/compliance/controls` | New, compliance only | `{control, state, reason}` (reason 5 to 300 characters); logged as `advisor_suspended`, `advisor_resumed`, `execution_halted` or `execution_resumed`. Setting the current state again changes and logs nothing. |
| `GET /api/compliance/overview?limit=` | New, compliance only | The Control Room: model, mode, prompt fingerprint, switches, counts and the latest agent turns. |
| `GET /api/compliance/regulations` | New, any signed-in user | Frameworks and the AI-control checklist. |
| `GET /api/compliance/model-card` | New, compliance only | The model and allocation-logic disclosure with its own `content_sha256`; each call is logged as `model_card_exported`. |
| Error code `EXECUTION_HALTED` (409) | `POST /api/proposals/{id}/confirm`, `/execute` | Execution halted by compliance; logged as a denied T3 action. |
| Log actions | Operation log | `agent_turn` per chat turn, plus the switch and export actions above. |
| Disclosure DISC-04 | `backend/data/disclosures.json`, advice records | The AI's inherent limits and risks (2018 Guiding Opinions, Art. 23). Records now list four disclosures. |
| Table `controls`; columns `chat_messages.cards`, `chat_messages.number_sources` | Database | Added on start-up to a database from an earlier version. |

## Behaviour now fixed by the implementation

These follow the documentation; listed so the frontend and the docs agree.

- **Another client's resource is 403 FORBIDDEN** (not 404) for proposals, quizzes, records and chat
  with a `proposal_id` (AT-02). A missing id is 404.
- **A second reaction to the same replay episode** for the same profile version is 409 STATE_CONFLICT.
  Retaking the profile allows answering again.
- **A replay reaction while the profile has an open contradiction** is 409 CONTRADICTIONS_OPEN.
- **Acknowledge, quiz and confirm on a rejected proposal** are 409 GATE_REJECTED (AT-07). On an
  executed or superseded proposal they are 409 STATE_CONFLICT.
- **Acknowledging a rule** that is not a warning on that proposal is 422.
- **Execute on a proposal superseded after confirm** is 409 STATE_CONFLICT.
- **Request bodies reject unknown fields** (422).
- **POSTs with a cross-site `Origin`** are 403. Form-encoded or text bodies are 422 (CSRF defence).
- **Log-in.** 10 attempts a minute per IP, then 429 RATE_LIMITED. 5 consecutive failures lock the
  account for 5 minutes (429 RATE_LIMITED with that message; P1 lock-out).
- **`POST /api/records/verify` with `scope: "all"`** by a client is 403.
- **Log-in response.** The body is `{"user": ...}` only; the session travels in the httpOnly
  `aegis_session` cookie and never in a body.
