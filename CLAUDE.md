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

**`site_1.jsx` at the repo root is the entire app** (~7,700 lines). This is
counterintuitive and worth re-reading:

- `src/main.jsx` mounts `src/App.jsx`
- `src/App.jsx` is a ~10-line shim that wraps `../site_1.jsx` in a router + AuthProvider
- Components, routes, product data, articles, cart, checkout — all in `site_1.jsx`

Do not go looking for components under `src/`. They are not there.

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

`npm run build` works (the old rolldown native-binding failure is gone — verified
2026-08-06). It does two things:

1. `vite build`
2. `node scripts/check-bundle-secrets.js` — scans `dist/` and **exits non-zero** if a
   server-only secret made it into the browser bundle, which fails the Netlify deploy.

Then run ESLint:

```
node node_modules/eslint/bin/eslint.js site_1.jsx
```

Baseline is 1 error (an intentional empty `catch`) and 1 warning. Anything beyond that
is new and should be fixed before pushing. The `react-hooks` plugin here will catch the
hook-ordering and nested-component mistakes described above.

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
