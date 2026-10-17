# Aegis Wealth AI: the monitoring loop

October 2026. The v2 plan ([aegis-v2-plan.md](aegis-v2-plan.md)) listed a monitoring loop as a follow-up: simulated
market moves, drift alerts and rebalancing proposals. The market is moving towards AI agents that act on conditions.
Aegis should show supervised monitoring without giving the AI an execution path. Part 1 is the research, Part 2 the
design, Part 3 the work and its quality gates, and Part 4 records what was built.

## Part 1: Research

### 1.1 Agents that act on conditions

- **Robinhood Agentic Trading** (beta from 27 May 2026, for all customers from 29 Sep 2026) lets outside agents trade
  through MCP. Agents run in a dedicated account with user-set limits, an optional manual-approval step, trade previews
  and push notifications. "Loops" let an agent watch the market and trade when conditions are met while the user is
  away. Coverage stresses that the customer is liable for the agent's trades. ([Finovate][finovate], [Fortune][fortune])
- **China's fund advisory pilot** (CSRC, October 2019) allows a *managed* advisory service in which the adviser
  rebalances for the client within the authority the client signed. The 2023 draft rules make the pilot permanent and
  add an explicit fiduciary duty. ([NBD][nbd], [JunHe][junhe])

### 1.2 What regulators expect of rebalancing

| Source | What it says | What Aegis takes from it |
| --- | --- | --- |
| HK SFC, *Guidelines on Online Distribution and Advisory Platforms* (effective 6 April 2019), Ch. 4, robo-advice | Auto-rebalancing "would generally be regarded as a recommendation" and triggers the suitability requirement. Keep effective rebalancing practices, and warn a client who opts out that the portfolio may become unsuitable. ([SFC briefing, slides 10 and 12][sfc-briefing], [Gazette][sfc-gazette]) | A rebalancing is a new proposal version that goes through the nine-rule gate against the client's **current** tier, like any recommendation |
| FINRA, *Report on Digital Investment Advice* (March 2016), "Rebalancing", p. 11 | Establish the customer's intent, show cost implications, disclose how rebalancing works (including any drift threshold and whether it varies by class), and set how the tool acts in a major market movement. One firm used a 3% portfolio-drift trigger, checked daily. ([FINRA][finra-dia]) | The band is one number in `rules.json`, shown beside every drift figure. Nothing rebalances without the client's own request and Confirm. Trades priced before the market moved cannot execute |
| CN 2018 Guiding Opinions, Art. 23 (already mapped) | Separate accounts, disclosure of the algorithm's limits, and manual intervention if AI causes herd behaviour | The AI can only *propose*. The compliance switches still stop every proposal and order |

### 1.3 How drift is measured in practice

- **Threshold (band) rebalancing.** Rebalance when a class leaves a band around its target, not on a calendar. The most
  cited band is 5 percentage points. Swedroe's "5/25 rule" uses 5 points or 25% of the target, whichever is smaller,
  so small classes get a tighter band (2.5 points on a 10% class). ([A Wealth of Common Sense][swedroe])
- **Portfolio drift.** Half the sum of the absolute class deviations: the share of the portfolio that sits in the wrong
  class, and so the least that must be traded to restore the class targets. FINRA's 3% trigger is of this kind.

Caveat: the 5/25 rule and the band sizes come from practitioner sources. They set direction, not law.

## Part 2: Design

### 2.1 The loop

1. **Clock.** The compliance officer advances a simulated market by 1 to 12 months, with a logged reason. Each month
   replays one month of the illustrative history. Every product's NAV moves by its asset class's return for that
   month.
2. **Detect.** For each client with positions, code compares the live class weights with the target of the latest
   executed proposal. It flags any class more than the band (5 points) from target, and runs the full gate on the live
   weights to find rules the holdings now fail (R-03 after an equity rally, R-05 for a short horizon).
3. **Surface.** The client sees a briefing insight and a drift panel on the account screen. The officer sees an alert
   in the Control Room and a Monitoring tab with every client's drift.
4. **Propose.** The client clicks *Propose rebalancing*, or the advisor calls `propose_rebalance` (T2). Code builds the
   trades back to target and saves them as the next version of the executed proposal, and the gate runs. If the gate
   rejects it (for example, the client's tier fell since), How to fix applies as for any proposal.
5. **Confirm.** Execution still needs the comprehension quiz, the client's Confirm click and the one-time token. The AI
   has no execution tool at any tier.

There is no background job and no auto-trading. Drift is computed when a screen asks for it, so the state is always
current and nothing acts on its own.

### 2.2 Decisions

- **Replay start.** The clock replays the history from March 2009, the start of the post-crisis rally, so a short
  demo shows drift. After 6 months the demo client's equity is 5.66 points over target. The start is in
  `data/market.json`, labelled illustrative. The clock wraps to the start of the history after September 2026.
- **NAV path.** NAV after *k* months = base NAV × Π(1 + r), rounded half away from zero to 4 decimals. It is computed
  from the base NAV each time, not month on month, so rounding never accumulates and the mock gets the same figures.
- **One band.** 5 points per class (`drift_band_pp` in `rules.json`). The 5/25 relative band was considered and left
  out to keep one disclosed number. Portfolio drift is reported beside it, without a trigger of its own.
- **Target.** The latest executed proposal is the mix the client last agreed to, and a rebalancing restores all
  holdings to it. After a rebalancing executes, that proposal becomes the target, with the same weights.
- **Trades.** Sell what is over target, then buy what is under. Units are floored to 4 decimals, as at execution.
  Trades under CNY 1 are skipped. Sales fund the purchases, and the account's cash covers any cents left over.
- **Priced once.** A rebalancing is priced at one market month and one set of holdings. If either changes, Confirm and
  Execute refuse it with `STATE_CONFLICT` and the client proposes a fresh one. This is the "major market movement"
  policy FINRA asks for.
- **Horizon.** The clock moves prices, not the calendar of the plan. Horizons and near-term needs stay as agreed (a
  limitation, noted below).
- **Agent.** `check_drift` (T1, read-only) and `propose_rebalance` (T2, through the gate). The model sees drift and
  trades as tool results. Every figure it states is checked like any other.

### 2.3 Not in scope

Automatic drafting of rebalancing proposals when drift is detected, glide paths that shorten the horizon as simulated
time passes, tax-aware trading, and rebalancing through new contributions.

## Part 3: The work

| Area | What |
| --- | --- |
| Data | `market.json` (replay start, label); `drift_band_pp` in `rules.json`; two frameworks and controls in `regulations.json` |
| Engines (pure) | `engines/market.py` (clock, NAVs, dates, monthly moves), `engines/drift.py` (class and product drift, portfolio drift), `engines/rebalance.py` (trades back to target) |
| Services | `services/market.py` (state, officer-only advance), `services/monitoring.py` (client view, officer overview, alerts, rebalancing proposals, the stale-price guard); execution places sell orders |
| API | `GET/POST /api/compliance/market[/advance]`, `GET /api/compliance/monitoring`, `GET /api/monitoring`, `POST /api/proposals/rebalance`; `Proposal.rebalance`, `Order.side` |
| Agent | `check_drift` (T1) with a drift card, `propose_rebalance` (T2); fallback answers for drift questions |
| Surfaces | Briefing insight, Control Room alert and Monitoring tab, account Risk and goal tab, proposal workspace and Confirm screen for a rebalancing |
| Mock | The three engines ported with the same results; every new endpoint; checks in `scripts/verify.ts` |

Quality gates: backend tests for the clock, drift, alerts, rebalancing and permissions (officer-only advance, client
ownership); the whole suite, `ruff check` and `ruff format --check`; frontend lint, type check, build and
`scripts/verify.ts`; OpenAPI and types regenerated; the changed screens checked in the browser in light and dark mode;
README, technical documentation, contract changes and security self-assessment updated.

## Part 4: As built (17 October 2026)

Parts 2 and 3 are built. Where the build differs from the plan or goes further:

- **An empty rebalancing is refused.** Running the mock's loop end to end showed that asking to rebalance
  a portfolio already on target saved a rebalancing that traded nothing. Both the API and the mock now
  answer 409 STATE_CONFLICT ("there is nothing to trade"), and the advisor says so.
- **The shelf and the top bar follow the clock.** Products show the simulated NAV of the current month.
  `GET /api/health` reports that NAV date and the market month, so the top bar reads *"Simulated market
  · NAV 31 Mar 2027"* once the market has moved.
- **More fields than planned.** A rebalancing carries the band it was priced against (`band_pp`), so its
  drift chart needs no hard-coded number, and proposal summaries and cards carry `kind` so lists can show
  a rebalancing.
- **Evidence.** The evidence run gains Scenario 6 (15 steps: the officer moves the market, Rina's
  portfolio drifts, the alert, the advisor's rebalancing with no order, a stale rebalancing refused, a
  fresh one executed), and the performance run times the three new read endpoints.
- **The drift chart** is one row per class on a shared scale: the band shaded, the target as a tick and
  today's weight as a dot in the class's colour, with the figures written beside it. The band's fill was
  made translucent ink after the dark-mode check showed it faint on the dark surface.

Results against the quality gates:

| Gate | Result |
| --- | --- |
| Backend tests | 196 passed (23 new: the clock, drift and trades, and the API end to end); `ruff check` and `ruff format --check` clean |
| Permissions | Only the officer reads or moves the clock (a client gets 403, an anonymous caller 401, bad input 422) and every advance is logged with its reason; another client's rebalancing is 403 at every step; the advisor's `execute_rebalance` is refused as T3 |
| Mock parity | 50 checks in `scripts/verify.ts` (11 new): the monthly history equals the backend's CSV value for value, then NAVs, dates, exact units, drift, trades and totals. The mock API's whole loop, run through MSW, gives the backend's trades unit for unit |
| Frontend | Lint, type check and production build clean (16 routes); OpenAPI (54 operations) and the types regenerated |
| Browser | The briefing, the account's Risk and goal tab, the proposal workspace, Confirm, the success view, the advice record, the chat cards and the Control Room's Live and Monitoring tabs, in light and dark mode; the account and the chat at 375 px with no page-level horizontal scroll; the mock build's Monitoring tab and advance dialog |
| Evidence | 56 scenario steps, all as specified; red-team 30/30 PASS, unchanged; performance PASS (the monitoring endpoints under 3 ms at p95) |

[finovate]: https://finovate.com/robinhood-lets-agents-trade-stocks-and-make-payments/
[fortune]: https://fortune.com/2026/09/29/robinhood-trading-agents-hood-openai-anthropic/
[nbd]: https://www.nbd.com.cn/articles/2019-10-28/1381683.html
[junhe]: https://www.junhe.com/legal-updates/2205
[sfc-briefing]: https://www.sfc.hk/web/EN/files/PCIP/Other%20publications%20and%20information%20sources/Industry_briefing_Guidelines_on_Online_Distribution_and_Advisory_Platforms_Apr_and_May_2018.pdf
[sfc-gazette]: https://www.gld.gov.hk/egazette/pdf/20182214/egn201822142403.pdf
[finra-dia]: https://www.finra.org/sites/default/files/digital-investment-advice-report.pdf
[swedroe]: https://awealthofcommonsense.com/2014/03/larry-swedroe-525-rebalancing-rule/
