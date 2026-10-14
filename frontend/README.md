# Aegis Wealth AI — Frontend

The client for Aegis Wealth AI: a wealth-advisory sandbox that profiles risk, compares products,
proposes an allocation, checks it against a compliance gate, and executes it in a sandbox account
once the client confirms. Built against the API contract and UI design system in the project
documentation (Sections 2.6 and 2.7).

## Status: frontend-only, mock-first

There is no backend in this build yet. Every `/api/*` call is served in-browser by
[MSW](https://mswjs.io) (`src/mocks/`), which implements the full 32-endpoint contract with the
same request/response shapes, error envelope and fixed value names a real FastAPI backend would
return — including the scoring, allocation, metrics, stress, compliance-gate, quiz and hash-chain
engines as pure, deterministic functions (`src/mocks/engines/`), per Section 2.5's formulas. This
follows the "mock-first frontend" rule in Section 2.10.3: the UI is complete and demoable on its
own, and swapping MSW for a real backend later means only deleting `src/mocks` and pointing
`ApiClient` at the real API — no screen code changes.

The AI advisor chat always runs in **fallback mode** (FR-6.4): there is no model key configured, so
replies come from the same keyword-matched templates the real backend falls back to when the
model is unavailable. They're grounded by construction, and tool calls/citations are still shown
in the chat drawer exactly as the real agent would present them.

## Getting started

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. The app waits for the mock service worker to start, then redirects
you to `/login`.

### Demo accounts

| Email | Role | Password |
| --- | --- | --- |
| rina@example.com | Client | password123 |
| chen@example.com | Client | password123 |
| officer@example.com | Compliance officer | password123 |

Each client's sandbox account is seeded with CNY 500,000 in cash. Data resets on a full page
reload — the mock "database" is in-memory module state, not persisted.

## Scripts

```bash
npm run dev        # start the dev server
npm run build       # production build
npm run start        # serve the production build
npm run lint          # ESLint
npx tsc --noEmit        # typecheck
npx tsx scripts/verify.ts  # sanity-check the engines against the documentation's worked examples
```

## Structure

```
src/
  app/                 Next.js App Router routes — one folder per screen (S01–S12)
  components/
    ui/                shadcn/ui primitives (Button, Card, Dialog, Sheet, ...)
    shared/             StatusBadge, TierBadge, DataLabel, Money, Percent, PageHeader, Stepper, ...
    charts/              AllocationDonut, ReplayLine, StressBars, FeeBars (Recharts)
    shell/                Sidebar, TopBar, ChatDrawer, page-title context
  lib/                  types.ts (API contract), api-client.ts, queries.ts (TanStack Query hooks),
                         format.ts, asset-colors.ts
  mocks/
    data/                 static reference data: products, questionnaire, model portfolios,
                          scenarios, rules, disclosures, synthetic history, seeded users
    engines/               pure functions: scoring, allocation, metrics, stress, fees, gate, quiz,
                          replay, hash chain, confirmation tokens
    services/              proposal creation/revision, the chat "agent", chain verification
    db.ts                   in-memory store (sessions, profiles, proposals, orders, records, logs)
    handlers.ts             the 32 MSW request handlers
```

## Design system

Tokens (colours, type scale, spacing, radius) live in `src/app/globals.css` as CSS variables, per
Section 2.7.2 — no screen uses a raw colour value. Components are built on shadcn/ui (Radix
primitives) and Tailwind CSS v4.
