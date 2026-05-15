# JoinMyTable — Implementation Plan

*High-level plan of record. This document captures what we are building, the decisions made so far, the technical approach, and the phased path to launch. It is the source of truth that the design document, database schema, and diagrams build on.*

---

## 1. Vision & problem

Modern life is busy, and a lot of people end up eating alone — not by choice, but because coordinating company is hard. Travelers in unfamiliar cities feel this most sharply.

**JoinMyTable** is a two-sided marketplace that connects people who want company for a meal with people willing to provide that company for a small fee. The positioning is simple: *never eat alone.*

---

## 2. Product scope (MVP)

The first version is deliberately narrow: **lunch and dinner companionship only.** Meals are the ideal first vertical because they are time-bound, happen in public places, are socially normal, and recur often.

Other activities (hiking, workouts, etc.) are explicitly **out of scope** for the MVP and may be revisited once meals are proven.

---

## 3. Key product decisions

These decisions are locked and inform everything downstream.

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Lunch and dinner only** for the MVP | Focused, safer (public restaurants), easy to explain |
| 2 | **The seeker pays for everything** — the companionship fee *and* the meal | Crystal clear, no bill-splitting awkwardness, attractive to companions |
| 3 | **Companionship fee is a fixed rate** (~$20–25), set by the companion | Predictable pricing; the free meal is a perk, not the payment |
| 4 | **Budget tier** set by the seeker at booking time | Protects the seeker from runaway meal costs |
| 5 | **One account, two modes** — any user can act as a seeker or a companion | Flexibility; a traveler may seek away and host at home |
| 6 | **Companionship fee held in escrow**, released after the meal | Protects the seeker; builds trust |
| 7 | **Name: JoinMyTable** | Warm, clear, describes the core action |
| 8 | **Mobile-first responsive website** is the first build target | Fastest, cheapest way to validate demand |

---

## 4. User types

A single account can operate in two modes:

- **Seeker** — looking for a meal companion. Initiates requests, pays the fee and the meal.
- **Companion** — offering to be a meal companion. Sets a rate, gets paid, gets a free meal.

Users can switch modes; identity is not fixed to one role.

---

## 5. Core features

**Account & identity**
- Sign up / login
- Identity verification (stronger for companions, who are paid and chosen)
- Profile photos with validation
- Bio, interests, languages, dietary preferences

**Companion profile**
- Lunch and/or dinner availability
- Fixed companionship rate
- Service area / neighborhoods
- Availability calendar
- Reviews and rating score

**Discovery & search (seeker side)**
- Location-based search for nearby companions
- Filters: meal type, date/time, price, rating, languages, interests
- Browse companion profiles

**Matching & booking**
- Send a meal request to a companion
- Companion accepts / declines
- In-app messaging (unlocked after a match)
- Restaurant selection + meal budget tier
- Two-sided confirmation

**Payments**
- In-app payment of the companionship fee, held in escrow
- Fee released to the companion after the meal
- Cancellation & refund handling

**Trust & safety**
- Two-way ratings and reviews
- Report / block
- Share meal details with a friend
- Community guidelines acceptance

**Notifications**
- Request received / accepted / declined
- Meal reminders
- Payment confirmations
- Review prompts

---

## 6. User flows

### Flow A — The companion (supply side)
1. Sign up, choose to offer companionship
2. Complete identity verification
3. Build profile (photos, bio, interests, languages)
4. Set meal types, rate, and service area
5. Set availability
6. Receive a meal request, review the seeker's profile
7. Accept or decline
8. Chat to coordinate details
9. Confirm restaurant + time
10. Attend the meal
11. Get paid (fee released from escrow) + free meal
12. Review the seeker

### Flow B — The seeker (demand side)
1. Sign up, choose to find a companion
2. Set location (or destination city for travel)
3. Search companions, apply filters
4. Browse profiles and reviews
5. Send a meal request
6. Get accepted, chat to coordinate
7. Pick restaurant + set budget tier
8. Pay the companionship fee (into escrow)
9. Both confirm, booking locked
10. Attend the meal, pay the restaurant bill directly
11. Fee auto-releases to the companion afterward
12. Review the companion

### Flow C — Trust moments (woven through both)
- **Before match:** verified badges, photos, reviews
- **At booking:** escrow protects the seeker's money
- **Before meeting:** share meal details with a friend, safety tips
- **After meal:** two-way reviews maintain quality

---

## 7. Core screens

Wireframed and reviewed for the seeker's critical path:

1. **Sign up & choose mode** — seeker or companion
2. **Discover companions** — location, filters, companion list, bottom nav
3. **Companion profile** — photo, verified badge, rating, rate, bio, interests
4. **Request a meal** — meal type, date/time, restaurant, budget tier, message
5. **Chat & coordinate** — in-app messaging, system messages for booking events
6. **Confirm & pay** — booking summary, companionship fee, escrow note

**Screens still to wireframe:** companion-side profile setup, bookings list (upcoming/past), reviews screen, safety screen.

---

## 8. Platform strategy

A staged path where each step builds on the last — no wasted work.

| Stage | What it is | Installable | Push notifications |
|-------|-----------|-------------|--------------------|
| **1. Mobile-first responsive website** | Web page that looks great on phones, works on desktop too | No | No |
| **2. PWA** | The same website, upgraded — installable, offline-capable | Yes | Yes (limited on iOS) |
| **3. Native app** | Separately built app, via React Native | Yes | Yes (full) |

**Guiding principle:** build mobile-shaped from day one, even on the web. Choosing **React** on the web pre-pays for an easier **React Native** transition later — the backend, product logic, and design all carry over; only the interface layer is rebuilt.

The MVP only requires **Stage 1**.

---

## 9. Technical architecture

Chosen to keep the number of moving parts small while covering every need.

| Layer | Choice | Why |
|-------|--------|-----|
| **Frontend** | Next.js (React), hosted on Vercel | Industry-standard React framework; routing + server-side rendering (good for discoverable companion profiles); sets up React Native later |
| **Backend** | Next.js API routes | Runs in the same project to start — one codebase, less to manage; can split out later if scale demands |
| **Database** | Supabase (managed PostgreSQL) | Postgres + PostGIS extension for geo-search; also bundles auth, realtime (chat), and file storage (photos) — four needs, one service |
| **Payments** | Stripe Connect | Purpose-built for marketplaces: holds the fee, pays out the companion, takes the platform cut, supports escrow behavior |
| **Maps & location** | Google Maps or Mapbox | Map display, address-to-coordinates, restaurant lookup |
| **Email** | Transactional email service (e.g. Resend) | Request/booking notification emails for the MVP |
| **Hosting** | Vercel (app) + Supabase (data) | Lean, modern, low-ops |

This is a **starting** architecture, not a forever one. At high scale, the backend would likely break into its own service, with added caching and possibly a specialized chat provider. Designing for that now would be over-engineering.

---

## 10. Data model overview

Roughly six core tables. Full schema and relationships to be designed next as an ERD.

- **users** — base account; can act as seeker, companion, or both
- **companion_profiles** — rate, bio, service area, availability, photos
- **meal_requests** — a seeker's request to a companion (meal type, restaurant, budget, status)
- **bookings** — a confirmed meal, with payment / escrow state
- **messages** — in-app chat threads
- **reviews** — two-way ratings after a meal

---

## 11. Trust & safety

Because the product involves strangers meeting for a paid meal, trust infrastructure is core, not optional:

- **Identity verification** — required for companions at minimum; lighter verification for seekers
- **Escrow** — the companionship fee is held until the meal is confirmed complete
- **Two-way reviews** — both sides rate each other, keeping quality high
- **In-app messaging** — coordination stays on-platform for safety and record-keeping
- **Report / block** — available throughout
- **Share meal details** — seekers can share booking details with a friend
- **Community guidelines** — clear definition of what companionship is and is not; accepted at sign-up
- **Public venues only** — meals happen in restaurants, never private settings

---

## 12. Build roadmap

A phased plan focused on validating demand before scaling.

**Phase 0 — Foundations**
- Set up the repository, Next.js project, Supabase project
- Deploy a baseline app to Vercel
- Finalize the database schema

**Phase 1 — Accounts & profiles**
- Authentication (sign up / login)
- User accounts and mode switching
- Companion profile creation, identity verification
- Photo upload

**Phase 2 — Discovery**
- Location-based companion search (PostGIS)
- Filters and profile browsing
- Map integration

**Phase 3 — The core loop**
- Meal requests (send / accept / decline)
- In-app chat
- Restaurant selection + budget tier
- Booking confirmation

**Phase 4 — Payments**
- Stripe Connect integration
- Escrow: hold fee, release after meal
- Cancellation & refund handling

**Phase 5 — Trust & polish**
- Two-way reviews
- Report / block, safety screen
- Transactional email notifications

**Phase 6 — Launch prep**
- City-by-city launch strategy (solve the cold-start problem one market at a time)
- Seed initial companions in the first city

**Later (post-validation)**
- PWA capabilities (installable, push notifications)
- Native app via React Native

---

## 13. Open questions & future considerations

To resolve as we go:

- **Cold start** — how to seed enough companions in the first city before opening to seekers
- **Cancellation policy** — how late is too late, who is refunded, penalties
- **Escrow release timing** — exact trigger for releasing the fee (both tap "done"? time-based?)
- **Platform fee** — what percentage cut JoinMyTable takes
- **Restaurant choice** — who has final say (likely seeker proposes, companion can suggest within budget tier)
- **Meal-cost expectations** — etiquette guidance in-app so companions order reasonably
- **Verification asymmetry** — exact verification depth for seekers vs companions
- **Legal review** — terms of service, jurisdictional considerations for paid in-person companionship

---

## 14. Decision log summary

| Decision | Status |
|----------|--------|
| Focus: lunch & dinner companionship only | Locked |
| Payment: seeker pays the fee + the meal | Locked |
| Fixed companionship rate set by companion | Locked |
| Seeker-set budget tier at booking | Locked |
| One account, two modes (seeker / companion) | Locked |
| Companionship fee held in escrow | Locked |
| Name: JoinMyTable | Locked |
| First build: mobile-first responsive website | Locked |
| Frontend: Next.js + React on Vercel | Locked |
| Database & services: Supabase | Locked |
| Payments: Stripe Connect | Locked |
| Core screens (seeker path) wireframed | Done |
| Database schema (ERD) | Next up |
| High-level design document | Next up |
| UML diagram | Next up |
| Sequence diagram | Next up |

---

*End of plan. Next deliverables: high-level design document, database schema (ERD), UML diagram, and sequence diagram.*
