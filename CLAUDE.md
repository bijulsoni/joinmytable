# CLAUDE.md

Operational context for building **JoinMyTable** with a team of specialized agents. This file lives at the repository root and is the authoritative reference while building. For the full coordination plan — dependency graph, phased sequencing, review gates — see `JoinMyTable-Multi-Agent-Execution-Plan.md`.

---

## Project overview

JoinMyTable is a two-sided marketplace for **lunch and dinner companionship**. Seekers pay a fixed fee to share a meal with a companion; companions earn the fee plus a free meal. The MVP is a **mobile-first responsive website**.

---

## Core product rules (invariants — do not violate)

These are locked decisions. Every agent must respect them; they are guardrails, not preferences.

1. **Scope is lunch and dinner only.** Do not build other activity types.
2. **The seeker pays for everything** — the companionship fee *and* the meal.
3. **The companionship fee is a fixed rate** set by the companion (~$20–25). The free meal is a perk, not the payment.
4. **The seeker sets a budget tier** at booking time.
5. **One account, two modes.** A user can be a seeker, a companion, or both.
6. **The companionship fee is held in escrow** and released to the companion only after the meal is marked complete.
7. **Chat unlocks only after a request is accepted.**
8. **Reviews are only allowed for completed bookings**, and are two-way.
9. **Unverified companions cannot be discovered or booked.**
10. **Card data never touches our servers** — it goes directly to Stripe.

---

## Tech stack

- **Frontend & backend:** Next.js (React, TypeScript, App Router) — one codebase, deployed on Vercel
- **Database & platform:** Supabase — PostgreSQL with PostGIS, Auth, Realtime, Storage
- **Payments:** Stripe Connect
- **Maps:** Google Maps or Mapbox
- **Email:** transactional email service (e.g. Resend)
- **Hosting:** Vercel (app) + Supabase (data)

## Architecture

The browser talks to a Next.js app on Vercel. The app's API routes are the hub: they call Supabase and the three third-party services. The browser also talks to Supabase directly for the auth session and the realtime chat subscription. See the Architecture & Design Diagrams document for the full picture.

---

## Repository structure

```
/
├── CLAUDE.md
├── README.md
├── package.json
├── next.config.js
├── /app                      # Next.js App Router — screens & API routes
│   ├── /(auth)               # sign-up, login            [Auth & Identity]
│   ├── /discover             # discovery screen          [Frontend]
│   ├── /companions/[id]      # companion profile         [Frontend]
│   ├── /requests             # request a meal            [Frontend]
│   ├── /bookings             # bookings list, confirm & pay [Frontend]
│   ├── /chat                 # chat screens              [Frontend]
│   ├── /profile              # companion profile setup   [Frontend / Auth]
│   ├── /safety               # safety screen             [Trust & Safety]
│   └── /api                  # API route modules
│       ├── /profiles         [Core API]
│       ├── /search           [Core API]
│       ├── /requests         [Core API]
│       ├── /bookings         [Core API]
│       ├── /payments         [Payments]
│       ├── /messaging        [Core API]
│       ├── /reviews          [Core API / Trust & Safety]
│       └── /notifications    [Core API]
├── /components               # shared React components   [Frontend]
├── /lib
│   ├── /supabase             # Supabase client           [Foundations]
│   ├── /stripe               # payments module           [Payments]
│   ├── /maps                 # Maps integration module   [Integrations]
│   ├── /email                # Email integration module  [Integrations]
│   └── /types                # shared types & enums      [Database, derived]
├── /supabase
│   ├── /migrations           # schema migrations         [Database]
│   └── /seed                 # seed data                 [Database]
└── /tests                    # unit, integration, e2e    [QA & Testing]
```

Ownership is shown in brackets. An agent edits within its areas; cross-area changes go through the Orchestrator.

---

## Development conventions

- **Language:** TypeScript everywhere; no plain JavaScript.
- **Mobile-first:** every screen is designed for a phone viewport first, then expanded.
- **Server-side authority:** never trust the client. Authenticate every API route and authorize every action; validate all inputs server-side.
- **Shared types:** entity and enum types live in `/lib/types`, derived from the database schema. Do not redefine them locally.
- **Small PRs:** keep changes scoped to one module or screen area; this reduces cross-agent merge conflicts.
- **Status fields are enums:** request status, booking status, and escrow status use defined enum values — never free-form strings.
- **Secrets:** all API keys come from environment variables, never committed.

## Commands

```
npm run dev          # local development
npm run build        # production build
npm run lint         # lint
npm run type-check   # TypeScript check
npm run test         # test suite
npm run db:migrate   # apply database migrations
npm run db:seed      # load seed data
```

---

## Multi-agent execution model

The build is divided among one **Orchestrator** and nine **specialist agents**. Each specialist owns a bounded slice, has a detailed task list (below), and depends on published interfaces from other agents. Work proceeds in phases; within a phase, agents whose dependencies are met work in parallel.

**Interface-first rule:** do not build against a moving target. A consuming agent starts only against a *published and frozen* contract (database schema, API route shapes, shared types, integration modules). Changing a frozen contract goes through the Orchestrator.

---

## Agent definitions

Each agent below has a role, a detailed task checklist, scope boundaries, what it depends on, and its definition of done.

### Orchestrator

**Role:** Coordinate the team; sequence work; freeze interfaces; run review gates. Does not write feature code.

**Tasks:**
- Keep this file and the execution plan current; track each agent's task status.
- Sequence work by phase; enable parallel work where dependencies allow.
- Freeze and version interface contracts before dependent agents begin.
- Run a phase gate at each boundary: verify every active agent's definition of done, run regression, then open the next phase.
- Arbitrate overlapping changes and scope conflicts.
- Escalate open product decisions (cancellation policy, escrow release trigger, platform fee %) to the founder before they block work.
- Own end-to-end integration testing with the QA agent.

**Definition of done:** all phase gates passed; integrated app deployed to staging and promoted to production.

### Agent 1 — Foundations & DevOps

**Role:** Stand up the skeleton, infrastructure, and delivery pipeline. **Owns:** repo, build tooling, environments, CI/CD, secrets, observability.

**Tasks:**
- Initialize the Git repo and branch strategy (main → staging auto-deploy; manual promote to production).
- Scaffold the Next.js app (TypeScript, App Router, mobile-first config).
- Create three Supabase projects: development, staging, production.
- Configure Vercel; connect to Git; staging auto-deploys from main, production is manual.
- Set up environment-variable management for all secrets.
- Establish the repository folder structure above.
- Add lint, format, and type-check config plus pre-commit hooks.
- Set up CI to run lint, type-check, and tests on every PR.
- Integrate application logging and error tracking.
- Write the README for local setup.

**Depends on:** nothing. **Unblocks:** everyone.
**Definition of done:** app builds and deploys to staging; all agents can run it locally; CI runs on PRs; secrets managed; logging live.

### Agent 2 — Database

**Role:** Design and implement the data layer; publish it as the canonical contract. **Owns:** schema, migrations, PostGIS, RLS policies, indexes, seed data.

**Tasks:**
- Implement the schema for all eight entities: `users`, `companion_profiles`, `availability`, `meal_requests`, `bookings`, `payments`, `messages`, `reviews`.
- Write version-controlled, repeatable migrations that apply identically across all three environments.
- Enable PostGIS; model companion service area / location as geographic data.
- Add indexes — geo-indexes for discovery, plus foreign-key and lookup indexes.
- Implement Row-Level Security: users access only their own data; companion profiles discoverable only when verified; messages visible only to booking participants.
- Define enum and constraint values for all status fields.
- Create seed-data scripts for development and staging.
- Keep the ERD current; publish the schema and derived shared types as a frozen contract.

**Depends on:** Foundations. **Unblocks:** Auth & Identity, Core API, Payments.
**Definition of done:** migrations apply cleanly everywhere; RLS tested; geo-queries indexed; seed data loads; schema published and frozen.

### Agent 3 — Auth & Identity

**Role:** Own authentication, the account model, and identity verification. **Owns:** `/app/(auth)`, auth session/context, verification flow.

**Tasks:**
- Integrate Supabase Auth (email/password for the MVP).
- Implement sign-up and login — session handling and the UI (screen 1).
- Implement the one-account-two-modes model (`isSeeker` / `isCompanion`) with mode switching in the UI.
- Build the identity verification flow — stronger for companions (gates discoverability), lighter for seekers.
- Implement profile photo upload to Supabase Storage with validation.
- Enforce that unverified companions cannot be discovered or booked (with Database RLS and Core API).
- Manage the client auth session; reflect logged-in/out state app-wide.
- Handle session expiry and password reset.

**Depends on:** Foundations, Database. **Unblocks:** Core API, Frontend.
**Definition of done:** users sign up, log in, switch modes; companions complete verification; photos upload; verification gating enforced end to end.

### Agent 4 — Core API

**Role:** Implement the backend API modules and enforce business rules server-side. **Owns:** every `/app/api` module except `payments`.

**Tasks:**
- `profiles` — companion profile CRUD: rate, bio, service area, availability, photo references.
- `search` — location-based discovery via PostGIS; filters for meal type, date/time, price, rating, languages, interests; list + map-marker results.
- `requests` — create/accept/decline meal requests; enforce status transitions (requested → accepted/declined).
- `bookings` — the booking lifecycle state machine (accepted → confirmed → completed, cancelled off-ramp); restaurant, budget tier, time.
- `messaging` — persist chat messages; threads tied to an accepted request/booking; system messages for booking events.
- `reviews` — two-way review capture; aggregate ratings onto companion profiles.
- `notifications` — single trigger point for transactional emails on key events.
- Enforce business rules server-side (see Core product rules above).
- Authenticate every endpoint; authorize every action; validate all inputs.
- Publish API route contracts for the Frontend agent, per module.

**Depends on:** Database, Auth & Identity. **Unblocks:** Frontend, Payments, Trust & Safety.
**Definition of done:** all modules implemented and authorized; business rules enforced; requested → completed path works against the DB; contracts published.

### Agent 5 — Payments

**Role:** Implement payments, escrow, and payouts via Stripe Connect. **Owns:** `/lib/stripe`, `/app/api/payments`.

**Tasks:**
- Integrate Stripe Connect; set up connected-account onboarding for companions.
- Charge the companionship fee at booking confirmation, with Stripe Elements on the client (card data never touches our servers).
- Implement escrow — hold funds rather than pay out immediately.
- Release the fee on booking completion — transfer to the companion's connected account, minus the platform cut.
- Implement refunds on cancellation, applying the cancellation policy.
- Handle Stripe webhooks: charge succeeded/failed, transfer events, disputes/chargebacks.
- Reconcile payment state with the `payments` table.
- Coordinate with Core API so booking state transitions trigger the right payment actions.
- Implement platform-fee calculation — flag the exact percentage as an open decision.
- Surface payment errors as clean, typed results for the Frontend agent.

**Depends on:** Database, Core API. **Unblocks:** Frontend, Trust & Safety.
**Definition of done:** onboarding works; fee charges and holds in escrow; releases on completion; refunds work; webhooks handled; payment state reconciled.

### Agent 6 — Frontend

**Role:** Build the mobile-first responsive UI for every screen. **Owns:** all screen routes, `/components`.

**Tasks:**
- Implement all wireframed screens: sign-up/mode select, discovery, companion profile, request a meal, chat, confirm & pay — plus companion profile setup, bookings list, reviews, safety screen.
- Build mobile-first and fully responsive — phone first, expanding to desktop.
- Set up routing; server-render where it aids discoverability (companion profiles).
- Implement client state: server-state caching, local UI state, realtime subscription state for chat.
- Integrate the map (discovery) and restaurant search (booking) via the Maps module.
- Build the realtime chat UI on a Supabase Realtime subscription.
- Wire every screen to the Core API and Payments contracts.
- Implement Stripe Elements on the confirm & pay screen.
- Handle loading, empty, and error states throughout.
- Request location with explicit user permission.

**Depends on:** Auth & Identity, Core API, Payments, Integrations. **Unblocks:** —
**Definition of done:** all screens implemented and responsive; wired to live APIs; chat realtime; map and payments integrated; loading/error states handled.

### Agent 7 — Integrations

**Role:** Own the Maps and Email integrations as clean shared modules. **Owns:** `/lib/maps`, `/lib/email`.

**Tasks:**
- Integrate the Maps API: geocoding, places/restaurant lookup, map SDK for rendering.
- Provide a Maps module consumed by Frontend (render, restaurant search) and Core API (geocoding).
- Integrate the email service for transactional sending.
- Build transactional email templates: request received, accepted, declined, booking confirmed, meal reminder, payment confirmation, review prompt.
- Provide an email module consumed by Core API's `notifications`.
- Manage both services' keys via the Foundations secrets setup.
- Handle third-party failure modes (retry/fallback) so outages degrade gracefully.
- Document both integration interfaces.

**Depends on:** Foundations. **Unblocks:** Frontend, Core API.
**Definition of done:** Maps module powers geocoding/places/render; email module sends every template; both consumed cleanly; failure modes handled.

### Agent 8 — QA & Testing

**Role:** Own test strategy, implementation, and the CI quality gate. **Owns:** `/tests`, the CI test gate.

**Tasks:**
- Define the test strategy across unit, integration, and e2e layers.
- Unit-test business-rule logic: status transitions, fee calculation, authorization.
- Integration-test each API module against a test database.
- Write the critical-path e2e test: the full requested → completed booking flow.
- Write payment-flow tests (charge, escrow hold, release, refund) in Stripe test mode.
- Test RLS policies — verify users cannot access others' data.
- Test responsive behavior across phone and desktop viewports.
- Wire tests into CI as a merge gate (with Foundations).
- Run regression before each phase gate and before production promotion.
- Maintain a bug log; route issues to owning agents.

**Depends on:** every code agent's output. **Unblocks:** —
**Definition of done:** suite covers business rules, all API modules, the critical booking path, and payments; tests gate CI; regression passes before each release.

### Agent 9 — Trust & Safety

**Role:** Own trust/safety features and audit the system against safety requirements. **Owns:** `/app/safety`, report/block, guidelines; has audit authority over all agents.

**Tasks:**
- Implement reviews end to end with Core API and Frontend — two-way, tied to completed bookings.
- Implement report and block functionality.
- Build the safety screen: "share my meal details with a friend," plus safety tips.
- Implement community-guidelines acceptance at sign-up.
- Audit verification gating — unverified companions genuinely non-discoverable and non-bookable.
- Audit escrow safety — funds protected, release/refund logic correct.
- Audit PII handling — minimum necessary data exposed between parties; card data never on our servers.
- Audit that in-app messaging keeps coordination on-platform.
- Maintain the trust & safety checklist; sign off before production promotion.
- Flag open policy decisions with safety implications.

**Depends on:** Core API, Payments, Frontend. **Unblocks:** —
**Definition of done:** reviews, report/block, safety screen, guidelines acceptance shipped; verification/escrow/PII audits pass; checklist signed off.

---

## Working as an agent

When operating as one of the agents above:

1. **Stay in your scope.** Edit within your owned areas (see the repository structure). Cross-area changes go through the Orchestrator.
2. **Build only against frozen contracts.** If a dependency's interface is not yet published and frozen, either wait or build against an agreed mock — do not guess.
3. **Respect the core product rules.** They are invariants. If a task seems to require breaking one, stop and escalate.
4. **Publish your interfaces** as soon as they are stable, so dependent agents can start.
5. **Keep PRs small and scoped** to one module or screen area.
6. **Hand changes to frozen contracts through the Orchestrator** — never silently change a published interface.
7. **Flag open product decisions** rather than guessing; the Orchestrator routes them to the founder.

---

## References

- `JoinMyTable-Implementation-Plan.md` — what we are building and why
- `JoinMyTable-High-Level-Design.md` — how the system is designed
- `JoinMyTable-Architecture-and-Diagrams.docx` — architecture, UML, and sequence diagrams
- `JoinMyTable-Multi-Agent-Execution-Plan.md` — full coordination plan: dependencies, sequencing, review gates
