# CHAPTER 1: INTRODUCTION

This chapter states the purpose and scope of the assessment, how it was carried out, and the assets it protects.

## 1.1 Purpose

The competition asks every team for a security self-assessment report that covers the implementation of the permission tiers and a list of known risks, and it gives security and compliance 30% of the marks [@competition]. This report answers both points for Aegis Wealth AI, a wealth-advisory agent built for Topic B, and gives the evidence behind each answer, so that a reviewer can check every claim against the code and the test logs.

## 1.2 Scope and Method

The assessment covers the whole system as built: the FastAPI backend with its engines, services and advisor agent, the Next.js web application, the SQLite database, the local deployment with Docker Compose and the hosted demonstration on Render. Its structure follows Section 2.8.4 of the project documentation, which defined the tiers, the controls and the known-risk list before the build started [@project-doc]. The technical documentation (deliverable 01) describes the architecture in which these controls sit.

The assessment was made in four steps:

1. **Assets.** List what must be protected and where it lives ({@tbl:assets}).
2. **Tiers and controls.** For each tier and control, name the code that enforces it and the automated test that proves it. Code locations are given as file and line, relative to the `backend` folder of the repository, and were checked against the code when this report was written.
3. **Attack.** Run 30 red-team prompts through the full chat path and check four pass criteria (Chapter 5).
4. **Risks.** List the known risks with their controls and what remains after the controls (Chapter 4), and map the controls to the OWASP Top 10 for Agentic Applications (Chapter 6) [@owasp-asi].

Every control in this report has an automated test, and the logs of the test runs are in the `evidence` folder of the repository.

## 1.3 Assets

Table: Assets and where they live {#tbl:assets} {.keep}
| Asset | Where it lives | Why it matters |
|----------------|------------------------|------------------------|
| Client risk profiles and answers | `profiles` table | They decide the tier, and so which products are suitable |
| Proposals and gate results | `proposals`, `proposal_items`, `gate_results` tables | The advice itself and its compliance decision |
| Sandbox accounts, orders and positions | `sandbox_accounts`, `orders`, `positions` tables | The simulated money, which must move only on the client's click |
| Confirmation tokens | `confirm_tokens` table (SHA-256 hashes only) | The single key to execution |
| Advice records | `advice_records` table | The audit trail of every executed recommendation |
| Operation log | `operation_logs` table | Evidence of every material action, allowed or denied |
| Sessions and password hashes | `sessions` (SHA-256 of the cookie) and `users` (bcrypt) tables | Identity |
| The Anthropic API key | The backend environment only (`.env`, ignored by Git) | Model access and cost |
| Compliance switches | `controls` table; every change in the operation log | They stop the AI advisor and sandbox execution by hand |
| Saved goals | `goals` table; `goal_set` log entries | The client's targets, which drive the briefing and the projections |
| AI labels, traces and review decisions | `chat_messages.provenance`; `agent_turn` and `review_decided` log entries | Evidence of what the AI said, how it got there and who reviewed it |
| The simulated market clock | `market_clock` table, `products.nav`, `market_advanced` log entries | It reprices every holding and every new order; only the compliance officer may move it |
| Rebalancing plans | `rebalance_plans` table | The exact trades a client confirms, bound to one market month and one set of holdings |

## 1.4 Out of Scope by Design

Aegis handles no real money, has no connection to a brokerage, uses no live market data and offers no self-registration: three demonstration accounts are seeded. No code path exists for any of these, so no prompt or request can reach one.

## 1.5 Structure of This Report

Chapter 2 shows how the permission tiers are implemented and proven, and Chapter 3 describes the other controls. Chapter 4 lists the known risks, Chapter 5 reports the test evidence, Chapter 6 maps the controls to the OWASP Top 10 for Agentic Applications, and Chapter 7 gives the limitations, next steps, conclusion and references.
