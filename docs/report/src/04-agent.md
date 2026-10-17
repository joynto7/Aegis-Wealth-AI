# CHAPTER 4: THE ADVISOR AGENT

The advisor agent is the part of Aegis that acts as a financial participant: it holds the advisory dialogue, chooses tools and proposes allocations. This chapter describes how it is built so that it can do real work without being able to compute money, act for another client or place an order.

## 4.1 Design Principle

The agent follows one rule: **code computes, the model talks**. The Claude model decides what to ask, which tool to call and how to explain the result, but every figure comes from an engine through a tool, and every action passes the permission broker [@anthropic-tools]. Three mechanisms enforce the rule:

- **Tools as the only path:** the model never sees the database or the services. It can only request one of eleven strict tools, and the permission broker validates and authorises each request before anything runs.
- **Checked replies:** before a reply reaches the client, the grounding check verifies that every number in it comes from this turn's tool results or from the client's own message.
- **No execution path:** no tool can confirm or execute an order. Execution needs the client's quiz, Confirm click and one-time token (Section 3.6), which the agent cannot obtain.

The model receives a masked context: the client's tier, scores, maximum acceptable loss and current proposal, and product data. Names, e-mail addresses and passwords are never sent (NFR-3.6).

## 4.2 Model Call and Turn Loop

The LLM Client (`agent/llm.py`) is the only component that calls the Claude API. It uses the model `claude-opus-5-5` with medium effort and a limit of 16,000 output tokens, eleven strict tool definitions with the tool choice left to the model, and prompt caching on the fixed system prompt. Server-side refusal fallback is enabled. The client times out after 20 seconds and retries once. Thinking is always on for this model, and thinking blocks are passed back unchanged within a turn.

Each chat turn runs the loop below (`agent/orchestrator.py`):

1. **Context:** the last ten chat messages are sent, followed by the new message with a context block written by the system.
2. **Tool rounds:** when the model asks for tools, the broker checks and runs each call. All results return in one message; denied or invalid calls return as errors, so the model can explain the refusal.
3. **Reply check:** when the model ends its turn, the reply goes through the grounding and wording check (Section 4.5).
4. **Regeneration:** a failing reply is regenerated once, with an operator note that names what failed.
5. **Fallback:** a second failure, a refusal, the output limit, a timeout, an API error, more than four tool rounds or more than 20 seconds in total all lead to a checked template answer (Section 4.6).

The same loop serves `POST /api/chat` and the streamed variant `POST /api/chat/stream`, which sends progress, tool and reply events as server-sent events. The reply text is sent only after it has passed the check.

## 4.3 Tools and Permission Tiers

{@tbl:tools-list} lists the eleven tools. Each has a strict JSON schema at the model and is validated again by the broker on the server.

Table: Tools of the advisor agent {#tbl:tools-list}
| Tool | Tier | What it does |
|------------------|:---:|------------------------------------------------------|
| `search_products` | T0 | Searches the shelf of 20 sample products by type, maximum risk level or text, and says whether each suits the client's tier |
| `compare_products` | T0 | Compares two or three products for an amount and a horizon: fee cost, end value after fees, liquidity, lock-up and suitability |
| `explain_rule` | T0 | Returns a gate rule, its threshold and its regulatory basis |
| `get_profile_summary` | T1 | The client's own scores, tier, maximum acceptable loss and contradictions |
| `get_proposal` | T1 | One of the client's own proposals with its items, metrics and gate result |
| `project_goal` | T1 | Runs the goal projection on the client's proposal or tier mix; the result must be called illustrative and the bad case mentioned |
| `suggest_fix` | T1 | Runs How to fix on an open proposal; only the client can apply it, with a button on the card |
| `check_drift` | T1 | The client's drift at simulated prices and the trades a rebalancing would place |
| `create_proposal` | T2 | Creates a proposal; the gate runs on it |
| `revise_proposal` | T2 | Saves a revised version; the gate runs on it |
| `propose_rebalance` | T2 | Saves a rebalancing for the gate, under the same conditions as a revision |

The tiers form a ladder of permissions ({@tbl:tiers}). The agent can reach T0 to T2 only; tier T3 belongs to the client's own click, and the oversight powers (C) belong to the compliance officer. Any unknown tool name, such as an invented `execute_order`, is treated as a T3 request and denied.

Table: Permission tiers {#tbl:tiers}
| Tier | Who | What it allows | Unlocked when |
|------|------------|----------------------------------|------------------------------|
| T0 Read | Agent and client | Product shelf, comparison, rule text | A valid session, and the advisor not suspended |
| T1 Client data | Agent (for the logged-in client) and client | The client's own profile, proposals, projections, How to fix and drift, all read-only | The data belongs to the session's user |
| T2 Propose | Agent and client | Create and revise proposals and propose a rebalancing; the gate always runs | The profile is complete, has no open contradiction and is under 365 days old |
| T3 Execute | The client's click only | Place sandbox orders, including a rebalancing's trades | PASS or acknowledged WARNING, a passed quiz, a valid one-time token, and execution not halted |
| C Oversight | The compliance officer only | Suspend the advisor, halt execution, export the model disclosure, decide reviews, move the market clock | The compliance role and a logged reason of 5 to 300 characters |

## 4.4 A Tool Call Through the Broker

{@fig:tool-call} shows Scenario 4 of the project documentation as a UML sequence diagram: the client asks for a change that breaks the rules, "make it 80% equity". The agent first scans the message for threat signals (Section 5.3) and builds the masked context. The model can only ask for a tool, here `revise_proposal`. The broker validates the arguments against the schema. It then checks that the advisor is not suspended, that the proposal belongs to the client and that the T2 preconditions hold, before any service runs. When the call is allowed, the revision goes through the gate like any other version: the gate rejects it with R-02 and R-03, and the client sees the rejected version as a REJECT card. When the call is denied, it returns to the model as an error and is logged as `permission_denied`, and the client sees a "blocked" card. Either way, the reply is shown only after the grounding check.

![A tool call through the permission broker {#fig:tool-call}](diagrams/fig-4-1-tool-call.png)

Because the broker sits between the model and every service, an injected instruction can at most make the agent attempt something the client could attempt, and the same checks stop it. This is why the red-team run produced no order, no unsuitable proposal that passed and no cross-client data (Section 6.4).

## 4.5 Grounding Check and Number Sources

The grounding check (`agent/grounding.py`) runs on every reply before the client sees it:

- **Numbers:** it extracts every number in the reply, ignoring identifiers such as R-03, S3, T2 or SBF-01. A number is accepted only when it is a correct rounding of a value in this turn's tool results or in the client's message. Small integers up to 10 and years from 2000 to 2030 are also allowed. The check is stricter than the project documentation's tolerance, which would let "10%" match 9.
- **Wording:** banned phrases such as "guaranteed", "risk-free", "can't lose" or "sure profit" are blocked, so no reply can promise returns (NFR-6.3).
- **Citations:** each accepted number becomes a citation that records its tool, JSON path and value.
- **Number sources:** each figure's position in the reply is stored with its source: a tool field, the client's message or the profile. In the chat every such figure is underlined, and hovering or focusing it shows where it came from, while a badge counts the figures traced.

A failing reply is regenerated once with an operator note, then replaced by a checked template (AT-09).

## 4.6 Chat Cards, Fallback Answers and Logging

**Cards.** Each tool result behind a reply is drawn as a card beside the text: a fee comparison table, a proposal with its allocation bar and gate result, a rule with its regulatory basis, the risk profile, a product list, a goal projection with its fan chart, a fix with each change and an "Apply as version N+1" button, or a drift card with a "Propose rebalancing" button. A "blocked" card appears when the broker refused a call. Cards are built by code from the broker's own outcomes, never from the model's words, so they need no grounding: they are the tool results. The system prompt tells the model that the client sees the cards, so the reply picks the figures that matter instead of reciting a table.

**Fallback answers.** Without an API key, or when the model fails, checked templates answer the five intents of the project documentation and the red-team attack classes, plus goal, How to fix, drift and rebalancing questions (`agent/fallback.py`). They call the same tools through the same broker, so they are grounded and logged like model replies. Execution requests and attempts to extract the system prompt are declined. Rule-breaking changes are attempted as revisions, so the gate rejects them in the open. "Rebalance and execute it now" is an execution request and is declined.

**Logging.** Every turn is logged as one `agent_turn` entry. It records the mode, the grounding outcome, each tool with its tier and the broker's decision, the proposals the agent made with the gate's verdict and the number of figures traced. It also records the threat signals, the trace, the latency, the token use, the model that served the reply and the configuration fingerprint. The AI Control Room reads these entries (Chapter 5).
