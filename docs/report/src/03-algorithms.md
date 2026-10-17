# CHAPTER 3: CORE ALGORITHMS

This chapter describes the algorithms that compute every figure and enforce every rule in Aegis. Each one is a pure engine in `backend/app/engines`, tested against the worked examples of the project documentation. The language model never computes money: it can only call tools that run these engines (NFR-6.1).

## 3.1 Design Principles of the Engines

The engines follow four principles:

- **Pure functions:** every engine takes all its inputs as arguments and has no file, database or network access, so it can be tested in isolation and gives the same result for the same inputs (NFR-2.2, NFR-5.1). The services load the data and pass it in.
- **Configuration as data:** the questionnaire, the model portfolios, the rules and their thresholds, the stress scenarios, the assumed returns, the regulations and the market settings are versioned JSON and CSV files, not code (NFR-5.3). Changing a threshold changes a data file, and its new version appears in the configuration fingerprint (Section 5.2).
- **Exact rounding:** money and percentages are rounded half away from zero (`numbers.py`). The worked examples require it: Python's built-in `round()` rounds half to even and would give stress scenario S2 as −6.72% instead of −6.73%. Where a ceiling or a unit count could suffer from floating-point error, the engines use exact fractions or decimals.
- **Explained results:** every result carries its reason. Each allocation item has a rationale, and each gate rule reports its measured value against its limit. Each How to fix change names the rule it serves.

{@tbl:engines} lists the fifteen engines.

Table: Engines and what they compute {#tbl:engines}
| Engine | Computes | Section |
|--------------|----------------------------------------------|------|
| `scoring.py`, `contradictions.py` | Capacity and willingness scores, the risk tier, the maximum acceptable loss, contradictions X1 to X3 | 3.2 |
| `replay.py` | The value path of a model portfolio through a historical crisis | 3.2 |
| `allocation.py` | Proposal items in seven steps, with a reason for each | 3.3 |
| `metrics.py`, `stress.py`, `fees.py` | Volatility, maximum drawdown, weighted fee, liquid share, stress losses, fee cost over the horizon | 3.4 |
| `gate.py` | Rules R-01 to R-09 and the decision PASS, WARNING or REJECT | 3.5 |
| `quiz.py`, `chain.py` | The comprehension quiz and the advice-record hash chain | 3.6 |
| `projection.py` | Goal projections by seeded block bootstrap | 3.7 |
| `remedy.py` | How to fix: the smallest set of changes that passes the gate | 3.8 |
| `market.py`, `drift.py`, `rebalance.py` | The simulated market clock, drift from the agreed mix and rebalancing trades | 3.10 |

## 3.2 Risk Profiling

The questionnaire has ten questions: five on the capacity to bear risk (C1 to C5) and five on the willingness to take it (W1 to W5). Each option is worth 0 to 4 points, so each group scores 0 to 20 points, which are scaled to 0 to 100 in steps of 5. Each score maps to a tier by the bands of {@tbl:bands}.

Table: Score bands and risk tiers {#tbl:bands}
| Score | Tier | Label |
|:------:|:------:|----------------------|
| 0 to 20 | 1 | Conservative |
| 25 to 40 | 2 | Moderately conservative |
| 45 to 60 | 3 | Balanced |
| 65 to 80 | 4 | Growth |
| 85 to 100 | 5 | Aggressive |

The client's risk tier is the lower of the capacity tier and the willingness tier, after the replay adjustment:

> T = min( T_cap, max( 1, T_will − a_replay ) )

where a_replay is 1 only if the client chose "sell everything" at the lowest point of the historical replay, and 0 otherwise; it applies once. The answer to W4 sets the maximum acceptable loss used by rules R-08 and R-09: 5%, 10%, 20% or 30%.

**Contradictions.** Three rules detect answers that cannot all be true. X1: high growth (W3 or W5 answered "d") with money needed within a year (C2 "a"). X2: high growth with an acceptable loss of at most 5% (W4 "a"). X3: buying more after a 20% fall (W1 "d") with an acceptable loss of at most 5%. A profile with an open contradiction is saved with the status `needs_review`, and proposals then return 409 `CONTRADICTIONS_OPEN` until an answer changes (AT-04).

**Historical replay.** The tier's model portfolio is replayed month by month through a historical crisis: E1 (November 2007 to October 2009), E2 (2020) or E3 (2022). Starting from the amount V(0), the value after month t is

> V(t) = V(t − 1) × ( 1 + Σ_c w_c × r_c(t) )

where w_c is the weight of asset class c and r_c(t) its return in month t. The engine reports the path, the maximum drawdown, the lowest month and the end value. The client may start from their own amount, between CNY 10,000 and 10,000,000, so the path scales and the drawdown stays the same. The screen plays the episode month by month beside the real events of those months, such as the collapse of Lehman Brothers or the WHO pandemic declaration. It stops at the lowest month and asks, for example, "Your CNY 200,000 is now CNY 138,722. What do you do?". The reaction is therefore recorded at the worst moment, not after the recovery. The events are real; the portfolio path is illustrative.

**Worked example (AT-03).** The answers C1 b, C2 d, C3 c, C4 b, C5 d, W1 c, W2 c, W3 d, W4 c, W5 b give a capacity score of 70, a willingness score of 70 and tier 4. A "sell everything" reaction lowers the tier to 3.

## 3.3 Allocation

The allocation engine turns a tier, an amount A, a horizon H in years and a near-term need N into proposal items in seven steps:

1. **Base weights:** start from the tier's model portfolio ({@tbl:portfolios}).
2. **Horizon cap:** under 3 years, equity plus gold is capped at 20%. The excess is taken from equity first, then gold, and moved to bonds (to cash for tier 1).
3. **Liquidity floor:** cash must be at least ⌈N / A × 100⌉ percent, with the shortfall taken from the other classes pro rata. The ceiling is computed with exact fractions: in floating point, 7,000 / 100,000 × 100 is 7.000000000000001, which a plain ceiling would turn into 8.
4. **Rounding:** weights are rounded to whole percents, half up. A positive remainder goes to cash. A negative remainder comes out of the largest non-cash class, so rounding can never break the floor or the cap; the horizon cap is checked again after rounding.
5. **Product choice:** keep the products whose risk level is at most T, whose lock-up is at most H × 12 months and whose minimum investment fits the slot. Sort them by fee, then by liquidity days, then by code. When N is above zero, the cash slot uses liquid products only.
6. **Split:** a non-cash class above 40% is split between its two cheapest products, the first taking the odd percent.
7. **Empty class:** if no product qualifies, the class's weight moves to the cash item, and a note explains why.

Table: Model portfolios by tier (weights in percent) {#tbl:portfolios}
| Tier | Label | Cash | Bond | Gold | Equity |
|:----:|------------------|:----:|:----:|:----:|:----:|
| 1 | Conservative | 100 | 0 | 0 | 0 |
| 2 | Moderately conservative | 30 | 70 | 0 | 0 |
| 3 | Balanced | 15 | 50 | 10 | 25 |
| 4 | Growth | 10 | 30 | 10 | 50 |
| 5 | Aggressive | 5 | 15 | 10 | 70 |

Every item carries a reason in plain language, for example: "Bond is 50% of this mix, above the 40% limit for one product, so it is split between the two lowest-fee bond products that suit tier 3. This one charges 0.30% a year." After a revision, the reason records the change.

**Worked example (AT-06).** Tier 3, CNY 200,000 over 8 years with a near-term need of CNY 30,000 gives the items of {@tbl:alloc-example}. An exhaustive sweep of 75,750 allocations (every tier, horizons of 1 to 30 years, five amounts and needs from 0% to 100%) found no case that breaks the 100% total, the liquidity floor, the horizon cap, suitability or the 40% limit.

Table: Allocation for tier 3, CNY 200,000, 8 years, CNY 30,000 need {#tbl:alloc-example}
| Product | Asset class | Weight | Amount (CNY) |
|----------|----------|:----:|----:|
| DEP-01 | Cash | 15% | 30,000 |
| SBF-01 | Bond | 25% | 50,000 |
| SBF-02 | Bond | 25% | 50,000 |
| GLD-01 | Gold | 10% | 20,000 |
| IDX-01 | Equity | 25% | 50,000 |

## 3.4 Metrics, Stress Tests and Fees

The metrics are computed over the whole monthly history file, with the portfolio's monthly return r_p(t) = Σ_c w_c × r_c(t):

> σ_annual = stdev( r_p ) × √12

> MDD = max over t of ( P(t) − V(t) ) / P(t)

where V(t) is the product of ( 1 + r_p(s) ) over the months s ≤ t, and P(t) is the highest V(s) for s ≤ t.

The engine also computes the weighted fee Σ w × fee, the liquid share (the weight of products that can be redeemed within one day and have no lock-up) and the largest single non-cash weight. The sample standard deviation is used.

**Stress tests.** Each hypothetical scenario applies one shock per asset class ({@tbl:scenarios}). The loss is loss% = Σ_c w_c × shock_c, and the loss in CNY is A × loss%, with each class's contribution reported.

Table: Hypothetical stress scenarios {#tbl:scenarios}
| Scenario | Equity | Bond | Gold | Cash |
|------------------------|:----:|:----:|:----:|:----:|
| S1 Equity crash | −30% | +2% | +5% | 0% |
| S2 Rate rise of 2 points | −10% | −8% | −3% | +0.5% |
| S3 Combined crisis | −35% | −10% | +8% | 0% |

**Fee cost.** The cost of fees over the horizon is the difference between growing without and with the fee:

> fee cost = A × ( 1 + g )^H − A × ( 1 + g − f )^H

where f is the product's annual fee and g an assumed gross return for its class (cash 1.5%, bond 3%, gold 4%, equity 6%), used only to illustrate the cost and labelled "Hypothetical".

**Worked example (AT-08).** For the allocation of {@tbl:alloc-example}, the stress losses are CNY −12,000, −13,450 and −25,900 (−6.00%, −6.73% and −12.95%). The fee costs of SBF-01, SBF-02 and BND-01 for CNY 50,000 over 8 years are CNY 1,460.89, 1,941.26 and 2,418.36. The weighted fee is 0.25%, the liquid share 40% and the largest product 25%.

## 3.5 Compliance Gate

The gate evaluates nine rules on every proposal version ({@tbl:rules}). Six are hard rules: if any fails, the decision is REJECT. Three are soft rules: if any flags, the decision is WARNING, and the client must acknowledge each warning before Confirm. Otherwise the decision is PASS. The thresholds are data (`rules.json`). Every rule returns a detail, its measured value against its limit, for example "Largest non-cash product is 25%; the limit is 40%". A PASS therefore shows its reasons as clearly as a REJECT.

Table: Rules of the compliance gate {#tbl:rules}
| Rule | Type | Check |
|------|------|----------------------------------------------------------|
| R-01 | Hard | The item weights total 100 ± 0.01 (checked over the items, so a weight that never reached a product cannot pass) |
| R-02 | Hard | Every product's risk level is at most the client's tier |
| R-03 | Hard | Every non-cash product is at most 40% of the portfolio |
| R-04 | Hard | Liquid share × A ≥ N, compared in whole cents |
| R-05 | Hard | Under a 3-year horizon, equity plus gold is at most 20% |
| R-06 | Hard | Every lock-up is at most H × 12 months |
| R-07 | Soft | The weighted fee is at most 1.00% |
| R-08 | Soft | The historical maximum drawdown is within the client's maximum acceptable loss |
| R-09 | Soft | The worst stress loss is within the client's maximum acceptable loss |

**Regulatory basis.** Every rule names the requirement it is designed to meet ({@tbl:rule-basis}), shown as a chip on the gate panel, in the console and in the chat's rule card. The mapping was prepared by the team for this sandbox and is labelled as not legal advice.

Table: Regulatory basis of the rules {#tbl:rule-basis}
| Rule | Basis |
|----------|------------------------------------------------------------|
| R-01, R-03 | Aegis integrity control and diversification limit |
| R-02 | Guiding Opinions, Art. 23: AI must follow the suitability rules [@cn-amgo]; CSRC Suitability Measures: product-investor matching [@cn-suit]; MiFID II Art. 25(2) [@mifid2] |
| R-04, R-05, R-06 | Commission Delegated Regulation (EU) 2017/565, Art. 54(4) and 54(5): the client's financial situation, including liquid assets, and holding period [@eu-2017-565] |
| R-07 | MiFID II Art. 24(4): costs and charges disclosed in good time; the Aegis 1.00% fee ceiling |
| R-08, R-09 | MiFID II Art. 25(2): ability to bear losses; CSRC Suitability Measures: risk-tolerance assessment |

{@fig:gate} shows the gate as part of a proposal's path to execution, as a UML activity diagram [@uml]. Each action shows, in parentheses, who performs it. Every version, whether the client or the agent created it, is evaluated and saved with its result. A REJECT stops the path: How to fix is offered, and applying it creates a new version that goes round again. Only the client's quiz and Confirm lead to a token, and execution still checks the token, the items and the compliance switches.

![The compliance gate and the path to execution {#fig:gate}](diagrams/fig-3-1-gate-activity.png)

## 3.6 Confirmation, Execution and the Record Chain

**Quiz.** Three questions are built from the proposal itself: its worst stress loss, a statement about its risk, and the amount that can be withdrawn within a day. The order of the options rotates with the proposal's identifier. A wrong answer explains why it is wrong, and the latest attempt decides.

**Confirm.** Confirmation needs a proposal with the status `passed` or `acknowledged` and a passed quiz. It issues a random token (`secrets.token_urlsafe(32)`), stores only its SHA-256 hash with a five-minute expiry and the hash of the items, and returns the token once.

**Execute.** Execution checks, in this order: `TOKEN_INVALID`, `TOKEN_EXPIRED`, `TOKEN_USED`, `STATE_CONFLICT` (the items changed, or the proposal is no longer open) and `INSUFFICIENT_CASH`. While the compliance officer has halted execution, it refuses with `EXECUTION_HALTED`, even for a token issued before the halt. It then claims the token with a compare-and-set update, so that two concurrent requests cannot both use it. In one transaction it places the orders, updates positions and cash, marks the proposal executed, writes the advice record and logs everything. Units are floored to four decimals:

> units = ⌊ amount / NAV × 10,000 ⌋ / 10,000

**Advice record chain.** Each advice record holds the profile, the full proposal, the gate result, the quiz attempt, the disclosures shown, the time of consent and the orders. Records are chained by hash, in the manner of time-stamping by linking [@haber]:

> h(n) = SHA-256( h(n − 1) ‖ canonical( content(n) ) ), with h(0) = 64 zeros

where canonical means JSON with sorted keys, compact separators and unescaped Unicode. Verification recomputes the chain and names the first record whose hash differs (AT-11). Database triggers also block updates and deletions of records, so the application cannot rewrite them.

## 3.7 Goal Projection

"Will this reach my goal?" is answered by a seeded Monte Carlo simulation over the monthly history file:

- **Block bootstrap:** 1,000 paths are simulated. Each simulated year is twelve consecutive months drawn from a random start, so crisis months stay together. Drawing single months would scatter them and understate the falls [@efron; @kunsch]. The portfolio's monthly return is Σ_c w_c × r_c(t) − f / 12, net of the weighted annual fee f, and a monthly contribution m is paid in at the end of each month.
- **Fast and exact:** each block is precomputed once. G, the product of ( 1 + r ) over its twelve months, is the growth of money held through it, and S, the sum over each month k of the product of ( 1 + r_j ) over the months j after k, is the end value of 1 paid in each month. One simulated year is therefore V' = V × G + m × S, and 1,000 paths of 30 years cost 30,000 multiply-adds.
- **Reproducible:** path p draws its blocks from the mulberry32 generator seeded with 20,261,016 + p. The same question always gets the same answer, a longer horizon extends each path instead of reshuffling it, and alternatives such as another tier or contribution are compared on the same draws. The mock API ports the generator and gets the same numbers.
- **Outputs:** the 10th, 25th, 50th, 75th and 90th percentiles for each year, the chance of reaching the target, the chance of ending below the money paid in, and the median shortfall in the paths that miss. Each path's end value is linear in the contribution, V(H) = A + m × B, so the contribution needed for a 50%, 75% or 90% chance is exact: the nearest-rank quantile of max( 0, ( target − A ) / B ) across the paths.
- **Basis:** a proposal, the live sandbox portfolio or a tier's model mix. Every answer also runs the same goal at all five tiers, with the tiers above the client's marked as not suitable: more risk can raise the typical outcome and deepen the bad one, and the gate still decides what the client may hold.

**Worked example.** The tier 3 mix (cash 15%, bond 50%, gold 10%, equity 25%, fee 0.25%), with CNY 200,000 for 8 years against a CNY 260,000 target, ends at the percentiles of {@tbl:projection}. The chance of reaching the target is 22.5%, the chance of a loss 8.9% and the median shortfall CNY 27,265.66. Monthly contributions of CNY 186, 386 or 603 would lift the chance to 50%, 75% or 90%. Every projection is labelled "Illustrative: resampled from synthetic history, not a forecast".

Table: Projected end values for the worked example (CNY) {#tbl:projection}
| P10 | P25 | P50 | P75 | P90 |
|:----:|:----:|:----:|:----:|:----:|
| 203,151.96 | 221,238.15 | 240,303.08 | 257,594.43 | 271,772.18 |

## 3.8 How to Fix

When the gate rejects or warns, How to fix returns the smallest set of changes that gets the proposal through. This is a counterfactual explanation computed by code, the "what would have to change" form of explanation [@wachter]. The repairs run in a fixed order, each the way the allocation engine itself would make it:

1. **R-02, R-06:** a product above the tier, or locked beyond the horizon, is swapped for the lowest-fee eligible product of the same class (bonds, then cash, when the class has none).
2. **R-01:** the weights return to 100%: a shortfall goes to cash, and an excess is trimmed from illiquid products first. This step runs again at the end.
3. **R-05:** under 3 years, equity and gold above 20% move to bonds, equity first.
4. **R-03:** a non-cash product above 40% sends its excess to the next eligible product of its class, then to bonds, then to cash.
5. **R-04:** cash that can be withdrawn within a day rises one point at a time until it covers the near-term need.
6. **R-07 (soft):** the most expensive products are swapped for cheaper ones of the same class until the weighted fee is within the limit.
7. **R-08, R-09 (soft):** 5 points at a time move from equity, then gold, to bonds until the drawdown and the worst stress loss are within the client's limit.

Eligible means what step 5 of the allocation engine allows. Weight is taken first from products the fix itself added, then from the most expensive ones. Every change records the rule it serves and why, and the whole gate then runs again on the result. The response gives the decision and the failed rules before and after, each change, the new items and their metrics. A fixed repair order was chosen over an optimiser so that each change can be explained by the rule it serves. Applying the fix is an ordinary revision, so the gate runs once more and the version history keeps it.

**Worked examples.** The 60% index fund of AT-07 becomes DEP-01 9%, SBF-01 40%, SBF-02 21%, GLD-01 5% and IDX-01 25%, turning REJECT into PASS. A sweep of 8,000 random allocations left no REJECT after the fix.

## 3.9 What-if Preview, Briefing and Live Analytics

- **What-if preview:** the same engines and the whole gate run on draft weights, and nothing is saved. The What-if lab calls the preview as the sliders move, so the client sees the verdict, the metrics and the stress losses change with each weight. "Save as version N+1" is an ordinary revision.
- **Daily briefing:** up to seven insights are computed by code from the client's own data, in a fixed order. They cover the goal's chance, fees over the horizon, cash for the near-term need, the worst stress scenario against the client's limit, the rule closest to its limit, what the crisis replay taught, and uninvested cash. Each insight links to where its figure comes from, and the response states that the AI did not write it.
- **Live analytics:** the executed portfolio's class weights, weighted fee, largest position and stress losses, shown on the account's Risk and goal tab.

## 3.10 The Monitoring Loop

The monitoring loop adds a simulated market, drift from the agreed mix and rebalancing that still goes through the gate and the client's own Confirm.

**Market clock.** One row stores the number of months replayed. Only the compliance officer can move it, by 1 to 12 months at a time, with a logged reason. The k-th advance applies the k-th month of the illustrative history counted from March 2009, wrapping after September 2026. Every product's net asset value is recomputed from its base value each time, so rounding never accumulates:

> NAV(k) = round4( NAV(0) × product over i = 1 … k of ( 1 + r_class(i) ) )

Month k is dated the last day of the k-th month after 30 September 2026. Positions are valued, and new orders filled, at the simulated price, and nothing trades when the clock moves.

**Drift.** The target is the latest executed proposal, the mix the client last agreed to. For each asset class c with live value V_c out of a total V:

> w_c = V_c / V × 100, drift_c = w_c − T_c (in points), portfolio drift = ½ × Σ_c | drift_c |

A class is outside its band when its drift is more than 5 points (`drift_band_pp` in `rules.json`), a threshold-based approach used in practice [@swedroe]. The band is disclosed beside every drift figure, as FINRA's report on digital advice recommends [@finra-dia]. The whole gate also runs on the live weights, with today's profile and the target's horizon and need. A holding at the 40% limit can therefore fail R-03 after an equity rally, and a product above a tier the client has since lowered fails R-02. The status of a portfolio is `rule_breach` when a hard rule fails, `drifted` when a class is outside its band or a new warning appears, and `on_target` otherwise.

**Rebalancing trades.** Each product's goal is its target weight times the live value. A product above its goal sells the excess, one below buys the gap, and one the target no longer holds sells every unit. Units are floored to four decimals at the current price, and gaps under CNY 1 are left alone. Sales come first and fund the purchases; the account's cash covers the cents that rounding leaves.

**The rebalancing proposal.** A rebalancing is the next version of the executed proposal, built through the same `persist()` as any proposal, so the gate runs on it and How to fix applies when it fails. The Hong Kong SFC treats auto-rebalancing as a recommendation subject to the suitability requirement [@hk-sfc-odap], and Aegis applies the same treatment. The trades are stored with the market month and a hash of the holdings they were priced on. Once the market moves or the holdings change, the rebalancing is stale: Confirm, Execute, revisions and How to fix refuse it with 409 `STATE_CONFLICT`, and the client proposes a fresh one. A rebalancing with nothing to trade is refused. {@fig:monitoring} shows the loop. Nothing in it runs on a schedule or a condition: drift raises alerts and a briefing, and only a person, or the agent at tier T2, proposes.

**Worked example.** The mix of {@tbl:alloc-example} after six months of the 2009 rally (equity +38.75%, bonds +3.86%) is worth CNY 226,295.10. Equity is at 30.66%, 5.66 points over its target and outside the band, and bonds are at 45.89%. The portfolio drift is 5.80%, and R-08 newly fails. The rebalancing sells 122.8953 units of GLD-01 (CNY 326.41) and 2,672.5613 units of IDX-01 (CNY 12,800.50), then buys DEP-01, SBF-01 and SBF-02 for CNY 13,126.93. Afterwards every class is within 0.01 points of its target.

![The monitoring loop {#fig:monitoring}](diagrams/fig-3-2-monitoring-activity.png)
