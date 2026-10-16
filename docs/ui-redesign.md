# Aegis Wealth AI — UI redesign: research, design system and screen prompts

The first build followed the documentation's screen list faithfully but looked like an internal tool:
plain white pages, one blue, stacked cards, text where a picture would do, and a dashboard with three
numbers on it. This document is the brief for the redesign: what the industry does (Part 1), the
design language that follows from it (Part 2), and one prompt per screen (Part 3), each specific
enough to build from.

## Part 1 — Research: what industry-standard wealth and fintech products do

**Layout and hierarchy.**
- Lead with the one number that drives decisions, and push supporting metrics back. A robo-advisor
  home should show total value, how the portfolio is doing and the next step, and let people drill
  down for detail. ([UXPin][uxpin], [ProCreator][procreator], [AufaitUX][aufait])
- Dashboards are moving from data density to **decision clarity**: fewer, explained modules instead
  of feature-dense screens. ([GitNexa][gitnexa], [Kindgeek][kindgeek])
- 4–6 headline KPIs at most, each with context (a comparison, a target or a meaning), and every
  summary card linking to its detail. ([Setproduct][setproduct], [Datapad][datapad])

**Trust and visual tone.**
- Calm, predictable interfaces read as credible: restraint over flash, generous whitespace, one
  confident accent. Mercury (dark ink canvas, indigo used sparingly, editorial calm) and Wealthfront
  (deep night-violet instead of the usual fintech green or blue) are the reference points.
  ([AdminLTE roundup][adminlte], [Mercury analysis][mercury], [Wealthfront design system][wealthfront])
- Navy and blue read as trust, but every fintech uses them, so pair a navy base with one
  distinctive accent; gradients add modernity without losing seriousness.
  ([Windmill][windmill], [Progress][progress], [InspoAI][inspoai])
- Colour signals **state**, not decoration: Stripe-style tables use tabular figures and
  state-only colour. ([AdminLTE roundup][adminlte])
- *Micro-confidence*: small confirmations that an action was received and processed.
  ([Kindgeek][kindgeek])

**Explaining money to first-time investors.**
- Replace jargon with plain sentences; build education into the interface (short explainers,
  "why" answers). Wealthfront's "Why this risk score" answer is credited with building trust.
  ([ProCreator][procreator], [GoodUX on Wealthfront][goodux])
- Charts must explain themselves without hovering, and annotate what changed.
  ([UXPin][uxpin], [Kindgeek][kindgeek])
- In market falls, don't leave clients alone: explain that volatility is normal.
  ([ProCreator][procreator])
- A single risk **gauge** (SEBI's *riskometer*: a 180° speedometer from low to very high) is the
  most recognised way to show a risk level at a glance; it should sit next to the full profile,
  not replace it. ([Business Standard][riskometer], [FundsIndia][fundsindia])
- Product risk is shown on an R1–R5 scale, and an investor may buy only at or below their own
  level. ([Tiger Brokers][tiger])

**Engagement.**
- Goal and progress framing ("30% of the way"), progress bars and checklists keep people moving;
  checklists of 3–7 steps, ordered by value. ([ProCreator][procreator], [Appcues][appcues],
  [SaaS UI][saasui])
- Empty states are onboarding real estate: say what will appear, why it matters, and give one
  action. A blank post-login state is a launch-blocking failure. ([SaaS UI][saasui],
  [925 Studios][925])
- Wealth apps lag other industries on experience; speed, range of services and **appearance** drive
  satisfaction, and education is the weakest area. ([J.D. Power][jdpower])

**AI in the interface.**
- AI is moving from a chatbot into the experience itself. Answers render as components (tables,
  cards, buttons) inside the conversation — *generative UI*. ([Parallel][parallel],
  [Lazarev][lazarev])
- Citations are the main trust mechanism: inline markers that open their source.
  ([Cloudscape][cloudscape], [Frontkit][frontkit])
- Show what the system is doing (loading and tool states), and keep a human in control of
  consequential actions. ([Cloudscape][cloudscape], [Lazarev][lazarev])

**Oversight consoles.** Status colours carry the primary signal; live markers are few; KPI cards on
top, a live feed in the middle, filterable tables below. ([Odown][odown], [Setproduct][setproduct])

Caveat: most sources are design agencies and vendor blogs; the J.D. Power figures are 2021–22
surveys. They are direction, not proof.

## Part 2 — The Aegis design language

**Personality:** *a private bank's calm, with a glass-box AI.* Dark-ink trust surfaces, one indigo
accent for action, a violet gradient reserved for the AI, and the three status colours reserved for
compliance verdicts only.

### Colour

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#f4f6fb` | `#070b17` | Page canvas |
| `--surface` | `#ffffff` | `#0e1528` | Cards |
| `--surface-2` | `#f8fafd` | `#121a30` | Insets, table headers |
| `--border` | `#e3e8f1` | `#1f2a44` | Hairlines |
| `--text` / `--text-muted` | `#0b1220` / `#566079` | `#e7eaf3` / `#98a2bb` | Ink |
| `--primary` | `#4f46e5` (indigo, 6.3:1 on white) | `#8b93ff` | Actions, links, focus |
| `--ink` | `#0a1330` | `#050914` | Sidebar and hero surfaces |
| `--ai-gradient` | indigo `#6366f1` → violet `#a855f7` | same | The AI only: Ask Aegis, AI cards |
| `--pass` / `--warning` / `--reject` | unchanged | unchanged | PASS / WARNING / REJECT only, always with icon and word |

**Asset classes** (every chart, validated with the data-viz palette validator, all-pairs, colour-blind
safe): cash `#4a3aa7`, bond `#2a78d6`, gold `#eda100`, equity `#1baf7a` in light mode; `#5b4bc4`,
`#3987e5`, `#c98500`, `#199e70` in dark. Light gold and aqua sit under 3:1 on white, so every chart
also carries a labelled legend and a table.

### Type

Plus Jakarta Sans for display (page titles, hero figures, brand); Inter for everything else. Scale:
eyebrow 11/16 uppercase +0.08em · caption 12/16 · body 14/20 · form 16/24 · section 20/28 ·
page title 28/36 · key figure 30/36 · hero figure 44–56. Tabular figures only in columns; big
standalone numbers keep proportional figures.

### Space, shape, depth, motion

8-pt grid; content width 1280 px; cards 16 px radius with a 1 px hairline and a soft two-layer
shadow; inputs and buttons 10 px. Motion is functional: 150–250 ms ease-out on state changes and a
count-up on hero figures, all off under `prefers-reduced-motion`.

### Components

App shell (ink sidebar, grouped nav, AI status, user card; top bar with breadcrumb, ⌘K, privacy
toggle, theme toggle) · PageHeader with eyebrow · KPI tile (icon, label, value, meaning, optional
delta) · Riskometer gauge · Product risk meter (R1–R5 segments) · Journey card (progress ring and
next best action) · Activity timeline · Compare tray · Status, tier, suitability and decision badges ·
Chat cards and sourced figures.

### New features that came out of the research

1. **Riskometer**: the client's tier as a 180° gauge (SEBI-style), next to capacity and willingness.
2. **Journey card**: a progress ring over the five steps and one *next best action*.
3. **Activity timeline**: the client's own operation log as a readable feed. Transparency is the
   product.
4. **Privacy mode**: one toggle hides every amount (standard in banking apps, useful on stage).
5. **Command palette (⌘K)**: jump to any screen or action.
6. **Compare tray**: pick up to three products anywhere on the shelf; a sticky tray compares them.
7. **Product risk meters and type icons** on the shelf, so risk reads before the text does.
8. **Safeguards panel**: the three promises (code computes every number, the AI cannot place
   orders, everything is logged) on the dashboard and the log-in screen.

## Part 3 — Screen prompts

Each prompt is written to be handed to a designer or a code generator as is.

**S00 App shell.** "A desktop-first fintech app shell. Left: a 264 px ink-navy sidebar with the Aegis
shield logo (indigo-violet gradient mark) and word-mark, nav grouped under *Invest* (Dashboard, Risk
Profile, Products, Proposals) and *Account* (Account, Records), or *Oversight* (Control Room, Console,
Records) for compliance; the active item is a soft indigo pill with an indicator bar. At the bottom,
an AI status chip (green dot 'AI advisor active' or 'paused by compliance') and a user card. Top bar:
breadcrumb, a ⌘K search button, a privacy (eye) toggle, light/dark toggle, the 'Sample data · NAV
date' chip and the user menu. Content: 1280 px max width, 32 px padding, page canvas #f4f6fb. Collapse
to icons at 768–1279 px and to a drawer below 768 px."

**S01 Log in.** "Split screen. Left 55%: ink-navy panel with a subtle indigo glow, the logo, the
headline 'AI wealth advice you can audit', three proof points with icons (every number computed by
tested code; the AI cannot place orders; every action hash-chained), and a row of trust chips
(Compliance gate · 9 rules, Red-team 30/30, Sandbox only). Right: a centred card 'Welcome back' with
email and password fields, a primary button, and three demo-account tiles (Rina, Chen, compliance
officer) that fill the form in one click. Footer: 'Sample data. No real money.'"

**S02 Dashboard.** "Greeting with the date. Hero row: (a) an ink-gradient portfolio card: total sandbox
value as the hero figure, a cash/invested split bar, the data label; (b) a journey card: a progress ring
'3 of 5', the five steps as a checklist, and a single next-best-action button. Second row: a risk card
with the riskometer gauge, tier name and capacity/willingness bars; the latest proposal card (status
badge, gate verdict, allocation bar, amount, 'Open'); an Ask Aegis card in the AI gradient with three
suggested questions. Third row: a Safeguards card with the three promises and an activity timeline of
the client's last eight logged actions. Every empty module shows what it will contain and one action."

**S03 Risk Profile.** "Two columns. Left: the ten questions as numbered cards grouped under 'Capacity
— what you can afford' and 'Willingness — how you feel about risk'; answers are large selectable
tiles (2-column grid) with a check mark when chosen. A sticky progress header: 'n of 10 answered',
a segmented bar, and the submit button. Right (sticky): 'How your tier is set' explainer, the
riskometer once a result exists, and capacity/willingness bars. A contradiction shows as an alert
naming both questions, with the conflicting tiles outlined."

**S04 Historical Replay.** "A cinematic header ('Live through a crash'), episode tabs and amount
chips; the time machine card (month, value, change, chart, news ticker); three stat tiles; the
question panel that lights up at the lowest point."

**S05 Product Shelf.** "A filter bar: search, type chips (All, Cash, Bonds, Gold, Equity), 'Suitable
for me' switch, sort. A responsive grid of product cards: a type icon in a tinted circle, name, type,
an R1–R5 segmented risk meter, three facts (annual fee, access in days, lock-up), the suitability
badge, a 'Compare' checkbox and 'Details'. A sticky compare tray slides up from the bottom with up to
three chosen products and a 'Compare now' button."

**S06 Compare.** "Inputs for amount and horizon in a toolbar. Three columns, one per product: name,
risk meter, suitability, fee cost and end value as large figures, with the lowest-cost column
labelled 'Lowest cost'; below, a fee bar chart and the assumption note."

**S07 New Proposal.** "Two columns. Left: a form card with amount (presets 50k/100k/200k/500k and the
available cash), horizon (presets 3/5/8/10 years) and near-term need, and a primary 'Build my
proposal'. Right: 'Your tier's starting mix' (a donut from the tier's model portfolio), and 'What
happens next': engine builds → nine rules check → you review → you confirm. Each step has an icon."

**S08 Proposal Workspace.** "A summary band: proposal number and version, amount, horizon, tier, gate
badge, Continue button. Then a two-column grid: allocation donut with legend, and the compliance
verdict (each rule with result, measured value and regulation chips). KPI tiles for the five metrics.
Holdings with each product's reason. Stress test chart. Version compare. The chat docks on the right
at 1280 px+."

**S09 Confirm and Execute.** "A checkout layout. Left: numbered steps as cards (acknowledge warnings,
read disclosures, quiz, confirm), each with a done state. Right (sticky): 'Order summary' with the
amount, the five products and weights, the gate badge, 'One-time token, valid 5 minutes, bound to
these items', and the Confirm button. Success: a receipt with orders, cash after and the record
hash."

**S10 Account.** "An ink portfolio hero (total value, cash, invested) next to the allocation donut of
positions; a positions table with product, class dot, units, average NAV and value; an orders
timeline."

**S11 Records and record detail.** "A list of advice records as cards with date, proposal, decision
badge, amount and a short hash chip linked by a vertical chain line; 'Verify my chain' shows a green
'Chain intact · n records' banner. The detail page reads like a certificate: header with record id,
hash and previous hash, then profile, proposal, gate, quiz, disclosures and orders sections; Print."

**S12 Compliance Console.** "Tabs styled as a segmented control. Operation log: a toolbar of filters, a
table with actor avatars, action names, tier chips and decision pills, row click opens a side sheet.
Records, Rules (cards with regulation chips) and Export (two large buttons)."

**S13 AI Control Room.** "An ink 'mission control' header band with the live pulse and the AI's
state. Two large switch cards, KPI tiles with icons, the live feed as a timeline, the model
disclosure card, and the regulatory checklist."

**Chat drawer.** "A header with the AI gradient avatar and status; bubbles with sourced figures; cards
for tool results; suggestion chips; a composer with a send button."

[uxpin]: https://www.uxpin.com/studio/blog/dashboard-design-principles/
[procreator]: https://procreator.design/blog/how-to-build-a-robo-advisor-guide/
[aufait]: https://www.aufaitux.com/blog/dashboard-design-principles/
[gitnexa]: https://www.gitnexa.com/blogs/modern-fintech-ui-ux-trends
[kindgeek]: https://www.kindgeek.com/blog/?p=6445
[setproduct]: https://setproduct.com/blog/dashboard-ui-design
[datapad]: https://datapad.io/docs/guides/dashboard-best-practices
[adminlte]: https://adminlte.io/blog/fintech-dashboard-design-examples/
[mercury]: https://kombai.com/gallery/inspirations/mercury/
[wealthfront]: https://www.shadcn.io/design/wealthfront
[windmill]: https://windmill.digital/psychology-of-color-in-financial-app-design/
[progress]: https://www.progress.com/blogs/how-choose-right-colors-fintech
[inspoai]: https://www.inspoai.io/blog/best-color-palette-for-fintech-app
[goodux]: https://goodux.appcues.com/blog/wealthfront-personalized-ux-copy
[riskometer]: https://www.business-standard.com/article/news-ians/sebi-introduces-riskometer-to-show-risk-levels-to-principal-115043001006_1.html
[fundsindia]: https://www.fundsindia.com/blog/mf-research/mutual-funds/will-the-riskometer-help-you-know-your-fund-risks-better/7441
[tiger]: https://www.itiger.com/hk/en/help/detail/54674404
[appcues]: https://appcues.com/blog/saas-onboarding-screens
[saasui]: https://www.saasui.design/blog/saas-onboarding-ux-examples
[925]: https://www.925studios.co/blog/saas-launch-design-checklist
[jdpower]: https://www.jdpower.com/business/press-releases/2021-us-wealth-management-mobile-app-satisfaction-study
[parallel]: https://www.parallelhq.com/blog/llm-chat-ux-patterns
[lazarev]: https://www.lazarev.agency/articles/ai-ux-patterns
[cloudscape]: https://cloudscape.design/patterns/genai/generative-AI-chat/
[frontkit]: https://thefrontkit.com/blogs/ai-chat-ui-best-practices
[odown]: https://odown.com/blog/monitoring-dashboard-design/
