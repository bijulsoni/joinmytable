# Deploy guide — JoinMyTable closed beta

Step-by-step instructions to take the app from local dev to a public
URL with invite-gated sign-ups. Total time: **~60–90 minutes**.

You do the clicks where this guide says **YOU**. Hand the resulting
env vars over and I (Claude) do the wiring where it says **CLAUDE**.

Beta scope: no real Stripe yet — fee UI stays visible everywhere but
the actual money loop is mocked. See `agents/RUNBOOK.md` Phase 4 for
the payments wire-up that comes later.

---

## Pre-flight (5 min)

Tools you'll want installed locally:

```bash
brew install supabase/tap/supabase   # Supabase CLI (optional but handy)
brew install vercel-cli              # Vercel CLI (you'll use this once)
```

Accounts you'll need:

- [ ] Supabase account → https://supabase.com
- [ ] Vercel account → https://vercel.com (free Hobby tier is fine)
- [ ] Sentry account → https://sentry.io (free Developer tier)
- [ ] Optional: a domain. Cloudflare Registrar or Namecheap. Skip this
      for the first deploy — the free `*.vercel.app` URL is fine for
      the friends-and-family cohort.

---

## Step 1 — Create the production Supabase project — **YOU** (10 min)

1. Sign in at https://supabase.com/dashboard
2. Click **New project**
3. Settings:
   - **Name:** `joinmytable-prod`
   - **Database password:** generate a strong one and **paste it into your
     password manager** — you cannot retrieve it later, and we need it
     for migrations
   - **Region:** pick the one closest to your friend cohort. US West
     (Oregon) is a safe default for a Seattle-based circle.
   - **Plan:** Free is fine for beta. Upgrade to Pro ($25/mo) only when
     you outgrow the 500 MB DB cap (probably never during beta).
4. Wait ~2 minutes for the project to provision.

Once it's up, from the project dashboard grab these — you'll need them
all:

| Where in the dashboard                                              | What it's called                                               | What we call it                                              |
| ------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| Project Settings → API → Project URL                                | `https://xxxxx.supabase.co`                                    | `NEXT_PUBLIC_SUPABASE_URL`                                   |
| Project Settings → API → Project API keys → `anon` `public`         | a long JWT                                                     | `NEXT_PUBLIC_SUPABASE_ANON_KEY`                              |
| Project Settings → API → Project API keys → `service_role` `secret` | a different long JWT                                           | `SUPABASE_SERVICE_ROLE_KEY` ⚠️ never put this in client code |
| Project Settings → Database → Connection string → URI               | `postgresql://postgres:...@db.xxxxx.supabase.co:5432/postgres` | `DATABASE_URL`                                               |

**Drop these into a file named `.env.production.local` in the repo root
(I'll never commit it; it's already in `.gitignore`).** Format:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.xxxxx.supabase.co:5432/postgres
```

When this file exists, **tell Claude "env file ready"** and we continue.

---

## Step 2 — Apply migrations to production — **CLAUDE** (5 min)

I'll run (against your `.env.production.local`):

```bash
DATABASE_URL=...your prod URL... npm run db:migrate
```

This applies every migration in `supabase/migrations/` in order. The
migrations are idempotent (`create ... if not exists`) so re-running is
safe.

Verifies the new tables landed:

```bash
node -e "..." # check invite_codes, feedback_reports, companion_profiles exist
```

---

## Step 3 — Seed the demo companions — **CLAUDE** (5 min)

Optional but recommended: seed `seeker-demo` + `companion-demo` + a
handful of geographically-scattered companion profiles so `/discover`
isn't empty on day one. Same script as dev:

```bash
node scripts/seed-test-accounts.mjs
```

This creates the demo accounts + 5 verified companions around Seattle
and SF. Your real beta users will see those alongside any organic
sign-ups.

---

## Step 4 — Wire Sentry for error monitoring — **YOU + CLAUDE** (10 min)

**YOU:**

1. Sign up at https://sentry.io and create a new project
   - Platform: **Next.js**
   - Name: `joinmytable`
2. Copy the DSN it gives you. Looks like `https://abc123@o123.ingest.sentry.io/456`
3. Add to `.env.production.local`:
   ```
   SENTRY_DSN=https://...
   NEXT_PUBLIC_SENTRY_DSN=https://...
   ```

**CLAUDE** will run `npx @sentry/wizard@latest -i nextjs` and verify
the auto-generated config matches what we want (it's mostly fine
out-of-the-box).

---

## Step 5 — Deploy to Vercel — **YOU** (15 min)

1. Push the current branch to GitHub if you haven't (already done).
2. Go to https://vercel.com/new
3. **Import Git Repository** → pick `bijulsoni/joinmytable`
4. Project settings:
   - **Framework Preset:** Next.js (auto-detected)
   - **Build Command:** `next build` (default)
   - **Output Directory:** `.next` (default)
   - **Install Command:** `npm install` (default)
5. **Environment Variables** — add every line from your
   `.env.production.local` here. Make sure to mark `SUPABASE_SERVICE_ROLE_KEY`,
   `SENTRY_DSN`, and `DATABASE_URL` as **Production-only** (uncheck
   Preview/Development on those rows).
6. Click **Deploy**.

The first deploy takes ~3 minutes. Watch the build logs for type errors
or missing env vars.

When it's green, you'll get a URL like `joinmytable-xxx.vercel.app`.
**Open it. You should see the landing page.**

---

## Step 6 — Smoke test — **CLAUDE + YOU** (15 min)

I'll run a manual smoke flow against the prod URL:

1. Sign-up with one of the seeded invite codes → verifies the
   invite-code gate is working
2. Set up companion profile + upload a photo → verifies Storage is
   wired
3. Open another browser as a second user → request a meal →
   verifies the geo search + booking loop
4. Accept the request → verifies realtime
5. Send a chat message → verifies messaging
6. Submit a feedback report → verifies `/api/feedback`

If any of these fail, I'll surface the Sentry stack trace and we fix
before continuing.

---

## Step 7 — Mint the first invite batch — **CLAUDE** (2 min)

Once the smoke is clean:

```bash
node scripts/db/mint-invite-codes.mjs --count 20 --note "first beta cohort"
```

I'll paste the codes back to you so you can share with your friend
circle.

If you want unlimited single-share codes (e.g., one code for your
Twitter thread):

```bash
node scripts/db/mint-invite-codes.mjs --count 1 --max-uses 100 --note "twitter"
```

---

## Step 8 — Optional: custom domain — **YOU** (10 min)

Skip for first deploy. When ready:

1. Buy a domain (`joinmytable.app`, `.io`, `.cafe` — your call)
2. In Vercel → Settings → Domains → Add `joinmytable.app`
3. Vercel gives you DNS records to set. Add them at your registrar.
4. SSL provisions automatically within a few minutes.

---

## Running the app in beta — daily ops

### Monitoring feedback

Users submit via UserMenu → "💬 Report an issue". Read the inbox:

```bash
DATABASE_URL=...prod... psql -c "
  select created_at, category, body, url, user_id
  from feedback_reports
  order by created_at desc
  limit 20;
"
```

Or in the Supabase dashboard → Table Editor → `feedback_reports`.

### Verifying new companions

When someone signs up and sets up a companion profile, they're not
discoverable until you verify them. To see who's pending:

```bash
node scripts/db/verify-companion.mjs --list
```

To verify someone after reviewing their photos:

```bash
node scripts/db/verify-companion.mjs --email someone@example.com
```

To revoke if something looks off later:

```bash
node scripts/db/verify-companion.mjs --email someone@example.com --revoke
```

### Minting more invite codes

```bash
node scripts/db/mint-invite-codes.mjs --count 10 --note "round 2"
```

---

## Phase 4 — Payments — what changes when you turn money on

Not in this deploy, but for reference: when you're ready to enable real
payments, the changes are mostly additive:

1. Sign up for Stripe + complete Stripe Connect onboarding
2. Add `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` to Vercel env vars
3. I'll wire Stripe Elements into the request composer, PaymentIntent
   creation, transfer-on-complete, refund-on-cancel, webhook handler
4. Flip the "Waived during beta" badge off

See `agents/RUNBOOK.md` Phase 4 for the full breakdown.

---

## Rollback

If something is on fire in production:

1. **Vercel** → Deployments → click any previous green deploy → "Promote
   to Production". Instant rollback.
2. If a migration broke the DB: the migrations are idempotent and
   additive, so rollback usually means a manual `DROP` of the offending
   table/policy. Ping me with the error and I'll write the recovery SQL.

---

## Beta health checks

A short list to glance at weekly:

| Check                                | Where                                                                                            | What's healthy                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Sentry error rate                    | sentry.io/organizations/.../issues                                                               | < 1 unique error per 100 sessions                |
| Feedback reports                     | `select count(*) from feedback_reports where created_at > now() - interval '7 days'`             | Steady flow — silence often means people gave up |
| New companions awaiting verification | `verify-companion.mjs --list`                                                                    | Aim to clear within 24h                          |
| Discover empty for a city?           | `select service_area, count(*) from companion_profiles where verified_at is not null group by 1` | At least 3 companions per active city            |
