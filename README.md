# JoinMyTable

A two-sided marketplace for **lunch and dinner companionship**. Seekers pay a fixed fee to share a meal with a companion; companions earn the fee plus a free meal.

The MVP is a **mobile-first responsive website** built on Next.js (App Router) + Supabase + Stripe Connect.

> **Read [`CLAUDE.md`](./CLAUDE.md) first.** It is the source of truth for product rules, repository ownership, conventions, and the multi-agent build plan.

---

## Tech stack

| Layer        | Choice                                                          |
| ------------ | --------------------------------------------------------------- |
| Frontend     | Next.js 14 (App Router), TypeScript, React 18                   |
| Backend      | Next.js Route Handlers (same codebase, deployed on Vercel)      |
| Database     | Supabase (PostgreSQL + PostGIS, Auth, Realtime, Storage)        |
| Payments     | Stripe Connect (Elements on the client; webhooks on the server) |
| Maps         | Google Maps **or** Mapbox (wrapped behind `lib/maps`)           |
| Email        | Resend (wrapped behind `lib/email`)                             |
| Tests        | Vitest                                                          |
| Observability| pino + Sentry                                                   |

---

## Repository layout

See [`CLAUDE.md` § Repository structure](./CLAUDE.md). Each top-level folder lists its **owning agent** in a `.gitkeep` so cross-area edits are obvious.

---

## Prerequisites

- **Node.js 20+** (use `nvm use` — version is pinned in `.nvmrc`)
- **npm 10+** (ships with Node 20)
- A running Supabase project (or local Supabase via the Supabase CLI)
- Stripe test-mode account (for the Payments agent)
- A Google Maps or Mapbox key (for the Integrations agent)

---

## Local setup

```bash
# 1. Use the pinned Node version
nvm use

# 2. Install dependencies
npm install

# 3. Copy the env template and fill it in
cp .env.example .env.local
#    Edit .env.local with real keys for your dev Supabase / Stripe test mode.

# 4. Run the dev server
npm run dev
# -> http://localhost:3000
```

### Pre-commit hook

We use [husky](https://typicode.github.io/husky/) to run lint + type-check before each commit. `npm install` runs `husky` via the `prepare` script and creates `.husky/`. To wire up the hook itself:

```bash
cp scripts/pre-commit .husky/pre-commit
chmod +x .husky/pre-commit
```

The hook runs `lint-staged` (ESLint + Prettier on staged files) and `npm run type-check`.

---

## Commands

| Command              | Purpose                                                  |
| -------------------- | -------------------------------------------------------- |
| `npm run dev`        | Local development server                                 |
| `npm run build`      | Production build                                         |
| `npm run start`      | Run the production build locally                         |
| `npm run lint`       | ESLint (Next.js + TypeScript rules, Prettier-aware)      |
| `npm run format`     | Prettier write                                           |
| `npm run format:check` | Prettier check (CI mode)                               |
| `npm run type-check` | `tsc --noEmit`                                           |
| `npm run test`       | Vitest (single run)                                      |
| `npm run test:watch` | Vitest in watch mode                                     |
| `npm run db:migrate` | Apply DB migrations *(Database agent wires this up)*     |
| `npm run db:seed`    | Load seed data *(Database agent wires this up)*          |

---

## Environments

| Environment | Purpose                                  | Deploy            |
| ----------- | ---------------------------------------- | ----------------- |
| development | Each developer's local                   | Local             |
| staging     | Shared integration target                | Auto from `main`  |
| production  | Live site                                | Manual promote    |

Each environment maps to its own **Supabase project** and **set of secrets** in Vercel. See `.env.example` for every key any agent might need.

> Never commit a real `.env*` file. Card data, service-role keys, and Stripe secrets stay in environment storage only. See **Core product rule #10**: card data never touches our servers.

---

## CI

Every pull request runs `.github/workflows/ci.yml`:

1. Install (`npm ci`)
2. `npm run lint`
3. `npm run type-check`
4. `npm run test`

A red CI blocks merge.

---

## Observability

- **Logs:** `lib/logger.ts` exports a [pino](https://github.com/pinojs/pino) logger. Use `logger.child({ module: 'payments' })` per module. Sensitive fields (`password`, `token`, `card*`, `authorization`, `cookie`) are auto-redacted.
- **Errors:** Sentry is wired in `sentry.{client,server,edge}.config.ts`. It is a no-op until `NEXT_PUBLIC_SENTRY_DSN` is set in the environment — set it in staging/production and crash reports will flow.

---

## Working as an agent

If you are one of the JoinMyTable agents (Foundations, Database, Auth & Identity, Core API, Payments, Frontend, Integrations, QA & Testing, Trust & Safety):

1. Read [`CLAUDE.md`](./CLAUDE.md) — your **scope**, **tasks**, and **definition of done** are there.
2. Build only against **frozen contracts**. Coordinate cross-area changes through the Orchestrator.
3. Respect the **core product rules**. They are invariants.
4. Keep PRs small and scoped to your owned area.

See also: `JoinMyTable-Multi-Agent-Execution-Plan.md` for the full dependency graph and phase gates.
