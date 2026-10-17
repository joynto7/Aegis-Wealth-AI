# Aegis Wealth AI v2: research and upgrade plan

October 2026. v1 already does the full advisory run (profile, replay, proposal, gate, quiz, confirm,
execute, record) with a researched interface and an AI Control Room. This plan covers what v2 adds
and why. Part 1 is the research, Part 2 the gaps it shows in v1, Part 3 the work, Part 4 the order
and the quality gates.

The competition scores task completion (40%), security and compliance (30%), and innovation and
interaction (30%). Each v2 feature below names the score it serves.

## Part 1: Research

### 1.1 What the market shipped in 2026

- **Robinhood trading agents (29 Sep 2026).** Agents for all customers, on OpenAI and Anthropic
  models. The guardrails: a dedicated trading account for the agent, a user-set cap per trade, and an
  optional final approval step. "Loops" let an agent trade on conditions while the user is away.
  Critics raise liability, systemic risk from herding agents, and cost. ([Fortune][fortune],
  [Yahoo Finance][yahoo-liability])
- **Brokers opened to outside agents through MCP.** Robinhood released an MCP tool in May 2026;
  eToro, Public and Coinbase also accept MCP agent connections. ([Robinhood][rh-agents],
  [Fortune][fortune])
- **Ant Group's Maxiaocai** (Alipay, Ant Fortune): market insights, plain explanations of terms,
  personalised suggestions and visual summaries of financial reports. ([Ant Group][ant])
- **Robo-advisors** lead with goal planning (Wealthfront's Path) and automation. Betterment adds
  friction to selling: it shows the cost before a sale, and reports that clients shown a tax cost of
  US$5 or more were 62% less likely to go ahead (company figure). ([Investing in the Web][iitw],
  [Wealth Professional][wp-nudge])

**What this means for Aegis.** The market is moving towards AI that acts. The open questions
(liability, oversight, herding) are the ones Aegis already answers by construction: the AI cannot
execute, every proposal goes through the gate, and a human can stop it. v2 should make that
participation more visible, more measurable and easier to supervise. It should not give the AI an
execution path.

### 1.2 Rules in force or coming

| Source | What it asks | Status |
| --- | --- | --- |
| China, *Measures for Labelling AI-Generated Synthetic Content* (CAC and three other agencies) and the mandatory national standard | **Explicit labels** that users can see, in the content or the interface, and **implicit labels** in the file metadata; logs kept for at least 6 months when unlabelled output is supplied | In force since 1 Sep 2025 ([CAC][cac], [PwC][pwc-label]) |
| CSRC, *Capital Market FinTech Development Plan 2026–2030* | Robo-advice brought into regulated development: **algorithm filing**, information disclosure, suitability management; encourages a **"human + AI"** advisory model | Published Mar 2026 ([Sina][sina-plan]) |
| CSRC, Lujiazui Forum and Technology Supervision Dept. | AI guidelines for capital markets to follow; **graded supervision** of AI uses; **clear labelling** of AI content; black-box and hallucination risks named | Jun 2026 ([CNR][cnr], [10jqka][10jqka]) |
| EU AI Act, Art. 50 | Tell people they are dealing with an AI; mark AI-generated content in a machine-readable way | Applies since 2 Aug 2026 ([Goodwin][goodwin], [Jones Walker][joneswalker]) |
| EU Digital Omnibus, Reg. (EU) 2026/1744 | Moves the Annex III high-risk deadline to 2 Dec 2027; Art. 50 unchanged | In force 27 Jul 2026 ([Gibson Dunn][gibsondunn]) |
| Hong Kong SFC circular on generative AI language models | Investment advice or recommendations by an AI model is a **high-risk use**: management oversight, human review, testing, continuous monitoring, disclosure to clients | In force since 12 Nov 2024 ([A&O Shearman][aos], [Clifford Chance][cc]) |
| FINRA 2026 Regulatory Oversight Report | Agent risks: autonomy and scope creep, **auditability of multi-step chains**, data handling, domain expertise, misaligned incentives. Controls: keep prompt and output logs, **track the model version used**, human-in-the-loop review, guardrails, track agent actions | Dec 2025 ([Debevoise][debevoise], [DLA Piper][dla]) |
| OWASP Top 10 for Agentic Applications 2026 (ASI01–ASI10) | Goal hijack, tool misuse, identity and privilege abuse, supply chain, code execution, memory poisoning, inter-agent communication, cascading failures, human-agent trust exploitation, rogue agents | Dec 2025 ([OWASP][owasp]) |

**What this means for Aegis.** v1 maps its controls to the 2018 Guiding Opinions, the CSRC
suitability measures and MiFID II. Four requirements above are new and buildable in a sandbox: label
AI output explicitly and in metadata, file the algorithm (a fingerprinted configuration tied to every
reply), supervise AI output with a human review queue, and make every multi-step agent run
reconstructable as a trace.

### 1.3 Interface patterns

- **Decision-first dashboards.** Fewer modules, each explained; charts that say what they show;
  personalised views that leave the user in control. ([Kindgeek][kindgeek], [Yellow Slice][yellowslice])
- **AI as an experience layer, not a chat box.** Generative UI from a controlled catalogue of
  components; **confirmation gates that scale with risk**; streaming state; trust indicators; error
  recovery. ([CopilotKit][copilotkit], [Agentic Wire][agenticwire], [Lazarev][lazarev])
- **Trust mechanics in chat.** Verifiable citations, visible process phases, honest uncertainty,
  feedback capture, and screen-reader live regions for streamed content.
  ([Setproduct][setproduct-chat], [The Frontkit][frontkit])
- **Reference products.** Linear (dark-first, hierarchy by luminance rather than colour, Inter with
  stylistic sets), Mercury (violet-tinted near-black canvas, one indigo accent per section), Ramp
  (data-forward layouts). ([Mercury analysis][mercury], [Linear analysis][linear])
- **Goal projections.** Monte Carlo probability of success with percentile bands; show the
  **magnitude of a shortfall**, not only the success rate; compare the probability across risk
  levels. ([CFA Institute][cfa], [Capital Preferences][capprefs], [Morningstar][morningstar])
- **Counterfactual explanations.** Explain an automated decision by "what would need to change".
  ([KPMG][kpmg], [Swansea, AISB 2023][swansea])
- **Agent traces.** OpenTelemetry GenAI conventions name the spans of an agent run: `invoke_agent`,
  `chat`, `execute_tool`; prompt capture is opt-in. ([Dash0][dash0], [Greptime][greptime])

Caveat: many interface sources are agency and vendor blogs, and several regulatory summaries are law
firm notes rather than primary texts. They set direction; the regulatory mapping in the product stays
labelled "not legal advice".

## Part 2: Gaps in v1

| Area | v1 | Gap | v2 answer |
| --- | --- | --- | --- |
| Planning | Allocation, metrics, stress, fees | No answer to "will this reach my goal?" | Goal planner: seeded Monte Carlo, probability, percentile fan, shortfall size, tier comparison |
| Explaining a REJECT | Each rule's measured value against its limit | The client must work out the fix alone | **How to fix**: the smallest change that passes, computed by code, applied in one click as a new version |
| Revising | A form that saves a version | No feedback until saved | **What-if lab**: weight sliders with a live dry-run of the gate |
| Dashboard | Value, journey, tier, proposal, activity | No insight into what the numbers mean | **Briefing**: insights computed by code, each with its numbers and a link |
| AI labelling | "Claude · checked" or "Template answer" | No explicit AI label, no machine-readable mark | **Provenance** on every reply: visible label, metadata, response headers, content hash |
| Algorithm filing | Model disclosure with prompt and tool hashes | Replies not tied to the configuration that wrote them | **Configuration fingerprint** recorded on every turn and shown on every reply |
| Human oversight | Suspend and halt switches, live feed | No supervision of individual AI outputs | **Review queue**: turns flagged automatically, cleared or escalated by the officer, all logged |
| Auditability | One log entry per turn | The steps inside a turn are not reconstructable | **Agent trace**: spans named after the OpenTelemetry GenAI conventions, shown as a waterfall |
| Threat detection | The broker and gate stop attacks | Attempts are not surfaced as such | **Threat signals** on each message (goal hijack, prompt extraction, execution request, cross-client, obfuscation), in the review queue |
| Monitoring | Counts | No alerting | **Alerts** derived from the log: repeated denials, AI proposals rejected, grounding fallbacks, high-severity signals |
| Client feedback | None | No way to say an answer was wrong | **Feedback** on every reply; a thumbs-down flags the turn for review |
| Live portfolio | Positions and orders | No stress or projection of what the client holds | Stress and goal projection on the account screen |

## Part 3: The work

### A. Engines and services (task completion; security and compliance)

1. **Goal projection** (`engines/projection.py`). Block bootstrap over the monthly history: 12-month
   blocks keep crisis months together. Monthly fee drag, optional monthly contribution, 1,000 paths,
   a seed derived from the inputs so the same question gets the same answer. Returns yearly P10, P25,
   P50, P75 and P90; the probability of reaching the target; the probability of ending below the
   amount invested; the median shortfall in the paths that miss; and the probability for each tier's
   model portfolio. Labelled "Illustrative, resampled from synthetic history; not a forecast".
   - `POST /api/projections`: from a proposal (T1, owner only), the live portfolio, or a tier's model
     portfolio.
   - Agent tool `project_goal` (T1) with a `projection` card.
2. **How to fix** (`engines/remedy.py`). For each failed rule, a deterministic repair in a fixed
   order: unsuitable products (R-02) and lock-ups (R-06) swap to the cheapest eligible product in the
   same class; concentration (R-03) caps at 40% and moves the excess within the class; the horizon cap
   (R-05) and the liquidity floor (R-04) move weight as the allocation engine does; the total (R-01)
   is normalised; soft rules (R-07 to R-09) shift equity to bonds in 5-point steps. The whole gate then
   runs again on the result. Returns each change with the rule it fixes and the resulting verdict.
   - `GET /api/proposals/{id}/remedy`. Applying it is an ordinary revision, so the gate runs and the
     version history keeps it.
   - Agent tool `suggest_fix` (T1, read-only) with a `remedy` card and an **Apply** button: the agent
     proposes, the client approves.
3. **Dry run** `POST /api/proposals/{id}/preview`: metrics, stress and the full gate for a set of
   weights, saving nothing. Powers the what-if lab.
4. **Insights** `GET /api/insights`: fee cost over the horizon, how many times cash covers the
   near-term need, worst stress loss against the client's limit, the rule closest to its limit, the
   replay lesson, goal probability. Computed by code, each with its numbers and a link.
5. **Account analytics**: stress and projection of the live positions (`GET /api/sandbox/analytics`).

### B. AI governance (security and compliance; innovation)

1. **Provenance and labelling.** Every reply carries `provenance`: label (AI-generated, checked
   template or system notice), generator, model, mode, configuration fingerprint, SHA-256 of the
   text, time, and the rules it follows (China's labelling measures, EU AI Act Art. 50). The chat
   endpoints send `X-AI-Generated` and `X-AI-Content-SHA256`. The chat opens with a notice that the
   client is talking to an AI.
2. **Configuration fingerprint.** SHA-256 over the system prompt, tools, model, effort, grounding
   policy and the versions of the rules, portfolios and assumptions. Written to every `agent_turn`,
   shown in the model disclosure and on every reply.
3. **Threat signals** (`agent/threats.py`). Pattern rules tag each message: goal hijack, prompt
   extraction, execution request, cross-client request, role-play jailbreak, obfuscation, pressure.
   Defence in depth only: the broker and the gate stay the controls. Target: at least 90% of the 30
   red-team prompts flagged, fewer than 10% of ordinary questions.
4. **Agent trace.** Spans for each turn named after the OpenTelemetry GenAI conventions
   (`invoke_agent`, `chat`, `execute_tool`, plus `aegis.gate` and `aegis.grounding`), with durations,
   tier, decision and token use when the model reports it. Prompts are not captured.
5. **Review queue.** A turn is flagged when it has a medium or high threat signal, a broker denial,
   an AI proposal the gate rejected, a grounding rewrite or fallback, or a client thumbs-down. The
   officer clears or escalates it with a note; each decision is an append-only log entry.
   `GET /api/compliance/reviews`, `GET /api/compliance/turns/{id}`, `POST /api/compliance/reviews/{id}`.
6. **Client feedback** `POST /api/chat/feedback` (up or down, optional reason).
7. **Alerts**, computed from the log on each Control Room refresh.
8. **Regulatory map v2**: the six sources in 1.2 added to `regulations.json`, each mapped to a control
   with a live check.

### C. Design system 2.0 (innovation and interaction)

- Keep the identity (ink navy, indigo action, violet gradient for the AI only, status colours only for
  verdicts) and refine it: an elevation scale, motion tokens, a glass surface for overlays, Inter's
  stylistic sets, tabular figures, a one-hue ramp for projection bands.
- `motion` for entrance and layout transitions, `@number-flow/react` for figures that change. All
  motion off under `prefers-reduced-motion`.
- New components: animated figure, sparkline, fan chart, probability ring, slider, segmented
  control, AI label, provenance popover, "Ask about this" button, trace waterfall, insight card.

### D. Screens (innovation and interaction; task completion)

1. **Proposal workspace**: what-if lab (sliders, live gate, save as a version), How to fix panel
   with a diff and Apply, a projection tab, "Ask about this" on every rule.
2. **Goal planner** (new): presets, target, years, starting amount, monthly contribution;
   probability ring, fan chart with the target line, good, typical and bad outcomes, shortfall size,
   probability by tier with tiers above the client's locked.
3. **Dashboard**: a bento layout with the briefing, a goal card, and animated figures.
4. **Chat**: AI notice and labels, provenance popover, a live step timeline (thinking, tools with
   tiers, gate, number check), projection and remedy cards, feedback, suggestions for the current page.
5. **Control Room**: tabs for Live (KPIs, alerts, feed), Review queue, and Governance (checklist
   with OWASP ASI and labelling, configuration fingerprint, disclosure); a turn inspector with the
   trace waterfall, threat signals and provenance.
6. **Account**: stress and projection of the live portfolio.
7. **Log-in and the rest**: polish through the shared components.

### E. Mock parity

The mock API (`NEXT_PUBLIC_API_MOCK=1`) gets the new endpoints. The projection engine is ported with
the same pseudo-random generator, so the mock gives the same numbers; `scripts/verify.ts` checks them.

### F. Quality and documentation

Backend tests for every engine, endpoint and permission; lint, type check and build for the frontend;
every changed screen checked in the browser in light and dark mode and at phone width; OpenAPI and
frontend types regenerated; README, technical documentation, contract changes and security
self-assessment (with the OWASP ASI mapping) updated.

## Part 4: Order and quality gates

1. Engines and services (A, B) with tests: the backend suite stays green after each.
2. OpenAPI export and frontend types.
3. Design system and components (C).
4. Screens (D) in this order: proposal workspace, planner, dashboard, chat, Control Room, account.
5. Mock parity (E).
6. Browser verification, documentation (F).

**Not in v2, proposed as follow-ups:** a Chinese interface; a monitoring loop with simulated market
moves, drift alerts and rebalancing proposals (since built: [monitoring-plan.md](monitoring-plan.md)); an MCP gateway that lets outside agents use the T0 and
T1 tools under the same broker and kill switch; an external anchor for the record chain.

## Part 5: As built (17 October 2026)

Parts A to F are done. Where the build differs from the plan:

- **Projection seed.** Each path has a fixed seed (20,261,016 + path number) instead of a seed derived
  from the inputs. The same question still gets the same answer, and alternatives (another tier or
  contribution) are now compared on the same draws. A longer horizon extends each path instead of
  reshuffling it.
- **Trace spans.** The gate's verdict is an attribute of the `execute_tool` span
  (`aegis.gate.decision`) rather than a separate `aegis.gate` span; `aegis.template` records checked
  template answers.
- **Label headers.** `POST /api/chat` sends four headers (`X-AI-Generated`, `X-AI-Label`,
  `X-AI-Content-SHA256`, `X-AI-Config-Fingerprint`). The streaming endpoint carries the same
  provenance inside its `reply` event, because its headers are sent before the reply exists.
- **Threat signals.** Twelve pattern rules plus an obfuscation check, more than the seven planned:
  tier claims, claimed authority, dictated replies, risk waivers, large single weights and promised
  returns cover the remaining red-team groups.
- **Briefing.** It also reports uninvested cash, and the margin insight says a rule is *over* its limit
  when the proposal already fails it.
- **Regulatory map.** Five frameworks were added (China's labelling measures, the CSRC FinTech plan,
  the HK SFC circular, FINRA's 2026 report, the OWASP agentic list), and Art. 50 joined the existing
  EU AI Act entry. The CSRC's June 2026 remarks are not a published text, so they inform the
  labelling and review controls without an entry of their own.

Results against the quality gates:

| Gate | Result |
| --- | --- |
| Backend tests | 173 passed; `ruff check` and `ruff format --check` clean |
| Threat-signal targets (≥ 90% of red-team prompts, < 10% of ordinary questions) | 27 of 30 (90%) at medium or high; 0 of 30 ordinary questions |
| Red-team | 30/30 PASS, unchanged |
| Performance | Slowest p95 130 ms (a 30-year projection at all five tiers); every other endpoint under 5 ms |
| Mock parity | All 49 operations; projections identical to Python; How to fix identical on 400 random proposals; threat signals identical on 36 messages; 39 checks in `scripts/verify.ts` |
| Frontend | Lint, type check and production build clean (16 routes) |
| Browser | The changed screens checked in light and dark mode; the planner, dashboard, account and proposal pages at 375 px with no page-level horizontal scroll |
| Evidence | `evidence/` regenerated: 41 scenario steps, the red-team log with each prompt's signals, the performance report |

[fortune]: https://fortune.com/2026/09/29/robinhood-trading-agents-hood-openai-anthropic/
[yahoo-liability]: https://finance.yahoo.com/markets/crypto/articles/robinhood-gave-ai-agents-trading-014207554.html
[rh-agents]: https://robinhood.com/newsroom/robinhood-is-now-open-to-agents/
[ant]: https://www.antgroup.com/en/news-media/press-releases/1725552000000
[iitw]: https://investingintheweb.com/brokers/best-ai-investing-apps/
[wp-nudge]: https://wealthprofessional.ca/news/industry-news/how-robo-advisors-are-helping-people-make-smarter-money-decisions/328451
[cac]: https://www.cac.gov.cn/2025-03/14/c_1743654685899683.htm
[pwc-label]: https://www.pwccn.com/zh/tmt/method-identifying-synthetic-content-generated-ai-sep2025.pdf
[sina-plan]: https://finance.sina.com.cn/wm/2026-03-13/doc-inhqvtih4121387.shtml
[cnr]: https://finance.cnr.cn/ycbd/20260617/t20260617_527664727.shtml
[10jqka]: https://stock.10jqka.com.cn/20260616/c677511996.shtml
[goodwin]: https://www.goodwinlaw.com/en/insights/publications/2026/08/alerts-technology-dpc-eu-ai-act-transparency-obligations-now-in-force
[joneswalker]: https://www.joneswalker.com/en/insights/blogs/ai-law-blog/yes-august-2-still-matters-the-eu-approved-a-high-risk-ai-delay-but-most-trans.html
[gibsondunn]: https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/
[aos]: https://www.aoshearman.com/en/insights/ao-shearman-on-data/hong-kong-sfc-issues-circular-on-the-use-of-generative-ai-language-models
[cc]: https://www.cliffordchance.com/insights/resources/blogs/talking-tech/en/articles/2024/11/sfc-circular-to-licensed-corporations-on-use-of-generative-ai.html
[debevoise]: https://www.debevoise.com/insights/publications/2025/12/finras-2026-regulatory-oversight-report-continued
[dla]: https://www.dlapiper.com/insights/publications/2025/12/finra-flags-generative-ai-risks-and-governance-expectations
[owasp]: https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026
[kindgeek]: https://www.kindgeek.com/blog/?p=6445
[yellowslice]: https://www.yellowslice.in/blog/fintech-ux-design-trends-you-must-know
[copilotkit]: https://docs.copilotkit.ai/claude-sdk-python/generative-ui/interactive
[agenticwire]: https://www.agenticwire.news/article/agent-ux-design-patterns
[lazarev]: https://www.lazarev.agency/articles/generative-ui-design
[setproduct-chat]: https://www.setproduct.com/blog/ai-chat-interface-ui-design
[frontkit]: https://thefrontkit.com/blogs/ai-chat-ui-best-practices
[mercury]: https://www.shadcn.io/design/mercury
[linear]: https://opendesigner.io/design-systems/linear-app
[cfa]: https://blogs.cfainstitute.org/blog/2023/04/10/rethinking-outcome-metrics-for-financial-planning
[capprefs]: https://capitalpreferences.helpscoutdocs.com/article/86-goals-the-adviser-insights
[morningstar]: https://awgmain.morningstar.com/webhelp/Practice/Plans/Plan_Methodologies/Probability_calculation.htm
[kpmg]: https://kpmg.com/ch/en/blogs/home/posts/2024/04/counterfactual-explanations-ai-decision-making.html
[swansea]: https://cronfa.swan.ac.uk/Record/cronfa64477
[dash0]: https://www.dash0.com/knowledge/opentelemetry-genai-semantic-conventions-explained
[greptime]: https://greptime.com/blogs/2026-05-09-opentelemetry-genai-semantic-conventions
