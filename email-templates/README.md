# Tier One Bio — Auth Email Setup

Branded HTML for the Supabase auth emails, matched to the order-confirmation email.
Supabase can't be configured through code here, so these are applied in the dashboard.

Project: **tier-one-bio** (`nmafhetkofrekabqawgb`)

---

## 1. Install the templates (5 min)

Dashboard → **Authentication → Emails** (Email Templates). For each type below, set the
**Subject** and paste the matching file's HTML into the message body, then **Save**.

| Supabase template        | File                        | Subject line                              |
|--------------------------|-----------------------------|-------------------------------------------|
| Confirm signup           | `auth-confirm-signup.html`  | Confirm your Tier One BioSystems account  |
| Reset Password           | `auth-reset-password.html`  | Reset your Tier One BioSystems password   |
| Magic Link               | `auth-magic-link.html`      | Your Tier One BioSystems sign-in link     |
| Change Email Address     | `auth-change-email.html`    | Confirm your new email address            |

The templates use Supabase's variables (`{{ .ConfirmationURL }}`, `{{ .Email }}`,
`{{ .NewEmail }}`) — leave those exactly as-is.

---

## 2. Custom SMTP — send from your own domain (the important part)

Without this, mail sends from `noreply@mail.app.supabase.io`, is rate-limited to a few
per hour, and often lands in spam. Custom SMTP makes it send from `noreply@tierone.bio`.

**Recommended provider: Resend** (free tier = 3,000 emails/mo, simplest DNS setup).

1. Create an account at https://resend.com
2. **Add Domain** → enter `tierone.bio`
3. Resend shows DNS records (SPF, DKIM, and a return-path/MX). Add them wherever
   `tierone.bio` DNS is managed (likely your domain registrar or Netlify DNS). Wait for
   Resend to show the domain **Verified** (usually minutes).
4. Create an **API key** in Resend.
5. In Supabase: **Authentication → Emails → SMTP Settings → Enable Custom SMTP**, and enter:
   - **Host:** `smtp.resend.com`
   - **Port:** `465`
   - **Username:** `resend`
   - **Password:** your Resend API key
   - **Sender email:** `noreply@tierone.bio`
   - **Sender name:** `Tier One BioSystems`
6. Save. Send a test (e.g. trigger a password reset) and confirm it arrives from your domain.

Once custom SMTP is on, you can also raise the rate limits under
**Authentication → Rate Limits**.

> Note: this same verified Resend domain is also used by the server-side
> processed-order/tracking email described below. EmailJS still handles the
> original checkout confirmation email.

---

## 3. Welcome email + single-use discount code

`welcome-discount.html` is **not** a Supabase template. Supabase Auth has no
"after confirmation" template slot, so this one is sent by our own code:
`netlify/functions/send-welcome-email.js`, triggered when `email_confirmed_at`
goes from null to a timestamp.

Flow: customer confirms → webhook fires → function mints a code into
`public.discount_codes` → Resend sends the email → customer redeems at checkout →
`create-order.js` saves the order and marks the code spent in one database
transaction, so two tabs cannot use the same personal code on two orders.

### 3a. Netlify environment variables

**Site configuration → Environment variables.**

| Variable | Value |
|---|---|
| `SUPABASE_URL` | `https://nmafhetkofrekabqawgb.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key, Supabase → Settings → API Keys |
| `RESEND_API_KEY` | a Resend API key — see the warning below |
| `WELCOME_WEBHOOK_SECRET` | any long random string you invent |
| `WELCOME_DISCOUNT_PERCENT` | optional, defaults to `10` |
| `WELCOME_DISCOUNT_DAYS` | optional, defaults to `30` |

> ### There are TWO Resend API keys, and they are not interchangeable
>
> | Key | Where it lives | What breaks if you revoke it |
> |---|---|---|
> | **Auth key** | Supabase → Authentication → SMTP Settings → Password | Signup confirmations, password resets, magic links — customers cannot create accounts or get back into them |
> | **Netlify mail key** | Netlify → `RESEND_API_KEY` | Welcome + discount emails and processed-order tracking emails |
>
> They are deliberately separate so either can be rotated without taking down
> the other half of your email. Resend shows a key's value only once at
> creation, so neither can be read back from its dashboard — if you need to
> know what one is, you replace it rather than look it up.
>
> **Before revoking any key in Resend, work out which of the two it is.**
> Revoking the auth key locks new customers out of signing up, and the failure
> is silent from the site's side: signup appears to succeed and the
> confirmation email simply never arrives.

> The **service_role key is not the publishable key.** It bypasses Row-Level
> Security, which is what lets the function write `discount_codes` — a table no
> customer is allowed to write. It must never appear in the browser bundle or in
> `supabaseClient.js`. Netlify env vars are server-side only, which is why it is
> safe here and nowhere else.

Generate a secret with:

```
openssl rand -hex 32
```

### 3b. The Supabase webhook

Dashboard → **Database → Webhooks → Create a new hook**:

- **Name:** `send_welcome_email`
- **Table:** `auth.users`
- **Events:** `UPDATE` only
- **Type:** HTTP Request → `POST`
- **URL:** `https://www.tierone.bio/.netlify/functions/send-welcome-email`
- **HTTP Headers:** add `x-webhook-secret` = the same value as `WELCOME_WEBHOOK_SECRET`

Every update to `auth.users` fires this — sign-ins, password changes, metadata
edits. The function checks for the null → timestamp transition on
`email_confirmed_at` and returns "skipped" for everything else, so the noise is
expected and harmless.

### 3c. Testing it

1. Sign up with an address you control, then click the confirmation link.
2. The welcome email should arrive within a few seconds.
3. Confirm the code exists and is unspent:

   ```sql
   select code, value, expires_at, redeemed_at, order_number
   from public.discount_codes order by created_at desc limit 5;
   ```

4. Apply the code at checkout while signed in, place the order, then re-run that
   query — `redeemed_at` and `order_number` should now be populated.
5. Try the same code again. It must fail with "This code has already been used."

### If no email arrives

Run this first — it localises the failure without leaving the SQL editor:

```sql
select d.code, d.created_at, d.email_sent_at, r.status_code, r.content
from public.discount_codes d
left join net._http_response r on r.created between d.created_at - interval '5 seconds'
                                              and d.created_at + interval '5 seconds'
order by d.created_at desc limit 5;
```

| What you see | What it means |
|---|---|
| No code row at all | The trigger never fired. Check it exists on `auth.users`. |
| Code row, `email_sent_at` null, `status_code` 502 | Trigger and webhook fine — the mail provider rejected it. `content` quotes the provider's own error. |
| Code row with `email_sent_at` set | It sent. Check spam, and confirm which address the account actually used. |

A `401` in `content` from *our* function means the `x-webhook-secret` header and the
Netlify env var don't match. A `resend_status` of 401 inside the body means Resend
rejected the API key — a different failure at a different hop, so read carefully
which one it is.

Re-sending is safe. A code whose `email_sent_at` is null gets re-sent as the *same*
code; it never mints a second one. Codes cascade-delete with the user, so deleting a
test account and signing up again is a clean way to re-test.

**A live welcome-email failure is not self-healing.** Supabase does not retry the webhook, so
once the underlying cause is fixed, the pending email needs one manual re-fire.

---

## 4. Processed-order emails

`order-processed-v1.html` and `order-processed-handoff-v2.html` are read directly
by the Netlify fulfillment functions; do not paste them into Supabase, EmailJS,
or Resend. They use the existing Netlify `RESEND_API_KEY`, so there is no
additional dashboard secret to create.

For a paid shipping order, whichever required PrintNode job finishes second
(the branded packing slip or the 4×6 shipping label) atomically queues the
email. The message says the order is prepared for carrier pickup and includes
the carrier, service, tracking number, and an HTTPS tracking link when Shippo
provides one. For a paid local-handoff order, the accepted packing-slip
PrintNode job alone queues a separate confirmation saying the order was
processed and prepared for hand delivery; it contains no carrier or tracking
data. A reprint does not send a second email.

Shippo's `transaction.test` value is saved with the label. Test labels and
older labels whose mode is unknown fail closed and never email a customer,
even if the Netlify Shippo token is changed to live later. Failed Resend sends
remain in a protected outbox and the scheduled Netlify function retries them
every five minutes. Ambiguous or repeated failures stop automatically for
staff review rather than risk sending a late duplicate. The staff order screen
shows whether the relevant customer email is queued, sent, retrying, or needs
attention. The shipping `v1` and hand-delivery `v2` templates and message
renderers are intentionally immutable: do not edit an old version's HTML, text,
subject, sender, or reply-to after it has sent live mail; create a new message
version and idempotency-key version together.

### Known limits

- **Codes only work for signed-in customers.** They are bound to a `user_id`, so
  a guest checkout cannot redeem one. That is deliberate — it is what stops a
  code from being shared and reused by strangers.
- **Codes are disabled during a sitewide sale.** `isSaleActive()` in `site_1.jsx`
  blocks all discount codes while a sale runs, welcome codes included. A customer
  who confirms during a sale will hold a code they can't use until it ends — worth
  remembering when scheduling one against the 30-day expiry.
- **No stacking.** The checkout allows one discount code plus one free-shipping
  code, so a welcome code can't be combined with another discount.
