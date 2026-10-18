# CHAPTER 2: PERMISSION-TIER IMPLEMENTATION

This chapter describes how the permission tiers are implemented: the broker that checks every action of the agent, the tiers themselves, the code that enforces each tier and the tests that prove it, the path to execution, and the powers of the compliance officer.

## 2.1 The Permission Broker

The advisor agent never touches the database or the services directly. The Claude model can only ask for one of eleven tools ({@tbl:tools}), each with a strict JSON schema, and every request goes through the permission broker (`app/agent/broker.py:90`, `PermissionBroker.run` at line 119) [@anthropic-tools]. Before any service runs, the broker checks, in this order, that the tool exists, that the session belongs to a client, that the advisor is not suspended and, for a T2 tool, that the client's profile meets the T2 preconditions. An unknown tool name, such as an invented execution tool, is denied as a T3 request. The tool then validates its arguments on the server, and its services load data only through ownership checks, so a request for another client's data comes back as a denial.

Every call is written to the operation log with its tool, tier and decision, as `tool_call` or `permission_denied`. A refused call returns to the model as an error, so that the model can explain the refusal, and the client sees it as a "blocked" card in the chat.

Table: The advisor agent's tools and their tiers {#tbl:tools}
| Tool | Tier | What it does |
|------------------|:---:|------------------------------------------------------|
| `search_products` | T0 | Searches the shelf of 20 sample products by type, maximum risk level or text, and says whether each suits the client's tier |
| `compare_products` | T0 | Compares two or three products for an amount and a horizon: fee cost, end value after fees, liquidity, lock-up and suitability |
| `explain_rule` | T0 | Returns a gate rule, its threshold and its regulatory basis |
| `get_profile_summary` | T1 | The client's own scores, tier, maximum acceptable loss and contradictions |
| `get_proposal` | T1 | One of the client's own proposals with its items, metrics and gate result |
| `project_goal` | T1 | Runs the goal projection on the client's proposal or tier mix |
| `suggest_fix` | T1 | Runs How to fix on an open proposal; only the client can apply the fix |
| `check_drift` | T1 | The client's drift at simulated prices and the trades a rebalancing would place |
| `create_proposal` | T2 | Creates a proposal; the gate runs on it |
| `revise_proposal` | T2 | Saves a revised version; the gate runs on it |
| `propose_rebalance` | T2 | Saves a rebalancing for the gate, under the same conditions as a revision |

{@fig:tool-call} shows the broker at work in Scenario 4 of the project documentation, in which a client asks for a change that breaks the rules: "make it 80% equity". The agent scans the message for threat signals and builds a masked context without names or e-mail addresses. The model asks for `revise_proposal`, and the broker validates the call and checks the switches, ownership and tier before the revision runs. The revision then passes through the gate like any other version, and the gate rejects it with R-02 and R-03. Either way, the reply reaches the client only after the grounding check.

![A tool call through the permission broker {#fig:tool-call}](diagrams/fig-4-1-tool-call.png)

Because the broker sits between the model and every service, an injected instruction can at most make the agent attempt something that the client could attempt, and the same checks stop it.

## 2.2 The Tiers

The tiers form a ladder of permissions ({@tbl:tiers}). The agent can reach T0 to T2 only. Tier T3 belongs to the client's own click, and the oversight tier C belongs to the compliance officer.

Table: Permission tiers {#tbl:tiers}
| Tier | Who | What it allows | Unlocked when |
|----------|------------|--------------------------------|------------------------------|
| T0 Read | Agent and client | The product shelf, product comparison and rule text | A valid session, and the advisor not suspended |
| T1 Client data | Agent (for the logged-in client) and client | The client's own profile and proposals, goal projections, How to fix and portfolio drift, all read-only; applying a fix is a T2 revision by the client | The data belongs to the session's user |
| T2 Propose | Agent and client | Create and revise proposals, and propose a rebalancing; the gate always runs | The profile is complete, has no open contradiction and is under 365 days old |
| T3 Execute (sandbox) | The client's click only | Place simulated orders, including a rebalancing's sales and purchases | PASS or an acknowledged WARNING, a passed quiz, a valid one-time token and execution not halted; for a rebalancing, prices and holdings unchanged since it was priced |
| C Oversight | The compliance officer only | Suspend or resume the AI advisor, halt or resume execution, export the model disclosure, clear or escalate a flagged AI turn, move the simulated market and see every client's drift | The compliance role, and a logged reason of 5 to 300 characters |

## 2.3 Enforcement in Code and Proof

Each tier is enforced by the server, in code that the model cannot reach or change. {@tbl:enforcement} names, for each tier, the code that enforces it and the tests that prove it.

Table: How each tier is enforced and proven {#tbl:enforcement}
| Tier | Enforced in code | Proven by |
|------|----------------------------------------------|--------------------|
| T0 | `app/core/auth.py:21` (`current_user`) requires a valid session. The broker allows T0 tools for any client session while the advisor is active (`app/agent/broker.py:143`) | AT-01; `test_api_auth.py`; `test_oversight.py` |
| T1 | The broker passes the session's user into every tool. `app/services/proposals.py:103` (`get_owned`) returns 403 for another client's proposal, which the broker turns into `PERMISSION_DENIED` (`app/agent/broker.py:154`). The drift view reads only the session user's holdings (`app/services/monitoring.py:121`) | AT-02 (`test_api_ownership.py`); `test_agent.py` (T1 tools read only the client's own data); red-team group 5 |
| T2 | `app/services/profiles.py:130` (`t2_error`), checked by the broker (`app/agent/broker.py:145`) and by the proposal and rebalancing routes. The gate runs inside `persist()` in `app/services/proposals.py`, which a rebalancing also goes through (`app/services/monitoring.py:430`), so no path skips it | AT-04, AT-07; `test_agent.py` (T2 denied with an open contradiction); `test_monitoring_api.py` |
| T3 | No agent tool exists for T3, and any unknown tool name is denied as T3 (`app/agent/broker.py:138`). `app/services/execution.py:59` issues the token, and `execution.py:99` checks it and claims it with a compare-and-set update (`execution.py:125`), so that it works exactly once. While execution is halted, both refuse with `EXECUTION_HALTED` (`execution.py:60` and `:101`), even for a token issued before. A stale rebalancing is refused at both steps with `STATE_CONFLICT` (`execution.py:72` and `:117`) | AT-10 (`test_tokens.py`); red-team groups 1 and 4; `test_oversight.py`; `test_monitoring_api.py` |
| C | `app/core/auth.py:45` (`compliance_user`) requires the compliance role. `app/services/controls.py:66` (`set_state`) and `app/services/market.py:71` (`advance`) log each change with its reason. A suspension is checked at the start of every turn and again by the broker before every tool call, so it also stops a turn under way | `test_oversight.py` (switches, suspension during a turn, halt with an earlier token, roles, inputs); `test_monitoring_api.py` (officer-only clock, logged reason, inputs) |

## 2.4 The Path to Execution

Execution is the one action that moves money, even simulated money, so it is kept out of the agent's reach altogether ({@fig:gate}). Every proposal version passes the nine-rule compliance gate inside the only save path, whoever creates it. A REJECT stops the path, and each WARNING must be acknowledged by the client. The client then answers a three-question comprehension quiz and clicks Confirm. Only then does the server issue a one-time token, which is:

- **Random and hashed:** made by `secrets.token_urlsafe(32)` and stored only as a SHA-256 hash.
- **Short-lived:** valid for five minutes.
- **Bound to the items:** tied to a hash of the proposal's items, so that it cannot execute a different allocation.
- **Single-use:** claimed with a compare-and-set update, so that it works exactly once.

Execution checks the token, the items and the switches in a fixed order, places the orders in the sandbox account and writes an advice record chained by SHA-256 to the client's previous one. While execution is halted, no token is issued and no order fills, even with a token issued before the halt.

![The compliance gate and the path to execution {#fig:gate}](diagrams/fig-3-1-gate-activity.png)

## 2.5 The Compliance Officer's Powers

Article 23 of China's 2018 Guiding Opinions on asset management asks a firm that uses AI to be able to intervene by hand and stop its AI business when the model fails [@cn-amgo]. The oversight tier C gives the compliance officer these powers and no others:

- **Suspend AI advisor:** no chat turn runs, and the broker refuses any tool call still under way.
- **Halt execution:** no confirmation token is issued and no order fills, even with a token issued before the halt.
- **Disclosure, reviews and the market clock:** export the model disclosure, clear or escalate flagged AI turns, and move the simulated market.

Each change needs the compliance role and a reason of 5 to 300 characters, and is logged with it. Clients see the state of the switches, never the reason. The officer still cannot change any client's data: every state-changing endpoint for profiles, proposals and orders requires the client role (`app/core/auth.py:39`). A review decision changes no client data either, since it is an append-only log entry with the officer's note, and moving the clock reprices holdings but trades nothing and creates no proposal.
