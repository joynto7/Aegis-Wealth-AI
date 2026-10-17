# APPENDIX B: GLOSSARY AND ABBREVIATIONS

Table: Glossary
| Term | Meaning |
|----------------|--------------------------------------------------------|
| Advice record | The tamper-evident record of an executed recommendation: profile, proposal, gate result, quiz, disclosures, consent time and orders, chained by hash |
| Asset class | One of cash, bond, gold and equity |
| Card | A visual tool result shown beside an agent reply, built by code from the broker's outcome |
| Configuration fingerprint | A SHA-256 hash over everything that shapes an answer: model, settings, prompt, tools, grounding policy and data versions |
| Contradiction | A pair of questionnaire answers that cannot both be true; it blocks proposals until resolved |
| Drift | The difference, in percentage points, between a class's live weight and its target weight |
| Drift band | The tolerance of 5 points around each target weight |
| Fallback mode | The advisor answering with checked templates, without the model |
| Gate | The compliance gate: rules R-01 to R-09 and the decision PASS, WARNING or REJECT |
| Grounding check | The check that every number in a reply comes from the turn's tool results or the client's message |
| How to fix | The smallest set of changes that makes a rejected proposal pass, rule by rule |
| Maximum acceptable loss | The loss the client says they can bear (5%, 10%, 20% or 30%), used by R-08 and R-09 |
| Near-term need | Money the client needs soon, which must stay liquid (R-04) |
| Permission broker | The component that authorises and runs every tool call of the agent |
| Proposal version | One saved state of a proposal; revisions create new versions |
| Rebalancing | A proposal version that restores the agreed mix after the market moves |
| Risk tier | The client's risk level from 1 (conservative) to 5 (aggressive) |
| Sandbox | The simulated account in which orders are executed; no real money is involved |
| Stale rebalancing | A rebalancing priced at an earlier market month or other holdings; it cannot execute |
| Permission tier | T0 to T3 and C: the levels of access to data and actions |

Table: Abbreviations
| Abbreviation | Meaning |
|------------|--------------------------------------------------------|
| AI | Artificial intelligence |
| API | Application programming interface |
| AT | Acceptance test |
| CNY | Chinese yuan |
| CSRC | China Securities Regulatory Commission |
| ER | Entity-relationship |
| FINRA | Financial Industry Regulatory Authority (United States) |
| FK, PK | Foreign key, primary key |
| FR, NFR | Functional requirement, non-functional requirement |
| HTTPS | Hypertext Transfer Protocol Secure |
| JSON | JavaScript Object Notation |
| LLM | Large language model |
| MDD | Maximum drawdown |
| MiFID II | Markets in Financial Instruments Directive (EU) |
| NAV | Net asset value |
| OWASP | Open Worldwide Application Security Project |
| P10, P50, P90 | 10th, 50th and 90th percentiles |
| REST | Representational state transfer |
| SFC | Securities and Futures Commission (Hong Kong) |
| SSE | Server-sent events |
| UML | Unified Modeling Language |
| WAL | Write-ahead logging (SQLite) |
