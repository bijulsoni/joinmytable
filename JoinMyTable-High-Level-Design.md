# JoinMyTable — High-Level Design Document

*Engineering-facing design of record. Where the Implementation Plan covers the **what** and **why**, this document covers the **how**: system architecture, component breakdown, the design of each key subsystem, external integrations, and technical risks. It does not specify line-level implementation — that belongs in detailed design and code.*

**Companion documents:** Implementation Plan · Database Schema (ERD) · UML Diagram · Sequence Diagram

---

## 1. Introduction

### 1.1 Purpose
To give anyone building JoinMyTable a clear technical picture of how the system is structured and how its parts work together, before code is written.

### 1.2 Scope
Covers the MVP: a mobile-first responsive website for lunch and dinner companionship. Native apps and PWA capabilities are noted where they affect design decisions but are out of scope for detailed design.

### 1.3 Audience
Founders, engineers, and technical collaborators picking up the project.

---

## 2. System overview

JoinMyTable is a two-sided marketplace. At the highest level, the system must:

1. Let users create accounts and act as **seekers**, **companions**, or both.
2. Let seekers **discover** nearby companions using location.
3. Let seekers **request** a meal, and companions **accept or decline**.
4. Provide **in-app messaging** for coordination once matched.
5. Take a **payment** (the companionship fee), hold it in **escrow**, and **release** it after the meal.
6. Capture **two-way reviews** to maintain trust.

The architecture is intentionally lean: one application to build and deploy (a Next.js app on Vercel), one managed data platform (Supabase), and three external services that are configured rather than built (Stripe Connect, a Maps API, an email service).

---

## 3. Architecture

### 3.1 Architecture style
A **full-stack Next.js application**: the React frontend and the backend API routes live in a single codebase and deploy together. This minimizes operational overhead during validation. The backend can be extracted into a standalone service later if scale demands it — see Section 10.

### 3.2 Logical components

**Client (browser)**
- Mobile-first responsive React UI
- Handles location access (with user permission), map rendering, and realtime chat subscription

**Application layer (Next.js on Vercel)**
- *Frontend:* server-rendered and client-rendered React pages
- *Backend:* API routes grouped by domain (accounts, profiles, search, requests, bookings, payments, messaging, reviews, notifications)

**Data & platform layer (Supabase)**
- PostgreSQL database (with PostGIS for geo-queries)
- Authentication
- Realtime (powers chat)
- File storage (profile photos)

**External services**
- Stripe Connect — payments, escrow, payouts
- Maps API (Google Maps or Mapbox) — geocoding, map display, restaurant lookup
- Email service (e.g. Resend) — transactional email

### 3.3 Deployment topology
- **Vercel** hosts the Next.js app (frontend + API routes), with automatic deploys from the Git repository.
- **Supabase** is a managed cloud service holding the database, auth, realtime, and storage.
- External services are reached over their APIs from the backend.

A high-level architecture diagram accompanies this document; the UML and sequence diagrams detail structure and behavior further.

---

## 4. Frontend design

### 4.1 Structure
A Next.js app organized by route, each route corresponding to a core screen: sign-up/mode select, discovery, companion profile, request a meal, chat, confirm & pay, plus companion-side profile setup, bookings list, reviews, and a safety screen.

### 4.2 Responsive approach
Designed mobile-first: every screen is laid out for a phone viewport first, then allowed to expand for wider screens. This keeps the eventual React Native transition a port rather than a rebuild.

### 4.3 State management
- **Server state** (profiles, requests, bookings) is fetched from the backend and cached on the client; treated as the source of truth.
- **Local UI state** (form inputs, filter selections) stays in component state.
- **Realtime state** (chat messages, booking status changes) arrives via a Supabase realtime subscription.

### 4.4 Client-side concerns
- **Location:** requested with explicit user permission; used to parameterize discovery queries.
- **Maps:** the Maps API renders the discovery map and powers restaurant search in the booking flow.
- **Auth session:** the Supabase client library manages the session token; the UI reflects logged-in/out state.

---

## 5. Backend design

### 5.1 API organization
Backend logic is exposed as Next.js API routes, grouped by domain module:

| Module | Responsibility |
|--------|----------------|
| `accounts` | Sign-up, login, account/mode management |
| `profiles` | Companion profile CRUD, identity verification status, photo references |
| `search` | Location-based companion discovery, filtering |
| `requests` | Meal request lifecycle (create, accept, decline) |
| `bookings` | Confirmed bookings, restaurant/budget details, status transitions |
| `payments` | Stripe Connect integration, escrow, payouts, refunds |
| `messaging` | Chat thread and message persistence |
| `reviews` | Two-way review capture and aggregation |
| `notifications` | Triggering transactional emails |

### 5.2 API conventions
- RESTful resource-oriented endpoints.
- Every endpoint authenticates the caller via the Supabase session and authorizes the action (e.g. only the owning companion can accept a request addressed to them).
- Inputs validated server-side; the client is never trusted.

### 5.3 Business rules enforced server-side
- A seeker pays both the companionship fee and the meal; the fee amount comes from the companion's fixed rate.
- Chat is unlocked only after a request reaches `accepted`.
- Escrow release is gated on the booking reaching `completed`.
- Reviews can only be left for a `completed` booking.

---

## 6. Data layer

### 6.1 Database
PostgreSQL via Supabase. Six core entities (full fields and relationships in the Database Schema document):

- **users** — base account; may act as seeker and/or companion
- **companion_profiles** — rate, bio, service area, availability, photo references
- **meal_requests** — a seeker's request to a companion
- **bookings** — a confirmed meal with payment/escrow state
- **messages** — in-app chat messages
- **reviews** — two-way ratings tied to a completed booking

### 6.2 Geo-search
The PostGIS extension stores companion service areas / locations as geographic data, enabling efficient "companions within N km of a point" queries that back the discovery screen.

### 6.3 File storage
Profile photos are held in Supabase storage; the database stores references (paths/URLs), not binary data.

---

## 7. Key subsystem designs

### 7.1 Authentication & identity verification
- **Authentication** is handled by Supabase Auth (email/password to start).
- **Identity verification** is a separate, stronger layer for companions, who are paid and chosen by strangers. Verification status is a field on the profile; an unverified companion cannot be discovered or booked. Seekers undergo lighter verification for accountability.

### 7.2 Discovery & geo-search
1. The client obtains the user's location (with permission) or a chosen destination city.
2. The `search` module queries companion profiles within range using PostGIS, applying filters (meal type, date/time, price, rating, languages, interests).
3. Results return as a list and as map markers.

### 7.3 Booking lifecycle
The heart of the system. A request/booking moves through a defined set of states:

| State | Meaning | Next states |
|-------|---------|-------------|
| `requested` | Seeker has sent a request to a companion | `accepted`, `declined` |
| `declined` | Companion declined | *(terminal)* |
| `accepted` | Companion accepted; chat unlocked; details being coordinated | `confirmed`, `cancelled` |
| `confirmed` | Restaurant, time, and budget set; fee paid into escrow; both parties confirmed | `completed`, `cancelled` |
| `completed` | Meal took place; escrow released to companion | *(terminal; reviews enabled)* |
| `cancelled` | Either party cancelled before the meal | *(terminal; triggers refund logic)* |

State transitions are enforced server-side. The sequence diagram details the `requested → completed` happy path.

### 7.4 Payments & escrow
Built on **Stripe Connect**:

- **Companion onboarding:** each companion is set up as a Stripe connected account so they can receive payouts.
- **Charge:** when a booking is confirmed, the seeker is charged the companionship fee. Funds are held by the platform rather than immediately paid out — this is the escrow.
- **Release:** when the booking reaches `completed`, the fee (minus the platform's cut) is transferred to the companion's connected account.
- **Refund:** on `cancelled`, the held fee is refunded to the seeker, subject to the cancellation policy (policy details are an open question in the Implementation Plan).
- **Card data** never touches JoinMyTable servers — it goes directly to Stripe. This is a deliberate security boundary.
- **The restaurant bill** is paid in person by the seeker and is entirely outside the system.

### 7.5 Messaging
- Chat threads are tied to an accepted request/booking.
- Messages persist in the `messages` table; delivery to the client is realtime via Supabase realtime subscriptions.
- System messages (e.g. "booking confirmed") are written to the same thread to give it a coherent timeline and an auditable record.

### 7.6 Notifications
- The MVP uses **transactional email** for key events: request received, accepted, declined, booking confirmed, meal reminder, payment confirmation, review prompt.
- The `notifications` module is the single place that triggers these, so adding push notifications later (PWA/native stage) is a localized change.

---

## 8. External integrations

| Service | Used for | Integration point |
|---------|----------|--------------------|
| **Supabase** | Database, auth, realtime, file storage | Client library (frontend) and server-side (backend) |
| **Stripe Connect** | Companionship fee charges, escrow, payouts, refunds | `payments` backend module; Stripe-hosted elements on the client for card entry |
| **Maps API** | Geocoding, map display, restaurant lookup | Client (map rendering) and backend (geocoding) |
| **Email service** | Transactional email | `notifications` backend module |

---

## 9. Security & privacy

- **Authentication & authorization:** every backend action verifies identity and checks permissions; users can only act on their own resources.
- **Payment data isolation:** card details go directly to Stripe; the platform never stores them.
- **PII handling:** personal data (contact details, identity verification data) is access-controlled; only the minimum necessary is exposed to the other party in a booking.
- **In-app messaging:** keeping coordination on-platform protects users and provides a record in case of disputes.
- **Identity verification:** gates who can offer paid companionship.
- **Content & conduct:** report/block functionality, community guidelines accepted at sign-up, public-venue-only meals.
- **Transport security:** all traffic over HTTPS.

---

## 10. Non-functional considerations

- **Performance:** geo-queries are indexed via PostGIS; server-side rendering keeps initial loads fast and companion profiles discoverable by search engines.
- **Scalability path:** the lean architecture carries the MVP and early growth. At higher scale, expected moves are: extract the backend into its own service, add a caching layer, and potentially move chat to a specialized provider. These are deliberately deferred to avoid over-engineering.
- **Availability:** Vercel and Supabase are managed platforms with their own redundancy; the MVP relies on this rather than custom infrastructure.
- **Observability:** application logging and error tracking should be in place from Phase 0 so issues are visible during validation.

---

## 11. Environments & deployment

- **Environments:** development, staging, and production, each with its own Supabase project and configuration.
- **CI/CD:** Vercel builds and deploys automatically from the Git repository; staging tracks the main branch, production is promoted deliberately.
- **Secrets:** API keys (Stripe, Maps, email, Supabase service keys) are managed as environment variables, never committed to the repository.

---

## 12. Technical risks & mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Cold-start / empty marketplace** | No companions = no usable product in a city | City-by-city launch; seed companions before opening to seekers (see Implementation Plan) |
| **Escrow / payment edge cases** (failed charges, disputes, chargebacks) | Financial and trust damage | Lean on Stripe Connect's built-in handling; define cancellation/refund policy explicitly before launch |
| **Trust & safety incidents** | Serious user harm; existential brand risk | Identity verification, two-way reviews, in-app messaging, report/block, public venues only, clear community guidelines |
| **Geo-search performance at scale** | Slow discovery | PostGIS indexing; revisit with caching if needed |
| **Vendor lock-in (Supabase, Vercel)** | Migration cost later | Accept consciously for MVP speed; the data layer is standard PostgreSQL, which eases a future move |
| **iOS PWA limitations** | Weaker notifications/experience on iPhone | Treat PWA as a bridge only; plan native React Native app for full capability |
| **Scope creep beyond lunch/dinner** | Diluted, harder-to-validate product | Hold the line on MVP scope; revisit other activities only after meals are proven |

---

## 13. Appendix

### 13.1 Glossary
- **Seeker** — a user looking for and paying for a meal companion.
- **Companion** — a user offering meal companionship for a fixed fee.
- **Escrow** — holding the companionship fee after charge and before payout, released on meal completion.
- **Budget tier** — the seeker-set expected meal cost range, chosen at booking time.
- **Connected account** — a companion's Stripe Connect account that receives payouts.

### 13.2 References
- JoinMyTable Implementation Plan
- JoinMyTable Database Schema (ERD)
- JoinMyTable UML Diagram
- JoinMyTable Sequence Diagram

---

*End of high-level design. The Database Schema, UML, and Sequence diagrams expand Sections 6, 5, and 7 respectively.*
