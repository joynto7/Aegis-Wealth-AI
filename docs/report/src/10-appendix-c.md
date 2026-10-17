# APPENDIX C: DESIGN DECISIONS AND DEVIATIONS

This appendix records the decisions taken during the build where Aegis departs from, or goes beyond, the project documentation.

Table: Design decisions and deviations from the project documentation
| Item | Decision |
|----------------|------------------------------------------------------------|
| Allocation rounding | A negative rounding remainder comes out of the largest non-cash class, not cash, so the liquidity floor and the horizon cap always hold (AT-06 requires both). |
| Liquidity floor | Computed with exact fractions, to avoid a floating-point ceiling error. |
| R-01 | Checks the items' weights, not the class weights, so a weight that never reached a product cannot pass. |
| Grounding tolerance | Stricter than the documentation's tolerance, which would let "10%" match 9. |
| Additions to the contract | Item rationale, rule details, streaming chat, chat cards and number sources, the rule basis, the replay amount and events, the controls, oversight, planning and monitoring endpoints. |
| Compliance role | Can suspend the advisor, halt execution, decide reviews and move the market clock (manual intervention under Art. 23); still cannot change any client's data. |
| Disclosures | DISC-04 added on the AI's limits (Art. 23); records list four disclosures. |
| FR-5.5 client-directed override (P1) | Not built: it would let a product above the client's tier pass, against the objective that no unsuitable product can pass. |
| Replay and market history | Synthetic and labelled "Illustrative" until licensed series replace it. |
| Goal projection | A block bootstrap of the same history rather than a parametric model, so crisis months keep their order and no return or volatility is assumed; seeded, so answers are reproducible and auditable. |
| How to fix | A fixed repair order that mirrors the allocation engine, rather than an optimiser, so each change can be explained by the rule it serves; applying it is an ordinary revision through the gate. |
| Review decisions | Stored as append-only log entries, not a new table, so a decision cannot be edited or deleted. |
| Threat signals | Advisory, not blocking: the broker and the gate are the controls, and blocking on patterns would refuse legitimate questions. |
| Simulated market | Replays the synthetic history from March 2009 so a demonstration shows drift within a few months; prices are recomputed from the base each time; horizons and needs keep their agreed values. |
| Drift band | One absolute band of 5 points per class, disclosed beside every figure; the relative 5/25 band was considered and not adopted, to keep one number. |
| Rebalancing | Never drafted automatically: drift raises an alert and a briefing, and the client or the agent (T2) proposes. Priced once: a stale rebalancing cannot execute. |
| Hosted demo | One container on a free plan for the live link; the reference deployment for reviewers remains Docker Compose. |
