# Aegis Wealth AI — Frontend

The web app for Aegis Wealth AI: a wealth-advisory sandbox that profiles risk, compares products,
proposes an allocation, checks it against a compliance gate, and executes it in a sandbox account
once the client confirms. Built to the API contract and UI design system in the project
documentation (Sections 2.6 and 2.7). The whole system starts with `docker compose up --build` from the
repository root; see the [root README](../README.md).

## Two ways to run it

| Mode | Command | API |
| --- | --- | --- |
| Against the real backend | `NEXT_PUBLIC_API_MOCK=0 API_BASE_URL=http://localhost:8000 npm run dev` | FastAPI in `../backend`, through the `/api/*` rewrite in `next.config.ts` |
| Mock-first (no backend) | `npm run dev` | [MSW](https://mswjs.io) in the browser (`src/mocks/`) |

Mock mode follows the "mock-first frontend" rule in Section 2.10.3. The mock implements all 49
operations (the 32 contract endpoints, streaming chat, oversight, planning and what-if), with the
same shapes and error envelope. Its engines (`src/mocks/engines/`) are ports of the backend's, so the
numbers, item reasons and gate details match; `scripts/verify.ts` checks both against the
documentation's worked examples. The version 2 ports give the backend's exact results: the goal
projection shares its random generator (mulberry32, the same seed) and rounding (`numbers.ts`, half
away from zero on the written digits), How to fix matched the Python engine on 400 random proposals,
and the threat signals on 36 test messages. Screens never import from `src/mocks`, so switching modes
needs no screen change.

| Variable | Effect |
| --- | --- |
| `NEXT_PUBLIC_API_MOCK` | `0`: requests go to the real backend. `1`, or unset: MSW answers `/api/*` in the browser. Read at build time. |
| `API_BASE_URL` | Where Next.js forwards `/api/*` when mocks are off: `http://localhost:8000` locally, `http://api:8000` in Docker Compose. |

**Sessions.**
- Against the real backend, the session is the httpOnly `aegis_session` cookie, and nothing is stored
  in the browser.
- In mock mode, a Service Worker never sees the `Cookie` header. The token is therefore kept in
  `localStorage` and sent as an `X-Aegis-Session` header, and the mock database lives in the tab's
  `sessionStorage`: a refresh keeps your data, while a new tab starts a fresh demo.
- Mock mode needs <http://localhost:3000>. The "Network" address and private windows can't run the
  service worker.

**Advisor chat.**
- Against the real backend, the advisor uses Claude when the API has `ANTHROPIC_API_KEY`, and checked
  templates otherwise.
- In mock mode it always answers from templates.
- Either way, the drawer streams the agent's progress: each tool call appears with its tier, the
  broker's decision and its result card while the turn runs. The reply arrives only after the
  grounding check.
- Each reply shows its cards (fee comparison, proposal with the gate's verdict, rule with its
  regulatory basis, profile, products, or a call the broker blocked), and every figure in it is
  underlined: hover or focus it to see the tool field, message or profile value it came from.
- When compliance suspends the advisor, the drawer says so and the reply is a fixed notice.
- Version 2: the drawer opens with a notice that the client is talking to an AI system; each reply
  carries its label (AI-generated, Automated template (checked) or System notice) with a provenance
  popover (model, configuration fingerprint, content hash); a live step timeline shows the run; goal
  projection and How to fix cards render in the thread, the latter with *Apply*; and every reply can
  be copied or rated, with a reason for a thumbs-down. Suggested questions follow the current page.

### Demo accounts

| Email | Role | Password |
| --- | --- | --- |
| rina@example.com | Client | password123 |
| chen@example.com | Client | password123 |
| officer@example.com | Compliance officer | password123 |

## Scripts

```bash
npm run dev              # dev server on :3000
npm run build            # production build (standalone output, used by the Docker image)
npm run start            # serve the production build
npm run lint             # ESLint
npm run typecheck        # tsc --noEmit
npm run gen:types        # regenerate src/lib/api-types.ts from ../backend/openapi.json
npx tsx scripts/verify.ts  # 39 checks: mock engines against the worked examples and the backend's results, mock data against ../backend/data (exits 1 on a mismatch)
```

## API types are generated (NFR-5.2)

`src/lib/api-types.ts` is generated from the backend's OpenAPI file and never edited by hand;
`src/lib/types.ts` only gives its schemas their contract names. After an API change:

```bash
cd ../backend && python scripts/export_openapi.py   # -> backend/openapi.json
cd ../frontend && npm run gen:types && npm run typecheck
```

A contract change that breaks a screen or the mock then fails the type check.

## Structure

```
src/
  app/                 Next.js App Router routes: one folder per screen (S01-S12), plus control-room/
                       (the compliance officer's AI Control Room) and planner/ (the Goal Planner);
                       (app)/template.tsx fades each page in
  components/
    ui/                shadcn/ui primitives (Button, Card, Dialog, Sheet, ...)
    shared/            StatusBadge, TierBadge, SuitabilityBadge, DecisionLabel, DataLabel, Money,
                       Percent, PageHeader, Stepper, RegulationChips, AnimatedMoney and AnimatedNumber
                       (figure.tsx), AiLabel and AiNotice, AskAbout, InsightCard, Segmented, ...
    chat/              ChatCards (tool results as cards, incl. projection and How to fix) and ReplyText
                       (figures linked to their sources)
    charts/            AllocationDonut, ReplayLine, ReplayPlayer (the month-by-month replay), StressBars, FeeBars,
                       FanChart, ProbabilityRing, TierBars, Sparkline, TraceWaterfall
    proposal/          WhatIfLab (sliders with a live gate), FixPanel (How to fix), ProjectionPanel
    oversight/         TurnInspector (the Control Room's side sheet: provenance, signals, trace, decision)
    shell/             Sidebar, TopBar (with the light/dark toggle), ChatDrawer, DockedChat, CommandPalette
  lib/                 api-types.ts (generated), types.ts, api-client.ts (incl. streamChat),
                       queries.ts (TanStack Query hooks), labels.ts, disclosures.ts, format.ts,
                       chart-theme.ts, use-debounced.ts
  mocks/               the MSW mock API: data, engines (incl. projection, remedy, threats, numbers),
                       services (incl. planning, reviews), db.ts, handlers.ts
```

## Design system

The research, the design language and a prompt for every screen are in
[../docs/ui-redesign.md](../docs/ui-redesign.md).

- **Tokens** (colours, type scale, spacing, radius, shadows) live in `src/app/globals.css` as CSS
  variables, with a dark set under `.dark`; text pairs meet WCAG 2.2 AA. No screen uses a raw colour
  value. The palette is ink navy for trust surfaces (sidebar, heroes), indigo for action, and a
  violet gradient for the AI only.
- **Status colours.** Green, amber and red mean PASS, WARNING and REJECT only, always with an icon and
  a word.
- **Type.** Plus Jakarta Sans for titles and hero figures, Inter for everything else.
- **Charts.** Asset-class colours were validated all-pairs for colour-blind separation in both modes
  (`src/lib/asset-colors.ts`), and the riskometer uses a validated one-hue ramp.
- **`cn`** (`src/lib/utils.ts`) knows the custom type scale, so `text-caption` and a colour such as
  `text-(--text)` no longer cancel each other.
- **Shell features:** the ⌘K command palette (`components/shell/command-palette.tsx`), which also
  sends a typed question to Aegis, and privacy mode (`lib/privacy.tsx`; every `<Money>` and
  `<AnimatedMoney>` hides while it is on).
- **Components** are built on shadcn/ui (Radix primitives) and Tailwind CSS v4.
- **Version 2** adds motion and elevation tokens, a glass surface, segmented-control tokens and a
  one-hue band ramp for projections (`--band-*`, `--target-line`), all with dark values; Motion
  (`motion`) for transitions under `MotionConfig reducedMotion="user"`; NumberFlow for figures that
  roll to their new value; and a table twin for every chart. Part 4 of the design document has the
  details.

### Running a second dev server

`next.config.ts` reads `NEXT_DIST_DIR` (default `.next`), so a second dev server can run beside the
first with its own build folder, for example mock mode on another port:

```bash
NEXT_PUBLIC_API_MOCK=1 NEXT_DIST_DIR=.next-mock npx next dev -p 3002
```

Folders named `.next-*` are git-ignored.
