# Tier One BioSystems — project notes for Claude

> **Read `HANDOFF.md` first.** It carries live state from the session of
> 2026-08-07 — including 22 mis-attributed citations currently published on the
> research pages — plus what is built, what is outstanding, and what needs the
> owner's hands in a dashboard. None of it is inferable from the code.

Storefront for research-grade peptides. Live at https://www.tierone.bio

The owner is not a developer. Explain changes in plain language, give click-by-click
steps for anything done outside the editor (Supabase, Netlify, EmailJS, Resend), and
say plainly when something needs their hands rather than mine.

## Where the code actually lives

**`site_1.jsx` at the repo root holds all the UI** (~6,300 lines):

- `src/main.jsx` mounts `src/App.jsx`
- `src/App.jsx` is a ~10-line shim that wraps `../site_1.jsx` in a router + AuthProvider
- Components, routes, cart and checkout — all in `site_1.jsx`

Do not go looking for components under `src/`. They are not there.

**The data is no longer in `site_1.jsx`.** It lives in `src/data/`, as plain modules
with no React and no browser APIs, so the build tooling can import the same values the
app renders:

| File | Holds |
|---|---|
| `src/data/catalog.js` | `PRODUCTS` — the 27 items, the source of truth for what is sold |
| `src/data/lab-results.js` | `LAB_RESULTS` — analytical summaries per lot |
| `src/data/lab-integrity.js` | the quantity reconciliation (see below) |
| `src/data/articles.js` | `ARTICLE_META` — article metadata (bodies stay in JSX) |
| `src/data/routes.js` | **the route table** — every URL, its title, description and indexability |
| `src/data/pricing.js` | `SITEWIDE_SALE`, `applySale`, `catalogPrices` |
| `src/data/cart.js` | `sanitizeCart` — localStorage is untrusted input |
| `src/data/structured-data.js` | the JSON-LD builders |
| `src/article-content.jsx` | the 13 article bodies, lazy-loaded via `src/ArticleBody.jsx` |

**Adding a route means adding it to `src/data/routes.js`.** Unmatched URLs now return a
real 404, so a `<Route>` that isn't in the table works in dev and 404s in production.
`npm run build` fails with that exact message if you forget.

**Lab summaries publish themselves.** `getLabResults()` compares the labeled quantity on
the report against the dose being sold and returns nothing if they disagree — seven
currently do. There is no hand-maintained list of exceptions to keep in sync: correct the
data and it publishes, break the data and it withholds. Never bypass it by reading
`LAB_RESULTS` directly.

Other real files: `src/AuthContext.jsx` (Supabase session/profile), `supabaseClient.js`,
`netlify/functions/` (server-side code), `email-templates/` + `email-template.html`.

## Stack

React 19 · Vite · react-router-dom v7 · Supabase (auth + Postgres) · Netlify (hosting +
functions + forms) · EmailJS (order confirmations) · Resend (SMTP behind Supabase auth mail).

All styling is inline `style={{}}`; theme colours come from CSS variables injected in a
`<style>` block inside `site_1.jsx`.

## Deploying

Netlify auto-builds from `main`. Push and it is live in ~2 minutes. There is no manual
deploy step. Commit and push directly to `main` — that is the established workflow here.

## Conventions that have caused real bugs

**Hooks before early returns.** This has broken production three separate times. Every
`useState` / `useEffect` / `useRef` / `useLocation` / `useNavigate` / `useParams` must be
called before any `if (...) return`. React counts hooks per render and a mismatch blanks
the page.

**Never trust prices on a cart item.** The cart is persisted to `localStorage` and is
customer-editable. Always resolve price/bulk from the `PRODUCTS` catalog via
`catalogPrices(item)`. Reading `item.price` directly is a price-tampering hole.

**Do not define components inside other components.** `HomePage` / `ProductsPage` /
`ProductPage` were once nested inside `App`, which remounted the whole page on every
keystroke. Keep routed pages at module top level and pass state down as props.

**CSP is enforcing** (`netlify.toml`). Any new third-party domain — analytics, fonts,
widgets, APIs — must be added to the matching directive or the browser silently blocks it.

**Sitewide sales** are driven by the single `SITEWIDE_SALE` constant at the top of
`site_1.jsx`. Flipping `active` handles banner, pricing, cart math, and hides discount
codes. Nothing else needs changing.

## Things that live outside this repo

Editing these files does **not** update the live behaviour. They must be pasted into a
dashboard by the owner:

| File | Where it must be pasted |
|---|---|
| `email-templates/auth-*.html` | Supabase → Authentication → Emails |
| `email-template.html` | EmailJS → template `template_i9k8u2a` |
| `email-templates/welcome-discount.html` | *(none — read at runtime by a Netlify function)* |

Also dashboard-only: discount codes (`DISCOUNT_CODES` env var in Netlify), Supabase URL
config and rate limits, EmailJS security settings, Resend SMTP credentials.

**No secrets in the repo.** The Supabase key in `supabaseClient.js` is the publishable
key and is meant to ship to the browser; data is protected by RLS policies, which are
enabled. Anything genuinely secret belongs in Netlify environment variables.

## Verifying changes

**`npm run verify` runs everything: lint → tests → render smoke → build.** Use it before
pushing. Baseline is zero lint problems, 50 passing tests, 11 routes rendering.

The pieces, if you need them individually:

| Command | Does |
|---|---|
| `npm run lint` | ESLint. **Baseline is now zero** errors and zero warnings — anything at all is new |
| `npm test` | 50 unit tests over pricing, cart sanitisation, lab integrity and the route table |
| `npm run smoke` | Builds the app and renders 11 routes in jsdom. Catches the blank-page failures lint cannot |
| `npm run build` | sitemap → `vite build` → prerender → secret scan → integrity check |

`npm run build` is now a five-stage pipeline, and each stage can fail the deploy:

1. `scripts/generate-sitemap.js` — regenerates `public/sitemap.xml` from the route table
2. `vite build`
3. `scripts/prerender.js` — writes real HTML for all 57 routes plus `404.html`
4. `scripts/check-bundle-secrets.js` — **exits non-zero** if a server-only secret reached
   the browser bundle
5. `scripts/check-site-integrity.js` — every `<Route>` is registered, no mismatched lab
   summary is published, the sitemap matches the route table, prerender output exists

The `react-hooks` plugin catches the hook-ordering and nested-component mistakes
described above.

**If the secret check ever fails, the key is compromised — rotate it.** Do not just
delete the line and rebuild. Anything that reached `dist/` also reached the build log.

The most likely way to trip it: giving a server-only value a `VITE_` prefix. Vite inlines
every `VITE_*` env var into the public bundle, so `VITE_SUPABASE_SERVICE_ROLE_KEY` would
be world-readable while `SUPABASE_SERVICE_ROLE_KEY` stays server-side. Same dashboard,
same-looking setting, opposite outcome.

## Debugging live problems

Supabase auth failures (signup, confirmation, password reset) are best diagnosed from
the actual logs rather than guesswork — the Supabase MCP `get_logs` tool with
`service: "auth"` gives the precise error. `get_advisors` with `type: "security"` reports
RLS gaps.
