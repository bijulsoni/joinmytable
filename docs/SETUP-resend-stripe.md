# Setup: Resend (email) + Stripe (seeker payments)

One-time setup you (founder) do in the dashboards. When each is done, hand
Claude the keys (they go in `.env.production.local`, never committed) and
the email + Checkout features get wired. Both are built/tested in TEST mode
first.

---

## Part 1 — Resend (so the app can send "you got a request" emails)

Resend is an email-sending service (already chosen in the stack). The app
calls it to send notifications. ~3,000 emails/month free — plenty for beta.

1. **Create account** → https://resend.com → sign up.
2. **Add your domain** → Resend dashboard → **Domains → Add Domain** →
   enter `konnly.com`.
3. **Add the DNS records Resend shows you** (SPF + DKIM, a few `TXT`/`CNAME`
   rows) at wherever your DNS lives (Cloudflare / your registrar / Vercel
   Domains). This proves you own the domain so mail doesn't go to spam.
   - In Cloudflare: DNS → Add record → paste each one exactly. Turn the
     proxy (orange cloud) **OFF** for these records.
4. Wait for Resend to show the domain as **Verified** (minutes to an hour).
5. **Create an API key** → Resend → **API Keys → Create** → copy it
   (starts with `re_...`). You only see it once.
6. **Send it to Claude** (or paste into `.env.production.local`):
   ```
   RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
   RESEND_FROM="Konnly <hello@konnly.com>"
   ```

That's it — Claude wires the request/accept/message/verified emails.

> Don't want to do DNS yet? You can test with Resend's sandbox domain, but
> real beta emails should use `konnly.com` or they'll likely land in spam.

---

## Part 2 — Stripe (so seekers pay the fee with a card, not your Venmo)

Stripe Checkout gives the seeker a clean, branded card page. Money lands in
your Stripe account; you pay companions manually (Venmo/Zelle) for now.

1. **Create account** → https://stripe.com → sign up. You can build the
   whole flow in **Test mode** (toggle top-right) before activating the
   account — no business details needed to test.
2. **Get your API keys** → Stripe dashboard → **Developers → API keys**:
   - **Secret key** (test): starts `sk_test_...`
   - (Publishable key isn't needed — Checkout is server-created.)
3. **Send the secret key to Claude** / add to `.env.production.local`:
   ```
   STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxx
   ```
4. **Webhook** (so payments auto-mark "paid" in Konnly without you checking
   Stripe): Claude will create the endpoint at `/api/payments/webhook` and
   tell you the URL. Then you:
   - Stripe → **Developers → Webhooks → Add endpoint**
   - URL: `https://www.konnly.com/api/payments/webhook`
   - Event: `checkout.session.completed`
   - Copy the **Signing secret** (`whsec_...`) and send it:
     ```
     STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
     ```
5. **Test it** with Stripe's test card `4242 4242 4242 4242`, any future
   expiry, any CVC. No real money moves in test mode.
6. **Going live later:** activate the account (business + bank details),
   swap the test keys for live `sk_live_...` / new webhook secret, redeploy.

---

## What Claude builds once keys arrive

- Resend key → request / accept / new-message / verified emails.
- Stripe keys → dynamic Checkout for the seeker fee + webhook that flips the
  booking to **paid** automatically.

Until the keys are in, everything else (founding badge, "mark complete",
admin bookings view, etc.) ships independently.
