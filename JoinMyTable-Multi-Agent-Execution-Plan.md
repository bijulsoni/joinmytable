# JoinMyTable — Multi-Agent Execution Plan

*How a team of specialized agents builds JoinMyTable end to end. This document defines the agent roster, each agent's mission and detailed task list, the dependency graph, phased sequencing, interface handoffs, and review gates. It is the coordination plan of record; `CLAUDE.md` is the operational companion that agents read while working.*

**Companion documents:** Implementation Plan · High-Level Design Document · Architecture & Design Diagrams · CLAUDE.md

---

## 1. How to use this document

The build is divided among **one Orchestrator agent and nine specialist agents**. Each specialist owns a bounded slice of the system, has a detailed task list, and depends on a known set of interfaces from other agents. The Orchestrator sequences the work, freezes interface contracts before dependent work begins, and runs review gates.

Read this top to bottom once for the full picture. During the build, each agent works from its own section (Section 6) plus the interface contracts (Section 7).

---

## 2. Execution model

- **Topology:** an Orchestrator coordinates; nine specialists do the building. Specialists do not coordinate the overall plan — they own their slice and respect published interfaces.
- **Parallelism:** within a phase, agents whose dependencies are met work in parallel. The phased sequencing in Section 5 shows what overlaps.
- **Interface-first:** no agent builds against a moving target. The Orchestrator freezes each interface contract (database schema, API route shapes, shared types, integration modules) before dependent agents start.
- **Phase gates:** at the end of each phase the Orchestrator verifies every active agent's Definition of Done, runs regression, and only then opens the next phase.

---

## 3. Agent roster

| # | Agent | Mission | Most active in |
|---|-------|---------|----------------|
| 0 | **Orchestrator** | Coordinate the team, sequence work, freeze interfaces, run review gates | All phases |
| 1 | **Foundations & DevOps** | Stand up the project skeleton, infrastructure, and delivery pipeline | Phase 0, then ongoing |
| 2 | **Database** | Design and implement the data layer | Phase 0–1 |
| 3 | **Auth & Identity** | Authentication, account model, identity verification | Phase 1 |
| 4 | **Core API** | Backend API modules and server-side business rules | Phase 1–5 |
| 5 | **Payments** | Stripe Connect: charges, escrow, payouts, refunds | Phase 4 |
| 6 | **Frontend** | Mobile-first responsive UI for all screens | Phase 1–5 |
| 7 | **Integrations** | Maps and Email third-party integrations as shared modules | Phase 2–3 |
| 8 | **QA & Testing** | Test strategy, implementation, and CI quality gates | Phase 1 onward |
| 9 | **Trust & Safety** | Trust/safety features and system-wide safety audits | Phase 5–6 |

---

## 4. Dependency map

- **Foundations & DevOps** → unblocks *everyone* (skeleton, environments, CI).
- **Database** → unblocks Auth & Identity, Core API, Payments (they need the schema).
- **Auth & Identity** → unblocks Core API (accounts) and Frontend (auth session, sign-up UI).
- **Core API** → unblocks Frontend (API contracts), Payments (booking state machine), Trust & Safety (reviews backend).
- **Payments** → unblocks Frontend (payment UI) and Trust & Safety (escrow audit).
- **Integrations** → unblocks Frontend (maps rendering) and Core API (geocoding, email sending).
- **QA & Testing** → consumes every agent's output continuously.
- **Trust & Safety** → consumes Core API, Payments, and Frontend output; audits all agents.
- **Orchestrator** → oversees all of the above.

---

## 5. Phased sequencing

Phases mirror the Implementation Plan's build roadmap.

| Phase | Focus | Active agents | Parallelism notes |
|-------|-------|---------------|-------------------|
| **0** | Foundations | Foundations & DevOps; Database (schema design starts) | Database designs while Foundations scaffolds |
| **1** | Accounts & profiles | Database (finish); Auth & Identity; Core API (profiles); Frontend (auth + profile screens); QA starts | Auth, Core API, Frontend parallelize once schema is frozen |
| **2** | Discovery | Core API (search); Integrations (Maps); Frontend (discovery + map) | All three parallel once the Maps module interface is set |
| **3** | Core loop | Core API (requests, bookings, messaging); Integrations (Email); Frontend (request, chat screens) | Frontend follows Core API contracts per module |
| **4** | Payments | Payments; Frontend (confirm & pay); Core API (state-machine coordination) | Payments leads; Frontend integrates against its interface |
| **5** | Trust & polish | Trust & Safety; Core API (reviews); Frontend (reviews, safety screens) | Trust & Safety also audits all prior work |
| **6** | Launch prep | Foundations (prod hardening); QA (full regression); Trust & Safety (sign-off); Orchestrator (launch) | Sequential gate before production |

The **Orchestrator** is active in every phase. **QA & Testing** runs continuously from Phase 1.

---

## 6. Detailed agent specifications

### Agent 0 — Orchestrator

**Mission:** Coordinate the agent team so the system is built in the right order, with stable interfaces, and to a consistent standard.

**Scope:** Owns the plan, sequencing, interface contracts, and review gates. Does not write feature code.

**Detailed tasks:**
- Keep this execution plan and `CLAUDE.md` current as the build progresses; track each agent's task status.
- Sequence work according to the phased plan; identify and enable parallel work.
- Maintain the dependency graph; proactively unblock agents waiting on interfaces.
- Freeze interface contracts (schema, API shapes, shared types, integration modules) before dependent agents begin, and version them.
- Run a review gate at the end of every phase: verify each active agent's Definition of Done, then open the next phase.
- Arbitrate cross-agent conflicts and overlapping changes; assign clear ownership when scopes touch.
- Track open product decisions — cancellation policy, exact escrow release trigger, platform fee percentage — and escalate them to the human founder before they block work.
- Maintain a shared decision log and changelog.
- Coordinate end-to-end integration testing across agents' outputs with the QA agent.

**Definition of done:** every phase gate passed; all agents' DoD met; the integrated app is deployed to staging and promoted to production.

---

### Agent 1 — Foundations & DevOps

**Mission:** Stand up the project skeleton, infrastructure, and delivery pipeline so every other agent can build.

**Scope:** Owns the repo, build tooling, environments, CI/CD, secrets, and observability. Does not build product features.

**Detailed tasks:**
- Initialize the Git repository and branch strategy (main → staging auto-deploy; manual promote to production).
- Scaffold the Next.js app: TypeScript, App Router, mobile-first configuration.
- Create three Supabase projects — development, staging, production.
- Configure the Vercel project, connect it to Git, set staging to auto-deploy from main and production to manual promotion.
- Set up environment-variable management for all secrets (Supabase keys, Stripe, Maps, email) — never committed to the repo.
- Establish the agreed repository folder structure (see `CLAUDE.md`).
- Add linting, formatting, and type-checking configuration, plus pre-commit hooks.
- Set up CI to run lint, type-check, and tests on every pull request.
- Integrate application logging and error tracking from day one.
- Write the README so any agent can run the app locally.

**Definition of done:** the app builds and deploys to staging; every agent can run it locally; CI runs on PRs; secrets are managed; logging and error tracking are live.

---

### Agent 2 — Database

**Mission:** Design and implement the data layer, and publish it as the canonical contract for the agents that depend on it.

**Scope:** Owns the schema, migrations, PostGIS setup, RLS policies, indexes, and seed data.

**Detailed tasks:**
- Implement the schema for all eight entities: `users`, `companion_profiles`, `availability`, `meal_requests`, `bookings`, `payments`, `messages`, `reviews`.
- Write version-controlled, repeatable migrations that apply identically across the three environments.
- Enable and configure PostGIS; model companion service-area / location as geographic data.
- Add indexes — geo-indexes for discovery queries, plus foreign-key and lookup indexes.
- Implement Row-Level Security: users access only their own data; companion profiles are discoverable only when verified; messages are visible only to the participants of their booking.
- Define enum and constraint values for all status fields (request status, booking status, escrow status).
- Create seed-data scripts for development and staging (sample users, companions, bookings).
- Keep the ERD current and publish the schema as the interface contract for the Auth, Core API, and Payments agents.

**Definition of done:** migrations apply cleanly to all environments; RLS policies are tested; geo-queries are indexed; seed data loads; the schema is published and frozen.

---

### Agent 3 — Auth & Identity

**Mission:** Own authentication, the account model, and identity verification.

**Scope:** Spans backend and frontend, but only for authentication and identity. Hands the session/context to the Frontend agent for use elsewhere.

**Detailed tasks:**
- Integrate Supabase Auth (email/password for the MVP).
- Implement sign-up and login — both session handling and the UI (screen 1).
- Implement the account model: one account, two modes (`isSeeker` / `isCompanion`); build mode-switching in the UI.
- Build the identity verification flow: stronger verification for companions (gates discoverability), lighter verification for seekers.
- Implement profile photo upload to Supabase Storage with validation.
- Enforce that unverified companions cannot be discovered or booked — coordinate with the Database RLS policies and the Core API.
- Manage the auth session on the client and reflect logged-in / logged-out state across the app.
- Handle auth edge cases: session expiry and password reset.

**Definition of done:** users can sign up, log in, and switch modes; companions can complete verification; photos upload; verification gating is enforced end to end.

---

### Agent 4 — Core API

**Mission:** Implement the backend API modules and enforce the product's business rules server-side.

**Scope:** Owns every API route module except payments. Publishes API contracts for the Frontend agent.

**Detailed tasks:**
- Build the `profiles` module: companion profile CRUD — rate, bio, service area, availability, photo references.
- Build the `search` module: location-based discovery using PostGIS; filters for meal type, date/time, price, rating, languages, interests; return list and map-marker results.
- Build the `requests` module: create, accept, and decline meal requests; enforce status transitions (requested → accepted / declined).
- Build the `bookings` module: the booking lifecycle state machine (accepted → confirmed → completed, with cancelled as an off-ramp); restaurant, budget tier, and time details.
- Build the `messaging` module: persist chat messages; tie threads to an accepted request/booking; write system messages for booking events.
- Build the `reviews` module: two-way review capture; aggregate ratings onto companion profiles.
- Build the `notifications` module: a single trigger point for transactional emails on key events.
- Enforce business rules server-side: the seeker pays the fee and the meal; chat unlocks only after acceptance; escrow release is gated on completion; reviews are only allowed for completed bookings.
- Authenticate every endpoint and authorize each action (the caller must own or participate in the resource).
- Validate all inputs server-side.
- Publish API route contracts for the Frontend agent, per module.

**Definition of done:** all modules are implemented and authorized; business rules are enforced; the requested → completed path works against the database; API contracts are published.

---

### Agent 5 — Payments

**Mission:** Implement payments, escrow, and payouts via Stripe Connect.

**Scope:** Owns the Stripe integration and the `payments` API module. Coordinates closely with Core API on the booking state machine.

**Detailed tasks:**
- Integrate Stripe Connect; set up connected-account onboarding for companions.
- Implement the companionship-fee charge at booking confirmation, with Stripe Elements on the client for card entry — card data never touches JoinMyTable servers.
- Implement escrow: hold funds rather than paying out immediately.
- Implement fee release on booking completion — transfer to the companion's connected account, minus the platform cut.
- Implement refunds on cancellation, applying the cancellation policy.
- Handle Stripe webhooks: charge succeeded/failed, transfer events, disputes and chargebacks.
- Reconcile payment state with the `payments` table (`escrowStatus`, `stripePaymentIntentId`).
- Coordinate with Core API so that booking state transitions (confirmed → completed) trigger the right payment actions.
- Implement the platform-fee calculation — flag the exact percentage as an open decision for the founder.
- Surface payment errors in a clean, typed way for the Frontend agent.

**Definition of done:** companion onboarding works; the fee charges and holds in escrow; it releases on completion; refunds work; webhooks are handled; payment state is reconciled with the database.

---

### Agent 6 — Frontend

**Mission:** Build the mobile-first responsive UI for every screen.

**Scope:** Owns all screens and shared UI components. Consumes the Auth session, Core API and Payments contracts, and the Maps module.

**Detailed tasks:**
- Implement all wireframed screens: sign-up / mode select, discovery, companion profile, request a meal, chat, confirm & pay — plus companion profile setup, bookings list, reviews, and the safety screen.
- Build mobile-first and fully responsive — phone layout first, expanding to desktop.
- Set up routing per screen; server-render where it aids discoverability (companion profiles).
- Implement client state: server-state caching, local UI state for forms and filters, realtime subscription state for chat.
- Integrate the map on the discovery screen and restaurant search in the booking flow, consuming the Integrations agent's Maps module.
- Build the realtime chat UI on a Supabase Realtime subscription.
- Wire every screen to the Core API and Payments contracts.
- Implement Stripe Elements for card entry on the confirm & pay screen.
- Handle loading, empty, and error states throughout.
- Request the user's location with explicit permission.

**Definition of done:** all screens are implemented and responsive; wired to live APIs; chat is realtime; map and payments are integrated; loading and error states are handled.

---

### Agent 7 — Integrations

**Mission:** Own the Maps and Email third-party integrations and expose them as clean shared modules.

**Scope:** Owns the Maps and Email modules. Other agents consume these rather than calling the third-party APIs directly.

**Detailed tasks:**
- Integrate the Maps API: geocoding (address ↔ coordinates), places / restaurant lookup, and the map SDK for rendering.
- Provide a clean Maps module consumed by the Frontend agent (map render, restaurant search) and the Core API (geocoding).
- Integrate the email service for transactional sending.
- Build transactional email templates: request received, accepted, declined, booking confirmed, meal reminder, payment confirmation, review prompt.
- Provide a clean email module consumed by the Core API's `notifications` module.
- Manage API keys and configuration for both services through the Foundations agent's secrets setup.
- Handle third-party failure modes (retry / fallback) so a Maps or email outage degrades gracefully rather than breaking a flow.
- Document both integration interfaces.

**Definition of done:** the Maps module powers geocoding, places, and rendering; the email module sends every transactional template; both are consumed cleanly by other agents; failure modes are handled.

---

### Agent 8 — QA & Testing

**Mission:** Own test strategy and implementation, and gate quality in CI.

**Scope:** Owns the test suite and the CI quality gate. Routes defects back to the owning agents.

**Detailed tasks:**
- Define the test strategy across unit, integration, and end-to-end layers.
- Write unit tests for business-rule logic: status transitions, fee calculation, authorization checks.
- Write integration tests for each API module against a test database.
- Write the critical-path end-to-end test: the full requested → completed booking flow.
- Write payment-flow tests — charge, escrow hold, release, refund — using Stripe test mode.
- Test RLS policies: verify users cannot access others' data.
- Test responsive behavior across phone and desktop viewports.
- Wire the test suite into CI as a merge gate, with the Foundations agent.
- Run regression before each phase gate and before production promotion.
- Maintain a bug log and route issues to the owning agents.

**Definition of done:** the suite covers business rules, all API modules, the critical booking path, and payments; tests gate CI; regression passes before each release.

---

### Agent 9 — Trust & Safety

**Mission:** Own trust and safety features, and audit the whole system against the product's safety requirements.

**Scope:** Owns the trust/safety features and the safety audits. Coordinates with Core API and Frontend for implementation; has audit authority over all agents.

**Detailed tasks:**
- Implement the reviews feature end to end with Core API and Frontend — two-way, tied to completed bookings.
- Implement report and block functionality.
- Build the safety screen: "share my meal details with a friend," plus safety tips.
- Implement community-guidelines acceptance at sign-up.
- Audit verification gating: confirm unverified companions are genuinely non-discoverable and non-bookable.
- Audit escrow safety: confirm funds are protected and the release / refund logic is correct.
- Audit PII handling: confirm only the minimum necessary data is exposed between booking parties, and that card data never touches JoinMyTable servers.
- Audit that in-app messaging keeps coordination on-platform, with no premature exposure of contact details.
- Maintain the trust & safety checklist and sign off before production promotion.
- Flag open policy decisions (cancellation policy, escrow release trigger) that have safety implications.

**Definition of done:** reviews, report/block, the safety screen, and guidelines acceptance are shipped; the verification, escrow, and PII audits pass; the trust & safety checklist is signed off.

---

## 7. Cross-agent interfaces & handoffs

These are the contracts the Orchestrator freezes before dependent work starts:

| Interface | Produced by | Consumed by | Notes |
|-----------|-------------|-------------|-------|
| **Database schema** | Database | Auth & Identity, Core API, Payments | Frozen before Phase 1 feature work |
| **Shared types & enums** | Database (derived) | All code agents | Single shared package; versioned |
| **Auth session / context** | Auth & Identity | Frontend | How the client reads auth and mode state |
| **API route contracts** | Core API | Frontend, QA | Published per module as built |
| **Payments interface** | Payments | Frontend, Core API | Payment status and typed error shapes |
| **Maps module** | Integrations | Frontend, Core API | Geocoding, places, render utilities |
| **Email module** | Integrations | Core API (`notifications`) | Template-sending interface |

**Handoff rule:** a consuming agent may start against a *published and frozen* contract. If a producing agent must change a frozen contract, it goes through the Orchestrator, who versions the change and notifies consumers.

---

## 8. Review gates

At each phase boundary the Orchestrator runs a gate:

1. Each active agent demonstrates its Definition of Done for the phase.
2. QA runs regression across all merged work.
3. Interfaces introduced this phase are frozen and published.
4. Open product decisions surfaced this phase are escalated.
5. Before Phase 6 / production promotion: Trust & Safety sign-off is mandatory.

A phase does not open until the prior gate passes.

---

## 9. Multi-agent execution risks & mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Interface drift** — agents build against stale contracts | Rework, integration failures | Orchestrator freezes and versions contracts before dependent work; shared types package |
| **Overlapping changes** — multiple agents touch the backend | Merge conflicts, regressions | Clear module ownership; small PRs; Orchestrator arbitrates scope overlaps |
| **Dependency stalls** — an agent blocked waiting on another | Idle time, slipped phases | Phased sequencing; mock interfaces so consumers can start early |
| **Inconsistent conventions** across agents | Hard-to-maintain codebase | `CLAUDE.md` conventions are authoritative; Foundations sets lint/format rules |
| **Trust & safety treated as an afterthought** | Existential brand/user risk | Dedicated agent plus audit gates — not a checkbox at the end |
| **Open product decisions block progress** | Stalled payment/booking work | Orchestrator escalates early; agents build to accommodate both options where feasible |
| **No single integration owner** | Components work alone but not together | Orchestrator owns end-to-end integration testing with QA at every gate |

---

*End of execution plan. Agents operate from their Section 6 spec plus the Section 7 interface contracts. See `CLAUDE.md` for the operational version used while building.*
