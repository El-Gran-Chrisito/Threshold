# Selling Threshold

This guide takes Threshold from this repository to a paid product. It uses Stripe for payments, a small license server on Cloudflare Workers, and any static host for the site. Each step lists what to do and how to check it.

## What is already built

| Part | Where |
| --- | --- |
| Plans (Free, Pro, Studio), features per plan, prices | `src/product/plans.ts` |
| Upgrade sheet, plan badge, trial, one-time Build Pass, license key entry | `src/ui/Paywall.tsx`, `src/product/entitlements.ts` |
| Feature gates (designs limit, watermark, exports, electrical, assistant, styles, surroundings, branding, presentation) | `src/product/gates.ts` and the buttons that call `requireFeature` |
| Signed license keys, checked offline in the app | `src/product/license.ts` |
| License key tool (create keys, issue keys by hand) | `scripts/license-keys.ts`, run with `bun run license` |
| License server: checkout → license, renewals, design sync | `server/license-server.ts`, `server/worker.ts`, `server/wrangler.toml` |
| Marketing page with pricing | `home.html`, `src/landing/` |
| Legal page templates | `public/legal/` |
| Host routes (`/` = marketing page, `/app` = app) | `public/_redirects` (Netlify), `vercel.json` (Vercel) |
| Build settings | `.env.example` |

## How a sale works

1. A visitor opens the app from the marketing page and designs for free.
2. They reach a paid feature. The upgrade sheet opens. They can start the 7-day Pro trial or choose a plan.
3. "Choose Pro" opens your Stripe Payment Link.
4. After payment, Stripe sends them back to `https://YOUR-SITE/app?checkout_session=cs_...`.
5. The app sends that id to the license server. The server asks Stripe if the payment is complete and returns a signed license key.
6. The app checks the key's signature with the public key built into the app, stores it and unlocks the plan.
7. A few days before a subscription key ends, the app asks the server for a new one. The server gives one only while the Stripe subscription is active.

## Step 1: create your signing keys

```bash
bun run license init
```

This writes `.license/private.jwk` (git-ignored) and prints two settings:

- `VITE_LICENSE_PUBLIC_KEY`: goes into the site build.
- `LICENSE_PRIVATE_KEY`: goes into the license server as a secret.

Keep the private key secret and back it up (for example in a password manager). If you lose it, keys you already issued still work, but you cannot issue or renew keys until you create a new pair and rebuild the app.

Check: `bun run license issue --plan pro --email you@example.com --days 30` prints a key that starts with `THR1.`.

## Step 2: set up Stripe

1. In the Stripe dashboard, create two products: **Threshold Pro** and **Threshold Studio**.
2. Give each product a monthly and a yearly recurring price (defaults: Pro $12 / $96, Studio $29 / $288, as in `src/product/plans.ts`).
3. Tell the server which plan each price sells. Use one of these:
   - Set a **lookup key** on each price: `pro_monthly`, `pro_yearly`, `studio_monthly`, `studio_yearly`, or
   - Add metadata `plan = pro` or `plan = studio` to each product, or
   - List the price ids in the server's `PRICE_PLANS` setting.
4. Create a **Payment Link** for each of the four prices. In each link, under *After payment*, choose *Don't show confirmation page* and redirect to:
   `https://YOUR-SITE/app?checkout_session={CHECKOUT_SESSION_ID}`
5. Optional, for people planning one home: create a product **Threshold Pro Build Pass** with a **one-time** price of $49. Add metadata `plan = pro` and `days = 183` to the product (the server also treats any price whose lookup key or product name contains "pass" as 183 days). Make a Payment Link for it with the same redirect, and put it in `VITE_CHECKOUT_PRO_PASS`. Buyers get a key that ends after 183 days and never renews; a one-time price without `days` gives a key that never ends (a lifetime deal).
6. Turn on the **customer portal** (Settings → Billing → Customer portal) and copy its login link. Subscribers use it to cancel or change their card.

Do all of this in **test mode** first.

## Step 3: deploy the license server

With Cloudflare (free tier is enough):

```bash
cd server
npx wrangler login
npx wrangler secret put STRIPE_SECRET_KEY      # sk_test_... first, sk_live_... later
npx wrangler secret put LICENSE_PRIVATE_KEY    # the JSON printed by `bun run license init`
npx wrangler deploy
```

Set `ALLOWED_ORIGIN` in `wrangler.toml` to your site's address, and `PRICE_PLANS` if you used price ids in step 2.

### Emailing license keys (recommended)

Without this, a buyer gets their key only in the browser they paid in. With it, the server emails each buyer their key after checkout, and "Email me my key" in the app sends lost keys to the address that paid.

1. Create a free account at [resend.com](https://resend.com) and verify your sending domain.
2. `npx wrangler secret put RESEND_API_KEY`
3. In `wrangler.toml` under `[vars]`, set `EMAIL_FROM = "Threshold <keys@your-site.example>"` and, optionally, `SUPPORT_EMAIL` for replies.

With the design-sync store (below) in place, each purchase is emailed once and recovery is limited to 3 requests per address per hour. The recovery answer is the same whether or not the address bought anything.

### Design sync (Pro and Studio)

Paying customers' designs follow them to every device where they enter their key. The license server stores them in a Cloudflare KV namespace:

```bash
npx wrangler kv namespace create DESIGNS
```

Paste the printed id into the `[[kv_namespaces]]` block in `wrangler.toml`, remove the `#` marks, and deploy again. Without it, the app keeps designs in the browser only and the server answers design requests with `501`.

Limits per customer: 300 designs, 2 MB each. A customer is identified by their Stripe subscription (or email for keys issued by hand), so a renewed key keeps the same designs.

The same handler (`handle` in `server/license-server.ts`) also runs on Vercel, Netlify, Deno or Bun: call it from that platform's request handler and pass the same settings.

Check: `curl -X POST https://YOUR-WORKER/activate -d '{"sessionId":"cs_test_x"}'` answers `{"error":"Checkout session not found"}` (the server is up and reaching Stripe).

## Step 4: build and host the site

Set these in your host's build settings (or `.env.local` for a local build). See `.env.example`.

| Setting | Value |
| --- | --- |
| `VITE_LICENSE_PUBLIC_KEY` | from step 1 |
| `VITE_LICENSE_API` | your license server address |
| `VITE_CHECKOUT_PRO_MONTHLY`, `..._PRO_YEARLY`, `..._STUDIO_MONTHLY`, `..._STUDIO_YEARLY` | the four Payment Links |
| `VITE_CHECKOUT_PRO_PASS` | the Build Pass Payment Link (optional) |
| `VITE_SITE_URL` | your site address, e.g. `https://threshold.example` (link previews, search data, sitemap) |
| `VITE_BILLING_PORTAL_URL` | the customer portal login link |
| `VITE_SUPPORT_EMAIL` | where customers write to you |
| `VITE_APP_PATH` | `/app` |

Build command: `bun install && bun run build`. Publish folder: `dist`.

- **Netlify**: `public/_redirects` is included.
- **Vercel**: `vercel.json` is included.
- **Cloudflare Pages**: copy `public/_redirects` and remove the `!` after `200`.

Check: `/` shows the marketing page, `/app` opens the app, and the upgrade sheet shows "Choose Pro" buttons instead of "Checkout is not connected". `/sitemap.xml` lists the pages, and pasting your address into a chat app shows the street picture as its preview.

## Step 5: test a purchase end to end

1. In Stripe test mode, open the app, click **Upgrade → Choose Pro**, pay with card `4242 4242 4242 4242`.
2. You return to the app with a "Pro is active" message and the badge shows **Pro**.
3. In Stripe, cancel the test subscription. After the period ends (use a test clock to skip ahead), the app no longer renews the key and returns to Free. Designs stay.

Then switch Stripe to live mode: new live prices and Payment Links, the live secret key on the server, and a rebuild with the live links.

## Step 6: legal pages

Fill in the bracketed details in `public/legal/terms.html`, `privacy.html` and `refunds.html` and have them reviewed for the countries you sell in. Stripe asks for links to terms, privacy and refund policies before it activates live payments.

## Other ways to sell

- **Manual or invoiced sales**: `bun run license issue --plan studio --email buyer@firm.com --days 365` and email the key. Buyers paste it under **Upgrade → I have a license key**.
- **Lifetime deals**: issue keys with `--days 0` (no expiry).
- **Other payment providers** (Lemon Squeezy, Paddle, Gumroad): put their checkout links in the `VITE_CHECKOUT_*` settings and issue keys by hand, or add a route to the license server that checks their order API the same way `/activate` checks Stripe.

## Changing what each plan includes

Everything is in `src/product/plans.ts`:

- `FEATURES` says which plan unlocks each feature.
- `FREE_LIMITS` sets the free design count and free styles.
- `PLANS` holds prices, taglines and the bullet lists shown in the app and on the marketing page.

Change a price in Stripe and in `PLANS` together.

## Good to know

- All checks run in the browser. A determined person can bypass them by editing the code; license keys stop casual sharing and keep honest customers on the right plan. Features that cost you money to run (for example a hosted AI assistant) should be checked on a server too.
- Nothing leaves the device by default. Funnel events (`paywall_shown`, `upgrade_clicked`, `trial_started`, `license_activated`) go to Plausible if you add its script to `home.html` and `index.html`; otherwise they stay in memory.
- The 7-day trial is stored in the browser, so clearing site data restarts it. Accept this for the first launch or move trials to the server later.
- `bun run build:single` still makes the one-file version used as a Claude artifact. It has no checkout or license server settings unless you build it with them.
