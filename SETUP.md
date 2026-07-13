# Ads OS — multi-brand upgrade

What changed and how to get it live. This turns ads-os from a single-tenant
app (one Shopify store, one Meta account, hardcoded to JULKÉ) into a real
multi-brand app: every brand you add gets its own Shopify + Meta + Google
Ads connection, stored server-side, permanently. Nothing gets revoked when
you switch brands anymore — that was the actual bug behind "Shopify only
lets us connect one store at a time."

## What's new

- `sql/schema.sql` — Postgres schema: a `brands` table and a `credentials`
  table (one row per brand per platform: Shopify, Meta, or Google).
- `api/_lib/db.js` — the credential store all the API routes now read from.
- `api/oauth.js` — rewritten to be brand + platform aware. Old version only
  did Shopify, for one hardcoded store, and made you copy-paste the token
  into an env var by hand. New version handles Shopify, Meta, and Google,
  for any brand, and writes the token straight into the database.
- `api/shopify.js`, `api/meta.js` — same actions as before (summary,
  products, inventory, customers, campaigns, adsets, ads, etc.), but every
  call now takes `?brand=<id>` and pulls that brand's token from the DB
  instead of a single global env var.
- `api/google.js` — brand new. Google Ads wasn't wired into this app at
  all before. Pulls live (spending) campaigns only — the account has 30+
  dead legacy campaigns and only 1-2 are ever actually live, so it filters
  to `cost > 0` automatically, same as what's already proven out on the
  Cowork dashboard.
- `api/brands.js` — registry endpoint the frontend uses to list brands and
  their per-channel connection status.
- `src/App.jsx`, `src/Dashboard.jsx`, `src/AIActions.jsx` — the existing
  brand system (it already had a brand switcher + localStorage brand
  objects!) now also: syncs each brand to the server on save, shows
  Connect buttons for Shopify/Meta/Google that kick off the new OAuth flow,
  shows a live Google Ads panel on the dashboard, and no longer hardcodes
  "JULKÉ" / PKR / 10M anywhere — every brand gets its own name, currency,
  budget and revenue target pulled from what you fill in on that brand.

## 1. Provision a database

In the Vercel dashboard: **Project → Storage → Create Database → Postgres**
(this is Neon under the hood now — that's fine, it's the same thing Vercel
Postgres migrated to). Attaching it to the project auto-injects a
`DATABASE_URL` env var, which is all `api/_lib/db.js` needs.

Then run the schema once, either:
- Vercel dashboard → your Postgres store → **Query** tab → paste the
  contents of `sql/schema.sql` → run, or
- `psql "$DATABASE_URL" -f sql/schema.sql` from your machine.

This creates the `brands` and `credentials` tables and seeds `julke` and
`qalb` as starter brands.

## 2. Env vars to set in Vercel (Project → Settings → Environment Variables)

Already there (keep as-is):
- `VITE_ANTHROPIC_API_KEY`

New, required for OAuth to work:
- `APP_URL` — `https://ads-os-dusky.vercel.app` (or your domain)
- `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` — from your Shopify Partner
  app (same app you already had for the JULKÉ-only OAuth; the client ID
  was previously hardcoded in `api/oauth.js` as `9326cb7a5ede0cdeb5c237c9c93f0fd8` — move it here)
- `META_APP_ID`, `META_APP_SECRET` — from your Meta developer app (needed
  for the Meta OAuth dialog; before this, Meta access was env-var-only via
  `META_ACCESS_TOKEN`, no OAuth flow at all)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — OAuth2 client from Google
  Cloud Console, with the Google Ads API enabled
- `GOOGLE_DEVELOPER_TOKEN` — from your Google Ads Manager account (API
  Center). This is almost certainly the "Ads OS Manager" MCC, account
  2033434429, that's already set up.

No longer used / safe to remove once every brand is connected through the
new flow: `SHOPIFY_ACCESS_TOKEN`, `SHOPIFY_STORE`, `META_ACCESS_TOKEN`,
`META_AD_ACCOUNT_ID`. `META_PAGE_ID` still works as a fallback if a brand
doesn't have its own page id set.

## 3. Add a brand and connect its accounts

1. Open the app → **+ Brand** → fill in name, currency, monthly budget,
   monthly revenue target, and (if known) Meta Account ID / Google Account
   ID / Shopify store domain.
2. Save. The brand's Overview tab now shows a **Connect →** link next to
   each platform you filled in an ID for.
3. Click Connect for Shopify — this sends you through the real Shopify
   OAuth screen (not the old copy-paste-a-token flow) and stores the
   token against that brand only.
4. Same for Meta and Google Ads.
5. Repeat for every brand — JULKÉ, Qalb, anything else. Each one keeps its
   own tokens forever. Opening Qalb's dashboard never touches JULKÉ's
   Shopify session and vice versa.

## Known limitations / next things to tighten up

- The Meta OAuth flow currently expects you to already know the target ad
  account ID (`accountId`) rather than listing the accounts your Business
  Manager has access to and letting you pick — fine for the handful of
  brands you run today, worth automating if this grows past a dozen.
- `api/campaign-builder.js`'s ad creation still uses a Meta pixel id that
  was hardcoded to JULKÉ's pixel (`159491121353858`) as a fallback default
  in a couple of spots. Add a `metaPixelId` field to the brand form if you
  start creating live campaigns for a second brand through the wizard.
- Budget math (`daily_budget` in Meta's minor currency unit) assumes PKR's
  100 paise = 1 rupee convention. Fine for PKR brands; double-check the
  multiplier if you connect a brand billed in a currency with a different
  minor-unit ratio.
- `CampaignChecklist`/`CampaignTracker` state is still keyed by a
  `julke_campaigns` localStorage key — harmless in practice since Meta
  campaign IDs are globally unique, but worth renaming for clarity.
